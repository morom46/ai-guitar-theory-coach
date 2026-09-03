/**
 * VOICE LEADING + CHORD GRAVITY.
 *
 * These two modules are the first in the app that make a musical JUDGEMENT
 * rather than just listing facts — one picks a voicing, the other claims one
 * chord pulls harder than another. Both are easy to break silently, and both
 * are now drawn on screen as arrows and lines, so a regression here draws a
 * confident picture of something untrue.
 */

import { describe, it, expect } from "vitest";
import {
  CHORDS,
  SCALES,
  DIATONIC,
  DIATONIC_MINOR,
  CHORD_FAMILY,
  chordPcs,
  identifyChord,
  chordsIn,
  scalesContaining,
  diatonicChords,
  chordsContaining,
  chordToneLabel,
  tritoneOf,
} from "../src/theory/engine.js";
import {
  rootPosition,
  invert,
  inversions,
  candidateVoicings,
  distance,
  nearestVoicing,
  voiceLead,
  motion,
  totalMotion,
  commonTones,
  inversionOf,
  LOW,
  HIGH,
  MAX_SPAN,
} from "../src/theory/voicing.js";
import {
  PULL_MAJOR,
  PULL_MINOR,
  pullsFrom,
  resolutionOf,
  secondaryDominant,
  tritoneSub,
  tritoneResolution,
  borrowedChords,
  gravityMap,
  dominantOf,
} from "../src/theory/harmony.js";

const pcsOf = (midis) => [...new Set(midis.map((m) => ((m % 12) + 12) % 12))].sort((a, b) => a - b);

/* ============================ the new tables ============================ */

describe("scales and chords added for the theory lessons", () => {
  it("keeps every scale a sorted, unique set starting on the root", () => {
    Object.entries(SCALES).forEach(([id, s]) => {
      expect(s.ints[0], id).toBe(0);
      expect(new Set(s.ints).size, id).toBe(s.ints.length);
      expect([...s.ints].sort((a, b) => a - b), id).toEqual(s.ints);
      expect(s.ints[s.ints.length - 1], id).toBeLessThan(12);
      expect(s.name && s.formula, id).toBeTruthy();
    });
  });

  it("has the blues scale as minor pentatonic plus the b5", () => {
    const added = SCALES.blues.ints.filter((i) => !SCALES.minorPent.ints.includes(i));
    expect(added).toEqual([6]);
  });

  it("puts melodic minor one note from harmonic minor and two from aeolian", () => {
    const diff = (a, b) => a.filter((n) => !b.includes(n)).length;
    // Harmonic minor already has the raised 7; melodic minor also raises the 6.
    expect(diff(SCALES.melodicMinor.ints, SCALES.harmonicMinor.ints)).toBe(1);
    expect(diff(SCALES.melodicMinor.ints, SCALES.aeolian.ints)).toBe(2);
    // Lydian dominant and altered are its modes — same seven notes, moved.
    const rotate = (ints, root) => [...ints.map((i) => (i + root) % 12)].sort((a, b) => a - b);
    expect(rotate(SCALES.lydianDom.ints, 5)).toEqual(rotate(SCALES.melodicMinor.ints, 0));
    expect(rotate(SCALES.altered.ints, 11)).toEqual(rotate(SCALES.melodicMinor.ints, 0));
  });

  it("labels every chord tone of every chord", () => {
    Object.entries(CHORDS).forEach(([id, c]) => {
      expect(c.labels.length, id).toBe(c.ints.length);
      expect(c.ints[0], id).toBe(0);
      expect([...c.ints].sort((a, b) => a - b), id).toEqual(c.ints);
      // Extensions stack ABOVE the octave — that is what makes a 9th a 9th
      // rather than a 2nd, and duplicate pitch classes would break naming.
      expect(new Set(c.ints.map((i) => i % 12)).size, id).toBe(c.ints.length);
    });
  });

  it("files every chord in exactly one family", () => {
    const filed = Object.values(CHORD_FAMILY).flatMap((f) => f.ids);
    expect([...filed].sort()).toEqual(Object.keys(CHORDS).sort());
    expect(new Set(filed).size).toBe(filed.length);
  });

  it("stacks the extensions in thirds", () => {
    // 1-3-5-7-9-11-13: every step is three or four semitones.
    ["maj9", "dom9", "min9", "dom11", "min11"].forEach((id) => {
      const gaps = CHORDS[id].ints.slice(1).map((v, i) => v - CHORDS[id].ints[i]);
      gaps.forEach((g) => expect(g, id).toBeGreaterThanOrEqual(3));
      gaps.forEach((g) => expect(g, id).toBeLessThanOrEqual(4));
    });
  });
});

