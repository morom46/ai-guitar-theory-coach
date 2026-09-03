/**
 * THE SOLO SCHEMA — a phrase, written down.
 *
 * A solo is a list of notes placed in BEATS, not seconds. Seconds are derived
 * at schedule time through the tempo map, which is what makes speed control
 * and tempo changes free: scale the map, the beats never move.
 *
 * Everything here is pure. No React, no AudioContext, no DOM — so the timing
 * arithmetic the whole module rests on can be unit tested with no audio device
 * present (test/soloSchema.test.js), exactly like src/audio/clock.js.
 *
 * CONVENTIONS, stated once and obeyed everywhere:
 *
 *   string   index into OPEN_MIDI — 0 = high E, 5 = low E, matching Neck and
 *            pitch.js. NOT the "6 = low E" of tab numbering.
 *   beat     one quarter note, ALWAYS. A bar is therefore `num * 4 / den` of
 *            them: 4/4 is four, 3/4 is three, 7/8 is three and a half. `den`
 *            used to be display only, which quietly made every bar of a x/8
 *            document twice as long as it sounds — Slow Dancing's one 7/8 bar
 *            is what turned that up.
 *   tuningMidi  open-string MIDI numbers, HIGH to LOW, matching OPEN_MIDI.
 *            MIDI and not note names on purpose: ["E","A","D","G","B","E"] and
 *            ["E","B","G","D","A","E"] have the same first and last entry, and
 *            a silently reversed neck is a miserable bug to find.
 */

import { OPEN_MIDI, CHORDS, DEG, LETTER_PC, noteNameToPc, SCALES } from "../theory/engine.js";

const norm = (n) => (((n % 12) + 12) % 12);
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const round2 = (n) => Math.round(n * 100) / 100;

export const SCHEMA_VERSION = 1;

/** Playing techniques. `needs` names the extra field the technique reads. */
export const TECHNIQUES = {
  pick: { name: "Pick", glyph: "", needs: null },
  hammer: { name: "Hammer-on", glyph: "H", needs: null },
  pull: { name: "Pull-off", glyph: "P", needs: null },
  slide: { name: "Slide", glyph: "/", needs: "slideToFret" },
  bend: { name: "Bend", glyph: "↑", needs: "bendSemitones" },
  release: { name: "Release", glyph: "↓", needs: "bendSemitones" },
  vibrato: { name: "Vibrato", glyph: "~", needs: null },
  tap: { name: "Tap", glyph: "T", needs: null },
  harmonic: { name: "Harmonic", glyph: "◇", needs: null },
  mute: { name: "Muted", glyph: "✕", needs: null },
};

export const STANDARD_TUNING = [...OPEN_MIDI];

/* ================================================================== */
/* THE TEMPO MAP                                                      */
/* ================================================================== */

/**
 * Turn a tempo list into segments with their start time pre-summed.
 *
 * The prefix sum is the point: rendering asks "given this audio-clock second,
 * which beat am I on" on EVERY frame, and without precomputed boundaries that
 * is a walk over the tempo list per frame.
 *
 * `rate` is the speed control (0.25 = quarter speed). It divides into the
 * tempo rather than editing it, so `bpm` stays the written tempo and the
 * display can show both ("92 at 50% = 46").
 */
export function buildTempoMap(tempo, { rate = 1 } = {}) {
  const r = rate > 0 ? rate : 1;
  const src = (Array.isArray(tempo) && tempo.length ? tempo : [{ atBeat: 0, bpm: 90 }])
    .map((t) => ({ atBeat: Math.max(0, num(t.atBeat, 0)), bpm: Math.max(1, num(t.bpm, 90)) }))
    .sort((a, b) => a.atBeat - b.atBeat);
  if (src[0].atBeat !== 0) src.unshift({ atBeat: 0, bpm: src[0].bpm });

  const segs = [];
  src.forEach((t, i) => {
    const secPerBeat = 60 / (t.bpm * r);
    let atSec = 0;
    if (i > 0) {
      const prev = segs[i - 1];
      atSec = prev.atSec + (t.atBeat - prev.atBeat) * prev.secPerBeat;
    }
    segs.push({ atBeat: t.atBeat, bpm: t.bpm, secPerBeat, atSec });
  });
  return segs;
}

