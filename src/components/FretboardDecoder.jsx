import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ROOTS,
  DEG,
  INTERVALS,
  SCALES,
  CHORDS,
  DIATONIC,
  OPEN_MIDI,
  FRETS,
  noteNameToPc,
  buildNoteNames,
  midiToFreq,
} from "../theory/engine.js";
import SpotifyRecent from "./SpotifyRecent.jsx";

/**
 * THE FRETBOARD DECODER — keystone of "Guitar Theory Coach".
 * Music is the language. The guitar is the dumb machine.
 * Decodes pitch: Note (the Sun) -> Intervals -> Scales -> Chords -> Harmony -> Modes.
 */

const C = {
  paper: "#000000",
  ink: "#DCE6EC",
  blue: "#3E9BD6",
  cyan: "#36C7E0",
  sun: "#FF7A2E",
  sunDeep: "#E0601B",
  grid: "rgba(120,150,170,0.10)",
  gridBold: "rgba(120,150,170,0.16)",
  line: "#3A4853",
  red: "#E0533F",
  violet: "#B58CFF",
  muted: "#7C8A95",
};

const ROLE_STYLE = {
  root: { bg: C.sun, br: C.sunDeep, tx: "#FFF" },
  third: { bg: C.cyan, br: "#1F7E96", tx: "#06222B" },
  tone: { bg: C.blue, br: "#123F62", tx: "#EAF2F7" },
  tritone: { bg: C.red, br: "#8E2A1D", tx: "#FFF" },
  perfect: { bg: C.blue, br: "#123F62", tx: "#EAF2F7" },
  note: { bg: "rgba(255,255,255,0.06)", br: C.line, tx: C.ink },
  dim: { bg: "rgba(62,155,214,0.14)", br: "rgba(62,155,214,0.4)", tx: C.blue },
  char: { bg: C.violet, br: "#7A52C7", tx: "#1A1030" },
};

// Roy G Biv — one colour per scale degree (1-7); the root (1) is red.
const RAINBOW = {
  1: { bg: "#E0533F", tx: "#fff",    br: "#8E2A1D" }, // red  — root
  2: { bg: "#FF7A2E", tx: "#2A1300", br: "#C85A18" }, // orange
  3: { bg: "#E8C84A", tx: "#2A2300", br: "#B59A1E" }, // yellow
  4: { bg: "#46B36B", tx: "#04220F", br: "#2C7E48" }, // green
  5: { bg: "#3E9BD6", tx: "#04202E", br: "#1F6FA0" }, // blue
  6: { bg: "#6C7BE0", tx: "#0A0E2A", br: "#3F4DB0" }, // indigo
  7: { bg: "#B58CFF", tx: "#1A1030", br: "#7A52C7" }, // violet
};
const degBase = (label) => { const m = String(label).match(/[1-7]/); return m ? Number(m[0]) : null; };

// The 7 diatonic modes by parent-major degree. `char` = semitones from the
// mode's own tonic to its characteristic (flavour) note.
const MODE_BY_DEGREE = [
  { id: "ionian",     name: "Ionian",     quality: "major",      char: 11, charName: "natural 7" },
  { id: "dorian",     name: "Dorian",     quality: "minor",      char: 9,  charName: "natural 6" },
  { id: "phrygian",   name: "Phrygian",   quality: "minor",      char: 1,  charName: "b2" },
  { id: "lydian",     name: "Lydian",     quality: "major",      char: 6,  charName: "#4" },
  { id: "mixolydian", name: "Mixolydian", quality: "major",      char: 10, charName: "b7" },
  { id: "aeolian",    name: "Aeolian",    quality: "minor",      char: 8,  charName: "b6" },
  { id: "locrian",    name: "Locrian",    quality: "diminished", char: 6,  charName: "b5" },
];

const PROGRESSIONS = {
  "145":  { name: "I-IV-V", degrees: [0, 3, 4] },
  "1564": { name: "I-V-vi-IV", degrees: [0, 4, 5, 3] },
  "1645": { name: "I-vi-IV-V", degrees: [0, 5, 3, 4] },
  "251":  { name: "ii-V-I", degrees: [1, 4, 0] },
  "14":   { name: "I-IV (mode jam)", degrees: [0, 3] },
};

