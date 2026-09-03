/**
 * THE DRONE — a sustained tonic to practise against.
 *
 * Why this exists: a scale degree has no meaning on its own. The ♭3 of A minor
 * is only sad *relative to A*. Play a pentatonic box with nothing underneath it
 * and you are learning finger patterns; play the same box over a held A and you
 * are hearing functions — the root landing, the ♭7 pulling, the ♭5 stinging.
 *
 * So this is deliberately the dumbest feature in the app: hold one note. It
 * just happens to change what every other page is teaching you.
 *
 * SOUND — a slow pad rather than a raw oscillator:
 *   · root, plus its octave, plus (by default) the 5th
 *   · each partial doubled and detuned a few cents so it beats gently instead
 *     of sitting there like a test tone
 *   · a low-pass to take the edge off, and a slow gain wobble so it breathes
 *
 * The 5th is on by default because root+5th is modally neutral: it states the
 * tonic without deciding major or minor, which is exactly what you want when
 * the point is to hear a mode's 3rd or 6th against it. Turn it off for the
 * purest possible reference.
 *
 * MICROPHONE — a continuous tone is poison for pitch detection, so anything
 * that opens the mic calls `suspendForMic()` and the drone ducks to silence
 * until the mic is released. See src/audio/pitch.js.
 */

import { getCtx, droneOut, resume } from "./engine.js";

const PREF_KEY = "drone.v1";

/** Where the drone sits: low enough to stay out of the way of the neck. */
export const DRONE_MIDI_TARGET = 45; // A2, the open A string

const state = {
  on: false,
  root: "A", // note name, spelled by the engine's conventions
  fifth: true, // add the 5th (modally neutral)
  follow: true, // retune to whatever key the current page is showing
};

const listeners = new Set();
let nodes = null; // live audio nodes while sounding
let micHolds = 0; // >0 while a microphone is capturing

/* ---------------- pure helpers (unit tested) ---------------- */

const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "Db" -> 1. Accepts any number of accidentals. */
export function rootToPc(name) {
  if (!name || typeof name !== "string") return null;
  const base = LETTER_PC[name[0].toUpperCase()];
  if (base == null) return null;
  let pc = base;
  for (let i = 1; i < name.length; i++) {
    if (name[i] === "#") pc += 1;
    else if (name[i] === "b" || name[i] === "♭") pc -= 1;
  }
  return ((pc % 12) + 12) % 12;
}

/**
 * Choose the octave for a pitch class: the one nearest `target`.
 *
 * A drone that jumps an octave when you go from B to C sounds like a mistake,
 * so every root lands in the same narrow register around the open A string.
 *
 * Ties break UPWARD. The tritone from the target (E♭ against an A2 target) is
 * equidistant either way, and the lower choice puts it at 77.8 Hz — below the
 * guitar's own low E, and below what a laptop speaker reproduces. Rounding up
 * keeps every root inside E2..E♭3, so no key sounds thinner than the others.
 */
export function droneMidiFor(pc, target = DRONE_MIDI_TARGET) {
  if (pc == null || !Number.isFinite(pc)) return null;
  const base = ((pc % 12) + 12) % 12;
  let best = null;
  let bestDist = Infinity;
  for (let midi = base; midi <= 127; midi += 12) {
    const d = Math.abs(midi - target);
    if (d <= bestDist) {
      bestDist = d;
      best = midi;
    }
  }
  return best;
}

/** The MIDI notes the drone sounds for a given root. */
export function droneVoicing(root, { fifth = true, target = DRONE_MIDI_TARGET } = {}) {
  const pc = rootToPc(root);
  if (pc == null) return [];
  const low = droneMidiFor(pc, target);
  if (low == null) return [];
  const out = [low, low + 12];
  // The 5th goes between the two roots so the stack reads root–5th–octave.
  if (fifth) out.splice(1, 0, low + 7);
  return out;
}

const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

