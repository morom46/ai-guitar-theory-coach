/**
 * THE EAR OF THE APP — microphone pitch detection.
 *
 * This is what turns the fretboard from a chart you look at into a drill that
 * checks you. The app can now ask "play the ♭3" and know whether you did.
 *
 * ALGORITHM — McLeod Pitch Method (MPM), i.e. the normalised square
 * difference function (NSDF) plus peak picking:
 *
 *   1. RMS gate — ignore silence and room noise outright.
 *   2. NSDF: n(τ) = 2·r(τ) / m(τ), where r is the autocorrelation at lag τ
 *      and m is the summed energy of the two windows being compared. The
 *      normalisation is the point: plain autocorrelation always peaks at τ=0
 *      and decays, which biases you toward the wrong octave.
 *   3. Peak picking: collect the maxima between positive zero crossings, then
 *      take the FIRST one that reaches 0.87 × the tallest. Taking the tallest
 *      instead is exactly how naive detectors report notes an octave low.
 *   4. Parabolic interpolation across the peak and its neighbours for
 *      sub-sample precision — without it, a 660 Hz note reads ~7 cents flat
 *      at 48 kHz purely from integer rounding.
 *
 * A guitar is a hard case: the low E's fundamental (82 Hz) is often quieter
 * than its 2nd harmonic. NSDF handles that, which is why it's used here
 * instead of "find the biggest FFT bin".
 *
 * The detector is a pure function of (Float32Array, sampleRate) so it can be
 * unit tested against synthesised tones with no microphone present.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getCtx } from "./engine.js";
import { suspendForMic, releaseForMic } from "./drone.js";

export const A4_DEFAULT = 440;
export const NOTE_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** Guitar-sensible search range: low E (82.4 Hz) down to C2, up past E6. */
export const MIN_FREQ = 65;
export const MAX_FREQ = 1350;

/** 2048 samples ≈ 43ms at 48kHz — three periods of the lowest note we accept. */
export const WINDOW = 2048;

/* ---------------- note maths ---------------- */

export function freqToMidiFloat(freq, a4 = A4_DEFAULT) {
  return 69 + 12 * Math.log2(freq / a4);
}

