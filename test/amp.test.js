/**
 * THE AMP — what a tone MEANS.
 *
 * The audible half needs an AudioContext and there isn't one here, so what is
 * tested is the half that can be silently wrong: the mapping from knobs to a
 * signal chain. A drive curve that clips backwards, a makeup gain that goes UP
 * with the gain knob, an ISF that brightens when it should darken — none of
 * those throw, they just make every solo sound the same, which is the failure
 * this whole file exists to prevent.
 */

import { describe, it, expect } from "vitest";
import { ampFromTone, driveCurve, ampSummary, VOICE_DRIVE, PICKUP_HZ, REVERB } from "../src/audio/amp.js";
import { SEED_TABS } from "../src/data/tabs.js";
import { SEED_SONGS } from "../src/data/songs.js";

const tone = (over = {}) => ({
  voice: "Crunch",
  gain: 5,
  volume: 5,
  isf: 5,
  pickup: 3,
  toneKnob: 7,
  fx: {
    mod: { on: false, type: "Chorus", level: 3 },
    dly: { on: false, type: "Analogue", level: 3, ms: 400 },
    rev: { on: false, type: "Room", level: 3 },
  },
  ...over,
});

describe("ampFromTone", () => {
  it("returns null for no tone rather than a default rig", () => {
    expect(ampFromTone(null)).toBeNull();
    expect(ampFromTone(undefined)).toBeNull();
    expect(ampFromTone("Crunch")).toBeNull();
  });

  it("keeps the voices in order — a clean voice stays clean at the same gain", () => {
    const at = (voice) => ampFromTone(tone({ voice })).drive;
    const order = ["Clean Warm", "Clean Bright", "Crunch", "Super Crunch", "OD 1", "OD 2"];
    order.forEach((v, i) => {
      if (i) expect(at(v), `${v} vs ${order[i - 1]}`).toBeGreaterThan(at(order[i - 1]));
    });
    expect(at("Clean Warm")).toBeLessThan(0.15);
    expect(at("OD 2")).toBeGreaterThan(0.6);
  });

  it("lets the gain knob move a voice without letting it become another one", () => {
    const clean0 = ampFromTone(tone({ voice: "Clean Warm", gain: 0 })).drive;
    const clean10 = ampFromTone(tone({ voice: "Clean Warm", gain: 10 })).drive;
    const od0 = ampFromTone(tone({ voice: "OD 1", gain: 0 })).drive;
    expect(clean10).toBeGreaterThan(clean0); // the knob does something
    expect(clean10).toBeLessThan(od0); // but Clean Warm at 10 is not OD 1 at 0
  });

  it("takes the makeup gain DOWN as the drive goes up, not up", () => {
    // Getting this backwards is the classic distortion bug: every notch of
    // gain also gets louder, so you turn the master down, so you turn the gain
    // up. The chain has to compensate for its own compression.
    const quiet = ampFromTone(tone({ voice: "OD 2", gain: 10 })).level;
    const loud = ampFromTone(tone({ voice: "Clean Warm", gain: 0 })).level;
    expect(quiet).toBeLessThan(loud);
    expect(quiet).toBeGreaterThan(0);
  });

  it("reads the ISF as one knob moving two filters in opposition", () => {
    const usa = ampFromTone(tone({ isf: 0 }));
    const uk = ampFromTone(tone({ isf: 10 }));
    expect(usa.midDb).toBeLessThan(0); // American voicing scoops the mids
    expect(uk.midDb).toBeGreaterThan(0); // British voicing pushes them
    expect(usa.presenceDb).toBeGreaterThan(uk.presenceDb); // and is brighter on top
    expect(ampFromTone(tone({ isf: 5 })).midDb).toBe(0);
  });

  it("puts the pickups in the right order — the neck is the dark one", () => {
    const hz = (pickup) => ampFromTone(tone({ pickup })).cabHz;
    expect(hz(5)).toBeLessThan(hz(1)); // neck single darker than bridge HB
    expect(hz(3)).toBeGreaterThan(hz(1)); // middle single is the brightest
    expect(hz(4)).toBeLessThan(hz(3));
  });

  it("closes the cabinet down as the drive comes up", () => {
    const clean = ampFromTone(tone({ voice: "Clean Warm", gain: 2 })).cabHz;
    const dirty = ampFromTone(tone({ voice: "OD 2", gain: 10 })).cabHz;
    expect(dirty).toBeLessThan(clean);
  });

  it("leaves the effects out until the panel lights them", () => {
    const dry = ampFromTone(tone());
    expect(dry.delay).toBeNull();
    expect(dry.reverb).toBeNull();
    expect(dry.mod).toBeNull();
  });

  it("honours the delay time actually written on the panel", () => {
    const t = tone({ fx: { ...tone().fx, dly: { on: true, type: "Analogue", level: 6, ms: 650 } } });
    const spec = ampFromTone(t).delay;
    expect(spec.time).toBeCloseTo(0.65, 6);
    expect(spec.mix).toBeGreaterThan(0);
    expect(spec.feedback).toBeGreaterThan(0);
    expect(spec.feedback).toBeLessThan(1); // a feedback of 1 never stops
  });

  it("sizes the room by reverb type", () => {
    const rev = (type) =>
      ampFromTone(tone({ fx: { ...tone().fx, rev: { on: true, type, level: 5 } } })).reverb;
    expect(rev("Hall").seconds).toBeGreaterThan(rev("Room").seconds);
    expect(rev("Room").seconds).toBeGreaterThan(rev("Spring").seconds);
    expect(rev("Hall").seconds).toBe(REVERB.Hall.seconds);
  });

  it("knows a tremolo is not a delay", () => {
    const mod = (type) =>
      ampFromTone(tone({ fx: { ...tone().fx, mod: { on: true, type, level: 5 } } })).mod;
    expect(mod("Chorus").kind).toBe("chorus");
    expect(mod("Flanger").kind).toBe("chorus");
    expect(mod("Tremolo").kind).toBe("tremolo");
    // A flanger is a shorter, slower, feeding-back chorus — that IS the
    // difference between them, so it had better survive the mapping.
    expect(mod("Flanger").base).toBeLessThan(mod("Chorus").base);
    expect(mod("Flanger").feedback).toBeGreaterThan(mod("Chorus").feedback);
  });

  it("survives a tone with nonsense in it instead of throwing", () => {
    const spec = ampFromTone({ voice: "Nope", gain: "x", isf: 99, pickup: 0, fx: null });
    expect(spec.drive).toBeGreaterThanOrEqual(0);
    expect(spec.drive).toBeLessThanOrEqual(1);
    expect(spec.cabHz).toBeGreaterThan(0);
    expect(spec.delay).toBeNull();
  });
});

