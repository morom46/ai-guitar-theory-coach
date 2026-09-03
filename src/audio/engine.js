/**
 * THE AUDIO ENGINE — one AudioContext for the whole app.
 *
 * Before this file, seven components each built their own AudioContext and
 * their own copy of the same triangle-wave `tone()`. Browsers cap the number
 * of contexts, none of them shared a mute, and improving the sound meant
 * editing it in seven places. Now: one context, one master bus, two voices.
 *
 *   music bus  — plucked notes, strums, chord previews (every page)
 *   click bus  — the metronome (see ./clock.js), on its own fader
 *   drone bus  — the sustained tonic (see ./drone.js), quieter by default
 *                because it is meant to sit underneath your playing
 *
 * VOICES
 *   "pluck" (default) — Karplus-Strong: a noise burst fed through a decaying
 *     comb filter, which is genuinely how a struck string behaves. Rendered
 *     once per note into an AudioBuffer and cached; exact pitch comes from
 *     playbackRate, so the integer delay-line length costs us nothing.
 *   "pure" — the app's original triangle + octave sine. Cleaner for interval
 *     ear-training, and the sound long-time users will recognise.
 *
 * Everything is wrapped so a blocked/absent AudioContext degrades to silence
 * instead of throwing — the app must stay usable with no audio device.
 */

import { driveCurve, impulseResponse } from "./amp.js";

const PREF_KEY = "audio.v1";

let ctx = null;
let master = null; // master gain -> destination
let musicBus = null; // notes -> master
let clickBus = null; // metronome -> master
let droneBus = null; // sustained tonic -> master (see ./drone.js)
let unlockBound = false;

const state = {
  muted: false,
  volume: 0.9, // master 0..1
  clickVolume: 0.7, // click bus 0..1
  droneVolume: 0.45, // drone bus 0..1 — it sits UNDER your playing
  voice: "pluck", // "pluck" | "pure"
};

const listeners = new Set();

const clamp01 = (n) => Math.max(0, Math.min(1, n));

/* ---------------- preferences ---------------- */

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return;
    const v = JSON.parse(raw);
    if (typeof v.muted === "boolean") state.muted = v.muted;
    if (Number.isFinite(v.volume)) state.volume = clamp01(v.volume);
    if (Number.isFinite(v.clickVolume)) state.clickVolume = clamp01(v.clickVolume);
    if (Number.isFinite(v.droneVolume)) state.droneVolume = clamp01(v.droneVolume);
    if (v.voice === "pluck" || v.voice === "pure") state.voice = v.voice;
  } catch {
    /* storage blocked — defaults are fine */
  }
}

function savePrefs() {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

loadPrefs();

function emit() {
  listeners.forEach((fn) => {
    try {
      fn({ ...state });
    } catch {
      /* a bad listener must not break audio */
    }
  });
}

/** Subscribe to mute/volume/voice changes. Returns an unsubscribe function. */
export function subscribe(fn) {
  listeners.add(fn);
  fn({ ...state });
  return () => listeners.delete(fn);
}

export function getAudioState() {
  return { ...state };
}

/* ---------------- context + buses ---------------- */

/** The one AudioContext. Returns null when Web Audio is unavailable. */
export function getCtx() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = state.muted ? 0 : state.volume;
    master.connect(ctx.destination);

    musicBus = ctx.createGain();
    musicBus.gain.value = 1;
    musicBus.connect(master);

    clickBus = ctx.createGain();
    clickBus.gain.value = state.clickVolume;
    clickBus.connect(master);

    droneBus = ctx.createGain();
    droneBus.gain.value = state.droneVolume;
    droneBus.connect(master);

    bindUnlock();
  } catch {
    ctx = null;
  }
  return ctx;
}

/**
 * Browsers start the context suspended until a user gesture. We resume on
 * demand *and* bind a one-time global gesture listener, so the very first
 * click anywhere in the app wakes audio up even if it wasn't a play button.
 */
function bindUnlock() {
  if (unlockBound || typeof document === "undefined") return;
  unlockBound = true;
  const wake = () => {
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    if (ctx && ctx.state === "running") {
      document.removeEventListener("pointerdown", wake);
      document.removeEventListener("keydown", wake);
    }
  };
  document.addEventListener("pointerdown", wake);
  document.addEventListener("keydown", wake);
}

