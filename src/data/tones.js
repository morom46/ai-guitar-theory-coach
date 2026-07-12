/**
 * YOUR RIG — constants describing the amp + guitar every tone is dialed for.
 * (Song tones themselves live in src/data/songs.js, one entry per song.)
 */

export const AMP = {
  name: "Blackstar ID:Core V4 · Stereo 10",
  voices: ["Clean Warm", "Clean Bright", "Crunch", "Super Crunch", "OD 1", "OD 2"],
  fxTypes: {
    mod: ["Phaser", "Flanger", "Chorus", "Tremolo"],
    dly: ["Linear", "Analogue", "Tape", "Multi"],
    rev: ["Room", "Hall", "Spring", "Plate"],
  },
};

export const GUITAR = {
  name: "HSS Strat",
  positions: {
    1: "bridge humbucker",
    2: "bridge HB + middle",
    3: "middle single",
    4: "middle + neck",
    5: "neck single",
  },
};

export const msToBpm = (ms) => (ms > 0 ? Math.round(60000 / ms) : 0);
