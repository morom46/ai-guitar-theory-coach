/**
 * THE THEORY ENGINE
 *
 * Philosophy (from the source blueprint):
 *   Music is the language. The guitar is the dumb machine.
 *   This engine decodes the machine through the six levels of pitch:
 *   Silence -> Note (the Sun) -> Intervals -> Scales -> Chords -> Harmony.
 *
 * One theory engine drives every feature. The Fretboard Decoder, ear
 * training, chord builder and number-system trainer all consume the
 * same primitives defined here.
 */

export const PC_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const PC_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
export const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
export const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const FLAT_KEYS = new Set(["F", "Bb", "Eb", "Ab", "Db", "Gb"]);

// Practical 12 roots with conventional major-key spelling.
export const ROOTS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

export const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];

// Number-system degree labels (matches the blueprint's Universal Decoder).
export const DEG = { 0: "1", 1: "b2", 2: "2", 3: "b3", 4: "3", 5: "4", 6: "b5", 7: "5", 8: "b6", 9: "6", 10: "b7", 11: "7" };

// The Interval Diagnostic Engine (one octave).
export const INTERVALS = [
  { name: "Perfect Unison", ab: "P1", feel: "Stillness" },
  { name: "Minor 2nd", ab: "m2", feel: "Tension, dread" },
  { name: "Major 2nd", ab: "M2", feel: "Forward motion" },
  { name: "Minor 3rd", ab: "m3", feel: "Sad, soft" },
  { name: "Major 3rd", ab: "M3", feel: "Bright, happy" },
  { name: "Perfect 4th", ab: "P4", feel: "Open, stable" },
  { name: "Tritone", ab: "TT", feel: "Unstable — the centre" },
  { name: "Perfect 5th", ab: "P5", feel: "Strong, hollow" },
  { name: "Minor 6th", ab: "m6", feel: "Yearning" },
  { name: "Major 6th", ab: "M6", feel: "Sweet, warm" },
  { name: "Minor 7th", ab: "m7", feel: "Bluesy pull" },
  { name: "Major 7th", ab: "M7", feel: "Sharp, shimmering" },
  { name: "Perfect Octave", ab: "P8", feel: "Same note, higher" },
  // Past the octave — the same pitch classes, but a 9th is not a 2nd: it is
  // stacked ABOVE the 7th, which is the whole point of an extended chord.
  { name: "Minor 9th", ab: "b9", feel: "Grinding — the altered dominant" },
  { name: "Major 9th", ab: "9", feel: "Open, airy" },
  { name: "Augmented 9th", ab: "#9", feel: "The Hendrix crunch" },
  { name: "Major 10th", ab: "10", feel: "The 3rd, spread wide" },
  { name: "Perfect 11th", ab: "11", feel: "Suspended, hazy" },
  { name: "Augmented 11th", ab: "#11", feel: "Lydian shimmer" },
  { name: "Perfect 12th", ab: "12", feel: "The 5th, an octave up" },
  { name: "Minor 13th", ab: "b13", feel: "Dark, altered" },
  { name: "Major 13th", ab: "13", feel: "Lush — the scale, played vertically" },
];