/** Resume the context (call from a user gesture). Safe to call repeatedly. */
export function resume() {
  const c = getCtx();
  if (c && c.state === "suspended") c.resume().catch(() => {});
  return c;
}

export function now() {
  const c = getCtx();
  return c ? c.currentTime : 0;
}

export function musicOut() {
  getCtx();
  return musicBus;
}

export function clickOut() {
  getCtx();
  return clickBus;
}

export function droneOut() {
  getCtx();
  return droneBus;
}

/* ---------------- master controls ---------------- */

function applyMaster() {
  if (!master) return;
  const target = state.muted ? 0 : state.volume;
  try {
    master.gain.setTargetAtTime(target, ctx.currentTime, 0.01);
  } catch {
    master.gain.value = target;
  }
}

export function setMuted(m) {
  state.muted = !!m;
  getCtx();
  applyMaster();
  savePrefs();
  emit();
}

export function toggleMuted() {
  setMuted(!state.muted);
  return state.muted;
}

export function isMuted() {
  return state.muted;
}

export function setVolume(v) {
  state.volume = clamp01(v);
  getCtx();
  applyMaster();
  savePrefs();
  emit();
}

export function setClickVolume(v) {
  state.clickVolume = clamp01(v);
  getCtx();
  if (clickBus) {
    try {
      clickBus.gain.setTargetAtTime(state.clickVolume, ctx.currentTime, 0.01);
    } catch {
      clickBus.gain.value = state.clickVolume;
    }
  }
  savePrefs();
  emit();
}

export function setDroneVolume(v) {
  state.droneVolume = clamp01(v);
  getCtx();
  if (droneBus) {
    try {
      droneBus.gain.setTargetAtTime(state.droneVolume, ctx.currentTime, 0.02);
    } catch {
      droneBus.gain.value = state.droneVolume;
    }
  }
  savePrefs();
  emit();
}

export function setVoice(v) {
  if (v !== "pluck" && v !== "pure") return;
  state.voice = v;
  savePrefs();
  emit();
}

export function getVoice() {
  return state.voice;
}

/* ---------------- Karplus-Strong string ---------------- */

const KS_SECONDS = 1.9; // rendered tail length
const KS_CACHE_MAX = 48; // ~16MB at 48kHz; a session touches far fewer
const ksCache = new Map(); // integer delay length -> AudioBuffer

/**
 * Render one plucked string into a buffer.
 * `n` is the delay-line length in samples; the buffer's pitch is
 * sampleRate / n, which the caller corrects exactly via playbackRate.
 *
 * Exported for tests (a rendered buffer's period is measurable).
 */
export function renderKarplusStrong(n, sampleRate, seconds = KS_SECONDS) {
  const len = Math.max(1, Math.ceil(seconds * sampleRate));
  const out = new Float32Array(len);
  const line = new Float32Array(n);

  // Excitation: noise, low-passed a little so the attack reads as a finger
  // or a soft pick rather than a burst of fizz.
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const white = Math.random() * 2 - 1;
    prev = prev * 0.55 + white * 0.45;
    line[i] = prev;
  }
  // Remove DC so the note doesn't start with a thump.
  let dc = 0;
  for (let i = 0; i < n; i++) dc += line[i];
  dc /= n;
  for (let i = 0; i < n; i++) line[i] -= dc;

  // Loop loss per round trip, chosen so decay time is the same at every
  // pitch. Without this, high notes (short lines, more loop passes per
  // second) would die almost instantly while low notes rang forever.
  const freq = sampleRate / n;
  const decaySeconds = 2.1;
  const g = Math.pow(0.0008, 1 / Math.max(1, freq * decaySeconds));

  let idx = 0;
  for (let i = 0; i < len; i++) {
    const cur = line[idx];
    const nxt = line[(idx + 1) % n];
    out[i] = cur;
    line[idx] = (cur + nxt) * 0.5 * g; // averaging low-pass = string damping
    idx = (idx + 1) % n;
  }

  // Gentle fade at the very end so looping/stopping can't click.
  const fade = Math.min(len, Math.round(0.02 * sampleRate));
  for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;

  return out;
}