export function midiToFreq(midi, a4 = A4_DEFAULT) {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Nearest equal-tempered note to a frequency.
 * `cents` is signed: negative = flat, positive = sharp.
 */
export function nearestNote(freq, a4 = A4_DEFAULT) {
  if (!Number.isFinite(freq) || freq <= 0) return null;
  const exact = freqToMidiFloat(freq, a4);
  const midi = Math.round(exact);
  return {
    freq,
    midi,
    cents: Math.round((exact - midi) * 100),
    name: NOTE_SHARP[((midi % 12) + 12) % 12],
    pc: ((midi % 12) + 12) % 12,
    octave: Math.floor(midi / 12) - 1,
    targetFreq: midiToFreq(midi, a4),
  };
}

export function centsBetween(freq, targetFreq) {
  if (!(freq > 0) || !(targetFreq > 0)) return 0;
  return 1200 * Math.log2(freq / targetFreq);
}

/* ---------------- the detector ---------------- */

export function rmsOf(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

/**
 * Detect the fundamental in a time-domain buffer.
 * Returns { freq, clarity, rms } or null when there's nothing pitched there.
 *
 * clarity is the NSDF peak height, 0..1 — how periodic the signal is. A
 * clean plucked string sits around 0.85-0.98; room noise never gets near it.
 */
export function detectPitch(buf, sampleRate, opts = {}) {
  const {
    minFreq = MIN_FREQ,
    maxFreq = MAX_FREQ,
    rmsThreshold = 0.008,
    clarityThreshold = 0.6,
    peakRatio = 0.87,
  } = opts;

  if (!buf || !buf.length || !sampleRate) return null;

  const rms = rmsOf(buf);
  if (rms < rmsThreshold) return null;

  // Work on a DC-free copy: an offset inflates r(τ) at every lag equally and
  // flattens the peaks we're trying to find.
  const n = buf.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += buf[i];
  mean /= n;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = buf[i] - mean;

  // Search well ABOVE the frequency we're willing to report. If the search
  // floor sat exactly at maxFreq, a note just above it would have its true
  // peak excluded and the next hill — twice the period — would win, giving a
  // confident reading exactly one octave low instead of an honest "no idea".
  const minLag = Math.max(2, Math.floor(sampleRate / (maxFreq * 1.8)));
  const maxLag = Math.min(Math.floor(n / 2), Math.ceil(sampleRate / minFreq));
  if (maxLag <= minLag) return null;

  // NSDF from lag 1, not from minLag: peak picking needs to see the function
  // dip below zero before the first hill, and for high notes that dip sits
  // *below* minLag. Candidate peaks are filtered by minLag further down.
  const nsdf = new Float32Array(maxLag + 2);
  for (let lag = 1; lag <= maxLag; lag++) {
    let r = 0; // correlation
    let m = 0; // energy of both windows
    const limit = n - lag;
    for (let i = 0; i < limit; i++) {
      const a = x[i];
      const b = x[i + lag];
      r += a * b;
      m += a * a + b * b;
    }
    nsdf[lag] = m > 0 ? (2 * r) / m : 0;
  }

  // Peak picking: one maximum per "hill" between positive-going zero crossings.
  const peaks = [];
  let searching = false; // only inside a hill (NSDF above zero)
  let bestLag = -1;
  let bestVal = -Infinity;
  for (let lag = 2; lag < maxLag; lag++) {
    const prev = nsdf[lag - 1];
    const cur = nsdf[lag];
    const next = nsdf[lag + 1];
    if (!searching) {
      if (prev <= 0 && cur > 0) searching = true;
      else continue;
    }
    if (cur <= 0) {
      // Fell back below zero: close off this hill and wait for the next one.
      if (bestLag > 0) peaks.push({ lag: bestLag, val: bestVal });
      bestLag = -1;
      bestVal = -Infinity;
      searching = false;
      continue;
    }
    if (cur > prev && cur >= next && cur > bestVal) {
      bestVal = cur;
      bestLag = lag;
    }
  }
  if (bestLag > 0) peaks.push({ lag: bestLag, val: bestVal });

  // Only lags inside the musical range are real candidates.
  let candidates = peaks.filter((p) => p.lag >= minLag);
  if (!candidates.length) {
    // No clean hill in range — fall back to the plain maximum so a marginal
    // signal degrades to a slightly noisy reading rather than to nothing.
    let fbLag = -1;
    let fbVal = -Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      if (nsdf[lag] > fbVal) {
        fbVal = nsdf[lag];
        fbLag = lag;
      }
    }
    if (fbLag < 0) return null;
    candidates = [{ lag: fbLag, val: fbVal }];
  }

  const tallest = candidates.reduce((a, b) => (b.val > a.val ? b : a));
  if (tallest.val < clarityThreshold) return null;

  // The FIRST peak that clears the ratio — this is the octave guard. Picking
  // the tallest instead is exactly how detectors land an octave too low.
  const threshold = tallest.val * peakRatio;
  const chosen = candidates.find((p) => p.val >= threshold) || tallest;

  // Parabolic interpolation around the chosen lag.
  const lag = chosen.lag;
  const y0 = nsdf[lag - 1] ?? chosen.val;
  const y1 = chosen.val;
  const y2 = nsdf[lag + 1] ?? chosen.val;
  const denom = 2 * (2 * y1 - y0 - y2);
  const shift = denom !== 0 ? (y2 - y0) / denom : 0;
  const trueLag = lag + (Math.abs(shift) < 1 ? shift : 0);

  const freq = sampleRate / trueLag;
  // The reporting range, narrower than the search range above.
  if (!Number.isFinite(freq) || freq < minFreq || freq > maxFreq) return null;

  return { freq, clarity: y1, rms };
}

/* ---------------- reading stabiliser ---------------- */

/**
 * Raw frames are jittery: pick attacks, the metronome click, and the moment a
 * note dies all produce garbage readings. This keeps a short history and only
 * reports a note once the same MIDI note has appeared in a majority of recent
 * frames — which is also what stops the metronome's blip being read as a note.
 */
export function createStabiliser({ history = 6, agree = 3, a4 = A4_DEFAULT } = {}) {
  let frames = [];
  let ref = a4;
  return {
    setA4(v) {
      ref = v;
    },
    /** Feed one detection (or null for a silent frame). */
    push(det) {
      frames.push(det ? nearestNote(det.freq, ref) : null);
      if (frames.length > history) frames.shift();
      return this.read();
    },
    read() {
      const hits = frames.filter(Boolean);
      if (!hits.length) return null;
      const counts = new Map();
      hits.forEach((h) => counts.set(h.midi, (counts.get(h.midi) || 0) + 1));
      let bestMidi = null;
      let bestCount = 0;
      counts.forEach((c, midi) => {
        if (c > bestCount) {
          bestCount = c;
          bestMidi = midi;
        }
      });
      if (bestCount < agree) return null;
      // Median cents across the agreeing frames — robust to one bad frame.
      const matching = hits.filter((h) => h.midi === bestMidi);
      const cents = matching.map((h) => h.cents).sort((a, b) => a - b);
      const mid = cents[Math.floor(cents.length / 2)];
      const freqs = matching.map((h) => h.freq).sort((a, b) => a - b);
      return {
        ...matching[matching.length - 1],
        cents: mid,
        freq: freqs[Math.floor(freqs.length / 2)],
        confidence: bestCount / Math.max(1, frames.length),
      };
    },
    reset() {
      frames = [];
    },
  };
}

/* ---------------- microphone ---------------- */

export const MIC_STATES = {
  idle: "idle",
  requesting: "requesting",
  ready: "ready",
  denied: "denied",
  unsupported: "unsupported",
  error: "error",
};

/**
 * Open the mic on the app's shared AudioContext.
 *
 * The constraints matter more than they look: echo cancellation, noise
 * suppression and auto gain control are all tuned for speech and will happily
 * gate, duck or pitch-smear a guitar. All three off.
 */
export async function openMic() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    const err = new Error("unsupported");
    err.code = MIC_STATES.unsupported;
    throw err;
  }
  const ctx = getCtx();
  if (!ctx) {
    const err = new Error("no audio context");
    err.code = MIC_STATES.unsupported;
    throw err;
  }
  if (ctx.state === "suspended") await ctx.resume().catch(() => {});

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    },
    video: false,
  });

  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = WINDOW;
  analyser.smoothingTimeConstant = 0;
  source.connect(analyser);
  // Deliberately NOT connected to the destination — that would be a feedback loop.

  const data = new Float32Array(analyser.fftSize);
  return {
    ctx,
    stream,
    analyser,
    sampleRate: ctx.sampleRate,
    read() {
      analyser.getFloatTimeDomainData(data);
      return data;
    },
    stop() {
      try {
        source.disconnect();
      } catch {
        /* ignore */
      }
      stream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      });
    },
  };
}

