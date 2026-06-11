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
};

// Diatonic triads stacked on the major scale (the harmonisation map).
export const DIATONIC = [
  { rn: "I", q: "Maj" },
  { rn: "ii", q: "min" },
  { rn: "iii", q: "min" },
  { rn: "IV", q: "Maj" },
  { rn: "V", q: "Maj" },
  { rn: "vi", q: "min" },
  { rn: "vii°", q: "dim" },
];

// Standard tuning, string 1 (high E, top) -> string 6 (low E, bottom).
export const OPEN_MIDI = [64, 59, 55, 50, 45, 40];
export const FRETS = 15;

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

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