export const SCALES = {
  major: { name: "Major (Ionian)", ints: [0, 2, 4, 5, 7, 9, 11], formula: "W–W–H–W–W–W–H" },
  dorian: { name: "Dorian", ints: [0, 2, 3, 5, 7, 9, 10], formula: "W–H–W–W–W–H–W" },
  phrygian: { name: "Phrygian", ints: [0, 1, 3, 5, 7, 8, 10], formula: "H–W–W–W–H–W–W" },
  lydian: { name: "Lydian", ints: [0, 2, 4, 6, 7, 9, 11], formula: "W–W–W–H–W–W–H" },
  mixolydian: { name: "Mixolydian", ints: [0, 2, 4, 5, 7, 9, 10], formula: "W–W–H–W–W–H–W" },
  aeolian: { name: "Natural Minor (Aeolian)", ints: [0, 2, 3, 5, 7, 8, 10], formula: "W–H–W–W–H–W–W" },
  locrian: { name: "Locrian", ints: [0, 1, 3, 5, 6, 8, 10], formula: "H–W–W–H–W–W–W" },
  harmonicMinor: { name: "Harmonic Minor", ints: [0, 2, 3, 5, 7, 8, 11], formula: "W–H–W–W–H–Aug2–H" },
  majorPent: { name: "Major Pentatonic", ints: [0, 2, 4, 7, 9], formula: "Major – 4 – 7" },
  minorPent: { name: "Minor Pentatonic", ints: [0, 3, 5, 7, 10], formula: "Natural minor – 2 – 6" },
  // Minor pentatonic with the blue note wedged in — until now this was faked
  // through Song Practice's `extras` mechanism rather than being a real scale.
  blues: { name: "Blues", ints: [0, 3, 5, 6, 7, 10], formula: "Minor pentatonic + b5" },
  melodicMinor: { name: "Melodic Minor", ints: [0, 2, 3, 5, 7, 9, 11], formula: "Minor with a MAJOR 6 and 7" },
  lydianDom: { name: "Lydian Dominant", ints: [0, 2, 4, 6, 7, 9, 10], formula: "Mixolydian with a #4 — melodic minor's 4th mode" },
  altered: { name: "Altered (Super Locrian)", ints: [0, 1, 3, 4, 6, 8, 10], formula: "Every tension bent — melodic minor's 7th mode" },
  harmonicMajor: { name: "Harmonic Major", ints: [0, 2, 4, 5, 7, 8, 11], formula: "Major with a b6" },
  wholeHalfDim: { name: "Diminished (whole-half)", ints: [0, 2, 3, 5, 6, 8, 9, 11], formula: "W–H repeating — eight notes, no home" },
};

export const CHORDS = {
  maj: { name: "Major", sym: "", ints: [0, 4, 7], labels: ["1", "3", "5"], formula: "1 + M3 + m3" },
  min: { name: "Minor", sym: "m", ints: [0, 3, 7], labels: ["1", "b3", "5"], formula: "1 + m3 + M3" },
  dim: { name: "Diminished", sym: "°", ints: [0, 3, 6], labels: ["1", "b3", "b5"], formula: "1 + m3 + m3" },
  aug: { name: "Augmented", sym: "+", ints: [0, 4, 8], labels: ["1", "3", "#5"], formula: "1 + M3 + M3" },
  maj7: { name: "Major 7", sym: "maj7", ints: [0, 4, 7, 11], labels: ["1", "3", "5", "7"], formula: "1-3-5 + M7" },
  dom7: { name: "Dominant 7", sym: "7", ints: [0, 4, 7, 10], labels: ["1", "3", "5", "b7"], formula: "1-3-5 + m7" },
  min7: { name: "Minor 7", sym: "m7", ints: [0, 3, 7, 10], labels: ["1", "b3", "5", "b7"], formula: "1-b3-5 + m7" },
  m7b5: { name: "Half-Diminished", sym: "m7♭5", ints: [0, 3, 6, 10], labels: ["1", "b3", "b5", "b7"], formula: "1-b3-b5 + m7" },
  dim7: { name: "Diminished 7", sym: "°7", ints: [0, 3, 6, 9], labels: ["1", "b3", "b5", "bb7"], formula: "m3 + m3 + m3 — perfectly symmetrical" },
  // Suspensions: the 3rd is REPLACED, not added — so nothing decides major or minor.
  sus2: { name: "Suspended 2", sym: "sus2", ints: [0, 2, 7], labels: ["1", "2", "5"], formula: "The 3rd swapped for the 2" },
  sus4: { name: "Suspended 4", sym: "sus4", ints: [0, 5, 7], labels: ["1", "4", "5"], formula: "The 3rd swapped for the 4" },
  six: { name: "Major 6", sym: "6", ints: [0, 4, 7, 9], labels: ["1", "3", "5", "6"], formula: "Triad + the 6 (not a 7th)" },
  min6: { name: "Minor 6", sym: "m6", ints: [0, 3, 7, 9], labels: ["1", "b3", "5", "6"], formula: "Minor triad + a MAJOR 6" },
  add9: { name: "Add 9", sym: "add9", ints: [0, 4, 7, 14], labels: ["1", "3", "5", "9"], formula: "Triad + the 9, skipping the 7th" },
  // Extensions — thirds stacked past the octave. Keep stacking and the chord
  // ends up containing the entire key (THEORY_IDEAS #6).
  maj9: { name: "Major 9", sym: "maj9", ints: [0, 4, 7, 11, 14], labels: ["1", "3", "5", "7", "9"], formula: "maj7 + M3" },
  dom9: { name: "Dominant 9", sym: "9", ints: [0, 4, 7, 10, 14], labels: ["1", "3", "5", "b7", "9"], formula: "7 + M3" },
  min9: { name: "Minor 9", sym: "m9", ints: [0, 3, 7, 10, 14], labels: ["1", "b3", "5", "b7", "9"], formula: "m7 + M3" },
  dom11: { name: "Dominant 11", sym: "11", ints: [0, 4, 7, 10, 14, 17], labels: ["1", "3", "5", "b7", "9", "11"], formula: "9 + m3" },
  min11: { name: "Minor 11", sym: "m11", ints: [0, 3, 7, 10, 14, 17], labels: ["1", "b3", "5", "b7", "9", "11"], formula: "m9 + m3" },
  // The 13th conventionally drops the 11 — it sits a semitone off the 3rd.
  dom13: { name: "Dominant 13", sym: "13", ints: [0, 4, 7, 10, 14, 21], labels: ["1", "3", "5", "b7", "9", "13"], formula: "9 + the 13 (the 11 is dropped)" },
};

