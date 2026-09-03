/**
 * THE AMP — your rig, as a signal chain.
 *
 * The Solo Player used to play a bare Karplus-Strong string: an honest
 * plucked-string model, and nothing like any of the records the solos come
 * from. A string is not a guitar sound. A guitar sound is a string through a
 * pickup, a gain stage, a speaker and a room, and every one of those does
 * something you can hear.
 *
 * So the same tone data that draws the Blackstar's front panel on Songs &
 * Tones now drives an actual chain: drive, EQ, cabinet, modulation, delay,
 * reverb. Dial the amp for a song on that page and the Solo Player's playback
 * follows — one number, two places, no second source of truth.
 *
 * WHAT IS IN HERE, AND WHY IT IS PURE
 * -----------------------------------
 * `ampFromTone` is the whole mapping: tone knobs in, a plain description of a
 * signal chain out. No AudioContext, no nodes, no globals — so the part that
 * decides what "OD 1 at gain 7 on the bridge humbucker" MEANS can be unit
 * tested with no audio device present, exactly like soloSchema.js and
 * clock.js. Building the nodes from that description is engine.js's job,
 * because engine.js owns the context.
 *
 * The two buffer/curve helpers take a `ctx` or a length as an argument rather
 * than reaching for one, for the same reason.
 */

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const knob = (v, fallback = 5) => Math.max(0, Math.min(10, num(v, fallback)));

/**
 * How hard each amp voice is driving before you touch the gain knob.
 *
 * These are the SHAPE of the Blackstar's voice switch, not measurements: what
 * matters is that Clean Warm stays clean with the gain up, and that OD 2
 * is unmistakably a lead sound at the same setting.
 */
export const VOICE_DRIVE = {
  "Clean Warm": 0.05,
  "Clean Bright": 0.08,
  Crunch: 0.32,
  "Super Crunch": 0.48,
  "OD 1": 0.64,
  "OD 2": 0.8,
};

/**
 * The speaker, by pickup position. A bridge humbucker is hot but not the
 * brightest thing on the guitar — the middle single is — and the neck single
 * is the dark one. Getting that order wrong is the difference between a solo
 * that sounds like it is on the neck pickup and one that does not.
 */
export const PICKUP_HZ = { 1: 4400, 2: 4900, 3: 5200, 4: 4100, 5: 3300 };

/** Reverb size and how fast it dies, per type. */
export const REVERB = {
  Room: { seconds: 1.1, decay: 2.4 },
  Hall: { seconds: 2.6, decay: 2.9 },
  Spring: { seconds: 0.75, decay: 1.7 },
  Plate: { seconds: 1.8, decay: 2.2 },
};

/**
 * Modulation, as the thing it actually is.
 *
 * A chorus and a flanger are both a delay of a few milliseconds whose length
 * is being moved by an LFO — they differ in how short the delay is, how fast
 * it moves, and whether it feeds back. A tremolo is not a delay at all, it is
 * the volume going up and down, so it gets its own kind.
 *
 * A phaser is a ladder of allpass filters and is NOT a modulated delay. It is
 * approximated here by a very short, shallow flange, which is the closest
 * thing this chain can do honestly. Said out loud rather than pretended.
 */
export const MOD = {
  Chorus: { kind: "chorus", hz: 0.8, base: 0.018, depth: 0.0035, feedback: 0 },
  Flanger: { kind: "chorus", hz: 0.28, base: 0.005, depth: 0.0028, feedback: 0.3 },
  Phaser: { kind: "chorus", hz: 0.5, base: 0.008, depth: 0.0015, feedback: 0.15 },
  Tremolo: { kind: "tremolo", hz: 4.5, depth: 0.6 },
};

/**
 * A tone from src/data/songs.js -> a description of a signal chain.
 *
 * Returns null for no tone at all, which callers read as "leave the plain
 * string alone" rather than as an error.
 */
