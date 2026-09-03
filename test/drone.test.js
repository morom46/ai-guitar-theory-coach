/**
 * Drone tests.
 *
 * The audible part needs an AudioContext, so what's tested here is the part
 * that can be wrong in a way you'd notice: which notes it picks. A drone that
 * jumps an octave between B and C, or that sounds a 5th above where you
 * expect, is worse than no drone at all.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  rootToPc,
  droneMidiFor,
  droneVoicing,
  DRONE_MIDI_TARGET,
  suspendForMic,
  releaseForMic,
  setDroneFollow,
  setDroneRoot,
  getDroneState,
  _micHolds,
} from "../src/audio/drone.js";
import { ROOTS, noteNameToPc } from "../src/theory/engine.js";

describe("rootToPc", () => {
  it("reads naturals, sharps and flats", () => {
    expect(rootToPc("C")).toBe(0);
    expect(rootToPc("C#")).toBe(1);
    expect(rootToPc("Db")).toBe(1);
    expect(rootToPc("A")).toBe(9);
    expect(rootToPc("B")).toBe(11);
  });

  it("wraps past the ends of the octave", () => {
    expect(rootToPc("Cb")).toBe(11);
    expect(rootToPc("B#")).toBe(0);
    expect(rootToPc("Fbb")).toBe(3);
  });

  it("agrees with the theory engine for every root it will ever be given", () => {
    ROOTS.forEach((r) => expect(rootToPc(r), r).toBe(noteNameToPc(r)));
  });

  it("returns null for junk rather than throwing", () => {
    expect(rootToPc("")).toBeNull();
    expect(rootToPc(null)).toBeNull();
    expect(rootToPc(undefined)).toBeNull();
    expect(rootToPc("H")).toBeNull();
    expect(rootToPc(7)).toBeNull();
  });
});

describe("droneMidiFor", () => {
  it("never drops below the guitar's own lowest note", () => {
    // E♭ is a tritone from the A2 target, so its two octaves are equidistant.
    // Rounding that tie down would put the drone at 77.8 Hz — under the open
    // low E, and under what a laptop speaker can reproduce.
    ROOTS.forEach((r) => {
      const midi = droneMidiFor(rootToPc(r));
      expect(midi, `${r} landed on midi ${midi}`).toBeGreaterThanOrEqual(40); // E2
    });
    expect(droneMidiFor(rootToPc("Eb"))).toBe(51);
  });

  it("puts the drone in one narrow register whatever the root", () => {
    const midis = ROOTS.map((r) => droneMidiFor(rootToPc(r)));
    midis.forEach((m, i) => {
      expect(m, `${ROOTS[i]} landed on midi ${m}`).toBeGreaterThanOrEqual(DRONE_MIDI_TARGET - 6);
      expect(m, `${ROOTS[i]} landed on midi ${m}`).toBeLessThanOrEqual(DRONE_MIDI_TARGET + 6);
    });
    // The whole point: no root is more than an octave from any other, so
    // changing key never makes the drone leap.
    expect(Math.max(...midis) - Math.min(...midis)).toBeLessThanOrEqual(12);
  });

  it("keeps the right pitch class", () => {
    ROOTS.forEach((r) => {
      const pc = rootToPc(r);
      expect(droneMidiFor(pc) % 12, r).toBe(pc);
    });
  });

  it("centres on the open A string by default", () => {
    expect(droneMidiFor(9)).toBe(45); // A2 = the open A string
  });

  it("picks the nearest octave to a custom target", () => {
    expect(droneMidiFor(0, 60)).toBe(60); // C4
    expect(droneMidiFor(0, 62)).toBe(60); // still nearer C4 than C5
    expect(droneMidiFor(0, 68)).toBe(72); // now nearer C5
  });

  it("handles junk", () => {
    expect(droneMidiFor(null)).toBeNull();
    expect(droneMidiFor(NaN)).toBeNull();
  });
});

describe("droneVoicing", () => {
  it("stacks root, 5th, octave — in that order", () => {
    const v = droneVoicing("A", { fifth: true });
    expect(v.length).toBe(3);
    const [low, mid, high] = v;
    expect(mid - low).toBe(7); // a perfect 5th
    expect(high - low).toBe(12); // the octave
    expect([...v].sort((a, b) => a - b)).toEqual(v); // ascending
  });

  it("drops to root + octave when the 5th is off", () => {
    const v = droneVoicing("A", { fifth: false });
    expect(v.length).toBe(2);
    expect(v[1] - v[0]).toBe(12);
  });

  it("stays modally neutral — it never sounds a 3rd", () => {
    // A drone containing a 3rd would decide major or minor for you, which
    // defeats the entire purpose when you're trying to hear a mode.
    ROOTS.forEach((r) => {
      const pc = rootToPc(r);
      droneVoicing(r).forEach((m) => {
        const interval = ((m - pc) % 12 + 12) % 12;
        expect([0, 7], `${r}: sounded interval ${interval}`).toContain(interval);
      });
    });
  });

  it("works for all 12 roots", () => {
    ROOTS.forEach((r) => {
      const v = droneVoicing(r);
      expect(v.length, r).toBe(3);
      expect(v[0] % 12, r).toBe(rootToPc(r));
    });
  });

  it("returns nothing for an unusable root instead of throwing", () => {
    expect(droneVoicing("H")).toEqual([]);
    expect(droneVoicing(null)).toEqual([]);
  });

  it("stays inside a sane register for every root", () => {
    ROOTS.forEach((r) => {
      droneVoicing(r).forEach((m) => {
        expect(m, `${r}: midi ${m}`).toBeGreaterThan(32); // above the bass
        expect(m, `${r}: midi ${m}`).toBeLessThan(72); // below where you solo
      });
    });
  });
});

/* ---------- the microphone hold ---------- */