function segAtBeat(map, beat) {
  let seg = map[0];
  for (let i = 1; i < map.length; i++) {
    if (map[i].atBeat <= beat) seg = map[i];
    else break;
  }
  return seg;
}

function segAtSec(map, sec) {
  let seg = map[0];
  for (let i = 1; i < map.length; i++) {
    if (map[i].atSec <= sec) seg = map[i];
    else break;
  }
  return seg;
}

/**
 * Beat -> transport seconds. Extrapolates below beat 0 through the first
 * segment, which is what puts the count-in bars on the right grid.
 */
export function beatToSec(map, beat) {
  const b = num(beat, 0);
  const seg = b < 0 ? map[0] : segAtBeat(map, b);
  return seg.atSec + (b - seg.atBeat) * seg.secPerBeat;
}

/** Transport seconds -> beat. The inverse, called once per rendered frame. */
export function secToBeat(map, sec) {
  const s = num(sec, 0);
  const seg = s < 0 ? map[0] : segAtSec(map, s);
  return seg.atBeat + (s - seg.atSec) / seg.secPerBeat;
}

/** The tempo written at a beat — for the display, not the maths. */
export function bpmAtBeat(map, beat) {
  return segAtBeat(map, num(beat, 0)).bpm;
}

/* ================================================================== */
/* BARS                                                               */
/* ================================================================== */

const sigList = (timeSig) =>
  Array.isArray(timeSig) && timeSig.length ? timeSig : [{ atBeat: 0, num: 4, den: 4 }];

/**
 * How many quarter-note beats one bar of this signature lasts.
 *
 * The single place the meaning of `den` lives. For every x/4 it is just `num`,
 * which is why this went unnoticed until a document arrived with a 7/8 bar.
 */
const barBeats = (sig) => Math.max(0.25, (num(sig.num, 4) * 4) / Math.max(1, num(sig.den, 4)));

/** Beats per bar at a given beat. */
export function beatsPerBarAt(timeSig, beat) {
  const b = num(beat, 0);
  let sig = sigList(timeSig)[0];
  sigList(timeSig).forEach((t) => {
    if (num(t.atBeat, 0) <= b) sig = t;
  });
  return barBeats(sig);
}

/** Bar number (0-based) and the beat inside it. Negative beats count in. */
export function barAtBeat(timeSig, beat) {
  const b = num(beat, 0);
  const list = sigList(timeSig);
  let bar = 0;
  let cursor = 0;
  for (let i = 0; i < list.length; i++) {
    const per = barBeats(list[i]);
    const segStart = Math.max(cursor, num(list[i].atBeat, 0));
    const next = i + 1 < list.length ? num(list[i + 1].atBeat, Infinity) : Infinity;
    if (b < next) {
      const span = b - segStart;
      return { bar: bar + Math.floor(span / per), beatInBar: ((span % per) + per) % per };
    }
    bar += Math.floor((next - segStart) / per);
    cursor = next;
  }
  return { bar, beatInBar: 0 };
}

/** The beat a bar line falls on (0-based bar index). */
export function beatAtBar(timeSig, bar) {
  const list = sigList(timeSig);
  let bars = 0;
  let beats = 0;
  for (let i = 0; i < list.length; i++) {
    const per = barBeats(list[i]);
    const segStart = Math.max(beats, num(list[i].atBeat, 0));
    const next = i + 1 < list.length ? num(list[i + 1].atBeat, Infinity) : Infinity;
    const barsHere = next === Infinity ? Infinity : Math.floor((next - segStart) / per);
    if (bars + barsHere > bar) return segStart + (bar - bars) * per;
    bars += barsHere;
    beats = next;
  }
  return beats;
}

/* ================================================================== */
/* CHORD SYMBOLS                                                      */
/* ================================================================== */

