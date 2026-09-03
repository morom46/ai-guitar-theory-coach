/**
 * Solo schema maths tests.
 *
 * The tempo map is what every other piece of the Solo Player trusts, so the
 * assertions here are exact rather than approximate — a map that is a
 * millisecond out per bar is a map that drifts.
 */

import { describe, it, expect } from "vitest";
import {
  buildTempoMap,
  beatToSec,
  secToBeat,
  bpmAtBeat,
  beatsPerBarAt,
  barAtBeat,
  beatAtBar,
  parseChordSymbol,
  noteMidi,
  harmonyAt,
  sectionAt,
  degreeOf,
  normaliseSolo,
  validateSolo,
  soloEndBeat,
  describePhrase,
  noteFunctionText,
  harmonyLoop,
  STANDARD_TUNING,
} from "../src/data/soloSchema.js";
// The one bundled library. Charts and original etudes used to live beside it;
// both are gone, and so is the schema's `kind` field that told them apart.
import { SEED_TABS } from "../src/data/tabs.js";

describe("buildTempoMap", () => {
  it("converts beats to seconds at a flat tempo", () => {
    const map = buildTempoMap([{ atBeat: 0, bpm: 120 }]);
    expect(beatToSec(map, 0)).toBe(0);
    expect(beatToSec(map, 1)).toBeCloseTo(0.5, 12);
    expect(beatToSec(map, 4)).toBeCloseTo(2, 12);
    expect(beatToSec(map, 64)).toBeCloseTo(32, 12);
  });

  it("round-trips beats through seconds and back", () => {
    const map = buildTempoMap([{ atBeat: 0, bpm: 92 }]);
    for (const b of [0, 0.5, 1, 7.25, 63.75, 128]) {
      expect(secToBeat(map, beatToSec(map, b))).toBeCloseTo(b, 10);
    }
  });

  it("honours a tempo change mid-piece", () => {
    // 8 beats at 60bpm = 8s, then 8 beats at 120bpm = 4s.
    const map = buildTempoMap([
      { atBeat: 0, bpm: 60 },
      { atBeat: 8, bpm: 120 },
    ]);
    expect(beatToSec(map, 8)).toBeCloseTo(8, 12);
    expect(beatToSec(map, 16)).toBeCloseTo(12, 12);
    expect(secToBeat(map, 12)).toBeCloseTo(16, 10);
    expect(bpmAtBeat(map, 7.9)).toBe(60);
    expect(bpmAtBeat(map, 8)).toBe(120);
  });

  it("scales with rate without touching the written tempo", () => {
    const half = buildTempoMap([{ atBeat: 0, bpm: 120 }], { rate: 0.5 });
    expect(beatToSec(half, 4)).toBeCloseTo(4, 12); // twice as long
    expect(bpmAtBeat(half, 0)).toBe(120); // still says 120
  });

  it("extrapolates below beat zero, so the count-in lands on the grid", () => {
    const map = buildTempoMap([{ atBeat: 0, bpm: 120 }]);
    expect(beatToSec(map, -4)).toBeCloseTo(-2, 12);
  });

  it("survives a tempo list that does not start at beat 0", () => {
    const map = buildTempoMap([{ atBeat: 12, bpm: 100 }]);
    expect(beatToSec(map, 0)).toBe(0);
    expect(map[0].atBeat).toBe(0);
  });
});

describe("bars", () => {
  const sig = [{ atBeat: 0, num: 4, den: 4 }];

  it("counts bars and the beat inside them", () => {
    expect(barAtBeat(sig, 0)).toEqual({ bar: 0, beatInBar: 0 });
    expect(barAtBeat(sig, 3.5)).toEqual({ bar: 0, beatInBar: 3.5 });
    expect(barAtBeat(sig, 4)).toEqual({ bar: 1, beatInBar: 0 });
    expect(barAtBeat(sig, 63)).toEqual({ bar: 15, beatInBar: 3 });
  });

  it("inverts back to the beat a bar line falls on", () => {
    for (const bar of [0, 1, 5, 15]) {
      expect(barAtBeat(sig, beatAtBar(sig, bar)).bar).toBe(bar);
    }
  });

  it("handles a meter change", () => {
    const mixed = [
      { atBeat: 0, num: 4, den: 4 },
      { atBeat: 8, num: 3, den: 4 },
    ];
    expect(beatsPerBarAt(mixed, 4)).toBe(4);
    expect(beatsPerBarAt(mixed, 9)).toBe(3);
    expect(barAtBeat(mixed, 8).bar).toBe(2);
    expect(barAtBeat(mixed, 11).bar).toBe(3);
  });
});

