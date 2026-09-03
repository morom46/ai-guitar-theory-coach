/**
 * Theory-engine tests.
 *
 * Every page derives its note names, degree labels and scale contents from
 * this one module, so a silent regression here mislabels the entire app at
 * once. These assertions pin the behaviour the new mic drills depend on:
 * enharmonic spelling per key, and degree numbering from a root.
 */

import { describe, it, expect } from "vitest";
import {
  ROOTS,
  DEG,
  SCALES,
  CHORDS,
  DIATONIC,
  INTERVALS,
  OPEN_MIDI,
  FRETS,
  noteNameToPc,
  buildNoteNames,
  majorScaleSpelling,
  midiToFreq,
} from "../src/theory/engine.js";

describe("note names", () => {
  it("parses naturals, sharps and flats", () => {
    expect(noteNameToPc("C")).toBe(0);
    expect(noteNameToPc("C#")).toBe(1);
    expect(noteNameToPc("Db")).toBe(1);
    expect(noteNameToPc("B")).toBe(11);
    expect(noteNameToPc("Cb")).toBe(11); // wraps below C
    expect(noteNameToPc("B#")).toBe(0); // wraps above B
  });

  it("round-trips all 12 practical roots", () => {
    const pcs = ROOTS.map(noteNameToPc);
    expect(new Set(pcs).size).toBe(12);
    expect([...pcs].sort((a, b) => a - b)).toEqual([...Array(12).keys()]);
  });
});

describe("major scale spelling", () => {
  it("uses one letter per degree, never a repeat", () => {
    ROOTS.forEach((root) => {
      const spelling = majorScaleSpelling(root);
      expect(spelling.length).toBe(7);
      const letters = spelling.map((n) => n[0]);
      expect(new Set(letters).size, `${root} major reuses a letter: ${spelling.join(" ")}`).toBe(7);
    });
  });

  it("spells the textbook cases correctly", () => {
    expect(majorScaleSpelling("C")).toEqual(["C", "D", "E", "F", "G", "A", "B"]);
    expect(majorScaleSpelling("G")).toEqual(["G", "A", "B", "C", "D", "E", "F#"]);
    expect(majorScaleSpelling("F")).toEqual(["F", "G", "A", "Bb", "C", "D", "E"]);
    expect(majorScaleSpelling("Eb")).toEqual(["Eb", "F", "G", "Ab", "Bb", "C", "D"]);
    expect(majorScaleSpelling("F#")).toEqual(["F#", "G#", "A#", "B", "C#", "D#", "E#"]);
  });

  it("matches the pitch classes of the major formula", () => {
    ROOTS.forEach((root) => {
      const pcs = majorScaleSpelling(root).map(noteNameToPc);
      const expected = SCALES.major.ints.map((i) => (noteNameToPc(root) + i) % 12);
      expect(pcs, root).toEqual(expected);
    });
  });
});

describe("buildNoteNames", () => {
  it("names all 12 pitch classes for every key", () => {
    ROOTS.forEach((root) => {
      const names = buildNoteNames(root);
      expect(names.length).toBe(12);
      names.forEach((n, pc) => {
        expect(n, `${root}: slot ${pc}`).toBeTruthy();
        expect(noteNameToPc(n), `${root}: ${n} should be pc ${pc}`).toBe(pc);
      });
    });
  });

  it("prefers flats in flat keys and sharps in sharp keys", () => {
    expect(buildNoteNames("F")[10]).toBe("Bb");
    expect(buildNoteNames("Eb")[3]).toBe("Eb");
    expect(buildNoteNames("G")[6]).toBe("F#");
    expect(buildNoteNames("A")[1]).toBe("C#");
  });
});

describe("degree labels", () => {
  it("covers all 12 semitones", () => {
    for (let i = 0; i < 12; i++) expect(DEG[i], `semitone ${i}`).toBeTruthy();
  });

  it("labels the ones the drills lean on", () => {
    expect(DEG[0]).toBe("1");
    expect(DEG[3]).toBe("b3");
    expect(DEG[4]).toBe("3");
    expect(DEG[6]).toBe("b5"); // the blue note
    expect(DEG[7]).toBe("5");
    expect(DEG[10]).toBe("b7");
  });
});