// Suffix -> a quality id in the theory engine's CHORDS table. Extensions
// collapse onto their parent seventh: a 9th is a 7th chord with one more
// colour tone, and for "which degree am I playing" that is the right answer.
const SUFFIX = {
  "": "maj", M: "maj", maj: "maj", major: "maj", 6: "maj", add9: "maj", sus2: "maj", sus4: "maj", sus: "maj", "6/9": "maj",
  m: "min", min: "min", "-": "min", minor: "min", m6: "min", madd9: "min",
  maj7: "maj7", M7: "maj7", "Δ7": "maj7", "Δ": "maj7", maj9: "maj7", M9: "maj7", maj13: "maj7",
  7: "dom7", 9: "dom7", 11: "dom7", 13: "dom7", "7sus4": "dom7", "7sus": "dom7",
  "7b9": "dom7", "7#9": "dom7", "7b5": "dom7", "7#5": "dom7", "7alt": "dom7",
  m7: "min7", min7: "min7", "-7": "min7", m9: "min7", m11: "min7", m13: "min7",
  dim: "dim", "°": "dim", o: "dim", dim7: "dim", "°7": "dim",
  aug: "aug", "+": "aug", "+5": "aug", "#5": "aug",
  m7b5: "m7b5", "m7♭5": "m7b5", "ø": "m7b5", "ø7": "m7b5", min7b5: "m7b5", "-7b5": "m7b5",
};

/**
 * "Am7" / "C#maj7" / "Bb7#9" / "Am7/C"  ->  { rootPc, quality, bassPc, sym }
 * Returns null for anything unparseable so callers can fall back to the key.
 */
