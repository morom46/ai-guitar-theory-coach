import React, { useMemo, useRef, useState } from "react";
import { ROOTS, SCALES, DIATONIC, buildNoteNames, noteNameToPc, midiToFreq } from "../theory/engine.js";

/**
 * NUMBER SYSTEM — Feature 04 of "AI Guitar Theory Coach".
 * Stop thinking in letters; think in numbers. A I-IV-V is the same shape in
 * every key. This trains the Nashville number system: degrees 1-7, the
 * diatonic chords that sit on them, and translating between number and name.
 */

const C = {
  paper: "#000000", ink: "#DCE6EC", blue: "#3E9BD6", cyan: "#36C7E0",
  sun: "#FF7A2E", sunDeep: "#E0601B", line: "#3A4853", red: "#E0533F",
  green: "#3FB68B", violet: "#B58CFF", muted: "#7C8A95", grid: "rgba(120,150,170,0.10)",
};

const MAJOR = SCALES.major.ints; // [0,2,4,5,7,9,11]
const suffix = (q) => (q === "min" ? "m" : q === "dim" ? "°" : "");

const readBest = () => { try { return Number(localStorage.getItem("ns.best") || 0); } catch { return 0; } };
const writeBest = (n) => { try { localStorage.setItem("ns.best", String(n)); } catch { /* ignore */ } };
const shuffle = (a) => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