describe("suspendForMic / releaseForMic", () => {
  beforeEach(() => {
    // Drain any holds a previous test left behind.
    while (_micHolds() > 0) releaseForMic();
  });

  it("counts holds up and down", () => {
    expect(_micHolds()).toBe(0);
    suspendForMic();
    expect(_micHolds()).toBe(1);
    releaseForMic();
    expect(_micHolds()).toBe(0);
  });

  it("nests — the drone stays down until the LAST holder lets go", () => {
    suspendForMic();
    suspendForMic();
    expect(_micHolds()).toBe(2);
    releaseForMic();
    expect(_micHolds()).toBe(1); // one holder still has the mic open
    releaseForMic();
    expect(_micHolds()).toBe(0);
  });

  it("reports the hold in the state the UI reads", () => {
    expect(getDroneState().micHeld).toBe(false);
    suspendForMic();
    expect(getDroneState().micHeld).toBe(true);
    releaseForMic();
    expect(getDroneState().micHeld).toBe(false);
  });

  it("returns a release function that works", () => {
    const release = suspendForMic();
    expect(_micHolds()).toBe(1);
    release();
    expect(_micHolds()).toBe(0);
  });

  it("never goes negative, so an extra release cannot un-silence the drone", () => {
    releaseForMic();
    releaseForMic();
    expect(_micHolds()).toBe(0);
    // And a real hold still takes effect afterwards.
    suspendForMic();
    expect(_micHolds()).toBe(1);
    releaseForMic();
    expect(_micHolds()).toBe(0);
  });
});

/* ---------- following the page ---------- */

describe("setDroneRoot", () => {
  it("ignores follow-driven changes while following is off", () => {
    setDroneFollow(false);
    setDroneRoot("C");
    expect(getDroneState().root).toBe("C");
    setDroneRoot("G", { fromFollow: true });
    expect(getDroneState().root).toBe("C"); // pinned
  });

  it("accepts follow-driven changes while following is on", () => {
    setDroneFollow(true);
    setDroneRoot("G", { fromFollow: true });
    expect(getDroneState().root).toBe("G");
  });

  it("a manual pick takes over and stops following", () => {
    // Otherwise the root selector is a control whose effect vanishes on the
    // next page change, with nothing on screen explaining why.
    setDroneFollow(true);
    setDroneRoot("D");
    expect(getDroneState().root).toBe("D");
    expect(getDroneState().follow).toBe(false);
    setDroneRoot("A", { fromFollow: true });
    expect(getDroneState().root).toBe("D");
  });

  it("refuses a root it cannot spell", () => {
    setDroneFollow(false);
    setDroneRoot("E");
    setDroneRoot("H");
    setDroneRoot(null);
    expect(getDroneState().root).toBe("E");
  });
});
