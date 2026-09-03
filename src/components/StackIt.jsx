import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ROOTS,
  SCALES,
  CHORDS,
  KEY_MODES,
  DEG,
  diatonicChords,
  identifyChord,
  noteNameToPc,
  buildNoteNames,
  tritoneOf,
} from "../theory/engine.js";
import { C } from "../ui/theme.js";
import { playMidi } from "../audio/engine.js";
import { useDroneFollow } from "../audio/useDrone.js";

/**
 * STACK IT — the Chord Builder, run backwards.
 *
 * The Builder shows you a chord and explains it. That is reading. This asks
 * you to BUILD one out of a key you can see — "stack a seventh chord on degree
 * 5" — and only then names what you made. Recall, not recognition, which is
 * where the learning actually happens.
 *
 * The second half is the same row of degrees with a slider on it: keep
 * stacking thirds — 7, 9, 11, 13 — and watch the chord swallow the scale one
 * note at a time. By the 13th every degree is lit, which is the moment a 13th
 * chord stops being an exotic shape and becomes "the key, played vertically".
 */

const BASE = 48; // C3 — low enough that a 13th chord still fits above it

/** Chord-tone numbers as thirds are stacked: 1 3 5 7 9 11 13. */
const STACK_LABELS = ["1", "3", "5", "7", "9", "11", "13"];

/** Diatonic seventh quality per degree, for both key flavours. */
const SEVENTH = {
  major: ["maj7", "min7", "min7", "maj7", "dom7", "min7", "m7b5"],
  minor: ["min7", "m7b5", "maj7", "min7", "min7", "maj7", "dom7"],
};

/** How an extended stack is named once it goes past the 7th. */
const FAMILY_SUFFIX = {
  maj7: ["", "maj7", "maj9", "maj11", "maj13"],
  min7: ["m", "m7", "m9", "m11", "m13"],
  dom7: ["", "7", "9", "11", "13"],
  m7b5: ["°", "m7♭5", "m9♭5", "m11♭5", "m13♭5"],
};

const readBest = () => {
  try { return Number(localStorage.getItem("stack.best")) || 0; } catch { return 0; }
};
const writeBest = (n) => {
  try { localStorage.setItem("stack.best", String(n)); } catch {}
};