describe("driveCurve", () => {
  it("is bounded, rising and odd about zero", () => {
    const curve = driveCurve(0.7, 512);
    expect(curve).toHaveLength(512);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i], `sample ${i}`).toBeGreaterThanOrEqual(curve[i - 1]);
    }
    curve.forEach((v) => expect(Math.abs(v)).toBeLessThan(4));
    // f(-x) = -f(x): a curve that is not odd adds even harmonics, which is a
    // fuzz pedal rather than an overdriven amp. Sample i sits at x = 2i/n - 1,
    // so the point at -x is index n - i, not the mirror from the far end.
    expect(curve[10]).toBeCloseTo(-curve[512 - 10], 9);
    expect(curve[200]).toBeCloseTo(-curve[512 - 200], 9);
  });

  it("clips harder with more drive", () => {
    // Measure how much of the top of the range is flattened: at the same input
    // three quarters of the way up, more drive means proportionally less
    // output left than a clean setting would give.
    const ratio = (amount) => {
      const c = driveCurve(amount, 512);
      return c[Math.floor(512 * 0.875)] / c[511];
    };
    expect(ratio(0.9)).toBeGreaterThan(ratio(0.05));
  });
});

describe("the bundled solos, through your rig", () => {
  it("every solo resolves to a song with a tone that maps to a chain", () => {
    // The Solo Player finds the amp by the solo's songIds. A solo whose song
    // has gone missing silently loses its sound, which is exactly the kind of
    // break that shows up as "why is this one quiet".
    SEED_TABS.forEach((t) => {
      const song = SEED_SONGS.find((sg) => (t.meta.songIds || []).includes(sg.id));
      expect(song, `${t.meta.title} has no song`).toBeTruthy();
      const spec = ampFromTone(song.tone);
      expect(spec, `${t.meta.title} has no tone`).toBeTruthy();
      expect(spec.cabHz).toBeGreaterThan(500);
      expect(spec.level).toBeGreaterThan(0);
    });
  });

  it("does not make all four sound the same", () => {
    // The whole point. If two rigs come out identical, one of the songs is
    // carrying the wrong tone.
    const specs = SEED_TABS.map((t) => {
      const song = SEED_SONGS.find((sg) => (t.meta.songIds || []).includes(sg.id));
      return JSON.stringify(ampFromTone(song.tone));
    });
    expect(new Set(specs).size).toBe(specs.length);
  });
});

describe("ampSummary", () => {
  it("names the voice, the knobs and whatever is lit", () => {
    const s = ampSummary(tone({ fx: { ...tone().fx, rev: { on: true, type: "Hall", level: 6 } } }));
    expect(s).toMatch(/Crunch/);
    expect(s).toMatch(/gain 5/);
    expect(s).toMatch(/Hall 6/);
    expect(s).not.toMatch(/Analogue/); // the delay is off
  });

  it("is empty for no tone", () => {
    expect(ampSummary(null)).toBe("");
  });
});