/**
 * Chord families — so a UI can group nineteen qualities into rows instead of
 * one unreadable wall of buttons.
 */
export const CHORD_FAMILY = {
  triad: { name: "Triads", ids: ["maj", "min", "dim", "aug", "sus2", "sus4"] },
  seventh: { name: "Sevenths & 6ths", ids: ["maj7", "dom7", "min7", "m7b5", "dim7", "six", "min6"] },
  extended: { name: "Extensions", ids: ["add9", "maj9", "dom9", "min9", "dom11", "min11", "dom13"] },
};

/**
 * Diatonic triads stacked on the major scale (the harmonisation map).
 *
 * `fn` is the chord's FUNCTION — T(onic) sits still, S(ubdominant) leaves home,
 * D(ominant) demands to come back. Three jobs, seven chords: that is why a
 * progression feels like it is going somewhere, and it is the thing the app
 * showed nothing of before.
 *
 * `semis` is the triad's root measured from the key's tonic, so nothing has to
 * re-derive it from the scale; `quality` is a key into CHORDS.
 */
export const DIATONIC = [
  { rn: "I", q: "Maj", quality: "maj", semis: 0, fn: "T", why: "home — nothing is pulling" },
  { rn: "ii", q: "min", quality: "min", semis: 2, fn: "S", why: "the classic run-up to V" },
  { rn: "iii", q: "min", quality: "min", semis: 4, fn: "T", why: "a soft stand-in for I" },
  { rn: "IV", q: "Maj", quality: "maj", semis: 5, fn: "S", why: "one step away from home" },
  { rn: "V", q: "Maj", quality: "maj", semis: 7, fn: "D", why: "carries the key's 7 — pulls hardest" },
  { rn: "vi", q: "min", quality: "min", semis: 9, fn: "T", why: "the relative minor — home, in the shade" },
  { rn: "vii°", q: "dim", quality: "dim", semis: 11, fn: "D", why: "V7 without its root — pure tension" },
];

/**
 * The same map for a NATURAL MINOR key.
 *
 * Roughly half the seeded song library is in a minor key, and until this
 * existed the Harmony view could not explain a single one of them.
 *
 * The v chord is the interesting one: natural minor's 5th chord is MINOR, so it
 * has no leading tone and barely pulls at all. That is exactly why harmonic
 * minor exists — raise the 7 and v becomes V, which is what almost every
 * minor-key song actually plays.
 */
export const DIATONIC_MINOR = [
  { rn: "i", q: "min", quality: "min", semis: 0, fn: "T", why: "home — the minor tonic" },
  { rn: "ii°", q: "dim", quality: "dim", semis: 2, fn: "S", why: "unstable — usually passing through to v" },
  { rn: "bIII", q: "Maj", quality: "maj", semis: 3, fn: "T", why: "the relative major — home, in daylight" },
  { rn: "iv", q: "min", quality: "min", semis: 5, fn: "S", why: "the minor-key departure" },
  { rn: "v", q: "min", quality: "min", semis: 7, fn: "D", why: "minor — no leading tone, so it hardly pulls" },
  { rn: "bVI", q: "Maj", quality: "maj", semis: 8, fn: "S", why: "the big cinematic one" },
  { rn: "bVII", q: "Maj", quality: "maj", semis: 10, fn: "D", why: "rock's favourite — falls to i with no leading tone" },
];

