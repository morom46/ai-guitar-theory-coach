/**
 * Brightness-ladder tests.
 *
 * The whole feature rests on one claim: laid out brightest to darkest, every
 * neighbouring pair of modes differs by exactly ONE note. If that isn't true
 * the A/B flip is teaching a lie, so it's asserted here rather than trusted.
 */

import { describe, it, expect } from "vitest";
import {
  MODE_LADDER,
  ladderIndex,
  modeAt,
  modeInts,
  scaleDelta,
  modeStep,
  neighbourStep,
  labelFor,
  degreeNumber,
  brightness,
} from "../src/theory/modes.js";
import { SCALES } from "../src/theory/engine.js";

describe("the ladder itself", () => {
  it("has all seven modes, each backed by a real scale in the engine", () => {
    expect(MODE_LADDER.length).toBe(7);
    MODE_LADDER.forEach((m) => {
      expect(SCALES[m.id], `${m.id} is not in SCALES`).toBeTruthy();
      expect(modeInts(m.id).length, m.id).toBe(7);
      expect(m.name).toBeTruthy();
      expect(m.feel).toBeTruthy();
    });
  });

  it("covers each of the seven modes exactly once", () => {
    const ids = MODE_LADDER.map((m) => m.id);
    expect(new Set(ids).size).toBe(7);
    ["lydian", "major", "mixolydian", "dorian", "aeolian", "phrygian", "locrian"].forEach((id) =>
      expect(ids).toContain(id)
    );
  });

  it("runs strictly brightest to darkest", () => {
    const scores = MODE_LADDER.map((m) => brightness(m.id));
    scores.slice(1).forEach((s, i) => {
      expect(s, `${MODE_LADDER[i + 1].id} is not darker than ${MODE_LADDER[i].id}`).toBeLessThan(scores[i]);
    });
  });

  it("indexes and clamps", () => {
    expect(ladderIndex("lydian")).toBe(0);
    expect(ladderIndex("locrian")).toBe(6);
    expect(ladderIndex("nonsense")).toBe(-1);
    expect(modeAt(-5).id).toBe("lydian");
    expect(modeAt(99).id).toBe("locrian");
  });
});

describe("scaleDelta", () => {
  it("finds what each side has that the other doesn't", () => {
    const d = scaleDelta([0, 2, 4], [0, 2, 3]);
    expect(d.onlyA).toEqual([4]);
    expect(d.onlyB).toEqual([3]);
  });

  it("returns empty lists for identical scales", () => {
    const d = scaleDelta([0, 2, 4], [0, 2, 4]);
    expect(d.onlyA).toEqual([]);
    expect(d.onlyB).toEqual([]);
  });

  it("survives junk", () => {
    expect(scaleDelta(null, [0])).toBeNull();
    expect(scaleDelta([0], "nope")).toBeNull();
  });
});