export default function FretboardDecoder() {
  const [root, setRoot] = useState("C");
  const [mode, setMode] = useState("scale");
  const [scaleId, setScaleId] = useState("major");
  const [chordId, setChordId] = useState("maj");
  const [degree, setDegree] = useState(0);
  const [selected, setSelected] = useState(null);
  const [muted, setMuted] = useState(false);
  const [flipStrings, setFlipStrings] = useState(false);
  const [parentRoot, setParentRoot] = useState("C");
  const [tonicDegree, setTonicDegree] = useState(0);
  const [progId, setProgId] = useState("145");
  const [playing, setPlaying] = useState(false);
  const [chordIdx, setChordIdx] = useState(0);
  const [stepMs, setStepMs] = useState(1700);
  const [fit, setFit] = useState(false);
  const wrapRef = useRef(null);
  const [wrapW, setWrapW] = useState(0);
  const [rainbow, setRainbow] = useState(false);
  const [boxOn, setBoxOn] = useState(false);
  const [boxStart, setBoxStart] = useState(0);
  const [soloPenta, setSoloPenta] = useState(true);

  const audioRef = useRef(null);

  const rootPc = noteNameToPc(root);
  const names = useMemo(() => buildNoteNames(root), [root]);
  const parentNames = useMemo(() => buildNoteNames(parentRoot), [parentRoot]);
  const parentPc = noteNameToPc(parentRoot);

  const isModal = mode === "modes" || mode === "progression";
  const prog = PROGRESSIONS[progId];
  const effTonicDeg =
    mode === "progression" ? prog.degrees[chordIdx % prog.degrees.length] : tonicDegree;
  const activeMode = MODE_BY_DEGREE[effTonicDeg];
  const tonicPc = (parentPc + SCALES.major.ints[effTonicDeg]) % 12;
  const tonicName = parentNames[tonicPc];

  const engine = useMemo(() => {
    const map = new Map();
    let showAll = false;
    const setPc = (pc, label, role) => map.set(((pc % 12) + 12) % 12, { label, role });

    if (mode === "note") {
      showAll = true;
      for (let pc = 0; pc < 12; pc++) setPc(pc, names[pc], pc === rootPc ? "root" : "note");
    } else if (mode === "interval") {
      showAll = true;
      for (let pc = 0; pc < 12; pc++) {
        const s = (pc - rootPc + 12) % 12;
        const iv = INTERVALS[s];
        let role = "tone";
        if (s === 0) role = "root";
        else if (s === 6) role = "tritone";
        else if (s === 5 || s === 7) role = "perfect";
        else if (s === 3 || s === 4) role = "third";
        setPc(pc, iv.ab, role);
      }
    } else if (mode === "scale") {
      SCALES[scaleId].ints.forEach((iv) => {
        const pc = (rootPc + iv) % 12;
        let role = "tone";
        if (iv === 0) role = "root";
        else if (iv === 3 || iv === 4) role = "third";
        setPc(pc, DEG[iv], role);
      });
    } else if (mode === "chord") {
      const ch = CHORDS[chordId];
      ch.ints.forEach((iv, i) => {
        const pc = (rootPc + iv) % 12;
        const lab = ch.labels[i];
        let role = "tone";
        if (lab === "1") role = "root";
        else if (lab === "3" || lab === "b3") role = "third";
        setPc(pc, lab, role);
      });
    } else if (mode === "harmony") {
      const maj = SCALES.major.ints;
      maj.forEach((iv) => {
        const pc = (rootPc + iv) % 12;
        if (!map.has(pc)) setPc(pc, DEG[iv], "dim");
      });
      const triadIvs = [maj[degree], maj[(degree + 2) % 7], maj[(degree + 4) % 7]];
      triadIvs.forEach((iv, i) => {
        const pc = (rootPc + iv) % 12;
        const rel = (pc - rootPc + 12) % 12;
        let role = "tone";
        if (i === 0) role = "root";
        else if (i === 1) role = "third";
        setPc(pc, DEG[rel], role);
      });
    } else if (mode === "modes" || mode === "progression") {
      // The SAME seven notes of the parent major - only the nucleus moves.
      const maj = SCALES.major.ints;
      const tPc = (parentPc + maj[effTonicDeg]) % 12;
      maj.forEach((iv) => {
        const pc = (parentPc + iv) % 12;
        const semis = (pc - tPc + 12) % 12;
        let role = "tone";
        if (semis === 0) role = "root";
        else if (semis === 3 || semis === 4) role = "third";
        else if (semis === activeMode.char) role = "char";
        const lab = semis === 6 ? (activeMode.id === "lydian" ? "#4" : "b5") : DEG[semis];
        setPc(pc, lab, role);
      });
    }
    return { map, showAll };
  }, [mode, scaleId, chordId, degree, root, rootPc, names, parentPc, effTonicDeg, activeMode]);

  const play = (freq) => {
    if (muted) return;
    try {
      if (!audioRef.current) {
        audioRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const g = ctx.createGain();
      const g2 = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      osc2.type = "sine";
      osc2.frequency.value = freq * 2;
      g2.gain.value = 0.28;
      osc2.connect(g2);
      g2.connect(g);
      osc.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.26, now + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.25);
      osc.start(now);
      osc2.start(now);
      osc.stop(now + 1.3);
      osc2.stop(now + 1.3);
    } catch (e) {
      /* audio unavailable */
    }
  };

  const playTriad = (deg) => {
    const maj = SCALES.major.ints;
    const baseMidi = 52 + parentPc;
    [0, 2, 4].forEach((k) => {
      const idx = deg + k;
      const semis = maj[idx % 7] + 12 * Math.floor(idx / 7);
      play(midiToFreq(baseMidi + semis));
    });
  };

  const handleClick = (s, f) => {
    const midi = OPEN_MIDI[s] + f;
    setSelected({ s, f });
    play(midiToFreq(midi));
  };

  useEffect(() => {
    if (!playing || mode !== "progression") return;
    const p = PROGRESSIONS[progId];
    let i = chordIdx;
    const tick = () => {
      const deg = p.degrees[i % p.degrees.length];
      playTriad(deg);
      setChordIdx(i % p.degrees.length);
      i += 1;
    };
    tick();
    const id = setInterval(tick, stepMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, mode, progId, stepMs]);

  useEffect(() => {
    if (mode !== "progression" && playing) setPlaying(false);
  }, [mode, playing]);

  // Measure the panel so "fit to width" can size the frets to the screen.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWrapW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const labelW = 64;
  const openW = fit ? 30 : 54;
  const baseFretW = 60;
  const fretW = fit && wrapW ? Math.max(24, Math.min(baseFretW, (wrapW - labelW - openW - 14) / FRETS)) : baseFretW;
  const rowH = 46;
  const neckW = openW + FRETS * fretW;
  const neckH = 6 * rowH;
  const noteX = (f) => (f === 0 ? openW / 2 : openW + (f - 0.5) * fretW);
  const noteY = (s) => (s + 0.5) * rowH;
  const dispY = (s) => noteY(flipStrings ? s : OPEN_MIDI.length - 1 - s);
  const stringOrder = (flipStrings ? OPEN_MIDI : [...OPEN_MIDI].reverse())
    .map((m) => names[m % 12][0])
    .join("");
  const slide = "top 0.4s cubic-bezier(0.45, 0, 0.15, 1)";
  const singleDots = [3, 5, 7, 9, 15, 17, 19, 21];
  const doubleDots = [12, 24];

  const readout = useMemo(() => {
    if (!selected) return null;
    const midi = OPEN_MIDI[selected.s] + selected.f;
    const pc = midi % 12;
    const semis = (pc - rootPc + 12) % 12;
    const inSet = engine.map.has(pc) && engine.map.get(pc).role !== "dim";
    const scaleIvs = mode === "harmony" ? SCALES.major.ints : (SCALES[scaleId] ? SCALES[scaleId].ints : SCALES.major.ints);
    const degIndex = scaleIvs.indexOf(semis);
    return {
      name: names[pc],
      octave: Math.floor(midi / 12) - 1,
      pc,
      midi,
      freq: midiToFreq(midi),
      interval: INTERVALS[semis],
      semis,
      stringName: names[OPEN_MIDI[selected.s] % 12],
      fret: selected.f,
      stringNum: selected.s + 1,
      degreeInScale: degIndex >= 0 ? DEG[semis] : null,
      inSet,
    };
  }, [selected, rootPc, names, engine, mode, scaleId]);

  const modes = [
    { id: "note", label: "Notes", lvl: "Lv 2" },
    { id: "interval", label: "Intervals", lvl: "Lv 3" },
    { id: "scale", label: "Scales", lvl: "Lv 4" },
    { id: "chord", label: "Chords", lvl: "Lv 5" },
    { id: "harmony", label: "Harmony", lvl: "Lv 6" },
    { id: "modes", label: "Modes", lvl: "Lv 6+" },
    { id: "progression", label: "Progression", lvl: "Lv 7" },
  ];

  const why = useMemo(() => {
    if (mode === "note") return { t: "Level 2 - The Note", b: "Every note is measured against the Tonic (the Sun). The orange node is your gravity well; every other pitch is defined by its distance from it." };
    if (mode === "interval") return { t: "Level 3 - Intervals", b: "An interval is the distance between two pitches in half-steps (frets). All scales and chords are just patterns of intervals. The red node is the tritone - the exact centre of the octave." };
    if (mode === "scale") return { t: "Level 4 - Scales", b: `A scale is an engineered sequence of intervals, not a list of notes. ${SCALES[scaleId].name}: ${SCALES[scaleId].formula}. The cyan node is the 3rd - it decides major vs. minor.` };
    if (mode === "chord") return { t: "Level 5 - Chords", b: `Chords stack thirds vertically out of the scale. ${CHORDS[chordId].name}: ${CHORDS[chordId].formula}.` };
    if (mode === "modes") return { t: `Modes - ${activeMode.name}`, b: `These are the same seven notes as ${parentRoot} major. Moving the nucleus (the Sun) to degree ${effTonicDeg + 1} re-spells everything: ${activeMode.name} is ${activeMode.quality}, and its signature colour comes from the ${activeMode.charName} - the violet node.` };
    if (mode === "progression") return { t: "Soloing over the changes", b: `Don't wander one scale over a whole song. Over ${parentRoot} major's ${prog.name}, play each chord's mode: the same notes, but the Sun (and the numbers) jump to the current chord's root.` };
    return { t: "Level 6 - Harmony", b: "Stack thirds on every degree of the major scale and you get a fixed map: I ii iii IV V vi vii. The V chord carries the b7 of the key and pulls hardest back toward I." };
  }, [mode, scaleId, chordId, activeMode, parentRoot, effTonicDeg, prog]);

  const triadName = useMemo(() => {
    if (mode !== "harmony") return null;
    const maj = SCALES.major.ints;
    const tPc = (rootPc + maj[degree]) % 12;
    const d = DIATONIC[degree];
    return `${d.rn} - ${names[tPc]} ${d.q}`;
  }, [mode, degree, rootPc, names]);

  // Load a Spotify-detected key (e.g. "Em", "F#m", "C") onto the fretboard.
  const handlePickKey = (keyStr) => {
    if (!keyStr) return;
    const minor = /m$/.test(keyStr) && !/maj$/i.test(keyStr);
    const token = keyStr.replace(/m$/, "").trim();
    if (!/^[A-Ga-g]/.test(token)) return;
    const pc = noteNameToPc(token);
    const rootName = ROOTS.find((r) => noteNameToPc(r) === pc) || "C";
    setRoot(rootName);
    setMode("scale");
    setScaleId(soloPenta ? (minor ? "minorPent" : "majorPent") : (minor ? "aeolian" : "major"));
  };

  return (
    <div className="bp-root">
      <style>{`
        .bp-root{
          --paper:${C.paper};--ink:${C.ink};--blue:${C.blue};--cyan:${C.cyan};
          --sun:${C.sun};--grid:${C.grid};--line:${C.line};--muted:${C.muted};
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
          color: var(--ink);
          background:
            linear-gradient(var(--grid) 1px, transparent 1px),
            linear-gradient(90deg, var(--grid) 1px, transparent 1px),
            var(--paper);
          background-size: 24px 24px, 24px 24px;
          padding: 22px; border-radius: 8px;
          box-shadow: inset 0 0 0 1.5px rgba(220,230,236,0.16);
        }
        .bp-mono{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, "Courier New", monospace; }
        .bp-title{ font-family: ui-monospace, Menlo, Monaco, monospace;
          font-size: 26px; font-weight: 700; letter-spacing: 1px; color: var(--ink); margin:0; }
        .bp-sub{ font-family: ui-monospace, monospace; font-size: 12.5px; color: var(--muted); margin: 4px 0 0; letter-spacing:.3px; }
        .bp-eyebrow{ font-family: ui-monospace, monospace; font-size: 10px; letter-spacing: 2px;
          text-transform: uppercase; color: var(--muted); }
        .bp-btn{ font-family: ui-monospace, monospace; font-size: 12px; letter-spacing:.5px;
          padding: 7px 12px; border: 1.5px solid var(--line); background: rgba(255,255,255,.05);
          color: var(--ink); cursor: pointer; border-radius: 3px; transition: all .12s; }
        .bp-btn:hover{ border-color: var(--ink); }
        .bp-btn.on{ background: var(--ink); color: var(--paper); border-color: var(--ink); }
        .bp-chip{ font-family: ui-monospace, monospace; font-size: 12px; padding: 6px 9px;
          border: 1.5px solid var(--line); background: rgba(255,255,255,.05); cursor:pointer; border-radius:3px; }
        .bp-chip.on{ background: var(--sun); border-color:${C.sunDeep}; color:#fff; }
        .bp-card{ border: 1.5px solid var(--ink); background: rgba(255,255,255,.04);
          border-radius: 4px; padding: 14px 16px; position: relative; }
        .bp-node{ display:flex; align-items:center; justify-content:center;
          font-family: ui-monospace, monospace; font-weight: 700; cursor: pointer;
          border-radius: 999px; user-select:none;
          transition: transform .1s, top .4s cubic-bezier(.45,0,.15,1),
            background-color .35s ease, border-color .35s ease, color .3s ease, box-shadow .35s ease; }
        .bp-node:hover{ transform: scale(1.12); }
        .bp-info{ position: relative; display: inline-flex; cursor: help; margin-left: 5px; vertical-align: middle; }
        .bp-info-dot{ width: 14px; height: 14px; border-radius: 999px; border: 1px solid var(--muted); color: var(--muted);
          font-size: 9px; font-weight: 700; font-style: italic; display: flex; align-items: center; justify-content: center;
          font-family: ui-monospace, monospace; transition: all .15s; }
        .bp-info:hover .bp-info-dot, .bp-info:focus-within .bp-info-dot{ border-color: var(--ink); color: var(--ink); }
        .bp-info-pop{ position: absolute; bottom: calc(100% + 9px); left: 50%; z-index: 60;
          transform: translate(-50%, 7px) scale(.96); transform-origin: bottom center;
          width: max-content; max-width: 230px; background: #0c1116; color: var(--ink);
          border: 1.5px solid var(--line); border-radius: 6px; padding: 9px 11px;
          font-family: ui-monospace, monospace; font-size: 11px; line-height: 1.55; letter-spacing: .2px;
          text-transform: none; box-shadow: 0 8px 24px rgba(0,0,0,.55); white-space: normal;
          opacity: 0; pointer-events: none; transition: opacity .17s ease, transform .17s cubic-bezier(.34,1.4,.5,1); }
        .bp-info-pop::after{ content:""; position:absolute; top:100%; left:50%; transform:translateX(-50%);
          border:5px solid transparent; border-top-color: var(--line); }
        .bp-info-pop.on{ opacity: 1; transform: translate(-50%, 0) scale(1); }
        .bp-row{ display:flex; flex-wrap: wrap; gap: 18px; }
        .bp-fld{ display:flex; justify-content:space-between; gap:12px; padding:5px 0;
          border-bottom: 1px dashed ${C.grid}; font-family: ui-monospace, monospace; font-size: 12.5px; }
        .bp-fld span:first-child{ color: var(--muted); letter-spacing:.4px; }
        .bp-fld span:last-child{ font-weight:700; }
        @media (max-width: 760px){ .bp-title{ font-size: 20px; } .bp-stack{ flex-direction: column; } }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="bp-eyebrow">Guitar Theory Coach · 01</div>
          <h1 className="bp-title">THE FRETBOARD DECODER</h1>
          <p className="bp-sub">Music is the language. The guitar is the machine. — decode it.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className={"bp-btn" + (flipStrings ? " on" : "")} onClick={() => setFlipStrings((v) => !v)} aria-pressed={flipStrings} title="Flip the vertical order of the strings">
            ⇅ {stringOrder}
          </button>
          <button className={"bp-btn" + (fit ? " on" : "")} onClick={() => setFit((v) => !v)} aria-pressed={fit} title="Compress fret spacing to fit the screen">⤢ fit</button>
          <button className={"bp-btn" + (rainbow ? " on" : "")} onClick={() => setRainbow((v) => !v)} aria-pressed={rainbow} title="Colour each scale degree (Roy G Biv); root = red">🌈 colors</button>
          <button className={"bp-btn" + (boxOn ? " on" : "")} onClick={() => setBoxOn((v) => !v)} aria-pressed={boxOn} title="Lock to one 5-fret box (stay in position)">▢ box</button>
          {boxOn && (
            <label className="bp-btn" style={{ display: "flex", alignItems: "center", gap: 6, cursor: "default" }}>
              box @ {boxStart}
              <input type="range" min="0" max={FRETS - 4} value={boxStart} onChange={(e) => setBoxStart(Number(e.target.value))} />
            </label>
          )}
          <button className="bp-btn" onClick={() => setMuted((m) => !m)} aria-pressed={muted}>
            {muted ? "♪ sound off" : "♪ sound on"}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div className="bp-eyebrow" style={{ marginBottom: 6 }}>Mode — the levels of pitch<Info text="Notes/Intervals show all 12 pitches. Scales lights a scale to solo over. Modes & Progression keep the SAME notes and just move the root." /></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {modes.map((m) => (
              <button key={m.id} className={"bp-btn" + (mode === m.id ? " on" : "")} onClick={() => setMode(m.id)}>
                {m.label} <span style={{ opacity: 0.6, fontSize: 10 }}>{m.lvl}</span>
              </button>
            ))}
          </div>
        </div>

        {!isModal && (
          <div>
            <div className="bp-eyebrow" style={{ marginBottom: 6 }}>Root / Tonic — the Sun<Info text="The key centre — every note number and colour is measured from this root. Try the 🌈 colors and ▢ box toggles up top." /></div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {ROOTS.map((r) => (
                <button key={r} className={"bp-chip" + (r === root ? " on" : "")} onClick={() => setRoot(r)}>{r}</button>
              ))}
            </div>
          </div>
        )}

        {mode === "scale" && (
          <div>
            <div className="bp-eyebrow" style={{ marginBottom: 6 }}>Scale</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Object.entries(SCALES).map(([id, s]) => (
                <button key={id} className={"bp-btn" + (scaleId === id ? " on" : "")} onClick={() => setScaleId(id)}>{s.name}</button>
              ))}
            </div>
          </div>
        )}

        {mode === "chord" && (
          <div>
            <div className="bp-eyebrow" style={{ marginBottom: 6 }}>Chord quality</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Object.entries(CHORDS).map(([id, ch]) => (
                <button key={id} className={"bp-btn" + (chordId === id ? " on" : "")} onClick={() => setChordId(id)}>
                  {root}{ch.sym} · {ch.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === "harmony" && (
          <div>
            <div className="bp-eyebrow" style={{ marginBottom: 6 }}>Diatonic chord ({root} major key)</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {DIATONIC.map((d, i) => (
                <button key={i} className={"bp-btn" + (degree === i ? " on" : "")} onClick={() => setDegree(i)}>
                  {d.rn} <span style={{ opacity: 0.6, fontSize: 10 }}>{d.q}</span>
                </button>
              ))}
            </div>
            {triadName && <div className="bp-mono" style={{ marginTop: 8, color: C.sun, fontSize: 13, fontWeight: 700 }}>▶ {triadName}</div>}
          </div>
        )}

        {mode === "modes" && (
          <>
            <div>
              <div className="bp-eyebrow" style={{ marginBottom: 6 }}>Parent key — the master scale (the seven notes never change)</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {ROOTS.map((r) => (
                  <button key={r} className={"bp-chip" + (r === parentRoot ? " on" : "")} onClick={() => setParentRoot(r)}>{r}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="bp-eyebrow" style={{ marginBottom: 6 }}>Mode — move the nucleus · in order, Ionian → Locrian (1–7)</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[0, 1, 2, 3, 4, 5, 6].map((deg) => {
                  const m = MODE_BY_DEGREE[deg];
                  const tPc = (parentPc + SCALES.major.ints[deg]) % 12;
                  return (
                    <button key={m.id} className={"bp-btn" + (tonicDegree === deg ? " on" : "")} onClick={() => setTonicDegree(deg)} title={`Mode ${deg + 1} — ${m.name}: ${m.quality}, characteristic note ${m.charName}`}>
                      <span style={{ opacity: 0.5, fontSize: 10, marginRight: 3 }}>{deg + 1}</span>
                      {parentNames[tPc]} {m.name}
                    </button>
                  );
                })}
              </div>
              <div className="bp-mono" style={{ marginTop: 8, color: C.sun, fontSize: 13, fontWeight: 700 }}>
                ▶ {tonicName} {activeMode.name}
                <span style={{ color: C.muted, fontWeight: 400 }}> · {activeMode.quality} · flavour note: </span>
                <span style={{ color: C.violet }}>{activeMode.charName}</span>
              </div>
            </div>
          </>
        )}

        {mode === "progression" && (
          <>
            <div>
              <div className="bp-eyebrow" style={{ marginBottom: 6 }}>Key</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {ROOTS.map((r) => (
                  <button key={r} className={"bp-chip" + (r === parentRoot ? " on" : "")} onClick={() => setParentRoot(r)}>{r}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="bp-eyebrow" style={{ marginBottom: 6 }}>Progression — same notes, the mode shifts with every chord</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {Object.entries(PROGRESSIONS).map(([id, p]) => (
                  <button key={id} className={"bp-btn" + (progId === id ? " on" : "")} onClick={() => { setProgId(id); setChordIdx(0); }}>{p.name}</button>
                ))}
                <button className={"bp-btn" + (playing ? " on" : "")} onClick={() => setPlaying((v) => !v)} style={{ marginLeft: 6 }}>
                  {playing ? "■ stop" : "▶ play"}
                </button>
                <label className="bp-mono" style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 6 }}>
                  tempo
                  <input type="range" min="700" max="3000" step="100" value={stepMs} onChange={(e) => setStepMs(Number(e.target.value))} />
                </label>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                {prog.degrees.map((deg, i) => {
                  const m = MODE_BY_DEGREE[deg];
                  const cPc = (parentPc + SCALES.major.ints[deg]) % 12;
                  const q = DIATONIC[deg].q;
                  const sym = q === "min" ? "m" : q === "dim" ? "°" : "";
                  const active = playing && i === chordIdx % prog.degrees.length;
                  return (
                    <div key={i} className="bp-mono" style={{ padding: "6px 10px", borderRadius: 3, fontSize: 12, border: `1.5px solid ${active ? C.sun : C.line}`, background: active ? "rgba(255,122,46,.16)" : "rgba(255,255,255,.04)", color: active ? C.sun : C.ink, fontWeight: active ? 700 : 400, transition: "all .2s ease" }}>
                      {DIATONIC[deg].rn} · {parentNames[cPc]}{sym} → {m.name}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      <div ref={wrapRef} style={{ marginTop: 20, overflowX: "auto", paddingBottom: 6 }}>
        <div style={{ minWidth: fit ? "auto" : neckW + 70, paddingLeft: 4 }}>
          <div style={{ position: "relative", height: 26, marginLeft: 64 }}>
            <div style={{ position: "absolute", left: noteX(0), right: neckW - (openW + 12 * fretW), top: 12, height: 0, borderTop: `1.5px solid ${C.cyan}` }} />
            <div style={{ position: "absolute", left: noteX(0), top: 6, width: 1, height: 12, background: C.cyan }} />
            <div style={{ position: "absolute", left: openW + 12 * fretW, top: 6, width: 1, height: 12, background: C.cyan }} />
            <div className="bp-mono" style={{ position: "absolute", left: noteX(0) + 40, top: 0, fontSize: 10, color: C.cyan, letterSpacing: 1 }}>OCTAVE RANGE — 12 FRETS</div>
          </div>

          <div style={{ position: "relative", height: 18, marginLeft: 64 }}>
            {Array.from({ length: FRETS + 1 }, (_, f) => (
              <div key={f} className="bp-mono" style={{ position: "absolute", left: noteX(f) - 8, width: 16, textAlign: "center", fontSize: 11, color: f !== 0 && f % 12 === 0 ? C.sun : C.muted, fontWeight: f !== 0 && f % 12 === 0 ? 700 : 400 }}>{f}</div>
            ))}
          </div>

          <div style={{ display: "flex" }}>
            <div style={{ width: 64, position: "relative", height: neckH }}>
              {OPEN_MIDI.map((m, s) => {
                const oct = Math.floor(m / 12) - 1;
                return (
                  <div key={s} style={{ position: "absolute", top: dispY(s) - 13, right: 8, textAlign: "right", transition: slide }}>
                    <div className="bp-mono" style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{names[m % 12]}{oct}</div>
                    <div className="bp-mono" style={{ fontSize: 9, color: C.muted }}>{midiToFreq(m).toFixed(2)} Hz</div>
                  </div>
                );
              })}
            </div>

            <div style={{ position: "relative", width: neckW, height: neckH, background: "linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.012))", border: `1.5px solid ${C.ink}`, borderLeft: "none" }}>
              <div style={{ position: "absolute", left: openW, top: 0, width: 4, height: neckH, background: C.ink }} />
              {Array.from({ length: FRETS }, (_, i) => i + 1).map((f) => (
                <div key={f} style={{ position: "absolute", left: openW + f * fretW, top: 0, width: f % 12 === 0 ? 2 : 1, height: neckH, background: f % 12 === 0 ? C.cyan : C.line }} />
              ))}
              {OPEN_MIDI.map((_, s) => (
                <div key={s} style={{ position: "absolute", left: openW, right: 0, top: dispY(s), height: Math.max(1, (s) * 0.4 + 1), background: C.line, opacity: 0.7, transition: slide }} />
              ))}
              {singleDots.filter((d) => d <= FRETS).map((d) => (
                <div key={"s" + d} style={{ position: "absolute", left: noteX(d) - 5, top: neckH / 2 - 5, width: 10, height: 10, borderRadius: 999, border: `1.5px solid ${C.line}`, opacity: 0.6 }} />
              ))}
              {doubleDots.filter((d) => d <= FRETS).map((d) => (
                <React.Fragment key={"d" + d}>
                  <div style={{ position: "absolute", left: noteX(d) - 5, top: neckH * 0.30 - 5, width: 10, height: 10, borderRadius: 999, border: `1.5px solid ${C.cyan}`, opacity: 0.7 }} />
                  <div style={{ position: "absolute", left: noteX(d) - 5, top: neckH * 0.70 - 5, width: 10, height: 10, borderRadius: 999, border: `1.5px solid ${C.cyan}`, opacity: 0.7 }} />
                </React.Fragment>
              ))}

              {boxOn && (
                <div style={{ position: "absolute", top: 0, height: neckH, zIndex: 1, pointerEvents: "none",
                  left: boxStart === 0 ? 0 : openW + (boxStart - 1) * fretW,
                  width: (openW + (boxStart + 4) * fretW) - (boxStart === 0 ? 0 : openW + (boxStart - 1) * fretW),
                  background: "rgba(255,255,255,0.05)", border: `1px dashed ${C.muted}`, borderRadius: 4 }} />
              )}
              {OPEN_MIDI.map((open, s) =>
                Array.from({ length: FRETS + 1 }, (_, f) => {
                  const pc = (open + f) % 12;
                  const hit = engine.map.get(pc);
                  const inBox = !boxOn || (f >= boxStart && f <= boxStart + 4);
                  const show = (engine.showAll || !!hit) && inBox;
                  if (!show) return null;
                  const role = hit ? hit.role : "note";
                  const label = hit ? hit.label : names[pc];
                  const rbBase = rainbow && mode !== "note" && mode !== "interval" && role !== "dim" ? degBase(label) : null;
                  const st = rbBase && RAINBOW[rbBase] ? RAINBOW[rbBase] : (ROLE_STYLE[role] || ROLE_STYLE.note);
                  const isSel = selected && selected.s === s && selected.f === f;
                  const isRoot = role === "root";
                  const baseSize = Math.max(18, Math.min(30, fretW - 8));
                  const size = isRoot ? baseSize + 2 : baseSize;
                  return (
                    <button key={s + "-" + f} className="bp-node" onClick={() => handleClick(s, f)} title={`${names[pc]} · string ${s + 1} fret ${f}`}
                      style={{ position: "absolute", left: noteX(f) - size / 2, top: dispY(s) - size / 2, width: size, height: size, background: st.bg, color: st.tx, border: `2px solid ${st.br}`, fontSize: label.length > 2 ? 10 : 12, boxShadow: isRoot ? `0 0 0 3px rgba(255,122,46,.32)` : "none", outline: isSel ? `2px dashed ${C.ink}` : "none", outlineOffset: 2, zIndex: isSel ? 5 : 2 }}>
                      {label}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Legend color={C.sun} label="Root / Tonic (the Sun)" />
        <Legend color={C.cyan} label="The 3rd (major / minor decider)" />
        <Legend color={C.blue} label="Chord / scale tone" />
        {mode === "interval" && <Legend color={C.red} label="Tritone (centre of the octave)" />}
        {mode === "harmony" && <Legend color={"rgba(28,92,140,0.3)"} label="Other notes in the key" />}
        {isModal && <Legend color={C.violet} label="Characteristic note (the mode's flavour)" />}
        {rainbow && (
          <span className="bp-mono" style={{ fontSize: 11, color: C.muted }}>
            Roy G Biv —{" "}
            <span style={{ color: "#E0533F", fontWeight: 700 }}>1</span>{" "}
            <span style={{ color: "#FF7A2E", fontWeight: 700 }}>2</span>{" "}
            <span style={{ color: "#E8C84A", fontWeight: 700 }}>3</span>{" "}
            <span style={{ color: "#46B36B", fontWeight: 700 }}>4</span>{" "}
            <span style={{ color: "#3E9BD6", fontWeight: 700 }}>5</span>{" "}
            <span style={{ color: "#6C7BE0", fontWeight: 700 }}>6</span>{" "}
            <span style={{ color: "#B58CFF", fontWeight: 700 }}>7</span>
          </span>
        )}
      </div>

      <div className="bp-row bp-stack" style={{ marginTop: 18, alignItems: "stretch" }}>
        <div className="bp-card" style={{ flex: "1 1 280px", minWidth: 260 }}>
          <Ticks />
          <div className="bp-eyebrow" style={{ marginBottom: 8 }}>Spec readout</div>
          {!readout ? (
            <div className="bp-mono" style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
              Tap any node on the neck to measure it. Every pitch is defined by its distance from the Tonic.
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
                <div className="bp-mono" style={{ fontSize: 30, fontWeight: 700, color: readout.inSet ? C.sun : C.ink }}>
                  {readout.name}<span style={{ fontSize: 14, color: C.muted }}>{readout.octave}</span>
                </div>
                {readout.degreeInScale && (
                  <span className="bp-mono" style={{ fontSize: 13, padding: "2px 8px", border: `1.5px solid ${C.sun}`, color: C.sun, borderRadius: 3 }}>degree {readout.degreeInScale}</span>
                )}
              </div>
              <div className="bp-fld"><span>Interval from root</span><span>{readout.interval.name} ({readout.interval.ab})</span></div>
              <div className="bp-fld"><span>Distance</span><span>{readout.semis} semitones / {readout.semis} frets</span></div>
              <div className="bp-fld"><span>Frequency</span><span>{readout.freq.toFixed(2)} Hz</span></div>
              <div className="bp-fld"><span>Position</span><span>string {readout.stringNum} · fret {readout.fret}</span></div>
              <div className="bp-fld"><span>MIDI / pitch class</span><span>{readout.midi} · {readout.pc}</span></div>
              <div className="bp-fld" style={{ borderBottom: "none" }}><span>Emotional colour</span><span style={{ fontWeight: 400, color: C.muted }}>{readout.interval.feel}</span></div>
            </div>
          )}
        </div>

        <div className="bp-card" style={{ flex: "1 1 280px", minWidth: 260, background: "rgba(62,155,214,.10)" }}>
          <Ticks />
          <div className="bp-eyebrow" style={{ marginBottom: 8, color: C.blue }}>The "why" — play dumb, then explain it</div>
          <div className="bp-mono" style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 6 }}>{why.t}</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.65, color: C.ink }}>{why.b}</div>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="bp-eyebrow" style={{ marginBottom: 8, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
          Practice from your Spotify
          <Info text="Tap ▸ practice on a song to load its key onto the fretboard in Scales mode — an instant backdrop to solo over." />
          <span style={{ marginLeft: 10 }}>· soloing scale:</span>
          <button className={"bp-btn" + (soloPenta ? " on" : "")} style={{ padding: "3px 9px", fontSize: 10 }} onClick={() => setSoloPenta((v) => !v)}>
            {soloPenta ? "pentatonic" : "full scale"}
          </button>
        </div>
        <SpotifyRecent onPickKey={handlePickKey} />
      </div>
    </div>
  );
}

function Info({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="bp-info" tabIndex={0}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
      onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      onBlur={() => setOpen(false)}>
      <span className="bp-info-dot">i</span>
      <span className={"bp-info-pop" + (open ? " on" : "")}>{text}</span>
    </span>
  );
}

function Legend({ color, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <span style={{ width: 16, height: 16, borderRadius: 999, background: color, border: `2px solid rgba(255,255,255,.2)`, display: "inline-block" }} />
      <span className="bp-mono" style={{ fontSize: 11.5, color: C.ink }}>{label}</span>
    </div>
  );
}

function Ticks() {
  const base = { position: "absolute", width: 8, height: 8, borderColor: C.muted };
  return (
    <>
      <span style={{ ...base, top: 5, left: 5, borderTop: "1.5px solid", borderLeft: "1.5px solid" }} />
      <span style={{ ...base, top: 5, right: 5, borderTop: "1.5px solid", borderRight: "1.5px solid" }} />
      <span style={{ ...base, bottom: 5, left: 5, borderBottom: "1.5px solid", borderLeft: "1.5px solid" }} />
      <span style={{ ...base, bottom: 5, right: 5, borderBottom: "1.5px solid", borderRight: "1.5px solid" }} />
    </>
  );
}
