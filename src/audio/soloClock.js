/**
 * THE SOLO CLOCK — a sequencer you can practise to.
 *
 * Same discipline as ./clock.js, and for the same reason: `AudioContext.
 * currentTime` is the only clock that does not drift. A 25ms timer looks at
 * it and books every note falling inside the next 150ms; requestAnimationFrame
 * never schedules anything, it only *reads* the beat and draws.
 *
 * THE ANCHOR
 * ----------
 * Position is not accumulated, it is derived. One anchor pins a transport
 * second to an audio-clock second:
 *
 *     transportNow = anchorT + (ctx.currentTime - anchorCtx)
 *     beatNow      = secToBeat(tempoMap, transportNow)
 *
 * Everything visual comes off that single number, so seeking, looping and
 * speed changes are automatically consistent — there is no second copy of
 * "where are we" to fall out of step.
 *
 * WHY THERE IS A QUEUE OF ANCHORS
 * -------------------------------
 * The scheduler runs ~150ms AHEAD of the sound. When it books the loop jump
 * it must start using the post-jump anchor immediately, but the *listener* is
 * still 150ms back, before the jump. Swapping one anchor in place makes the
 * playhead teleport a beat early on every single loop — visible as a stutter,
 * and the reason this is a queue: scheduling reads the newest anchor, drawing
 * reads the newest anchor whose time has actually arrived.
 *
 * The maths lives in exported pure functions so it can be tested with no
 * audio device present (test/soloClock.test.js).
 */

import { getCtx, resume, click, voiceAt, cancelScheduledNotes, cancelScheduledClicks } from "./engine.js";
import {
  buildTempoMap,
  beatToSec,
  secToBeat,
  beatsPerBarAt,
  noteMidi,
  soloEndBeat,
  normaliseSolo,
} from "../data/soloSchema.js";

const LOOKAHEAD_MS = 25; // how often we look at the audio clock
const SCHEDULE_AHEAD = 0.15; // how far ahead we book notes (seconds)
const CUSHION = 0.08; // breathing room before the first note

export const RATE_MIN = 0.25;
export const RATE_MAX = 2;
// Fine enough that the BPM control above it can move one beat per minute at
// any written tempo: at 87bpm a 0.05 step jumped four and a half.
export const RATE_STEP = 0.01;

/**
 * Speed control, a multiplier on the written tempo.
 *
 * It reaches PAST 1 now. Slowing a solo down is the obvious use and the one
 * this started with, but a solo written at 78 that you want to run at 92 is
 * the same operation with the number the other way round, and refusing it
 * only meant editing the document.
 */
export function clampRate(r) {
  const n = Number(r);
  if (!Number.isFinite(n)) return 1;
  const snapped = Math.round(n / RATE_STEP) * RATE_STEP;
  return Math.max(RATE_MIN, Math.min(RATE_MAX, Math.round(snapped * 100) / 100));
}

/* ==================== pure scheduling maths ==================== */

/**
 * THE SEQUENCER'S UNIT OF WORK.
 *
 * One list, walked by playback, step mode and the loop bounds alike. It exists
 * as its own function rather than as `solo.notes` inline so that an importer
 * which one day emits something other than a plain note — a rest, a chord
 * stab — has a single place to be taught about.
 */
export function buildEvents(solo) {
  return solo.notes.map((n) => ({ startBeat: n.startBeat, durBeats: n.durBeats, kind: "note", note: n, id: n.id }));
}

/** Index of the first note at or after `beat`. Notes must be sorted. */
export function firstNoteAtOrAfter(notes, beat) {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].startBeat < beat) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The notes an overlay should be drawing at `beat`: already approaching, or
 * still ringing. `lead` and `tail` are in beats.
 *
 * Called once per frame, so it walks out from a binary search rather than
 * filtering the whole list.
 */
export function visibleNotes(notes, beat, { lead = 1, tail = 0.5, lookback = 8 } = {}) {
  const out = [];
  if (!notes.length) return out;
  let i = firstNoteAtOrAfter(notes, beat - lead);
  // Walk back over notes that started earlier but may still be ringing —
  // without this a whole note vanishes the instant the next one approaches.
  while (i > 0 && beat - notes[i - 1].startBeat <= lookback) i--;
  for (; i < notes.length; i++) {
    const n = notes[i];
    if (n.startBeat > beat + lead) break;
    if (n.startBeat + n.durBeats + tail >= beat) out.push(n);
  }
  return out;
}