function ksBuffer(n) {
  const c = getCtx();
  if (!c) return null;
  const hit = ksCache.get(n);
  if (hit) return hit;
  if (ksCache.size >= KS_CACHE_MAX) {
    // Drop the oldest half — Map preserves insertion order.
    const keys = [...ksCache.keys()].slice(0, Math.floor(KS_CACHE_MAX / 2));
    keys.forEach((k) => ksCache.delete(k));
  }
  const data = renderKarplusStrong(n, c.sampleRate);
  const buf = c.createBuffer(1, data.length, c.sampleRate);
  buf.copyToChannel(data, 0);
  ksCache.set(n, buf);
  return buf;
}

function playPluck(freq, when, dur, vol) {
  const c = getCtx();
  if (!c) return;
  const n = Math.max(2, Math.round(c.sampleRate / freq));
  const buf = ksBuffer(n);
  if (!buf) return;
  const src = c.createBufferSource();
  src.buffer = buf;
  // Exact pitch: the buffer sounds at sampleRate/n, we want `freq`.
  src.playbackRate.value = (freq * n) / c.sampleRate;

  const g = c.createGain();
  const t0 = c.currentTime + Math.max(0, when);
  g.gain.setValueAtTime(vol, t0);
  // Release just before the requested duration so short notes stop cleanly.
  const rel = Math.max(0.06, Math.min(0.25, dur * 0.25));
  g.gain.setValueAtTime(vol, Math.max(t0, t0 + dur - rel));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.02);

  src.connect(g);
  g.connect(musicBus);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

function playPure(freq, when, dur, vol) {
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime + Math.max(0, when);
  const osc = c.createOscillator();
  const osc2 = c.createOscillator();
  const g = c.createGain();
  const g2 = c.createGain();
  osc.type = "triangle";
  osc.frequency.value = freq;
  osc2.type = "sine";
  osc2.frequency.value = freq * 2;
  g2.gain.value = 0.25;
  osc2.connect(g2);
  g2.connect(g);
  osc.connect(g);
  g.connect(musicBus);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.start(t0);
  osc2.start(t0);
  osc.stop(t0 + dur + 0.05);
  osc2.stop(t0 + dur + 0.05);
}

/**
 * Play one note.
 * Positional signature on purpose — it matches the seven local `tone()`
 * helpers this replaced, so call sites did not have to change.
 */
export function tone(freq, when = 0, dur = 0.9, vol = 0.26) {
  if (!Number.isFinite(freq) || freq <= 0) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  try {
    if (state.voice === "pure") playPure(freq, when, dur, vol);
    else playPluck(freq, when, dur, vol);
  } catch {
    /* audio unavailable — stay silent rather than break the UI */
  }
}

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function playMidi(midi, when = 0, dur = 0.9, vol = 0.26) {
  tone(midiToFreq(midi), when, dur, vol);
}

/** Strum a list of MIDI notes, low to high, slightly staggered. */
export function strum(midis, { stagger = 0.055, dur = 1.15, vol = 0.24 } = {}) {
  midis.forEach((m, i) => playMidi(m, i * stagger, dur, vol));
}

/** Arpeggiate a list of MIDI notes, one per `step` seconds. */
export function arpeggiate(midis, { step = 0.3, dur = 0.7, vol = 0.24 } = {}) {
  midis.forEach((m, i) => playMidi(m, i * step, dur, vol));
}

/* ---------------- metronome click ---------------- */

const CLICK = {
  accent: { freq: 1568, dur: 0.05, vol: 0.5, type: "square" },
  beat: { freq: 1046, dur: 0.042, vol: 0.34, type: "square" },
  sub: { freq: 784, dur: 0.03, vol: 0.16, type: "sine" },
};

// Clicks booked but not yet sounded, so Stop can actually mean stop.
const pendingClicks = new Set();

/**
 * Schedule one click at an absolute context time (not an offset) — the
 * metronome scheduler works in absolute time so drift can't accumulate.
 */
