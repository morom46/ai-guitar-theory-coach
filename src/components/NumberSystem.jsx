import React, { useMemo, useState } from "react";
import { ROOTS, SCALES, DIATONIC, buildNoteNames, noteNameToPc, midiToFreq } from "../theory/engine.js";
import { C } from "../ui/theme.js";
import { tone as audioTone } from "../audio/engine.js";
import { useDroneFollow } from "../audio/useDrone.js";
import CircleOfFifths from "./CircleOfFifths.jsx";
import { pickWeighted, record } from "../data/progress.js";
import WeakSpots from "./WeakSpots.jsx";

/**
 * NUMBER SYSTEM — Feature 04 of "Guitar Theory Coach".
 * Stop thinking in letters; think in numbers. A I-IV-V is the same shape in
 * every key. This trains the Nashville number system: degrees 1-7, the
 * diatonic chords that sit on them, and translating between number and name.
 */

const MAJOR = SCALES.major.ints; // [0,2,4,5,7,9,11]
const suffix = (q) => (q === "min" ? "m" : q === "dim" ? "°" : "");

const readBest = () => { try { return Number(localStorage.getItem("ns.best") || 0); } catch { return 0; } };
const writeBest = (n) => { try { localStorage.setItem("ns.best", String(n)); } catch { /* ignore */ } };
const shuffle = (a) => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

