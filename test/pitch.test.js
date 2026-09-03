/**
 * Pitch-detector tests.
 *
 * The detector is the one piece of this app where "roughly right" is not good
 * enough — a tuner that reads 20 cents off is worse than no tuner. So we feed
 * it synthesised signals with a known frequency and assert the answer in
 * cents, across the whole guitar range and at both common sample rates.
 */

import { describe, it, expect } from "vitest";
import {
  detectPitch,
  nearestNote,
  freqToMidiFloat,
  midiToFreq,
  centsBetween,
  createStabiliser,
  nearestString,
  positionsForPc,
  STRING_MIDI,
  WINDOW,
} from "../src/audio/pitch.js";

/* ---------- signal generators ---------- */

const sine = (freq, sr, n = WINDOW, amp = 0.4, phase = 0) => {
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) b[i] = amp * Math.sin((2 * Math.PI * freq * i) / sr + phase);
  return b;
};

/** A crude plucked-string spectrum: fundamental + decaying harmonics. */
const guitarish = (freq, sr, n = WINDOW, amp = 0.35) => {
  const b = new Float32Array(n);
  const partials = [1, 0.62, 0.41, 0.28, 0.19, 0.12, 0.08, 0.05];
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let h = 0; h < partials.length; h++) {
      v += partials[h] * Math.sin((2 * Math.PI * freq * (h + 1) * i) / sr + h * 0.7);
    }
    // Slight amplitude decay across the window, like a real decaying note.
    b[i] = amp * v * (1 - (0.25 * i) / n);
  }
  return b;
};

/** Low string with a weak fundamental — the classic detector trap. */
const weakFundamental = (freq, sr, n = WINDOW, amp = 0.35) => {
  const b = new Float32Array(n);
  const partials = [0.25, 1, 0.7, 0.45, 0.3];
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let h = 0; h < partials.length; h++) {
      v += partials[h] * Math.sin((2 * Math.PI * freq * (h + 1) * i) / sr);
    }
    b[i] = amp * v * 0.4;
  }
  return b;
};

const noise = (sr, n = WINDOW, amp = 0.3) => {
  const b = new Float32Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    prev = prev * 0.5 + (Math.random() * 2 - 1) * 0.5;
    b[i] = prev * amp;
  }
  return b;
};

const silence = (n = WINDOW) => new Float32Array(n);

const centsErr = (got, want) => Math.abs(centsBetween(got, want));

/* ---------- note maths ---------- */

describe("note maths", () => {
  it("puts A4 at midi 69", () => {
    expect(freqToMidiFloat(440)).toBeCloseTo(69, 10);
    expect(midiToFreq(69)).toBeCloseTo(440, 10);
  });

  it("round-trips every midi note in the guitar range", () => {
    for (let m = 40; m <= 88; m++) {
      expect(freqToMidiFloat(midiToFreq(m))).toBeCloseTo(m, 8);
    }
  });

  it("names notes and octaves the way a tuner should", () => {
    expect(nearestNote(82.41)).toMatchObject({ name: "E", octave: 2, midi: 40 });
    expect(nearestNote(440)).toMatchObject({ name: "A", octave: 4, midi: 69 });
    expect(nearestNote(329.63)).toMatchObject({ name: "E", octave: 4, midi: 64 });
    expect(nearestNote(233.08)).toMatchObject({ name: "A#", octave: 3 });
  });

  it("reports sharp and flat with the right sign", () => {
    expect(nearestNote(440).cents).toBe(0);
    expect(nearestNote(midiToFreq(69) * Math.pow(2, 20 / 1200)).cents).toBe(20); // sharp
    expect(nearestNote(midiToFreq(69) * Math.pow(2, -20 / 1200)).cents).toBe(-20); // flat
  });

  it("honours a non-440 reference pitch", () => {
    expect(nearestNote(432, 432)).toMatchObject({ name: "A", cents: 0 });
    // 440 Hz read against a 432 reference is ~32 cents sharp.
    expect(nearestNote(440, 432).cents).toBe(32);
  });

  it("rejects nonsense frequencies", () => {
    expect(nearestNote(0)).toBeNull();
    expect(nearestNote(-100)).toBeNull();
    expect(nearestNote(NaN)).toBeNull();
  });
});

/* ---------- the detector ---------- */

