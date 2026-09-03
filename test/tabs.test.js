/**
 * TABS — the transcription library.
 *
 * A tab entered by hand is the one kind of content in this app where a typo is
 * silent: a wrong fret still plays, still colours, still animates, and nothing
 * anywhere says it is wrong. So the assertions here are about the things a
 * typo actually breaks — notes off the neck, notes outside their own section,
 * an overlap that means two events collided, a phrase that ran past the end of
 * the document — plus the honesty flags, which are the other half of entering
 * somebody else's solo.
 */

import { describe, it, expect } from "vitest";
import { SEED_TABS, tabsForSong } from "../src/data/tabs.js";
import {
  beatAtBar,
  validateSolo,
  soloEndBeat,
  parseChordSymbol,
  noteMidi,
  degreeOf,
  harmonyLoop,
  STANDARD_TUNING,
} from "../src/data/soloSchema.js";

const harmonyLoopOf = (solo) => harmonyLoop(solo.harmony);

const purple = SEED_TABS.find((t) => t.id === "tab-purple-rain");
const weeps = SEED_TABS.find((t) => t.id === "tab-gently-weeps");
const alone = SEED_TABS.find((t) => t.id === "tab-alone");

/** MIDI pitch class of a note, for asserting a fret really is the note meant. */
const pc = (n, solo) => noteMidi(n, solo.meta) % 12;

describe("the bundled tabs", () => {
  it("all validate cleanly", () => {
    SEED_TABS.forEach((t) => {
      const v = validateSolo(t);
      expect(v.errors, t.meta.title).toEqual([]);
    });
  });

  it("stay on the neck", () => {
    SEED_TABS.forEach((t) => {
      t.notes.forEach((n) => {
        expect(n.fret, t.meta.title).toBeGreaterThanOrEqual(0);
        expect(n.fret, t.meta.title).toBeLessThanOrEqual(24);
        expect(n.string, t.meta.title).toBeGreaterThanOrEqual(0);
        expect(n.string, t.meta.title).toBeLessThanOrEqual(5);
        // A slide that runs off the end is the same bug wearing a hat.
        if (n.slideToFret != null) {
          expect(n.slideToFret, t.meta.title).toBeGreaterThanOrEqual(0);
          expect(n.slideToFret, t.meta.title).toBeLessThanOrEqual(24);
        }
      });
    });
  });

  it("lay their sections end to end with no gaps or overlaps", () => {
    SEED_TABS.forEach((t) => {
      t.sections.forEach((s, i) => {
        expect(s.endBeat, `${t.meta.title} / ${s.name}`).toBeGreaterThan(s.startBeat);
        if (i > 0) expect(s.startBeat, `${t.meta.title} / ${s.name}`).toBe(t.sections[i - 1].endBeat);
      });
    });
  });

  it("keep every note inside the document and inside a named section", () => {
    // A note past the last section is a note the timeline cannot scroll to and
    // the section readout cannot name — which is how an off-by-one in a
    // hand-written beat offset shows up.
    SEED_TABS.forEach((t) => {
      const last = t.sections[t.sections.length - 1].endBeat;
      t.notes.forEach((n) => {
        expect(n.startBeat, `${t.meta.title} @${n.startBeat}`).toBeGreaterThanOrEqual(0);
        expect(n.startBeat + n.durBeats, `${t.meta.title} @${n.startBeat}`).toBeLessThanOrEqual(last);
        const sec = t.sections.find((s) => n.startBeat >= s.startBeat && n.startBeat < s.endBeat);
        expect(sec, `${t.meta.title}: nothing owns the note at beat ${n.startBeat}`).toBeTruthy();
      });
      expect(soloEndBeat(t)).toBe(last);
    });
  });

  it("never stack two notes on one string at one moment", () => {
    // Chords and unison bends are two notes on two strings — legal, and used.
    // Two notes on the SAME string at the same beat is a fat-fingered offset.
    SEED_TABS.forEach((t) => {
      const seen = new Set();
      t.notes.forEach((n) => {
        const at = `${n.startBeat}/${n.string}`;
        expect(seen.has(at), `${t.meta.title}: two notes on string ${n.string} at beat ${n.startBeat}`).toBe(false);
        seen.add(at);
      });
    });
  });

  it("names every chord readably and puts each change on a bar line", () => {
    SEED_TABS.forEach((t) => {
      expect(t.harmony.length, t.meta.title).toBeGreaterThan(1);
      // "On a bar line" has to be asked of the time signature, not of the
      // number 4: Slow Dancing has a 7/8 bar in it, after which every bar
      // line lands on a half beat and a `% 4` test would call them all wrong.
      const barLines = new Set();
      for (let bar = 0; bar < 400; bar++) {
        const at = beatAtBar(t.timeSig, bar);
        if (at > soloEndBeat(t)) break;
        barLines.add(at);
      }
      t.harmony.forEach((h) => {
        expect(parseChordSymbol(h.chord), `${t.meta.title}: ${h.chord}`).not.toBeNull();
        expect(barLines.has(h.atBeat), `${t.meta.title}: chord at beat ${h.atBeat}`).toBe(true);
      });
    });
  });

  it("says where it came from, and that it is a transcription", () => {
    // The content policy, as an assertion. These are entered from published
    // tabs, so the thing worth recording is WHICH tab — not a warning banner.
    SEED_TABS.forEach((t) => {
      expect(t.meta.artist, t.meta.title).toMatch(/transcription/i);
      expect(t.meta.source, t.meta.title).toBeTruthy();
      expect(t.meta.source.length, t.meta.title).toBeGreaterThan(20);
    });
  });

  it("links every tab to a song in the library", () => {
    SEED_TABS.forEach((t) => expect(t.meta.songIds.length, t.meta.title).toBeGreaterThan(0));
    expect(tabsForSong("n70").map((t) => t.id)).toContain("tab-purple-rain");
    expect(tabsForSong("nope")).toEqual([]);
  });
});

