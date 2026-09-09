/**
 * CHORD SYMBOLS.
 *
 * The song library now carries charts as text, so the parser is the thing
 * standing between "Fmaj7" written on a page and a diagram claiming to be
 * that chord. These tests are mostly about it not lying: the quality it
 * returns has to be the quality that was written, or it has to say it is an
 * approximation.
 */

import { describe, it, expect } from "vitest";
import {
  parseChord,
  parseChordList,
  chordSymbol,
  transposeChord,
  chordDegree,
  chordTonePcs,
} from "../src/theory/chordSymbol.js";
import { CHORDS, noteNameToPc } from "../src/theory/engine.js";
import { findVoicings } from "../src/theory/voicings.js";
import { SEED_SONGS, backfillChart } from "../src/data/songs.js";

describe("reading a chord symbol", () => {
  it("reads plain triads", () => {
    expect(parseChord("C")).toMatchObject({ rootPc: 0, quality: "maj", bassPc: null });
    expect(parseChord("Am")).toMatchObject({ rootPc: 9, quality: "min" });
    expect(parseChord("F#m")).toMatchObject({ rootPc: 6, quality: "min" });
    expect(parseChord("Bb")).toMatchObject({ rootPc: 10, quality: "maj" });
  });

  it("keeps the quality it was given instead of collapsing it", () => {
    // The parser in soloSchema.js deliberately flattens these onto their
    // parent seventh. This one must not: a chord box has to draw the grip
    // that was actually written.
    expect(parseChord("Fmaj7").quality).toBe("maj7");
    expect(parseChord("G7").quality).toBe("dom7");
    expect(parseChord("Am7").quality).toBe("min7");
    expect(parseChord("Dsus4").quality).toBe("sus4");
    expect(parseChord("Cadd9").quality).toBe("add9");
    expect(parseChord("Bm7b5").quality).toBe("m7b5");
    expect(parseChord("C6").quality).toBe("six");
  });

  it("accepts unicode accidentals and odd casing", () => {
    expect(parseChord("F♯m7")).toMatchObject({ rootPc: 6, quality: "min7" });
    expect(parseChord("B♭maj7")).toMatchObject({ rootPc: 10, quality: "maj7" });
    expect(parseChord("gMAJ7")).toMatchObject({ rootPc: 7, quality: "maj7" });
    expect(parseChord("  Am  ")).toMatchObject({ rootPc: 9, quality: "min" });
  });

  it("splits a slash chord into chord and bass", () => {
    expect(parseChord("D/F#")).toMatchObject({ rootPc: 2, quality: "maj", bassPc: 6 });
    expect(parseChord("C/G")).toMatchObject({ rootPc: 0, quality: "maj", bassPc: 7 });
    // A bass that IS the root is not a slash chord, it is just the chord.
    expect(parseChord("C/C").bassPc).toBe(null);
    // "6/9" is a quality, not a bass note.
    expect(parseChord("C6/9")).toMatchObject({ rootPc: 0, bassPc: null });
  });

  it("flags a grip that is narrower than the symbol", () => {
    expect(parseChord("Am").exact).toBe(true);
    expect(parseChord("Fmaj7").exact).toBe(true);
    // No 7sus4 in the engine's table, so the b7 is dropped and the missing
    // 3rd (the whole point of a sus) is kept.
    expect(parseChord("A7sus4")).toMatchObject({ quality: "sus4", exact: false });
    expect(parseChord("E7#9")).toMatchObject({ quality: "dom7", exact: false });
  });

  it("returns null rather than guessing", () => {
    expect(parseChord("")).toBe(null);
    expect(parseChord("H")).toBe(null);
    expect(parseChord("Amwhatever")).toBe(null);
    expect(parseChord(null)).toBe(null);
    expect(parseChord(7)).toBe(null);
  });

  it("reads a whole chart, dropping only what it cannot read", () => {
    const list = parseChordList("Am C D Fmaj7");
    expect(list.map((c) => c.quality)).toEqual(["min", "maj", "maj", "maj7"]);
    expect(parseChordList(["G", "nope", "D"]).length).toBe(2);
    expect(parseChordList("").length).toBe(0);
  });
});

describe("writing a chord back out", () => {
  it("spells it the way the key spells its notes", () => {
    expect(chordSymbol(parseChord("Bb"), "F")).toBe("Bb");
    expect(chordSymbol(parseChord("A#"), "B")).toBe("A#");
    expect(chordSymbol(parseChord("Am7"), "C")).toBe("Am7");
    expect(chordSymbol(parseChord("D/F#"), "D")).toBe("D/F#");
    expect(chordSymbol(null, "C")).toBe("");
  });

  it("round-trips every quality in the table", () => {
    Object.keys(CHORDS).forEach((id) => {
      const written = chordSymbol({ rootPc: 0, quality: id, bassPc: null }, "C");
      const read = parseChord(written);
      expect(read, `${id} wrote "${written}"`).toBeTruthy();
      expect(read.quality, written).toBe(id);
    });
  });
});