/** Harmonic minor's V: raise the 7 and the minor key gets its pull back. */
export const MINOR_V7 = { rn: "V7", q: "Maj", quality: "dom7", semis: 7, fn: "D", why: "the raised 7 — borrowed from harmonic minor" };

/** The two key flavours every page can offer, pointing at their own maps. */
export const KEY_MODES = {
  major: { name: "Major", scaleId: "major", diatonic: DIATONIC },
  minor: { name: "Natural minor", scaleId: "aeolian", diatonic: DIATONIC_MINOR },
};

export const FUNCTION_NAME = { T: "Tonic", S: "Subdominant", D: "Dominant" };
export const FUNCTION_BLURB = {
  T: "Home. Rest. Nothing is asking to move.",
  S: "Departure — away from home, but not yet unstable.",
  D: "Tension. It contains the key's leading tone and wants to fall back to the tonic.",
};

// Standard tuning, string 1 (high E, top) -> string 6 (low E, bottom).
export const OPEN_MIDI = [64, 59, 55, 50, 45, 40];
export const FRETS = 24;

export function noteNameToPc(name) {
  let pc = LETTER_PC[name[0]];
  for (let i = 1; i < name.length; i++) {
    if (name[i] === "#") pc += 1;
    else if (name[i] === "b") pc -= 1;
  }
  return ((pc % 12) + 12) % 12;
}

export function spellPcWithLetter(pc, letter) {
  const base = LETTER_PC[letter];
  const diff = ((pc - base + 12) % 12);
  if (diff === 0) return letter;
  if (diff === 1) return letter + "#";
  if (diff === 2) return letter + "##";
  if (diff === 11) return letter + "b";
  if (diff === 10) return letter + "bb";
  return letter;
}

export function majorScaleSpelling(rootName) {
  const rootPc = noteNameToPc(rootName);
  const startIdx = LETTERS.indexOf(rootName[0]);
  return MAJOR_STEPS.map((step, i) => {
    const pc = (rootPc + step) % 12;
    const letter = LETTERS[(startIdx + i) % 7];
    return spellPcWithLetter(pc, letter);
  });
}

export function buildNoteNames(rootName) {
  const names = new Array(12).fill(null);
  const major = majorScaleSpelling(rootName);
  major.forEach((nm) => {
    names[noteNameToPc(nm)] = nm;
  });
  const useFlats = FLAT_KEYS.has(rootName);
  for (let pc = 0; pc < 12; pc++) {
    if (!names[pc]) names[pc] = useFlats ? PC_FLAT[pc] : PC_SHARP[pc];
  }
  return names;
}

/**
 * Note names as a KEY spells them.
 *
 * `buildNoteNames` spells from a major key, which is right until the key is
 * minor: C minor writes E♭ and A♭, never D♯ and G♯, because it borrows the
 * signature of its relative major. One line, and it stops every minor-key
 * readout in the app from looking like a typo.
 */
export function keyNames(rootName, mode = "major") {
  if (mode !== "minor") return buildNoteNames(rootName);
  const relPc = (((noteNameToPc(rootName) + 3) % 12) + 12) % 12;
  const rel = ROOTS.find((r) => noteNameToPc(r) === relPc) || rootName;
  return buildNoteNames(rel);
}

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}


/* ============================================================================
 * NOTES -> CHORDS, AND BACK
 *
 * The engine could always go scale -> notes. It could not go notes -> name,
 * which blocked a whole family of drills: tap a shape and be told what it is,
 * ask which chords contain a note, ask which scales a chord lives in.
 * These are those primitives.
 * ========================================================================== */

const norm = (n) => (((n % 12) + 12) % 12);

/** The pitch classes of a chord, deduplicated (a 13th chord repeats none). */
export function chordPcs(rootPc, qualityId) {
  const ch = CHORDS[qualityId];
  if (!ch) return [];
  return [...new Set(ch.ints.map((i) => norm(rootPc + i)))];
}

/** Chord-tone label ("1", "b3", "9"…) for a pitch class inside a chord. */
export function chordToneLabel(rootPc, qualityId, pc) {
  const ch = CHORDS[qualityId];
  if (!ch) return null;
  const idx = ch.ints.findIndex((i) => norm(rootPc + i) === norm(pc));
  return idx < 0 ? null : ch.labels[idx];
}