describe("scales and chords", () => {
  it("keeps every scale sorted, unique and inside one octave", () => {
    Object.entries(SCALES).forEach(([id, s]) => {
      expect(s.name, id).toBeTruthy();
      expect(s.formula, id).toBeTruthy();
      expect(s.ints[0], id).toBe(0);
      s.ints.forEach((i) => expect(i, `${id}: ${i}`).toBeLessThan(12));
      expect(new Set(s.ints).size, `${id} has a duplicate`).toBe(s.ints.length);
      expect([...s.ints].sort((a, b) => a - b), `${id} is not sorted`).toEqual(s.ints);
    });
  });

  it("has the right number of notes per scale", () => {
    expect(SCALES.major.ints.length).toBe(7);
    expect(SCALES.minorPent.ints.length).toBe(5);
    expect(SCALES.majorPent.ints.length).toBe(5);
    expect(SCALES.harmonicMinor.ints.length).toBe(7);
  });

  it("relates the modes correctly — all seven are rotations of the major scale", () => {
    const modes = ["major", "dorian", "phrygian", "lydian", "mixolydian", "aeolian", "locrian"];
    const majorPcs = SCALES.major.ints;
    modes.forEach((id, degree) => {
      const rotated = majorPcs
        .map((_, i) => (majorPcs[(degree + i) % 7] - majorPcs[degree] + 12) % 12)
        .sort((a, b) => a - b);
      expect(SCALES[id].ints, `${id} should be major rotated to degree ${degree + 1}`).toEqual(rotated);
    });
  });

  it("keeps minor pentatonic inside natural minor, major pentatonic inside major", () => {
    SCALES.minorPent.ints.forEach((i) => expect(SCALES.aeolian.ints).toContain(i));
    SCALES.majorPent.ints.forEach((i) => expect(SCALES.major.ints).toContain(i));
  });

  it("gives every chord a label per interval", () => {
    Object.entries(CHORDS).forEach(([id, c]) => {
      expect(c.ints.length, id).toBe(c.labels.length);
      expect(c.ints[0], id).toBe(0);
    });
  });

  it("builds triads that match their names", () => {
    expect(CHORDS.maj.ints).toEqual([0, 4, 7]);
    expect(CHORDS.min.ints).toEqual([0, 3, 7]);
    expect(CHORDS.dim.ints).toEqual([0, 3, 6]);
    expect(CHORDS.aug.ints).toEqual([0, 4, 8]);
  });

  it("harmonises the major scale into the seven diatonic triads", () => {
    expect(DIATONIC.length).toBe(7);
    const major = SCALES.major.ints;
    DIATONIC.forEach((d, i) => {
      // Stack 1-3-5 out of the scale and check the resulting quality.
      const third = (major[(i + 2) % 7] - major[i] + 12) % 12;
      const fifth = (major[(i + 4) % 7] - major[i] + 12) % 12;
      const quality = third === 4 ? "Maj" : fifth === 6 ? "dim" : "min";
      expect(quality, `degree ${i + 1} (${d.rn})`).toBe(d.q);
    });
  });

  it("names an interval for every semitone plus the octave", () => {
    // The first thirteen are unison through the octave. Past that are the
    // compound intervals the extended chords need in order to call a 9th a
    // 9th instead of a 2nd.
    expect(INTERVALS.length).toBeGreaterThanOrEqual(13);
    expect(INTERVALS[12].ab).toBe("P8");
    expect(INTERVALS[14].ab).toBe("9");
    expect(INTERVALS[17].ab).toBe("11");
    expect(INTERVALS[21].ab).toBe("13");
    INTERVALS.forEach((iv, i) => {
      expect(iv.name, `semitone ${i}`).toBeTruthy();
      expect(iv.ab, `semitone ${i}`).toBeTruthy();
      expect(iv.feel, `semitone ${i}`).toBeTruthy();
    });
  });
});

describe("the guitar", () => {
  it("describes standard tuning, high E first", () => {
    expect(OPEN_MIDI).toEqual([64, 59, 55, 50, 45, 40]);
    expect(FRETS).toBe(24);
  });

  it("puts every string a 4th apart except G→B, which is a 3rd", () => {
    const gaps = OPEN_MIDI.slice(0, -1).map((m, i) => m - OPEN_MIDI[i + 1]);
    expect(gaps).toEqual([5, 4, 5, 5, 5]);
  });

  it("makes fret 12 an octave on every string", () => {
    OPEN_MIDI.forEach((m) => expect(midiToFreq(m + 12) / midiToFreq(m)).toBeCloseTo(2, 10));
  });

  it("converts midi to concert pitch", () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 10); // A4
    expect(midiToFreq(40)).toBeCloseTo(82.407, 2); // low E
    expect(midiToFreq(64)).toBeCloseTo(329.628, 2); // high E
  });
});