describe("Purple Rain — the transcription itself", () => {
  it("is the whole tab: sixteen timestamped blocks, 3:46 to 6:13", () => {
    expect(purple.sections).toHaveLength(16);
    expect(purple.sections[0].name).toMatch(/^3:46/);
    expect(purple.sections[15].name).toMatch(/^6:13/);
  });

  it("is in Bb, and the phrase it repeats most is spelled Bb-A", () => {
    expect(purple.meta.key).toBe("Bb");
    // The shake: B string, frets 10 and 11 — A and Bb. If the string index were
    // ever flipped to tab numbering these would be the wrong two pitches, and
    // nothing else in the app would notice.
    const bb = purple.notes.find((n) => n.string === 1 && n.fret === 11);
    const a = purple.notes.find((n) => n.string === 1 && n.fret === 10);
    expect(noteMidi(bb, purple.meta) % 12).toBe(10); // Bb
    expect(noteMidi(a, purple.meta) % 12).toBe(9); //  A
    expect(degreeOf(bb, purple, bb.startBeat).keyLabel).toBe("1");
  });

  it("carries the unison bend at 3:57 as two strings at one beat", () => {
    // e15 and B18 bent a whole step are the same G. Losing either note turns
    // the signature move of the solo into an ordinary bend.
    const sec = purple.sections.find((s) => s.name.startsWith("3:57"));
    const at = purple.notes.filter((n) => n.startBeat === sec.startBeat);
    expect(at.map((n) => n.string).sort()).toEqual([0, 1]);
    const bent = at.find((n) => n.technique === "bend");
    const plain = at.find((n) => n.technique !== "bend");
    expect(noteMidi(bent, purple.meta) + bent.bendSemitones).toBe(noteMidi(plain, purple.meta));
  });

  it("ends on the pinched harmonic the tab ends on", () => {
    const last = purple.notes[purple.notes.length - 1];
    expect(last.technique).toBe("harmonic");
    expect(last.string).toBe(0);
    expect(last.fret).toBe(20);
  });

  it("uses every technique the tab's legend defines", () => {
    // The legend at the bottom of the tab names (P), >, b and r. Everything it
    // names has to survive the trip into the schema.
    const used = new Set(purple.notes.map((n) => n.technique));
    ["harmonic", "bend", "release", "vibrato", "slide", "hammer", "pull"].forEach((tech) =>
      expect(used.has(tech), tech).toBe(true)
    );
  });
});