describe("the minor-key harmonisation map", () => {
  it("stacks its triads out of the natural minor scale", () => {
    const aeolian = SCALES.aeolian.ints;
    DIATONIC_MINOR.forEach((d, i) => {
      expect(d.semis, d.rn).toBe(aeolian[i]);
      const third = (aeolian[(i + 2) % 7] - aeolian[i] + 12) % 12;
      const fifth = (aeolian[(i + 4) % 7] - aeolian[i] + 12) % 12;
      const quality = third === 4 ? "maj" : fifth === 6 ? "dim" : "min";
      expect(quality, `${d.rn}`).toBe(d.quality);
    });
  });

  it("is the relative major, rotated — same seven chords, different home", () => {
    const aMinor = diatonicChords(9, "minor", "A").map((c) => c.pcs.join(","));
    const cMajor = diatonicChords(0, "major", "C").map((c) => c.pcs.join(","));
    expect([...aMinor].sort()).toEqual([...cMajor].sort());
  });

  it("gives every chord in both keys one of the three functions", () => {
    [...DIATONIC, ...DIATONIC_MINOR].forEach((d) => {
      expect(["T", "S", "D"], d.rn).toContain(d.fn);
      expect(d.why, d.rn).toBeTruthy();
    });
  });

  it("keeps the minor v minor — which is why it barely pulls", () => {
    expect(DIATONIC_MINOR[4].quality).toBe("min");
    expect(DIATONIC[4].quality).toBe("maj");
  });
});

/* ============================ notes -> name ============================ */

describe("identifyChord", () => {
  it("names a plain triad", () => {
    const c = identifyChord([0, 4, 7], { key: "C" });
    expect(c.label).toBe("C");
    expect(c.quality).toBe("maj");
    expect(c.inversion).toBe(0);
  });

  it("names the inversion from the bass note", () => {
    const c = identifyChord([4, 7, 0], { bassPc: 4, key: "C" });
    expect(c.label).toBe("C/E");
    expect(c.inversion).toBe(1);
    expect(c.inversionName).toMatch(/3rd in the bass/);
  });

  it("reads the same four notes two ways depending on what is underneath", () => {
    // C-E-G-A is C6 over C and Am7 over A. Both are true; the bass decides.
    expect(identifyChord([0, 4, 7, 9], { bassPc: 0, key: "C" }).label).toBe("C6");
    expect(identifyChord([0, 4, 7, 9], { bassPc: 9, key: "C" }).label).toBe("Am7");
  });

  it("ignores octaves and duplicates", () => {
    expect(identifyChord([12, 28, 7, 0, 24], { key: "C" }).label).toBe("C");
  });

  it("names a dominant 7th and finds its tritone", () => {
    const c = identifyChord([7, 11, 2, 5], { bassPc: 7, key: "C" });
    expect(c.label).toBe("G7");
    const tt = tritoneOf(7, "dom7");
    expect(tt.third.pc).toBe(11);
    expect(tt.seventh.pc).toBe(5);
    expect((tt.seventh.pc - tt.third.pc + 12) % 12).toBe(6);
  });

  it("admits when a chord has more than one honest name", () => {
    // A diminished 7th is four minor thirds: every note can be the root.
    const c = identifyChord([0, 3, 6, 9], { key: "C" });
    expect(c.quality).toBe("dim7");
    expect(c.alternatives.length).toBeGreaterThan(0);
    c.alternatives.forEach((a) => expect(a.quality).toBe("dim7"));
  });

  it("returns null rather than guessing at a non-chord", () => {
    expect(identifyChord([0, 1, 2, 3])).toBe(null);
    expect(identifyChord([0])).toBe(null);
  });

  it("round-trips every chord in the table, from every root", () => {
    Object.keys(CHORDS).forEach((id) => {
      for (let root = 0; root < 12; root++) {
        const found = identifyChord(chordPcs(root, id), { bassPc: root });
        expect(found, `${id} on ${root}`).toBeTruthy();
        // Some sets genuinely have two names (C6 / Am7); what must hold is
        // that the notes come back identical.
        expect(chordPcs(found.rootPc, found.quality).sort((a, b) => a - b))
          .toEqual(chordPcs(root, id).sort((a, b) => a - b));
      }
    });
  });
});