describe("detectPitch", () => {
  for (const sr of [44100, 48000]) {
    it(`finds every standard-tuning open string within 3 cents @ ${sr}Hz`, () => {
      STRING_MIDI.forEach((m) => {
        const f = midiToFreq(m);
        const got = detectPitch(guitarish(f, sr), sr);
        expect(got, `string midi ${m} (${f.toFixed(1)}Hz)`).not.toBeNull();
        expect(centsErr(got.freq, f), `midi ${m}: got ${got.freq.toFixed(2)} want ${f.toFixed(2)}`).toBeLessThan(3);
      });
    });

    it(`tracks every semitone from E2 to E6 within 5 cents @ ${sr}Hz`, () => {
      const errs = [];
      for (let m = 40; m <= 88; m++) {
        const f = midiToFreq(m);
        const got = detectPitch(guitarish(f, sr), sr);
        expect(got, `midi ${m} (${f.toFixed(1)}Hz) not detected`).not.toBeNull();
        const err = centsErr(got.freq, f);
        errs.push(err);
        expect(err, `midi ${m}: got ${got.freq.toFixed(2)} want ${f.toFixed(2)} (${err.toFixed(1)} cents off)`).toBeLessThan(5);
      }
      // Typical error should be far below the pass bar, not just scraping it.
      const avg = errs.reduce((a, b) => a + b, 0) / errs.length;
      expect(avg).toBeLessThan(1.5);
    });

    it(`handles pure sines too @ ${sr}Hz`, () => {
      [82.41, 110, 146.83, 196, 246.94, 329.63, 440, 659.26].forEach((f) => {
        const got = detectPitch(sine(f, sr), sr);
        expect(got, `${f}Hz sine`).not.toBeNull();
        expect(centsErr(got.freq, f), `${f}Hz sine off by ${centsErr(got.freq, f).toFixed(1)} cents`).toBeLessThan(5);
      });
    });
  }

  it("resolves detuned notes rather than snapping to the nearest fret", () => {
    const sr = 48000;
    // A string 30 cents flat — a tuner must show the 30 cents, not hide it.
    const f = midiToFreq(45) * Math.pow(2, -30 / 1200);
    const got = detectPitch(guitarish(f, sr), sr);
    expect(got).not.toBeNull();
    const note = nearestNote(got.freq);
    expect(note.name).toBe("A");
    expect(note.cents).toBeLessThan(-24);
    expect(note.cents).toBeGreaterThan(-36);
  });

  it("does not drop an octave when the fundamental is weak", () => {
    const sr = 48000;
    [82.41, 110, 146.83].forEach((f) => {
      const got = detectPitch(weakFundamental(f, sr), sr);
      expect(got, `${f}Hz weak-fundamental`).not.toBeNull();
      // The failure mode we care about is reporting f/2 or 2f.
      expect(centsErr(got.freq, f), `got ${got.freq.toFixed(1)} want ${f}`).toBeLessThan(30);
    });
  });

  it("returns null for silence", () => {
    expect(detectPitch(silence(), 48000)).toBeNull();
  });

  it("returns null for room noise", () => {
    let falsePositives = 0;
    for (let i = 0; i < 40; i++) {
      const got = detectPitch(noise(48000), 48000);
      if (got) falsePositives++;
    }
    // Filtered noise can be briefly periodic; the stabiliser is the second
    // line of defence. A handful out of 40 frames is acceptable here.
    expect(falsePositives).toBeLessThan(10);
  });

  it("returns null below the RMS gate", () => {
    expect(detectPitch(sine(220, 48000, WINDOW, 0.0005), 48000)).toBeNull();
  });

  it("reports high clarity for a clean note and is a pure function", () => {
    const buf = guitarish(196, 48000);
    const copy = Float32Array.from(buf);
    const got = detectPitch(buf, 48000);
    expect(got.clarity).toBeGreaterThan(0.8);
    expect(Array.from(buf)).toEqual(Array.from(copy)); // input untouched
  });

  it("ignores a DC offset", () => {
    const sr = 48000;
    const buf = guitarish(220, sr);
    for (let i = 0; i < buf.length; i++) buf[i] += 0.35;
    const got = detectPitch(buf, sr);
    expect(got).not.toBeNull();
    expect(centsErr(got.freq, 220)).toBeLessThan(5);
  });

  it("refuses signals outside the guitar range instead of halving them", () => {
    const sr = 48000;
    expect(detectPitch(sine(30, sr), sr)).toBeNull(); // below MIN_FREQ
    // The trap: a note above the range used to come back exactly one octave
    // low with full confidence, because its true peak sat below the search
    // floor and the 2x-period hill won instead.
    [1500, 1800, 2000, 3000].forEach((f) => {
      const got = detectPitch(sine(f, sr), sr);
      if (got) {
        const err = centsErr(got.freq, f / 2);
        expect(err, `${f}Hz came back as ${got.freq.toFixed(1)} — an octave low`).toBeGreaterThan(40);
        expect(got.freq).toBeLessThanOrEqual(1350);
      }
    });
  });

  it("still tracks the top of the fretboard", () => {
    const sr = 48000;
    // 24th fret high E is 1318.5 Hz — the highest note the app has to read.
    [1046.5, 1174.7, 1318.5].forEach((f) => {
      const got = detectPitch(guitarish(f, sr), sr);
      expect(got, `${f}Hz not detected`).not.toBeNull();
      expect(centsErr(got.freq, f), `${f}Hz off by ${centsErr(got.freq, f).toFixed(1)} cents`).toBeLessThan(5);
    });
  });

  it("survives odd inputs without throwing", () => {
    expect(detectPitch(null, 48000)).toBeNull();
    expect(detectPitch(new Float32Array(0), 48000)).toBeNull();
    expect(detectPitch(sine(220, 48000), 0)).toBeNull();
    expect(detectPitch(new Float32Array(16), 48000)).toBeNull();
  });
});

