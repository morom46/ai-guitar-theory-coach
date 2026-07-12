import React, { useMemo, useRef, useState } from "react";
import { ROOTS, CHORDS, INTERVALS, DEG, OPEN_MIDI, midiToFreq, noteNameToPc, buildNoteNames } from "../theory/engine.js";
import { C, chordToneStyle } from "../ui/theme.js";
import Neck from "./Neck.jsx";

/**
 * CHORD BUILDER — Feature 03 of "Guitar Theory Coach".
 * A chord is not a shape you memorise; it is thirds stacked out of a scale.
 * Pick a root and a quality, watch the chord get built one third at a time,
 * hear it, and see every place its tones live on the neck.
 */

const ROLE = {
  root: { bg: C.sun, br: C.sunDeep, tx: "#fff" },
  third: { bg: C.cyan, br: "#1F7E96", tx: "#06222B" },
  seventh: { bg: C.violet, br: "#7A52C7", tx: "#1A1030" },
  tone: { bg: C.blue, br: "#123F62", tx: "#EAF2F7" },
};

const FRETS = 24; // full 24-fret neck (matches a 24-fret guitar)

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
  const [selected, setSelected] = useState(null); // {s,f} — s = OPEN_MIDI index
  const audioRef = useRef(null);

  const ch = CHORDS[chordId];
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

  const tapInfo = useMemo(() => {
    if (!selected) return null;
    const midi = OPEN_MIDI[selected.s] + selected.f;
    const pc = midi % 12;
    const semis = (pc - rootPc + 12) % 12;
    const inChord = chordMap.has(pc);
    return { name: names[pc], inChord, label: inChord ? chordMap.get(pc).label : DEG[semis], interval: INTERVALS[semis].name };
  }, [selected, rootPc, chordMap, names]);

  return (
    <div className="page">
      <style>{`
        .cb-tonecard{ border:1.5px solid var(--line); border-radius:4px; padding:10px 12px; background: var(--surface-lo); min-width:78px; text-align:center; }
      `}</style>

      <div className="eyebrow">Guitar Theory Coach · 02</div>
      <h1 className="page-title">THE CHORD BUILDER</h1>
      <p className="page-sub">A chord is thirds stacked out of a scale — not a shape to memorise. Build it, hear it, find it.</p>

      {/* root + quality */}
      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Root</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ROOTS.map((r) => (
              <button key={r} className={"chip" + (r === root ? " on" : "")} onClick={() => { setRoot(r); setSelected(null); }}>{r}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Quality</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.entries(CHORDS).map(([id, c]) => (
              <button key={id} className={"btn" + (chordId === id ? " on" : "")} onClick={() => { setChordId(id); setSelected(null); }}>
                {root}{c.sym} <span style={{ opacity: 0.6, fontSize: 10 }}>{c.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn" onClick={strum} style={{ borderColor: C.sunDeep, background: C.sun, color: "#fff" }}>▶ strum</button>
          <button className="btn" onClick={arpeggiate}>↟ arpeggiate</button>
          <button className="btn" onClick={() => setMuted((m) => !m)} aria-pressed={muted}>{muted ? "♪ sound off" : "♪ sound on"}</button>
        </div>
      </div>

      {/* construction: stacked thirds */}
      <div style={{ marginTop: 18 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Construction — {root}{ch.sym} = {ch.formula}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {tones.map((t, i) => (
            <React.Fragment key={i}>
              {t.gap && <span className="mono" style={{ fontSize: 10, color: C.muted }}>+{t.gap}→</span>}
              <button
                className="cb-tonecard"
                onClick={() => tone(midiToFreq(48 + rootPc + ch.ints[i]))}
                style={{ cursor: "pointer", borderColor: ROLE[t.role].bg }}
                title={`Play the ${t.interval}`}
              >
                <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: ROLE[t.role].bg }}>{t.label}</div>
                <div className="mono" style={{ fontSize: 13, color: C.ink, marginTop: 2 }}>{t.note}</div>
                <div className="mono" style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{t.interval}</div>
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* neck: where the chord tones live */}
      <div style={{ marginTop: 18 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Where the tones live — tap any to hear it (low E on top)</div>
        <Neck
          root={root}
          frets={FRETS}
          onTap={(midi, { s, f }) => { setSelected({ s, f }); tone(midiToFreq(midi)); }}
          resolve={(pc, semis, { s, f, names: nm }) => {
            const hit = chordMap.get(pc);
            if (!hit) return null;
            const st = chordToneStyle(hit.iv);
            const isSel = selected && selected.s === s && selected.f === f;
            return {
              label: hit.label,
              ...st,
              root: hit.role === "root",
              boxShadow: hit.role === "root" ? "0 0 0 3px rgba(255,122,46,.3)" : "none",
              outline: isSel ? `2px dashed ${C.ink}` : undefined,
              zIndex: isSel ? 5 : 2,
              title: `${nm[pc]} · ${hit.label}`,
            };
          }}
        />
      </div>

      {/* legend + why */}
      <div style={{ marginTop: 14, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div className="card" style={{ flex: "1 1 260px", minWidth: 240 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>{tapInfo ? "Tapped note" : "Legend"}</div>
          {tapInfo ? (
            <div className="mono" style={{ fontSize: 13, lineHeight: 1.7 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: tapInfo.inChord ? C.sun : C.ink }}>{tapInfo.name} <span style={{ fontSize: 13, color: C.muted }}>({tapInfo.label})</span></div>
              {tapInfo.inChord ? `Chord tone — the ${tapInfo.interval} of ${root}${ch.sym}.` : `Not in this chord (it would be the ${tapInfo.interval}).`}
            </div>
          ) : (
            <div className="mono" style={{ fontSize: 12, lineHeight: 1.9 }}>
              <Dot c={C.sun} /> root (1) &nbsp; <Dot c={C.cyan} /> 3rd &nbsp; <Dot c={C.violet} /> 7th &nbsp; <Dot c={C.blue} /> 5th / other
            </div>
          )}
        </div>
        <div className="card" style={{ flex: "1 1 260px", minWidth: 240, background: "rgba(62,155,214,.10)" }}>
          <div className="eyebrow" style={{ marginBottom: 8, color: C.blue }}>The "why"</div>
          <div className="mono" style={{ fontSize: 13, lineHeight: 1.6 }}>
            Stack a 3rd on the root, another 3rd on that, and you get a triad (1-3-5). Which thirds you stack — major (4 frets) or minor (3 frets) — decides the quality. {root}{ch.sym}: {ch.formula}.
          </div>
        </div>
      </div>

    </div>
  );
}

function Dot({ c }) {
  return <span style={{ display: "inline-block", width: 11, height: 11, borderRadius: 999, background: c, verticalAlign: "middle", marginRight: 2 }} />;
}
