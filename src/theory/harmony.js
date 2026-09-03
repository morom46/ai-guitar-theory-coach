/**
 * CHORD GRAVITY — why one chord follows another.
 *
 * Everything else in this app teaches what notes are IN things. Nothing taught
 * why a progression feels like it is going somewhere, which is the biggest
 * conceptual hole in it.
 *
 * The answer is function plus a leading tone. Every diatonic chord does one of
 * three jobs — tonic (home), subdominant (departure), dominant (tension) — and
 * the dominant contains the note a semitone under the tonic. That semitone is
 * the whole engine: it wants to fall, and the chord carrying it wants to
 * resolve. V→I is thick, vi→ii is thin, and the weights below are simply how
 * hard each move pulls.
 *
 * Nothing here is a rule about what you are allowed to play. It is a map of
 * where the ear expects to be taken, which is the thing you need in order to
 * either satisfy it or deliberately not.
 */

import {
  CHORDS,
  DIATONIC,
  DIATONIC_MINOR,
  KEY_MODES,
  MINOR_V7,
  SCALES,
  chordPcs,
  diatonicChords,
  pcName,
  tritoneOf,
  circleDistance,
} from "./engine.js";

const norm = (n) => (((n % 12) + 12) % 12);

/**
 * The pull edges of a major key, by degree index (0 = I … 6 = vii°).
 * `w` is 0–1: how strongly the first chord asks for the second.
 */
export const PULL_MAJOR = [
  { from: 4, to: 0, w: 0.95, why: "V→I — the leading tone is a semitone under the tonic, and it falls" },
  { from: 6, to: 0, w: 0.85, why: "vii°→I — V7 with its root removed: all tension, no ballast" },
  { from: 1, to: 4, w: 0.8, why: "ii→V — the standard run-up; ii is V's own subdominant" },
  { from: 3, to: 4, w: 0.7, why: "IV→V — tension stacked on departure, the loudest set-up there is" },
  { from: 3, to: 0, w: 0.6, why: "IV→I — the plagal 'amen': it lands, but with no leading tone it lands softly" },
  { from: 5, to: 1, w: 0.5, why: "vi→ii — falling in fifths, the strongest sequence in tonal music" },
  { from: 2, to: 5, w: 0.5, why: "iii→vi — the same fifth-fall, one rung along" },
  { from: 5, to: 3, w: 0.5, why: "vi→IV — the pop turnaround; two shared notes make it effortless" },
  { from: 0, to: 3, w: 0.45, why: "I→IV — leaving home, the oldest move in the book" },
  { from: 0, to: 4, w: 0.45, why: "I→V — straight to the tension" },
  { from: 4, to: 5, w: 0.4, why: "V→vi — the deceptive cadence: the pull is real, the landing isn't" },
  { from: 2, to: 3, w: 0.35, why: "iii→IV — a step up, weak but smooth" },
];

/** The same for a natural-minor key (0 = i … 6 = ♭VII). */
export const PULL_MINOR = [
  { from: 6, to: 0, w: 0.8, why: "♭VII→i — rock's cadence: no leading tone, it just falls a whole step" },
  { from: 5, to: 6, w: 0.7, why: "♭VI→♭VII — the pair that walks up into the tonic" },
  { from: 3, to: 0, w: 0.6, why: "iv→i — the minor plagal, heavier than its major cousin" },
  { from: 1, to: 4, w: 0.6, why: "ii°→v — diminished into the dominant" },
  { from: 3, to: 4, w: 0.55, why: "iv→v — departure into tension" },
  { from: 4, to: 0, w: 0.5, why: "v→i — MINOR v has no leading tone, so it slides home rather than pulling" },
  { from: 2, to: 5, w: 0.5, why: "♭III→♭VI — falling fifths, in the shade" },
  { from: 0, to: 3, w: 0.45, why: "i→iv — leaving home" },
  { from: 0, to: 5, w: 0.45, why: "i→♭VI — the cinematic drop" },
  { from: 2, to: 6, w: 0.4, why: "♭III→♭VII — the relative-major pair, borrowed back" },
];