/**
 * A readable root name, spelled the way the given key would spell it.
 *
 * `prefer` overrides that for notes that are NOT in the key: a borrowed ♭VI or
 * a tritone sub is spelled flat no matter what key it lands in, because that
 * is what it is — a flattened degree, not a raised one. D♭7, not C♯7.
 */
export function pcName(pc, key = "C", prefer = null) {
  if (prefer === "flat") return PC_FLAT[norm(pc)];
  if (prefer === "sharp") return PC_SHARP[norm(pc)];
  return buildNoteNames(key)[norm(pc)];
}

/**
 * NAME WHAT I PLAYED.
 *
 * Give it a set of pitch classes (any octave, any order) and it names the
 * chord. Give it the lowest note as well and it also names the inversion:
 * C-E-G with E in the bass is not "C major", it is C/E — a C major with the
 * 3rd in the bass, which is a different sound and half of what voice leading
 * is for.
 *
 * How it decides between readings: an exact set match against all 12 roots x
 * every quality, scored by (a) whether the bass note IS the root, and (b) the
 * order qualities are declared in CHORDS, which runs plain -> exotic. So
 * C-E-G-A comes back as C6 rather than Am7/C when C is in the bass, and as
 * Am7 when A is.
 *
 * Returns null if nothing matches exactly, plus `alternatives` for the
 * readings it rejected — a symmetrical chord like dim7 has four equally true
 * names and pretending otherwise would be a lie.
 */
export function identifyChord(pcs, { bassPc = null, key = "C" } = {}) {
  const set = [...new Set((pcs || []).map(norm))].sort((a, b) => a - b);
  if (set.length < 2) return null;
  const order = Object.keys(CHORDS);
  const bass = bassPc == null ? null : norm(bassPc);
  const found = [];

  for (let root = 0; root < 12; root++) {
    order.forEach((id, rank) => {
      const cp = chordPcs(root, id).sort((a, b) => a - b);
      if (cp.length !== set.length) return;
      if (!cp.every((v, i) => v === set[i])) return;
      const ch = CHORDS[id];
      // Which chord tone is in the bass — 0 = root position, 1 = first
      // inversion (3rd in the bass), and so on.
      const inversion =
        bass == null ? 0 : ch.ints.findIndex((iv) => norm(root + iv) === bass);
      found.push({
        rootPc: root,
        quality: id,
        inversion: inversion < 0 ? 0 : inversion,
        // Root in the bass is by far the most likely reading of a shape.
        score: (bass != null && bass === root ? 100 : 0) - rank,
      });
    });
  }
  if (!found.length) return null;
  found.sort((a, b) => b.score - a.score);

  const dress = (c) => {
    const ch = CHORDS[c.quality];
    const rootName = pcName(c.rootPc, key);
    const bassName = bass == null ? rootName : pcName(bass, key);
    const slash = bass != null && bass !== c.rootPc;
    return {
      ...c,
      name: ch.name,
      rootName,
      bassName,
      symbol: rootName + ch.sym,
      // "C" · "C/E" — the way a chart would write it.
      label: rootName + ch.sym + (slash ? "/" + bassName : ""),
      slash,
      inversionName: INVERSION_NAME[c.inversion] || "root position",
      tones: ch.ints.map((iv, i) => ({
        pc: norm(c.rootPc + iv),
        label: ch.labels[i],
        name: pcName(c.rootPc + iv, key),
      })),
    };
  };

  const best = dress(found[0]);
  best.alternatives = found.slice(1, 4).map(dress);
  return best;
}

export const INVERSION_NAME = [
  "root position",
  "1st inversion — 3rd in the bass",
  "2nd inversion — 5th in the bass",
  "3rd inversion — 7th in the bass",
];

/**
 * WHICH CHORDS FIT THIS SCALE.
 *
 * Every root x every quality, keeping only the chords whose notes all live
 * inside the scale. Solid nodes are the targets, the rest of the scale is
 * connective tissue — that picture is the bridge between lessons 02 and 04.
 */