/* ---------- stabiliser ---------- */

describe("createStabiliser", () => {
  it("waits for agreement before reporting a note", () => {
    const s = createStabiliser({ history: 6, agree: 3 });
    expect(s.push({ freq: 440 })).toBeNull(); // 1 frame
    expect(s.push({ freq: 440 })).toBeNull(); // 2 frames
    const out = s.push({ freq: 440 }); // 3 frames — agreement
    expect(out).not.toBeNull();
    expect(out.name).toBe("A");
  });

  it("rejects a single stray frame between real ones", () => {
    const s = createStabiliser({ history: 6, agree: 3 });
    s.push({ freq: 440 });
    s.push({ freq: 1568 }); // stray — e.g. the metronome click
    s.push({ freq: 440 });
    const out = s.push({ freq: 440 });
    expect(out.name).toBe("A");
    expect(out.midi).toBe(69);
  });

  it("takes the median of the cents readings", () => {
    const s = createStabiliser({ history: 5, agree: 3 });
    const f = (cents) => 440 * Math.pow(2, cents / 1200);
    s.push({ freq: f(2) });
    s.push({ freq: f(40) }); // outlier, still note A
    s.push({ freq: f(4) });
    const out = s.push({ freq: f(3) });
    expect(out.cents).toBeLessThan(10); // outlier did not drag it
  });

  it("goes quiet again after silent frames", () => {
    const s = createStabiliser({ history: 4, agree: 3 });
    s.push({ freq: 440 });
    s.push({ freq: 440 });
    expect(s.push({ freq: 440 })).not.toBeNull();
    s.push(null);
    s.push(null);
    s.push(null);
    expect(s.read()).toBeNull();
  });

  it("resets on demand", () => {
    const s = createStabiliser({ agree: 2 });
    s.push({ freq: 440 });
    s.push({ freq: 440 });
    expect(s.read()).not.toBeNull();
    s.reset();
    expect(s.read()).toBeNull();
  });
});

/* ---------- guitar helpers ---------- */

describe("guitar helpers", () => {
  it("maps a pitch to the nearest open string", () => {
    expect(nearestString(40)).toBe(5); // low E
    expect(nearestString(64)).toBe(0); // high E
    expect(nearestString(50)).toBe(3); // D
  });

  it("finds every position for a pitch class", () => {
    const pos = positionsForPc(0, 12); // every C on frets 0-12
    expect(pos.length).toBeGreaterThan(5);
    pos.forEach((p) => {
      expect((STRING_MIDI[p.s] + p.f) % 12).toBe(0);
      expect(p.midi % 12).toBe(0);
    });
    // Low E string: C sits at fret 8 and again at 20 (out of range here).
    expect(pos.some((p) => p.s === 5 && p.f === 8)).toBe(true);
  });
});