export const pullsOf = (mode = "major") => (mode === "minor" ? PULL_MINOR : PULL_MAJOR);

/** Every edge leaving a degree, strongest first. */
export function pullsFrom(degreeIndex, mode = "major") {
  return pullsOf(mode)
    .filter((e) => e.from === degreeIndex)
    .sort((a, b) => b.w - a.w);
}

/** Every edge arriving at a degree, strongest first. */
export function pullsTo(degreeIndex, mode = "major") {
  return pullsOf(mode)
    .filter((e) => e.to === degreeIndex)
    .sort((a, b) => b.w - a.w);
}

/** Where this chord most wants to go. */
export function resolutionOf(degreeIndex, mode = "major") {
  return pullsFrom(degreeIndex, mode)[0] || null;
}

/**
 * THE DOMINANT OF A KEY — and why a minor key has to borrow one.
 *
 * In major, the chord on the 5th is already a dominant 7th: it carries the
 * tritone between its 3rd and its ♭7, and that tritone is the tension the
 * whole system resolves. In NATURAL minor the chord on the 5th is minor — v,
 * not V7 — and a minor chord has no tritone in it at all. It cannot pull.
 *
 * So minor keys raise the 7th degree to get one, which is the entire reason
 * harmonic minor exists: not a scale somebody invented, a repair. `borrowed`
 * says whether that repair is what you are looking at.
 */
export function dominantOf(tonicPc, mode = "major", key = "C") {
  const rootPc = norm(tonicPc + MINOR_V7.semis);
  const borrowed = mode === "minor";
  return {
    rootPc,
    quality: "dom7",
    pcs: chordPcs(rootPc, "dom7"),
    rootName: pcName(rootPc, key),
    label: pcName(rootPc, key) + CHORDS.dom7.sym,
    rn: MINOR_V7.rn,
    tritone: tritoneOf(rootPc, "dom7"),
    borrowed,
    why: borrowed
      ? `The v of a minor key is minor and cannot pull. Raise the 7th and it becomes ${pcName(rootPc, key)}7 — ${MINOR_V7.why}.`
      : `The chord on the 5th, with its ♭7: the tritone inside it is what resolves home.`,
  };
}

/**
 * SECONDARY DOMINANTS — any chord can be a temporary tonic.
 *
 * Aim a dominant 7th at a chord that isn't the tonic and, for one bar, that
 * chord IS the tonic. C–Am–F–G becomes C–E7–Am–F–G and the Am arrives like a
 * destination instead of a passing chord. The E7 is not in the key of C; that
 * is precisely why it works.
 */
export function secondaryDominant(targetRootPc, { key = "C", targetLabel = "" } = {}) {
  const rootPc = norm(targetRootPc + 7);
  return {
    rootPc,
    quality: "dom7",
    pcs: chordPcs(rootPc, "dom7"),
    rootName: pcName(rootPc, key),
    label: pcName(rootPc, key) + CHORDS.dom7.sym,
    rn: targetLabel ? `V7/${targetLabel}` : "V7",
    why: `A dominant 7th a fifth above ${targetLabel || "the target"} — for one bar that chord becomes the tonic.`,
  };
}

/**
 * TRITONE SUBSTITUTION.
 *
 * A dominant 7th's 3rd and ♭7 are a tritone apart, and a tritone is
 * symmetrical: the same two notes sit inside the dominant 7th a tritone away,
 * with their jobs swapped. So D♭7 can replace G7 — same tension, same
 * resolution, a bass line that walks down by semitone instead of leaping.
 *
 * This is one substitution and three concepts: what makes a dominant dominant,
 * contrary motion, and most of what jazz reharmonisation is.
 */
