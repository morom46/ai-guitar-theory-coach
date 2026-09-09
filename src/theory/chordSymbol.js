/**
 * CHORD SYMBOLS, READ AND WRITTEN.
 *
 * A song chart is a row of letters: "Am C D Fmaj7". The engine speaks pitch
 * classes and quality ids. This is the translator in both directions, so a
 * song can carry its chords as the text a guitarist would actually write
 * down and still get a solved shape, a Nashville number and a strum out of
 * it.
 *
 * There is a second, deliberately dumber parser in data/soloSchema.js. That
 * one collapses every extension onto its parent seventh, because all it ever
 * asks is "which degree am I playing over". This one keeps the quality it
 * was given: an Fmaj7 has to come back as a maj7 or the chord box will draw
 * the wrong grip.
 *
 * Where the written symbol names a chord the engine has no entry for, the
 * parse still succeeds and reports `exact: false`. A 7sus4 becomes a sus4
 * (the missing 3rd is the whole character of the chord, the b7 is the
 * garnish) and the caller can say so rather than lying about the shape.
 */

import { CHORDS, LETTER_PC, noteNameToPc, buildNoteNames } from "./engine.js";

const norm = (n) => (((n % 12) + 12) % 12);

/** Written suffix, lower-cased, to a quality id the engine knows. */
const SUFFIX = {
  "": "maj", M: "maj", maj: "maj", major: "maj",
  m: "min", min: "min", "-": "min", minor: "min",
  dim: "dim", o: "dim", "°": "dim",
  dim7: "dim7", o7: "dim7", "°7": "dim7",
  aug: "aug", "+": "aug", "+5": "aug", "#5": "aug",
  sus2: "sus2", sus4: "sus4", sus: "sus4",
  maj7: "maj7", ma7: "maj7", M7: "maj7", "Δ": "maj7", "Δ7": "maj7", j7: "maj7",
  7: "dom7", dom7: "dom7",
  m7: "min7", min7: "min7", "-7": "min7",
  m7b5: "m7b5", min7b5: "m7b5", "-7b5": "m7b5", "m7♭5": "m7b5", "ø": "m7b5", "ø7": "m7b5", "half-dim": "m7b5",
  6: "six", maj6: "six", M6: "six",
  m6: "min6", min6: "min6", "-6": "min6",
  add9: "add9", add2: "add9",
  maj9: "maj9", M9: "maj9",
  9: "dom9",
  m9: "min9", min9: "min9",
  11: "dom11",
  m11: "min11", min11: "min11",
  13: "dom13",
  // Written wider than anything in the table, so the grip is the nearest
  // honest thing and `exact` goes false.
  "5": "maj",
  "7sus4": "sus4", "7sus": "sus4",
  "6/9": "six", 69: "six",
  madd9: "min", "m(maj7)": "min", mmaj7: "min",
  "7b9": "dom7", "7#9": "dom7", "7b5": "dom7", "7#5": "dom7", "7alt": "dom7", "7#11": "dom7",
  maj7b5: "maj7", "maj7#11": "maj7", add11: "maj", add4: "maj", "9sus4": "sus4",
};

/** Suffixes whose grip is an approximation of what the symbol says. */
const APPROX = new Set([
  "5", "7sus4", "7sus", "6/9", "69", "madd9", "m(maj7)", "mmaj7",
  "7b9", "7#9", "7b5", "7#5", "7alt", "7#11", "maj7b5", "maj7#11",
  "add11", "add4", "9sus4",
]);

const tidy = (s) =>
  String(s)
    .replace(/♯/g, "#")
    .replace(/♭/g, "b")
    .replace(/–|—/g, "-")
    .trim();

/**
 * "F#m7/C#" -> { rootPc, quality, bassPc, text, exact }
 *
 * `text` is the symbol as written, tidied of unicode accidentals, because
 * that is what the page should print back at you. Returns null for anything
 * it cannot read, so a typo in a user's own chord list shows up as a missing
 * box rather than a crash.
 */
