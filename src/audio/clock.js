/**
 * THE CLOCK — a metronome you can actually practise to.
 *
 * Timing is scheduled ahead of time on the audio clock, never with
 * setInterval: a 25ms timer only *looks* at the audio clock and books every
 * click that falls inside the next 150ms. setInterval alone drifts and
 * stutters whenever React re-renders; the audio clock does not.
 *
 * The visual beat lags the audio deliberately — scheduled ticks go into a
 * queue and a requestAnimationFrame loop fires the UI callback at the moment
 * its audio time actually arrives, so the dots flash *with* the sound.
 *
 * The pure helpers here (tickPlan, advanceCursor, tapTempoBpm, rampBpm) hold
 * all the arithmetic so the scheduling maths can be unit tested with no audio
 * device present. The React wiring lives in ./useMetronome.jsx.
 */

import { getCtx, click, resume, cancelScheduledClicks } from "./engine.js";

export const BPM_MIN = 30;
export const BPM_MAX = 300;

const LOOKAHEAD_MS = 25; // how often we look at the audio clock
const SCHEDULE_AHEAD = 0.15; // how far ahead we book clicks (seconds)


export const SUBDIVISIONS = [
  { id: 1, label: "♩", name: "quarter notes" },
  { id: 2, label: "♪♪", name: "eighths" },
  { id: 3, label: "♪³", name: "triplets" },
  { id: 4, label: "♬", name: "sixteenths" },
];

export const clampBpm = (n) => Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(n) || 90));

/* ==================== pure scheduling maths ==================== */

/**
 * Advance a {bar, beat, sub} cursor by one subdivision.
 * Returns a NEW cursor; never mutates.
 */
export function advanceCursor(cursor, { sub = 1, beatsPerBar = 4 } = {}) {
  let { bar, beat, subIndex } = cursor;
  subIndex += 1;
  if (subIndex >= sub) {
    subIndex = 0;
    beat += 1;
    if (beat >= beatsPerBar) {
      beat = 0;
      bar += 1;
    }
  }
  return { bar, beat, subIndex };
}

/** Which click sound a cursor position should make. */
export function kindFor(cursor, { accent = true } = {}) {
  if (cursor.subIndex !== 0) return "sub";
  if (accent && cursor.beat === 0) return "accent";
  return "beat";
}

/**
 * Lay out `count` ticks from a starting cursor/time — the exact plan the
 * scheduler follows, as data. Used by the tests and by the count-in.
 */
export function tickPlan({
  bpm = 90,
  sub = 1,
  beatsPerBar = 4,
  accent = true,
  count = 8,
  startTime = 0,
  cursor = { bar: 0, beat: 0, subIndex: 0 },
  countInBars = 0,
}) {
  const out = [];
  let t = startTime;
  let cur = { ...cursor };
  const interval = 60 / bpm / sub;
  for (let i = 0; i < count; i++) {
    out.push({
      time: t,
      bar: cur.bar,
      beat: cur.beat,
      subIndex: cur.subIndex,
      kind: kindFor(cur, { accent }),
      isCountIn: cur.bar < countInBars,
    });
    t += interval;
    cur = advanceCursor(cur, { sub, beatsPerBar });
  }
  return out;
}

/**
 * Tap tempo from a list of timestamps (ms, oldest first).
 * Taps more than 2s apart start a new phrase, so a pause resets cleanly.
 */
export function tapTempoBpm(times) {
  if (!Array.isArray(times) || times.length < 2) return null;
  const gaps = [];
  for (let i = times.length - 1; i > 0 && gaps.length < 5; i--) {
    const gap = times[i] - times[i - 1];
    if (gap <= 0 || gap > 2000) break; // too slow to be the same phrase
    gaps.push(gap);
  }
  if (!gaps.length) return null;
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  return clampBpm(60000 / avg);
}

/**
 * Speed-trainer ramp: every `everyBars` completed bars, add `by` BPM,
 * stopping at `max`. Returns the BPM for the bar just started.
 *
 * `bar` counts from where the ramp began, not from the start of the session,
 * so changing tempo mid-ramp restarts the climb instead of jumping.
 * The result never drops below the starting tempo: a ceiling already below
 * where you're playing means "no ramp", not "slow down".
 */
export function rampBpm({ bpm, bar, startBpm, everyBars = 4, by = 2, max = 160 }) {
  if (!everyBars || everyBars < 1) return clampBpm(bpm);
  const steps = Math.floor(bar / everyBars);
  return clampBpm(Math.max(startBpm, Math.min(max, startBpm + steps * by)));
}

/* ==================== the metronome ==================== */

const DEFAULTS = {
  bpm: 90,
  sub: 1,
  beatsPerBar: 4,
  accent: true,
  countInBars: 0,
  rampOn: false,
  rampEveryBars: 4,
  rampBy: 2,
  rampMax: 160,
};

export class Metronome {
  constructor(settings = {}) {
    this.settings = { ...DEFAULTS, ...settings };
    this.running = false;
    this.cursor = { bar: 0, beat: 0, subIndex: 0 };
    this.nextTime = 0;
    this.startBpm = this.settings.bpm;
    this.rampOriginBar = 0;
    this._timer = null;
    this._raf = null;
    this._queue = [];
    this._taps = [];
    this._listeners = new Set();
    this._boundTick = this._drainQueue.bind(this);
  }

