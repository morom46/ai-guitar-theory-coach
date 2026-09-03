/**
 * THE BRIGHTNESS LADDER — modes as a single row of one-note changes.
 *
 * There are two honest ways to explain a mode, and the app only had one.
 *
 *   RELATIVE (what the Decoder's Modes tab already does): the same seven notes,
 *     move the tonic. D Dorian is C major starting on D. True, and useless for
 *     hearing what Dorian sounds like — because as long as C is the gravity
 *     well, you are still hearing C major.
 *
 *   PARALLEL (this file): keep the tonic fixed and change ONE note. D Dorian and
 *     D Aeolian are identical except that Dorian's 6th is natural. That is the
 *     entire difference, and it's a difference you can hear the moment you flip
 *     it over a held D.
 *
 * Sorted brightest to darkest, every neighbouring pair differs by exactly one
 * note, and each step flattens a note one perfect-4th further round the circle:
 *
 *   Lydian ──♯4→4── Ionian ──7→♭7── Mixolydian ──3→♭3── Dorian
 *          ──6→♭6── Aeolian ──2→♭2── Phrygian ──5→♭5── Locrian
 *
 * Seven modes, six one-note flips. That's the whole system, and it's why this
 * is worth teaching as a ladder instead of seven unrelated scales.
 *
 * Everything here is derived from SCALES in ./engine.js rather than re-typed,
 * so the ladder cannot drift out of step with the rest of the app.
 */

import { SCALES, DEG } from "./engine.js";

/** Mode ids, brightest first. Each is a key into SCALES. */
export const MODE_LADDER = [
  { id: "lydian", name: "Lydian", quality: "major", feel: "major, but floating — the ♯4 lifts it" },
  { id: "major", name: "Ionian", quality: "major", feel: "the reference major — nothing pulling" },
  { id: "mixolydian", name: "Mixolydian", quality: "major", feel: "major with the ♭7 — bluesy, unresolved" },
  { id: "dorian", name: "Dorian", quality: "minor", feel: "minor with a natural 6 — hopeful minor" },
  { id: "aeolian", name: "Aeolian", quality: "minor", feel: "the reference minor — the sad one" },
  { id: "phrygian", name: "Phrygian", quality: "minor", feel: "minor with a ♭2 — Spanish, menacing" },
  { id: "locrian", name: "Locrian", quality: "diminished", feel: "no perfect 5th — it can't sit still" },
];

export const ladderIndex = (id) => MODE_LADDER.findIndex((m) => m.id === id);

export const modeAt = (i) => MODE_LADDER[Math.max(0, Math.min(MODE_LADDER.length - 1, i))];

/** The intervals of a ladder mode, straight from the shared engine. */
export function modeInts(id) {
  const s = SCALES[id];
  return s ? s.ints : null;
}

/**
 * Which notes differ between two scales.
 * Returns semitones present in `a` but not `b`, and vice versa.
 */
export function scaleDelta(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return null;
  const setA = new Set(a);
  const setB = new Set(b);
  return {
    onlyA: a.filter((n) => !setB.has(n)),
    onlyB: b.filter((n) => !setA.has(n)),
  };
}

/**
 * The single note that changes between two adjacent ladder modes.
 *
 * Returns { from, to, fromLabel, toLabel, degree } where `from` is the
 * semitone in the FIRST mode and `to` its replacement in the second — or null
 * if the two modes differ by more than one note (i.e. aren't neighbours).
 */
export function modeStep(fromId, toId) {
  const a = modeInts(fromId);
  const b = modeInts(toId);
  if (!a || !b) return null;
  const d = scaleDelta(a, b);
  if (!d || d.onlyA.length !== 1 || d.onlyB.length !== 1) return null;
  const from = d.onlyA[0];
  const to = d.onlyB[0];
  return {
    from,
    to,
    fromLabel: labelFor(from, fromId),
    toLabel: labelFor(to, toId),
    // Which scale degree number is being altered (2, 3, 4, 5, 6 or 7), read
    // from the note's spelling in the mode it's leaving.
    degree: degreeNumber(from, fromId),
    /** true when the step makes the mode darker (the note moves down). */
    darker: to < from,
  };
}

/**
 * The step to the neighbour one rung darker (or brighter) — the flip this
 * feature is built around. Returns null at the ends of the ladder.
 */
export function neighbourStep(id, dir = 1) {
  const i = ladderIndex(id);
  if (i < 0) return null;
  const j = i + dir;
  if (j < 0 || j >= MODE_LADDER.length) return null;
  const step = modeStep(id, MODE_LADDER[j].id);
  return step ? { ...step, to_id: MODE_LADDER[j].id, toMode: MODE_LADDER[j] } : null;
}

/**
 * Degree labels need one special case: semitone 6 is the ♯4 of Lydian but the
 * ♭5 of Locrian. Same pitch, opposite meaning — spelling it by the mode is the
 * difference between "floating" and "unstable".
 */
export function labelFor(semis, modeId) {
  if (semis === 6) return modeId === "lydian" ? "#4" : "b5";
  return DEG[semis];
}

/**
 * Which scale degree a semitone IS, read off its spelling.
 *
 * Semitone 6 is the only ambiguous one, and it is ambiguous in exactly the way
 * that matters here: it's the 4th degree in Lydian (♯4) and the 5th in Locrian
 * (♭5). Deriving the number from the label rather than from the pitch keeps
 * those two answers straight.
 */
export function degreeNumber(semis, modeId) {
  const lab = labelFor(semis, modeId);
  const n = parseInt(String(lab).replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Brightness score — the sum of the intervals. Purely a sanity check that the
 * ladder really is ordered, used by the tests.
 */
export function brightness(id) {
  const ints = modeInts(id);
  return ints ? ints.reduce((a, b) => a + b, 0) : null;
}
