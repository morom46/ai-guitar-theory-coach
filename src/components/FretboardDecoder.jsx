import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ROOTS,
  DEG,
  INTERVALS,
  SCALES,
  CHORDS,
  DIATONIC,
  DIATONIC_MINOR,
  KEY_MODES,
  FUNCTION_NAME,
  OPEN_MIDI,
  FRETS,
  noteNameToPc,
  buildNoteNames,
  midiToFreq,
} from "../theory/engine.js";
import { C, RAINBOW, degBase } from "../ui/theme.js";
import Neck, { neckGeom, SIZES } from "./Neck.jsx";
import { tone as audioTone } from "../audio/engine.js";
import { useMetronome } from "../audio/useMetronome.jsx";
import { useDroneFollow, useDrone } from "../audio/useDrone.js";
import { MODE_LADDER, ladderIndex, modeAt, modeInts, neighbourStep, labelFor } from "../theory/modes.js";

/**
 * THE FRETBOARD DECODER — keystone of "Guitar Theory Coach".
 * Music is the language. The guitar is the dumb machine.
 * Decodes pitch: Note (the Sun) -> Intervals -> Scales -> Chords -> Harmony -> Modes.
 */

const ROLE_STYLE = {
  root: { bg: C.sun, br: C.sunDeep, tx: "#FFF" },
  third: { bg: C.cyan, br: "#1F7E96", tx: "#06222B" },
  tone: { bg: C.blue, br: "#123F62", tx: "#EAF2F7" },
  tritone: { bg: C.red, br: "#8E2A1D", tx: "#FFF" },
  perfect: { bg: C.blue, br: "#123F62", tx: "#EAF2F7" },
  note: { bg: "var(--surface-hi)", br: C.line, tx: C.ink },
  dim: { bg: "rgba(62,155,214,0.14)", br: "rgba(62,155,214,0.4)", tx: C.blue },
  char: { bg: C.violet, br: "#7A52C7", tx: "#1A1030" },
  // the same degree as the neighbouring mode plays it — shown dashed, so you
  // can see where the one changing note is about to move to
  ghost: { bg: "transparent", br: C.violet, tx: C.violet, dashed: true },
};

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
  const [keyMode, setKeyMode] = useState("major"); // Harmony: major or minor key
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
  const met = useMetronome();
  const drone = useDrone();
  // A/B tab: where we are on the brightness ladder, and which neighbour the
  // flip compares against (+1 = one step darker, -1 = one step brighter).
  const [ladderId, setLadderId] = useState("dorian");
  const [flipDir, setFlipDir] = useState(1);
  const [flipped, setFlipped] = useState(false); // showing the neighbour?


  const rootPc = noteNameToPc(root);
  const names = useMemo(() => buildNoteNames(root), [root]);
  const parentNames = useMemo(() => buildNoteNames(parentRoot), [parentRoot]);
  const parentPc = noteNameToPc(parentRoot);

  const isModal = mode === "modes" || mode === "progression";

  // Harmony used to be able to explain major keys only, which left roughly
  // half the seeded song library unexplainable. The map and the scale under it
  // now follow the key flavour.
  const keyScale = SCALES[KEY_MODES[keyMode].scaleId].ints;
  const diaMap = keyMode === "minor" ? DIATONIC_MINOR : DIATONIC;

  /* ---------- A/B tab: two modes, one note apart ---------- */
  // At the ends of the ladder there is no neighbour in the chosen direction, so
  // fall back to the other one rather than leaving the flip dead.
  const abStep = neighbourStep(ladderId, flipDir) || neighbourStep(ladderId, -flipDir);
  // At the top and bottom rungs the fallback above reverses the direction, so
  // read the label off the step we actually got rather than off flipDir.
  const abDir = abStep ? (abStep.darker ? 1 : -1) : flipDir;
  const abFrom = MODE_LADDER[ladderIndex(ladderId)] || MODE_LADDER[1];
  const abTo = abStep ? abStep.toMode : null;
  // Which of the two is actually lit right now.
  const abShown = flipped && abTo ? abTo : abFrom;
  const abInts = modeInts(abShown.id) || SCALES.major.ints;
  // The one note that differs, from the point of view of what's on screen.
  const abChanging = !abStep ? null : flipped ? abStep.to : abStep.from;
  const abOther = !abStep ? null : flipped ? abStep.from : abStep.to;
  const prog = PROGRESSIONS[progId];
  const effTonicDeg =
    mode === "progression" ? prog.degrees[chordIdx % prog.degrees.length] : tonicDegree;
  const activeMode = MODE_BY_DEGREE[effTonicDeg];
  const tonicPc = (parentPc + SCALES.major.ints[effTonicDeg]) % 12;
  const tonicName = parentNames[tonicPc];

  // Keep the drone on whatever this view's tonal centre actually is (honours
  // the follow switch). In Modes that is the MODE's tonic, not the parent key:
  // put C under D Dorian and the ear just hears C Ionian starting on the 2nd,
  // and the ♮6 this page highlights as Dorian's flavour note stops being a 6th
  // at all. Progression is the exception — the chords move over one key centre,
  // so a pedal on the parent root is the right sound there.
  useDroneFollow(mode === "modes" ? tonicName : mode === "progression" ? parentRoot : root);

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
      keyScale.forEach((iv) => {
        const pc = (rootPc + iv) % 12;
        if (!map.has(pc)) setPc(pc, DEG[iv], "dim");
      });
      const triadIvs = [keyScale[degree], keyScale[(degree + 2) % 7], keyScale[(degree + 4) % 7]];
      triadIvs.forEach((iv, i) => {
        const pc = (rootPc + iv) % 12;
        const rel = (pc - rootPc + 12) % 12;
        let role = "tone";
        if (i === 0) role = "root";
        else if (i === 1) role = "third";
        setPc(pc, DEG[rel], role);
      });
    } else if (mode === "ab") {
      // Parallel view: the tonic never moves, one note does.
      abInts.forEach((iv) => {
        const pc = (rootPc + iv) % 12;
        let role = "tone";
        if (iv === 0) role = "root";
        else if (iv === abChanging) role = "char";
        else if (iv === 3 || iv === 4) role = "third";
        setPc(pc, labelFor(iv, abShown.id), role);
      });
      // The neighbour's version of that same degree, dashed — you can see the
      // note it is about to become before you flip.
      if (abOther != null) {
        const pc = (rootPc + abOther) % 12;
        if (!map.has(pc)) setPc(pc, labelFor(abOther, flipped ? abFrom.id : abTo.id), "ghost");
      }
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
  }, [
    mode, scaleId, chordId, degree, root, rootPc, names, parentPc, effTonicDeg, activeMode,
    abInts, abChanging, abOther, abShown, abFrom, abTo, flipped, keyScale,
  ]);

  // One shared voice for the whole app — see src/audio/engine.js.
  const play = (freq) => {
    if (muted) return;
    audioTone(freq, 0, 1.25);
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

  // The loop reads the CURRENT key and tempo through refs, so changing either
  // mid-playback takes effect without restarting the progression. Before this,
  // `parentPc` was captured when the interval started (change the key and you
  // kept hearing the old one) and every drag of the tempo slider re-ran the
  // effect, which fired a chord immediately — a whole cluster of them per drag.
  const playTriadRef = useRef(playTriad);
  playTriadRef.current = playTriad;
  const stepMsRef = useRef(stepMs);
  stepMsRef.current = stepMs;

  useEffect(() => {
    if (!playing || mode !== "progression") return;
    const p = PROGRESSIONS[progId];
    let i = chordIdx;
    let id = null;
    const tick = () => {
      const deg = p.degrees[i % p.degrees.length];
      playTriadRef.current(deg);
      setChordIdx(i % p.degrees.length);
      i += 1;
      // Re-arm each time instead of using a fixed interval: that way the tempo
      // slider changes the NEXT gap rather than restarting the progression.
      id = setTimeout(tick, stepMsRef.current);
    };
    tick();
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, mode, progId]);

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

  // Standard shared sizing (SIZES.md) so this neck matches every other page;
  // "fit" only compresses fretW, and labelDy makes room for the Hz sub-label.
  const labelW = SIZES.md.labelW;
  const openW = fit ? 30 : SIZES.md.openW;
  const baseFretW = SIZES.md.fretW;
  const fretW = fit && wrapW ? Math.max(24, Math.min(baseFretW, (wrapW - labelW - openW - 14) / FRETS)) : baseFretW;
  const geom = { ...SIZES.md, openW, fretW, labelDy: 11, headH: 18, numFs: 11 };
  const { noteX, neckW } = neckGeom(geom, FRETS);
  const stringOrder = (flipStrings ? OPEN_MIDI : [...OPEN_MIDI].reverse())
    .map((m) => names[m % 12][0])
    .join("");

  const readout = useMemo(() => {
    if (!selected) return null;
    const midi = OPEN_MIDI[selected.s] + selected.f;
    const pc = midi % 12;
    const semis = (pc - rootPc + 12) % 12;
    const inSet = engine.map.has(pc) && engine.map.get(pc).role !== "dim";
    const scaleIvs = mode === "harmony" ? keyScale : (SCALES[scaleId] ? SCALES[scaleId].ints : SCALES.major.ints);
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
  }, [selected, rootPc, names, engine, mode, scaleId, keyScale]);

  const modes = [
    { id: "note", label: "Notes", lvl: "Lv 2" },
    { id: "interval", label: "Intervals", lvl: "Lv 3" },
    { id: "scale", label: "Scales", lvl: "Lv 4" },
    { id: "chord", label: "Chords", lvl: "Lv 5" },
    { id: "harmony", label: "Harmony", lvl: "Lv 6" },
    { id: "modes", label: "Modes", lvl: "Lv 6+" },
    { id: "ab", label: "Mode A/B", lvl: "Lv 6+" },
    { id: "progression", label: "Progression", lvl: "Lv 7" },
  ];

  const why = useMemo(() => {
    if (mode === "note") return { t: "Level 2 - The Note", b: "Every note is measured against the Tonic (the Sun). The orange node is your gravity well; every other pitch is defined by its distance from it." };
    if (mode === "interval") return { t: "Level 3 - Intervals", b: "An interval is the distance between two pitches in half-steps (frets). All scales and chords are just patterns of intervals. The red node is the tritone - the exact centre of the octave." };
    if (mode === "scale") return { t: "Level 4 - Scales", b: `A scale is an engineered sequence of intervals, not a list of notes. ${SCALES[scaleId].name}: ${SCALES[scaleId].formula}. The cyan node is the 3rd - it decides major vs. minor.` };
    if (mode === "chord") return { t: "Level 5 - Chords", b: `Chords stack thirds vertically out of the scale. ${CHORDS[chordId].name}: ${CHORDS[chordId].formula}.` };
    if (mode === "ab")
      return {
        t: `${root} ${abFrom.name} vs ${root} ${abTo ? abTo.name : "—"}`,
        b: abStep
          ? `Same tonic, one note different. ${abShown.name} is ${abShown.feel}. Flip the ${abStep.fromLabel}/${abStep.toLabel} and that single note is the whole difference between the two modes — everything else stays put. Turn the drone on and play over it: without a tonic sounding underneath, a mode is just a scale shape.`
          : "Pick a mode on the ladder.",
      };
    if (mode === "modes") return { t: `Modes - ${activeMode.name}`, b: `These are the same seven notes as ${parentRoot} major. Moving the nucleus (the Sun) to degree ${effTonicDeg + 1} re-spells everything: ${activeMode.name} is ${activeMode.quality}, and its signature colour comes from the ${activeMode.charName} - the violet node.` };
    if (mode === "progression") return { t: "Soloing over the changes", b: `Don't wander one scale over a whole song. Over ${parentRoot} major's ${prog.name}, play each chord's mode: the same notes, but the Sun (and the numbers) jump to the current chord's root.` };
    return keyMode === "minor"
      ? { t: "Level 6 - Harmony (minor key)", b: "The same stacking, on a minor scale: i ii° bIII iv v bVI bVII. Note the v is MINOR — natural minor has no leading tone, so its dominant barely pulls. That is exactly why harmonic minor exists, and why most minor-key songs raise the 7 to play a real V7." }
      : { t: "Level 6 - Harmony", b: "Stack thirds on every degree of the major scale and you get a fixed map: I ii iii IV V vi vii. The V chord carries the b7 of the key and pulls hardest back toward I." };
  }, [mode, scaleId, chordId, activeMode, parentRoot, effTonicDeg, prog, root, abFrom, abTo, abStep, abShown, keyMode]);

  const triadName = useMemo(() => {
    if (mode !== "harmony") return null;
    const tPc = (rootPc + keyScale[degree]) % 12;
    const d = diaMap[degree];
    return `${d.rn} - ${names[tPc]} ${d.q} · ${FUNCTION_NAME[d.fn]} — ${d.why}`;
  }, [mode, degree, rootPc, names, keyScale, diaMap]);

  return (
    <div className="page">
      <style>{`
        .bp-info{ position: relative; display: inline-flex; cursor: help; margin-left: 5px; vertical-align: middle; }
        .bp-info-dot{ width: 14px; height: 14px; border-radius: 999px; border: 1px solid var(--muted); color: var(--muted);
          font-size: 9px; font-weight: 700; font-style: italic; display: flex; align-items: center; justify-content: center;
          font-family: ui-monospace, monospace; transition: all .15s; }
        .bp-info:hover .bp-info-dot, .bp-info:focus-within .bp-info-dot{ border-color: var(--ink); color: var(--ink); }
        .bp-info-pop{ position: absolute; bottom: calc(100% + 9px); left: 50%; z-index: 60;
          transform: translate(-50%, 7px) scale(.96); transform-origin: bottom center;
          width: max-content; max-width: 230px; background: var(--pop-bg); color: var(--ink);
          border: 1.5px solid var(--line); border-radius: 6px; padding: 9px 11px;
          font-family: ui-monospace, monospace; font-size: 11px; line-height: 1.55; letter-spacing: .2px;
          text-transform: none; box-shadow: 0 8px 24px rgba(0,0,0,.35); white-space: normal;
          opacity: 0; pointer-events: none; transition: opacity .17s ease, transform .17s cubic-bezier(.34,1.4,.5,1); }
        .bp-info-pop::after{ content:""; position:absolute; top:100%; left:50%; transform:translateX(-50%);
          border:5px solid transparent; border-top-color: var(--line); }
        .bp-info-pop.on{ opacity: 1; transform: translate(-50%, 0) scale(1); }
        .bp-row{ display:flex; flex-wrap: wrap; gap: 18px; }
        .bp-fld{ display:flex; justify-content:space-between; gap:12px; padding:5px 0;
          border-bottom: 1px dashed var(--grid); font-family: ui-monospace, monospace; font-size: 12.5px; }
        .bp-fld span:first-child{ color: var(--muted); letter-spacing:.4px; }
        .bp-fld span:last-child{ font-weight:700; }
        @media (max-width: 760px){ .bp-stack{ flex-direction: column; } }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="eyebrow">Guitar Theory Coach · 01</div>
          <h1 className="page-title">THE FRETBOARD DECODER</h1>
          <p className="page-sub">Music is the language. The guitar is the machine. — decode it.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className={"btn" + (flipStrings ? " on" : "")} onClick={() => setFlipStrings((v) => !v)} aria-pressed={flipStrings} title="Flip the vertical order of the strings">
            ⇅ {stringOrder}
          </button>
          <button className={"btn" + (fit ? " on" : "")} onClick={() => setFit((v) => !v)} aria-pressed={fit} title="Compress fret spacing to fit the screen">⤢ fit</button>
          <button className={"btn" + (rainbow ? " on" : "")} onClick={() => setRainbow((v) => !v)} aria-pressed={rainbow} title="Colour each scale degree (Roy G Biv); root = red">🌈 colors</button>
          <button className={"btn" + (boxOn ? " on" : "")} onClick={() => setBoxOn((v) => !v)} aria-pressed={boxOn} title="Lock to one 5-fret box (stay in position)">▢ box</button>
          {boxOn && (
            <label className="btn" style={{ display: "flex", alignItems: "center", gap: 6, cursor: "default" }}>
              box @ {boxStart}
              <input type="range" min="0" max={FRETS - 4} value={boxStart} onChange={(e) => setBoxStart(Number(e.target.value))} />
            </label>
          )}
          <button className="btn" onClick={() => setMuted((m) => !m)} aria-pressed={muted}>
            {muted ? "♪ sound off" : "♪ sound on"}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Mode — the levels of pitch<Info text="Notes/Intervals show all 12 pitches. Scales lights a scale to solo over. Modes & Progression keep the SAME notes and just move the root." /></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {modes.map((m) => (
              <button key={m.id} className={"btn" + (mode === m.id ? " on" : "")} onClick={() => setMode(m.id)}>
                {m.label} <span style={{ opacity: 0.6, fontSize: 10 }}>{m.lvl}</span>
              </button>
            ))}
          </div>
        </div>

        {!isModal && (
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Root / Tonic — the Sun<Info text="The key centre — every note number and colour is measured from this root. Try the 🌈 colors and ▢ box toggles up top." /></div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {ROOTS.map((r) => (
                <button key={r} className={"chip" + (r === root ? " on" : "")} onClick={() => setRoot(r)}>{r}</button>
              ))}
            </div>
          </div>
        )}

        {mode === "scale" && (
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Scale</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Object.entries(SCALES).map(([id, s]) => (
                <button key={id} className={"btn" + (scaleId === id ? " on" : "")} onClick={() => setScaleId(id)}>{s.name}</button>
              ))}
            </div>
          </div>
        )}

        {mode === "chord" && (
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Chord quality</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Object.entries(CHORDS).map(([id, ch]) => (
                <button key={id} className={"btn" + (chordId === id ? " on" : "")} onClick={() => setChordId(id)}>
                  {root}{ch.sym} · {ch.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === "harmony" && (
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              Diatonic chord ({root} {KEY_MODES[keyMode].name.toLowerCase()} key)
              <Info text="Stack thirds on every degree of the key and you get a fixed map of chords. Minor keys have their own map — half the songs in the library are in one." />
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {Object.entries(KEY_MODES).map(([id, m]) => (
                <button key={id} className={"chip" + (keyMode === id ? " on" : "")} onClick={() => { setKeyMode(id); setDegree(0); }}>{m.name}</button>
              ))}
              <span style={{ width: 8 }} />
              {diaMap.map((d, i) => (
                <button key={i} className={"btn" + (degree === i ? " on" : "")} onClick={() => setDegree(i)} title={`${FUNCTION_NAME[d.fn]} — ${d.why}`}>
                  {d.rn} <span style={{ opacity: 0.6, fontSize: 10 }}>{d.q} · {d.fn}</span>
                </button>
              ))}
            </div>
            {triadName && <div className="mono" style={{ marginTop: 8, color: C.sun, fontSize: 13, fontWeight: 700 }}>▶ {triadName}</div>}
          </div>
        )}

        {mode === "modes" && (
          <>
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Parent key — the master scale (the seven notes never change)</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {ROOTS.map((r) => (
                  <button key={r} className={"chip" + (r === parentRoot ? " on" : "")} onClick={() => setParentRoot(r)}>{r}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Mode — move the nucleus · in order, Ionian → Locrian (1–7)</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[0, 1, 2, 3, 4, 5, 6].map((deg) => {
                  const m = MODE_BY_DEGREE[deg];
                  const tPc = (parentPc + SCALES.major.ints[deg]) % 12;
                  return (
                    <button key={m.id} className={"btn" + (tonicDegree === deg ? " on" : "")} onClick={() => setTonicDegree(deg)} title={`Mode ${deg + 1} — ${m.name}: ${m.quality}, characteristic note ${m.charName}`}>
                      <span style={{ opacity: 0.5, fontSize: 10, marginRight: 3 }}>{deg + 1}</span>
                      {parentNames[tPc]} {m.name}
                    </button>
                  );
                })}
              </div>
              <div className="mono" style={{ marginTop: 8, color: C.sun, fontSize: 13, fontWeight: 700 }}>
                ▶ {tonicName} {activeMode.name}
                <span style={{ color: C.muted, fontWeight: 400 }}> · {activeMode.quality} · flavour note: </span>
                <span style={{ color: C.violet }}>{activeMode.charName}</span>
              </div>
            </div>
          </>
        )}

        {mode === "ab" && (
          <>
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                The brightness ladder — every step down flattens exactly one note
              </div>
              <div className="ab-ladder">
                {MODE_LADDER.map((m, i) => {
                  const here = m.id === abShown.id;
                  const other = abTo && m.id === (flipped ? abFrom.id : abTo.id);
                  const step = i < MODE_LADDER.length - 1 ? neighbourStep(m.id, 1) : null;
                  return (
                    <React.Fragment key={m.id}>
                      <button
                        className={"ab-rung" + (here ? " on" : "") + (other ? " other" : "")}
                        onClick={() => {
                          setLadderId(m.id);
                          setFlipped(false);
                        }}
                        title={`${root} ${m.name} — ${m.feel}`}
                      >
                        <span className="n">{m.name}</span>
                        <span className="q">{m.quality}</span>
                      </button>
                      {step && (
                        <span className="ab-gap" aria-hidden="true">
                          {step.fromLabel}→{step.toLabel}
                        </span>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {abStep && abTo && (
              <div className="ab-flip">
                <button
                  className={"ab-side" + (!flipped ? " on" : "")}
                  onClick={() => setFlipped(false)}
                  title={abFrom.feel}
                >
                  <span className="m">{root} {abFrom.name}</span>
                  <span className="d">{abStep.fromLabel}</span>
                </button>

                <button
                  className="ab-swap"
                  onClick={() => setFlipped((v) => !v)}
                  title="Flip the one note that separates these two modes"
                  aria-label="Flip between the two modes"
                >
                  <span className="deg">{abStep.degree}</span>
                  <span className="lab">flip the {abStep.degree}</span>
                </button>

                <button
                  className={"ab-side" + (flipped ? " on" : "")}
                  onClick={() => setFlipped(true)}
                  title={abTo.feel}
                >
                  <span className="m">{root} {abTo.name}</span>
                  <span className="d">{abStep.toLabel}</span>
                </button>

                <div className="ab-actions">
                  <button
                    className="btn"
                    onClick={() => {
                      if (muted) return;
                      // Tonic alone, then the tonic WITH the note that changes.
                      // Heard on its own the note means nothing; the colour only
                      // exists relative to the root. Scheduled on the audio
                      // clock rather than with timers — nothing to clean up.
                      const base = 60 + rootPc;
                      audioTone(midiToFreq(base), 0, 1.1);
                      audioTone(midiToFreq(base), 0.75, 1.6);
                      audioTone(midiToFreq(base + abChanging), 0.75, 1.6);
                    }}
                    title="Hear the tonic, then the tonic together with the note that changes"
                  >
                    ♪ hear it
                  </button>
                  <button
                    className={"btn" + (drone.on ? " on" : "")}
                    onClick={() => (drone.on ? drone.stop() : drone.start())}
                    title="Hold the tonic underneath — a mode means nothing without one"
                  >
                    ♁ {drone.on ? "drone on" : "hold the tonic"}
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      // Come back to the rung you picked rather than leaping
                      // from one neighbour to the one on the far side.
                      setFlipDir((d) => -d);
                      setFlipped(false);
                    }}
                    title="Compare against the neighbour on the other side"
                    style={{ padding: "5px 8px" }}
                  >
                    ⇅ compare {abDir === 1 ? "darker" : "brighter"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {mode === "progression" && (
          <>
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Key</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {ROOTS.map((r) => (
                  <button key={r} className={"chip" + (r === parentRoot ? " on" : "")} onClick={() => setParentRoot(r)}>{r}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Progression — same notes, the mode shifts with every chord</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {Object.entries(PROGRESSIONS).map(([id, p]) => (
                  <button key={id} className={"btn" + (progId === id ? " on" : "")} onClick={() => { setProgId(id); setChordIdx(0); }}>{p.name}</button>
                ))}
                <button className={"btn" + (playing ? " on" : "")} onClick={() => setPlaying((v) => !v)} style={{ marginLeft: 6 }}>
                  {playing ? "■ stop" : "▶ play"}
                </button>
                <label className="mono" style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 6 }}>
                  tempo
                  <input type="range" min="700" max="3000" step="100" value={stepMs} onChange={(e) => setStepMs(Number(e.target.value))} />
                  <span style={{ minWidth: 74 }}>1 chord / {(stepMs / 1000).toFixed(1)}s</span>
                </label>
                {met && (
                  <>
                    {/* One chord per bar, locked to the metronome at the bottom of the screen. */}
                    <button
                      className="btn"
                      style={{ padding: "5px 8px" }}
                      onClick={() => setStepMs(Math.round(met.barSeconds() * 1000))}
                      title={`One chord per bar at ${met.bpm} BPM (${met.beatsPerBar}/4)`}
                    >
                      ⟵ from click
                    </button>
                    <button
                      className="btn"
                      style={{ padding: "5px 8px" }}
                      onClick={() => met.setFromBpm((60000 * met.beatsPerBar) / stepMs, { start: true })}
                      title="Start the click at this progression's tempo"
                    >
                      → to click
                    </button>
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                {prog.degrees.map((deg, i) => {
                  const m = MODE_BY_DEGREE[deg];
                  const cPc = (parentPc + SCALES.major.ints[deg]) % 12;
                  const q = DIATONIC[deg].q;
                  const sym = q === "min" ? "m" : q === "dim" ? "°" : "";
                  const active = playing && i === chordIdx % prog.degrees.length;
                  return (
                    <div key={i} className="mono" style={{ padding: "6px 10px", borderRadius: 3, fontSize: 12, border: `1.5px solid ${active ? C.sun : C.line}`, background: active ? "rgba(255,122,46,.16)" : "var(--surface-lo)", color: active ? C.sun : C.ink, fontWeight: active ? 700 : 400, transition: "all .2s ease" }}>
                      {DIATONIC[deg].rn} · {parentNames[cPc]}{sym} → {m.name}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      <div ref={wrapRef} style={{ marginTop: 20 }}>
        <Neck
          root={root}
          frets={FRETS}
          geom={geom}
          flip={flipStrings}
          slide
          stringGauge
          inlays="double"
          boxes={[boxOn && { start: boxStart, color: C.muted, bg: "var(--surface)" }]}
          stringLabel={(m) => {
            const oct = Math.floor(m / 12) - 1;
            return (
              <>
                <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: C.ink, lineHeight: 1.1 }}>{names[m % 12]}{oct}</div>
                <div className="mono" style={{ fontSize: 8, color: C.muted }}>{midiToFreq(m).toFixed(2)} Hz</div>
              </>
            );
          }}
          header={
            <div style={{ position: "relative", height: 26, marginLeft: labelW }}>
              <div style={{ position: "absolute", left: noteX(0), right: neckW - (openW + 12 * fretW), top: 12, height: 0, borderTop: `1.5px solid ${C.cyan}` }} />
              <div style={{ position: "absolute", left: noteX(0), top: 6, width: 1, height: 12, background: C.cyan }} />
              <div style={{ position: "absolute", left: openW + 12 * fretW, top: 6, width: 1, height: 12, background: C.cyan }} />
              <div className="mono" style={{ position: "absolute", left: noteX(0) + 40, top: 0, fontSize: 10, color: C.cyan, letterSpacing: 1 }}>OCTAVE RANGE — 12 FRETS</div>
            </div>
          }
          onTap={(midi, { s, f }) => handleClick(s, f)}
          resolve={(pc, semis, { s, f, names: nm }) => {
            const hit = engine.map.get(pc);
            const inBox = !boxOn || (f >= boxStart && f <= boxStart + 4);
            if (!((engine.showAll || !!hit) && inBox)) return null;
            const role = hit ? hit.role : "note";
            const label = hit ? hit.label : nm[pc];
            const rbBase = rainbow && mode !== "note" && mode !== "interval" && role !== "dim" ? degBase(label) : null;
            const st = rbBase && RAINBOW[rbBase] ? RAINBOW[rbBase] : (ROLE_STYLE[role] || ROLE_STYLE.note);
            const isSel = selected && selected.s === s && selected.f === f;
            const isRoot = role === "root";
            const baseSize = Math.max(14, Math.min(21, fretW - 8)); // NODE.md, shrinks with "fit"
            return {
              label,
              ...st,
              dashed: role === "ghost",
              opacity: role === "ghost" ? 0.55 : 1,
              size: isRoot ? baseSize + 2 : baseSize,
              fontSize: label.length > 2 ? 9 : 10,
              boxShadow: isRoot ? "0 0 0 3px rgba(255,122,46,.32)" : "none",
              outline: isSel ? `2px dashed ${C.ink}` : undefined,
              zIndex: isSel ? 5 : 2,
              title: `${nm[pc]} · string ${s + 1} fret ${f}`,
            };
          }}
        />
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Legend color={C.sun} label="Root / Tonic (the Sun)" />
        <Legend color={C.cyan} label="The 3rd (major / minor decider)" />
        <Legend color={C.blue} label="Chord / scale tone" />
        {mode === "interval" && <Legend color={C.red} label="Tritone (centre of the octave)" />}
        {mode === "harmony" && <Legend color={"rgba(28,92,140,0.3)"} label="Other notes in the key" />}
        {isModal && <Legend color={C.violet} label="Characteristic note (the mode's flavour)" />}
        {mode === "ab" && <Legend color={C.violet} label="The one note that changes — dashed = where it moves to" />}
        {rainbow && (
          <span className="mono" style={{ fontSize: 11, color: C.muted }}>
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
        <div className="card" style={{ flex: "1 1 280px", minWidth: 260 }}>
          <Ticks />
          <div className="eyebrow" style={{ marginBottom: 8 }}>Spec readout</div>
          {!readout ? (
            <div className="mono" style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
              Tap any node on the neck to measure it. Every pitch is defined by its distance from the Tonic.
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
                <div className="mono" style={{ fontSize: 30, fontWeight: 700, color: readout.inSet ? C.sun : C.ink }}>
                  {readout.name}<span style={{ fontSize: 14, color: C.muted }}>{readout.octave}</span>
                </div>
                {readout.degreeInScale && (
                  <span className="mono" style={{ fontSize: 13, padding: "2px 8px", border: `1.5px solid ${C.sun}`, color: C.sun, borderRadius: 3 }}>degree {readout.degreeInScale}</span>
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

        <div className="card" style={{ flex: "1 1 280px", minWidth: 260, background: "rgba(62,155,214,.10)" }}>
          <Ticks />
          <div className="eyebrow" style={{ marginBottom: 8, color: C.blue }}>The "why" — play dumb, then explain it</div>
          <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 6 }}>{why.t}</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.65, color: C.ink }}>{why.b}</div>
        </div>
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
      <span className="mono" style={{ fontSize: 11.5, color: C.ink }}>{label}</span>
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
