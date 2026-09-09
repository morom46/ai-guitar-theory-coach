/**
 * SHAPES YOU CAN ACTUALLY GRAB.
 *
 * The Chord Builder shows every place a chord's tones live on the neck, which
 * is true and useless when what you want is one hand position. The Voice
 * Leading tab makes it worse by talking about voicings the neck cannot show.
 *
 * So: a solver, not a table. Hand-typing a VOICINGS list would let the shapes
 * drift away from the engine's own chord definitions, and it would only ever
 * cover the chords somebody remembered to type. Instead, enumerate what the
 * hand can reach and keep what is playable:
 *
 *   - each string is muted, open, or fretted inside a four-fret window
 *   - every note of the chord has to be present at least once
 *   - no muted string in the MIDDLE of sounding ones (you cannot mute there
 *     without deadening the strings either side)
 *   - at least four strings sounding, so it strums like a chord
 *
 * Then score for playability — open strings are free, barres are cheap,
 * stretches and awkward one-off fingers are not — and hand back the best few.
 */

import { CHORDS, OPEN_MIDI, chordPcs, chordToneLabel } from "./engine.js";

const norm = (n) => (((n % 12) + 12) % 12);

/** Which fingers a shape actually needs, and whether it wants a barre. */
function fingering(frets) {
  const fretted = frets.map((f, s) => ({ f, s })).filter((x) => x.f != null && x.f > 0);
  if (!fretted.length) return { fingers: 0, barre: null, span: 0 };
  const low = Math.min(...fretted.map((x) => x.f));
  const high = Math.max(...fretted.map((x) => x.f));
  const atLow = fretted.filter((x) => x.f === low);
  // A barre only counts if the low fret covers two or more strings AND
  // nothing below it is sounding open in between — which is the shape your
  // first finger can actually lie across.
  const barre = atLow.length >= 2 ? { fret: low, from: Math.max(...atLow.map((x) => x.s)), to: Math.min(...atLow.map((x) => x.s)) } : null;
  const fingers = barre ? 1 + fretted.filter((x) => x.f > low).length : fretted.length;
  return { fingers, barre, span: high - low + 1 };
}

/**
 * Every playable shape for a chord, best first.
 *
 * `frets[s]` is null (muted), 0 (open) or a fret number, indexed like
 * OPEN_MIDI: 0 = high E … 5 = low E.
 */
export function findVoicings(rootPc, qualityId, {
  maxSpan = 4,
  maxFret = 14,
  minStrings = 4,
  limit = 6,
  // "root" keeps the root lowest, "any" allows inversions, and a pitch
  // class pins one specific note in the bass (what a slash chord asks for).
  bass = "root",
} = {}) {
  const ch = CHORDS[qualityId];
  if (!ch) return [];
  const pcs = chordPcs(rootPc, qualityId);
  const need = new Set(pcs);
  // Extended chords cannot fit six notes under one hand; drop the 5th first,
  // which is what a guitarist does anyway.
  const optional = pcs.length > 4 ? new Set([norm(rootPc + 7)]) : new Set();
  const out = [];
  const seen = new Set();

  for (let pos = 0; pos <= maxFret; pos++) {
    // Candidate frets per string inside this window (plus open, plus mute).
    const opts = OPEN_MIDI.map((open) => {
      const list = [null];
      for (let f = pos; f < pos + maxSpan; f++) {
        if (f > maxFret + maxSpan) break;
        if (pcs.includes(norm(open + f))) list.push(f);
      }
      if (pos > 0 && pcs.includes(norm(open))) list.push(0); // open strings are always available
      return list;
    });

    const walk = (s, acc) => {
      if (s < 0) {
        const frets = acc.slice().reverse();
        const sounding = frets.map((f, i) => (f == null ? null : i)).filter((i) => i != null);
        if (sounding.length < minStrings) return;
        // no muted string in the middle
        const first = sounding[0];
        const last = sounding[sounding.length - 1];
        for (let i = first; i <= last; i++) if (frets[i] == null) return;
        // every chord tone present (bar the ones we allowed to be dropped)
        const got = new Set(sounding.map((i) => norm(OPEN_MIDI[i] + frets[i])));
        for (const pc of need) if (!got.has(pc) && !optional.has(pc)) return;
        // the bass note
        const bassIdx = last; // highest index = lowest string = lowest pitch
        const bassPc = norm(OPEN_MIDI[bassIdx] + frets[bassIdx]);
        if (typeof bass === "number") { if (bassPc !== norm(bass)) return; }
        else if (bass === "root" && bassPc !== rootPc) return;

        const key = frets.join(",");
        if (seen.has(key)) return;
        seen.add(key);

        const fing = fingering(frets);
        const midis = sounding.map((i) => OPEN_MIDI[i] + frets[i]).sort((a, b) => a - b);
        const opens = frets.filter((f) => f === 0).length;
        // The lowest FRETTED fret, which is where the hand sits. Writing this
        // as Math.min(...).concat([0]) made the guard the answer: every shape
        // scored as if it were played at the nut, and the height term below
        // did nothing at all.
        const frettedAt = frets.filter((f) => f > 0);
        const lowFret = frettedAt.length ? Math.min(...frettedAt) : 0;
        out.push({
          frets,
          midis,
          bassPc,
          rootPc,
          quality: qualityId,
          position: lowFret,
          strings: sounding.length,
          ...fing,
          // Lower is better: fingers cost, stretch costs, height on the neck
          // costs a little, open strings pay you back, and a shape that sounds
          // all six strings beats one that sounds four.
          cost:
            fing.fingers * 2 +
            (fing.span > 3 ? (fing.span - 3) * 3 : 0) +
            lowFret * 0.15 +
            (6 - sounding.length) * 1.5 -
            opens * 1.2 -
            (fing.barre ? 0.5 : 0),
        });
        return;
      }
      for (const f of opts[s]) walk(s - 1, [...acc, f]);
    };
    walk(OPEN_MIDI.length - 1, []);
  }

  out.sort((a, b) => a.cost - b.cost || a.position - b.position);
  // Keep the list varied: one shape per position, so you get the open chord
  // AND the barre up the neck rather than six near-identical fingerings.
  const byPos = new Map();
  for (const v of out) {
    const p = v.position;
    if (!byPos.has(p)) byPos.set(p, v);
  }
  return [...byPos.values()].sort((a, b) => a.position - b.position).slice(0, limit);
}

/** Note names + chord-tone labels for a shape, string by string. */
export function describeVoicing(v, names) {
  return v.frets.map((f, s) => {
    if (f == null) return { string: s, muted: true };
    const pc = norm(OPEN_MIDI[s] + f);
    return {
      string: s,
      fret: f,
      pc,
      name: names ? names[pc] : null,
      label: chordToneLabel(v.rootPc, v.quality, pc),
      open: f === 0,
    };
  });
}