describe("While My Guitar Gently Weeps — the transcription itself", () => {
  it("runs the four pages in order: twenty-two phrases, 1 to 22", () => {
    // The source was read off four page images, and the pages do not sort
    // themselves. If the reconstruction is ever disturbed this is what says so.
    expect(weeps.sections).toHaveLength(22);
    weeps.sections.forEach((s, i) => expect(s.name).toMatch(new RegExp("^" + (i + 1) + " — ")));
    expect(weeps.sections[0].name).toContain("the entrance");
    expect(weeps.sections[21].name).toContain("shred, and out");
  });

  it("honours the tab's own legend: every bend a whole step but one", () => {
    // "all bends are whole step unless denoted-[as in third line (½) is half
    // step bend]" — so exactly one half-step bend exists, and it opens
    // phrase 3. Anything else at bend(1) means the legend got misread.
    const halves = weeps.notes.filter((n) => n.technique === "bend" && n.bendSemitones === 1);
    expect(halves).toHaveLength(1);
    const three = weeps.sections.find((s) => s.name.startsWith("3 — "));
    expect(halves[0].startBeat).toBe(three.startBeat);
    // Its release must match it, or the pitch walks away mid-phrase.
    const rel = weeps.notes.find((n) => n.technique === "release" && n.startBeat > three.startBeat);
    expect(rel.bendSemitones).toBe(1);
  });

  it("keeps the two notes that leave A minor, because they are the point", () => {
    // B string / 7th fret is F# — the 3rd of the D9 the verse goes to.
    const fSharp = weeps.notes.find((n) => n.string === 1 && n.fret === 7);
    expect(pc(fSharp, weeps)).toBe(6);
    // G string / 8th fret is Eb, the b5, and it is only ever hammered INTO
    // the E a fret above it — never left sitting.
    const blue = weeps.notes.filter((n) => n.string === 2 && n.fret === 8);
    expect(blue.length).toBeGreaterThan(0);
    blue.forEach((n) => {
      expect(pc(n, weeps), "the b5").toBe(3);
      const next = weeps.notes.find((m) => m.startBeat > n.startBeat && m.string === 2);
      expect(next.fret, "the b5 resolves up a fret").toBe(9);
    });
  });

  it("is in A minor, and says so where the neck can read it", () => {
    expect(weeps.meta.key).toBe("A");
    expect(weeps.meta.scaleId).toBe("aeolian");
    // Standard tuning — this one needs none of November Rain's transposition
    // apology, and the absence is worth pinning.
    expect(weeps.meta.tuningMidi).toEqual(STANDARD_TUNING);
    expect(weeps.meta.capo).toBe(0);
  });

  it("ends on the bent D the tab ends on", () => {
    const last = weeps.notes[weeps.notes.length - 1];
    expect(last.technique).toBe("bend");
    expect(last.string).toBe(2);
    expect(last.fret).toBe(19);
  });
});

describe("Alone — the transcription itself", () => {
  it("is the eight bars the tab marks Solo, numbered as the tab numbers them", () => {
    expect(alone.sections).toHaveLength(8);
    alone.sections.forEach((sec, i) => expect(sec.name).toMatch(new RegExp("^" + (58 + i) + " — ")));
  });

  it("never leaves F# major — the check that proved the reading", () => {
    // THIS IS THE IMPORTANT ONE. The source was a rendered tab image, not
    // ASCII, so which string a number sits on had to be inferred from which
    // line the digit was drawn on. One row of error turns every note into a
    // different note and nothing else in the app would notice.
    //
    // What pinned it: the correct reading puts all sixty-odd notes inside F#
    // major with not one accidental. A reading off by a row does not do that,
    // so if this ever fails, the transcription has been disturbed rather than
    // the key being wrong.
    const FSHARP_MAJOR = new Set([6, 8, 10, 11, 1, 3, 5]); // F# G# A# B C# D# E#
    alone.notes.forEach((n) => {
      const pcOf = noteMidi(n, alone.meta) % 12;
      expect(FSHARP_MAJOR.has(pcOf), `${"eBGDAE"[n.string]}${n.fret} is outside F# major`).toBe(true);
    });
  });

  it("sits over vi-IV-I-V, which is what makes one note mean four things", () => {
    expect(harmonyLoopOf(alone)).toEqual(["D#m", "B", "F#", "C#"]);
    // The C# on the B string at the 14th fret, read against each chord in
    // turn: b7, 2, 5, 1. The claim in meta.note, asserted.
    const cSharp = alone.notes.find((n) => n.string === 1 && n.fret === 14);
    const degrees = alone.harmony.slice(0, 4).map((h) => degreeOf(cSharp, alone, h.atBeat).label);
    expect(degrees).toEqual(["b7", "2", "5", "1"]);
  });

  it("takes its tempo and time signature from the source, so neither is guessed", () => {
    expect(alone.tempo[0].bpm).toBe(87);
    expect(alone.timeSig[0]).toMatchObject({ num: 4, den: 4 });
    expect(alone.meta.source).toMatch(/states its own tempo/i);
  });
});

