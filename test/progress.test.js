/**
 * THE PRACTICE LOG.
 *
 * The weighting decides what you get asked, so a bug here quietly wastes
 * practice time on the things you can already do. These tests pin the two
 * behaviours that matter: a missed item comes back, and a solid one steps
 * aside without disappearing.
 */

import { describe, it, expect, beforeEach } from "vitest";

// The module talks to localStorage; node does not have one.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { record, itemStat, weightOf, pickWeighted, summary, resetDrill, BOX_COUNT } = await import("../src/data/progress.js");

describe("progress", () => {
  beforeEach(() => store.clear());

  it("remembers each item separately", () => {
    record("d", "a", true);
    record("d", "a", false);
    record("d", "b", true);
    expect(itemStat("d", "a").n).toBe(2);
    expect(itemStat("d", "a").wrong).toBe(1);
    expect(itemStat("d", "b").wrong).toBe(0);
    expect(itemStat("d", "zzz").n).toBe(0);
  });

  it("promotes on a right answer and drops to the bottom on a wrong one", () => {
    for (let i = 0; i < 9; i++) record("d", "a", true);
    expect(itemStat("d", "a").box).toBe(BOX_COUNT - 1);
    record("d", "a", false);
    expect(itemStat("d", "a").box).toBe(0);
    expect(itemStat("d", "a").streak).toBe(0);
  });

  it("weights a missed item above a solid one, and an unseen one in between", () => {
    for (let i = 0; i < 6; i++) record("d", "solid", true);
    for (let i = 0; i < 6; i++) record("d", "shaky", false);
    expect(weightOf("d", "shaky")).toBeGreaterThan(weightOf("d", "unseen"));
    expect(weightOf("d", "unseen")).toBeGreaterThan(weightOf("d", "solid"));
  });

  it("actually asks the weak item more often", () => {
    for (let i = 0; i < 8; i++) record("d", "solid", true);
    for (let i = 0; i < 8; i++) record("d", "shaky", false);
    let shaky = 0;
    let r = 0;
    // Deterministic sweep of the random source, so the test cannot flake.
    for (let i = 0; i < 200; i++) {
      const pick = pickWeighted("d", ["solid", "shaky"], { random: () => (r = (r + 0.005) % 1) });
      if (pick === "shaky") shaky++;
    }
    expect(shaky).toBeGreaterThan(120); // well over half
    expect(shaky).toBeLessThan(200); // but the solid one still comes up
  });

  it("never asks the same item twice in a row when there is a choice", () => {
    for (let i = 0; i < 30; i++) {
      expect(pickWeighted("d", ["a", "b", "c"], { avoid: "a" })).not.toBe("a");
    }
    // …unless there is nothing else to ask.
    expect(pickWeighted("d", ["a"], { avoid: "a" })).toBe("a");
  });

  it("summarises what is worth working on", () => {
    for (let i = 0; i < 4; i++) record("d", "good", true);
    record("d", "bad", false);
    record("d", "bad", false);
    record("d", "half", true);
    record("d", "half", false);
    const s = summary("d");
    expect(s.asked).toBe(8);
    expect(s.wrong).toBe(3);
    expect(s.accuracy).toBeCloseTo(5 / 8, 5);
    expect(s.weak[0].item).toBe("bad"); // worst first
    expect(s.weak.map((w) => w.item)).not.toContain("good");
  });

  it("forgets a drill without touching the others", () => {
    record("a", "x", true);
    record("b", "y", true);
    resetDrill("a");
    expect(summary("a").asked).toBe(0);
    expect(summary("b").asked).toBe(1);
  });
});