export default function NumberSystem() {
  const [view, setView] = useState("map");   // "map" | "drill" | "circle"
  const [key, setKey] = useState("C");
  const [muted, setMuted] = useState(false);
  // Keep the drone on this page's key (honours the follow switch).
  useDroneFollow(key);

  // drill state
  const [dir, setDir] = useState("numToChord"); // numToChord | chordToNum
  const [q, setQ] = useState(null);
  const [picked, setPicked] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0, streak: 0 });
  const [best, setBest] = useState(readBest);


  const chordNameIn = (keyName, d) => {
    const names = buildNoteNames(keyName);
    const pc = (noteNameToPc(keyName) + MAJOR[d]) % 12;
    return names[pc] + suffix(DIATONIC[d].q);
  };

  /* audio */
  const tone = (freq, when = 0, dur = 0.7) => {
    if (muted) return;
    audioTone(freq, when, dur);
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
    // The degree is weighted by your own miss rate; the KEY stays uniform,
    // because being able to do it in every key is the point of the page.
    const d = pickWeighted("numbers", [0, 1, 2, 3, 4, 5, 6], { avoid: q ? q.degIndex : null });
    setQ({ key: k, degIndex: d });
    setPicked(null);
    setRevealed(false);
  };

  const answer = (val) => {
    if (revealed || !q) return;
    const correct = dir === "numToChord" ? chordNameIn(q.key, q.degIndex) : q.degIndex + 1;
    const ok = val === correct;
    record("numbers", q.degIndex, ok);
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
    <div className="page">
      <style>{`
        .ns-row{ display:grid; grid-template-columns: 52px 1fr 64px 1fr; gap: 8px; align-items:center;
          padding: 9px 12px; border:1.5px solid var(--line); border-radius:4px; background: var(--surface-lo);
          cursor:pointer; transition: all .12s; }
        .ns-row:hover{ border-color: var(--ink); }
      `}</style>

      <div className="eyebrow">Guitar Theory Coach · 03</div>
      <h1 className="page-title">THE NUMBER SYSTEM</h1>
      <p className="page-sub">A 1-4-5 is one idea in every key. Learn the numbers and you can play in all twelve.</p>

      {/* view toggle */}
      <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button className={"btn" + (view === "map" ? " on" : "")} onClick={() => setView("map")}>Key map</button>
        <button className={"btn" + (view === "drill" ? " on" : "")} onClick={() => setView("drill")}>Drill</button>
        <button className={"btn" + (view === "circle" ? " on" : "")} onClick={() => setView("circle")}>The circle</button>
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={() => setMuted((m) => !m)} aria-pressed={muted}>{muted ? "♪ sound off" : "♪ sound on"}</button>
      </div>

      {view === "circle" && <CircleOfFifths muted={muted} />}

      {view === "map" && (
        <>
          <div style={{ marginTop: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Key</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {ROOTS.map((r) => (
                <button key={r} className={"chip" + (r === key ? " on" : "")} onClick={() => setKey(r)}>{r}</button>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>{key} major — number · note · chord (tap a row to hear the chord)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="mono" style={{ display: "grid", gridTemplateColumns: "52px 1fr 64px 1fr", gap: 8, fontSize: 10, color: C.muted, padding: "0 12px", letterSpacing: 1 }}>
                <span>NUMBER</span><span>NOTE</span><span>ROMAN</span><span>CHORD</span>
              </div>
              {rows.map((r, i) => (
                <div key={i} className="ns-row" onClick={() => playTriad(key, i)}>
                  <span className="mono" style={{ fontSize: 18, fontWeight: 700, color: i === 0 ? C.sun : C.ink }}>{r.num}</span>
                  <span className="mono" style={{ fontSize: 14 }}>{r.note}</span>
                  <span className="mono" style={{ fontSize: 13, color: C.muted }}>{r.rn}</span>
                  <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: r.quality === "Maj" ? C.sun : r.quality === "dim" ? C.red : C.cyan }}>{r.chord}</span>
                </div>
              ))}
            </div>
            <div className="card" style={{ marginTop: 14, background: "rgba(62,155,214,.10)" }}>
              <div className="eyebrow" style={{ marginBottom: 6, color: C.blue }}>The "why"</div>
              <div className="mono" style={{ fontSize: 13, lineHeight: 1.6 }}>
                The pattern of qualities never changes: <b style={{ color: C.sun }}>I ii iii IV V vi vii°</b>. Major on 1, 4, 5; minor on 2, 3, 6; diminished on 7 — in every key. That's why a song's numbers transpose anywhere.
              </div>
            </div>
          </div>
        </>
      )}

      {view === "drill" && (
        <>
          <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button className={"btn" + (dir === "numToChord" ? " on" : "")} onClick={() => switchDir("numToChord")}>Number → chord</button>
            <button className={"btn" + (dir === "chordToNum" ? " on" : "")} onClick={() => switchDir("chordToNum")}>Chord → number</button>
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button className="big" onClick={nextQ}>▶ {q ? "Next" : "Start"}</button>
            <div style={{ flex: 1 }} />
            <div className="mono" style={{ fontSize: 12, color: C.muted }}>
              score <span style={{ color: C.ink, fontWeight: 700 }}>{score.correct}/{score.total}</span>
              <span style={{ margin: "0 8px", opacity: 0.4 }}>·</span>{accuracy}%
              <span style={{ margin: "0 8px", opacity: 0.4 }}>·</span>streak <span style={{ color: C.sun, fontWeight: 700 }}>{score.streak}</span>
              <span style={{ margin: "0 8px", opacity: 0.4 }}>·</span>best <span style={{ color: C.cyan, fontWeight: 700 }}>{best}</span>
            </div>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <WeakSpots
              drill="numbers"
              tick={score.total}
              title="Degrees you keep missing"
              label={(k) => `${Number(k) + 1} · ${DIATONIC[Number(k)].rn}`}
            />
          </div>

          <div className="card" style={{ marginTop: 16, textAlign: "center" }}>
            {!q ? (
              <div className="mono" style={{ color: C.muted, fontSize: 13 }}>Press start. You'll get a random key each time — that's the point.</div>
            ) : (
              <div className="mono" style={{ fontSize: 18 }}>
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
                  <button key={o.val} className="opt" style={st} disabled={revealed} onClick={() => answer(o.val)}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{o.label}</div>
                    {o.sub && <div style={{ fontSize: 9.5, color: C.muted, marginTop: 3 }}>{o.sub}</div>}
                  </button>
                );
              })}
            </div>
          )}

          {revealed && q && (
            <div className="mono" style={{ marginTop: 12, fontSize: 14, color: picked === drill.correct ? C.green : C.red }}>
              {picked === drill.correct ? "Correct" : "Not quite"} — in {q.key} major, the {q.degIndex + 1} chord is {chordNameIn(q.key, q.degIndex)} ({DIATONIC[q.degIndex].rn}).
            </div>
          )}
        </>
      )}

    </div>
  );
}
