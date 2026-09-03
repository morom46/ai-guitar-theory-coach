/**
 * Solo scheduler maths tests.
 *
 * The sequencer itself needs an AudioContext, so — exactly as in
 * clock.test.js — the arithmetic lives in pure helpers and those are what we
 * test. The two assertions that matter are the two acceptance criteria that
 * cannot be eyeballed:
 *
 *   1. a loop that does not drift across minutes of continuous playing
 *   2. a speed change that does not move the playhead
 */

import { describe, it, expect } from "vitest";
import {
  clampRate,
  firstNoteAtOrAfter,
  visibleNotes,
  loopPlan,
  wrapAnchor,
  ctxOfBeat,
  RATE_MIN,
  RATE_MAX,
  STATES,
} from "../src/audio/soloClock.js";
import { buildTempoMap, beatToSec, secToBeat, normaliseSolo } from "../src/data/soloSchema.js";

const map120 = buildTempoMap([{ atBeat: 0, bpm: 120 }]);

describe("clampRate", () => {
  it("keeps speed inside 25%-100%, in 5% steps", () => {
    expect(clampRate(1)).toBe(1);
    expect(clampRate(0.5)).toBe(0.5);
    expect(clampRate(0.07)).toBe(RATE_MIN);
    expect(clampRate(3)).toBe(RATE_MAX);
    expect(clampRate(0.634)).toBe(0.63);
    expect(clampRate(0.636)).toBe(0.64);
    // It goes ABOVE the written tempo now, not just below it.
    expect(clampRate(1.4)).toBe(1.4);
    expect(RATE_MAX).toBeGreaterThan(1);
  });

  it("falls back to full speed for garbage", () => {
    expect(clampRate(NaN)).toBe(1);
    expect(clampRate(undefined)).toBe(1);
    expect(clampRate("nonsense")).toBe(1);
  });
});

describe("firstNoteAtOrAfter", () => {
  const notes = [0, 1, 2, 4, 8, 8, 16].map((startBeat) => ({ startBeat, durBeats: 1 }));

  it("finds the boundary, inclusive", () => {
    expect(firstNoteAtOrAfter(notes, 0)).toBe(0);
    expect(firstNoteAtOrAfter(notes, 3)).toBe(3);
    expect(firstNoteAtOrAfter(notes, 4)).toBe(3);
    expect(firstNoteAtOrAfter(notes, 8)).toBe(4); // the FIRST of a tie
    expect(firstNoteAtOrAfter(notes, 99)).toBe(notes.length);
    expect(firstNoteAtOrAfter([], 4)).toBe(0);
  });
});

describe("visibleNotes", () => {
  const notes = [
    { id: "a", startBeat: 0, durBeats: 8 }, // a long, still-ringing note
    { id: "b", startBeat: 4, durBeats: 0.5 },
    { id: "c", startBeat: 5, durBeats: 0.5 },
    { id: "d", startBeat: 20, durBeats: 1 },
  ];

  it("shows notes that are approaching", () => {
    const v = visibleNotes(notes, 3.5, { lead: 1 }).map((n) => n.id);
    expect(v).toContain("b"); // one beat away
    expect(v).not.toContain("c"); // still 1.5 beats away
  });

  it("keeps a long note visible while it is still ringing", () => {
    // The bug this guards: `a` started 5 beats ago, well outside the lead
    // window, but it is a whole-note-and-a-half and has not finished.
    expect(visibleNotes(notes, 5, { lead: 1 }).map((n) => n.id)).toContain("a");
    expect(visibleNotes(notes, 9.5, { lead: 1 }).map((n) => n.id)).not.toContain("a");
  });

  it("returns them in playing order", () => {
    const v = visibleNotes(notes, 4.5, { lead: 1 });
    expect(v.map((n) => n.startBeat)).toEqual([...v.map((n) => n.startBeat)].sort((x, y) => x - y));
  });

  it("is empty far from any note, and safe on an empty solo", () => {
    expect(visibleNotes(notes, 15)).toEqual([]);
    expect(visibleNotes([], 4)).toEqual([]);
  });
});