export function ampFromTone(tone) {
  if (!tone || typeof tone !== "object") return null;

  const voice = String(tone.voice || "Clean Warm");
  const gain = knob(tone.gain, 4);
  const isf = knob(tone.isf, 5);
  const toneKnob = knob(tone.toneKnob, 7);
  const volume = knob(tone.volume, 5);
  const pickup = [1, 2, 3, 4, 5].includes(num(tone.pickup, 0)) ? num(tone.pickup, 0) : 3;

  // The voice sets the character; the gain knob moves it, but cannot turn a
  // clean voice into a lead one — which is how the amp behaves.
  const base = VOICE_DRIVE[voice] ?? 0.05;
  const drive = clamp01(base * (0.6 + (gain / 10) * 0.8) + (gain / 10) * 0.06);

  // More drive is more compression, so the makeup gain has to come DOWN, not
  // up, or the solo gets louder every time you turn the amp up.
  const level = (0.62 + (volume / 10) * 0.5) / (1 + drive * 1.6);

  // ISF: 0 is the American voicing (scooped mids, brighter top), 10 the
  // British one (mids forward). One knob, two filters moving in opposition.
  const midDb = ((isf - 5) / 5) * 4.5;
  const presenceDb = ((5 - isf) / 5) * 2.5;

  const fx = tone.fx || {};
  const dly = fx.dly && fx.dly.on ? fx.dly : null;
  const rev = fx.rev && fx.rev.on ? fx.rev : null;
  const mod = fx.mod && fx.mod.on ? fx.mod : null;
  const modSpec = mod ? MOD[mod.type] || MOD.Chorus : null;

  return {
    drive,
    level,
    // Drive eats the top end on a real amp, so the cabinet closes down as the
    // gain goes up rather than staying brittle.
    cabHz: Math.round(PICKUP_HZ[pickup] * (0.72 + (toneKnob / 10) * 0.56) * (1 - drive * 0.22)),
    midHz: 720,
    midDb: Math.round(midDb * 10) / 10,
    presenceHz: 3100,
    presenceDb: Math.round(presenceDb * 10) / 10,
    delay: dly
      ? {
          // The tap time is a real number on the panel; honour it, and fall
          // back to something musical rather than to zero.
          time: Math.max(0.05, Math.min(1.2, num(dly.ms, 400) / 1000 || 0.4)),
          mix: clamp01((knob(dly.level, 3) / 10) * 0.42),
          feedback: clamp01(0.15 + (knob(dly.level, 3) / 10) * 0.25),
        }
      : null,
    reverb: rev
      ? {
          ...(REVERB[rev.type] || REVERB.Room),
          mix: clamp01((knob(rev.level, 3) / 10) * 0.4),
        }
      : null,
    mod: modSpec
      ? { ...modSpec, mix: clamp01((knob(mod.level, 3) / 10) * (modSpec.kind === "tremolo" ? 1 : 0.5)) }
      : null,
  };
}

/**
 * The soft-clipping curve for a WaveShaper.
 *
 * The classic formula: gentle either side of zero and progressively flatter
 * toward the rails, which is what makes it read as an overdriven valve rather
 * than as a square wave. `amount` is 0..1 from `ampFromTone`.
 */
export function driveCurve(amount, n = 1024) {
  const k = clamp01(amount) * 100;
  const curve = new Float32Array(n);
  const deg = Math.PI / 180;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

/**
 * A reverb impulse: decaying stereo noise.
 *
 * Not a sampled room — a sampled room is a megabyte of asset for a practice
 * tool that has none. Noise with an exponential envelope is the cheap trick
 * every web-audio reverb uses, it is built once per tone, and against a
 * completely dry solo it is the difference between "in a room" and "in a
 * spreadsheet".
 */
export function impulseResponse(ctx, seconds = 1.6, decay = 2.4) {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * Math.max(0.05, seconds)));
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

/** A one-line summary of a tone, for the places too small to draw a panel. */
export function ampSummary(tone) {
  if (!tone) return "";
  const bits = [tone.voice, `gain ${knob(tone.gain, 4)}`, `ISF ${knob(tone.isf, 5)}`, `pickup ${tone.pickup}`];
  const fx = tone.fx || {};
  ["mod", "dly", "rev"].forEach((slot) => {
    if (fx[slot] && fx[slot].on) bits.push(`${fx[slot].type} ${fx[slot].level}`);
  });
  return bits.join(" · ");
}