export default function NumberSystem() {
  const [view, setView] = useState("map");   // "map" | "drill"
  const [key, setKey] = useState("C");
  const [muted, setMuted] = useState(false);

  // drill state
  const [dir, setDir] = useState("numToChord"); // numToChord | chordToNum
  const [q, setQ] = useState(null);
  const [picked, setPicked] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0, streak: 0 });
  const [best, setBest] = useState(readBest);

  const audioRef = useRef(null);

  const chordNameIn = (keyName, d) => {
    const names = buildNoteNames(keyName);
    const pc = (noteNameToPc(keyName) + MAJOR[d]) % 12;
    return names[pc] + suffix(DIATONIC[d].q);
  };

  /* audio */
  const tone = (freq, when = 0, dur = 0.7) => {
    if (muted) return;
    try {
      if (!audioRef.current) audioRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const t0 = ctx.currentTime + when;
      const osc = ctx.createOscillator(); const osc2 = ctx.createOscillator();
      const g = ctx.createGain(); const g2 = ctx.createGain();
      osc.type = "triangle"; osc.frequency.value = freq;
      osc2.type = "sine"; osc2.frequency.value = freq * 2; g2.gain.value = 0.25;
      osc2.connect(g2); g2.connect(g); osc.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.24, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.start(t0); osc2.start(t0); osc.stop(t0 + dur + 0.05); osc2.stop(t0 + dur + 0.05);
    } catch (e) { /* no audio */ }
  };

  const playTriad = (keyName, d, arp = true) => {
    const base = 48 + noteNameToPc(keyName);
    [0, 2, 4].forEach((k, i) => {
      const idx = d + k;
      const semis = MAJOR[idx % 7] + 12 * Math.floor(idx / 7);
      tone(midiToFreq(base + semis), arp ? i * 0.16 : 0, 0.7);
    });
  };

  /* the 7 rows for the current key */
  const rows = useMemo(() => {
    const names = buildNoteNames(key);
    const keyPc = noteNameToPc(key);
    return DIATONIC.map((d, i) => ({
      num: i + 1,
      note: names[(keyPc + MAJOR[i]) % 12],
      rn: d.rn,
      chord: chordNameIn(key, i),
      quality: d.q,
    }));
  }, [key]);

  /* drill */
  const nextQ = () => {
    const k = ROOTS[Math.floor(Math.random() * ROOTS.length)];
    const d = Math.floor(Math.random() * 7);
    setQ({ key: k, degIndex: d });
    setPicked(null);
    setRevealed(false);
  };

  const answer = (val) => {
    if (revealed || !q) return;
    const correct = dir === "numToChord" ? chordNameIn(q.key, q.degIndex) : q.degIndex + 1;
    const ok = val === correct;
    setPicked(val);
    setRevealed(true);
    const streak = ok ? score.streak + 1 : 0;
    setScore({ correct: score.correct + (ok ? 1 : 0), total: score.total + 1, streak });
    if (streak > best) { setBest(streak); writeBest(streak); }
    playTriad(q.key, q.degIndex);
  };

  const switchDir = (d) => { setDir(d); setQ(null); setPicked(null); setRevealed(false); };

  // options + correct answer for the active question
  const drill = useMemo(() => {
    if (!q) return null;
    if (dir === "numToChord") {
      const opts = shuffle(DIATONIC.map((_, i) => chordNameIn(q.key, i)));
      return { correct: chordNameIn(q.key, q.degIndex), options: opts.map((o) => ({ val: o, label: o })) };
    }
    return {
      correct: q.degIndex + 1,
      options: DIATONIC.map((d, i) => ({ val: i + 1, label: `${i + 1}`, sub: d.rn })),
    };
  }, [q, dir]);

  const accuracy = score.total ? Math.round((score.correct / score.total) * 100) : 0;

  return (
    <div className="ns-root">
      <style>{`
        .ns-root{ --ink:${C.ink};--muted:${C.muted};--line:${C.line};
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--ink);
          background: linear-gradient(${C.grid} 1px, transparent 1px), linear-gradient(90deg, ${C.grid} 1px, transparent 1px), ${C.paper};
          background-size: 24px 24px, 24px 24px; padding: 22px; border-radius: 8px; box-shadow: inset 0 0 0 1.5px rgba(220,230,236,0.16); }
        .ns-mono{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, "Courier New", monospace; }
        .ns-title{ font-family: ui-monospace, monospace; font-size: 26px; font-weight: 700; letter-spacing: 1px; margin: 0; }
        .ns-sub{ font-family: ui-monospace, monospace; font-size: 12.5px; color: var(--muted); margin: 4px 0 0; }
        .ns-eyebrow{ font-family: ui-monospace, monospace; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: var(--muted); }
        .ns-btn{ font-family: ui-monospace, monospace; font-size: 12px; letter-spacing:.5px; padding: 7px 11px;
          border: 1.5px solid var(--line); background: rgba(255,255,255,.05); color: var(--ink); cursor: pointer; border-radius: 3px; transition: all .12s; }
        .ns-btn:hover{ border-color: var(--ink); }
        .ns-btn.on{ background: var(--ink); color: ${C.paper}; border-color: var(--ink); }
        .ns-chip{ font-family: ui-monospace, monospace; font-size: 12px; padding: 6px 9px; border: 1.5px solid var(--line);
          background: rgba(255,255,255,.05); cursor:pointer; border-radius:3px; color: var(--ink); }
        .ns-chip.on{ background: ${C.sun}; border-color:${C.sunDeep}; color:#fff; }
        .ns-row{ display:grid; grid-template-columns: 52px 1fr 64px 1fr; gap: 8px; align-items:center;
          padding: 9px 12px; border:1.5px solid var(--line); border-radius:4px; background: rgba(255,255,255,.04);
          cursor:pointer; transition: all .12s; }
        .ns-row:hover{ border-color: var(--ink); }
        .ns-opt{ font-family: ui-monospace, monospace; cursor: pointer; border-radius: 4px; border: 1.5px solid var(--line);
          background: rgba(255,255,255,.04); color: var(--ink); padding: 12px 8px; text-align: center; transition: all .15s; }
        .ns-opt:hover:not(:disabled){ border-color: var(--ink); transform: translateY(-1px); }
        .ns-big{ font-family: ui-monospace, monospace; font-weight: 700; cursor: pointer; border-radius: 4px;
          border: 1.5px solid ${C.sunDeep}; background: ${C.sun}; color:#fff; padding: 12px 20px; font-size: 14px; }
        .ns-card{ border: 1.5px solid var(--ink); background: rgba(255,255,255,.04); border-radius: 4px; padding: 14px 16px; }
      `}</style>

      <div className="ns-eyebrow">AI Guitar Theory Coach · Feature 04</div>
      <h1 className="ns-title">THE NUMBER SYSTEM</h1>
      <p className="ns-sub">A 1-4-5 is one idea in every key. Learn the numbers and you can play in all twelve.</p>

      {/* view toggle */}
      <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button className={"ns-btn" + (view === "map" ? " on" : "")} onClick={() => setView("map")}>Key map</button>
        <button className={"ns-btn" + (view === "drill" ? " on" : "")} onClick={() => setView("drill")}>Drill</button>
        <div style={{ flex: 1 }} />
        <button className="ns-btn" onClick={() => setMuted((m) => !m)} aria-pressed={muted}>{muted ? "♪ sound off" : "♪ sound on"}</button>
      </div>

      {view === "map" && (
        <>
          <div style={{ marginTop: 16 }}>
            <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Key</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {ROOTS.map((r) => (
                <button key={r} className={"ns-chip" + (r === key ? " on" : "")} onClick={() => setKey(r)}>{r}</button>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <div className="ns-eyebrow" style={{ marginBottom: 8 }}>{key} major — number · note · chord (tap a row to hear the chord)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="ns-mono" style={{ display: "grid", gridTemplateColumns: "52px 1fr 64px 1fr", gap: 8, fontSize: 10, color: C.muted, padding: "0 12px", letterSpacing: 1 }}>
                <span>NUMBER</span><span>NOTE</span><span>ROMAN</span><span>CHORD</span>
              </div>
              {rows.map((r, i) => (
                <div key={i} className="ns-row" onClick={() => playTriad(key, i)}>
                  <span className="ns-mono" style={{ fontSize: 18, fontWeight: 700, color: i === 0 ? C.sun : C.ink }}>{r.num}</span>
                  <span className="ns-mono" style={{ fontSize: 14 }}>{r.note}</span>
                  <span className="ns-mono" style={{ fontSize: 13, color: C.muted }}>{r.rn}</span>
                  <span className="ns-mono" style={{ fontSize: 14, fontWeight: 700, color: r.quality === "Maj" ? C.sun : r.quality === "dim" ? C.red : C.cyan }}>{r.chord}</span>
                </div>
              ))}
            </div>
            <div className="ns-card" style={{ marginTop: 14, background: "rgba(62,155,214,.10)" }}>
              <div className="ns-eyebrow" style={{ marginBottom: 6, color: C.blue }}>The "why"</div>
              <div className="ns-mono" style={{ fontSize: 13, lineHeight: 1.6 }}>
                The pattern of qualities never changes: <b style={{ color: C.sun }}>I ii iii IV V vi vii°</b>. Major on 1, 4, 5; minor on 2, 3, 6; diminished on 7 — in every key. That's why a song's numbers transpose anywhere.
              </div>
            </div>
          </div>
        </>
      )}

      {view === "drill" && (
        <>
          <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button className={"ns-btn" + (dir === "numToChord" ? " on" : "")} onClick={() => switchDir("numToChord")}>Number → chord</button>
            <button className={"ns-btn" + (dir === "chordToNum" ? " on" : "")} onClick={() => switchDir("chordToNum")}>Chord → number</button>
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button className="ns-big" onClick={nextQ}>▶ {q ? "Next" : "Start"}</button>
            <div style={{ flex: 1 }} />
            <div className="ns-mono" style={{ fontSize: 12, color: C.muted }}>
              score <span style={{ color: C.ink, fontWeight: 700 }}>{score.correct}/{score.total}</span>
              <span style={{ margin: "0 8px", opacity: 0.4 }}>·</span>{accuracy}%
              <span style={{ margin: "0 8px", opacity: 0.4 }}>·</span>streak <span style={{ color: C.sun, fontWeight: 700 }}>{score.streak}</span>
              <span style={{ margin: "0 8px", opacity: 0.4 }}>·</span>best <span style={{ color: C.cyan, fontWeight: 700 }}>{best}</span>
            </div>
          </div>

          <div className="ns-card" style={{ marginTop: 16, textAlign: "center" }}>
            {!q ? (
              <div className="ns-mono" style={{ color: C.muted, fontSize: 13 }}>Press start. You'll get a random key each time — that's the point.</div>
            ) : (
              <div className="ns-mono" style={{ fontSize: 18 }}>
                In <span style={{ color: C.sun, fontWeight: 700 }}>{q.key} major</span>,
                {dir === "numToChord"
                  ? <> the <span style={{ color: C.cyan, fontWeight: 700 }}>{q.degIndex + 1}</span> ({DIATONIC[q.degIndex].rn}) chord is…</>
                  : <> what number is <span style={{ color: C.cyan, fontWeight: 700 }}>{chordNameIn(q.key, q.degIndex)}</span>?</>}
              </div>
            )}
          </div>

          {q && drill && (
            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: dir === "numToChord" ? "repeat(auto-fit, minmax(84px, 1fr))" : "repeat(auto-fit, minmax(70px, 1fr))", gap: 8 }}>
              {drill.options.map((o) => {
                const isCorrect = revealed && o.val === drill.correct;
                const isWrong = revealed && o.val === picked && picked !== drill.correct;
                const st = {};
                if (isCorrect) { st.borderColor = C.green; st.background = "rgba(63,182,139,.18)"; st.color = C.green; }
                else if (isWrong) { st.borderColor = C.red; st.background = "rgba(224,83,63,.16)"; st.color = C.red; }
                return (
                  <button key={o.val} className="ns-opt" style={st} disabled={revealed} onClick={() => answer(o.val)}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{o.label}</div>
                    {o.sub && <div style={{ fontSize: 9.5, color: C.muted, marginTop: 3 }}>{o.sub}</div>}
                  </button>
                );
              })}
            </div>
          )}

          {revealed && q && (
            <div className="ns-mono" style={{ marginTop: 12, fontSize: 14, color: picked === drill.correct ? C.green : C.red }}>
              {picked === drill.correct ? "Correct" : "Not quite"} — in {q.key} major, the {q.degIndex + 1} chord is {chordNameIn(q.key, q.degIndex)} ({DIATONIC[q.degIndex].rn}).
            </div>
          )}
        </>
      )}
    </div>
  );
}