export function click(atTime, kind = "beat") {
  const c = getCtx();
  if (!c) return;
  const spec = CLICK[kind] || CLICK.beat;
  // Drop a click that is already late rather than clamping it to "now":
  // clamping several late clicks stacks them into one flam.
  if (atTime < c.currentTime - 0.02) return;
  const t0 = Math.max(c.currentTime, atTime);
  try {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = spec.type;
    osc.frequency.setValueAtTime(spec.freq, t0);
    // Tiny downward chirp gives the click a "tick" edge instead of a beep.
    osc.frequency.exponentialRampToValueAtTime(spec.freq * 0.72, t0 + spec.dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(spec.vol, t0 + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + spec.dur);
    osc.connect(g);
    g.connect(clickBus);
    osc.start(t0);
    osc.stop(t0 + spec.dur + 0.02);
    const entry = { osc, g, at: t0 };
    pendingClicks.add(entry);
    osc.onended = () => {
      pendingClicks.delete(entry);
      try {
        g.disconnect();
      } catch {
        /* already gone */
      }
    };
  } catch {
    /* ignore */
  }
}

/**
 * Silence clicks that were booked ahead but haven't sounded yet.
 * Without this, pressing Stop still lets the scheduler's 150ms lookahead
 * play out — audible as two or three extra clicks at fast tempos.
 */
export function cancelScheduledClicks() {
  const c = getCtx();
  if (!c) return;
  pendingClicks.forEach((entry) => {
    if (entry.at > c.currentTime) {
      try {
        entry.osc.stop(c.currentTime);
      } catch {
        /* already stopped */
      }
      pendingClicks.delete(entry);
    }
  });
}

/* ---------------- the amp ---------------- */

/**
 * A signal chain between the solo's notes and the music bus.
 *
 * WHY IT IS BUILT LAZILY, AND ONLY ONCE.
 * The chain is per-TONE, not per-note. Twelve nodes and two LFOs built once
 * when you open a solo is nothing; twelve nodes per note at sixteenths is a
 * garbage-collection stutter you can hear. `setAmp` therefore only records
 * what is wanted and drops the old chain; the nodes are made on the first
 * note that needs them, which is also the first moment an AudioContext is
 * guaranteed to exist (it is created by a user gesture, long after mount).
 *
 * Only `voiceAt` goes through here — `tone()` and `playMidi()`, which every
 * other page uses for tapping a note, stay on the bare string deliberately.
 * An interval drill wants a clean reference pitch, not a Marshall.
 */
let ampSpec = null;
let ampChain = null;

/** Take the chain out of the graph, letting whatever is ringing finish. */
function teardownAmp() {
  const dying = ampChain;
  ampChain = null;
  if (!dying) return;
  // Disconnecting immediately would cut every note still sounding through it.
  // The tail of this app's longest note is comfortably under three seconds.
  setTimeout(() => {
    try {
      dying.stop.forEach((n) => n.stop());
    } catch {
      /* already stopped */
    }
    try {
      dying.input.disconnect();
      dying.out.disconnect();
    } catch {
      /* already gone */
    }
  }, 3000);
}

function buildAmp(c, spec) {
  const nodes = { stop: [] };

  const input = c.createGain();
  input.gain.value = 1;

  // — drive. Pre-gain into a soft clipper, then makeup back down.
  const pre = c.createGain();
  pre.gain.value = 1 + spec.drive * 9;
  const shaper = c.createWaveShaper();
  shaper.curve = driveCurve(spec.drive);
  shaper.oversample = "2x";
  const post = c.createGain();
  post.gain.value = spec.level;

  // — the amp's EQ: one mid, one presence, moving opposite ways off the ISF.
  const mid = c.createBiquadFilter();
  mid.type = "peaking";
  mid.frequency.value = spec.midHz;
  mid.Q.value = 0.9;
  mid.gain.value = spec.midDb;

  const presence = c.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = spec.presenceHz;
  presence.Q.value = 0.8;
  presence.gain.value = spec.presenceDb;

  // — the speaker. A guitar cabinet is, more than anything else it does, a
  //   low-pass filter at a few kHz; without one, drive is just fizz.
  const cab = c.createBiquadFilter();
  cab.type = "lowpass";
  cab.frequency.value = spec.cabHz;
  cab.Q.value = 0.7;

  const out = c.createGain();
  out.gain.value = 1;

  input.connect(pre);
  pre.connect(shaper);
  shaper.connect(post);
  post.connect(mid);
  mid.connect(presence);
  presence.connect(cab);

  // — modulation. A tremolo rides the level; everything else is a short
  //   delay whose length is being moved (see MOD in ./amp.js).
  let node = cab;
  const m = spec.mod;
  if (m && m.kind === "tremolo") {
    const trem = c.createGain();
    trem.gain.value = 1 - m.mix / 2;
    const lfo = c.createOscillator();
    const depth = c.createGain();
    lfo.frequency.value = m.hz;
    depth.gain.value = (m.mix * m.depth) / 2;
    lfo.connect(depth);
    depth.connect(trem.gain);
    lfo.start();
    nodes.stop.push(lfo);
    node.connect(trem);
    node = trem;
  }

  node.connect(out);

  if (m && m.kind === "chorus") {
    const wet = c.createGain();
    wet.gain.value = m.mix;
    const dl = c.createDelay(0.1);
    dl.delayTime.value = m.base;
    const lfo = c.createOscillator();
    const depth = c.createGain();
    lfo.frequency.value = m.hz;
    depth.gain.value = m.depth;
    lfo.connect(depth);
    depth.connect(dl.delayTime);
    lfo.start();
    nodes.stop.push(lfo);
    node.connect(dl);
    if (m.feedback > 0) {
      const fb = c.createGain();
      fb.gain.value = m.feedback;
      dl.connect(fb);
      fb.connect(dl);
    }
    dl.connect(wet);
    wet.connect(out);
  }

  // — delay, with feedback. Fed from the post-cabinet signal so the repeats
  //   are darker than the note, which is what a real delay does.
  if (spec.delay) {
    const send = c.createGain();
    send.gain.value = spec.delay.mix;
    const dl = c.createDelay(1.5);
    dl.delayTime.value = spec.delay.time;
    const fb = c.createGain();
    fb.gain.value = spec.delay.feedback;
    const damp = c.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 2600;
    node.connect(send);
    send.connect(dl);
    dl.connect(damp);
    damp.connect(fb);
    fb.connect(dl);
    dl.connect(out);
  }

  // — the room.
  if (spec.reverb) {
    const send = c.createGain();
    send.gain.value = spec.reverb.mix;
    const conv = c.createConvolver();
    conv.buffer = impulseResponse(c, spec.reverb.seconds, spec.reverb.decay);
    node.connect(send);
    send.connect(conv);
    conv.connect(out);
  }

  out.connect(musicBus);
  return { input, out, stop: nodes.stop, spec };
}

/**
 * Point the Solo Player's notes at a rig. `null` puts them back on the bare
 * string. Cheap to call repeatedly — an unchanged spec is a no-op.
 */
export function setAmp(spec) {
  const same = JSON.stringify(spec || null) === JSON.stringify(ampSpec || null);
  if (same) return;
  ampSpec = spec || null;
  teardownAmp();
}

/** Where a solo note should connect: the amp if there is one, else the bus. */
export function ampInput() {
  if (!ampSpec) return musicBus;
  const c = getCtx();
  if (!c || !musicBus) return musicBus;
  if (!ampChain) {
    try {
      ampChain = buildAmp(c, ampSpec);
    } catch {
      // A browser missing one of these node types should lose the amp, not
      // the solo.
      ampChain = null;
      return musicBus;
    }
  }
  return ampChain.input;
}

/* ---------------- absolute-time voices (the Solo Player) ---------------- */

/**
 * Notes booked ahead but not yet sounded, so a seek can actually mean seek.
 * Same idea as `pendingClicks`, one set per bus so cancelling the solo does
 * not silence the metronome underneath it.
 */
const pendingNotes = new Set();

/**
 * ONE NOTE, AT AN ABSOLUTE CONTEXT TIME, WITH THE LEFT HAND.
 *
 * `tone()` takes a delay *offset* and adds it to `currentTime` at call time,
 * which is fine for "play this now" but wrong under a lookahead scheduler:
 * the clock moves between deciding the time and making the call, and the
 * error lands as jitter. This takes the absolute time instead, the same way
 * `click()` does — see src/audio/soloClock.js.
 *
 * It also does the things a fretting hand does and a fixed buffer cannot:
 *
 *   glideToMidi   slides and bends — playbackRate is ramped, so the pitch
 *                 actually moves. Exponential, because pitch ratio is.
 *   vibrato       an LFO on playbackRate, depth in cents.
 *   mute          palm mute: short, dark, quiet.
 *   harmonic      an octave up and thinner.
 *
 * Returns a handle, or null when there is no audio device.
 */
export function voiceAt({
  midi,
  at,
  dur = 0.5,
  vol = 0.26,
  glideToMidi = null,
  glideStart = 0.35,
  vibratoCents = 0,
  vibratoHz = 5.5,
  mute = false,
  harmonic = false,
  accent = false,
} = {}) {
  const c = getCtx();
  if (!c || !Number.isFinite(midi)) return null;
  // A note that is already late is dropped rather than clamped to "now":
  // clamping a backlog stacks it into one flam. Same rule as click().
  if (at < c.currentTime - 0.02) return null;
  const t0 = Math.max(c.currentTime, at);
  const length = Math.max(0.05, mute ? Math.min(dur, 0.16) : dur);
  const level = Math.max(0.0002, vol * (mute ? 0.55 : 1) * (harmonic ? 0.7 : 1) * (accent ? 1.35 : 1));

  try {
    const baseMidi = harmonic ? midi + 12 : midi;
    const freq = midiToFreq(baseMidi);
    const n = Math.max(2, Math.round(c.sampleRate / freq));
    const buf = ksBuffer(n);
    if (!buf) return null;

    const src = c.createBufferSource();
    src.buffer = buf;
    const rateFor = (m) => (midiToFreq(harmonic ? m + 12 : m) * n) / c.sampleRate;
    const r0 = rateFor(baseMidi - (harmonic ? 12 : 0));
    src.playbackRate.setValueAtTime(r0, t0);

    if (Number.isFinite(glideToMidi) && glideToMidi !== midi) {
      const bendFrom = t0 + length * Math.max(0, Math.min(0.9, glideStart));
      const bendTo = t0 + length * 0.92;
      src.playbackRate.setValueAtTime(r0, bendFrom);
      src.playbackRate.exponentialRampToValueAtTime(Math.max(0.0001, rateFor(glideToMidi)), Math.max(bendFrom + 0.01, bendTo));
    }

    // Vibrato rides ON TOP of whatever the playbackRate is doing, because an
    // LFO into an AudioParam sums with the scheduled ramp rather than
    // replacing it — so vibrato on a bent note works without extra plumbing.
    let lfo = null;
    let lfoGain = null;
    if (vibratoCents > 0) {
      lfo = c.createOscillator();
      lfoGain = c.createGain();
      lfo.type = "sine";
      lfo.frequency.setValueAtTime(vibratoHz, t0);
      lfoGain.gain.setValueAtTime(r0 * (Math.pow(2, vibratoCents / 1200) - 1), t0);
      lfo.connect(lfoGain);
      lfoGain.connect(src.playbackRate);
      lfo.start(t0);
      lfo.stop(t0 + length + 0.05);
    }

    const g = c.createGain();
    g.gain.setValueAtTime(level, t0);
    const rel = Math.max(0.05, Math.min(0.25, length * 0.25));
    g.gain.setValueAtTime(level, Math.max(t0, t0 + length - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + length + 0.02);

    let tail = g;
    if (mute) {
      // Palm mute = the top end gone, not just quieter.
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(900, t0);
      g.connect(lp);
      tail = lp;
    }

    src.connect(g);
    tail.connect(ampInput());
    src.start(t0);
    src.stop(t0 + length + 0.05);

    const entry = { src, g, lfo, at: t0 };
    pendingNotes.add(entry);
    src.onended = () => {
      pendingNotes.delete(entry);
      try {
        g.disconnect();
        if (lfoGain) lfoGain.disconnect();
      } catch {
        /* already gone */
      }
    };
    return entry;
  } catch {
    /* audio unavailable — stay silent rather than break the UI */
    return null;
  }
}

/**
 * Silence notes booked ahead but not yet sounded.
 *
 * The lookahead has up to 150ms of the solo already committed to the audio
 * graph at any moment; without this, a seek, a loop jump or a speed change
 * plays the old timeline's next few notes over the new one.
 */
export function cancelScheduledNotes() {
  const c = getCtx();
  if (!c) return;
  pendingNotes.forEach((entry) => {
    if (entry.at > c.currentTime) {
      try {
        entry.src.stop(c.currentTime);
        if (entry.lfo) entry.lfo.stop(c.currentTime);
      } catch {
        /* already stopped */
      }
      pendingNotes.delete(entry);
    }
  });
}

/** Test/debug helper — how many string buffers are currently cached. */
export function _cacheSize() {
  return ksCache.size;
}

/** Test/debug helper — how many notes are booked but not yet sounded. */
export function _pendingNotes() {
  return pendingNotes.size;
}
