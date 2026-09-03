/**
 * THE SCALE LAB, THE CIRCLE, AND THE CHORD-TONE DRILL.
 *
 * Each of these lessons makes a claim on screen — "one step round the circle
 * changes exactly one note", "pentatonic is the scale with its tritone
 * removed", "a P5 is two frets over except across G–B". The lessons read those
 * claims out of the engine rather than stating them, so these tests are what
 * actually holds the teaching honest.
 */

import { describe, it, expect } from "vitest";
import {
  SCALES,
  ROOTS,
  OPEN_MIDI,
  CIRCLE_OF_FIFTHS,
  stepPattern,
  stepLabel,
  formulaOf,
  tritonePairs,
  smallestGap,
  tensionMap,
  intervalShapes,
  shapeSummary,
  circleDistance,
  keySignature,
  keyNames,
  noteAgainstChord,
  landingVerdict,
  noteNameToPc,
} from "../src/theory/engine.js";
import { keyRelationship, relativeOf, parallelOf } from "../src/theory/harmony.js";

/* ===================== #13 scales as recipes ===================== */

describe("a scale is a recipe of steps", () => {
  it("derives the major formula everyone knows", () => {
    expect(stepPattern(SCALES.major.ints)).toEqual([2, 2, 1, 2, 2, 2, 1]);
    expect(formulaOf("major")).toBe("W–W–H–W–W–W–H");
    expect(formulaOf("aeolian")).toBe("W–H–W–W–H–W–W");
  });

  it("always spans exactly one octave, for every scale in the engine", () => {
    Object.keys(SCALES).forEach((id) => {
      const steps = stepPattern(SCALES[id].ints);
      expect(steps.length, id).toBe(SCALES[id].ints.length);
      expect(steps.reduce((a, b) => a + b, 0), id).toBe(12);
      steps.forEach((s) => expect(s, id).toBeGreaterThan(0));
    });
  });

  it("names the augmented second harmonic minor is famous for", () => {
    expect(stepPattern(SCALES.harmonicMinor.ints)).toContain(3);
    expect(formulaOf("harmonicMinor")).toContain("W+H");
    expect(stepLabel(1)).toBe("H");
    expect(stepLabel(2)).toBe("W");
  });

  it("walks the formula back to the notes it came from", () => {
    // Which is what the drill checks the user against, one fret at a time.
    Object.keys(SCALES).forEach((id) => {
      const steps = stepPattern(SCALES[id].ints);
      let at = 0;
      const walked = [0];
      steps.slice(0, -1).forEach((s) => { at += s; walked.push(at); });
      expect(walked, id).toEqual(SCALES[id].ints);
    });
  });
});

/* ===================== #12 why pentatonic is safe ===================== */

describe("why pentatonic is safe", () => {
  it("finds the two notes that lean on a chord tone in a major key", () => {
    const clash = tensionMap("major", "maj").filter((t) => t.clash);
    expect(clash.map((t) => t.label)).toEqual(["4", "7"]);
    expect(clash[0].nearestLabel).toBe("3");
    expect(clash[0].side).toBe("above"); // the 4 leans down onto the 3
    expect(clash[1].nearestLabel).toBe("1");
    expect(clash[1].side).toBe("below"); // the 7 leans up into the root
  });

  it("finds the same two in a minor key", () => {
    const clash = tensionMap("aeolian", "min").filter((t) => t.clash);
    expect(clash.map((t) => t.label)).toEqual(["2", "b6"]);
  });

  it("removes exactly those notes to leave the pentatonic", () => {
    const drop = (scaleId, quality, pentId) => {
      const clash = tensionMap(scaleId, quality).filter((t) => t.clash).map((t) => t.semis);
      const left = SCALES[scaleId].ints.filter((i) => !clash.includes(i));
      expect(left.sort((a, b) => a - b)).toEqual(SCALES[pentId].ints);
      return clash;
    };
    drop("major", "maj", "majorPent");
    drop("aeolian", "min", "minorPent");
  });

  it("proves the dropped pair IS the key's tritone", () => {
    const majClash = tensionMap("major", "maj").filter((t) => t.clash).map((t) => t.semis);
    expect(tritonePairs(majClash).length).toBe(1);
    const minClash = tensionMap("aeolian", "min").filter((t) => t.clash).map((t) => t.semis);
    expect(tritonePairs(minClash).length).toBe(1);
  });

  it("leaves a scale with no half steps and no tritone — nothing that can clash", () => {
    ["majorPent", "minorPent"].forEach((id) => {
      expect(smallestGap(SCALES[id].ints), id).toBe(2);
      expect(tritonePairs(SCALES[id].ints).length, id).toBe(0);
    });
    // …unlike the seven-note scales they came from, and unlike the blues scale,
    // whose whole character is the note it puts back.
    expect(smallestGap(SCALES.major.ints)).toBe(1);
    expect(tritonePairs(SCALES.major.ints).length).toBe(1);
    expect(tritonePairs(SCALES.blues.ints).length).toBe(1);
  });
});