export default function StackIt() {
  const [root, setRoot] = useState("C");
  const [keyMode, setKeyMode] = useState("major");
  const [muted, setMuted] = useState(false);
  const [tab, setTab] = useState("drill"); // drill | extend

  useDroneFollow(root);

  const rootPc = noteNameToPc(root);
  const names = useMemo(() => buildNoteNames(root), [root]);
  const scaleId = KEY_MODES[keyMode].scaleId;
  const ints = SCALES[scaleId].ints;
  const dia = useMemo(() => diatonicChords(rootPc, keyMode, root), [rootPc, keyMode, root]);

  /** Semitones above the tonic for scale index i, wrapping into higher octaves. */
  const semisAt = (i) => ints[((i % 7) + 7) % 7] + 12 * Math.floor(i / 7);
  const midiAt = (i) => BASE + rootPc + semisAt(i);
  const nameAt = (i) => names[(rootPc + semisAt(i)) % 12];

  const hear = (midis, { stagger = 0.03, dur = 1.6 } = {}) => {
    if (muted) return;
    midis.forEach((m, i) => playMidi(m, i * stagger, dur));
  };

  const shared = { root, rootPc, names, ints, dia, semisAt, midiAt, nameAt, hear, keyMode };

  return (
    <div>
      <style>{`
        .si-row{ display:flex; gap:8px; flex-wrap:wrap; }
        .si-deg{ position:relative; min-width:62px; padding:9px 8px; border-radius:4px; text-align:center;
          border:1.5px solid var(--line); background: var(--surface-lo); cursor:pointer;
          font-family: ui-monospace, monospace; transition: all .18s ease; }
        .si-deg:hover{ border-color: var(--ink); }
        .si-deg .n{ font-size:17px; font-weight:700; }
        .si-deg .nm{ font-size:11px; color: var(--muted); margin-top:2px; }
        .si-deg .rn{ font-size:9px; color: var(--muted); margin-top:2px; letter-spacing:.5px; }
        .si-deg .pick{ position:absolute; top:-7px; right:-7px; width:18px; height:18px; border-radius:999px;
          font-size:10px; font-weight:700; display:flex; align-items:center; justify-content:center; }
        .si-deg.off{ opacity:.32; }
      `}</style>

      {/* ---- key ---- */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Key</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {ROOTS.map((r) => (
              <button key={r} className={"chip" + (r === root ? " on" : "")} onClick={() => setRoot(r)}>{r}</button>
            ))}
            <span style={{ width: 10 }} />
            {Object.entries(KEY_MODES).map(([id, m]) => (
              <button key={id} className={"btn" + (keyMode === id ? " on" : "")} onClick={() => setKeyMode(id)}>{m.name}</button>
            ))}
            <button className="btn" onClick={() => setMuted((m) => !m)} aria-pressed={muted}>{muted ? "♪ sound off" : "♪ sound on"}</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button className={"btn" + (tab === "drill" ? " on" : "")} onClick={() => setTab("drill")}>Build it yourself</button>
          <button className={"btn" + (tab === "extend" ? " on" : "")} onClick={() => setTab("extend")}>Keep stacking — 9, 11, 13</button>
        </div>
      </div>

      {tab === "drill" ? <BuildDrill {...shared} /> : <KeepStacking {...shared} />}
    </div>
  );
}

/* ======================= build it yourself (#2) ======================= */

function BuildDrill({ root, rootPc, names, dia, semisAt, midiAt, nameAt, hear, keyMode }) {
  const [task, setTask] = useState(null); // { degree, size }
  const [picked, setPicked] = useState([]); // scale indices, in the order clicked
  const [result, setResult] = useState(null);
  const [score, setScore] = useState({ asked: 0, right: 0, streak: 0 });
  const [best, setBest] = useState(readBest);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { reset(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [root, keyMode]);

  const reset = () => {
    clearTimeout(timer.current);
    setTask(null);
    setPicked([]);
    setResult(null);
  };

  const ask = () => {
    clearTimeout(timer.current);
    const degree = Math.floor(Math.random() * 7);
    const size = Math.random() < 0.5 ? 3 : 4;
    setTask({ degree, size });
    setPicked([]);
    setResult(null);
    setScore((s) => ({ ...s, asked: s.asked + 1 }));
  };

  const wanted = task ? [0, 2, 4, 6].slice(0, task.size).map((k) => task.degree + k) : [];

  const judge = (chosen) => {
    // Names what they actually built, whatever it is — that is the payoff, and
    // it is only possible now the engine can go notes -> name.
    const pcs = chosen.map((i) => (rootPc + semisAt(i)) % 12);
    const bassPc = (rootPc + semisAt(Math.min(...chosen))) % 12;
    const built = identifyChord(pcs, { bassPc, key: root });
    const want = new Set(wanted.map((i) => ((i % 7) + 7) % 7));
    const got = new Set(chosen.map((i) => ((i % 7) + 7) % 7));
    const ok = want.size === got.size && [...want].every((d) => got.has(d));
    setResult({ ok, built, pcs });
    hear(chosen.map(midiAt));
    if (ok) {
      const streak = score.streak + 1;
      setScore((s) => ({ ...s, right: s.right + 1, streak: s.streak + 1 }));
      if (streak > best) { setBest(streak); writeBest(streak); }
      timer.current = setTimeout(ask, 2600);
    } else {
      setScore((s) => ({ ...s, streak: 0 }));
    }
  };

  const pick = (i) => {
    if (!task || result) return;
    if (picked.includes(i)) {
      setPicked((p) => p.filter((x) => x !== i));
      return;
    }
    hear([midiAt(i)], { dur: 0.9 });
    const next = [...picked, i];
    setPicked(next);
    if (next.length === task.size) judge(next);
  };

  const targetChord = task ? dia[task.degree] : null;
  const wantQuality = task ? (task.size === 3 ? targetChord.quality : SEVENTH[keyMode][task.degree]) : null;
  const tt = task && wantQuality ? tritoneOf(targetChord.rootPc, wantQuality) : null;

  return (
    <div style={{ marginTop: 18 }}>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>
            {task ? (
              <>
                Stack a <span style={{ color: C.sun }}>{task.size === 3 ? "triad" : "seventh chord"}</span> on degree{" "}
                <span style={{ color: C.sun, fontSize: 22 }}>{task.degree + 1}</span>
                <span style={{ color: C.muted, fontWeight: 400, fontSize: 12 }}> · pick {task.size} degrees, thirds apart</span>
              </>
            ) : (
              <span style={{ color: C.muted, fontWeight: 400, fontSize: 13 }}>
                A chord is thirds stacked out of a scale. Skip a degree, take one, skip a degree, take one.
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button className={task ? "btn" : "big"} onClick={ask}>{task ? "↻ next" : "▶ start"}</button>
            {task && <button className="btn" onClick={reset}>■ stop</button>}
            <span className="mono" style={{ fontSize: 11, color: C.muted, marginLeft: 6 }}>
              {score.right}/{score.asked} · streak {score.streak} · best {best}
            </span>
          </div>
        </div>

        {/* the seven degrees of the key */}
        <div className="si-row" style={{ marginTop: 14 }}>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => {
            // The stack can run past the 7th degree and wrap — a seventh chord
            // on degree 6 is 6-1-3-5, an octave up.
            const order = picked.map((p) => ((p % 7) + 7) % 7).indexOf(i);
            const isPicked = order >= 0;
            const shownWrong = result && !result.ok && isPicked && !wanted.map((w) => ((w % 7) + 7) % 7).includes(i);
            const shouldHave = result && !result.ok && wanted.map((w) => ((w % 7) + 7) % 7).includes(i);
            return (
              <button
                key={i}
                className="si-deg"
                onClick={() => pick(pickIndex(i, picked, task))}
                style={{
                  borderColor: shownWrong ? C.red : shouldHave ? C.green : isPicked ? C.sun : undefined,
                  background: isPicked ? "rgba(255,122,46,.14)" : undefined,
                  color: isPicked ? C.sun : undefined,
                }}
                title={`Degree ${i + 1} — ${nameAt(i)} · ${dia[i].label}`}
              >
                {isPicked && (
                  <span className="pick" style={{ background: C.sun, color: "#fff" }}>{STACK_LABELS[order] || order + 1}</span>
                )}
                <div className="n">{i + 1}</div>
                <div className="nm">{nameAt(i)}</div>
                <div className="rn">{dia[i].rn}</div>
              </button>
            );
          })}
        </div>

        {/* what you built */}
        <div className="mono" style={{ marginTop: 14, fontSize: 13, lineHeight: 1.7, minHeight: 44 }}>
          {!result ? (
            picked.length ? (
              <span style={{ color: C.muted }}>{picked.map((i) => nameAt(i)).join(" · ")} …</span>
            ) : (
              <span style={{ color: C.muted }}>Tap the degrees. Every third you skip is what makes it a chord and not a scale run.</span>
            )
          ) : result.ok ? (
            <span>
              <span style={{ color: C.green, fontWeight: 700 }}>✓ that's {result.built ? result.built.label : targetChord.label}</span>
              <span style={{ color: C.muted }}> — {targetChord.rn} of {root} {KEY_MODES[keyMode].name.toLowerCase()}.</span>
              {tt && (
                <span style={{ color: C.ink }}>
                  {" "}Its 3rd ({names[tt.third.pc]}) and ♭7 ({names[tt.seventh.pc]}) are a tritone apart — that pair is what makes this
                  chord want to resolve, and it is the reason degree {task.degree + 1} is the one that pulls.
                </span>
              )}
            </span>
          ) : (
            <span>
              <span style={{ color: C.red, fontWeight: 700 }}>
                {result.built ? `you built ${result.built.label}` : "that isn't a stack of thirds"}
              </span>
              <span style={{ color: C.muted }}>
                {" "}— degree {task.degree + 1} wants {wanted.map((w) => ((w % 7) + 7) % 7 + 1).join(" · ")} ({wanted.map((w) => nameAt(w)).join(" · ")}), which is{" "}
                {targetChord.rootName}{CHORDS[wantQuality].sym}.
              </span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Picking degree `i` after some notes are down: keep the stack ascending, so
// clicking 2 after 6 means the 2 an octave up, not below the root.
function pickIndex(i, picked, task) {
  if (!task) return i;
  const low = task.degree;
  return i >= low ? i : i + 7;
}

/* ======================= keep stacking (#6) ======================= */

function KeepStacking({ root, rootPc, names, dia, semisAt, midiAt, nameAt, hear, keyMode }) {
  const [degree, setDegree] = useState(0);
  const [size, setSize] = useState(3); // 3..7 notes = triad .. 13th

  const stack = Array.from({ length: size }, (_, k) => degree + k * 2);
  const stackPcs = stack.map((i) => (rootPc + semisAt(i)) % 12);
  const family = SEVENTH[keyMode][degree];
  const suffix = FAMILY_SUFFIX[family] ? FAMILY_SUFFIX[family][Math.max(0, size - 3)] : "";
  const label = dia[degree].rootName + suffix;
  const covered = new Set(stackPcs);
  const swallowed = [0, 1, 2, 3, 4, 5, 6].filter((i) => covered.has((rootPc + semisAt(i)) % 12)).length;

  return (
    <div style={{ marginTop: 18 }}>
      <div className="card">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span className="eyebrow" style={{ margin: 0 }}>Stack on degree</span>
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <button key={i} className={"chip" + (degree === i ? " on" : "")} onClick={() => setDegree(i)}>{i + 1}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <label className="mono" style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 8 }}>
              add thirds
              <input type="range" min="3" max="7" step="1" value={size} onChange={(e) => setSize(Number(e.target.value))} style={{ width: 130 }} />
            </label>
            <button className="btn" onClick={() => hear(stack.map(midiAt), { stagger: 0.05, dur: 2.4 })}>▶ hear it</button>
          </div>
        </div>

        {/* the whole scale — chord tones lit, everything else fading out */}
        <div className="si-row" style={{ marginTop: 14 }}>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => {
            const pc = (rootPc + semisAt(i)) % 12;
            const inChord = covered.has(pc);
            const which = stack.findIndex((s) => ((s % 7) + 7) % 7 === i);
            return (
              <div
                key={i}
                className={"si-deg" + (inChord ? "" : " off")}
                style={{
                  cursor: "default",
                  borderColor: inChord ? C.sun : undefined,
                  background: inChord ? "rgba(255,122,46,.14)" : undefined,
                  color: inChord ? C.sun : undefined,
                }}
              >
                {inChord && which >= 0 && (
                  <span className="pick" style={{ background: C.sun, color: "#fff" }}>{STACK_LABELS[which]}</span>
                )}
                <div className="n">{i + 1}</div>
                <div className="nm">{nameAt(i)}</div>
                <div className="rn">{DEG[semisAt(i)]}</div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 14, alignItems: "center" }}>
          <div className="mono" style={{ fontSize: 26, fontWeight: 700, color: C.sun }}>{label}</div>
          <div className="mono" style={{ fontSize: 12, color: C.muted }}>
            {stack.map((i, k) => `${STACK_LABELS[k]}=${nameAt(i)}`).join("  ")}
          </div>
        </div>

        <div className="mono" style={{ fontSize: 12.5, color: C.ink, marginTop: 10, lineHeight: 1.7 }}>
          {size <= 3
            ? "A triad: three notes, two thirds. Everything else in the key is still outside it."
            : size === 4
            ? "Add another third and you have a seventh chord — the first one with real colour."
            : size === 5
            ? "The 9th is the 2nd degree, an octave up. It was never exotic; it was always in the key."
            : size === 6
            ? "The 11th is the 4th. Over a major 3rd it grinds — which is exactly why 13th chords drop it."
            : "Seven notes stacked in thirds. The chord now contains the ENTIRE scale — a 13th chord is not a shape, it is the key played vertically."}
          {" "}
          <span style={{ color: C.muted }}>({swallowed} of 7 degrees swallowed)</span>
        </div>
      </div>
    </div>
  );
}
