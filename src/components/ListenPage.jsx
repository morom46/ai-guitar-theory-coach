import React, { useEffect, useMemo, useRef, useState } from "react";
import { ROOTS, DEG, SCALES, buildNoteNames, noteNameToPc, midiToFreq as engineMidiToFreq } from "../theory/engine.js";
import { C, keyToneStyle } from "../ui/theme.js";
import Neck from "./Neck.jsx";
import {
  useMicPitch,
  MIC_STATES,
  midiToFreq,
  centsBetween,
  STRING_MIDI,
  STRING_LABELS,
  A4_DEFAULT,
} from "../audio/pitch.js";
import { tone } from "../audio/engine.js";
import { pickWeighted, record } from "../data/progress.js";
import WeakSpots from "./WeakSpots.jsx";

/**
 * LISTEN — the page where the app hears you instead of the other way round.
 *
 * Two tools sharing one microphone:
 *
 *   TUNER      chromatic or string-by-string, needle in cents. The thing you
 *              reach for before every session and previously had to leave the
 *              app to find.
 *
 *   FIND IT    the app names a scale degree; you play it; the mic confirms.
 *              This is the drill the fretboard pages could never be: they
 *              showed you where a note was and trusted you. This one checks,
 *              and it refuses to move on until you actually find the note.
 *
 * Matching is by pitch class, not by exact pitch, so any octave of the right
 * note counts — otherwise one octave misread would fail a correct answer.
 * Pick a single string when you want position discipline instead: then the
 * note also has to be reachable on that string inside 24 frets.
 */

const FRETS = 24;

/**
 * STRING_MIDI is indexed high-E-first (index 0 = string 1), matching the
 * theory engine's OPEN_MIDI. Guitarists count the other way, so keep the
 * conversion in one place instead of sprinkling `6 - i` around.
 */
const stringNo = (i) => i + 1; // index -> printed string number (1 = high E)
const STRING_ORDER = [5, 4, 3, 2, 1, 0]; // display order: low E first, like the neck

const BEST_KEY = "find.best";
const A4_KEY = "tuner.a4";
const IN_TUNE_CENTS = 5;

const readBest = () => {
  try {
    return Number(localStorage.getItem(BEST_KEY) || 0);
  } catch {
    return 0;
  }
};
const writeBest = (n) => {
  try {
    localStorage.setItem(BEST_KEY, String(n));
  } catch {
    /* ignore */
  }
};
const readA4 = () => {
  try {
    const n = Number(localStorage.getItem(A4_KEY));
    return n >= 415 && n <= 450 ? n : A4_DEFAULT;
  } catch {
    return A4_DEFAULT;
  }
};

/* ==================== the needle ==================== */

function Needle({ cents, active, inTune }) {
  // −50..+50 cents across a 120° sweep.
  const clamped = Math.max(-50, Math.min(50, cents ?? 0));
  const angle = (clamped / 50) * 60;
  const col = !active ? C.muted : inTune ? C.green : Math.abs(clamped) < 20 ? C.sun : C.red;
  return (
    <svg viewBox="0 0 240 132" style={{ width: "100%", maxWidth: 340 }} role="img" aria-label="Tuning needle">
      {/* arc */}
      <path d="M 24 120 A 96 96 0 0 1 216 120" fill="none" stroke={C.line} strokeWidth="1.5" />
      {/* ticks every 10 cents */}
      {Array.from({ length: 11 }, (_, i) => {
        const c = -50 + i * 10;
        const a = ((c / 50) * 60 - 90) * (Math.PI / 180);
        const isZero = c === 0;
        const r0 = isZero ? 78 : 86;
        const x0 = 120 + Math.cos(a) * r0;
        const y0 = 120 + Math.sin(a) * r0;
        const x1 = 120 + Math.cos(a) * 96;
        const y1 = 120 + Math.sin(a) * 96;
        return (
          <g key={c}>
            <line
              x1={x0}
              y1={y0}
              x2={x1}
              y2={y1}
              stroke={isZero ? C.green : C.line}
              strokeWidth={isZero ? 2 : 1}
              opacity={isZero ? 1 : 0.7}
            />
            {(c === -50 || c === 0 || c === 50) && (
              <text
                x={120 + Math.cos(a) * 68}
                y={120 + Math.sin(a) * 68 + 4}
                textAnchor="middle"
                fontSize="9"
                fill={C.muted}
                style={{ fontFamily: "ui-monospace, monospace" }}
              >
                {c > 0 ? `+${c}` : c}
              </text>
            )}
          </g>
        );
      })}
      {/* needle */}
      <g transform={`rotate(${angle} 120 120)`} style={{ transition: "transform 0.09s linear" }}>
        <line x1="120" y1="120" x2="120" y2="30" stroke={col} strokeWidth="3" strokeLinecap="round" />
      </g>
      <circle cx="120" cy="120" r="5" fill={col} />
    </svg>
  );
}

