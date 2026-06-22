import React, { useMemo, useRef, useState } from "react";
import { ROOTS, CHORDS, INTERVALS, DEG, OPEN_MIDI, midiToFreq, noteNameToPc, buildNoteNames } from "../theory/engine.js";
import PracticePanel from "./PracticePanel.jsx";

/**
 * CHORD BUILDER — Feature 03 of "AI Guitar Theory Coach".
 * A chord is not a shape you memorise; it is thirds stacked out of a scale.
 * Pick a root and a quality, watch the chord get built one third at a time,
 * hear it, and see every place its tones live on the neck.
 */

const C = {
  paper: "#000000",
  ink: "#DCE6EC",
  blue: "#3E9BD6",
  cyan: "#36C7E0",
  sun: "#FF7A2E",
  sunDeep: "#E0601B",
  line: "#3A4853",
  red: "#E0533F",
  violet: "#B58CFF",
  green: "#3FB68B",
  muted: "#7C8A95",
  grid: "rgba(120,150,170,0.10)",
};

const ROLE = {
  root: { bg: C.sun, br: C.sunDeep, tx: "#fff" },
  third: { bg: C.cyan, br: "#1F7E96", tx: "#06222B" },
  seventh: { bg: C.violet, br: "#7A52C7", tx: "#1A1030" },
  tone: { bg: C.blue, br: "#123F62", tx: "#EAF2F7" },
};

const NBSP_FRETS = 24; // full 24-fret neck (matches a 24-fret guitar)

const roleOf = (semis) => {
  if (semis === 0) return "root";
  if (semis === 3 || semis === 4) return "third";
  if (semis === 10 || semis === 11) return "seventh";
  return "tone";
};