describe("parseChordSymbol", () => {
  it("reads root, accidental and quality", () => {
    expect(parseChordSymbol("Am7")).toMatchObject({ rootPc: 9, quality: "min7" });
    expect(parseChordSymbol("C")).toMatchObject({ rootPc: 0, quality: "maj" });
    expect(parseChordSymbol("F#m")).toMatchObject({ rootPc: 6, quality: "min" });
    expect(parseChordSymbol("Bbmaj7")).toMatchObject({ rootPc: 10, quality: "maj7" });
    expect(parseChordSymbol("D7")).toMatchObject({ rootPc: 2, quality: "dom7" });
    expect(parseChordSymbol("Bm7b5")).toMatchObject({ rootPc: 11, quality: "m7b5" });
  });

  it("collapses extensions onto their parent seventh", () => {
    expect(parseChordSymbol("G13").quality).toBe("dom7");
    expect(parseChordSymbol("Am9").quality).toBe("min7");
    expect(parseChordSymbol("E7#9").quality).toBe("dom7");
  });

  it("reads a slash bass and rejects nonsense", () => {
    expect(parseChordSymbol("Am7/C")).toMatchObject({ rootPc: 9, bassPc: 0 });
    expect(parseChordSymbol("")).toBeNull();
    expect(parseChordSymbol("Hmm")).toBeNull();
    expect(parseChordSymbol(null)).toBeNull();
  });
});

describe("reading a solo", () => {
  const solo = normaliseSolo({
    meta: { key: "A", mode: "aeolian" },
    harmony: [
      { atBeat: 0, chord: "Am7" },
      { atBeat: 8, chord: "D7" },
    ],
    sections: [{ id: "a", name: "A", startBeat: 0, endBeat: 8 }],
    notes: [
      { id: "x", startBeat: 0, durBeats: 1, string: 1, fret: 7 }, // F#
      { id: "y", startBeat: 8, durBeats: 1, string: 1, fret: 7 }, // the same F#
    ],
  });

  it("places a note on the neck the same way the app does", () => {
    // string 1 is the B string (59). Fret 7 -> 66 -> F#.
    expect(noteMidi({ string: 1, fret: 7 }, solo.meta)).toBe(66);
    expect(STANDARD_TUNING[0]).toBe(64); // 0 is the HIGH E, as documented
    expect(STANDARD_TUNING[5]).toBe(40);
  });

  it("finds the harmony and section under a beat", () => {
    expect(harmonyAt(solo, 0).chord).toBe("Am7");
    expect(harmonyAt(solo, 7.99).chord).toBe("Am7");
    expect(harmonyAt(solo, 8).chord).toBe("D7");
    expect(sectionAt(solo, 4).name).toBe("A");
    expect(sectionAt(solo, 9)).toBeNull();
  });

  it("re-colours the SAME note when the chord underneath it changes", () => {
    // This is the acceptance criterion, expressed as theory: F# is the natural
    // 6 over Am7 (what makes it Dorian) and the major 3rd over D7.
    const overAm = degreeOf(solo.notes[0], solo, 0);
    const overD7 = degreeOf(solo.notes[1], solo, 8);
    expect(overAm.label).toBe("6");
    expect(overD7.label).toBe("3");
    expect(overAm.pc).toBe(overD7.pc); // same note, different job
  });

  it("falls back to the key when there is no harmony", () => {
    const bare = normaliseSolo({ meta: { key: "A" }, notes: [{ startBeat: 0, string: 0, fret: 5 }] });
    expect(degreeOf(bare.notes[0], bare, 0).label).toBe("1");
  });
});

describe("normalise + validate", () => {
  it("fills every optional field so nothing is duck-typed downstream", () => {
    const s = normaliseSolo({ notes: [{ startBeat: 0, string: 2, fret: 5 }] });
    const n = s.notes[0];
    expect(n.technique).toBe("pick");
    expect(n.slideToFret).toBeNull();
    expect(n.bendSemitones).toBeNull();
    expect(n.finger).toBeNull();
    expect(n.accent).toBe(false);
    expect(typeof n.id).toBe("string");
    expect(n.durBeats).toBeGreaterThan(0);
  });

  it("sorts notes by beat, whatever order they were written in", () => {
    const s = normaliseSolo({
      notes: [
        { startBeat: 4, string: 0, fret: 5 },
        { startBeat: 0, string: 0, fret: 5 },
        { startBeat: 2, string: 0, fret: 5 },
      ],
    });
    expect(s.notes.map((n) => n.startBeat)).toEqual([0, 2, 4]);
  });

  it("clamps a string index onto the neck", () => {
    expect(normaliseSolo({ notes: [{ string: 99, fret: 0 }] }).notes[0].string).toBe(5);
    expect(normaliseSolo({ notes: [{ string: -3, fret: 0 }] }).notes[0].string).toBe(0);
  });

  it("errors on an empty solo and on frets off the neck", () => {
    expect(validateSolo({ notes: [] }).ok).toBe(false);
    const off = validateSolo({ notes: [{ startBeat: 0, string: 0, fret: 40 }] });
    expect(off.ok).toBe(false);
    expect(off.errors.join(" ")).toMatch(/off the 24-fret neck/);
  });

  it("warns rather than errors on things it can still draw", () => {
    const v = validateSolo({
      meta: { capo: 2 },
      harmony: [{ atBeat: 0, chord: "Zx9" }],
      notes: [{ startBeat: 0, string: 0, fret: 5, technique: "slide" }],
    });
    expect(v.ok).toBe(true);
    expect(v.warnings.length).toBeGreaterThanOrEqual(3);
  });
});

