import React, { useEffect, useRef, useState } from "react";
import { INTERVALS, DEG, SCALES, midiToFreq } from "../theory/engine.js";
import { C } from "../ui/theme.js";
import { pickWeighted, record } from "../data/progress.js";
import WeakSpots from "./WeakSpots.jsx";
import { tone as audioTone } from "../audio/engine.js";
import { useMicPitch, MIC_STATES } from "../audio/pitch.js";

/**
 * EAR TRAINER — Feature 02 of "Guitar Theory Coach".
 * Same theory engine, now pointed at the ear instead of the eye.
 *
 * Two drills:
 *   intervals — hear root -> note, name the interval.
 *   degrees   — hear the key's tonic -> a note, name its number (Nashville).
 * The whole point: train the SOUND of a distance, not its shape.
 *
 * Two ways to answer:
 *   TAP  — pick the name from the grid. Tests recognition.
 *   PLAY — play the note back on the guitar and the microphone checks it
 *          (see src/audio/pitch.js). Tests the thing that actually matters:
 *          whether hearing an interval tells your hands where to go.
 */

const MAJOR = SCALES.major.ints;                 // [0,2,4,5,7,9,11]
const DEGREE_LABELS = MAJOR.map((iv) => DEG[iv]); // ["1","2","3","4","5","6","7"]

// localStorage helpers that never throw (some sandboxes block storage).
const INTERVAL_ITEMS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const DEGREE_ITEMS = [0, 1, 2, 3, 4, 5, 6];

const readBest = () => {
  try { return Number(localStorage.getItem("et.best") || 0); } catch { return 0; }
};
const writeBest = (n) => {
  try { localStorage.setItem("et.best", String(n)); } catch { /* ignore */ }
};