/* ---------------- preferences ---------------- */

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return;
    const v = JSON.parse(raw);
    if (typeof v.root === "string" && rootToPc(v.root) != null) state.root = v.root;
    if (typeof v.fifth === "boolean") state.fifth = v.fifth;
    if (typeof v.follow === "boolean") state.follow = v.follow;
    // `on` is deliberately NOT restored — nobody wants a tone playing the
    // instant they open the page.
  } catch {
    /* storage blocked */
  }
}

function savePrefs() {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify({ root: state.root, fifth: state.fifth, follow: state.follow }));
  } catch {
    /* ignore */
  }
}

loadPrefs();

function emit() {
  const snapshot = { ...state, sounding: !!nodes, micHeld: micHolds > 0 };
  listeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch {
      /* a bad listener must not stop the audio */
    }
  });
}

export function subscribe(fn) {
  listeners.add(fn);
  fn({ ...state, sounding: !!nodes, micHeld: micHolds > 0 });
  return () => listeners.delete(fn);
}

export function getDroneState() {
  return { ...state, sounding: !!nodes, micHeld: micHolds > 0 };
}

/* ---------------- the voice ---------------- */

const FADE = 0.35; // seconds — never start or stop abruptly
const RETUNE_FADE = 0.1; // shorter, so changing key can't stack voices
const LFO_DEPTH = 0.06; // how much the slow wobble moves the gain

function buildVoice() {
  const ctx = getCtx();
  const out = droneOut();
  if (!ctx || !out) return null;

  const midis = droneVoicing(state.root, { fifth: state.fifth });
  if (!midis.length) return null;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.linearRampToValueAtTime(1, ctx.currentTime + FADE);

  // One low-pass for the whole stack: a pad, not a buzz.
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1400;
  filter.Q.value = 0.4;
  filter.connect(master);
  master.connect(out);

  const oscs = [];
  const root = midis[0];
  midis.forEach((midi, i) => {
    const freq = midiToFreq(midi);
    // Level by INTERVAL above the root, not by position in the array: with the
    // 5th switched off the octave would otherwise slide into the 5th's slot and
    // come out louder than it does in the full voicing.
    const interval = midi - root;
    const level = interval === 0 ? 0.5 : interval === 7 ? 0.26 : 0.2;
    const partial = ctx.createGain();
    partial.gain.value = level;
    partial.connect(filter);

    // Two detuned oscillators per partial: the slow beating between them is
    // what stops a drone sounding like a fault condition.
    [-4, +4].forEach((cents) => {
      const o = ctx.createOscillator();
      o.type = interval === 0 ? "sawtooth" : "triangle";
      o.frequency.value = freq;
      o.detune.value = cents;
      o.connect(partial);
      o.start();
      oscs.push(o);
    });
  });

  // A very slow amplitude wobble so it breathes rather than sits.
  //
  // The LFO is ADDED to master.gain rather than multiplied, so its depth has to
  // be enveloped alongside the fades. Left at a fixed depth it would push the
  // gain above zero during the fade-in (an instant 6% blip) and hold a quiet
  // wobble after the fade-out — a drone that never quite stops.
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.12;
  lfoGain.gain.setValueAtTime(0, ctx.currentTime);
  lfoGain.gain.linearRampToValueAtTime(LFO_DEPTH, ctx.currentTime + FADE);
  lfo.connect(lfoGain);
  lfoGain.connect(master.gain);
  lfo.start();
  oscs.push(lfo);

  return { master, filter, lfoGain, oscs };
}