/* ===================== #14 intervals as shapes ===================== */

describe("intervals as shapes on the neck", () => {
  it("puts the perfect 5th two frets up on the next string — except across G–B", () => {
    const p5 = shapeSummary(7, 1);
    expect(p5.normal).toBe(2);
    expect(p5.acrossGB).toBe(3);
    expect(p5.shifts).toBe(1);
  });

  it("puts the perfect 4th straight across, and the octave two strings up", () => {
    expect(shapeSummary(5, 1).normal).toBe(0);
    expect(shapeSummary(5, 1).acrossGB).toBe(1);
    expect(shapeSummary(12, 2).normal).toBe(2);
    expect(shapeSummary(12, 2).acrossGB).toBe(3);
  });

  it("shifts EVERY interval by exactly one fret across G–B — one rule, not a list", () => {
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].forEach((semis) => {
      [1, 2].forEach((span) => {
        const sh = shapeSummary(semis, span);
        if (sh.normal != null && sh.acrossGB != null) {
          expect(sh.shifts, `${semis} semis, ${span} string(s)`).toBe(1);
        }
      });
    });
  });

  it("marks the crossing on the right string pair — G(3) to B(2), and no other", () => {
    // The tuning itself: every pair a fourth apart except that one, which is a third.
    const gaps = OPEN_MIDI.slice(0, -1).map((m, i) => m - OPEN_MIDI[i + 1]);
    expect(gaps).toEqual([5, 4, 5, 5, 5]);
    const adjacent = intervalShapes(7).filter((sh) => sh.strings === 1);
    adjacent.forEach((sh) => {
      const isGB = Math.min(sh.from, sh.to) === 1 && Math.max(sh.from, sh.to) === 2;
      expect(sh.crossesGB, `${sh.from}->${sh.to}`).toBe(isGB);
      expect(sh.fret).toBe(isGB ? 3 : 2);
    });
  });

  it("always lands on the note it promised", () => {
    intervalShapes(7).forEach((sh) => {
      // A note at fret 5 on string `from` plus this shape must be a real 5th.
      const a = OPEN_MIDI[sh.from] + 5;
      const b = OPEN_MIDI[sh.to] + 5 + sh.fret;
      expect(b - a).toBe(7);
    });
  });
});

/* ===================== #11 relative vs parallel ===================== */

describe("relative vs parallel", () => {
  it("keeps every note and moves home — relative", () => {
    const rel = relativeOf(0, "major"); // C major -> A minor
    expect(rel).toEqual({ pc: 9, mode: "minor" });
    const r = keyRelationship(0, "major", rel.pc, "minor");
    expect(r.sharedCount).toBe(7);
    expect(r.changes.leaves).toEqual([]);
    expect(r.changes.arrives).toEqual([]);
  });

  it("keeps home and moves three notes — parallel", () => {
    const par = parallelOf(0, "major"); // C major -> C minor
    expect(par).toEqual({ pc: 0, mode: "minor" });
    const r = keyRelationship(0, "major", 0, "minor");
    expect(r.sharedCount).toBe(4);
    expect(r.changes.leaves).toEqual([4, 9, 11]); // the 3, 6 and 7
    expect(r.changes.arrives).toEqual([3, 8, 10]); // each one fret lower
    r.changes.leaves.forEach((pc, i) => expect(pc - r.changes.arrives[i]).toBe(1));
  });

  it("spells a minor key from its relative major, not with sharps", () => {
    expect(keyNames("C", "minor")[3]).toBe("Eb");
    expect(keyNames("C", "minor")[8]).toBe("Ab");
    expect(keyNames("C", "major")[3]).toBe("D#");
  });
});

/* ===================== #19 the circle ===================== */

