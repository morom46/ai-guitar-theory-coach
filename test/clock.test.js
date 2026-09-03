/**
 * Metronome maths tests.
 *
 * The scheduler itself needs an AudioContext, so the arithmetic lives in pure
 * helpers (tickPlan / advanceCursor / tapTempoBpm / rampBpm) and those are
 * what we test. A metronome that drifts is worthless, so the interval
 * assertions here are exact rather than approximate.
 */

import { describe, it, expect } from "vitest";
import {
  advanceCursor,
  kindFor,
  tickPlan,
  tapTempoBpm,
  rampBpm,
  clampBpm,
  BPM_MIN,
  BPM_MAX,
  SUBDIVISIONS,
} from "../src/audio/clock.js";

describe("clampBpm", () => {
  it("keeps tempo inside the usable range", () => {
    expect(clampBpm(120)).toBe(120);
    expect(clampBpm(5)).toBe(BPM_MIN);
    expect(clampBpm(9999)).toBe(BPM_MAX);
    expect(clampBpm(90.4)).toBe(90);
    expect(clampBpm(90.6)).toBe(91);
  });

  it("falls back to 90 for garbage", () => {
    expect(clampBpm(NaN)).toBe(90);
    expect(clampBpm(undefined)).toBe(90);
    expect(clampBpm("nonsense")).toBe(90);
  });
});

describe("advanceCursor", () => {
  it("walks beats then rolls the bar", () => {
    let c = { bar: 0, beat: 0, subIndex: 0 };
    const seen = [];
    for (let i = 0; i < 9; i++) {
      seen.push(`${c.bar}:${c.beat}`);
      c = advanceCursor(c, { sub: 1, beatsPerBar: 4 });
    }
    expect(seen).toEqual(["0:0", "0:1", "0:2", "0:3", "1:0", "1:1", "1:2", "1:3", "2:0"]);
  });

  it("walks subdivisions before advancing the beat", () => {
    let c = { bar: 0, beat: 0, subIndex: 0 };
    const seen = [];
    for (let i = 0; i < 5; i++) {
      seen.push(`${c.beat}.${c.subIndex}`);
      c = advanceCursor(c, { sub: 3, beatsPerBar: 4 });
    }
    expect(seen).toEqual(["0.0", "0.1", "0.2", "1.0", "1.1"]);
  });

  it("respects odd time signatures", () => {
    let c = { bar: 0, beat: 4, subIndex: 0 };
    c = advanceCursor(c, { sub: 1, beatsPerBar: 5 });
    expect(c).toEqual({ bar: 1, beat: 0, subIndex: 0 });
  });

  it("never mutates the cursor it was given", () => {
    const c = { bar: 3, beat: 2, subIndex: 1 };
    const snapshot = { ...c };
    advanceCursor(c, { sub: 2, beatsPerBar: 4 });
    expect(c).toEqual(snapshot);
  });
});

describe("kindFor", () => {
  it("accents beat 1 and only beat 1", () => {
    expect(kindFor({ bar: 0, beat: 0, subIndex: 0 }, { accent: true })).toBe("accent");
    expect(kindFor({ bar: 2, beat: 0, subIndex: 0 }, { accent: true })).toBe("accent");
    expect(kindFor({ bar: 0, beat: 1, subIndex: 0 }, { accent: true })).toBe("beat");
  });

  it("drops the accent when it is switched off", () => {
    expect(kindFor({ bar: 0, beat: 0, subIndex: 0 }, { accent: false })).toBe("beat");
  });

  it("marks off-beats as subdivisions, even on beat 1", () => {
    expect(kindFor({ bar: 0, beat: 0, subIndex: 1 }, { accent: true })).toBe("sub");
    expect(kindFor({ bar: 0, beat: 3, subIndex: 2 }, { accent: true })).toBe("sub");
  });
});