/* ==================== mic gate ==================== */

function MicGate({ mic, children, what }) {
  if (mic.state === MIC_STATES.ready) return children;

  const msg =
    mic.state === MIC_STATES.denied
      ? "Microphone blocked. Allow it in your browser's site settings (the icon in the address bar), then try again."
      : mic.state === MIC_STATES.unsupported
      ? "This browser can't open a microphone. Chrome, Edge or Safari on a secure (https) page will work."
      : mic.state === MIC_STATES.error
      ? `Couldn't open the microphone${mic.error ? ` — ${mic.error}` : ""}.`
      : null;

  return (
    <div className="card" style={{ marginTop: 16, textAlign: "center", padding: "28px 20px" }}>
      <div style={{ fontSize: 30, marginBottom: 8 }} aria-hidden="true">
        🎤
      </div>
      <div className="mono" style={{ fontSize: 14, marginBottom: 4 }}>
        {what}
      </div>
      <div className="mono" style={{ fontSize: 12, color: C.muted, maxWidth: 460, margin: "0 auto 16px" }}>
        {msg || "Nothing is recorded or sent anywhere — the audio is analysed in this tab and thrown away."}
      </div>
      <button className="big" onClick={mic.start} disabled={mic.state === MIC_STATES.requesting}>
        {mic.state === MIC_STATES.requesting ? "waiting for permission…" : "🎤 Turn on the microphone"}
      </button>
      {mic.state === MIC_STATES.denied && (
        <div className="mono" style={{ fontSize: 11, color: C.muted, marginTop: 12 }}>
          On a phone, check that the browser itself has microphone access in your system settings too.
        </div>
      )}
    </div>
  );
}

/* ==================== tuner ==================== */