/**
 * When each successive arrival at `loopStart` happens, in audio-clock time.
 *
 * This is the drift test made explicit: every wrap is derived from the first
 * one plus an exact multiple of the loop's length in seconds, never from
 * adding up the previous wraps. A test asserts the scheduler agrees with it
 * over hundreds of laps.
 */
export function loopPlan({ map, loopStart, loopEnd, startCtx = 0, count = 4 }) {
  const lap = beatToSec(map, loopEnd) - beatToSec(map, loopStart);
  return Array.from({ length: count }, (_, i) => ({ lap: i, ctxTime: startCtx + i * lap, lengthSec: lap }));
}

/**
 * Where the transport should be re-pinned so `loopStart` sounds at exactly
 * the moment `loopEnd` would have. Pure, so the wrap can be tested directly.
 */
export function wrapAnchor({ map, anchor, loopStart, loopEnd }) {
  const ctxAtEnd = anchor.anchorCtx + (beatToSec(map, loopEnd) - anchor.anchorT);
  return { fromCtx: ctxAtEnd, anchorCtx: ctxAtEnd, anchorT: beatToSec(map, loopStart) };
}

/** Beat -> absolute audio-clock time, through one anchor. */
export function ctxOfBeat(map, anchor, beat) {
  return anchor.anchorCtx + (beatToSec(map, beat) - anchor.anchorT);
}

/** Transport state names, so nothing spells them by hand. */
export const STATES = {
  idle: "idle",
  countIn: "countIn",
  playing: "playing",
  paused: "paused",
  stepping: "stepping",
};

/* ==================== the sequencer ==================== */

const EMPTY_SOLO = normaliseSolo({ notes: [] });

export class SoloScheduler {
  constructor({ solo = null, rate = 1, countInBars = 1, audible = true } = {}) {
    this.solo = solo ? normaliseSolo(solo) : EMPTY_SOLO;
    this.rate = clampRate(rate);
    this.countInBars = Math.max(0, Math.min(2, countInBars));
    this.audible = !!audible;
    this.state = STATES.idle;
    this.loop = null; // { startBeat, endBeat }
    this.laps = 0;

    this._map = buildTempoMap(this.solo.tempo, { rate: this.rate });
    this._end = soloEndBeat(this.solo);
    this._events = buildEvents(this.solo);
    this._anchors = [];
    this._nextIndex = 0;
    this._restBeat = 0; // where the playhead sits while not running
    this._stepIndex = 0;
    this._timer = null;
    this._listeners = new Set();
    this._gate = null; // phase 2 (Follow): note => bool
  }

  /* ---------------- subscription ---------------- */