export function tritoneSub(rootPc, { key = "C" } = {}) {
  const subPc = norm(rootPc + 6);
  const a = tritoneOf(rootPc, "dom7");
  const b = tritoneOf(subPc, "dom7");
  return {
    rootPc: subPc,
    quality: "dom7",
    pcs: chordPcs(subPc, "dom7"),
    rootName: pcName(subPc, key, "flat"),
    label: pcName(subPc, key, "flat") + CHORDS.dom7.sym,
    // The shared pair — identical pitch classes, opposite roles.
    shared: a && b ? [...new Set([...a.pcs, ...b.pcs])].sort((x, y) => x - y) : [],
    original: a,
    substitute: b,
    why: "Same two notes, opposite jobs: the 3rd of one is the ♭7 of the other, so both chords carry the identical tritone.",
  };
}

/**
 * WHERE A DOMINANT'S TRITONE GOES.
 *
 * The 3rd rises a semitone to the tonic, the ♭7 falls a semitone to the 3rd of
 * the target. Two notes moving toward each other by one fret each — that
 * contrary motion IS the resolution, and you can do it with your own hands.
 */
export function tritoneResolution(rootPc, { key = "C" } = {}) {
  const tt = tritoneOf(rootPc, "dom7");
  if (!tt) return null;
  const target = norm(rootPc + 5); // V7 resolving to I
  return {
    targetPc: target,
    targetName: pcName(target, key),
    moves: [
      { from: tt.third.pc, to: norm(tt.third.pc + 1), dir: 1, role: "3rd → the tonic (rises a semitone)" },
      { from: tt.seventh.pc, to: norm(tt.seventh.pc - 1), dir: -1, role: "♭7 → the target's 3rd (falls a semitone)" },
    ],
  };
}

/**
 * BORROWED CHORDS — modal interchange.
 *
 * The chords of the PARALLEL minor, dropped into a major key. Half the seeded
 * song library is built on this move: it is the chord that makes the chorus
 * sound like that.
 *
 * Returns the ones that actually get borrowed, each tagged with what it
 * replaces, so a UI can flip between the diatonic chord and its borrowed
 * neighbour rather than just listing them.
 */
export const BORROWED = [
  { semis: 5, quality: "min", rn: "iv", replaces: 3, why: "The saddest single substitution in pop — IV goes minor and the light goes out." },
  { semis: 8, quality: "maj", rn: "bVI", replaces: 5, why: "Lifted straight out of the parallel minor; huge, cinematic." },
  { semis: 10, quality: "maj", rn: "bVII", replaces: 6, why: "The rock chord. ♭VI–♭VII–I is an entire genre." },
  { semis: 3, quality: "maj", rn: "bIII", replaces: 2, why: "Darkens the key without leaving it — the minor 3rd, harmonised." },
  { semis: 2, quality: "dim", rn: "ii°", replaces: 1, why: "ii with its 5th flattened; sharpens the pull into V." },
  { semis: 7, quality: "min", rn: "v", replaces: 4, why: "A MINOR dominant — it drops the leading tone, so the pull disappears." },
];

export function borrowedChords(tonicPc, { key = "C" } = {}) {
  return BORROWED.map((b) => {
    const rootPc = norm(tonicPc + b.semis);
    const home = DIATONIC[b.replaces];
    return {
      ...b,
      rootPc,
      pcs: chordPcs(rootPc, b.quality),
      // Borrowed chords are flat-side by definition — ♭VI is A♭, never G♯.
      rootName: pcName(rootPc, key, b.semis === 3 || b.semis === 8 || b.semis === 10 ? "flat" : null),
      label: pcName(rootPc, key, b.semis === 3 || b.semis === 8 || b.semis === 10 ? "flat" : null) + CHORDS[b.quality].sym,
      replacesRn: home.rn,
      replacesLabel: pcName(norm(tonicPc + home.semis), key) + CHORDS[home.quality].sym,
      // Which note actually changed — the borrowed chord always drags in a
      // note from the parallel minor, and naming it is the lesson.
      newNotes: chordPcs(rootPc, b.quality).filter(
        (pc) => !chordPcs(norm(tonicPc + home.semis), home.quality).includes(pc)
      ),
    };
  });
}