export function chordsIn(scaleId, tonicPc = 0, { family = null, maxSize = 4 } = {}) {
  const sc = SCALES[scaleId];
  if (!sc) return [];
  const inScale = new Set(sc.ints.map((i) => norm(tonicPc + i)));
  const ids = family ? CHORD_FAMILY[family].ids : Object.keys(CHORDS);
  const out = [];
  sc.ints.forEach((iv) => {
    const rootPc = norm(tonicPc + iv);
    ids.forEach((id) => {
      const ch = CHORDS[id];
      if (ch.ints.length > maxSize) return;
      const pcs = chordPcs(rootPc, id);
      if (pcs.every((pc) => inScale.has(pc))) {
        out.push({ rootPc, quality: id, degree: DEG[iv], semis: iv, pcs });
      }
    });
  });
  return out;
}

/**
 * WHICH SCALES CONTAIN THIS CHORD — the same question from the other end.
 * Returns every (scale, root) pair whose notes swallow the chord whole.
 */
export function scalesContaining(pcs, { ids = null } = {}) {
  const want = [...new Set((pcs || []).map(norm))];
  if (!want.length) return [];
  const out = [];
  (ids || Object.keys(SCALES)).forEach((id) => {
    for (let root = 0; root < 12; root++) {
      const inScale = new Set(SCALES[id].ints.map((i) => norm(root + i)));
      if (want.every((pc) => inScale.has(pc))) {
        out.push({ scaleId: id, rootPc: root, size: SCALES[id].ints.length });
      }
    }
  });
  // Tightest fit first: a 5-note scale that contains the chord says more about
  // it than a 8-note one that contains almost everything.
  return out.sort((a, b) => a.size - b.size);
}

/**
 * The diatonic chords of a key, resolved to actual pitch classes.
 * `mode` is "major" or "minor" (see KEY_MODES).
 */
export function diatonicChords(tonicPc, mode = "major", key = "C") {
  const map = (KEY_MODES[mode] || KEY_MODES.major).diatonic;
  return map.map((d, i) => {
    const rootPc = norm(tonicPc + d.semis);
    return {
      ...d,
      i,
      rootPc,
      pcs: chordPcs(rootPc, d.quality),
      rootName: pcName(rootPc, key),
      label: pcName(rootPc, key) + CHORDS[d.quality].sym,
    };
  });
}

/**
 * HARMONISE A MELODY — every diatonic chord that contains a given note.
 * One note has several harmonic homes; that is the whole of reharmonisation.
 */
export function chordsContaining(pc, tonicPc, mode = "major", key = "C") {
  return diatonicChords(tonicPc, mode, key).filter((c) => c.pcs.includes(norm(pc)));
}

/**
 * The tritone inside a dominant chord — its 3rd and its b7.
 *
 * These two notes are what makes a dominant dominant: a tritone is the least
 * stable interval there is, and resolving it inward by a semitone on each side
 * is the strongest move in tonal music. Returns null for chords that have no
 * tritone to resolve.
 */
export function tritoneOf(rootPc, qualityId) {
  const ch = CHORDS[qualityId];
  if (!ch) return null;
  const pcs = chordPcs(rootPc, qualityId);
  for (let i = 0; i < pcs.length; i++) {
    for (let j = i + 1; j < pcs.length; j++) {
      if (norm(pcs[i] - pcs[j]) === 6) {
        // Name them by their job in the chord, not by which came first.
        const a = { pc: pcs[i], label: chordToneLabel(rootPc, qualityId, pcs[i]) };
        const b = { pc: pcs[j], label: chordToneLabel(rootPc, qualityId, pcs[j]) };
        const third = /3/.test(a.label || "") ? a : b;
        const seventh = third === a ? b : a;
        return { third, seventh, pcs: [a.pc, b.pc] };
      }
    }
  }
  return null;
}


/* ============================================================================
 * SCALES AS RECIPES, AND THE GUITAR AS GEOMETRY
 *
 * A scale is a sequence of steps, not a list of notes; an interval is a shape,
 * not a name. Both of those are derived here from the data already in this
 * file, so a lesson can never teach something the engine disagrees with.
 * ========================================================================== */

/**
 * The step pattern of a scale, in semitones, wrapping back to the octave.
 * Major -> [2,2,1,2,2,2,1]. Always sums to 12.
 */
export function stepPattern(ints) {
  if (!Array.isArray(ints) || !ints.length) return [];
  return ints.map((v, i) => (i === ints.length - 1 ? 12 - v : ints[i + 1] - v));
}

/** W and H, the way a formula is written. Bigger jumps get named honestly. */
export function stepLabel(semis) {
  if (semis === 1) return "H";
  if (semis === 2) return "W";
  if (semis === 3) return "W+H";
  if (semis === 4) return "2W";
  return String(semis) + "H";
}