describe("chords <-> scales", () => {
  it("finds the diatonic seventh chords of a major key", () => {
    const found = chordsIn("major", 0).filter((c) => CHORDS[c.quality].ints.length === 4);
    const labels = found.map((c) => `${c.rootPc}:${c.quality}`);
    expect(labels).toContain("7:dom7"); // G7 — the only dominant in the key
    expect(labels).toContain("0:maj7");
    expect(labels).toContain("11:m7b5");
    expect(labels).not.toContain("7:maj7"); // Gmaj7 needs an F#
  });

  it("only returns chords whose notes are all in the scale", () => {
    const inScale = new Set(SCALES.aeolian.ints.map((i) => (i + 9) % 12));
    chordsIn("aeolian", 9).forEach((c) => {
      c.pcs.forEach((pc) => expect(inScale.has(pc), `${c.quality} on ${c.rootPc}`).toBe(true));
    });
  });

  it("finds which scales contain a chord, tightest first", () => {
    const found = scalesContaining([7, 11, 2, 5]); // G7
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((f) => f.scaleId === "major" && f.rootPc === 0)).toBe(true);
    expect(found.some((f) => f.scaleId === "mixolydian" && f.rootPc === 7)).toBe(true);
    for (let i = 1; i < found.length; i++) {
      expect(found[i].size).toBeGreaterThanOrEqual(found[i - 1].size);
    }
  });

  it("harmonises a single note into every chord that contains it", () => {
    // The note E in C major lives in C, Em and Am — three harmonic homes.
    const homes = chordsContaining(4, 0, "major", "C").map((c) => c.rn);
    expect(homes).toEqual(["I", "iii", "vi"]);
  });

  it("can name the note's job inside each of those homes", () => {
    // Same note, three different jobs — which is the whole point of #18.
    const jobs = chordsContaining(4, 0, "major", "C").map((c) =>
      chordToneLabel(c.rootPc, c.quality, 4)
    );
    expect(jobs).toEqual(["3", "1", "5"]);
  });

  it("filters the chord list by family, for a UI that has to fit on screen", () => {
    const triads = chordsIn("major", 0, { family: "triad" });
    triads.forEach((c) => expect(CHORD_FAMILY.triad.ids).toContain(c.quality));
    // A five-note scale hosts far fewer chords than a seven-note one, and
    // that is a fact worth surfacing rather than a bug.
    const pent = chordsIn("minorPent", 9, { family: "seventh" });
    expect(pent.map((c) => `${c.rootPc}:${c.quality}`).sort()).toEqual(["0:six", "9:min7"]);
  });

  it("never offers a chord whose notes leave the scale", () => {
    Object.keys(SCALES).forEach((id) => {
      const inScale = new Set(SCALES[id].ints);
      chordsIn(id, 0).forEach((c) => {
        c.pcs.forEach((pc) => expect(inScale.has(pc), `${id}: ${c.quality} on ${c.rootPc}`).toBe(true));
      });
    });
  });
});

/* ============================ voice leading ============================ */