/**
 * A key's diatonic chords with their pull edges attached — everything the
 * gravity map needs in one call.
 */
export function gravityMap(tonicPc, mode = "major", key = "C") {
  const chords = diatonicChords(tonicPc, mode, key);
  const edges = pullsOf(mode);
  return {
    mode,
    name: (KEY_MODES[mode] || KEY_MODES.major).name,
    chords: chords.map((c, i) => ({
      ...c,
      out: pullsFrom(i, mode),
      in: pullsTo(i, mode),
    })),
    edges,
  };
}



/**
 * WHAT TWO KEYS HAVE IN COMMON — the circle of fifths as a machine.
 *
 * The circle is usually drawn as a poster, which teaches nothing. The useful
 * question is: if I am in this key and I want to be in that one, what do we
 * already share and which chord can I walk across?
 *
 * Neighbouring keys share six of their seven notes — that is WHY the circle is
 * shaped the way it is, and this function computes it rather than asserting
 * it. The single note that differs is the one that redefines the key, so it is
 * named too.
 *
 * A PIVOT is a chord that is diatonic to both keys. The best one is a chord
 * that leaves home in the NEW key (its ii or IV): arriving on it, the ear has
 * already stopped hearing the old tonic, and the new key's V–I finishes the
 * job before anyone notices the modulation.
 */
export function keyRelationship(aPc, aMode, bPc, bMode, { key = "C" } = {}) {
  const scaleOf = (pc, mode) =>
    new Set(SCALES[(KEY_MODES[mode] || KEY_MODES.major).scaleId].ints.map((i) => norm(pc + i)));
  const A = scaleOf(aPc, aMode);
  const B = scaleOf(bPc, bMode);

  const shared = [...A].filter((pc) => B.has(pc)).sort((x, y) => x - y);
  const onlyA = [...A].filter((pc) => !B.has(pc)).sort((x, y) => x - y);
  const onlyB = [...B].filter((pc) => !A.has(pc)).sort((x, y) => x - y);

  const chordsA = diatonicChords(aPc, aMode, key);
  const chordsB = diatonicChords(bPc, bMode, key);
  const common = [];
  chordsA.forEach((ca) => {
    const match = chordsB.find((cb) => cb.rootPc === ca.rootPc && cb.quality === ca.quality);
    if (match) {
      common.push({
        rootPc: ca.rootPc,
        quality: ca.quality,
        label: ca.label,
        fromRn: ca.rn,
        toRn: match.rn,
        toFn: match.fn,
        // A pivot is worth most when it is a departure chord in the key you
        // are heading INTO — it sets up that key's own dominant.
        score: (match.fn === "S" ? 2 : match.fn === "T" ? 1 : 0) + (ca.fn === "T" ? 1 : 0),
      });
    }
  });
  const ranked = [...common].sort((x, y) => y.score - x.score);

  return {
    shared,
    sharedCount: shared.length,
    onlyA,
    onlyB,
    // The note that has to change for the key to change — the whole modulation,
    // in one pitch, whenever the keys are neighbours.
    changes: { leaves: onlyA, arrives: onlyB },
    common,
    pivot: ranked[0] || null,
    distance: circleDistance(aPc, bPc),
    same: aPc === bPc && aMode === bMode,
  };
}

/** The relative major/minor of a key — same notes, different home. */
export function relativeOf(pc, mode = "major") {
  return mode === "major"
    ? { pc: norm(pc + 9), mode: "minor" }
    : { pc: norm(pc + 3), mode: "major" };
}

/** The parallel major/minor — same home, three notes different. */
export function parallelOf(pc, mode = "major") {
  return { pc: norm(pc), mode: mode === "major" ? "minor" : "major" };
}