describe("Slow Dancing in a Burning Room — the converted one", () => {
  const sd = SEED_TABS.find((t) => t.id === "tab-slow-dancing");

  it("is the whole arrangement, not a solo", () => {
    expect(sd.notes.length).toBeGreaterThan(1500);
    expect(sd.sections).toHaveLength(10);
    expect(sd.sections[0].name).toMatch(/^Intro/);
    expect(sd.sections[9].name).toMatch(/^Solo 4/);
  });

  it("cuts the solo into four so a long song can be learned a piece at a time", () => {
    const solo = sd.sections.filter((s) => /^Solo \d/.test(s.name));
    expect(solo).toHaveLength(4);
    solo.forEach((s) => {
      const bars = (s.endBeat - s.startBeat) / 4;
      expect(bars, s.name).toBeLessThanOrEqual(8); // no block bigger than eight bars
    });
  });

  it("survives the 7/8 bar without knocking everything after it off the grid", () => {
    // Bar 11 is in 7/8. Bar lines are anchored per measure in the converter
    // rather than accumulated, so bar 12 lands exactly 3.5 beats after bar 11
    // and every bar after that stays on a half beat, not a drifting fraction.
    expect(sd.timeSig.map((t) => `${t.atBeat}:${t.num}/${t.den}`)).toEqual([
      "0:4/4",
      "40:7/8",
      "43.5:4/4",
    ]);
    expect(beatAtBar(sd.timeSig, 10)).toBe(40); // bar 11, 0-indexed
    expect(beatAtBar(sd.timeSig, 11)).toBe(43.5); // bar 12 — 3.5 beats later
    expect(soloEndBeat(sd)).toBe(347.5);
  });

  it("kept the techniques the transcription actually marks", () => {
    const used = new Set(sd.notes.map((n) => n.technique));
    ["pick", "hammer", "pull", "slide", "bend", "release", "vibrato", "mute"].forEach((tech) =>
      expect(used.has(tech), tech).toBe(true)
    );
    // Songsterr's bend `tone` is in fiftieths of a whole step, so a half step
    // is 1 semitone and 1½ steps is 3. Anything outside that set means the
    // unit conversion has drifted.
    const bends = [...new Set(sd.notes.filter((n) => n.bendSemitones).map((n) => n.bendSemitones))];
    bends.forEach((b) => expect([0.5, 1, 1.5, 2, 3]).toContain(b));
  });

  it("reads its string index the same way we do, not upside down", () => {
    // Songsterr's tuning array is [64,59,55,50,45,40] — high E first, the same
    // as OPEN_MIDI — so no conversion was needed. If that ever changed, the
    // whole song would be mirrored and still look plausible. The intro's very
    // first note is the low-E 9th fret, which is the Db this song is named for.
    const first = sd.notes[0];
    expect(first.string).toBe(5);
    expect(first.fret).toBe(9);
    expect(noteMidi(first, sd.meta) % 12).toBe(1); // Db
  });
});