/** The formula of a scale, derived from its intervals rather than typed by hand. */
export function formulaOf(scaleId) {
  const sc = SCALES[scaleId];
  return sc ? stepPattern(sc.ints).map(stepLabel).join("–") : "";
}

/**
 * Every tritone inside a set of pitch classes.
 *
 * This is the engine behind "why pentatonic is safe": a pentatonic scale has
 * none, and that is not a coincidence — the notes it drops ARE the tritone.
 */
export function tritonePairs(pcs) {
  const set = [...new Set((pcs || []).map(norm))].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < set.length; i++) {
    for (let j = i + 1; j < set.length; j++) {
      if (norm(set[j] - set[i]) === 6) out.push([set[i], set[j]]);
    }
  }
  return out;
}

/**
 * The smallest distance between any two notes of a set, measured around the
 * circle. A scale containing a half-step somewhere has a note that can clash
 * with the note beside it; one whose smallest gap is a whole step does not.
 */
export function smallestGap(pcs) {
  const set = [...new Set((pcs || []).map(norm))].sort((a, b) => a - b);
  if (set.length < 2) return null;
  let min = 12;
  for (let i = 0; i < set.length; i++) {
    const next = set[(i + 1) % set.length];
    min = Math.min(min, norm(next - set[i]) || 12);
  }
  return min;
}

/**
 * WHICH NOTES CLASH, AND WITH WHAT.
 *
 * For each note of a scale, the nearest chord tone of the tonic chord and the
 * distance to it. A note a semitone above a chord tone is the one that sounds
 * like a mistake when you hold it — those are exactly the notes pentatonic
 * drops, and this is how the app can SHOW that rather than assert it.
 */
export function tensionMap(scaleId, quality = "maj") {
  const sc = SCALES[scaleId];
  if (!sc) return [];
  const tones = CHORDS[quality] ? CHORDS[quality].ints.map(norm) : [0, 4, 7];
  return sc.ints.map((iv) => {
    let nearest = null;
    let dist = 12;
    tones.forEach((t) => {
      // Signed distance to the chord tone, shortest way round.
      const up = norm(iv - t);
      const d = Math.min(up, 12 - up);
      if (d < dist) {
        dist = d;
        nearest = t;
      }
    });
    // Which side of the chord tone it sits on. The 4 leans on the 3 from
    // above; the 7 leans on the root from below. Same tension, opposite
    // directions, and calling both of them "above" would be a lie.
    const above = norm(iv - nearest) === dist;
    return {
      semis: iv,
      label: DEG[iv],
      isChordTone: dist === 0,
      nearestTone: nearest,
      nearestLabel: DEG[nearest],
      distance: dist,
      above,
      side: dist === 0 ? "" : above ? "above" : "below",
      // A semitone above a chord tone is the classic avoid note: it wants to
      // fall into the note underneath it, so holding it reads as a mistake.
      clash: dist === 1,
    };
  });
}

/**
 * INTERVALS AS SHAPES.
 *
 * Where the second note of an interval sits relative to the first, for every
 * pair of strings. All of it falls out of OPEN_MIDI, which is the point: the
 * famous "except across the G–B string" exception is not special-cased here,
 * it emerges because that one string pair is tuned a major 3rd apart while
 * every other pair is a 4th.
 *
 *   fret offset (s1 -> s2) = OPEN_MIDI[s1] - OPEN_MIDI[s2] + semitones
 */
export function intervalShapes(semis, { maxStringSpan = 3, minFret = -5, maxFret = 6 } = {}) {
  const out = [];
  for (let s1 = 0; s1 < OPEN_MIDI.length; s1++) {
    for (let s2 = 0; s2 < OPEN_MIDI.length; s2++) {
      const span = s1 - s2; // positive = toward the HIGH strings (lower index)
      if (span < 0 || span > maxStringSpan) continue;
      const fret = OPEN_MIDI[s1] - OPEN_MIDI[s2] + semis;
      if (fret < minFret || fret > maxFret) continue;
      out.push({
        from: s1,
        to: s2,
        strings: span,
        fret,
        // The B string (index 1) is tuned a 3rd above G (index 2), not a 4th,
        // so any shape stepping over THAT boundary shifts one fret higher.
        crossesGB: Math.min(s1, s2) <= 1 && Math.max(s1, s2) >= 2,
      });
    }
  }
  return out;
}