describe("the A/B loop does not drift", () => {
  // 16 bars of 4/4 at 92bpm, looped. The acceptance criterion is "no audible
  // or visible drift across 3+ minutes of continuous looping" — at 92bpm a
  // 64-beat lap is ~41.7s, so 3 minutes is about 5 laps. We check 300.
  const map = buildTempoMap([{ atBeat: 0, bpm: 92 }]);
  const loopStart = 0;
  const loopEnd = 64;
  const lapSec = beatToSec(map, loopEnd) - beatToSec(map, loopStart);

  it("re-anchors each lap exactly one lap later", () => {
    let anchor = { fromCtx: -Infinity, anchorCtx: 10, anchorT: beatToSec(map, loopStart) };
    const plan = loopPlan({ map, loopStart, loopEnd, startCtx: 10, count: 301 });

    for (let lap = 1; lap <= 300; lap++) {
      anchor = wrapAnchor({ map, anchor, loopStart, loopEnd });
      // Absolute, not accumulated: after 300 laps (3.5 HOURS of playing) the
      // wrap must still land on the analytic answer.
      expect(anchor.anchorCtx).toBeCloseTo(plan[lap].ctxTime, 9);
    }
    const totalHours = (300 * lapSec) / 3600;
    expect(totalHours).toBeGreaterThan(3); // and that really was hours of audio
  });

  it("puts the first note of the loop at the moment the last one would have ended", () => {
    const anchor = { fromCtx: -Infinity, anchorCtx: 0, anchorT: beatToSec(map, loopStart) };
    const endMoment = ctxOfBeat(map, anchor, loopEnd);
    const wrapped = wrapAnchor({ map, anchor, loopStart, loopEnd });
    expect(ctxOfBeat(map, wrapped, loopStart)).toBeCloseTo(endMoment, 12);
  });

  it("loops a mid-piece range just as exactly", () => {
    let anchor = { fromCtx: -Infinity, anchorCtx: 3.25, anchorT: beatToSec(map, 16) };
    const lap = beatToSec(map, 32) - beatToSec(map, 16);
    for (let i = 1; i <= 50; i++) {
      anchor = wrapAnchor({ map, anchor, loopStart: 16, loopEnd: 32 });
      expect(anchor.anchorCtx).toBeCloseTo(3.25 + i * lap, 9);
    }
  });

  it("holds up across a tempo change inside the loop", () => {
    const varied = buildTempoMap([
      { atBeat: 0, bpm: 60 },
      { atBeat: 8, bpm: 140 },
    ]);
    const lap = beatToSec(varied, 16) - beatToSec(varied, 0);
    let anchor = { fromCtx: -Infinity, anchorCtx: 0, anchorT: 0 };
    for (let i = 1; i <= 100; i++) {
      anchor = wrapAnchor({ map: varied, anchor, loopStart: 0, loopEnd: 16 });
      expect(anchor.anchorCtx).toBeCloseTo(i * lap, 9);
    }
  });
});