describe("Choo Lo — the converted one", () => {
  const choo = SEED_TABS.find((t) => t.id === "tab-choo-lo");
  const barOf = (n) => Math.floor(n.startBeat / 4) + 117; // the tab's own numbering

  it("is bars 117 to 137 — the outro solo, and nothing before it", () => {
    // The request was the solo from bar 117 to the end. The tab runs to 142,
    // but 138 onward is rests, so the last sounding bar is 137: twenty-one
    // bars, eighty-four beats.
    expect(soloEndBeat(choo)).toBe(84);
    expect(choo.sections[0].name).toMatch(/^117-118 — /);
    expect(choo.sections.at(-1).name).toMatch(/^132-137 — /);
  });

  it("is in B major, with exactly one note from outside it", () => {
    // The claim in meta.note, asserted. B C# D# E F# G# A#.
    const B_MAJOR = new Set([11, 1, 3, 4, 6, 8, 10]);
    const strays = choo.notes.filter((n) => !B_MAJOR.has(pc(n, choo)));
    expect(strays).toHaveLength(1);
    expect(pc(strays[0], choo)).toBe(2); // D natural
    expect(barOf(strays[0])).toBe(120); // passing through, on its way back to C#
  });

  it("restates bars 117-119 an octave up at 125-127", () => {
    // The reason the document tells you to learn the first phrase first. Every
    // pitch in the second phrase is a pitch from the first, twelve semitones
    // higher — the repeats differ, the notes do not.
    const pitches = (from, to) =>
      choo.notes
        .filter((n) => n.startBeat >= from && n.startBeat < to)
        .map((n) => noteMidi(n, choo.meta));
    const low = [...new Set(pitches(0, 12))].sort((a, b) => a - b);
    const high = [...new Set(pitches(32, 44))].sort((a, b) => a - b);
    expect(high).toEqual(low.map((m) => m + 12));
  });

  it("puts its one dissonance on the borrowed chord, then resolves it", () => {
    // meta.note's second lesson, asserted end to end: the D# arrives as a #11
    // over the bVII, is held while the chord turns to B and becomes its major
    // 3rd, and only then moves to E.
    const at = (beat) => choo.notes.find((n) => n.startBeat === beat);
    expect(degreeOf(at(56.5), choo, 56.5).label).toBe("b5"); // bar 131, over A — the #11
    expect(degreeOf(at(60), choo, 60).label).toBe("3"); // bar 132, same D#, over B
    expect(at(56.5).fret).toBe(at(60).fret + 4); // G string 8 and B string 4: one D#
    expect(pc(at(64), choo)).toBe(4); // bar 133 lands on E and stays
    expect(at(64).durBeats).toBe(20);
  });

  it("holds one note as root, 4th and 5th across three consecutive bars", () => {
    // The E that opens the solo, read against each of the first three chords.
    const e = choo.notes[0];
    expect(pc(e, choo)).toBe(4);
    expect([0, 4, 8].map((b) => degreeOf(e, choo, b).label)).toEqual(["1", "4", "5"]);
  });

  it("takes tempo, time signature and chords from the source, not from me", () => {
    expect(choo.tempo[0].bpm).toBe(146);
    expect(choo.timeSig[0]).toMatchObject({ num: 4, den: 4 });
    // Read off the bass track's roots, which walk on every beat.
    expect(choo.harmony.slice(0, 8).map((h) => h.chord)).toEqual([
      "E", "B", "A", "B", "C#m", "B", "A", "B",
    ]);
    expect(choo.meta.source).toMatch(/bass track/i);
  });

  it("keeps the bend that is held and the bend that is let back down", () => {
    // Bar 118 bends and releases; bar 126 is the same phrase an octave up but
    // the tab bends and holds. Reading one as the other is the mistake this
    // catches — they look identical on the page.
    const b118 = choo.notes.filter((n) => barOf(n) === 118);
    const b126 = choo.notes.filter((n) => barOf(n) === 126);
    expect(b118.map((n) => n.technique)).toContain("release");
    expect(b126.map((n) => n.technique)).not.toContain("release");
    // Every bend in the solo is a full step, as the tab's "full" marks say.
    choo.notes
      .filter((n) => n.bendSemitones)
      .forEach((n) => expect(n.bendSemitones).toBe(2));
  });
});
