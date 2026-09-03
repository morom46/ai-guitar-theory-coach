/**
 * POSITIONS AND SEQUENCES — the scale as something your hand does.
 *
 * A scale on a 24-fret neck is a wall of dots. What you actually play is a
 * BOX: a four- or five-fret window where the hand stays put and every string
 * gives you two or three notes. There are as many boxes as the scale has
 * notes, they interlock, and they are the reason "learn the five shapes" is
 * the standard advice.
 *
 * Nothing here is a memorised diagram. A box is defined as: start at the nth
 * scale tone on the low E string, then take the smallest fret window in which
 * EVERY string still gives you the required number of notes. Run that for
 * A minor pentatonic and out comes the box at fret 5 that everybody plays —
 * derived, not typed.
 *
 * Then sequences: threes, fours, thirds. A sequence is just an order to visit
 * the notes in, which makes it a pure function over the box — and something a
 * moving dot can walk through in time with the metronome.
 */

import { SCALES, OPEN_MIDI, DEG } from "./engine.js";

const norm = (n) => (((n % 12) + 12) % 12);

/** Every scale fret on one string, ascending. */
function fretsOnString(stringIdx, pcs, maxFret) {
  const open = OPEN_MIDI[stringIdx];
  const out = [];
  for (let f = 0; f <= maxFret; f++) if (pcs.has(norm(open + f))) out.push(f);
  return out;
}

/**
 * The playable boxes of a scale, low to high.
 *
 * `perString` defaults to 2 for five-note scales (the pentatonic boxes) and 3
 * for seven-note ones (three-notes-per-string), which is what people play.
 */
export function positionsFor(scaleId, rootPc, { maxFret = 24, perString: want, maxSpan = 6 } = {}) {
  const sc = SCALES[scaleId];
  if (!sc) return [];
  const pcs = new Set(sc.ints.map((i) => norm(rootPc + i)));
  const perString = want || (sc.ints.length <= 5 ? 2 : 3);

  // Anchors: each scale tone on the low E string, inside ONE octave — fret 12
  // is the same note as the open string, so including it would invent a box
  // that is just the first one twelve frets up.
  const anchors = fretsOnString(OPEN_MIDI.length - 1, pcs, 11);
  const boxes = [];

  anchors.forEach((start, i) => {
    // Smallest window in which every string still yields `perString` notes.
    let span = null;
    for (let s = perString; s <= maxSpan; s++) {
      const ok = OPEN_MIDI.every((_, str) => fretsOnString(str, pcs, maxFret).filter((f) => f >= start && f <= start + s).length >= perString);
      if (ok) {
        span = s;
        break;
      }
    }
    if (span == null) return;
    const notes = [];
    OPEN_MIDI.forEach((open, s) => {
      fretsOnString(s, pcs, maxFret)
        .filter((f) => f >= start && f <= start + span)
        .slice(0, perString)
        .forEach((f) => {
          const pc = norm(open + f);
          notes.push({ s, f, pc, midi: open + f, semis: norm(pc - rootPc), degree: DEG[norm(pc - rootPc)] });
        });
    });
    // Ascending pitch is the order a hand plays them in.
    notes.sort((a, b) => a.midi - b.midi || b.s - a.s);
    boxes.push({ index: i, start, span, perString, notes });
  });

  // Guitarists count from the box that starts ON the root — "box 1" of A minor
  // pentatonic is the one at the 5th fret, not the one that happens to be
  // lowest on the neck. Rotate so the numbering matches the language.
  const rootIdx = boxes.findIndex((b) => norm(OPEN_MIDI[OPEN_MIDI.length - 1] + b.start) === rootPc);
  const rotated = rootIdx > 0 ? [...boxes.slice(rootIdx), ...boxes.slice(0, rootIdx)] : boxes;
  return rotated.map((b, i) => ({
    ...b,
    index: i,
    // Which scale degree this box begins on, which is the honest name for it.
    startDegree: DEG[norm(OPEN_MIDI[OPEN_MIDI.length - 1] + b.start - rootPc)],
  }));
}

/** Which box a fret belongs to, for "where am I" readouts. */
export function boxAt(boxes, fret) {
  return boxes.find((b) => fret >= b.start && fret <= b.start + b.span) || null;
}

export const PATTERNS = {
  straight: { name: "Straight", blurb: "up and back down — the scale itself" },
  threes: { name: "In 3s", blurb: "1-2-3, 2-3-4, 3-4-5 — the classic warm-up" },
  fours: { name: "In 4s", blurb: "1-2-3-4, 2-3-4-5 — longer legs, same idea" },
  thirds: { name: "Thirds", blurb: "1-3, 2-4, 3-5 — skipping a note builds intervals, not runs" },
  skip: { name: "String skip", blurb: "leaps instead of steps — breaks the run out of a straight line" },
};

/**
 * The ORDER to visit a box's notes in. Pure indices into the ascending list,
 * so the same function drives the neck, the audio and the moving dot.
 */
export function sequenceOrder(n, pattern = "straight", { updown = true } = {}) {
  const up = [];
  if (n <= 0) return up;
  if (pattern === "threes" || pattern === "fours") {
    const len = pattern === "threes" ? 3 : 4;
    for (let i = 0; i + len <= n; i++) for (let k = 0; k < len; k++) up.push(i + k);
  } else if (pattern === "thirds") {
    for (let i = 0; i + 2 < n; i++) {
      up.push(i);
      up.push(i + 2);
    }
  } else if (pattern === "skip") {
    // Alternate a step up with a leap of three, which lands you on a different
    // string most of the time.
    for (let i = 0; i < n; i++) {
      up.push(i);
      if (i + 3 < n) up.push(i + 3);
    }
  } else {
    for (let i = 0; i < n; i++) up.push(i);
  }
  if (!updown) return up;
  // Come back down without repeating the top note.
  const down = [...up].reverse().slice(1);
  return [...up, ...down];
}