export default function EarTrainer() {
  const [drill, setDrill] = useState("intervals"); // "intervals" | "degrees"
  const [challenge, setChallenge] = useState(null); // current question
  const [picked, setPicked] = useState(null);       // the answer the user chose
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0, streak: 0 });
  const [best, setBest] = useState(readBest);
  const [answerMode, setAnswerMode] = useState("tap"); // "tap" | "play"

  // The mic is opened on demand and released the moment you go back to
  // tapping — `active` only gates the analysis, it does not free the device,
  // and a recording indicator left on after you've stopped using it is rude.
  const mic = useMicPitch({ active: answerMode === "play" });
  // The prompt notes come out of the speakers, so judging stays disarmed until
  // they have finished. A timer arms it rather than waiting for the detected
  // pitch to change: a note you are already holding would otherwise never be
  // judged, because "same reading as before" produces no state change at all.
  const [armed, setArmed] = useState(false);
  const armTimer = useRef(null);
  const heardRef = useRef(null);

  const armAfterPrompt = () => {
    setArmed(false);
    if (armTimer.current) clearTimeout(armTimer.current);
    armTimer.current = setTimeout(() => setArmed(true), 1900);
  };
  const promptTimer = useRef(null);
  useEffect(
    () => () => {
      clearTimeout(armTimer.current);
      clearTimeout(promptTimer.current);
    },
    []
  );

  // Pluck a single note at `when` seconds from now (shared app voice).
  const tone = (freq, when = 0, dur = 0.85) => audioTone(freq, when, dur);

  const playChallenge = (ch = challenge) => {
    if (!ch) return;
    if (ch.type === "intervals") {
      tone(midiToFreq(ch.rootMidi), 0);
      tone(midiToFreq(ch.rootMidi + ch.semis), 0.62);
    } else {
      tone(midiToFreq(ch.tonicMidi), 0); // establish the key
      tone(midiToFreq(ch.tonicMidi + MAJOR[ch.degIndex]), 0.62);
    }
  };

  const next = () => {
    const rootMidi = 55 + Math.floor(Math.random() * 8); // G3..D4
    // Weighted by what you keep missing rather than uniform: a drill that asks
    // for a minor 6th as often as a perfect 5th spends most of its time on the
    // things you can already do.
    const ch =
      drill === "intervals"
        ? {
            type: "intervals",
            rootMidi,
            semis: pickWeighted("ear.intervals", INTERVAL_ITEMS, { avoid: challenge?.semis }),
          }
        : {
            type: "degrees",
            tonicMidi: 60,
            degIndex: pickWeighted("ear.degrees", DEGREE_ITEMS, { avoid: challenge?.degIndex }),
          };
    setChallenge(ch);
    setPicked(null);
    setRevealed(false);
    heardRef.current = null;
    armAfterPrompt();
    promptTimer.current = setTimeout(() => playChallenge(ch), 60);
  };

  const [playedNote, setPlayedNote] = useState(null);

  const answer = (val, viaNote = null) => {
    if (revealed || !challenge) return;
    const correctVal = challenge.type === "intervals" ? challenge.semis : challenge.degIndex;
    const ok = val === correctVal;
    setPicked(val);
    setPlayedNote(viaNote);
    setRevealed(true);
    record(challenge.type === "intervals" ? "ear.intervals" : "ear.degrees", correctVal, ok);
    const newStreak = ok ? score.streak + 1 : 0;
    setScore({ correct: score.correct + (ok ? 1 : 0), total: score.total + 1, streak: newStreak });
    if (newStreak > best) { setBest(newStreak); writeBest(newStreak); }
  };

  const switchDrill = (d) => {
    setDrill(d);
    setChallenge(null);
    setPicked(null);
    setRevealed(false);
    heardRef.current = null;
    setArmed(false);
    if (armTimer.current) clearTimeout(armTimer.current);
  };

  /* ---- play-back answers: the mic decides ----
     Matching is by pitch class, so you can answer in any octave — the point is
     naming the interval, not landing on the exact string the app chose. */
  const note = mic.note;
  useEffect(() => {
    if (answerMode !== "play" || revealed || !challenge || !armed || !note) return;
    if (heardRef.current === note.midi) return; // same note still ringing
    heardRef.current = note.midi;

    const targetMidi =
      challenge.type === "intervals"
        ? challenge.rootMidi + challenge.semis
        : challenge.tonicMidi + MAJOR[challenge.degIndex];
    const playedSemis =
      challenge.type === "intervals"
        ? ((note.pc - challenge.rootMidi % 12) + 12) % 12
        : null;

    if (note.pc === ((targetMidi % 12) + 12) % 12) {
      answer(challenge.type === "intervals" ? challenge.semis : challenge.degIndex, note);
    } else if (challenge.type === "intervals") {
      // Their answer maps to whatever interval they actually played.
      answer(playedSemis === 0 ? 12 : playedSemis, note);
    } else {
      const idx = MAJOR.indexOf(((note.pc - (challenge.tonicMidi % 12)) + 12) % 12);
      answer(idx >= 0 ? idx : -1, note);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.midi, armed, answerMode, revealed, challenge]);

  const correctVal = challenge ? (challenge.type === "intervals" ? challenge.semis : challenge.degIndex) : null;
  const accuracy = score.total ? Math.round((score.correct / score.total) * 100) : 0;

  // build the answer options for the active drill
  const options =
    drill === "intervals"
      ? Array.from({ length: 12 }, (_, i) => i + 1).map((semis) => ({ val: semis, label: INTERVALS[semis].ab, sub: INTERVALS[semis].name }))
      : DEGREE_LABELS.map((lab, i) => ({ val: i, label: lab, sub: INTERVALS[MAJOR[i]].name }));

  const feedback = (() => {
    if (!challenge) return "Press play to hear the first one.";
    if (!revealed)
      return answerMode === "play"
        ? "Listen, then play that note on the guitar. Replay as many times as you need."
        : "Listen, then choose. Use replay as many times as you need.";
    const isInt = challenge.type === "intervals";
    const name = isInt ? `${INTERVALS[challenge.semis].name} (${INTERVALS[challenge.semis].ab})` : `degree ${DEGREE_LABELS[challenge.degIndex]}`;
    const right = picked === correctVal;
    return right ? `Correct — that was the ${name}.` : `Not quite — that was the ${name}.`;
  })();

  return (
    <div className="page">
      <div className="eyebrow">Guitar Theory Coach · Practice</div>
      <h1 className="page-title">THE EAR TRAINER</h1>
      <p className="page-sub">Train the sound of a distance, not its shape. Music is the language — now hear it.</p>

      {/* drill selector */}
      <div style={{ marginTop: 18 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Drill</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className={"btn" + (drill === "intervals" ? " on" : "")} onClick={() => switchDrill("intervals")}>
            Intervals <span style={{ opacity: 0.6, fontSize: 10 }}>distance from a root</span>
          </button>
          <button className={"btn" + (drill === "degrees" ? " on" : "")} onClick={() => switchDrill("degrees")}>
            Scale degrees <span style={{ opacity: 0.6, fontSize: 10 }}>number in the key</span>
          </button>
        </div>
      </div>

      {/* how you answer — tap the name, or play it back on the guitar */}
      <div style={{ marginTop: 14 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Answer by</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            className={"btn" + (answerMode === "tap" ? " on" : "")}
            onClick={() => {
              setAnswerMode("tap");
              mic.stop();
            }}
            title="Choose the name from the grid"
          >
            👆 Tapping <span style={{ opacity: 0.6, fontSize: 10 }}>name it</span>
          </button>
          <button
            className={"btn" + (answerMode === "play" ? " on" : "")}
            onClick={() => {
              setAnswerMode("play");
              if (!mic.listening) mic.start();
            }}
            title="Play the note back on your guitar — the microphone checks it"
          >
            🎸 Playing it <span style={{ opacity: 0.6, fontSize: 10 }}>find it on the neck</span>
          </button>
          {answerMode === "play" && mic.state === MIC_STATES.ready && (
            <>
              <div className="tn-level" title="Input level" aria-hidden="true">
                <span style={{ width: `${Math.min(100, mic.level * 400)}%` }} />
              </div>
              <span className="mono" style={{ fontSize: 11, color: C.green }}>● mic on</span>
            </>
          )}
        </div>

        {answerMode === "play" && mic.state !== MIC_STATES.ready && (
          <div className="card" style={{ marginTop: 10 }}>
            <div className="mono" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
              {mic.state === MIC_STATES.denied
                ? "Microphone blocked — allow it in your browser's site settings (the icon in the address bar), then press “Playing it” again."
                : mic.state === MIC_STATES.unsupported
                ? "This browser can't open a microphone. Tapping still works."
                : mic.state === MIC_STATES.requesting
                ? "Waiting for microphone permission…"
                : "The microphone is off. Press “Playing it” again to turn it on — audio is analysed in this tab and never leaves it."}
            </div>
            {mic.state !== MIC_STATES.requesting && (
              <button className="btn" style={{ marginTop: 10 }} onClick={mic.start}>
                🎤 Turn on the microphone
              </button>
            )}
          </div>
        )}
      </div>

      {/* transport */}
      <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button className="big" onClick={next}>▶ {challenge ? "Next" : "Play first"}</button>
        <button
          className="btn"
          onClick={() => {
            playChallenge();
            if (answerMode === "play" && !revealed) armAfterPrompt();
          }}
          disabled={!challenge}
          style={{ opacity: challenge ? 1 : 0.5 }}
        >
          ↺ Replay
        </button>
        <div style={{ flex: 1 }} />
        <div className="mono" style={{ fontSize: 12, color: C.muted }}>
          score <span style={{ color: C.ink, fontWeight: 700 }}>{score.correct}/{score.total}</span>
          <span style={{ margin: "0 8px", opacity: 0.4 }}>·</span>
          {accuracy}%
          <span style={{ margin: "0 8px", opacity: 0.4 }}>·</span>
          streak <span style={{ color: C.sun, fontWeight: 700 }}>{score.streak}</span>
          <span style={{ margin: "0 8px", opacity: 0.4 }}>·</span>
          best <span style={{ color: C.cyan, fontWeight: 700 }}>{best}</span>
        </div>
      </div>

      {/* the practice log — what this drill has learned about you */}
      <div className="card" style={{ marginTop: 12 }}>
        <WeakSpots
          drill={drill === "intervals" ? "ear.intervals" : "ear.degrees"}
          tick={score.total}
          title={drill === "intervals" ? "Intervals you keep missing" : "Degrees you keep missing"}
          label={(k) => (drill === "intervals" ? INTERVALS[Number(k)].ab : DEG[MAJOR[Number(k)]])}
        />
      </div>

      {/* what you played — only in play mode */}
      {answerMode === "play" && (
        <div
          className="card"
          style={{
            marginTop: 16,
            textAlign: "center",
            padding: "18px 16px",
            borderColor: revealed ? (picked === correctVal ? C.green : C.red) : C.ink,
            background: revealed ? (picked === correctVal ? "rgba(63,182,139,.12)" : "rgba(224,83,63,.08)") : "var(--surface-lo)",
            transition: "border-color .2s, background .2s",
          }}
        >
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {!challenge ? "press play" : revealed ? "you played" : "now play it back"}
          </div>
          <div
            className="mono"
            style={{
              fontSize: 38,
              fontWeight: 700,
              lineHeight: 1.1,
              color: !challenge ? C.muted : revealed ? (picked === correctVal ? C.green : C.red) : C.sun,
            }}
          >
            {revealed && playedNote
              ? `${playedNote.name}${playedNote.octave}`
              : mic.note && challenge && !revealed
              ? `${mic.note.name}${mic.note.octave}`
              : challenge
              ? "…"
              : "—"}
          </div>
          <div className="mono" style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
            {!challenge
              ? "Press ▶ to hear the first interval."
              : revealed
              ? "Press ▶ Next for another."
              : !mic.listening
              ? "Turn the microphone on to answer by playing."
              : armed
              ? "Any octave counts — just find the right note."
              : "listening in a moment — let the prompt finish…"}
          </div>
        </div>
      )}

      {/* answer grid */}
      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: drill === "intervals" ? "repeat(auto-fit, minmax(96px, 1fr))" : "repeat(auto-fit, minmax(80px, 1fr))",
          gap: 8,
          opacity: answerMode === "play" && !revealed ? 0.4 : 1,
          transition: "opacity .2s",
        }}
      >
        {options.map((o) => {
          const isCorrect = revealed && o.val === correctVal;
          const isWrongPick = revealed && o.val === picked && picked !== correctVal;
          const style = {};
          if (isCorrect) { style.borderColor = C.green; style.background = "rgba(63,182,139,.18)"; style.color = C.green; }
          else if (isWrongPick) { style.borderColor = C.red; style.background = "rgba(224,83,63,.16)"; style.color = C.red; }
          return (
            <button
              key={o.val}
              className="opt"
              style={style}
              onClick={() => answer(o.val)}
              disabled={revealed || !challenge || (answerMode === "play" && mic.listening)}
            >
              <div style={{ fontSize: 16, fontWeight: 700 }}>{o.label}</div>
              <div style={{ fontSize: 9.5, color: C.muted, marginTop: 3 }}>{o.sub}</div>
            </button>
          );
        })}
      </div>

      {/* feedback + why */}
      <div style={{ marginTop: 16, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div className="card" style={{ flex: "1 1 280px", minWidth: 260 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Feedback</div>
          <div className="mono" style={{ fontSize: 14, lineHeight: 1.6, color: revealed ? (picked === correctVal ? C.green : C.red) : C.ink }}>
            {feedback}
          </div>
        </div>
        <div className="card" style={{ flex: "1 1 280px", minWidth: 260, background: "rgba(62,155,214,.10)" }}>
          <div className="eyebrow" style={{ marginBottom: 8, color: C.blue }}>The "why"</div>
          <div className="mono" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            {drill === "intervals"
              ? "An interval is a distance in half-steps. You're learning the feeling of each gap — the leap of a 5th, the tension of a b2 — so you can find it on the neck by ear."
              : "A scale degree is a note's number inside the key. Hearing the tonic first gives gravity; every other note pulls toward it. This is the number system, learned through the ear."}
            {answerMode === "play" && (
              <div style={{ marginTop: 10, color: C.sun }}>
                Answering by playing is the harder, more useful version: naming an interval is recognition, finding
                it on the neck is fluency.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