/**
 * React hook: microphone + stabilised pitch reading.
 *
 * `active` gates the analysis loop so a page can hold the mic open but stop
 * burning CPU. Returns { state, note, raw, level, start, stop, error }.
 */
export function useMicPitch({ a4 = A4_DEFAULT, active = true, onNote } = {}) {
  const [state, setState] = useState(MIC_STATES.idle);
  const [note, setNote] = useState(null);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState(null);

  const micRef = useRef(null);
  const rafRef = useRef(null);
  const startingRef = useRef(false);
  const stoppedRef = useRef(false);
  const droneHeldRef = useRef(false);
  const lastNoteRef = useRef(null);
  const levelRef = useRef(0);
  const stabRef = useRef(createStabiliser({ a4 }));
  const activeRef = useRef(active);
  const onNoteRef = useRef(onNote);
  const lastRunRef = useRef(0);
  const a4Ref = useRef(a4);

  activeRef.current = active;
  onNoteRef.current = onNote;
  a4Ref.current = a4;

  useEffect(() => {
    stabRef.current.setA4(a4);
    stabRef.current.reset();
    lastNoteRef.current = null;
  }, [a4]);

  const loop = useCallback(() => {
    const mic = micRef.current;
    if (!mic) return;
    // Throttle to ~30 analyses/sec: the NSDF is the app's only heavy maths and
    // a display can't use more than that anyway.
    const t = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (t - lastRunRef.current >= 33) {
      lastRunRef.current = t;
      if (activeRef.current) {
        const buf = mic.read();
        const det = detectPitch(buf, mic.sampleRate);
        // Quantise the meter: a 6px bar does not need 30 re-renders a second,
        // and every one of them re-renders the fretboard underneath it.
        const lvl = Math.round(rmsOf(buf) * 50) / 50;
        if (lvl !== levelRef.current) {
          levelRef.current = lvl;
          setLevel(lvl);
        }
        const stable = stabRef.current.push(det);
        // Compare against the previous reading via a ref, not inside the state
        // updater: React may run an updater twice, and firing onNote from in
        // there would report the same note twice.
        const prev = lastNoteRef.current;
        const changed =
          (!prev && stable) ||
          (prev && !stable) ||
          (prev && stable && (prev.midi !== stable.midi || prev.cents !== stable.cents));
        if (changed) {
          lastNoteRef.current = stable;
          setNote(stable);
          if (stable && onNoteRef.current) onNoteRef.current(stable);
        }
      }
    }
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const releaseDrone = () => {
    if (droneHeldRef.current) {
      droneHeldRef.current = false;
      releaseForMic();
    }
  };

  const start = useCallback(async () => {
    // Guard the in-flight window too, not just the settled one: getUserMedia is
    // async, so two quick clicks would open two streams and only the second
    // would ever be stopped — leaving the recording indicator lit for good.
    if (micRef.current || startingRef.current) return true;
    startingRef.current = true;
    stoppedRef.current = false;
    setState(MIC_STATES.requesting);
    setError(null);
    try {
      const opened = await openMic();
      startingRef.current = false;
      // stop() or an unmount may have run while we waited for permission.
      if (stoppedRef.current) {
        opened.stop();
        releaseDrone();
        return false;
      }
      micRef.current = opened;
      // A sustained drone is the loudest, most periodic thing in the room —
      // the detector would lock onto it and never hear the guitar. Hold it
      // silent for as long as we have the microphone open.
      if (!droneHeldRef.current) {
        droneHeldRef.current = true;
        suspendForMic();
      }
      stabRef.current.reset();
      lastNoteRef.current = null;
      setState(MIC_STATES.ready);
      rafRef.current = requestAnimationFrame(loop);
      return true;
    } catch (e) {
      startingRef.current = false;
      micRef.current = null;
      const denied = e && (e.name === "NotAllowedError" || e.name === "SecurityError");
      setState(denied ? MIC_STATES.denied : e?.code === MIC_STATES.unsupported ? MIC_STATES.unsupported : MIC_STATES.error);
      setError(e?.message || String(e));
      return false;
    }
  }, [loop]);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    startingRef.current = false; // let a later start() through
    releaseDrone();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (micRef.current) micRef.current.stop();
    micRef.current = null;
    stabRef.current.reset();
    lastNoteRef.current = null;
    setNote(null);
    setLevel(0);
    setState(MIC_STATES.idle);
  }, []);

  // Always release the device when the page unmounts — a live mic indicator
  // left on after you navigate away is alarming and rude.
  useEffect(() => () => {
    // Mark stopped FIRST. getUserMedia may still be in flight — the user
    // navigated away while the permission prompt was open — and without this
    // flag the promise resolves into a dead component, opens the stream, takes
    // a drone hold nothing will ever release, and starts an rAF loop that runs
    // pitch detection forever.
    stoppedRef.current = true;
    startingRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (micRef.current) micRef.current.stop();
    micRef.current = null;
    if (droneHeldRef.current) {
      droneHeldRef.current = false;
      releaseForMic();
    }
  }, []);

  return { state, note, level, error, start, stop, listening: state === MIC_STATES.ready };
}

/* ---------------- guitar helpers ---------------- */

/** Standard tuning, string 1 (high E) .. string 6 (low E) — matches the engine. */
export const STRING_MIDI = [64, 59, 55, 50, 45, 40];
export const STRING_LABELS = ["E", "B", "G", "D", "A", "E"];

/** Which open string a detected note is closest to (index into STRING_MIDI). */
export function nearestString(midi) {
  let best = 0;
  let bestD = Infinity;
  STRING_MIDI.forEach((m, i) => {
    const d = Math.abs(m - midi);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Every (string, fret) position that sounds a given pitch class. */
export function positionsForPc(pc, frets = 24) {
  const out = [];
  STRING_MIDI.forEach((open, s) => {
    for (let f = 0; f <= frets; f++) {
      if ((open + f) % 12 === pc) out.push({ s, f, midi: open + f });
    }
  });
  return out;
}