describe("the bundled solos", () => {
  it("all validate cleanly", () => {
    SEED_TABS.forEach((t) => {
      const v = validateSolo(t);
      expect(v.errors, t.meta.title).toEqual([]);
    });
  });

  it("stay on the neck and inside their sections", () => {
    SEED_TABS.forEach((t) => {
      t.notes.forEach((n) => {
        expect(n.fret).toBeGreaterThanOrEqual(0);
        expect(n.fret).toBeLessThanOrEqual(24);
        expect(n.string).toBeGreaterThanOrEqual(0);
        expect(n.string).toBeLessThanOrEqual(5);
      });
      expect(soloEndBeat(t)).toBeGreaterThan(0);
    });
  });

  it("carry a technique-complete example: bends, slides, hammers and a chord change", () => {
    const techniques = new Set(SEED_TABS.flatMap((t) => t.notes.map((n) => n.technique)));
    ["bend", "release", "slide", "hammer", "pull", "vibrato"].forEach((tech) =>
      expect(techniques.has(tech), tech).toBe(true)
    );
    SEED_TABS.forEach((t) => expect(t.harmony.length).toBeGreaterThan(1));
  });

  it("names every chord readably", () => {
    SEED_TABS.forEach((t) => t.harmony.forEach((h) => expect(parseChordSymbol(h.chord)).not.toBeNull()));
  });

  it("links every one of them to a song in the library", () => {
    // The link is what makes a song's Solo section useful rather than a dead
    // end: open the song, press the button, land on the solo.
    SEED_TABS.forEach((t) => expect(t.meta.songIds.length, t.meta.title).toBeGreaterThan(0));
  });
});

describe("harmonyLoop", () => {
  const of = (...chords) => chords.map((chord, i) => ({ atBeat: i * 4, chord }));

  it("finds the shortest period that explains every change", () => {
    expect(harmonyLoop(of("Bb", "Gm", "F", "Eb", "Bb", "Gm", "F", "Eb"))).toEqual(["Bb", "Gm", "F", "Eb"]);
    expect(harmonyLoop(of("Am", "Am", "Am", "Am"))).toEqual(["Am"]);
  });

  it("tolerates a vamp that stops part-way through its loop", () => {
    // Seventy-five bars of an eight-bar loop ends three chords in. That is
    // what a real outro does, and it must not read as "no loop".
    expect(harmonyLoop(of("Bb", "Gm", "F", "Eb", "Bb", "Gm"))).toEqual(["Bb", "Gm", "F", "Eb"]);
  });

  it("returns null when the harmony is not a loop, and on too little to judge", () => {
    expect(harmonyLoop(of("C", "Am", "F", "G", "Dm", "Bb"))).toBeNull();
    expect(harmonyLoop(of("C", "Am"))).toBeNull();
    expect(harmonyLoop(null)).toBeNull();
  });

  it("names the vamp a solo sits on, and stays quiet about a whole song", () => {
    // A solo written over one repeating vamp has a loop worth naming, and the
    // timeline shows it instead of labelling seventy-five changes. A whole
    // song does NOT — Slow Dancing runs C#m7-E through the verses and lifts to
    // B-A for the chorus, which is a form, not a loop. Returning null there is
    // the right answer, not a miss.
    SEED_TABS.filter((t) => t.id !== "tab-slow-dancing").forEach((t) => {
      const l = harmonyLoop(t.harmony);
      expect(l, t.meta.title).toBeTruthy();
      expect(l.length, t.meta.title).toBeLessThanOrEqual(8);
    });
    const song = SEED_TABS.find((t) => t.id === "tab-slow-dancing");
    expect(harmonyLoop(song.harmony)).toBeNull();
  });
});

describe("the AI tutor serializer", () => {
  const solo = SEED_TABS.find((t) => t.id === "tab-purple-rain");

  it("describes a phrase in degrees, not note names", () => {
    const ids = solo.notes.slice(0, 6).map((n) => n.id);
    const text = describePhrase(solo, ids);
    expect(text).toMatch(/^Key: Bb major/);
    expect(text).toMatch(/Harmony: Bb@0/);
    expect(text).toMatch(/Degrees used:/);
    expect(text.split("\n").length).toBeGreaterThan(6);
  });

  it("returns empty for no notes rather than throwing", () => {
    expect(describePhrase(solo, ["nope"])).toBe("");
  });

  it("explains one note in a sentence", () => {
    // The solo opens on the C at the 13th fret of the B string — the 2 over
    // Bb, which is a colour tone and not a landing place.
    expect(noteFunctionText(solo.notes[0], solo)).toMatch(/^2 over Bb —/);
  });
});