describe("voicings", () => {
  it("inverts by lifting the lowest note an octave", () => {
    expect(invert([48, 52, 55], 1)).toEqual([52, 55, 60]);
    expect(invert([48, 52, 55], 2)).toEqual([55, 60, 64]);
    // All the way round is the same chord, an octave up.
    expect(invert([48, 52, 55], 3)).toEqual([60, 64, 67]);
    expect(inversions([48, 52, 55]).length).toBe(3);
  });

  it("keeps the pitch classes identical through every inversion", () => {
    inversions(rootPosition(0, "maj7")).forEach((v) => {
      expect(pcsOf(v)).toEqual([0, 4, 7, 11]);
    });
  });

  it("reads the inversion off whichever chord tone is in the bass", () => {
    expect(inversionOf([48, 52, 55], 0, "maj")).toBe(0);
    expect(inversionOf([52, 55, 60], 0, "maj")).toBe(1);
    expect(inversionOf([55, 60, 64], 0, "maj")).toBe(2);
  });

  it("only offers candidates inside the register and inside a hand-span", () => {
    const cands = candidateVoicings(0, "maj");
    expect(cands.length).toBeGreaterThan(1);
    cands.forEach((v) => {
      expect(pcsOf(v)).toEqual([0, 4, 7]);
      expect(Math.min(...v)).toBeGreaterThanOrEqual(LOW);
      expect(Math.max(...v)).toBeLessThanOrEqual(HIGH);
      expect(Math.max(...v) - Math.min(...v)).toBeLessThanOrEqual(MAX_SPAN);
    });
  });

  it("measures movement voice by voice", () => {
    expect(distance([60, 64, 67], [60, 64, 67])).toBe(0);
    expect(distance([60, 64, 67], [59, 62, 67])).toBe(3);
  });

  it("picks the nearest voicing, holding the common tone still", () => {
    const cMajor = [60, 64, 67];
    const aMinor = nearestVoicing(cMajor, 9, "min");
    expect(pcsOf(aMinor)).toEqual([0, 4, 9]);
    expect(distance(cMajor, aMinor)).toBeLessThanOrEqual(2);
    const held = motion(cMajor, aMinor).filter((m) => m.common);
    expect(held.length).toBe(2); // C and E are in both chords and never move
  });
});

describe("voice leading a progression", () => {
  const prog = [
    { rootPc: 0, quality: "maj" },
    { rootPc: 9, quality: "min" },
    { rootPc: 5, quality: "maj" },
    { rootPc: 7, quality: "maj" },
    { rootPc: 0, quality: "maj" },
  ];

  it("starts both versions on the same chord, so the comparison is honest", () => {
    expect(voiceLead(prog, { mode: "root" })[0].midis).toEqual(voiceLead(prog, { mode: "nearest" })[0].midis);
  });

  it("moves dramatically less than root position — the entire lesson", () => {
    const root = totalMotion(voiceLead(prog, { mode: "root" }));
    const near = totalMotion(voiceLead(prog, { mode: "nearest" }));
    expect(near).toBeLessThan(root / 3);
  });

  it("never changes which notes are in the chord, only where they sit", () => {
    voiceLead(prog, { mode: "nearest" }).forEach((c) => {
      expect(pcsOf(c.midis)).toEqual(chordPcs(c.rootPc, c.quality).sort((a, b) => a - b));
    });
  });

  it("holds every available common tone between adjacent chords", () => {
    const voiced = voiceLead(prog, { mode: "nearest" });
    for (let i = 1; i < voiced.length; i++) {
      const shared = commonTones(voiced[i - 1].midis, voiced[i].midis);
      const held = motion(voiced[i - 1].midis, voiced[i].midis).filter((m) => m.common).length;
      expect(held, `chord ${i}`).toBe(shared);
    }
  });

  it("uses inversions to do it — that is what an inversion IS", () => {
    const voiced = voiceLead(prog, { mode: "nearest" });
    const inverted = voiced.filter((c) => inversionOf(c.midis, c.rootPc, c.quality) > 0);
    expect(inverted.length).toBeGreaterThan(0);
  });

  it("stays inside the register it was given", () => {
    voiceLead(prog, { mode: "nearest", low: 55, high: 72 }).slice(1).forEach((c) => {
      expect(Math.min(...c.midis)).toBeGreaterThanOrEqual(55);
      expect(Math.max(...c.midis)).toBeLessThanOrEqual(72);
    });
  });
});

/* ============================ chord gravity ============================ */