function stopVoice(immediate = false, fade = FADE) {
  if (!nodes) return;
  const ctx = getCtx();
  const { master, lfoGain, oscs } = nodes;
  nodes = null;
  if (!ctx) return;
  const t = ctx.currentTime;
  const end = immediate ? t + 0.02 : t + fade;
  try {
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
    master.gain.linearRampToValueAtTime(0.0001, end);
    // Fade the wobble out with it, or the gain never reaches silence.
    lfoGain.gain.cancelScheduledValues(t);
    lfoGain.gain.setValueAtTime(lfoGain.gain.value, t);
    lfoGain.gain.linearRampToValueAtTime(0, end);
  } catch {
    /* ignore */
  }
  let pending = oscs.length;
  const release = () => {
    // Only once every oscillator has actually finished.
    if (--pending > 0) return;
    try {
      master.disconnect();
    } catch {
      /* ignore */
    }
  };
  oscs.forEach((o) => {
    // onended fires on the AUDIO clock. A setTimeout would be measured on the
    // wall clock, which keeps running while a backgrounded context is
    // suspended — disconnecting mid-ramp and producing the click the fade
    // exists to avoid.
    o.onended = release;
    try {
      o.stop(end + 0.05);
    } catch {
      /* already stopped */
      release();
    }
  });
}

/**
 * Rebuild the voice if it should be sounding right now.
 * `fast` cuts the fade short — used when the microphone opens, because the
 * detector starts analysing on the very next frame and a 350ms tail is long
 * enough for it to lock onto the drone instead of the guitar.
 */
function sync({ fast = false } = {}) {
  const shouldSound = state.on && micHolds === 0;
  if (shouldSound && !nodes) {
    resume();
    nodes = buildVoice();
  } else if (!shouldSound && nodes) {
    stopVoice(fast);
  }
  emit();
}

/** Restart the voice at a new pitch, crossfading rather than clicking. */
function retune() {
  if (!nodes) {
    emit();
    return;
  }
  // A quick crossfade rather than the full fade: arrow-keying through the root
  // selector, or a Live Player scrub across several sections, would otherwise
  // stack a new 7-oscillator voice on top of every 350ms tail.
  stopVoice(false, RETUNE_FADE);
  nodes = buildVoice();
  emit();
}

/* ---------------- controls ---------------- */

export function startDrone() {
  state.on = true;
  sync();
}

export function stopDrone() {
  state.on = false;
  sync();
}

export function toggleDrone() {
  state.on ? stopDrone() : startDrone();
  return state.on;
}

export function isDroneOn() {
  return state.on;
}

/**
 * Set the drone's root by note name ("A", "Db"…).
 *
 * A manual pick also switches following OFF. Otherwise the root selector sitting
 * in the transport bar is a control whose effect silently evaporates the next
 * time you change page — you choose A to solo C major over its relative minor,
 * and it snaps back to C with no explanation.
 */
export function setDroneRoot(root, { fromFollow = false } = {}) {
  if (rootToPc(root) == null) return;
  if (fromFollow && !state.follow) return;
  if (!fromFollow && state.follow) state.follow = false;
  if (state.root === root) {
    if (!fromFollow) {
      savePrefs();
      emit();
    }
    return;
  }
  state.root = root;
  // Only deliberate choices are remembered. Persisting follow-driven changes
  // would make next session's drone open on whatever page you last visited.
  if (!fromFollow) savePrefs();
  retune();
}

export function setDroneFifth(on) {
  state.fifth = !!on;
  savePrefs();
  retune();
}

export function setDroneFollow(on) {
  state.follow = !!on;
  savePrefs();
  emit();
}

/**
 * Hold the drone silent while a microphone is capturing.
 *
 * A sustained tone is by far the loudest, most periodic thing in the room, so
 * the pitch detector would lock onto the drone and never hear the guitar.
 * Reference-counted, because two components can hold the mic at once.
 */
export function suspendForMic() {
  micHolds += 1;
  if (micHolds === 1) sync({ fast: true });
  return () => releaseForMic();
}

export function releaseForMic() {
  micHolds = Math.max(0, micHolds - 1);
  if (micHolds === 0) sync();
}

/** Test/debug helper. */
export function _micHolds() {
  return micHolds;
}