function TunerPanel({ mic, a4, setA4 }) {
  const [byString, setByString] = useState(false);
  const [held, setHeld] = useState(false);
  const holdRef = useRef(null);

  const note = mic.note;

  // Which string we're tuning: the nearest one in by-string mode.
  const target = useMemo(() => {
    if (!note) return null;
    if (!byString) return { midi: note.midi, freq: note.targetFreq };
    let best = STRING_MIDI[0];
    let bestD = Infinity;
    STRING_MIDI.forEach((m) => {
      const d = Math.abs(m - note.midi);
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    });
    return { midi: best, freq: midiToFreq(best, a4) };
  }, [note, byString, a4]);

  const cents = note && target ? Math.round(centsBetween(note.freq, target.freq)) : null;
  const inTune = cents != null && Math.abs(cents) <= IN_TUNE_CENTS;

  // "In tune" only latches after it's been true for a moment — otherwise the
  // needle flickers green as it swings past centre.
  useEffect(() => {
    if (inTune) {
      if (!holdRef.current) holdRef.current = setTimeout(() => setHeld(true), 280);
    } else {
      if (holdRef.current) clearTimeout(holdRef.current);
      holdRef.current = null;
      setHeld(false);
    }
    return () => {
      if (holdRef.current) clearTimeout(holdRef.current);
      holdRef.current = null;
    };
  }, [inTune, note?.midi]);

  const label = note ? `${note.name}${byString ? "" : note.octave}` : "—";
  const off = cents == null ? null : cents > 0 ? `+${cents}` : `${cents}`;
  const tooFar = cents != null && Math.abs(cents) > 45;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 14 }}>
        <button className={"btn" + (!byString ? " on" : "")} onClick={() => setByString(false)}>
          Chromatic
        </button>
        <button className={"btn" + (byString ? " on" : "")} onClick={() => setByString(true)}>
          By string
        </button>
        <div style={{ flex: 1 }} />
        <label className="mono" style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 6 }}>
          A4
          <input
            className="inp"
            type="number"
            min="415"
            max="450"
            step="1"
            value={a4}
            onChange={(e) => {
              const n = Number(e.target.value);
              setA4(Number.isFinite(n) && n >= 415 && n <= 450 ? n : A4_DEFAULT);
            }}
            style={{ width: 72 }}
            aria-label="Reference pitch for A4"
          />
          Hz
        </label>
      </div>

      <div
        className="card"
        style={{
          marginTop: 14,
          display: "flex",
          gap: 24,
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          borderColor: held ? C.green : C.ink,
          transition: "border-color .2s",
        }}
      >
        <div style={{ textAlign: "center", minWidth: 150 }}>
          <div
            className="mono"
            style={{
              fontSize: 64,
              fontWeight: 700,
              lineHeight: 1,
              color: !note ? C.muted : held ? C.green : C.ink,
              transition: "color .15s",
            }}
          >
            {label}
          </div>
          <div className="mono" style={{ fontSize: 13, color: C.muted, marginTop: 6, minHeight: 18 }}>
            {note ? `${note.freq.toFixed(1)} Hz` : "play a string"}
          </div>
          <div
            className="mono"
            style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: held ? C.green : cents == null ? C.muted : Math.abs(cents) < 20 ? C.sun : C.red }}
          >
            {off == null ? "—" : `${off}¢`}
          </div>
        </div>

        <div style={{ flex: "1 1 260px", minWidth: 240, maxWidth: 380, margin: "0 auto" }}>
          <Needle cents={cents} active={!!note} inTune={held} />
          <div className="mono" style={{ textAlign: "center", fontSize: 12, color: held ? C.green : C.muted, minHeight: 18 }}>
            {!note
              ? "listening…"
              : held
              ? "in tune ✓"
              : tooFar
              ? cents > 0
                ? "way sharp — loosen"
                : "way flat — tighten"
              : cents > 0
              ? "sharp — loosen a touch"
              : "flat — tighten a touch"}
          </div>
        </div>
      </div>

      {/* the six strings, low to high — the same order as every neck in the app */}
      <div className="tn-strings">
        {STRING_ORDER.map((i) => {
          const m = STRING_MIDI[i];
          const isTarget = target && target.midi === m;
          const done = isTarget && held;
          const hz = midiToFreq(m, a4);
          return (
            <button
              key={i}
              className={"tn-string" + (isTarget ? " on" : "") + (done ? " ok" : "")}
              onClick={() => tone(hz, 0, 1.4)}
              title={`String ${stringNo(i)} — ${STRING_LABELS[i]}${Math.floor(m / 12) - 1} · ${hz.toFixed(2)} Hz — tap to hear it`}
            >
              <span className="n">{STRING_LABELS[i]}</span>
              <span className="s mono">{stringNo(i)}</span>
              <span className="f mono">{hz.toFixed(1)}</span>
            </button>
          );
        })}
      </div>

      <div className="mono" style={{ fontSize: 11.5, color: C.muted, marginTop: 10, lineHeight: 1.6 }}>
        Tap a string above to hear its reference pitch. Pick near the bridge and let one string ring on its own —
        the detector wants a single note, not a chord. Standard tuning is shown; the needle is chromatic, so
        drop-D and Eb work fine, just watch the note name rather than the string slot.
      </div>
    </div>
  );
}

/* ==================== find-the-note drill ==================== */

const PROMPT_MODES = [
  { id: "both", label: "number + note", hint: "easiest — you're told both" },
  { id: "number", label: "number only", hint: "translate the number yourself" },
  { id: "note", label: "note only", hint: "find the letter on the neck" },
];