describe("chord gravity", () => {
  it("points every edge at a real degree of the key", () => {
    [PULL_MAJOR, PULL_MINOR].forEach((table) => {
      table.forEach((e) => {
        expect(e.from).toBeGreaterThanOrEqual(0);
        expect(e.from).toBeLessThan(7);
        expect(e.to).toBeGreaterThanOrEqual(0);
        expect(e.to).toBeLessThan(7);
        expect(e.from).not.toBe(e.to);
        expect(e.w).toBeGreaterThan(0);
        expect(e.w).toBeLessThanOrEqual(1);
        expect(e.why).toBeTruthy();
      });
    });
  });

  it("makes V->I the strongest pull in a major key", () => {
    const strongest = [...PULL_MAJOR].sort((a, b) => b.w - a.w)[0];
    expect(strongest.from).toBe(4); // V
    expect(strongest.to).toBe(0); // I
    expect(resolutionOf(4, "major").to).toBe(0);
    expect(resolutionOf(1, "major").to).toBe(4); // ii wants V
  });

  it("makes bVII->i the strongest pull in a minor key, not v->i", () => {
    const strongest = [...PULL_MINOR].sort((a, b) => b.w - a.w)[0];
    expect(strongest.from).toBe(6);
    expect(strongest.to).toBe(0);
    const v = PULL_MINOR.find((e) => e.from === 4 && e.to === 0);
    expect(v.w).toBeLessThan(strongest.w);
  });

  it("only ever pulls out of a chord toward chords that exist", () => {
    const map = gravityMap(0, "major", "C");
    expect(map.chords.length).toBe(7);
    map.chords.forEach((c, i) => {
      c.out.forEach((e) => expect(e.from).toBe(i));
      c.in.forEach((e) => expect(e.to).toBe(i));
      expect(c.pcs.length).toBeGreaterThanOrEqual(3);
    });
    // Sorted strongest-first, so a UI can just take [0].
    map.chords.forEach((c) => {
      for (let i = 1; i < c.out.length; i++) expect(c.out[i].w).toBeLessThanOrEqual(c.out[i - 1].w);
    });
  });

  it("hands the minor-key drill a REAL dominant, not the powerless v", () => {
    const d = dominantOf(9, "minor", "A");
    expect(d.quality).toBe("dom7");
    expect(d.rootPc).toBe(4); // E7 in A minor
    expect(d.tritone).toBeTruthy();
  });
});

describe("secondary dominants and tritone substitution", () => {
  it("aims a dominant 7th a fifth above its target", () => {
    const sd = secondaryDominant(9, { key: "C", targetLabel: "vi" });
    expect(sd.rootPc).toBe(4); // E7 -> Am
    expect(sd.quality).toBe("dom7");
    expect(sd.rn).toBe("V7/vi");
  });

  it("substitutes the dominant a tritone away, sharing the identical pair", () => {
    const sub = tritoneSub(7, { key: "C" }); // G7 -> Db7
    expect(sub.rootPc).toBe(1);
    expect(sub.label).toBe("Db7");
    const a = tritoneOf(7, "dom7").pcs.sort((x, y) => x - y);
    const b = tritoneOf(1, "dom7").pcs.sort((x, y) => x - y);
    expect(a).toEqual(b); // the same two notes, jobs swapped
    // …and swapped they are: G7's 3rd is Db7's b7.
    expect(tritoneOf(7, "dom7").third.pc).toBe(tritoneOf(1, "dom7").seventh.pc);
  });

  it("resolves the tritone inward by a semitone on each side", () => {
    const r = tritoneResolution(7, { key: "C" }); // G7 -> C
    expect(r.targetPc).toBe(0);
    expect(r.moves[0].from).toBe(11); // B rises to C
    expect(r.moves[0].to).toBe(0);
    expect(r.moves[1].from).toBe(5); // F falls to E
    expect(r.moves[1].to).toBe(4);
    // Contrary motion — one up, one down.
    expect(r.moves[0].dir).toBe(1);
    expect(r.moves[1].dir).toBe(-1);
  });
});

describe("borrowed chords", () => {
  const inC = borrowedChords(0, { key: "C" });

  it("borrows from the parallel minor and spells it flat", () => {
    const by = Object.fromEntries(inC.map((b) => [b.rn, b]));
    expect(by.iv.label).toBe("Fm");
    expect(by.bVI.label).toBe("Ab");
    expect(by.bVII.label).toBe("Bb");
    expect(by.bIII.label).toBe("Eb");
  });

  it("names the note each one drags in from the parallel minor", () => {
    inC.forEach((b) => {
      expect(b.newNotes.length, b.rn).toBeGreaterThan(0);
      // Every borrowed note must be foreign to the major key…
      const major = new Set(SCALES.major.ints);
      b.newNotes.forEach((pc) => expect(major.has(pc), `${b.rn} ${pc}`).toBe(false));
      // …and native to the parallel minor.
      const minor = new Set(SCALES.aeolian.ints);
      b.newNotes.forEach((pc) => expect(minor.has(pc), `${b.rn} ${pc}`).toBe(true));
    });
  });

  it("replaces a chord that really is on that degree", () => {
    inC.forEach((b) => {
      expect(DIATONIC[b.replaces].rn).toBe(b.replacesRn);
    });
  });
});
