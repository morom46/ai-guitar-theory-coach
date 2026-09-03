/**
 * VOICE LEADING — where the notes of a chord actually go.
 *
 * A chord is a set of pitch CLASSES. A voicing is a decision about which
 * octave each of those classes lands in, and that decision is most of what
 * separates a progression that lurches from one that flows.
 *
 * The lesson this exists for: play C–Am–F–G twice. Once with every chord in
 * root position, once letting each chord pick the octave placement nearest to
 * the chord before it. In the first version all three notes leap. In the
 * second, the note the two chords share does not move AT ALL and the others
 * slide by a step. Watching that happen teaches inversions without anyone
 * having to define the word — you just see the 3rd end up in the bass.
 *
 * The solver is deliberately tiny: enumerate every octave placement inside a
 * register, keep the one with the smallest total movement from the previous
 * voicing. No cleverness, no rules about parallel fifths — just distance.
 */

import { CHORDS, chordPcs } from "./engine.js";

/** Comfortable guitar/keyboard register for these demonstrations. */
export const LOW = 48; // C3
export const HIGH = 79; // G5
export const MAX_SPAN = 16; // a voicing wider than this stops reading as a chord

/** Root position, lowest root at or above `base`. */
export function rootPosition(rootPc, qualityId, base = LOW) {
  const ints = CHORDS[qualityId] ? CHORDS[qualityId].ints : [0];
  const root = base + (((rootPc - base) % 12) + 12) % 12;
  return ints.map((iv) => root + iv);
}

/**
 * Invert a voicing `n` times: take the lowest note and lift it an octave.
 * Two inversions of a triad and you are back to root position an octave up,
 * which is the entire mechanism — the notes never change, only their order.
 */
export function invert(midis, n = 1) {
  let v = [...midis].sort((a, b) => a - b);
  // Deliberately NOT modulo the chord size: rotating a triad three times is
  // not a no-op, it is the same chord an octave higher, and that is exactly
  // the thing worth seeing.
  for (let i = 0; i < Math.abs(n); i++) {
    if (n > 0) {
      const [low, ...rest] = v;
      v = [...rest, low + 12];
    } else {
      const high = v[v.length - 1];
      v = [high - 12, ...v.slice(0, -1)];
    }
  }
  return v;
}

/** Every inversion of a voicing, root position first. */
export function inversions(midis) {
  return midis.map((_, i) => invert(midis, i));
}

/**
 * Every octave placement of a chord inside the register.
 * One choice per pitch class, so a triad gives ~27 candidates — small enough
 * to just enumerate and take the minimum.
 */
export function candidateVoicings(rootPc, qualityId, { low = LOW, high = HIGH, maxSpan = MAX_SPAN } = {}) {
  const pcs = chordPcs(rootPc, qualityId);
  if (!pcs.length) return [];
  const perTone = pcs.map((pc) => {
    const opts = [];
    let m = low + ((((pc - low) % 12) + 12) % 12);
    for (; m <= high; m += 12) opts.push(m);
    return opts;
  });
  const out = [];
  const walk = (i, acc) => {
    if (i === perTone.length) {
      const v = [...acc].sort((a, b) => a - b);
      if (v[v.length - 1] - v[0] <= maxSpan) out.push(v);
      return;
    }
    perTone[i].forEach((m) => walk(i + 1, [...acc, m]));
  };
  walk(0, []);
  return out;
}

/**
 * Total semitone movement between two voicings, pairing the voices bottom-up.
 *
 * Pairing by position rather than by pitch class is the honest measure: it is
 * what a hand or a singer actually has to move.
 */
export function distance(a, b) {
  if (!a || !b) return 0;
  const x = [...a].sort((p, q) => p - q);
  const y = [...b].sort((p, q) => p - q);
  if (x.length === y.length) {
    return x.reduce((sum, m, i) => sum + Math.abs(m - y[i]), 0);
  }
  // Different-sized chords (a triad into a 7th): every voice of the larger
  // chord moves from its nearest note in the smaller one.
  const [big, small] = x.length > y.length ? [x, y] : [y, x];
  return big.reduce(
    (sum, m) => sum + Math.min(...small.map((n) => Math.abs(m - n))),
    0
  );
}