export default function ChordBuilder() {
  const [root, setRoot] = useState("C");
  const [chordId, setChordId] = useState("maj");
  const [muted, setMuted] = useState(false);
  const [selected, setSelected] = useState(null); // {r,f}
  const audioRef = useRef(null);

  const ch = CHORDS[chordId];
  const isMinor = ["min", "min7", "dim", "m7b5"].includes(chordId);
  const tonality = isMinor ? "minor" : "major";
  const names = useMemo(() => buildNoteNames(root), [root]);
  const rootPc = noteNameToPc(root);

  // pc -> { label, role, iv } for every chord tone
  const chordMap = useMemo(() => {
    const m = new Map();
    ch.ints.forEach((iv, i) => {
      const pc = (rootPc + iv) % 12;
      m.set(pc, { label: ch.labels[i], role: roleOf(iv), iv });
    });
    return m;
  }, [ch, rootPc]);

  // the chord tones, as cards (with the stacked-third gap to the previous tone)
  const tones = ch.ints.map((iv, i) => ({
    label: ch.labels[i],
    note: names[(rootPc + iv) % 12],
    interval: INTERVALS[iv].name,
    role: roleOf(iv),
    gap: i === 0 ? null : INTERVALS[ch.ints[i] - ch.ints[i - 1]].name, // third stacked on the last tone
  }));

  /* ---- audio ---- */
  const tone = (freq, when = 0, dur = 1.1) => {
    if (muted) return;
    try {
      if (!audioRef.current) audioRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioRef.current;
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
      g.gain.exponentialRampToValueAtTime(0.24, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.start(t0); osc2.start(t0); osc.stop(t0 + dur + 0.05); osc2.stop(t0 + dur + 0.05);
    } catch (e) { /* no audio */ }
  };

  const voicingMidis = ch.ints.map((iv) => 48 + rootPc + iv); // close voicing from C3-ish
  const strum = () => voicingMidis.forEach((m, i) => tone(midiToFreq(m), i * 0.05));
  const arpeggiate = () => voicingMidis.forEach((m, i) => tone(midiToFreq(m), i * 0.32, 0.6));

  /* ---- builder neck: low-E on top (EADGBE) ---- */
  const rows = [...OPEN_MIDI].reverse(); // [40,45,50,55,59,64] = low E .. high E
  const openW = 40, fretW = 46, rowH = 32;
  const neckW = openW + NBSP_FRETS * fretW;
  const neckH = 6 * rowH;
  const noteX = (f) => (f === 0 ? openW / 2 : openW + (f - 0.5) * fretW);
  const noteY = (r) => (r + 0.5) * rowH;
  const inlays = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];

  const tapInfo = useMemo(() => {
    if (!selected) return null;
    const midi = rows[selected.r] + selected.f;
    const pc = midi % 12;
    const semis = (pc - rootPc + 12) % 12;
    const inChord = chordMap.has(pc);
    return { name: names[pc], inChord, label: inChord ? chordMap.get(pc).label : DEG[semis], interval: INTERVALS[semis].name };
  }, [selected, rows, rootPc, chordMap, names]);

  return (
    <div className="cb-root">
      <style>{`
        .cb-root{ --ink:${C.ink};--muted:${C.muted};--line:${C.line};
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--ink);
          background: linear-gradient(${C.grid} 1px, transparent 1px), linear-gradient(90deg, ${C.grid} 1px, transparent 1px), ${C.paper};
          background-size: 24px 24px, 24px 24px; padding: 22px; border-radius: 8px; box-shadow: inset 0 0 0 1.5px rgba(220,230,236,0.16); }
        .cb-mono{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, "Courier New", monospace; }
        .cb-title{ font-family: ui-monospace, monospace; font-size: 26px; font-weight: 700; letter-spacing: 1px; margin: 0; }
        .cb-sub{ font-family: ui-monospace, monospace; font-size: 12.5px; color: var(--muted); margin: 4px 0 0; }
        .cb-eyebrow{ font-family: ui-monospace, monospace; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: var(--muted); }
        .cb-btn{ font-family: ui-monospace, monospace; font-size: 12px; letter-spacing:.5px; padding: 7px 11px;
          border: 1.5px solid var(--line); background: rgba(255,255,255,.05); color: var(--ink); cursor: pointer; border-radius: 3px; transition: all .12s; }
        .cb-btn:hover{ border-color: var(--ink); }
        .cb-btn.on{ background: var(--ink); color: ${C.paper}; border-color: var(--ink); }
        .cb-chip{ font-family: ui-monospace, monospace; font-size: 12px; padding: 6px 9px; border: 1.5px solid var(--line);
          background: rgba(255,255,255,.05); cursor:pointer; border-radius:3px; color: var(--ink); }
        .cb-chip.on{ background: ${C.sun}; border-color:${C.sunDeep}; color:#fff; }
        .cb-card{ border: 1.5px solid var(--ink); background: rgba(255,255,255,.04); border-radius: 4px; padding: 14px 16px; }
        .cb-node{ display:flex; align-items:center; justify-content:center; font-family: ui-monospace, monospace; font-weight:700;
          cursor:pointer; border-radius:999px; transition: transform .1s; user-select:none; }
        .cb-node:hover{ transform: scale(1.12); }
        .cb-tonecard{ border:1.5px solid var(--line); border-radius:4px; padding:10px 12px; background: rgba(255,255,255,.04); min-width:78px; text-align:center; }
      `}</style>

      <div className="cb-eyebrow">AI Guitar Theory Coach · Feature 03</div>
      <h1 className="cb-title">THE CHORD BUILDER</h1>
      <p className="cb-sub">A chord is thirds stacked out of a scale — not a shape to memorise. Build it, hear it, find it.</p>

      {/* root + quality */}
      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div className="cb-eyebrow" style={{ marginBottom: 6 }}>Root</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ROOTS.map((r) => (
              <button key={r} className={"cb-chip" + (r === root ? " on" : "")} onClick={() => { setRoot(r); setSelected(null); }}>{r}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="cb-eyebrow" style={{ marginBottom: 6 }}>Quality</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.entries(CHORDS).map(([id, c]) => (
              <button key={id} className={"cb-btn" + (chordId === id ? " on" : "")} onClick={() => { setChordId(id); setSelected(null); }}>
                {root}{c.sym} <span style={{ opacity: 0.6, fontSize: 10 }}>{c.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button className="cb-btn" onClick={strum} style={{ borderColor: C.sunDeep, background: C.sun, color: "#fff" }}>▶ strum</button>
          <button className="cb-btn" onClick={arpeggiate}>↟ arpeggiate</button>
          <button className="cb-btn" onClick={() => setMuted((m) => !m)} aria-pressed={muted}>{muted ? "♪ sound off" : "♪ sound on"}</button>
        </div>
      </div>

      {/* construction: stacked thirds */}
      <div style={{ marginTop: 18 }}>
        <div className="cb-eyebrow" style={{ marginBottom: 8 }}>Construction — {root}{ch.sym} = {ch.formula}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {tones.map((t, i) => (
            <React.Fragment key={i}>
              {t.gap && <span className="cb-mono" style={{ fontSize: 10, color: C.muted }}>+{t.gap}→</span>}
              <button
                className="cb-tonecard"
                onClick={() => tone(midiToFreq(48 + rootPc + ch.ints[i]))}
                style={{ cursor: "pointer", borderColor: ROLE[t.role].bg }}
                title={`Play the ${t.interval}`}
              >
                <div className="cb-mono" style={{ fontSize: 20, fontWeight: 700, color: ROLE[t.role].bg }}>{t.label}</div>
                <div className="cb-mono" style={{ fontSize: 13, color: C.ink, marginTop: 2 }}>{t.note}</div>
                <div className="cb-mono" style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{t.interval}</div>
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* neck: where the chord tones live */}
      <div style={{ marginTop: 18 }}>
        <div className="cb-eyebrow" style={{ marginBottom: 8 }}>Where the tones live — tap any to hear it (low E on top)</div>
        <div style={{ overflowX: "auto", paddingBottom: 6 }}>
          <div style={{ minWidth: neckW + 56, paddingLeft: 4 }}>
            {/* fret numbers */}
            <div style={{ position: "relative", height: 16, marginLeft: 50 }}>
              {Array.from({ length: NBSP_FRETS + 1 }, (_, f) => (
                <div key={f} className="cb-mono" style={{ position: "absolute", left: noteX(f) - 8, width: 16, textAlign: "center", fontSize: 10, color: f !== 0 && f % 12 === 0 ? C.sun : C.muted }}>{f}</div>
              ))}
            </div>
            <div style={{ display: "flex" }}>
              {/* string labels */}
              <div style={{ width: 50, position: "relative", height: neckH }}>
                {rows.map((m, r) => (
                  <div key={r} className="cb-mono" style={{ position: "absolute", top: noteY(r) - 8, right: 8, fontSize: 12, fontWeight: 700, color: C.ink }}>{names[m % 12]}</div>
                ))}
              </div>
              {/* neck */}
              <div style={{ position: "relative", width: neckW, height: neckH, background: "linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.012))", border: `1.5px solid ${C.ink}`, borderLeft: "none" }}>
                <div style={{ position: "absolute", left: openW, top: 0, width: 3, height: neckH, background: C.ink }} />
                {Array.from({ length: NBSP_FRETS }, (_, i) => i + 1).map((f) => (
                  <div key={f} style={{ position: "absolute", left: openW + f * fretW, top: 0, width: f % 12 === 0 ? 2 : 1, height: neckH, background: f % 12 === 0 ? C.cyan : C.line }} />
                ))}
                {rows.map((_, r) => (
                  <div key={r} style={{ position: "absolute", left: openW, right: 0, top: noteY(r), height: 1, background: C.line, opacity: 0.7 }} />
                ))}
                {inlays.filter((d) => d <= NBSP_FRETS).map((d) => (
                  <div key={d} style={{ position: "absolute", left: noteX(d) - 4, top: neckH / 2 - 4, width: 8, height: 8, borderRadius: 999, border: `1.5px solid ${d % 12 === 0 ? C.cyan : C.line}`, opacity: 0.6 }} />
                ))}
                {rows.map((open, r) =>
                  Array.from({ length: NBSP_FRETS + 1 }, (_, f) => {
                    const pc = (open + f) % 12;
                    const hit = chordMap.get(pc);
                    if (!hit) return null;
                    const st = ROLE[hit.role];
                    const isSel = selected && selected.r === r && selected.f === f;
                    const size = hit.role === "root" ? 24 : 22;
                    return (
                      <button key={r + "-" + f} className="cb-node" onClick={() => { setSelected({ r, f }); tone(midiToFreq(open + f)); }}
                        title={`${names[pc]} · ${hit.label}`}
                        style={{ position: "absolute", left: noteX(f) - size / 2, top: noteY(r) - size / 2, width: size, height: size,
                          background: st.bg, color: st.tx, border: `2px solid ${st.br}`, fontSize: 11,
                          boxShadow: hit.role === "root" ? `0 0 0 3px rgba(255,122,46,.3)` : "none",
                          outline: isSel ? `2px dashed ${C.ink}` : "none", outlineOffset: 2, zIndex: isSel ? 5 : 2 }}>
                        {hit.label}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* legend + why */}
      <div style={{ marginTop: 14, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div className="cb-card" style={{ flex: "1 1 260px", minWidth: 240 }}>
          <div className="cb-eyebrow" style={{ marginBottom: 8 }}>{tapInfo ? "Tapped note" : "Legend"}</div>
          {tapInfo ? (
            <div className="cb-mono" style={{ fontSize: 13, lineHeight: 1.7 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: tapInfo.inChord ? C.sun : C.ink }}>{tapInfo.name} <span style={{ fontSize: 13, color: C.muted }}>({tapInfo.label})</span></div>
              {tapInfo.inChord ? `Chord tone — the ${tapInfo.interval} of ${root}${ch.sym}.` : `Not in this chord (it would be the ${tapInfo.interval}).`}
            </div>
          ) : (
            <div className="cb-mono" style={{ fontSize: 12, lineHeight: 1.9 }}>
              <Dot c={C.sun} /> root (1) &nbsp; <Dot c={C.cyan} /> 3rd &nbsp; <Dot c={C.violet} /> 7th &nbsp; <Dot c={C.blue} /> 5th / other
            </div>
          )}
        </div>
        <div className="cb-card" style={{ flex: "1 1 260px", minWidth: 240, background: "rgba(62,155,214,.10)" }}>
          <div className="cb-eyebrow" style={{ marginBottom: 8, color: C.blue }}>The "why"</div>
          <div className="cb-mono" style={{ fontSize: 13, lineHeight: 1.6 }}>
            Stack a 3rd on the root, another 3rd on that, and you get a triad (1-3-5). Which thirds you stack — major (4 frets) or minor (3 frets) — decides the quality. {root}{ch.sym}: {ch.formula}.
          </div>
        </div>
      </div>

      <PracticePanel keyLabel={root} tonality={tonality} keyId={root + (isMinor ? "min" : "maj")} />
    </div>
  );
}

function Dot({ c }) {
  return <span style={{ display: "inline-block", width: 11, height: 11, borderRadius: 999, background: c, verticalAlign: "middle", marginRight: 2 }} />;
}