function FindPanel({ mic, a4 }) {
  const [root, setRoot] = useState("A");
  const [scaleId, setScaleId] = useState("minorPent");
  const [promptMode, setPromptMode] = useState("both");
  const [stringLimit, setStringLimit] = useState(-1); // -1 = any string
  const [target, setTarget] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | asking | right
  const [wrong, setWrong] = useState(null);
  const [score, setScore] = useState({ right: 0, asked: 0, misses: 0, streak: 0 });
  const [best, setBest] = useState(readBest);
  const [reveal, setReveal] = useState(false);
  const [lastMs, setLastMs] = useState(null);
  const askedAt = useRef(0);
  const advanceRef = useRef(null);
  // The note that answered the LAST question is probably still ringing when the
  // next one appears; ignore it until it dies or changes, or a correct answer
  // would instantly be marked wrong for the following question.
  const ringingRef = useRef(null);
  const lastWrongRef = useRef(null);

  const names = useMemo(() => buildNoteNames(root), [root]);
  const rootPc = noteNameToPc(root);
  const scale = SCALES[scaleId];
  const degrees = scale.ints;

  const targetPc = target == null ? null : (rootPc + target.semis) % 12;

  const nextQuestion = () => {
    // Weighted by the degrees you keep failing to find, not uniform.
    const semis = pickWeighted(`find.${scaleId}`, degrees, { avoid: target ? target.semis : null });
    setTarget({ semis });
    setStatus("asking");
    setWrong(null);
    setReveal(false);
    setLastMs(null);
    lastWrongRef.current = null;
    askedAt.current = typeof performance !== "undefined" ? performance.now() : Date.now();
    setScore((s) => ({ ...s, asked: s.asked + 1 }));
  };

  const stop = () => {
    clearTimeout(advanceRef.current);
    setTarget(null);
    setStatus("idle");
    setWrong(null);
    setReveal(false);
    ringingRef.current = null;
    lastWrongRef.current = null;
  };

  // Reset the drill when the key, scale or constraint changes under it.
  useEffect(() => {
    if (status !== "idle") stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, scaleId, stringLimit]);

  useEffect(() => () => clearTimeout(advanceRef.current), []);

  /* ---- the judge ---- */
  const note = mic.note;
  useEffect(() => {
    if (status !== "asking") return;

    // Silence re-arms: whatever was ringing has died away.
    if (!note) {
      ringingRef.current = null;
      return;
    }
    if (targetPc == null) return;
    // Still hearing the note that answered the previous question.
    if (ringingRef.current != null && note.midi === ringingRef.current) return;

    const okPc = note.pc === targetPc;
    // With a string constraint, the note also has to be reachable on that
    // string inside 24 frets — which is what makes it a position exercise.
    const okString =
      stringLimit < 0 ||
      (() => {
        const fret = note.midi - STRING_MIDI[stringLimit];
        return fret >= 0 && fret <= FRETS;
      })();

    if (okPc && okString) {
      const ms = (typeof performance !== "undefined" ? performance.now() : Date.now()) - askedAt.current;
      ringingRef.current = note.midi;
      record(`find.${scaleId}`, target.semis, true);
      setLastMs(Math.round(ms));
      setStatus("right");
      setWrong(null);
      // Compute the streak outside the updater: React re-runs updaters in dev,
      // and a localStorage write in there would fire twice.
      const streak = score.streak + 1;
      setScore((s) => ({ ...s, right: s.right + 1, streak: s.streak + 1 }));
      if (streak > best) {
        setBest(streak);
        writeBest(streak);
      }
      clearTimeout(advanceRef.current);
      advanceRef.current = setTimeout(nextQuestion, 1100);
    } else if (okPc && !okString) {
      setWrong({ ...note, reason: "string" });
    } else {
      // One miss per distinct wrong note; the question stays open until you
      // actually find it — that's the point of the drill.
      if (lastWrongRef.current !== note.midi) {
        lastWrongRef.current = note.midi;
        record(`find.${scaleId}`, target.semis, false);
        setScore((s) => ({ ...s, misses: s.misses + 1, streak: 0 }));
      }
      setWrong({ ...note, reason: "note" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.midi, status, targetPc, stringLimit, best, score.streak]);

  const targetLabel = target ? DEG[target.semis] : null;
  const targetName = targetPc == null ? null : names[targetPc];
  const wrongSemis = wrong ? (wrong.pc - rootPc + 12) % 12 : null;

  const prompt = () => {
    if (!target) return null;
    if (promptMode === "number") return targetLabel;
    if (promptMode === "note") return targetName;
    return `${targetLabel} — ${targetName}`;
  };

  const showLocations = status === "right" || reveal;

  return (
    <div>
      {/* setup */}
      <div className="card" style={{ marginTop: 14 }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Key</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {ROOTS.map((r) => (
                <button key={r} className={"chip" + (root === r ? " on" : "")} onClick={() => setRoot(r)} style={{ padding: "5px 7px" }}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Scale</div>
            <select className="inp" value={scaleId} onChange={(e) => setScaleId(e.target.value)} aria-label="Scale">
              {Object.entries(SCALES).map(([id, s]) => (
                <option key={id} value={id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Prompt</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {PROMPT_MODES.map((m) => (
                <button
                  key={m.id}
                  className={"btn" + (promptMode === m.id ? " on" : "")}
                  onClick={() => setPromptMode(m.id)}
                  title={m.hint}
                  style={{ padding: "5px 8px" }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>On string</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <button className={"chip" + (stringLimit < 0 ? " on" : "")} onClick={() => setStringLimit(-1)} style={{ padding: "5px 7px" }}>
                any
              </button>
              {STRING_ORDER.map((i) => (
                <button
                  key={i}
                  className={"chip" + (stringLimit === i ? " on" : "")}
                  onClick={() => setStringLimit(i)}
                  title={`String ${stringNo(i)} — ${STRING_LABELS[i]}${Math.floor(STRING_MIDI[i] / 12) - 1}`}
                  style={{ padding: "5px 7px" }}
                >
                  {stringNo(i)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* transport + score */}
      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {status === "idle" ? (
          <button className="big" onClick={nextQuestion}>▶ Start the drill</button>
        ) : (
          <>
            <button className="btn" onClick={nextQuestion} title="Skip to another degree">↷ Skip</button>
            <button className="btn" onClick={() => setReveal(true)} disabled={showLocations} title="Light up every place this note lives">
              ◉ Show me
            </button>
            <button className="btn" onClick={stop}>■ Stop</button>
          </>
        )}
        <div style={{ flex: 1 }} />
        <div className="mono" style={{ fontSize: 12, color: C.muted }}>
          found <span style={{ color: C.ink, fontWeight: 700 }}>{score.right}</span>
          <span style={{ margin: "0 8px", opacity: 0.4 }}>·</span>
          wrong notes <span style={{ color: C.red, fontWeight: 700 }}>{score.misses}</span>
          <span style={{ margin: "0 8px", opacity: 0.4 }}>·</span>
          streak <span style={{ color: C.sun, fontWeight: 700 }}>{score.streak}</span>
          <span style={{ margin: "0 8px", opacity: 0.4 }}>·</span>
          best <span style={{ color: C.cyan, fontWeight: 700 }}>{best}</span>
        </div>
      </div>

      {/* the practice log — which degrees you cannot find, per scale */}
      <div className="card" style={{ marginTop: 12 }}>
        <WeakSpots
          drill={`find.${scaleId}`}
          tick={score.asked + score.misses}
          title={`Degrees of ${scale.name} you keep hunting for`}
          label={(k) => DEG[Number(k)]}
        />
      </div>

      {/* the prompt */}
      <div
        className="card"
        style={{
          marginTop: 14,
          textAlign: "center",
          padding: "22px 16px",
          borderColor: status === "right" ? C.green : wrong ? C.red : C.ink,
          background: status === "right" ? "rgba(63,182,139,.12)" : wrong ? "rgba(224,83,63,.08)" : "var(--surface-lo)",
          transition: "border-color .2s, background .2s",
        }}
      >
        {status === "idle" ? (
          <div className="mono" style={{ fontSize: 14, color: C.muted }}>
            Press start. The app names a degree of {root} {scale.name} — play it anywhere on the neck and it will hear you.
          </div>
        ) : (
          <>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              {status === "right" ? "found it" : `play this in ${root} ${scale.name}`}
            </div>
            <div className="mono" style={{ fontSize: 44, fontWeight: 700, lineHeight: 1.1, color: status === "right" ? C.green : C.sun }}>
              {prompt()}
            </div>
            {stringLimit >= 0 && (
              <div className="mono" style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
                on string {stringNo(stringLimit)} ({STRING_LABELS[stringLimit]})
              </div>
            )}
            <div className="mono" style={{ fontSize: 13, marginTop: 12, minHeight: 20, color: status === "right" ? C.green : wrong ? C.red : C.muted }}>
              {status === "right"
                ? `Yes — ${targetName}, the ${targetLabel}${lastMs != null ? ` · ${(lastMs / 1000).toFixed(1)}s` : ""}`
                : wrong
                ? wrong.reason === "string"
                  ? `Right note (${wrong.name}) — but that's not string ${stringNo(stringLimit)}. Same note, different string.`
                  : `That's ${wrong.name} — the ${DEG[wrongSemis]}. Try again.`
                : mic.note
                ? "listening…"
                : "play a note"}
            </div>
          </>
        )}
      </div>

      {/* the neck */}
      <div style={{ marginTop: 14 }}>
        <Neck
          root={root}
          frets={FRETS}
          size="md"
          boxes={[]}
          onTap={(midi) => tone(engineMidiToFreq(midi), 0, 1.1)}
          resolve={(pc, semis, { s, f, names: nm }) => {
            const inScale = degrees.includes(semis);
            const isTarget = targetPc != null && pc === targetPc;
            const dimmedString = stringLimit >= 0 && s !== stringLimit;

            if (isTarget && showLocations) {
              const allowed = stringLimit < 0 || s === stringLimit;
              return {
                label: DEG[semis],
                bg: allowed ? C.green : "transparent",
                br: C.green,
                tx: allowed ? "#04220F" : C.green,
                root: true,
                dashed: !allowed,
                boxShadow: allowed ? "0 0 0 4px rgba(63,182,139,.28)" : "none",
                title: `${nm[pc]} · ${DEG[semis]}`,
              };
            }
            if (wrong && pc === wrong.pc && status === "asking") {
              return {
                label: DEG[semis],
                bg: "rgba(224,83,63,.18)",
                br: C.red,
                tx: C.red,
                opacity: dimmedString ? 0.4 : 1,
                title: `${nm[pc]} — what you just played`,
              };
            }
            if (!inScale) return null;
            const st = keyToneStyle(semis);
            return {
              label: DEG[semis],
              ...st,
              root: semis === 0,
              opacity: dimmedString ? 0.28 : status === "asking" ? 0.85 : 1,
              title: `${nm[pc]} · ${DEG[semis]}`,
            };
          }}
        />
      </div>

      <div className="card" style={{ marginTop: 14, background: "rgba(62,155,214,.10)" }}>
        <div className="eyebrow" style={{ marginBottom: 8, color: C.blue }}>The "why"</div>
        <div className="mono" style={{ fontSize: 13, lineHeight: 1.65 }}>
          Every other page in this app shows you a note and trusts you to play it. This one closes the loop: the
          number has to become a sound your hands can find, with no diagram to read off. Start with{" "}
          <b>number + note</b> on one string, then drop to <b>number only</b> across the whole neck — that's the
          jump from knowing the theory to speaking it.
        </div>
      </div>
    </div>
  );
}

/* ==================== page ==================== */

export default function ListenPage() {
  const [tab, setTab] = useState("tuner");
  const [a4, setA4] = useState(readA4);

  useEffect(() => {
    try {
      localStorage.setItem(A4_KEY, String(a4));
    } catch {
      /* ignore */
    }
  }, [a4]);

  const mic = useMicPitch({ a4 });

  return (
    <div className="page">
      <div className="eyebrow">Guitar Theory Coach · Listen</div>
      <h1 className="page-title">THE APP LISTENS BACK</h1>
      <p className="page-sub">
        One microphone, two jobs: get in tune, then prove you can find a note by its number.
      </p>

      <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button className={"btn" + (tab === "tuner" ? " on" : "")} onClick={() => setTab("tuner")}>
          🎯 Tuner
        </button>
        <button className={"btn" + (tab === "find" ? " on" : "")} onClick={() => setTab("find")}>
          ◉ Find the note
        </button>
        <div style={{ flex: 1 }} />
        {mic.state === MIC_STATES.ready && (
          <>
            <div className="tn-level" title="Input level" aria-hidden="true">
              <span style={{ width: `${Math.min(100, mic.level * 400)}%` }} />
            </div>
            <button className="btn" onClick={mic.stop} title="Release the microphone">
              ● mic on
            </button>
          </>
        )}
      </div>

      <MicGate mic={mic} what={tab === "tuner" ? "The tuner needs to hear your guitar." : "The drill needs to hear your guitar."}>
        {tab === "tuner" ? <TunerPanel mic={mic} a4={a4} setA4={setA4} /> : <FindPanel mic={mic} a4={a4} />}
      </MicGate>
    </div>
  );
}
