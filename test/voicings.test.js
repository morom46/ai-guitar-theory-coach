/**
 * THE SHAPE SOLVER.
 *
 * A chord box that lies is worse than no chord box: you learn the shape, and
 * the shape is wrong. So the solver's output is checked against the chord it
 * claims to be, against what a hand can reach, and — the real test — against
 * the open shapes every guitarist already knows. If it cannot rediscover
 * x32010 for C major, it is not a chord solver.
 */

import { describe, it, expect } from "vitest";
import { CHORDS, OPEN_MIDI, chordPcs, noteNameToPc } from "../src/theory/engine.js";
import { findVoicings, describeVoicing } from "../src/theory/voicings.js";

const pcsOf = (v) => new Set(v.midis.map((m) => ((m % 12) + 12) % 12));
// Chord boxes are written low string first; the engine indexes high string first.
const chart = (v) => v.frets.slice().reverse().map((f) => (f == null ? "x" : f)).join("");

describe("the voicing solver", () => {
  it("rediscovers the open chords everybody already plays", () => {
    const shapes = (root, q) => findVoicings(root, q, { limit: 8 }).map(chart);
    expect(shapes(4, "maj")).toContain("022100"); // E
    expect(shapes(0, "maj")).toContain("x32010"); // C
    expect(shapes(9, "min")).toContain("x02210"); // Am
    expect(shapes(4, "min")).toContain("022000"); // Em
    expect(shapes(2, "min")).toContain("xx0231"); // Dm
    expect(shapes(7, "dom7")).toContain("320001"); // G7
    expect(shapes(9, "maj")).toContain("x02220"); // A
  });

  it("only ever produces the chord it was asked for", () => {
    ["maj", "min", "dom7", "min7", "maj7", "sus4", "dim"].forEach((q) => {
      for (let root = 0; root < 12; root++) {
        const want = new Set(chordPcs(root, q));
        findVoicings(root, q).forEach((v) => {
          pcsOf(v).forEach((pc) => expect(want.has(pc), `${q} on ${root}: ${chart(v)}`).toBe(true));
        });
      }
    });
  });

  it("includes every note of the chord", () => {
    ["maj", "min", "dom7", "min7"].forEach((q) => {
      for (let root = 0; root < 12; root++) {
        const want = chordPcs(root, q);
        findVoicings(root, q).forEach((v) => {
          const got = pcsOf(v);
          want.forEach((pc) => expect(got.has(pc), `${q} on ${root} missing ${pc}: ${chart(v)}`).toBe(true));
        });
      }
    });
  });

  it("puts the root in the bass when asked", () => {
    for (let root = 0; root < 12; root++) {
      findVoicings(root, "maj").forEach((v) => expect(v.bassPc).toBe(root));
    }
  });

  it("stays inside a hand: four frets, no gaps, at least four strings", () => {
    ["maj", "min", "dom7", "maj7", "min7", "sus2", "sus4", "six"].forEach((q) => {
      [0, 3, 5, 8, 10].forEach((root) => {
        findVoicings(root, q).forEach((v) => {
          const fretted = v.frets.filter((f) => f != null && f > 0);
          if (fretted.length) expect(Math.max(...fretted) - Math.min(...fretted), chart(v)).toBeLessThanOrEqual(3);
          expect(v.strings).toBeGreaterThanOrEqual(4);
          // no muted string sandwiched between two sounding ones
          const sounding = v.frets.map((f, i) => (f == null ? -1 : i)).filter((i) => i >= 0);
          for (let i = sounding[0]; i <= sounding[sounding.length - 1]; i++) {
            expect(v.frets[i], `interior mute in ${chart(v)}`).not.toBe(null);
          }
        });
      });
    });
  });

  it("agrees with itself: the midis really are those frets", () => {
    findVoicings(0, "maj7").forEach((v) => {
      const fromFrets = v.frets
        .map((f, s) => (f == null ? null : OPEN_MIDI[s] + f))
        .filter((m) => m != null)
        .sort((a, b) => a - b);
      expect(v.midis).toEqual(fromFrets);
    });
  });

  it("offers shapes in different positions rather than six of the same one", () => {
    const v = findVoicings(noteNameToPc("G"), "maj", { limit: 5 });
    const positions = new Set(v.map((x) => x.position));
    expect(positions.size).toBe(v.length);
  });

  it("counts a barre as one finger, not six", () => {
    const barred = findVoicings(5, "maj", { limit: 8 }).find((v) => v.barre);
    expect(barred).toBeTruthy();
    const fretted = barred.frets.filter((f) => f != null && f > 0).length;
    expect(barred.fingers).toBeLessThan(fretted + 1);
    expect(barred.fingers).toBeLessThanOrEqual(4);
  });

  it("describes each string for the diagram to draw", () => {
    const v = findVoicings(0, "maj")[0];
    const rows = describeVoicing(v, null);
    expect(rows.length).toBe(6);
    rows.filter((r) => !r.muted).forEach((r) => {
      expect(chordPcs(0, "maj")).toContain(r.pc);
      expect(["1", "3", "5"]).toContain(r.label);
    });
  });

  it("lets a big chord drop its 5th rather than returning nothing", () => {
    // Six notes will not fit under one hand; the 5th is what a guitarist drops.
    const v = findVoicings(0, "dom13", { limit: 3 });
    expect(v.length).toBeGreaterThan(0);
    v.forEach((x) => {
      const got = pcsOf(x);
      [0, 4, 10].forEach((iv) => expect(got.has(iv)).toBe(true)); // root, 3rd, b7 survive
    });
  });
});