describe("one-note neighbours — the claim the whole feature rests on", () => {
  it("every adjacent pair differs by exactly one note", () => {
    for (let i = 0; i < MODE_LADDER.length - 1; i++) {
      const a = MODE_LADDER[i];
      const b = MODE_LADDER[i + 1];
      const step = modeStep(a.id, b.id);
      expect(step, `${a.name} → ${b.name} differ by more than one note`).not.toBeNull();
      expect(Math.abs(step.to - step.from), `${a.name} → ${b.name} moved by ${step.to - step.from}`).toBe(1);
    }
  });

  it("every step downward flattens a note", () => {
    for (let i = 0; i < MODE_LADDER.length - 1; i++) {
      const step = modeStep(MODE_LADDER[i].id, MODE_LADDER[i + 1].id);
      expect(step.darker, `${MODE_LADDER[i].name} → ${MODE_LADDER[i + 1].name}`).toBe(true);
      expect(step.to).toBe(step.from - 1);
    }
  });

  it("flattens the degrees in circle-of-fourths order: 4 7 3 6 2 5", () => {
    // Not decoration — this is *why* the ladder exists, and a regression here
    // would mean the order had been shuffled.
    const degrees = [];
    for (let i = 0; i < MODE_LADDER.length - 1; i++) {
      degrees.push(modeStep(MODE_LADDER[i].id, MODE_LADDER[i + 1].id).degree);
    }
    expect(degrees).toEqual([4, 7, 3, 6, 2, 5]);
  });

  it("names each flip the way a player would say it", () => {
    const say = (i) => {
      const s = modeStep(MODE_LADDER[i].id, MODE_LADDER[i + 1].id);
      return `${s.fromLabel}→${s.toLabel}`;
    };
    expect(say(0)).toBe("#4→4"); // Lydian → Ionian
    expect(say(1)).toBe("7→b7"); // Ionian → Mixolydian
    expect(say(2)).toBe("3→b3"); // Mixolydian → Dorian
    expect(say(3)).toBe("6→b6"); // Dorian → Aeolian
    expect(say(4)).toBe("2→b2"); // Aeolian → Phrygian
    expect(say(5)).toBe("5→b5"); // Phrygian → Locrian
  });

  it("refuses non-neighbours instead of inventing a single note", () => {
    // Lydian and Dorian differ by three notes; there is no one-note story.
    expect(modeStep("lydian", "dorian")).toBeNull();
    expect(modeStep("major", "locrian")).toBeNull();
  });

  it("handles unknown ids", () => {
    expect(modeStep("lydian", "klingon")).toBeNull();
    expect(modeStep(null, "major")).toBeNull();
  });
});

describe("neighbourStep", () => {
  it("walks darker and brighter", () => {
    const darker = neighbourStep("dorian", 1);
    expect(darker.to_id).toBe("aeolian");
    expect(darker.fromLabel).toBe("6");
    expect(darker.toLabel).toBe("b6");

    const brighter = neighbourStep("dorian", -1);
    expect(brighter.to_id).toBe("mixolydian");
    expect(brighter.fromLabel).toBe("b3");
    expect(brighter.toLabel).toBe("3");
  });

  it("stops at both ends of the ladder", () => {
    expect(neighbourStep("lydian", -1)).toBeNull(); // nothing brighter
    expect(neighbourStep("locrian", 1)).toBeNull(); // nothing darker
    expect(neighbourStep("lydian", 1)).not.toBeNull();
    expect(neighbourStep("locrian", -1)).not.toBeNull();
  });

  it("is reversible — stepping down then back up returns the same note", () => {
    MODE_LADDER.forEach((m, i) => {
      if (i >= MODE_LADDER.length - 1) return;
      const down = neighbourStep(m.id, 1);
      const backUp = neighbourStep(down.to_id, -1);
      expect(backUp.to_id).toBe(m.id);
      expect(backUp.from).toBe(down.to);
      expect(backUp.to).toBe(down.from);
    });
  });
});

describe("spelling", () => {
  it("calls semitone 6 a #4 in Lydian and a b5 everywhere else", () => {
    expect(labelFor(6, "lydian")).toBe("#4");
    expect(labelFor(6, "locrian")).toBe("b5");
    expect(labelFor(6, "major")).toBe("b5");
  });

  it("reads the 6th semitone as a 4th in Lydian and a 5th elsewhere", () => {
    expect(degreeNumber(6, "lydian")).toBe(4);
    expect(degreeNumber(6, "locrian")).toBe(5);
  });

  it("numbers degrees so a flat and its natural share a number", () => {
    expect(degreeNumber(3)).toBe(degreeNumber(4)); // b3 and 3 are both "3"
    expect(degreeNumber(8)).toBe(degreeNumber(9)); // b6 and 6 are both "6"
    expect(degreeNumber(10)).toBe(degreeNumber(11)); // b7 and 7 are both "7"
    expect(degreeNumber(0)).toBe(1);
    expect(degreeNumber(7)).toBe(5);
  });
});