export function parseChord(sym) {
  if (typeof sym !== "string") return null;
  const raw = tidy(sym);
  if (!raw) return null;

  const slash = raw.indexOf("/");
  // "6/9" is a quality, not a slash chord: the character after the slash has
  // to look like a note name for this to be a bass note.
  const isBass = slash > 0 && /^[A-Ga-g][#b]{0,2}$/.test(raw.slice(slash + 1).trim());
  const head = isBass ? raw.slice(0, slash) : raw;
  const bassText = isBass ? raw.slice(slash + 1).trim() : null;

  const m = /^([A-Ga-g])([#b]{0,2})(.*)$/.exec(head.trim());
  if (!m) return null;
  const letter = m[1].toUpperCase();
  if (!(letter in LETTER_PC)) return null;

  const rootPc = noteNameToPc(letter + m[2]);
  const suffix = m[3].trim();
  const key = suffix in SUFFIX ? suffix : suffix.toLowerCase();
  const quality = SUFFIX[key];
  if (!quality) return null;

  const bassPc = bassText ? noteNameToPc(bassText[0].toUpperCase() + bassText.slice(1)) : null;

  return {
    rootPc,
    quality,
    bassPc: bassPc == null || bassPc === rootPc ? null : bassPc,
    text: raw,
    exact: !APPROX.has(key),
  };
}

/** "Am C D Fmaj7" or ["Am", "C"] -> the chords that parsed, in order. */
export function parseChordList(value) {
  const parts = Array.isArray(value) ? value : String(value || "").split(/[\s,|]+/);
  return parts.map((p) => parseChord(p)).filter(Boolean);
}

/**
 * Write a chord back out, spelled the way `key` spells its notes.
 *
 * Needed because a transposed chord has no text of its own: put a capo on
 * fret 2 for a song in F# minor and the grip under your fingers is an Em,
 * which nothing in the stored data ever said.
 */
export function chordSymbol(chord, key = "C") {
  if (!chord) return "";
  const names = buildNoteNames(key);
  const sym = CHORDS[chord.quality]?.sym ?? "";
  const head = names[norm(chord.rootPc)] + sym;
  return chord.bassPc == null ? head : head + "/" + names[norm(chord.bassPc)];
}

/** The same chord `semis` higher (negative moves it down). */
export function transposeChord(chord, semis) {
  if (!chord) return null;
  return {
    ...chord,
    rootPc: norm(chord.rootPc + semis),
    bassPc: chord.bassPc == null ? null : norm(chord.bassPc + semis),
  };
}

/**
 * The chord's Nashville number in a key: "1", "4", "6m", "b7".
 *
 * Quality gets one letter, not a full symbol, because the number is there to
 * say where the chord sits in the family. Which seventh got stacked on top is
 * already written on the box above it.
 */
export function chordDegree(chord, tonicPc) {
  if (!chord) return "";
  const semis = norm(chord.rootPc - tonicPc);
  const q = chord.quality;
  const tail =
    q === "min" || q === "min7" || q === "min6" || q === "min9" || q === "min11" ? "m"
    : q === "dim" || q === "dim7" ? "°"
    : q === "m7b5" ? "m7♭5"
    : q === "aug" ? "+"
    : "";
  const DEGREE = ["1", "b2", "2", "b3", "3", "4", "b5", "5", "b6", "6", "b7", "7"];
  return DEGREE[semis] + tail;
}

/** Every pitch class the chord sounds, bass note included. */
export function chordTonePcs(chord) {
  if (!chord) return [];
  const ints = CHORDS[chord.quality]?.ints || [0];
  const pcs = new Set(ints.map((i) => norm(chord.rootPc + i)));
  if (chord.bassPc != null) pcs.add(norm(chord.bassPc));
  return [...pcs];
}