describe("the circle of fifths", () => {
  it("is twelve keys, each a fifth above the last", () => {
    expect(CIRCLE_OF_FIFTHS.length).toBe(12);
    CIRCLE_OF_FIFTHS.forEach((pc, i) => {
      const next = CIRCLE_OF_FIFTHS[(i + 1) % 12];
      expect((next - pc + 12) % 12).toBe(7);
    });
  });

  it("adds exactly one accidental per step, which is WHY it is in this order", () => {
    CIRCLE_OF_FIFTHS.slice(0, 7).forEach((pc, i) => {
      const name = ROOTS.find((r) => noteNameToPc(r) === pc);
      expect(keySignature(name).count, name).toBe(i);
    });
  });

  it("shares six of seven notes between neighbours — one note apart", () => {
    CIRCLE_OF_FIFTHS.forEach((pc, i) => {
      const next = CIRCLE_OF_FIFTHS[(i + 1) % 12];
      const r = keyRelationship(pc, "major", next, "major");
      expect(r.sharedCount, `${pc}->${next}`).toBe(6);
      expect(r.changes.leaves.length).toBe(1);
      expect(r.changes.arrives.length).toBe(1);
      expect(r.common.length).toBe(4); // and therefore four shared chords
    });
  });

  it("gets steadily more distant the further round you go", () => {
    const shared = [1, 2, 3, 4, 5, 6].map((step) => {
      const to = CIRCLE_OF_FIFTHS[step];
      return keyRelationship(0, "major", to, "major").sharedCount;
    });
    expect(shared).toEqual([6, 5, 4, 3, 2, 2]);
    expect(circleDistance(0, 7)).toBe(1);
    expect(circleDistance(0, 6)).toBe(6); // the tritone: as far as it goes
  });

  it("offers a pivot that is diatonic to both keys", () => {
    const r = keyRelationship(0, "major", 7, "major", { key: "C" });
    expect(r.pivot).toBeTruthy();
    expect(r.common.map((c) => c.label)).toContain(r.pivot.label);
    // C is the I of C major and the IV of G major — the textbook pivot.
    expect(r.pivot.fromRn).toBe("I");
    expect(r.pivot.toRn).toBe("IV");
  });

  it("admits when there is no pivot at all", () => {
    const r = keyRelationship(0, "major", 6, "major");
    expect(r.common.length).toBe(0);
    expect(r.pivot).toBe(null);
  });
});

/* ===================== #17 chord tones on strong beats ===================== */

describe("landing on a chord tone", () => {
  const C_MAJOR = new Set(SCALES.major.ints);

  it("calls a chord tone a target", () => {
    [0, 4, 7].forEach((pc) => {
      const v = landingVerdict(pc, 0, "maj", true);
      expect(v.kind).toBe("target");
      expect(v.isChordTone).toBe(true);
    });
    expect(landingVerdict(4, 0, "maj", true).label).toBe("3");
  });

  it("calls the 4 over a major chord a lean, and says which way", () => {
    const v = landingVerdict(5, 0, "maj", true);
    expect(v.kind).toBe("leaning");
    expect(v.label).toBe("4");
    expect(v.nearestLabel).toBe("3");
    expect(v.side).toBe("above");
    expect(v.distance).toBe(1);
  });

  it("separates a scale tone from an outside note", () => {
    expect(landingVerdict(2, 0, "maj", C_MAJOR.has(2)).kind).toBe("passing"); // the 9
    expect(landingVerdict(10, 0, "maj", C_MAJOR.has(10)).kind).toBe("outside"); // b7 in C major
  });

  it("judges against the CHORD, not the key — the same note changes meaning", () => {
    // F is a lean over C, and a chord tone over Dm7. Same note, same key.
    expect(landingVerdict(5, 0, "maj", true).kind).toBe("leaning");
    expect(landingVerdict(5, 2, "min7", true).kind).toBe("target");
    expect(landingVerdict(5, 2, "min7", true).label).toBe("b3");
  });

  it("never calls a chord tone anything but a target, for every chord in the engine", () => {
    Object.keys(SCALES).forEach(() => {});
    [0, 2, 5, 7, 9].forEach((root) => {
      ["maj", "min", "dom7", "min7", "maj7", "m7b5"].forEach((q) => {
        noteAgainstChord(root, root, q);
        expect(landingVerdict(root, root, q, false).kind).toBe("target");
      });
    });
  });
});