/**
 * The voicing of this chord that moves least from `prev`.
 * Ties break toward the tighter voicing, then the lower one — both of which
 * just keep the demonstration readable.
 */
export function nearestVoicing(prev, rootPc, qualityId, opts = {}) {
  const cands = candidateVoicings(rootPc, qualityId, opts);
  if (!cands.length) return [];
  if (!prev || !prev.length) {
    // No previous chord: start in the middle of the register so there is room
    // to move in both directions.
    const mid = ((opts.low ?? LOW) + (opts.high ?? HIGH)) / 2;
    return cands.reduce((best, v) =>
      Math.abs(v[0] - mid + 6) < Math.abs(best[0] - mid + 6) ? v : best
    );
  }
  let best = null;
  let bestKey = null;
  cands.forEach((v) => {
    const key = [
      distance(prev, v),
      v[v.length - 1] - v[0],
      v[0],
    ];
    if (!bestKey || key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])))) {
      best = v;
      bestKey = key;
    }
  });
  return best;
}

/**
 * Voice a whole progression.
 *
 *   mode "root"    — every chord in root position from the same low octave.
 *                    This is what everybody plays first, and it leaps.
 *   mode "nearest" — each chord takes the placement closest to the one before.
 *
 * `chords` is [{ rootPc, quality }]. Returns the same objects with `midis`.
 */
export function voiceLead(chords, { mode = "nearest", low = LOW, high = HIGH, base = LOW + 12 } = {}) {
  let prev = null;
  return (chords || []).map((c, i) => {
    // BOTH versions start from the same root-position chord. If the nearest
    // solver were allowed to choose its own opening voicing the comparison
    // would be unfair — the whole point is that the two versions diverge
    // because of what happens BETWEEN chords, not where they begin.
    const midis =
      mode === "root" || i === 0
        ? rootPosition(c.rootPc, c.quality, base)
        : nearestVoicing(prev, c.rootPc, c.quality, { low, high });
    prev = midis;
    return { ...c, midis };
  });
}

/**
 * What each voice does between two chords — the thing the animation draws.
 * `common` marks a voice that does not move at all: the common tone, which is
 * the single most convincing fact in this whole lesson.
 */
export function motion(a, b) {
  if (!a || !b) return [];
  const x = [...a].sort((p, q) => p - q);
  const y = [...b].sort((p, q) => p - q);
  const n = Math.min(x.length, y.length);
  return Array.from({ length: n }, (_, i) => ({
    from: x[i],
    to: y[i],
    delta: y[i] - x[i],
    common: x[i] === y[i],
  }));
}

/** Total movement across a whole voiced progression, in semitones. */
export function totalMotion(voiced) {
  let sum = 0;
  for (let i = 1; i < (voiced || []).length; i++) {
    sum += distance(voiced[i - 1].midis, voiced[i].midis);
  }
  return sum;
}

/** How many notes two chords literally share (same pitch class). */
export function commonTones(a, b) {
  const set = new Set((b || []).map((m) => ((m % 12) + 12) % 12));
  return (a || []).filter((m) => set.has(((m % 12) + 12) % 12)).length;
}

/**
 * Which inversion a voicing is in — read off whichever chord tone is lowest.
 * -1 when the bass note is not a chord tone at all.
 */
export function inversionOf(midis, rootPc, qualityId) {
  const ints = CHORDS[qualityId] ? CHORDS[qualityId].ints : [0];
  const bass = ((Math.min(...midis) % 12) + 12) % 12;
  return ints.findIndex((iv) => ((rootPc + iv) % 12 + 12) % 12 === bass);
}