  /** Subscribe to ticks: fn({bar, beat, subIndex, kind, isCountIn, bpm}). */
  onTick(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  patch(patch) {
    const before = this.settings.bpm;
    this.settings = { ...this.settings, ...patch };
    if (patch.bpm != null) {
      this.settings.bpm = clampBpm(patch.bpm);
      // A manual tempo change re-bases the ramp — both its starting tempo AND
      // its bar origin — so it climbs from here instead of jumping to wherever
      // the absolute bar count had already taken it.
      if (this.settings.bpm !== before) {
        this.startBpm = this.settings.bpm;
        this.rampOriginBar = this.cursor.bar;
      }
    }
    return this.settings;
  }

  get bpm() {
    return this.settings.bpm;
  }

  start() {
    if (this.running) return;
    const ctx = resume() || getCtx();
    if (!ctx) return; // no audio device — stay stopped rather than fake it
    this.running = true;
    this.cursor = { bar: 0, beat: 0, subIndex: 0 };
    this.startBpm = this.settings.bpm;
    this.rampOriginBar = this.settings.countInBars; // the count-in is not part of the ramp
    this.nextTime = ctx.currentTime + 0.08; // small cushion before the first click
    this._queue = [];
    this._timer = setInterval(() => this._schedule(), LOOKAHEAD_MS);
    this._schedule();
    this._raf = requestAnimationFrame(this._boundTick);
    this._emitState();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    // Kill the clicks the lookahead already booked, or Stop leaves a tail.
    cancelScheduledClicks();
    if (this._timer) clearInterval(this._timer);
    if (this._raf) cancelAnimationFrame(this._raf);
    this._timer = null;
    this._raf = null;
    this._queue = [];
    this.cursor = { bar: 0, beat: 0, subIndex: 0 };
    this._emitState();
  }

  toggle() {
    this.running ? this.stop() : this.start();
    return this.running;
  }

  /** Register a tap; returns the derived BPM (and applies it) or null. */
  tap() {
    const t = typeof performance !== "undefined" ? performance.now() : Date.now();
    // A long gap means a fresh phrase — drop the stale taps.
    if (this._taps.length && t - this._taps[this._taps.length - 1] > 2000) this._taps = [];
    this._taps.push(t);
    if (this._taps.length > 8) this._taps.shift();
    const bpm = tapTempoBpm(this._taps);
    if (bpm) {
      this.patch({ bpm });
      this._emitState();
    }
    return bpm;
  }

  resetTaps() {
    this._taps = [];
  }

  _schedule() {
    const ctx = getCtx();
    if (!ctx || !this.running) return;
    const { sub, beatsPerBar, accent, countInBars } = this.settings;

    // Background tabs throttle setInterval to ~1/sec and stop rAF entirely, so
    // we can wake up with nextTime far in the past. Resync to the bar line
    // instead of dumping a burst of late clicks into the speakers.
    if (this.nextTime < ctx.currentTime - 0.15) {
      this.nextTime = ctx.currentTime + 0.05;
      this.cursor = { bar: this.cursor.bar, beat: 0, subIndex: 0 };
      this._queue = [];
    }

    let guard = 0;
    while (this.nextTime < ctx.currentTime + SCHEDULE_AHEAD && guard++ < 128) {
      const kind = kindFor(this.cursor, { accent });
      const isCountIn = this.cursor.bar < countInBars;
      click(this.nextTime, kind);
      this._queue.push({
        time: this.nextTime,
        bar: this.cursor.bar,
        beat: this.cursor.beat,
        subIndex: this.cursor.subIndex,
        kind,
        isCountIn,
        bpm: this.settings.bpm,
      });

      const interval = 60 / this.settings.bpm / sub;
      this.nextTime += interval;
      const prevBar = this.cursor.bar;
      this.cursor = advanceCursor(this.cursor, { sub, beatsPerBar });

      // Ramp at each bar line, once the count-in is done.
      if (this.settings.rampOn && this.cursor.bar !== prevBar) {
        const next = rampBpm({
          bpm: this.settings.bpm,
          bar: Math.max(0, this.cursor.bar - this.rampOriginBar),
          startBpm: this.startBpm,
          everyBars: this.settings.rampEveryBars,
          by: this.settings.rampBy,
          max: this.settings.rampMax,
        });
        // Replace the object rather than mutating it: the React provider holds
        // this same reference, and an in-place edit would never re-render.
        if (next !== this.settings.bpm) this.settings = { ...this.settings, bpm: next };
      }
    }
  }

  /** Fire UI callbacks when each scheduled click's moment actually arrives. */
  _drainQueue() {
    const ctx = getCtx();
    if (!ctx) return;
    while (this._queue.length && this._queue[0].time <= ctx.currentTime + 0.012) {
      const ev = this._queue.shift();
      this._listeners.forEach((fn) => {
        try {
          fn(ev);
        } catch {
          /* a bad listener must not stop the clock */
        }
      });
    }
    if (this.running) this._raf = requestAnimationFrame(this._boundTick);
  }

  _emitState() {
    this._listeners.forEach((fn) => {
      try {
        fn({ ...this.cursor, kind: null, isCountIn: false, bpm: this.settings.bpm, stateOnly: true });
      } catch {
        /* ignore */
      }
    });
  }

  dispose() {
    this.stop();
    this._listeners.clear();
  }
}