describe("moving a chord", () => {
  it("transposes root and bass together", () => {
    const capo2 = transposeChord(parseChord("F#m7"), -2);
    expect(capo2).toMatchObject({ rootPc: 4, quality: "min7" });
    expect(chordSymbol(capo2, "E")).toBe("Em7");

    const slash = transposeChord(parseChord("D/F#"), -2);
    expect(chordSymbol(slash, "C")).toBe("C/E");
  });

  it("wraps around the octave in both directions", () => {
    expect(transposeChord(parseChord("C"), -1).rootPc).toBe(11);
    expect(transposeChord(parseChord("B"), 1).rootPc).toBe(0);
  });
});

describe("numbering a chord inside a key", () => {
  it("gives the Nashville number, quality included", () => {
    const key = noteNameToPc("G");
    expect(chordDegree(parseChord("G"), key)).toBe("1");
    expect(chordDegree(parseChord("C"), key)).toBe("4");
    expect(chordDegree(parseChord("D"), key)).toBe("5");
    expect(chordDegree(parseChord("Em"), key)).toBe("6m");
    expect(chordDegree(parseChord("F"), key)).toBe("b7");
    expect(chordDegree(parseChord("F#dim"), key)).toBe("7°");
  });

  it("numbers a minor key against its own tonic", () => {
    const am = noteNameToPc("A");
    expect(chordDegree(parseChord("Am"), am)).toBe("1m");
    expect(chordDegree(parseChord("F"), am)).toBe("b6");
    expect(chordDegree(parseChord("G"), am)).toBe("b7");
  });

  it("lists every pitch class the chord sounds, bass included", () => {
    expect(chordTonePcs(parseChord("C")).sort((a, b) => a - b)).toEqual([0, 4, 7]);
    // The G under an A is not an A-major tone, which is exactly why the
    // chord gets written with a slash.
    expect(chordTonePcs(parseChord("A/G")).sort((a, b) => a - b)).toEqual([1, 4, 7, 9]);
    expect(chordTonePcs(null)).toEqual([]);
  });
});

describe("the seeded charts", () => {
  const charts = [];
  for (const song of SEED_SONGS) {
    if (song.chords) charts.push([song.id, song.chords]);
    for (const sec of song.sections || []) {
      if (sec.chords) charts.push([`${song.id}/${sec.id}`, sec.chords]);
    }
  }

  it("ships a chart on a decent share of the library", () => {
    expect(SEED_SONGS.filter((s) => s.chords).length).toBeGreaterThan(80);
  });

  it("reads every chord in every seeded chart", () => {
    charts.forEach(([tag, list]) => {
      list.forEach((raw) => {
        expect(parseChord(raw), `${tag}: ${raw}`).toBeTruthy();
      });
    });
  });

  it("finds a playable grip for every chord in every seeded chart", () => {
    charts.forEach(([tag, list]) => {
      list.forEach((raw) => {
        const c = parseChord(raw);
        let found = findVoicings(c.rootPc, c.quality, { bass: c.bassPc == null ? "root" : c.bassPc });
        if (!found.length && c.bassPc != null) found = findVoicings(c.rootPc, c.quality);
        expect(found.length, `${tag}: ${raw}`).toBeGreaterThan(0);
      });
    });
  });

  it("keeps capo and tuning as plain numbers when present", () => {
    SEED_SONGS.forEach((s) => {
      if (s.capo != null) expect(Number.isInteger(s.capo) && s.capo > 0, s.id).toBe(true);
      if (s.tuning != null) expect(Number.isInteger(s.tuning) && s.tuning !== 0, s.id).toBe(true);
    });
  });
});

describe("giving a saved song the chart its seed grew later", () => {
  const seed = SEED_SONGS.find((s) => s.id === "n43"); // Wonderwall: chords + capo 2

  it("fills in fields the saved copy never had", () => {
    const { chords, capo, ...saved } = seed;
    const out = backfillChart(saved, seed);
    expect(out.chords).toEqual(seed.chords);
    expect(out.capo).toBe(2);
  });

  it("never overwrites an answer the saved copy already gives", () => {
    const out = backfillChart({ ...seed, chords: ["Am"], capo: 0 }, seed);
    expect(out.chords).toEqual(["Am"]);
    expect(out.capo).toBe(0);
  });

  it("treats a cleared chart as an answer, so it does not grow back", () => {
    const out = backfillChart({ ...seed, chords: [] }, seed);
    expect(out.chords).toEqual([]);
  });

  it("fills a section chart by section id", () => {
    const withCharts = SEED_SONGS.find((s) => s.sections?.some((x) => x.chords));
    const stripped = {
      ...withCharts,
      sections: withCharts.sections.map(({ chords, ...rest }) => rest),
    };
    const out = backfillChart(stripped, withCharts);
    out.sections.forEach((sec, i) => {
      expect(sec.chords, sec.id).toEqual(withCharts.sections[i].chords);
    });
  });

  it("leaves a song with no seed alone", () => {
    const mine = { id: "u1", title: "mine", root: "A", minor: true };
    expect(backfillChart(mine, undefined)).toBe(mine);
  });
});