/**
 * The one shape per string-span that most guitarists actually think in, plus
 * the version of it that crosses the G–B string. Two rows, and the difference
 * between them is the whole lesson.
 */
export function shapeSummary(semis, span = 1) {
  const all = intervalShapes(semis).filter((sh) => sh.strings === span);
  const plain = all.filter((sh) => !sh.crossesGB);
  const gb = all.filter((sh) => sh.crossesGB);
  const fretOf = (list) => (list.length ? list[0].fret : null);
  return {
    span,
    normal: fretOf(plain),
    acrossGB: fretOf(gb),
    shifts: plain.length && gb.length ? gb[0].fret - plain[0].fret : 0,
    normalPairs: plain,
    gbPairs: gb,
  };
}

/**
 * THE CIRCLE OF FIFTHS — pitch classes, clockwise from C.
 * Neighbours share six of their seven notes, which is the whole reason the
 * circle is shaped like this.
 */
export const CIRCLE_OF_FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

/** How far apart two keys are ON the circle (0-6, either direction). */
export function circleDistance(a, b) {
  const i = CIRCLE_OF_FIFTHS.indexOf(norm(a));
  const j = CIRCLE_OF_FIFTHS.indexOf(norm(b));
  if (i < 0 || j < 0) return null;
  const d = Math.abs(i - j);
  return Math.min(d, 12 - d);
}

/**
 * A key's signature, counted off its own spelling rather than looked up.
 * C major spells C D E F G A B — no accidentals. G major spells F#. Every
 * step clockwise round the circle adds exactly one.
 */
export function keySignature(rootName) {
  const spelling = majorScaleSpelling(rootName);
  const sharps = spelling.filter((n) => n.includes("#")).length;
  const flats = spelling.filter((n) => n.includes("b")).length;
  return {
    sharps,
    flats,
    count: sharps + flats,
    text: sharps ? `${sharps}♯` : flats ? `${flats}♭` : "—",
    notes: spelling.filter((n) => n.length > 1),
  };
}

/**
 * ONE NOTE, AGAINST ONE CHORD.
 *
 * The judgement behind "why did that sound resolved / why did that clash":
 * what the note IS relative to the chord, which chord tone it is leaning on,
 * and from which side. A chord tone lands. A note a semitone off a chord tone
 * leans — fine passing through, wrong to stop on. Anything else is colour.
 */
export function noteAgainstChord(pc, rootPc, quality = "maj") {
  const ch = CHORDS[quality] || CHORDS.maj;
  const rel = norm(pc - rootPc);
  const tones = [...new Set(ch.ints.map(norm))];
  let nearest = tones[0];
  let dist = 12;
  tones.forEach((t) => {
    const up = norm(rel - t);
    const d = Math.min(up, 12 - up);
    if (d < dist) {
      dist = d;
      nearest = t;
    }
  });
  const above = norm(rel - nearest) === dist;
  return {
    semis: rel,
    degree: DEG[rel],
    isChordTone: dist === 0,
    label: chordToneLabel(rootPc, quality, pc) || DEG[rel],
    nearestLabel: chordToneLabel(rootPc, quality, norm(rootPc + nearest)) || DEG[nearest],
    distance: dist,
    side: dist === 0 ? "" : above ? "above" : "below",
    // "target" = a chord tone, "leaning" = a semitone off one, "colour" = the rest.
    kind: dist === 0 ? "target" : dist === 1 ? "leaning" : "colour",
  };
}

/**
 * WHAT LANDING ON THIS NOTE DID.
 *
 * The judgement the chord-tone drill makes on every strong beat, kept here as
 * a pure function so it can be tested without a microphone attached:
 *
 *   target   a chord tone — the line resolves
 *   leaning  a semitone from a chord tone — fine passing, wrong to stop on
 *   passing  in the scale but not the chord — pretty, and left hanging
 *   outside  neither — colour on the way past, a mistake on a downbeat
 */
export function landingVerdict(pc, rootPc, quality = "maj", inScale = false) {
  const info = noteAgainstChord(pc, rootPc, quality);
  const kind = info.isChordTone
    ? "target"
    : info.distance === 1
    ? "leaning"
    : inScale
    ? "passing"
    : "outside";
  return { ...info, inScale, kind };
}