  /** Discrete state changes only — never per frame. Returns an unsubscribe. */
  onState(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit() {
    const snap = {
      state: this.state,
      rate: this.rate,
      loop: this.loop,
      laps: this.laps,
      countInBars: this.countInBars,
      audible: this.audible,
      stepIndex: this._stepIndex,
      running: this.state === STATES.playing || this.state === STATES.countIn,
    };
    this._listeners.forEach((fn) => {
      try {
        fn(snap);
      } catch {
        /* a bad listener must not stop the clock */
      }
    });
  }

  /* ---------------- loading ---------------- */

  load(solo) {
    this.stop();
    this.solo = normaliseSolo(solo);
    this._map = buildTempoMap(this.solo.tempo, { rate: this.rate });
    this._end = soloEndBeat(this.solo);
    this._events = buildEvents(this.solo);
    this.loop = null;
    this.laps = 0;
    this._restBeat = 0;
    this._stepIndex = 0;
    this._emit();
    return this.solo;
  }

  get notes() {
    return this.solo.notes;
  }

  /** What the sequencer actually walks. */
  get events() {
    return this._events;
  }

  get endBeat() {
    return this._end;
  }

  get tempoMap() {
    return this._map;
  }

  /* ---------------- position ---------------- */

  /** The anchor whose moment has actually arrived (see the header note). */
  _activeAnchor(now) {
    if (!this._anchors.length) return null;
    let idx = 0;
    for (let i = 1; i < this._anchors.length; i++) {
      if (this._anchors[i].fromCtx <= now) idx = i;
      else break;
    }
    if (idx > 0) this._anchors.splice(0, idx); // the older ones can never win again
    return this._anchors[0];
  }

  /**
   * THE ONE NUMBER. Everything drawn is a function of this.
   * Below `0` during the count-in, which is exactly what makes the lead-in
   * animation work during the count without a special case.
   */
  beatNow() {
    if (this.state === STATES.stepping || this.state === STATES.paused || this.state === STATES.idle) {
      return this._restBeat;
    }
    const ctx = getCtx();
    if (!ctx) return this._restBeat;
    const a = this._activeAnchor(ctx.currentTime);
    if (!a) return this._restBeat;
    return secToBeat(this._map, a.anchorT + (ctx.currentTime - a.anchorCtx));
  }

  /** Seconds into the piece, for a read-out. */
  secondsNow() {
    return beatToSec(this._map, Math.max(0, this.beatNow()));
  }

  /* ---------------- transport ---------------- */

  play({ from = null, countIn = true } = {}) {
    const ctx = resume() || getCtx();
    if (!ctx) return false; // no audio device — stay stopped rather than fake it

    // Pressing play at the end of the piece means "again", not "nothing".
    let startBeat = from != null ? from : this._restBeat;
    if (startBeat >= this._end) startBeat = this.loop ? this.loop.startBeat : 0;
    this._map = buildTempoMap(this.solo.tempo, { rate: this.rate });
    cancelScheduledNotes();

    const bars = countIn ? this.countInBars : 0;
    const perBar = beatsPerBarAt(this.solo.timeSig, startBeat);
    const countBeats = bars * perBar;
    const startT = beatToSec(this._map, startBeat);
    const countSec = startT - beatToSec(this._map, startBeat - countBeats);

    const anchorCtx = ctx.currentTime + CUSHION + countSec;
    this._anchors = [{ fromCtx: -Infinity, anchorCtx, anchorT: startT }];
    this._nextIndex = firstNoteAtOrAfter(this._events, startBeat);
    this.laps = 0;

    // The count-in is only ever a handful of clicks — book them all now.
    for (let i = 0; i < countBeats; i++) {
      const b = startBeat - countBeats + i;
      click(ctxOfBeat(this._map, this._anchors[0], b), i % perBar === 0 ? "accent" : "beat");
    }

    this.state = countBeats > 0 ? STATES.countIn : STATES.playing;
    this._startTimer();
    this._schedule();
    this._emit();
    return true;
  }

  pause() {
    if (this.state !== STATES.playing && this.state !== STATES.countIn) return;
    this._restBeat = Math.max(0, this.beatNow());
    this._stopTimer();
    cancelScheduledNotes();
    cancelScheduledClicks();
    this.state = STATES.paused;
    this._emit();
  }

  stop() {
    this._stopTimer();
    cancelScheduledNotes();
    cancelScheduledClicks();
    this._anchors = [];
    this._restBeat = this.loop ? this.loop.startBeat : 0;
    this._stepIndex = firstNoteAtOrAfter(this._events, this._restBeat);
    this.laps = 0;
    this.state = STATES.idle;
    this._emit();
  }

  toggle() {
    if (this.state === STATES.playing || this.state === STATES.countIn) this.pause();
    else this.play({ countIn: this.state !== STATES.paused });
    return this.state;
  }

  /**
   * Move the playhead. Cancels what the lookahead already committed, so the
   * old timeline does not play over the new one.
   */
  seek(beat) {
    const b = Math.max(0, Math.min(this._end, Number(beat) || 0));
    const wasRunning = this.state === STATES.playing || this.state === STATES.countIn;
    cancelScheduledNotes();
    this._restBeat = b;
    this._stepIndex = firstNoteAtOrAfter(this._events, b);
    if (wasRunning) {
      const ctx = getCtx();
      if (ctx) {
        this._anchors = [{ fromCtx: -Infinity, anchorCtx: ctx.currentTime, anchorT: beatToSec(this._map, b) }];
        this._nextIndex = this._stepIndex;
        this.state = STATES.playing;
      }
    }
    this._emit();
  }

  /**
   * Speed, without desync.
   *
   * The beat is held fixed across the change and the anchor is rebuilt around
   * it: the same musical position, a different number of seconds into the
   * piece. Rebuilding the map without re-anchoring is what makes the visuals
   * jump away from the audio.
   */
  setRate(rate) {
    const r = clampRate(rate);
    if (r === this.rate) return this.rate;
    const beat = this.beatNow();
    const running = this.state === STATES.playing || this.state === STATES.countIn;
    this.rate = r;
    this._map = buildTempoMap(this.solo.tempo, { rate: r });
    cancelScheduledNotes();
    if (running) {
      const ctx = getCtx();
      if (ctx) {
        this._anchors = [
          { fromCtx: -Infinity, anchorCtx: ctx.currentTime, anchorT: beatToSec(this._map, beat) },
        ];
        this._nextIndex = firstNoteAtOrAfter(this._events, beat);
        this.state = STATES.playing; // a rate change ends any count-in in progress
      }
    } else {
      this._restBeat = Math.max(0, beat);
    }
    this._emit();
    return this.rate;
  }

  /** A/B loop over an arbitrary beat range, or null to clear. */
  setLoop(loop) {
    if (!loop || !(loop.endBeat > loop.startBeat)) {
      this.loop = null;
    } else {
      this.loop = {
        startBeat: Math.max(0, Number(loop.startBeat) || 0),
        endBeat: Math.min(this._end, Number(loop.endBeat) || 0),
      };
    }
    this.laps = 0;
    // Re-derive the scheduling cursor: the loop may have moved the horizon
    // behind us, and a stale cursor would skip every note in the new range.
    if (this.state === STATES.playing || this.state === STATES.countIn) {
      cancelScheduledNotes();
      const beat = this.beatNow();
      if (this.loop && (beat < this.loop.startBeat || beat >= this.loop.endBeat)) this.seek(this.loop.startBeat);
      else this._nextIndex = firstNoteAtOrAfter(this._events, beat);
    } else if (this.loop) {
      this._restBeat = this.loop.startBeat;
      this._stepIndex = firstNoteAtOrAfter(this._events, this.loop.startBeat);
    }
    this._emit();
    return this.loop;
  }

  /** One-tap "loop this section". */
  loopSection(section) {
    if (!section) return this.setLoop(null);
    return this.setLoop({ startBeat: section.startBeat, endBeat: section.endBeat });
  }

  setCountInBars(n) {
    this.countInBars = Math.max(0, Math.min(2, Number(n) || 0));
    this._emit();
  }

  /** Watch (audible) vs Silent (visuals only, you play along). */
  setAudible(on) {
    this.audible = !!on;
    if (!this.audible) cancelScheduledNotes();
    this._emit();
  }

  /* ---------------- step mode ---------------- */

  /**
   * Advance one note at a time, no clock. The playhead parks exactly on the
   * note so every visual derives from `beatNow()` the same way it does under
   * the clock — step mode is not a separate rendering path.
   */
  enterStep() {
    if (this.state === STATES.playing || this.state === STATES.countIn) {
      this._restBeat = Math.max(0, this.beatNow());
      this._stopTimer();
      cancelScheduledNotes();
      cancelScheduledClicks();
    }
    this._stepIndex = Math.max(0, Math.min(this._events.length - 1, firstNoteAtOrAfter(this._events, this._restBeat)));
    this.state = STATES.stepping;
    this._parkOnStep();
    this._emit();
  }

  exitStep() {
    if (this.state !== STATES.stepping) return;
    this.state = STATES.paused;
    this._emit();
  }

  /** Advance one event — one note in a solo, one chord change in a chart. */
  stepBy(delta = 1) {
    if (this.state !== STATES.stepping) this.enterStep();
    const events = this._events;
    if (!events.length) return null;

    // Step mode respects the loop: at the end of the A/B range it goes back
    // to the top of it, not on into the next phrase.
    const lo = this.loop ? firstNoteAtOrAfter(events, this.loop.startBeat) : 0;
    const hi = this.loop ? firstNoteAtOrAfter(events, this.loop.endBeat) - 1 : events.length - 1;
    const span = Math.max(lo, hi);

    let next = this._stepIndex + delta;
    if (next > span) {
      next = lo;
      this.laps++;
    } else if (next < lo) {
      next = span;
    }
    this._stepIndex = next;
    this._parkOnStep();
    const ev = events[next];
    if (ev && this.audible) this._sound(ev, 0);
    this._emit();
    return ev ? ev.note || ev : null;
  }

  _parkOnStep() {
    const ev = this._events[this._stepIndex];
    if (ev) this._restBeat = ev.startBeat;
  }

  /** The event parked on in step mode. */
  get stepEvent() {
    return this.state === STATES.stepping ? this._events[this._stepIndex] || null : null;
  }

  /** The note parked on in step mode. */
  get stepNote() {
    const ev = this.stepEvent;
    return ev ? ev.note : null;
  }

  /* ---------------- phase 2: Follow ---------------- */

  /**
   * Gate the sequencer on something outside it — for Follow mode, a pitch
   * from the microphone (src/audio/pitch.js already detects and stabilises
   * one). The gate is consulted in step mode only, which is why Follow can be
   * dropped in later without touching the clock: "wait for the right note" is
   * step mode with an automatic finger on the button.
   */
  setGate(fn) {
    this._gate = typeof fn === "function" ? fn : null;
  }

  /** Feed a detected MIDI note in; advances when it matches the target. */
  notifyPitch(midi) {
    if (this.state !== STATES.stepping) return false;
    const note = this.stepNote;
    if (!note) return false;
    const want = noteMidi(note, this.solo.meta);
    const ok = this._gate ? this._gate(note, midi) : midi === want;
    if (ok) this.stepBy(1);
    return ok;
  }

  /* ---------------- the lookahead ---------------- */

  _startTimer() {
    if (this._timer) return;
    this._timer = setInterval(() => this._schedule(), LOOKAHEAD_MS);
  }

  _stopTimer() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  _sound(ev, at) {
    return this._pluck(ev.note, at);
  }

  _pluck(note, at) {
    if (!note) return;
    const meta = this.solo.meta;
    const midi = noteMidi(note, meta);
    const durSec =
      beatToSec(this._map, note.startBeat + note.durBeats) - beatToSec(this._map, note.startBeat);

    let glideToMidi = null;
    if (note.technique === "slide" && note.slideToFret != null) {
      glideToMidi = noteMidi({ ...note, fret: note.slideToFret }, meta);
    } else if (note.technique === "bend" && note.bendSemitones) {
      glideToMidi = midi + note.bendSemitones;
    } else if (note.technique === "release" && note.bendSemitones) {
      glideToMidi = midi - note.bendSemitones;
    }

    voiceAt({
      midi: note.technique === "release" && note.bendSemitones ? midi + note.bendSemitones : midi,
      at,
      dur: Math.max(0.12, durSec * 1.15),
      vol: 0.24,
      glideToMidi,
      vibratoCents: note.technique === "vibrato" ? 28 : 0,
      mute: note.technique === "mute",
      harmonic: note.technique === "harmonic",
      accent: note.accent,
    });
  }

  _schedule() {
    const ctx = getCtx();
    if (!ctx) return;
    if (this.state !== STATES.playing && this.state !== STATES.countIn) return;

    // The count-in ends when the clock actually reaches the first beat, not
    // when the lookahead schedules past it.
    if (this.state === STATES.countIn) {
      const a = this._anchors[0];
      if (a && ctx.currentTime >= a.anchorCtx) {
        this.state = STATES.playing;
        this._emit();
      }
    }

    const events = this._events;
    const horizonCtx = ctx.currentTime + SCHEDULE_AHEAD;
    let anchor = this._anchors[this._anchors.length - 1];
    if (!anchor) return;

    let guard = 0;
    while (guard++ < 8) {
      const horizonBeat = secToBeat(this._map, anchor.anchorT + (horizonCtx - anchor.anchorCtx));
      const limit = this.loop ? this.loop.endBeat : this._end;
      const cap = Math.min(horizonBeat, limit);

      while (this._nextIndex < events.length && events[this._nextIndex].startBeat < cap) {
        const ev = events[this._nextIndex];
        if (this.audible) this._sound(ev, ctxOfBeat(this._map, anchor, ev.startBeat));
        this._nextIndex++;
      }

      if (horizonBeat < limit) break;

      if (this.loop) {
        anchor = wrapAnchor({ map: this._map, anchor, loopStart: this.loop.startBeat, loopEnd: this.loop.endBeat });
        this._anchors.push(anchor);
        this._nextIndex = firstNoteAtOrAfter(events, this.loop.startBeat);
        this.laps++;
      } else {
        // End of the solo: let the tail ring, then stop when it truly arrives.
        if (ctx.currentTime >= ctxOfBeat(this._map, anchor, this._end)) this.stop();
        break;
      }
    }
  }

  dispose() {
    this.stop();
    this._listeners.clear();
  }
}