describe("tickPlan", () => {
  it("spaces quarter notes exactly at the requested tempo", () => {
    const plan = tickPlan({ bpm: 120, sub: 1, count: 5, startTime: 0 });
    expect(plan.map((t) => t.time)).toEqual([0, 0.5, 1, 1.5, 2]);
  });

  it("divides the beat evenly for every subdivision", () => {
    SUBDIVISIONS.forEach(({ id: sub }) => {
      const plan = tickPlan({ bpm: 60, sub, count: sub + 1, startTime: 0 });
      // One beat = 1s at 60bpm, so the (sub+1)th tick lands on the next beat.
      expect(plan[plan.length - 1].time).toBeCloseTo(1, 9);
      const gaps = plan.slice(1).map((t, i) => t.time - plan[i].time);
      gaps.forEach((g) => expect(g).toBeCloseTo(1 / sub, 9));
    });
  });

  it("never drifts across a long run", () => {
    const bpm = 137; // deliberately not a round number
    const count = 400;
    const plan = tickPlan({ bpm, sub: 4, count, startTime: 0 });
    const expected = ((count - 1) * (60 / bpm)) / 4;
    expect(plan[count - 1].time).toBeCloseTo(expected, 6);
  });

  it("puts an accent on every bar line", () => {
    const plan = tickPlan({ bpm: 100, sub: 2, beatsPerBar: 4, count: 16 });
    const accents = plan.filter((t) => t.kind === "accent");
    expect(accents.length).toBe(2); // 16 eighths = 2 bars of 4/4
    expect(accents.map((a) => a.time)).toEqual([plan[0].time, plan[8].time]);
    accents.forEach((a) => {
      expect(a.beat).toBe(0);
      expect(a.subIndex).toBe(0);
    });
  });

  it("flags count-in bars and nothing after them", () => {
    const plan = tickPlan({ bpm: 120, sub: 1, beatsPerBar: 4, count: 12, countInBars: 2 });
    expect(plan.filter((t) => t.isCountIn).length).toBe(8);
    expect(plan.slice(0, 8).every((t) => t.isCountIn)).toBe(true);
    expect(plan.slice(8).every((t) => !t.isCountIn)).toBe(true);
  });

  it("can start from a non-zero time and cursor", () => {
    const plan = tickPlan({ bpm: 60, sub: 1, count: 2, startTime: 10, cursor: { bar: 3, beat: 2, subIndex: 0 } });
    expect(plan[0]).toMatchObject({ time: 10, bar: 3, beat: 2 });
    expect(plan[1]).toMatchObject({ time: 11, bar: 3, beat: 3 });
  });
});

describe("tapTempoBpm", () => {
  it("derives tempo from even taps", () => {
    expect(tapTempoBpm([0, 500, 1000, 1500])).toBe(120);
    expect(tapTempoBpm([0, 1000, 2000])).toBe(60);
    expect(tapTempoBpm([0, 400])).toBe(150);
  });

  it("averages sloppy human taps", () => {
    const bpm = tapTempoBpm([0, 510, 995, 1520, 2010]);
    expect(bpm).toBeGreaterThan(115);
    expect(bpm).toBeLessThan(125);
  });

  it("needs at least two taps", () => {
    expect(tapTempoBpm([])).toBeNull();
    expect(tapTempoBpm([1000])).toBeNull();
    expect(tapTempoBpm(null)).toBeNull();
  });

  it("ignores taps from a previous phrase", () => {
    // A 9s pause, then three taps at 120bpm — the old taps must not count.
    expect(tapTempoBpm([0, 200, 10000, 10500, 11000])).toBe(120);
  });

  it("clamps absurdly fast tapping into range", () => {
    const bpm = tapTempoBpm([0, 5, 10, 15]);
    expect(bpm).toBe(BPM_MAX);
  });

  it("returns null when every gap is too long to be a phrase", () => {
    expect(tapTempoBpm([0, 5000])).toBeNull();
  });
});

describe("rampBpm", () => {
  const base = { startBpm: 100, everyBars: 4, by: 5, max: 130 };

  it("holds tempo until the first ramp point", () => {
    expect(rampBpm({ ...base, bpm: 100, bar: 0 })).toBe(100);
    expect(rampBpm({ ...base, bpm: 100, bar: 3 })).toBe(100);
  });

  it("steps up on schedule", () => {
    expect(rampBpm({ ...base, bpm: 100, bar: 4 })).toBe(105);
    expect(rampBpm({ ...base, bpm: 105, bar: 8 })).toBe(110);
    expect(rampBpm({ ...base, bpm: 110, bar: 12 })).toBe(115);
  });

  it("stops at the ceiling", () => {
    expect(rampBpm({ ...base, bpm: 130, bar: 40 })).toBe(130);
    expect(rampBpm({ ...base, bpm: 130, bar: 400 })).toBe(130);
  });

  it("is a pure function of the bar number, so it cannot compound", () => {
    // Called twice for the same bar it must give the same answer — otherwise a
    // re-render would double-apply the increase.
    const a = rampBpm({ ...base, bpm: 100, bar: 8 });
    const b = rampBpm({ ...base, bpm: a, bar: 8 });
    expect(a).toBe(b);
  });

  it("never slows you down when the ceiling is already below your tempo", () => {
    // Turning the speed trainer on at 180 with a 160 ceiling must mean
    // "nothing to ramp", not "drop to 160".
    expect(rampBpm({ bpm: 180, bar: 0, startBpm: 180, everyBars: 4, by: 2, max: 160 })).toBe(180);
    expect(rampBpm({ bpm: 180, bar: 40, startBpm: 180, everyBars: 4, by: 2, max: 160 })).toBe(180);
  });

  it("counts bars from where the ramp began, so a tempo change restarts the climb", () => {
    // bar is passed relative to the ramp origin; bar 0 is always the start.
    expect(rampBpm({ ...base, bpm: 90, startBpm: 90, bar: 0 })).toBe(90);
    expect(rampBpm({ ...base, bpm: 90, startBpm: 90, bar: 4 })).toBe(95);
  });

  it("degrades safely on a bad interval", () => {
    expect(rampBpm({ ...base, bpm: 111, bar: 8, everyBars: 0 })).toBe(111);
  });
});