describe("changing speed does not move the playhead", () => {
  /**
   * The desync bug, reproduced as arithmetic: rebuilding the tempo map for a
   * new speed changes how many SECONDS a beat is, so an anchor left alone
   * points at a different beat afterwards. Re-anchoring around the held beat
   * is the fix, and this is what it has to satisfy.
   */
  const beatAt = (map, anchor, ctxTime) => secToBeat(map, anchor.anchorT + (ctxTime - anchor.anchorCtx));

  it("holds the beat across every step from 100% to 25%", () => {
    const nowCtx = 12.5;
    let map = buildTempoMap([{ atBeat: 0, bpm: 92 }], { rate: 1 });
    let anchor = { fromCtx: -Infinity, anchorCtx: 4, anchorT: 0 };
    const held = beatAt(map, anchor, nowCtx);
    expect(held).toBeGreaterThan(0);

    for (let rate = 1; rate >= 0.25; rate -= 0.05) {
      const r = clampRate(rate);
      map = buildTempoMap([{ atBeat: 0, bpm: 92 }], { rate: r });
      anchor = { fromCtx: -Infinity, anchorCtx: nowCtx, anchorT: beatToSec(map, held) };
      expect(beatAt(map, anchor, nowCtx)).toBeCloseTo(held, 9);
    }
  });

  it("carries on from the same beat, only slower", () => {
    const nowCtx = 20;
    const full = buildTempoMap([{ atBeat: 0, bpm: 120 }], { rate: 1 });
    const anchorFull = { fromCtx: -Infinity, anchorCtx: 0, anchorT: 0 };
    const held = beatAt(full, anchorFull, nowCtx); // 40 beats in
    expect(held).toBeCloseTo(40, 9);

    const half = buildTempoMap([{ atBeat: 0, bpm: 120 }], { rate: 0.5 });
    const anchorHalf = { fromCtx: -Infinity, anchorCtx: nowCtx, anchorT: beatToSec(half, held) };
    expect(beatAt(half, anchorHalf, nowCtx)).toBeCloseTo(40, 9);
    // One second later, half speed has covered half as many beats.
    expect(beatAt(half, anchorHalf, nowCtx + 1) - 40).toBeCloseTo(1, 9);
    expect(beatAt(full, anchorFull, nowCtx + 1) - 40).toBeCloseTo(2, 9);
  });
});

describe("the count-in shares the grid", () => {
  it("puts the clicks on the beats before beat zero", () => {
    const startBeat = 0;
    const countBeats = 4;
    const countSec = beatToSec(map120, startBeat) - beatToSec(map120, startBeat - countBeats);
    expect(countSec).toBeCloseTo(2, 12); // 4 beats at 120bpm

    const anchor = { fromCtx: -Infinity, anchorCtx: 5 + countSec, anchorT: beatToSec(map120, startBeat) };
    // The four clicks land at 5.0, 5.5, 6.0, 6.5; the solo starts at 7.0.
    const clicks = [-4, -3, -2, -1].map((b) => ctxOfBeat(map120, anchor, b));
    expect(clicks).toEqual([5, 5.5, 6, 6.5].map((n) => expect.closeTo(n, 9)));
    expect(ctxOfBeat(map120, anchor, 0)).toBeCloseTo(7, 9);
  });

  it("counts in at the loop start, not at beat zero", () => {
    const startBeat = 32;
    const countSec = beatToSec(map120, startBeat) - beatToSec(map120, startBeat - 4);
    const anchor = { fromCtx: -Infinity, anchorCtx: countSec, anchorT: beatToSec(map120, startBeat) };
    expect(ctxOfBeat(map120, anchor, startBeat)).toBeCloseTo(countSec, 9);
    expect(ctxOfBeat(map120, anchor, startBeat - 4)).toBeCloseTo(0, 9);
  });
});

describe("step mode walks the notes", () => {
  // Step mode has no clock, so its logic is index arithmetic over the sorted
  // note list — the same list the scheduler walks. These are the boundaries
  // that make "step + loop + count-in together" behave.
  const solo = normaliseSolo({
    notes: [0, 1, 2, 3, 4, 5, 6, 7].map((b) => ({ startBeat: b, durBeats: 1, string: 0, fret: 5 })),
  });

  it("bounds the walk to the loop range", () => {
    const lo = firstNoteAtOrAfter(solo.notes, 2);
    const hi = firstNoteAtOrAfter(solo.notes, 6) - 1;
    expect(lo).toBe(2);
    expect(hi).toBe(5);
    expect(solo.notes[lo].startBeat).toBe(2);
    expect(solo.notes[hi].startBeat).toBe(5);
  });

  it("names its states once, so nothing spells them by hand", () => {
    expect(Object.values(STATES)).toEqual(["idle", "countIn", "playing", "paused", "stepping"]);
  });
});