export function parseChordSymbol(sym) {
  if (typeof sym !== "string") return null;
  const raw = sym.trim();
  if (!raw) return null;
  const [head, bass] = raw.split("/");
  const m = /^([A-Ga-g])([#b♯♭]{0,2})(.*)$/.exec(head.trim());
  if (!m) return null;
  const letter = m[1].toUpperCase();
  if (!(letter in LETTER_PC)) return null;
  const acc = m[2].replace(/♯/g, "#").replace(/♭/g, "b");
  const rootPc = noteNameToPc(letter + acc);
  const suffix = m[3].trim();
  let quality = SUFFIX[suffix];
  if (!quality) {
    // Unknown extension: fall back on the two things that actually change the
    // colouring — is there a minor third, and is there a seventh.
    const minorish = /^(m|min|-)(?!aj)/.test(suffix);
    const seventh = /7|9|11|13/.test(suffix);
    quality = minorish ? (seventh ? "min7" : "min") : seventh ? "dom7" : "maj";
  }
  let bassPc = null;
  if (bass) {
    const bm = /^([A-Ga-g])([#b♯♭]{0,2})$/.exec(bass.trim());
    if (bm) bassPc = noteNameToPc(bm[1].toUpperCase() + bm[2].replace(/♯/g, "#").replace(/♭/g, "b"));
  }
  return { rootPc, quality, bassPc, sym: raw };
}

/* ================================================================== */
/* READING A SOLO                                                     */
/* ================================================================== */

/** MIDI number of a note, through the solo's tuning and capo. */
export function noteMidi(note, meta = {}) {
  const tuning =
    Array.isArray(meta.tuningMidi) && meta.tuningMidi.length === 6 ? meta.tuningMidi : STANDARD_TUNING;
  const s = Math.max(0, Math.min(5, num(note.string, 0)));
  return tuning[s] + num(note.fret, 0) + num(meta.capo, 0);
}

/** The harmony entry sounding at a beat (the last one at or before it). */
export function harmonyAt(solo, beat) {
  const list = solo && solo.harmony;
  if (!Array.isArray(list) || !list.length) return null;
  const b = num(beat, 0);
  let cur = null;
  list.forEach((h) => {
    if (num(h.atBeat, 0) <= b) cur = h;
  });
  return cur;
}

/** The section containing a beat. */
export function sectionAt(solo, beat) {
  const b = num(beat, 0);
  return ((solo && solo.sections) || []).find((s) => b >= num(s.startBeat, 0) && b < num(s.endBeat, 0)) || null;
}

/**
 * THE COLOUR DECISION, in one place.
 *
 * Degree of a note against whatever is sounding under it: the chord if the
 * solo has harmony, the key if it does not. Everything downstream — ring
 * colour, label, the inspector — reads this and nothing else, which is why a
 * harmony change re-colours the neck for free.
 */
export function degreeOf(note, solo, beat) {
  const meta = (solo && solo.meta) || {};
  const pc = norm(noteMidi(note, meta));
  const h = harmonyAt(solo, beat != null ? beat : num(note.startBeat, 0));
  const chord = h ? parseChordSymbol(h.chord) : null;
  const keyPc = noteNameToPc(meta.key || "C");
  const rootPc = chord ? chord.rootPc : keyPc;
  const semis = norm(pc - rootPc);
  const keySemis = norm(pc - keyPc);
  return {
    pc,
    semis,
    label: DEG[semis],
    rootPc,
    quality: chord ? chord.quality : null,
    chordSym: chord ? chord.sym : null,
    keySemis,
    keyLabel: DEG[keySemis],
  };
}

/* ================================================================== */
/* NORMALISE + VALIDATE                                               */
/* ================================================================== */

let autoId = 0;
const nextId = () => "n" + (++autoId).toString(36) + Math.random().toString(36).slice(2, 5);

/**
 * Fill in every optional field so downstream code never duck-types a note.
 * These shapes are what a TypeScript migration turns into types: every field
 * present, every field one type, null rather than undefined for "absent".
 */
export function normaliseSolo(input) {
  const src = input && typeof input === "object" ? input : {};
  const meta = src.meta || {};
  const mode = String(meta.mode || "aeolian");
  return {
    version: SCHEMA_VERSION,
    id: String(src.id || "s" + Math.random().toString(36).slice(2, 8)),
    meta: {
      title: String(meta.title || "Untitled"),
      artist: String(meta.artist || "Original"),
      key: String(meta.key || "A"),
      mode,
      scaleId: SCALES[meta.scaleId] ? meta.scaleId : SCALES[mode] ? mode : "aeolian",
      tuningMidi:
        Array.isArray(meta.tuningMidi) && meta.tuningMidi.length === 6
          ? meta.tuningMidi.map((m) => num(m, 0))
          : [...STANDARD_TUNING],
      capo: num(meta.capo, 0),
      note: String(meta.note || ""),
      // Where the frets came from. These are entered from published tabs, so
      // the useful thing to record is WHICH one — not a warning. This replaced
      // a `verified`/`unverified` pair that flew an alarm banner over every
      // document; the alarm was answering a question nobody was asking of a
      // tab off a tab site, and it buried the one fact worth keeping.
      source: String(meta.source || ""),
      // Which songs in the library this belongs to (ids from data/songs.js) —
      // what lets Songs & Tones offer the solo from that song's Solo section
      // instead of leaving it a dead end.
      songIds: Array.isArray(meta.songIds) ? meta.songIds.map(String) : [],
    },
    tempo: (Array.isArray(src.tempo) && src.tempo.length ? src.tempo : [{ atBeat: 0, bpm: 90 }])
      .map((t) => ({ atBeat: Math.max(0, num(t.atBeat, 0)), bpm: Math.max(1, num(t.bpm, 90)) }))
      .sort((a, b) => a.atBeat - b.atBeat),
    timeSig: (Array.isArray(src.timeSig) && src.timeSig.length ? src.timeSig : [{ atBeat: 0, num: 4, den: 4 }])
      .map((t) => ({
        atBeat: Math.max(0, num(t.atBeat, 0)),
        num: Math.max(1, num(t.num, 4)),
        den: Math.max(1, num(t.den, 4)),
      }))
      .sort((a, b) => a.atBeat - b.atBeat),
    sections: (src.sections || []).map((s, i) => ({
      id: String(s.id || "sec" + i),
      name: String(s.name || "Section " + (i + 1)),
      startBeat: num(s.startBeat, 0),
      endBeat: num(s.endBeat, 0),
    })),
    harmony: (src.harmony || [])
      .map((h) => ({ atBeat: num(h.atBeat, 0), chord: String(h.chord || "") }))
      .sort((a, b) => a.atBeat - b.atBeat),
    notes: (src.notes || [])
      .map((n) => ({
        id: String(n.id || nextId()),
        startBeat: num(n.startBeat, 0),
        durBeats: Math.max(0.05, num(n.durBeats, 0.5)),
        string: Math.max(0, Math.min(5, num(n.string, 0))),
        fret: Math.max(0, num(n.fret, 0)),
        technique: TECHNIQUES[n.technique] ? n.technique : "pick",
        slideToFret: n.slideToFret == null ? null : num(n.slideToFret, 0),
        bendSemitones: n.bendSemitones == null ? null : num(n.bendSemitones, 0),
        finger: [1, 2, 3, 4].includes(num(n.finger, 0)) ? num(n.finger, 0) : null,
        accent: !!n.accent,
      }))
      .sort((a, b) => a.startBeat - b.startBeat || a.string - b.string),
  };
}

/**
 * Check a solo before it is played. Errors mean "cannot render this";
 * warnings mean "this will render, but not the way you meant".
 */
export function validateSolo(input) {
  const errors = [];
  const warnings = [];
  const solo = normaliseSolo(input);

  if (!solo.notes.length) errors.push("Solo has no notes.");
  if (!solo.tempo.length || solo.tempo[0].atBeat !== 0) errors.push("Tempo map must start at beat 0.");

  if (!(solo.meta.key[0] in LETTER_PC)) errors.push('Unreadable key "' + solo.meta.key + '".');

  const std = solo.meta.tuningMidi.every((m, i) => m === STANDARD_TUNING[i]);
  if (!std)
    warnings.push("Non-standard tuning: the schema carries it, but the shared <Neck> draws standard tuning only.");
  if (solo.meta.capo !== 0) warnings.push("Capo is carried in the schema but the neck draws absolute frets.");

  solo.notes.forEach((n) => {
    if (n.fret > 24) errors.push("Note " + n.id + ": fret " + n.fret + " is off the 24-fret neck.");
    if (n.technique === "slide" && n.slideToFret == null)
      warnings.push("Note " + n.id + ": slide with no slideToFret — drawn as a pick.");
    if ((n.technique === "bend" || n.technique === "release") && !n.bendSemitones)
      warnings.push("Note " + n.id + ": " + n.technique + " with no bendSemitones — drawn as a pick.");
  });

  solo.harmony.forEach((h) => {
    if (!parseChordSymbol(h.chord))
      warnings.push('Chord "' + h.chord + '" at beat ' + h.atBeat + " is unreadable — falling back to the key.");
  });

  solo.sections.forEach((s) => {
    if (s.endBeat <= s.startBeat) warnings.push('Section "' + s.name + '" ends at or before it starts.');
  });

  return { ok: errors.length === 0, errors, warnings, solo };
}

/**
 * The repeating chord loop, if the harmony is one — otherwise null.
 *
 * A solo written over a real song's vamp does not have seventy-five different
 * chords, it has a four- or eight-bar loop played nineteen times. Seventy-five
 * labels on the timeline is that fact rendered as noise; the loop, named once,
 * is the same fact rendered as information.
 *
 * Returns the SHORTEST period that explains every entry, so a document whose
 * loop is Am–Am/G–D9/F#–F–Am–G–D–E comes back as all eight rather than as
 * some coincidental shorter cycle. A partial repeat at the end is fine — the
 * comparison is against `i % period`, which is how a vamp that stops mid-loop
 * actually behaves.
 */
export function harmonyLoop(harmony) {
  const list = (Array.isArray(harmony) ? harmony : []).map((h) => String(h && h.chord));
  if (list.length < 4) return null;
  // A period is only a claim worth making if the document actually repeats it
  // — hence at least two more entries after the first pass. Without that floor
  // a six-chord harmony would "loop" with a period of five, which is just the
  // harmony again with the last chord lopped off.
  const maxPeriod = Math.min(16, list.length - 2);
  for (let p = 1; p <= maxPeriod; p++) {
    let ok = true;
    for (let i = p; i < list.length && ok; i++) if (list[i] !== list[i % p]) ok = false;
    if (ok) return list.slice(0, p);
  }
  return null;
}

/** Last beat the solo touches — the end of the timeline. */
export function soloEndBeat(solo) {
  const fromNotes = ((solo && solo.notes) || []).reduce((m, n) => Math.max(m, n.startBeat + n.durBeats), 0);
  const fromSections = ((solo && solo.sections) || []).reduce((m, s) => Math.max(m, s.endBeat), 0);
  return Math.max(fromNotes, fromSections, 1);
}

/* ================================================================== */
/* THE AI TUTOR HOOK                                                  */
/* ================================================================== */

/**
 * Serialise a phrase into something a model can reason about.
 *
 * Deliberately text, deliberately compact, and deliberately expressed in
 * DEGREES rather than note names — the degrees are the analysis. Prompt design
 * is a separate job; this is the payload it will wrap.
 */
export function describePhrase(solo, noteIds = null) {
  const ids = noteIds && noteIds.length ? new Set(noteIds) : null;
  const notes = ((solo && solo.notes) || []).filter((n) => !ids || ids.has(n.id));
  if (!notes.length) return "";

  const last = notes[notes.length - 1];
  const from = notes[0].startBeat;
  const to = last.startBeat + last.durBeats;
  const scale = SCALES[solo.meta.scaleId];
  const lines = [];

  lines.push(
    "Key: " + solo.meta.key + " " + solo.meta.mode + (scale ? " (" + scale.name + ", " + scale.formula + ")" : "")
  );
  lines.push("Tempo: " + solo.tempo[0].bpm + " bpm. Phrase: beats " + round2(from) + "-" + round2(to) + ".");

  const chords = (solo.harmony || []).filter((h) => h.atBeat <= to && h.atBeat >= from - 4);
  if (chords.length)
    lines.push("Harmony: " + chords.map((h) => h.chord + "@" + round2(h.atBeat)).join(" "));

  lines.push("Notes (beat, string/fret, degree-vs-chord, technique):");
  notes.forEach((n) => {
    const d = degreeOf(n, solo, n.startBeat);
    const tech = n.technique === "pick" ? "" : " " + n.technique;
    const extra =
      n.technique === "slide" && n.slideToFret != null
        ? "->" + n.slideToFret
        : n.bendSemitones
        ? " " + n.bendSemitones + "st"
        : "";
    lines.push(
      "  b" + round2(n.startBeat) + " s" + (n.string + 1) + "/f" + n.fret + " " + d.label +
        (d.chordSym ? " over " + d.chordSym : "") + tech + extra
    );
  });

  const degs = [...new Set(notes.map((n) => degreeOf(n, solo, n.startBeat).label))];
  lines.push("Degrees used: " + degs.join(" "));
  return lines.join("\n");
}

/** Human sentence for one note against what is under it — the inspector. */
export function noteFunctionText(note, solo) {
  const d = degreeOf(note, solo, note.startBeat);
  const q = d.quality ? CHORDS[d.quality] : null;
  const over = d.chordSym ? " over " + d.chordSym : " in " + solo.meta.key + " " + solo.meta.mode;
  const isChordTone = q ? q.ints.map(norm).includes(d.semis) : false;
  const role = isChordTone
    ? "a chord tone — it lands"
    : d.semis === 1 || d.semis === 6 || d.semis === 8
    ? "outside colour — good passing through, tense to sit on"
    : "a scale colour tone — pretty, and left hanging";
  return d.label + over + " — " + role + ".";
}
