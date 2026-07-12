import React, { useRef, useState } from "react";
import { INTERVALS, DEG, SCALES, midiToFreq } from "../theory/engine.js";
import { C } from "../ui/theme.js";

/**
 * EAR TRAINER — Feature 02 of "Guitar Theory Coach".
 * Same theory engine, now pointed at the ear instead of the eye.
 *
 * Two drills:
 *   intervals — hear root -> note, name the interval.
 *   degrees   — hear the key's tonic -> a note, name its number (Nashville).
 * The whole point: train the SOUND of a distance, not its shape.
 */

const MAJOR = SCALES.major.ints;                 // [0,2,4,5,7,9,11]
const DEGREE_LABELS = MAJOR.map((iv) => DEG[iv]); // ["1","2","3","4","5","6","7"]

// localStorage helpers that never throw (some sandboxes block storage).
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

  const ctxRef = useRef(null);
  const getCtx = () => {
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    return ctxRef.current;
  };

  // Pluck a single note at `when` seconds from now.
  const tone = (freq, when = 0, dur = 0.85) => {
    try {
      const ctx = getCtx();
      if (ctx.state === "suspended") ctx.resume();
      const t0 = ctx.currentTime + when;
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const g = ctx.createGain();
      const g2 = ctx.createGain();
      osc.type = "triangle"; osc.frequency.value = freq;
      osc2.type = "sine"; osc2.frequency.value = freq * 2; g2.gain.value = 0.25;
      osc2.connect(g2); g2.connect(g); osc.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.26, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.start(t0); osc2.start(t0); osc.stop(t0 + dur + 0.05); osc2.stop(t0 + dur + 0.05);
    } catch (e) { /* audio unavailable */ }
  };

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
    const ch =
      drill === "intervals"
        ? { type: "intervals", rootMidi, semis: 1 + Math.floor(Math.random() * 12) }
        : { type: "degrees", tonicMidi: 60, degIndex: Math.floor(Math.random() * 7) };
    setChallenge(ch);
    setPicked(null);
    setRevealed(false);
    setTimeout(() => playChallenge(ch), 60);
  };

  const answer = (val) => {
    if (revealed || !challenge) return;
    const correctVal = challenge.type === "intervals" ? challenge.semis : challenge.degIndex;
    const ok = val === correctVal;
    setPicked(val);
    setRevealed(true);
    const newStreak = ok ? score.streak + 1 : 0;
    setScore({ correct: score.correct + (ok ? 1 : 0), total: score.total + 1, streak: newStreak });
    if (newStreak > best) { setBest(newStreak); writeBest(newStreak); }
  };

  const switchDrill = (d) => {
    setDrill(d);
    setChallenge(null);
    setPicked(null);
    setRevealed(false);
  };

  const correctVal = challenge ? (challenge.type === "intervals" ? challenge.semis : challenge.degIndex) : null;
  const accuracy = score.total ? Math.round((score.correct / score.total) * 100) : 0;

  // build the answer options for the active drill
  const options =
    drill === "intervals"
      ? Array.from({ length: 12 }, (_, i) => i + 1).map((semis) => ({ val: semis, label: INTERVALS[semis].ab, sub: INTERVALS[semis].name }))
      : DEGREE_LABELS.map((lab, i) => ({ val: i, label: lab, sub: INTERVALS[MAJOR[i]].name }));

  const feedback = (() => {
    if (!challenge) return "Press play to hear the first one.";
    if (!revealed) return "Listen, then choose. Use replay as many times as you need.";
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

      {/* transport */}
      <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button className="big" onClick={next}>▶ {challenge ? "Next" : "Play first"}</button>
        <button className="btn" onClick={() => playChallenge()} disabled={!challenge} style={{ opacity: challenge ? 1 : 0.5 }}>↺ Replay</button>
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

      {/* answer grid */}
      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: drill === "intervals" ? "repeat(auto-fit, minmax(96px, 1fr))" : "repeat(auto-fit, minmax(80px, 1fr))",
          gap: 8,
        }}
      >
        {options.map((o) => {
          const isCorrect = revealed && o.val === correctVal;
          const isWrongPick = revealed && o.val === picked && picked !== correctVal;
          const style = {};
          if (isCorrect) { style.borderColor = C.green; style.background = "rgba(63,182,139,.18)"; style.color = C.green; }
          else if (isWrongPick) { style.borderColor = C.red; style.background = "rgba(224,83,63,.16)"; style.color = C.red; }
          return (
            <button key={o.val} className="opt" style={style} onClick={() => answer(o.val)} disabled={revealed || !challenge}>
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
          </div>
        </div>
      </div>
    </div>
  );
}
