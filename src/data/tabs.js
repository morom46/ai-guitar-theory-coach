/**
 * TABS — solos entered from a published tab, note for note. THE library.
 *
 * WHY THIS IS ITS OWN FILE, AND WHAT IT COSTS
 * -------------------------------------------
 * What lives here is YOUR copy of a published tab, entered for your own
 * practice. It is a derivative of somebody's performance and arrangement, and
 * that is a different kind of thing from a chord chart or an original phrase —
 * so it is kept where it can be seen, named, and if necessary removed.
 *
 * If this repo is ever pushed public, this file is the one to pull out. It is
 * imported in exactly two places — SoloPlayer's picker and Song Practice's
 * per-song row — and nothing else depends on it.
 *
 * WHAT THE PLAYER GIVES IT
 * ------------------------
 * Nothing special, and that is the point: the note highway, the degree
 * colouring, step mode, the loop, the 25%-100% speed control and the phrase
 * inspector are all driven off the schema in ./soloSchema.js. Enter a solo in
 * that shape and the player animates it without being told anything else.
 *
 * WHAT `meta.source` IS FOR
 * -------------------------
 * Every document says where it came from and, just as important, which parts
 * of it the source actually carried. Four of these were entered from a picture
 * of a tab, so the frets are the tab's but the rhythm and the chords are read
 * in; two were converted from a player's own note data, so the durations and
 * techniques are the transcription's too. That line is the difference, and it
 * is worth reading before trusting a bar.
 */

import { normaliseSolo, soloEndBeat } from "./soloSchema.js";
import {
  SLOW_DANCING_NOTES,
  SLOW_DANCING_SECTIONS,
  SLOW_DANCING_HARMONY,
  SLOW_DANCING_TIMESIG,
} from "./tab-slow-dancing.js";

const KEY = "tabs.v1";
const BEATS_PER_BAR = 4;

/**
 * One note. Positional on purpose — a 300-note solo written with object
 * literals is unreadable, and unreadable content does not get proof-read.
 *
 *   N(startBeat, string, fret, durBeats, extra?)
 *
 * string is an OPEN_MIDI index: 0 = high E, 5 = low E. Tab staves are drawn
 * the other way up, so a tab's "6th string" is 5 here. Every fret below was
 * read off the tab row and converted once, here, on the way in.
 */
const N = (startBeat, string, fret, durBeats, extra = {}) => ({
  startBeat,
  string,
  fret,
  durBeats,
  ...extra,
});

const hammer = { technique: "hammer" };
const pull = { technique: "pull" };
const vib = { technique: "vibrato" };
const harm = { technique: "harmonic" };
const bend = (semis) => ({ technique: "bend", bendSemitones: semis });
const release = (semis) => ({ technique: "release", bendSemitones: semis });
const slide = (to) => ({ technique: "slide", slideToFret: to });

const bar = (n) => (n - 1) * BEATS_PER_BAR;

/**
 * A section, labelled by where it is on the record — a timestamp when the tab
 * gives one, a phrase number when it does not. The label goes first so that
 * the part which survives the timeline's ellipsis is the part you navigate by.
 */
const at = (id, label, name, startBeat, endBeat) => ({
  id,
  name: label + " — " + name,
  startBeat,
  endBeat,
});

/** Repeat a chord loop, one chord per bar, across a range of bars. */
const cycle = (chords, fromBar, toBar) => {
  const out = [];
  for (let b = fromBar, i = 0; b <= toBar; b++, i++) {
    out.push({ atBeat: bar(b), chord: chords[i % chords.length] });
  }
  return out;
};

/* ================================================================== */
/* PURPLE RAIN — the outro solo                                       */
/* ================================================================== */

/*
 * THE RECURRING FIGURES, written once.
 *
 * Three shapes carry most of this solo, and the tab repeats each of them four
 * or five times. Typing them out sixteen times over is how a wrong fret gets
 * in and stays in, so each is a function of the beat it starts on.
 */

/** `11-10-11-10-11-10-11/13` — the Bb-A shake that slides up to the C. */
const shakeFromBb = (b, tail = 1) => [
  N(b, 1, 11, 0.25),
  N(b + 0.25, 1, 10, 0.25),
  N(b + 0.5, 1, 11, 0.25),
  N(b + 0.75, 1, 10, 0.25),
  N(b + 1, 1, 11, 0.25),
  N(b + 1.25, 1, 10, 0.25),
  N(b + 1.5, 1, 11, 0.25, slide(13)),
  N(b + 1.75, 1, 13, tail, { accent: true }),
];

/** `10-11-10-11-10-11-10-11/13` — the same shake started from the A. */
const shakeFromA = (b, tail = 1) => [
  N(b, 1, 10, 0.25),
  N(b + 0.25, 1, 11, 0.25),
  N(b + 0.5, 1, 10, 0.25),
  N(b + 0.75, 1, 11, 0.25),
  N(b + 1, 1, 10, 0.25),
  N(b + 1.25, 1, 11, 0.25),
  N(b + 1.5, 1, 10, 0.25),
  N(b + 1.75, 1, 11, 0.25, slide(13)),
  N(b + 2, 1, 13, tail, { accent: true }),
];

/**
 * The two-chord figure the tab writes under the lead in the later blocks:
 * A3+D1+G3 = C-Eb-Bb, then A1+D0+G3 = Bb-D-Bb. Spans 4.5 beats.
 */
const compA = (b, dur) => [N(b, 4, 3, dur), N(b, 3, 1, dur), N(b, 2, 3, dur)];
const compB = (b, dur) => [N(b, 4, 1, dur), N(b, 3, 0, dur), N(b, 2, 3, dur)];
const comping = (b) => [
  ...compA(b, 1.5),
  ...compB(b + 1.5, 1.5),
  ...compA(b + 3, 0.75),
  ...compB(b + 3.75, 0.75),
];

/**
 * `18b20r18 16/15 14-15 16b17r16 15/13 15b16r15 13/11` — the long descending
 * sequence, and the signature phrase of the outro. It appears three times in
 * the tab (5:16, 5:27, 5:45) unchanged. Spans 12.5 beats.
 */
const descent = (b) => [
  N(b, 1, 18, 1, { ...bend(2), accent: true }),
  N(b + 1, 1, 18, 1, release(2)),
  N(b + 2, 1, 16, 0.5, slide(15)),
  N(b + 2.5, 1, 15, 0.5),
  N(b + 3, 1, 14, 0.5, slide(15)),
  N(b + 3.5, 1, 15, 0.5),
  N(b + 4, 1, 16, 1, bend(1)),
  N(b + 5, 1, 16, 1, release(1)),
  N(b + 6, 1, 15, 0.5, slide(13)),
  N(b + 6.5, 1, 13, 1.5),
  N(b + 8, 0, 13, 2, { accent: true }), // the F on top, ringing over the bend
  N(b + 8, 1, 15, 1, bend(1)),
  N(b + 9, 1, 15, 1, release(1)),
  N(b + 10, 1, 13, 0.5, slide(11)),
  N(b + 10.5, 1, 11, 2, vib),
];

const PURPLE_RAIN = {
  id: "tab-purple-rain",
  meta: {
    title: "Purple Rain — outro solo",
    artist: "Prince · transcription, entered from tab",
    key: "Bb",
    mode: "major",
    scaleId: "major",
    songIds: ["n70"],
    capo: 0,
    source:
      "a published tab of the outro. The frets are its own; the rhythm, and the Bb-Gm-F-Eb " +
      "loop underneath, are read in — a tab states neither.",
    note:
      "Bb major, and the whole solo lives in two places: the shake between Bb and A on the B " +
      "string around the 10th fret, and the long descending sequence from the F at the 18th. " +
      "Watch what that shake MEANS as the loop turns — the Bb is the root over Bb, the b3 over " +
      "Gm, the 4 over F and the 5 over Eb. One finger, four jobs. The chromatic fall at 4:31 is " +
      "the one place it leaves the key on purpose.",
  },
  // The record sits around 113. Take it at 50% first: the sequences are
  // sixteenths, and at full speed they are 0.13s a note.
  tempo: [{ atBeat: 0, bpm: 113 }],
  timeSig: [{ atBeat: 0, num: 4, den: 4 }],

  // One section per timestamped block in the tab, named by that timestamp so
  // you can find the phrase on the record. Loop a section to drill it.
  sections: [
    at("t346", "3:46", "the entrance", 0, 16),
    at("t357", "3:57", "unison bend, then down the scale", 16, 28),
    at("t402", "4:02", "same again, bend held", 28, 40),
    at("t405", "4:05", "the ringing thirds", 40, 52),
    at("t419", "4:19", "the shaken Bb up top", 52, 64),
    at("t425", "4:25", "to the top and bent", 64, 76),
    at("t431", "4:31", "the chromatic fall", 76, 92),
    at("t440", "4:40", "the shake begins", 92, 104),
    at("t448", "4:48", "shake into a bend", 104, 116),
    at("t458", "4:58", "the shake again", 116, 128),
    at("t505", "5:05", "the minor-third bend", 128, 144),
    at("t516", "5:16", "the descending sequence", 144, 160),
    at("t527", "5:27", "comping into the sequence", 160, 180),
    at("t545", "5:45", "and again", 180, 200),
    at("t601", "6:01", "comping into the shake", 200, 216),
    at("t613", "6:13", "out on the harmonic", 216, 232),
  ],

  // Purple Rain's loop, one chord per bar, all the way through. This is the
  // SONG's harmony, not something the tab states — see `unverified` above.
  harmony: cycle(["Bb", "Gm", "F", "Eb"], 1, 58),

  notes: [
    /* --- 3:46 — the entrance ------------------------------------ */
    // The bent C on the B string, then the F on top. C bent a whole step is D,
    // the 3rd of Bb — which is why it sounds like an arrival and not a scoop.
    N(0, 1, 13, 2, { ...bend(2), accent: true }),
    N(2, 0, 13, 2),
    N(4, 1, 11, 0.5),
    N(4.5, 1, 10, 0.5),
    N(5, 1, 11, 0.5),
    N(5.5, 2, 10, 0.5),
    N(6, 2, 12, 2),
    N(8, 0, 20, 3, { ...harm, accent: true }), // 20(p) — the pinched harmonic
    N(11, 1, 15, 1),
    N(11, 2, 15, 1),
    N(12, 1, 15, 2, vib),
    N(12, 2, 15, 2, vib),

    /* --- 3:57 — the unison bend --------------------------------- */
    // e15 and B18 bent a whole step are the SAME G. That is what makes it a
    // unison bend, and why the tab draws two rows starting at one column.
    N(16, 0, 15, 2, { accent: true }),
    N(16, 1, 18, 2, { ...bend(2), accent: true }),
    N(18, 1, 18, 0.5, release(2)),
    N(18.5, 1, 18, 1.5, bend(2)),
    N(20, 1, 18, 0.5),
    N(20.5, 1, 15, 0.5, pull),
    N(21, 2, 17, 0.5),
    N(21.5, 1, 15, 0.5),
    N(22, 2, 17, 0.5),
    N(22.5, 2, 15, 0.5),
    N(23, 3, 17, 0.5),
    N(23.5, 2, 15, 0.5),
    N(24, 2, 17, 0.5),
    N(24.5, 2, 15, 0.5),
    N(25, 3, 17, 0.5),
    N(25.5, 3, 15, 2.5, vib),

    /* --- 4:02 — the same, with the bend held --------------------- */
    N(28, 0, 15, 2.5, { accent: true }),
    N(28, 1, 18, 2.5, { ...bend(2), accent: true }),
    N(31, 1, 18, 0.5),
    N(31.5, 1, 15, 0.5, pull),
    N(32, 2, 17, 0.5),
    N(32.5, 1, 15, 0.5),
    N(33, 2, 17, 0.5),
    N(33.5, 2, 15, 0.5),
    N(34, 3, 17, 0.5),
    N(34.5, 2, 15, 0.5),
    N(35, 2, 17, 0.5),
    N(35.5, 2, 15, 0.5),
    N(36, 3, 17, 0.5),
    N(36.5, 3, 15, 0.5),
    N(37, 3, 17, 3, vib),

    /* --- 4:05 — "hold these like track" -------------------------- */
    N(40, 1, 18, 1),
    N(40, 2, 17, 1, { ...bend(2), accent: true }), // C bent to D, under the F
    N(41, 2, 15, 2),
    N(43, 1, 15, 1),
    N(43, 2, 15, 1),
    N(44, 1, 15, 1),
    N(44, 2, 15, 1),
    N(45, 1, 15, 1),
    N(45, 2, 15, 1),
    N(46, 1, 15, 1),
    N(46, 2, 15, 1),
    N(47, 1, 15, 3, vib),
    N(47, 2, 15, 3, vib),

    /* --- 4:19 — the shaken Bb ------------------------------------ */
    N(52, 1, 20, 0.5),
    N(52.5, 1, 18, 0.5),
    // 18b20r19b20r19b20r19b20r18 — one bend, shaken at the top, then let down
    // and held. Written as bend-then-vibrato: the shake IS the vibrato.
    N(53, 0, 18, 3, { ...bend(2), accent: true }),
    N(56, 0, 18, 2, vib),
    N(58, 0, 15, 0.5),
    N(58.5, 0, 17, 0.5),
    N(59, 0, 18, 0.5),
    N(59.5, 0, 15, 0.5),
    N(60, 0, 17, 0.5),
    N(60.5, 0, 18, 1.5),

    /* --- 4:25 — to the top --------------------------------------- */
    N(64, 0, 15, 0.5),
    N(64.5, 0, 17, 0.5),
    N(65, 0, 18, 0.5),
    N(65.5, 0, 15, 0.5),
    N(66, 0, 17, 0.5),
    N(66.5, 0, 18, 0.5),
    N(67, 0, 20, 1.5, { ...bend(2), accent: true }),
    N(68.5, 0, 20, 0.5, release(2)),
    N(69, 1, 18, 0.5),
    N(69.5, 1, 18, 0.5),
    N(70, 0, 20, 1.5, { ...bend(2), accent: true }),
    N(71.5, 0, 20, 0.5, release(2)),
    N(72, 1, 18, 0.5),
    N(72.5, 1, 18, 1.5),

    /* --- 4:31 — the chromatic fall ------------------------------- */
    N(76, 1, 18, 0.5),
    N(76.5, 1, 20, 0.5, hammer),
    N(77, 1, 18, 0.5, pull),
    N(77.5, 2, 20, 0.5),
    N(78, 1, 18, 0.5),
    N(78.5, 2, 20, 0.5),
    N(79, 2, 18, 0.5),
    N(79.5, 3, 20, 0.5),
    N(80, 2, 18, 0.5),
    N(80.5, 3, 20, 0.5),
    N(81, 3, 18, 1, slide(15)),
    N(82, 3, 15, 2, vib),
    // 6-8 on the D string, then straight down the neck and out. This is the
    // one phrase that leaves Bb major — expect the rings to go grey.
    N(84, 3, 6, 0.25),
    N(84.25, 3, 8, 0.25),
    N(84.5, 3, 6, 0.25),
    N(84.75, 3, 8, 0.25),
    N(85, 3, 6, 0.25),
    N(85.25, 3, 8, 0.25),
    N(85.5, 3, 6, 0.25),
    N(85.75, 3, 8, 0.25),
    N(86, 3, 6, 0.5),
    N(86.5, 4, 8, 0.25),
    N(86.75, 4, 7, 0.25),
    N(87, 4, 6, 0.25),
    N(87.25, 4, 4, 0.25),
    N(87.5, 4, 6, 0.25),
    N(87.75, 4, 4, 0.25),
    N(88, 5, 6, 0.5),
    N(88.5, 5, 4, 3.5, { ...vib, accent: true }),

    /* --- 4:40 — the shake begins --------------------------------- */
    ...shakeFromBb(92, 0.75),
    N(94.5, 2, 12, 1),
    ...shakeFromA(95.5, 2.5),

    /* --- 4:48 — shake into a bend -------------------------------- */
    N(104, 2, 12, 1),
    N(105, 1, 10, 0.25),
    N(105.25, 1, 11, 0.25),
    N(105.5, 1, 10, 0.25),
    N(105.75, 1, 11, 0.25),
    N(106, 1, 10, 0.25),
    N(106.25, 1, 11, 0.25),
    N(106.5, 1, 10, 0.25),
    N(106.75, 1, 11, 0.25, slide(13)),
    N(107, 0, 13, 2), // F over the held C — a bare 4th, left to ring
    N(107, 1, 13, 2, { accent: true }),
    N(109, 1, 13, 1, { ...bend(2), accent: true }),
    N(110, 1, 13, 1, release(2)),
    N(111, 1, 13, 1.5, vib),

    /* --- 4:58 — the shake again ---------------------------------- */
    ...shakeFromBb(116, 0.75),
    N(118.5, 2, 12, 1),
    ...shakeFromA(119.5, 2.5),

    /* --- 5:05 — the minor-third bend ----------------------------- */
    N(128, 2, 12, 1),
    N(129, 1, 10, 0.25),
    N(129.25, 1, 11, 0.25),
    N(129.5, 1, 10, 0.25),
    N(129.75, 1, 11, 0.25),
    N(130, 1, 10, 0.25),
    N(130.25, 1, 11, 0.25),
    N(130.5, 1, 10, 0.25),
    N(130.75, 1, 11, 0.25),
    // 11b14r11 — three semitones, up to the blue Db and back down. The only
    // bend in the solo that is neither a whole step nor a half.
    N(131, 1, 11, 1.5, { ...bend(3), accent: true }),
    N(132.5, 1, 11, 1.5, { ...release(3), ...vib }),
    ...comping(134),

    /* --- 5:16 — the descending sequence -------------------------- */
    ...descent(144),

    /* --- 5:27 — comping, then the sequence ----------------------- */
    ...comping(160),
    ...descent(165),

    /* --- 5:45 — and again ---------------------------------------- */
    ...comping(180),
    ...descent(185),

    /* --- 6:01 — comping, then the shake -------------------------- */
    ...comping(200),
    ...shakeFromBb(205, 0.75),
    N(207.5, 2, 12, 1),
    ...shakeFromA(208.5, 2.5),

    /* --- 6:13 — out on the harmonic ------------------------------ */
    N(216, 2, 12, 1),
    ...shakeFromA(217, 2),
    N(221, 0, 20, 4, { ...harm, accent: true }), // 20(p), and that is the end
  ],
};

/* ================================================================== */
/* NOVEMBER RAIN — the outro solo                                     */
/* ================================================================== */

/*
 * A NOTE ON PITCH, BECAUSE THIS ONE IS TUNED DOWN.
 *
 * The source tab is written for a guitar tuned down a half step (Eb Ab Db Gb
 * Bb Eb), which is how the record was played. The frets below are that tab's,
 * unchanged — tune down and they are correct against the record.
 *
 * The schema has a `tuningMidi` field, but the shared <Neck> and the box
 * finder in theory/positions.js both draw standard tuning, so declaring Eb
 * here would put the ghosted scale a fret away from the notes on the highway
 * and quietly make the picture a lie. The honest alternative is the one every
 * tab site takes: name the key by the SHAPES. So this says C minor, and a
 * guitar tuned down a half step turns those shapes into the B minor you hear
 * on the record. Every interval, degree and colour is identical either way —
 * only the letters move.
 */

/** The recurring theme: C, B, C, the bent C, then down to the G and Ab. */
const nrTheme = (b) => [
  N(b, 0, 20, 0.5, { accent: true }),
  N(b + 0.5, 0, 19, 0.5),
  N(b + 1, 0, 20, 0.5),
  N(b + 1.5, 0, 20, 1.5, { ...bend(2), accent: true }),
  N(b + 3, 0, 20, 0.5),
  N(b + 3.5, 0, 19, 0.5),
  N(b + 4, 0, 20, 1),
  N(b + 5, 0, 15, 0.5),
  N(b + 5.5, 1, 16, 0.5),
  N(b + 6, 0, 15, 0.25),
  N(b + 6.25, 0, 16, 0.25),
  N(b + 6.5, 0, 15, 0.25),
  N(b + 6.75, 0, 16, 0.25, hammer),
  N(b + 7, 0, 15, 0.25, pull),
  N(b + 7.25, 1, 18, 0.25),
  N(b + 7.5, 0, 15, 0.5),
];

const NOVEMBER_RAIN = {
  id: "tab-november-rain",
  meta: {
    title: "November Rain — outro solo",
    artist: "Guns N' Roses (Slash) · transcription, entered from tab",
    key: "C",
    mode: "aeolian",
    scaleId: "aeolian",
    songIds: ["n85"],
    capo: 0,
    source:
      "snakepit.org's outro tab, transcribed by Simone Marino. Written for a guitar tuned down " +
      "a half step, so it says C minor where the record sounds B minor — see the comment above. " +
      "Rhythm and the Cm-Bb-Ab-G loop are read in.",
    note:
      "C minor as written — tune down a half step and it is the B minor you hear on the record. " +
      "Two things carry the whole solo. One is the theme: C, B, C, and that B is not in C minor " +
      "at all, it is the leading tone borrowed from the V chord, which is why the phrase sounds " +
      "like it is being pulled home rather than sitting still. The other is the G-to-Ab wail — " +
      "the 5 to the b6, a semitone, and the single most minor-sounding move on the neck. " +
      "Everything else is those two ideas answered at different heights.",
  },
  tempo: [{ atBeat: 0, bpm: 78 }],
  timeSig: [{ atBeat: 0, num: 4, den: 4 }],

  // The source tab has no timestamps, so these are named by what the phrase
  // DOES. Loop one and drill it; the theme sections are the same eight bars
  // three times over, which is the fastest way in.
  sections: [
    at("n1", "1", "the theme", 0, 12),
    at("n2", "2", "the answer, down the B string", 12, 28),
    at("n3", "3", "the theme, second time", 28, 40),
    at("n4", "4", "the hammer-on sequence", 40, 52),
    at("n5", "5", "into the low box", 52, 64),
    at("n6", "6", "the theme, cut short", 64, 84),
    at("n7", "7", "the Bb, and the pedal", 84, 100),
    at("n8", "8", "up to the high G", 100, 116),
    at("n9", "9", "down the D string", 116, 132),
    at("n10", "10", "out on the bend", 132, 148),
  ],

  harmony: cycle(["Cm", "Bb", "Ab", "G"], 1, 37),

  notes: [
    /* --- 1 — the theme ------------------------------------------ */
    ...nrTheme(0),
    N(8, 0, 13, 0.5),
    N(8.5, 0, 15, 0.5),
    N(9, 0, 16, 0.5),
    N(9.5, 0, 15, 0.5),
    N(10, 0, 16, 0.5),
    N(10.5, 0, 15, 0.5, pull),
    N(11, 0, 13, 1, vib),

    /* --- 2 — the answer ----------------------------------------- */
    N(12, 1, 16, 0.5, { accent: true }),
    N(12.5, 1, 13, 0.5, pull),
    N(13, 1, 16, 0.5),
    N(13.5, 0, 13, 0.5),
    N(14, 0, 15, 0.5),
    N(14.5, 0, 13, 0.5, pull),
    N(15, 1, 16, 0.5),
    N(15.5, 0, 13, 0.5),
    N(16, 1, 15, 0.5),
    N(16.5, 1, 16, 0.5),
    N(17, 1, 18, 0.5),
    N(17.5, 1, 16, 0.5),
    N(18, 1, 15, 0.5),
    N(18.5, 1, 16, 0.5),
    N(19, 1, 15, 1, { ...bend(1), accent: true }), // D pushed up to the b3
    N(20, 1, 15, 1, release(1)),
    N(21, 1, 13, 0.5),
    N(21.5, 1, 15, 0.5),
    N(22, 1, 16, 0.5),
    N(22.5, 0, 13, 0.5),
    N(23, 1, 15, 0.5),
    N(23.5, 1, 16, 0.5),
    N(24, 0, 13, 0.5),
    N(24.5, 1, 13, 0.5),
    N(25, 1, 12, 0.5), // the B natural — the leading tone, not the key
    N(25.5, 1, 13, 0.5),
    N(26, 1, 12, 0.5, pull),
    N(26.5, 2, 12, 1.5, vib),

    /* --- 3 — the theme, second time ----------------------------- */
    ...nrTheme(28),
    N(36, 1, 13, 0.5),
    N(36.5, 1, 15, 0.5, hammer),
    N(37, 1, 16, 0.5, hammer),
    N(37.5, 0, 15, 0.5),
    N(38, 0, 16, 2, { ...vib, accent: true }), // sat on the b6, which is the sound

    /* --- 4 — the hammer-on sequence ----------------------------- */
    N(40, 0, 15, 0.25),
    N(40.25, 0, 16, 0.25, hammer),
    N(40.5, 0, 15, 0.25, pull),
    N(40.75, 0, 13, 0.25, pull),
    N(41, 0, 15, 1),
    N(42, 1, 16, 0.5),
    N(42.5, 0, 13, 0.25),
    N(42.75, 0, 15, 0.25, hammer),
    N(43, 0, 13, 0.25, pull),
    N(43.25, 1, 16, 0.75),
    N(44, 0, 13, 1),
    N(45, 1, 13, 0.25),
    N(45.25, 1, 15, 0.25, hammer),
    N(45.5, 1, 16, 0.5, hammer),
    N(46, 0, 13, 0.25),
    N(46.25, 0, 15, 0.25, hammer),
    N(46.5, 0, 16, 0.25, hammer),
    N(46.75, 0, 15, 0.25, pull),
    N(47, 0, 13, 0.5, pull),
    N(47.5, 1, 16, 0.5),
    N(48, 0, 15, 0.5),
    N(48.5, 1, 16, 0.5),
    N(49, 0, 13, 0.25),
    N(49.25, 0, 15, 0.25, hammer),
    N(49.5, 0, 13, 0.5, pull),
    N(50, 1, 16, 2, vib),

    /* --- 5 — into the low box ----------------------------------- */
    N(52, 1, 15, 0.5),
    N(52.5, 1, 16, 0.5),
    N(53, 1, 18, 0.5),
    N(53.5, 1, 16, 0.5),
    N(54, 1, 15, 0.5),
    N(54.5, 1, 16, 0.5),
    N(55, 1, 15, 0.5),
    N(55.5, 1, 13, 0.5),
    N(56, 1, 11, 0.25),
    N(56.25, 1, 13, 0.25, hammer),
    N(56.5, 1, 11, 0.5, pull),
    N(57, 2, 13, 0.5),
    N(57.5, 2, 15, 0.5),
    N(58, 2, 13, 0.5, pull),
    N(58.5, 2, 15, 0.5),
    N(59, 2, 13, 0.5, pull),
    N(59.5, 3, 12, 2.5, { ...bend(1), accent: true }), // the 2 leaned onto the b3

    /* --- 6 — the theme, cut short ------------------------------- */
    N(64, 0, 20, 0.5, { accent: true }),
    N(64.5, 0, 19, 0.5),
    N(65, 0, 20, 0.5),
    N(65.5, 0, 20, 1.5, { ...bend(2), accent: true }),
    N(67, 0, 20, 0.5),
    N(67.5, 0, 19, 0.5),
    N(68, 1, 15, 1, bend(1)),
    N(69, 1, 16, 0.25),
    N(69.25, 1, 15, 0.25, pull),
    N(69.5, 1, 13, 0.5, pull),
    N(70, 1, 15, 1, bend(1)),
    N(71, 1, 15, 0.5, release(1)),
    N(71.5, 1, 13, 0.5, pull),
    N(72, 1, 18, 1.5, { ...bend(2), accent: true }), // 18brb — bent, shaken, bent
    N(73.5, 1, 18, 0.5, release(2)),
    N(74, 1, 16, 0.5),
    N(74.5, 2, 17, 0.5),
    N(75, 1, 16, 0.5),
    N(75.5, 0, 20, 2.5, { ...vib, accent: true }),
    N(78, 0, 20, 0.5),
    N(78.5, 0, 19, 0.5),
    N(79, 0, 20, 0.5),
    N(79.5, 0, 15, 0.5),
    N(80, 0, 20, 0.5),
    N(80.5, 0, 19, 0.5),

    /* --- 7 — the Bb, and the pedal ------------------------------ */
    N(84, 0, 15, 1, { accent: true }),
    N(85, 0, 18, 0.5),
    N(85.5, 0, 16, 0.5),
    N(86, 0, 18, 1),
    N(87, 0, 15, 0.5),
    N(87.5, 0, 16, 0.25),
    N(87.75, 0, 15, 0.75, pull),
    N(88.5, 1, 18, 0.5),
    // The G repeats while the B string walks under it — a pedal tone, and the
    // clearest place on the record to hear one chord move against one note.
    N(89, 0, 15, 1),
    N(90, 1, 16, 0.5),
    N(90.5, 1, 18, 0.5),
    N(91, 0, 15, 1),
    N(92, 1, 16, 0.5),
    N(92.5, 0, 15, 1),
    N(93.5, 1, 16, 0.5),
    N(94, 0, 15, 1),
    N(95, 1, 16, 1),
    N(96, 0, 20, 0.5),
    N(96.5, 0, 19, 0.5),
    N(97, 0, 20, 0.5),
    N(97.5, 0, 20, 1.5, { ...bend(2), accent: true }),
    N(99, 0, 20, 0.5),

    /* --- 8 — up to the high G ----------------------------------- */
    N(100, 0, 19, 0.5),
    N(100.5, 0, 20, 1),
    N(101.5, 0, 15, 0.5),
    N(102, 1, 16, 0.5),
    N(102.5, 0, 15, 0.5),
    N(103, 0, 16, 0.5),
    N(103.5, 0, 15, 0.25),
    N(103.75, 0, 16, 0.25, hammer),
    N(104, 0, 15, 0.25, pull),
    N(104.25, 1, 18, 0.25),
    N(104.5, 0, 15, 1),
    N(105.5, 1, 18, 0.5),
    N(106, 1, 20, 0.5),
    N(106.5, 0, 20, 2, { ...vib, accent: true }),
    N(108.5, 0, 15, 0.5),
    N(109, 1, 16, 0.5),
    N(109.5, 1, 18, 0.5),
    N(110, 1, 16, 1),
    N(111, 2, 17, 0.5),
    N(111.5, 2, 15, 0.5),
    N(112, 2, 17, 0.5),
    N(112.5, 2, 17, 0.5),
    N(113, 2, 15, 1, vib),

    /* --- 9 — down the D string ---------------------------------- */
    N(116, 3, 17, 0.5),
    N(116.5, 3, 16, 0.5), // F# — the only note in the solo outside C minor
    N(117, 3, 15, 0.5),
    N(117.5, 3, 15, 0.5),
    N(118, 3, 15, 0.5),
    N(118.5, 3, 13, 0.5),
    N(119, 3, 15, 0.5),
    N(119.5, 3, 13, 0.5),
    N(120, 4, 15, 1, { accent: true }),
    ...nrTheme(122).slice(0, 7),
    N(129, 0, 15, 0.5),
    N(129.5, 1, 16, 0.5),
    N(130, 0, 15, 0.5),
    N(130.5, 0, 16, 1.5, vib),

    /* --- 10 — out on the bend ----------------------------------- */
    N(132, 1, 16, 0.5),
    N(132.5, 0, 15, 1),
    N(133.5, 0, 15, 1.5, { ...bend(1), accent: true }),
    N(135, 0, 15, 0.5, release(1)),
    N(135.5, 0, 13, 0.5, pull),
    N(136, 1, 16, 0.5),
    N(136.5, 0, 15, 2, vib),
    N(138.5, 0, 15, 0.5),
    N(139, 0, 13, 0.5, pull),
    N(139.5, 1, 16, 0.5),
    N(140, 1, 15, 0.5, pull),
    N(140.5, 1, 15, 1, bend(1)),
    N(141.5, 1, 15, 1, release(1)),
    N(142.5, 1, 15, 1.5, { ...bend(1), accent: true }),
    N(144, 1, 15, 2, release(1)), // and it fades out still bent
  ],
};

/* ================================================================== */
/* WHILE MY GUITAR GENTLY WEEPS — Prince's solo, live 2004            */
/* ================================================================== */

/*
 * Source: Daniel Paul's tab of the 2004 Rock'n'Roll Hall of Fame version —
 * the induction-ceremony performance with Tom Petty, Jeff Lynne, Steve
 * Winwood and Dhani Harrison, where Prince takes the outro. Standard tuning,
 * so unlike November Rain nothing here has to be transposed or explained away.
 *
 * The tab's own legend, kept because the schema has to honour it:
 *   brp = bend, release, pull off      h = hammer on      v = vibrato
 *   T   = pick as fast as you can      ALL bends are a whole step unless a
 *   (½) is written above them — which happens exactly once, on the bend that
 *   opens phrase 3, and is carried below as bend(1) rather than bend(2).
 *
 * ORDER. The source is four pages and the phrases run straight through; they
 * are numbered 1-22 below in that order. Where a system's rows overlap in the
 * ASCII — the tabber lines two strings up under one column — the reading here
 * is left to right by column, which is the only ordering the notation
 * actually commits to.
 */

/** `/8h9-9` — the Eb-E hammer that runs fourteen times over two systems. */
const wmHammer = (b, d) => [
  N(b, 2, 8, d),
  N(b + d, 2, 9, d, hammer),
  N(b + 2 * d, 2, 9, d),
];

/** `0-0-12` / `0-0-10` — the open E pedalled under a fretted note. */
const wmPedal = (b, fret) => [
  N(b, 0, 0, 0.25),
  N(b + 0.25, 0, 0, 0.25),
  N(b + 0.5, 0, fret, 0.5, { accent: true }),
];

/** `19brp17-19-17` — bend, release, pull off, then answer it. Two beats. */
const wmBrp = (b) => [
  N(b, 2, 19, 0.5, { ...bend(2), accent: true }),
  N(b + 0.5, 2, 19, 0.25, release(2)),
  N(b + 0.75, 2, 17, 0.25, pull),
  N(b + 1, 2, 19, 0.5),
  N(b + 1.5, 2, 17, 0.5),
];

/** `13p12p10` — the sign-off, six times over. One beat. */
const wmPull = (b, tail = 0.5) => [
  N(b, 1, 13, 0.25),
  N(b + 0.25, 1, 12, 0.25, pull),
  N(b + 0.5, 1, 10, tail, pull),
];

const GENTLY_WEEPS = {
  id: "tab-gently-weeps",
  meta: {
    title: "While My Guitar Gently Weeps — Prince's solo",
    artist: "Prince, live 2004 · transcription by Daniel Paul, entered from tab",
    key: "A",
    mode: "aeolian",
    scaleId: "aeolian",
    songIds: ["n60"],
    capo: 0,
    source:
      "Daniel Paul's tab of the 2004 Rock'n'Roll Hall of Fame performance. Rhythm and the " +
      "Am-Am/G-D9/F#-F verse loop are read in; the tabber flagged one count himself, in phrase 17.",
    note:
      "A minor, standard tuning, and the most useful thing on the page is what happens when it " +
      "leaves the key. The F# on the B string at the 7th fret is not a wrong note — the verse " +
      "goes to D9/F#, and that is Prince landing on the chord. The Eb inside the 8h9 hammer is " +
      "the b5, the blue note, used as a way INTO the E rather than a note to sit on. Watch both " +
      "go grey on the neck, then listen to where they go next; that is the whole lesson.",
  },
  // The Beatles' original sits around 115 and the live version is close.
  tempo: [{ atBeat: 0, bpm: 115 }],
  timeSig: [{ atBeat: 0, num: 4, den: 4 }],

  // One section per system of the tab, in the order the four pages run.
  sections: [
    at("w1", "1", "the entrance, bent and shaken", 0, 16),
    at("w2", "2", "across the box", 16, 24),
    at("w3", "3", "the long fall (the one half-step bend)", 24, 40),
    at("w4", "4", "bend, release, pull — three times", 40, 48),
    at("w5", "5", "down to the D string", 48, 56),
    at("w6", "6", "the slides", 56, 64),
    at("w7", "7", "the 8h9 machine, fourteen times", 64, 80),
    at("w8", "8", "the open-E pedal descent", 80, 96),
    at("w9", "9", "the low-string slides", 96, 108),
    at("w10", "10", "up to the 17th", 108, 124),
    at("w11", "11", "the repeated bend", 124, 140),
    at("w12", "12", "tremolo out (T)", 140, 156),
    at("w13", "13", "the climb on the D string", 156, 172),
    at("w14", "14", "the climb again, into the trill", 172, 188),
    at("w15", "15", "bend-release-pull, and the slide up", 188, 200),
    at("w16", "16", "the open-E riff, six times", 200, 216),
    at("w17", "17", "the C hammer machine", 216, 232),
    at("w18", "18", "the bent G and the low answer", 232, 248),
    at("w19", "19", "the bend figure, four times", 248, 264),
    at("w20", "20", "the pull-off figure", 264, 276),
    at("w21", "21", "13p12p10, six times", 276, 284),
    at("w22", "22", "shred, and out", 284, 300),
  ],

  // The song's verse loop, one chord per bar. This is what Prince is playing
  // OVER, not something the tab states — see `unverified`. It is also the
  // reason the F# and the bent G# below are not mistakes.
  harmony: cycle(["Am", "Am/G", "D9/F#", "F", "Am", "G", "D", "E"], 1, 75),

  notes: [
    /* --- 1 — the entrance -------------------------------------- */
    N(0, 1, 15, 1.5, { ...bend(2), accent: true }),
    N(1.5, 1, 15, 0.5, release(2)),
    N(2, 1, 15, 1, bend(2)),
    N(3, 1, 15, 0.5, release(2)),
    N(3.5, 1, 15, 1, bend(2)),
    N(4.5, 1, 15, 0.5, release(2)),
    N(5, 1, 15, 1, bend(2)),
    N(6, 1, 15, 0.5, release(2)),
    N(6.5, 1, 15, 1.5, vib),
    N(8, 1, 13, 1),
    N(9, 1, 15, 1.5, { ...bend(2), accent: true }),
    N(10.5, 1, 15, 0.5, release(2)),
    N(11, 1, 13, 0.5, pull),
    N(11.5, 2, 14, 2.5, vib),

    /* --- 2 — across the box ------------------------------------ */
    N(16, 2, 14, 0.5, { accent: true }),
    N(16.5, 2, 16, 0.5),
    N(17, 2, 14, 0.5),
    N(17.5, 2, 16, 0.5),
    N(18, 2, 14, 0.5),
    N(18.5, 2, 17, 1.5),
    N(20, 2, 17, 1, { ...bend(2), accent: true }),
    N(21, 2, 17, 0.5, release(2)),
    N(21.5, 2, 14, 2, vib),

    /* --- 3 — the long fall ------------------------------------- */
    // The ONE half-step bend on the page: B up to C, not up to C#.
    N(24, 2, 16, 1, { ...bend(1), accent: true }),
    N(25, 2, 16, 0.5, release(1)),
    N(25.5, 2, 16, 0.5),
    N(26, 2, 14, 0.5, pull),
    N(26.5, 2, 14, 0.5),
    N(27, 2, 17, 0.5),
    N(27.5, 2, 16, 0.25, pull),
    N(27.75, 2, 14, 0.25, pull),
    N(28, 2, 14, 0.5, slide(12)),
    N(28.5, 2, 12, 0.5, slide(7)),
    N(29, 2, 7, 0.5, slide(5)),
    N(29.5, 2, 5, 0.5),
    N(30, 2, 7, 0.5),
    N(30.5, 2, 5, 0.5),
    N(31, 2, 7, 0.5),
    N(31.5, 2, 5, 0.5),
    // F# on the B string — the 6 of A minor, and the 3rd of the D9 the verse
    // is sitting on. Not an accident, and not a passing note.
    N(32, 1, 7, 1, { ...bend(2), accent: true }),
    N(33, 1, 7, 1, bend(2)),
    N(34, 1, 7, 0.5),
    N(34.5, 1, 5, 0.25),
    N(34.75, 1, 7, 0.25, hammer),
    N(35, 1, 5, 1, pull),

    /* --- 4 — bend, release, pull, three times ------------------- */
    N(40, 1, 7, 1, { ...bend(2), accent: true }),
    N(41, 1, 7, 0.5, release(2)),
    N(41.5, 1, 5, 0.5, pull),
    N(42, 1, 7, 1, bend(2)),
    N(43, 1, 7, 0.5, release(2)),
    N(43.5, 1, 5, 0.5, pull),
    N(44, 1, 7, 1, bend(2)),
    N(45, 1, 7, 0.5, release(2)),
    N(45.5, 1, 5, 2, { ...pull, accent: true }),

    /* --- 5 — down to the D string ------------------------------ */
    N(48, 1, 8, 1.5, { ...bend(2), accent: true }),
    N(49.5, 1, 5, 0.5),
    N(50, 1, 8, 0.5),
    N(50.5, 1, 5, 0.5),
    N(51, 2, 7, 0.5),
    N(51.5, 1, 5, 0.5),
    N(52, 2, 7, 1, bend(2)),
    N(53, 2, 7, 0.5, release(2)),
    N(53.5, 2, 5, 0.5, pull),
    N(54, 3, 7, 2, vib),

    /* --- 6 — the slides ---------------------------------------- */
    N(56, 3, 7, 1, { accent: true }),
    N(57, 2, 4, 1, slide(0)),
    N(58, 2, 0, 1),
    N(59, 3, 7, 1),
    N(60, 2, 5, 1, slide(2)),
    N(61, 2, 2, 3, vib),

    /* --- 7 — the 8h9 machine ----------------------------------- */
    // "first four slower the rest fast", then "keep going thats 7 more
    // times". Fourteen in all, and the Eb is the blue note going INTO the E.
    ...wmHammer(64, 0.5),
    ...wmHammer(65.5, 0.5),
    ...wmHammer(67, 0.5),
    ...wmHammer(68.5, 0.5),
    ...wmHammer(70, 0.25),
    ...wmHammer(70.75, 0.25),
    ...wmHammer(71.5, 0.25),
    ...wmHammer(72.25, 0.25),
    ...wmHammer(73, 0.25),
    ...wmHammer(73.75, 0.25),
    ...wmHammer(74.5, 0.25),
    ...wmHammer(75.25, 0.25),
    ...wmHammer(76, 0.25),
    ...wmHammer(76.75, 0.25),

    /* --- 8 — the open-E pedal descent -------------------------- */
    N(80, 2, 2, 0.5, slide(9)),
    N(80.5, 2, 9, 1.5),
    ...wmPedal(82, 12),
    ...wmPedal(83, 10),
    ...wmPedal(84, 8),
    ...wmPedal(85, 7),
    ...wmPedal(86, 5),
    N(87, 0, 0, 1),
    N(88, 1, 13, 0.5),
    N(88.5, 1, 12, 0.25),
    N(88.75, 1, 13, 0.25, hammer),
    N(89, 1, 12, 0.25, pull),
    N(89.25, 1, 10, 0.5, pull),
    N(89.75, 1, 8, 0.25),
    N(90, 1, 8, 0.75, slide(10)),
    N(90.75, 1, 10, 2, vib),

    /* --- 9 — the low-string slides ----------------------------- */
    N(96, 1, 10, 1),
    N(97, 1, 8, 1),
    N(98, 1, 10, 1.5, { ...bend(2), accent: true }),
    N(99.5, 1, 10, 1, bend(2)),
    N(100.5, 1, 10, 0.5, release(2)),
    N(101, 1, 8, 0.5, pull),
    N(101.5, 1, 10, 1.5),
    N(103, 5, 17, 1.5, { accent: true }),
    N(104.5, 5, 19, 1.5),
    N(106, 4, 0, 2),
    N(106, 5, 0, 2),

    /* --- 10 — up to the 17th ----------------------------------- */
    N(108, 1, 17, 0.5),
    N(108.5, 1, 20, 1, bend(2)),
    N(109.5, 0, 17, 1.5, { ...vib, accent: true }),
    N(111, 1, 20, 1, bend(2)),
    N(112, 0, 17, 1),
    N(113, 1, 20, 0.5),
    N(113.5, 1, 17, 0.5, pull),
    N(114, 1, 20, 1, bend(2)),
    N(115, 0, 17, 1),
    N(116, 1, 20, 0.75, bend(2)),
    N(116.75, 1, 17, 0.75),
    N(117.5, 1, 20, 1, bend(2)),
    N(118.5, 0, 17, 1),
    N(119.5, 1, 20, 0.5),
    N(120, 1, 17, 0.5),
    N(120.5, 0, 20, 1.5, { ...bend(2), accent: true }),
    N(122, 0, 20, 1, release(2)),

    /* --- 11 — the repeated bend -------------------------------- */
    N(124, 0, 20, 0.75, { ...bend(2), accent: true }),
    N(124.75, 0, 20, 0.25, release(2)),
    N(125, 0, 20, 0.75, bend(2)),
    N(125.75, 0, 20, 0.25, release(2)),
    N(126, 0, 20, 0.75, bend(2)),
    N(126.75, 0, 20, 0.25, release(2)),
    N(127, 0, 20, 0.75, bend(2)),
    N(127.75, 0, 20, 0.25, release(2)),
    N(128, 0, 20, 0.75, bend(2)),
    N(128.75, 0, 20, 0.25, release(2)),
    N(129, 0, 17, 0.25),
    N(129.25, 0, 20, 0.25, hammer),
    N(129.5, 0, 17, 0.5, pull),
    N(130, 0, 17, 0.5),
    N(130.5, 0, 17, 1),
    N(131.5, 0, 20, 0.25),
    N(131.75, 0, 17, 0.25, pull),
    N(132, 0, 19, 0.25),
    N(132.25, 0, 17, 0.75, pull),
    N(133, 0, 20, 0.25),
    N(133.25, 0, 17, 0.25, pull),
    N(133.5, 0, 19, 0.25),
    N(133.75, 0, 17, 1.25, { ...pull, accent: true }),

    /* --- 12 — tremolo out (T) ---------------------------------- */
    N(140, 0, 20, 0.5, { accent: true }),
    N(140.5, 0, 17, 0.5),
    N(141, 0, 17, 0.5),
    N(141.5, 0, 19, 0.5),
    N(142, 0, 17, 0.5),
    N(142.5, 0, 17, 0.5),
    N(143, 0, 20, 0.5),
    N(143.5, 0, 17, 0.5),
    N(144, 0, 17, 0.5),
    N(144.5, 0, 19, 0.5),
    N(145, 0, 17, 0.5),
    // "T = pick as fast as you can" — one note, held, and shaken.
    N(145.5, 0, 20, 4, { ...vib, accent: true }),

    /* --- 13 — the climb on the D string ------------------------ */
    N(156, 3, 0, 0.5, { accent: true }),
    N(156.5, 3, 2, 0.5),
    N(157, 3, 2, 0.5),
    N(157.5, 3, 2, 0.5),
    N(158, 3, 2, 0.5),
    N(158.5, 3, 4, 0.5),
    N(159, 3, 4, 0.5),
    N(159.5, 3, 4, 0.5),
    N(160, 3, 4, 0.5),
    N(160.5, 3, 5, 0.5),
    N(161, 3, 5, 0.5),
    N(161.5, 3, 5, 0.5),
    N(162, 3, 5, 0.5),
    N(162.5, 3, 5, 0.5),
    N(163, 3, 5, 0.5),
    N(163.5, 3, 5, 0.5),
    N(164, 3, 5, 0.5),
    N(164.5, 3, 7, 0.5),
    N(165, 3, 7, 0.5),
    N(165.5, 3, 7, 0.5),
    N(166, 3, 7, 1),

    /* --- 14 — the climb again, into the trill ------------------ */
    N(172, 2, 4, 0.5, { accent: true }),
    N(172.5, 2, 4, 0.5),
    N(173, 2, 4, 0.5),
    N(173.5, 2, 4, 0.5),
    N(174, 2, 5, 0.5),
    N(174.5, 2, 5, 0.5),
    N(175, 2, 5, 0.5),
    N(175.5, 2, 5, 0.5),
    N(176, 2, 7, 0.5),
    N(176.5, 2, 7, 0.5),
    N(177, 2, 7, 0.5),
    N(177.5, 2, 7, 0.5),
    N(178, 2, 7, 0.5),
    N(178.5, 2, 9, 0.25),
    N(178.75, 2, 7, 0.25, pull),
    N(179, 2, 9, 0.25, hammer),
    N(179.25, 2, 7, 0.25, pull),
    N(179.5, 2, 9, 0.25, hammer),
    N(179.75, 2, 7, 0.25, pull),
    N(180, 2, 9, 0.25, hammer),
    N(180.25, 2, 7, 0.25, pull),
    N(180.5, 2, 9, 2, { ...vib, accent: true }),

    /* --- 15 — bend-release-pull, and the slide up -------------- */
    N(188, 2, 7, 1, { ...bend(2), accent: true }),
    N(189, 2, 7, 0.5, release(2)),
    N(189.5, 2, 5, 0.5, pull),
    N(190, 3, 7, 0.5),
    N(190.5, 1, 5, 0.5),
    N(191, 2, 7, 1, bend(2)),
    N(192, 2, 7, 0.5, release(2)),
    N(192.5, 2, 5, 0.5, pull),
    N(193, 0, 8, 0.5),
    N(193.5, 0, 0, 0.5, pull),
    N(194, 1, 5, 0.5),
    N(194.5, 1, 8, 0.5),
    N(195, 1, 10, 0.5),
    N(195.5, 1, 12, 2, vib),

    /* --- 16 — the open-E riff, six times ----------------------- */
    ...wmPedal(200, 12),
    ...wmPedal(201, 10),
    ...wmPedal(202, 12),
    ...wmPedal(203, 10),
    ...wmPedal(204, 12),
    ...wmPedal(205, 10),
    ...wmPedal(206, 12),
    ...wmPedal(207, 10),
    ...wmPedal(208, 12),
    ...wmPedal(209, 10),
    ...wmPedal(210, 12),
    ...wmPedal(211, 10),

    /* --- 17 — the C hammer machine ----------------------------- */
    // The tabber's own note here: "not sure of the exact number x here (but
    // there are two hammer-ons then four)". Counted as written; treat it as a
    // bar to sit inside rather than a number to get right.
    N(216, 0, 0, 0.25),
    N(216.25, 0, 0, 0.25),
    N(216.5, 0, 10, 0.5, { accent: true }),
    N(217, 0, 8, 0.25),
    N(217.25, 0, 8, 0.25),
    N(217.5, 0, 8, 0.25),
    N(217.75, 0, 8, 0.25),
    N(218, 0, 8, 0.25),
    N(218.25, 0, 8, 0.25),
    N(218.5, 0, 8, 0.25),
    N(218.75, 0, 8, 0.25),
    N(219, 0, 10, 0.25),
    N(219.25, 0, 8, 0.25, pull),
    N(219.5, 0, 8, 0.25),
    N(219.75, 0, 8, 0.25),
    N(220, 0, 10, 0.5),
    N(220.5, 0, 15, 0.25),
    N(220.75, 0, 12, 0.25, pull),
    N(221, 0, 12, 0.5),
    N(221.5, 0, 15, 0.25),
    N(221.75, 0, 12, 0.25, pull),
    N(222, 0, 12, 0.5),
    N(222.5, 0, 15, 0.25),
    N(222.75, 0, 12, 0.25, pull),
    N(223, 0, 12, 0.5),
    N(223.5, 0, 15, 0.25),
    N(223.75, 0, 12, 0.25, pull),
    N(224, 0, 12, 1, vib),

    /* --- 18 — the bent G and the low answer -------------------- */
    N(232, 1, 20, 2.5, { ...bend(2), accent: true }),
    N(234.5, 1, 20, 0.75, bend(2)),
    N(235.25, 1, 20, 0.25, release(2)),
    N(235.5, 1, 20, 0.75, bend(2)),
    N(236.25, 1, 20, 0.25, release(2)),
    N(236.5, 1, 20, 1.5, { ...bend(2), accent: true }),
    N(238, 3, 7, 0.5),
    N(238.5, 2, 5, 0.5),
    N(239, 2, 7, 0.5),
    N(239.5, 2, 5, 0.25),
    N(239.75, 2, 7, 0.25, hammer),
    N(240, 2, 7, 0.5, slide(9)),
    N(240.5, 2, 9, 2, vib),

    /* --- 19 — the bend figure, four times ---------------------- */
    N(248, 3, 17, 1, { accent: true }),
    ...wmBrp(249),
    ...wmBrp(251),
    ...wmBrp(253),
    ...wmBrp(255),
    N(257, 3, 19, 1),
    N(258, 4, 17, 1, slide(0)),
    N(258, 5, 17, 1, slide(0)),
    N(259, 4, 0, 2),
    N(259, 5, 0, 2),

    /* --- 20 — the pull-off figure ------------------------------ */
    N(264, 2, 12, 1, { accent: true }),
    N(265, 1, 13, 0.25),
    N(265.25, 1, 10, 0.25, pull),
    N(265.5, 1, 10, 0.5),
    N(266, 1, 12, 0.25),
    N(266.25, 1, 10, 0.25, pull),
    N(266.5, 1, 10, 0.5),
    N(267, 1, 13, 0.25),
    N(267.25, 1, 10, 0.25, pull),
    N(267.5, 1, 10, 0.5),
    N(268, 1, 12, 0.25),
    N(268.25, 1, 10, 0.25, pull),
    N(268.5, 1, 10, 0.5),
    ...wmPull(269),
    ...wmPull(270, 1.5),

    /* --- 21 — 13p12p10, six times ------------------------------ */
    ...wmPull(276),
    ...wmPull(277),
    ...wmPull(278),
    ...wmPull(279),
    ...wmPull(280),
    ...wmPull(281, 1.5),

    /* --- 22 — shred, and out ----------------------------------- */
    N(284, 0, 20, 1, { ...bend(2), accent: true }),
    N(285, 0, 20, 0.5, release(2)),
    N(285.5, 0, 20, 0.75, bend(2)),
    N(286.25, 0, 20, 0.25, release(2)),
    N(286.5, 0, 20, 1),
    N(287.5, 0, 17, 0.5),
    N(288, 0, 19, 0.5),
    N(288.5, 0, 20, 0.5),
    N(289, 0, 19, 0.5),
    N(289.5, 0, 17, 0.5),
    N(290, 1, 20, 0.5),
    N(290.5, 1, 17, 0.5),
    N(291, 2, 19, 0.5),
    N(291.5, 2, 17, 0.5),
    N(292, 3, 19, 1),
    N(293, 2, 19, 1, { ...bend(2), accent: true }),
    N(294, 2, 19, 0.5, release(2)),
    N(294.5, 2, 19, 2, { ...bend(2), accent: true }),
  ],
};

/* ================================================================== */
/* ALONE — the solo                                                   */
/* ================================================================== */

/*
 * Source: a rendered tab of the whole song, bars 58-65, which is the eight
 * bars marked "Solo". Standard tuning, and unlike the other three the source
 * states its own tempo and time signature — 87, 4/4 — so those are facts here
 * rather than guesses, and the bar lines below are the tab's own.
 *
 * READING A RENDERED TAB, AND HOW THIS ONE WAS CHECKED
 * ----------------------------------------------------
 * An ASCII tab says which string a number is on; a picture of a tab makes you
 * infer it from which line the digit sits on, and one row of error turns every
 * note into a different note. Two independent checks pinned this one:
 *
 *   1. Every note below lands in F# major. Six sharps, and not one accidental
 *      in eight bars — a reading that is off by a row does not do that.
 *   2. The chord stacks either side of the solo read out as D#m, B, F#, C#,
 *      which is the chorus progression published elsewhere for this song.
 *      Same grid, two results that agree.
 *
 * The changes under the solo come from that chord chart, not from this tab,
 * which prints the lead line alone through the solo. See `unverified`.
 */

const ALONE = {
  id: "tab-alone",
  meta: {
    title: "Alone — the solo",
    artist: "Heart (Howard Leese) · transcription, entered from tab",
    key: "F#",
    mode: "major",
    scaleId: "major",
    songIds: ["n86"],
    capo: 0,
    source:
      "a rendered tab of the whole song, bars 58-65. It states its own tempo and time signature, " +
      "so those are its; the subdivisions inside each bar, and the D#m-B-F#-C# chorus loop, are " +
      "read in.",
    note:
      "F# major: six sharps, which is why it looks frightening and plays easy. The solo never " +
      "leaves the scale — not one accidental in eight bars. What it does instead is move the " +
      "same handful of notes against four different chords, and the C# you keep hearing is the " +
      "whole trick: it is the b7 over D#m, the 2 over B, the 5 over F#, and the root over C#. " +
      "One note, four jobs. Watch its ring change colour four times while your finger does not " +
      "move — that is the entire lesson this app exists to show.",
  },
  // Both stated by the source, so neither is in `unverified` above.
  tempo: [{ atBeat: 0, bpm: 87 }],
  timeSig: [{ atBeat: 0, num: 4, den: 4 }],

  // One section per bar, labelled with the tab's OWN bar numbers so you can
  // loop a bar here and find it on the page.
  sections: [
    at("a58", "58", "the first bend", 0, 4),
    at("a59", "59", "the C# pedal", 4, 8),
    at("a60", "60", "down, then the slide up", 8, 12),
    at("a61", "61", "the triplet turn", 12, 16),
    at("a62", "62", "the long sixteenth run", 16, 20),
    at("a63", "63", "answered low", 20, 24),
    at("a64", "64", "up to the F#", 24, 28),
    at("a65", "65", "the last bend", 28, 32),
  ],

  // vi-IV-I-V in F# major, one bar each, twice through the solo.
  harmony: cycle(["D#m", "B", "F#", "C#"], 1, 8),

  notes: [
    /* --- 58 — the first bend ------------------------------------ */
    // C# on the B string, bent a whole step to D# — the b7 of the D#m
    // underneath pushed up to its root.
    N(0, 1, 14, 0.75, { ...bend(2), accent: true }),
    N(0.75, 1, 14, 0.25, release(2)),
    N(1, 1, 14, 0.5),
    N(1.5, 1, 11, 0.5),
    N(2, 1, 14, 1, { ...bend(2), accent: true }),
    N(3, 0, 13, 0.5),
    N(3.5, 0, 14, 0.5),

    /* --- 59 — the C# pedal -------------------------------------- */
    // F# repeats on top while the line under it walks C#-B-A#. A pedal tone,
    // and the clearest place on the page to hear one note stay put while the
    // harmony moves past it.
    N(4, 1, 14, 0.25, { accent: true }),
    N(4.25, 0, 14, 0.25),
    N(4.5, 1, 12, 0.25),
    N(4.75, 0, 14, 0.25),
    N(5, 1, 11, 0.25),
    N(5.25, 0, 14, 0.25),
    N(5.5, 2, 13, 1),
    N(6.5, 2, 11, 0.75),
    N(7.25, 2, 10, 0.75),

    /* --- 60 — down, then the slide up --------------------------- */
    N(8, 3, 13, 1, { accent: true }),
    N(9, 2, 11, 1), // the tab palm-mutes this one
    N(10, 1, 11, 0.5),
    N(10.5, 1, 12, 0.5),
    N(11, 1, 14, 0.5, slide(16)),
    N(11.5, 1, 16, 0.5),

    /* --- 61 — the triplet turn ---------------------------------- */
    N(12, 1, 14, 0.33),
    N(12.33, 1, 16, 0.33),
    N(12.66, 1, 14, 0.34),
    N(13, 2, 16, 0.5),
    N(13.5, 2, 15, 0.5),
    N(14, 1, 16, 1.5, { ...bend(2), accent: true }),
    N(15.5, 1, 16, 0.25, release(2)),
    N(15.75, 1, 14, 0.25),

    /* --- 62 — the long sixteenth run ---------------------------- */
    N(16, 2, 16, 0.5, { ...vib, accent: true }),
    N(16.5, 3, 13, 0.25),
    N(16.75, 2, 11, 0.25),
    N(17, 1, 14, 0.25),
    N(17.25, 1, 12, 0.25),
    N(17.5, 1, 11, 0.25),
    N(17.75, 1, 12, 0.25),
    N(18, 1, 11, 0.25),
    N(18.25, 2, 13, 0.25),
    N(18.5, 1, 11, 0.5),
    N(19, 1, 14, 0.5),
    N(19.5, 1, 11, 0.5),

    /* --- 63 — answered low -------------------------------------- */
    N(20, 2, 13, 0.5, { accent: true }),
    N(20.5, 4, 14, 0.25),
    N(20.75, 3, 13, 0.25),
    N(21, 1, 14, 0.5),
    N(21.5, 2, 13, 0.25),
    N(21.75, 2, 11, 0.25),
    // the tab rests here
    N(22.5, 2, 13, 0.5),
    N(23, 1, 14, 0.5),

    /* --- 64 — up to the F# -------------------------------------- */
    N(24, 1, 14, 1.5, { accent: true }),
    N(25.5, 1, 18, 0.25),
    N(25.75, 1, 16, 0.25),
    N(26, 2, 18, 0.5),
    N(26.5, 1, 16, 0.33),
    N(26.83, 1, 18, 0.33),
    N(27.16, 1, 19, 0.34),
    N(27.5, 1, 16, 0.5),

    /* --- 65 — the last bend ------------------------------------- */
    // F# bent to G#, over the C# the loop lands on: the 5 pushed up to the 6.
    N(28.5, 1, 19, 0.5, { ...bend(2), accent: true }),
    N(29, 1, 19, 0.5, release(2)),
    N(29.5, 1, 18, 0.5),
    N(30, 1, 19, 1.5, { ...bend(2), accent: true }),
  ],
};

/* ================================================================== */
/* SLOW DANCING IN A BURNING ROOM (Live in LA) — the whole song        */
/* ================================================================== */

/*
 * The odd one out, twice over.
 *
 * It is the WHOLE ARRANGEMENT rather than a solo — eighty-seven bars, intro
 * to outro — and its notes are not typed out below but imported from
 * ./tab-slow-dancing.js, converted from the note data the Songsterr player
 * itself loads. That is the only reason it can be the whole song: sixteen
 * hundred notes read off a picture would be sixteen hundred chances to be
 * wrong, and converted data has none.
 *
 * Which is also why it is the one document here whose RHYTHM is the tab's own
 * rather than an inference, down to the single 7/8 bar at bar 11.
 *
 * Sections are named with the transcription's bar numbers so a section and a
 * page of the tab are the same thing, and the solo is cut into four parts
 * rather than left as one twenty-nine bar block — it is a long song, and a
 * long song is learned a piece at a time.
 */

/* ================================================================== */
/* CHOO LO — the outro solo, bars 117-137                             */
/* ================================================================== */

const CHOO_LO = {
  id: "tab-choo-lo",
  meta: {
    title: "Choo Lo — the outro solo",
    artist: "The Local Train · transcription, converted from tab",
    key: "B",
    mode: "major",
    scaleId: "major",
    songIds: ["n87"],
    capo: 0,
    source:
      "songsterr.com/a/wsa/local-train-choo-lo-tab-s735489 — bars 117-137, converted from the " +
      "player's own note data, so every fret, duration and bend below is the transcription's " +
      "rather than a reading of a picture of it. The chord under each bar is read off the bass " +
      "track of that same transcription, which walks the root on every beat and leaves no doubt.",
    note:
      "B major, and in twenty-one bars there is exactly one note from outside it — the D natural " +
      "passing through bar 120 on its way back to C#. Everything else is the plain major scale, " +
      "which makes this the best solo here for hearing what the CHORDS are doing rather than what " +
      "the scale is. Two things to watch for. First: bars 125-127 are bars 117-119 again an octave " +
      "up — the same E, the same full-step bend off it, the same drop to C# — so learning the first " +
      "phrase buys you most of the second. It is not a literal copy: the octave version trims one " +
      "repeated note in each of the last two bars, and bar 128 gives up the descent for two long " +
      "Bs. Second, and this is the real lesson: the loop underneath is E-B-A-B then C#m-B-A-B, so " +
      "the same few notes keep changing job as it turns. The E you hold in bar 117 is the root of " +
      "the chord under it. In bar 118 the same E is the 4th. In bar 119 it is the 5th. One note, " +
      "three meanings, and nothing moved but the band. The sharpest moment in the solo is bar 131, " +
      "where the D# lands six semitones over the A — a #11, which the degree ring spells b5, and " +
      "either way the one properly sour note in twenty-one bars. " +
      "Then watch what becomes of it: bar 132 holds that same D# while the chord turns to B, where " +
      "it is the major 3rd and suddenly sweet, and only then does it step up to E and stay there " +
      "for five bars. Dissonant, consonant, resolved — one note doing all of it.",
  },
  tempo: [{ atBeat: 0, bpm: 146 }],
  timeSig: [{ atBeat: 0, num: 4, den: 4 }],

  // Labelled with the tab's OWN bar numbers, so a section looped here is
  // findable on the page it came from.
  sections: [
    at("c117", "117-118", "the E, and the first full bend", 0, 8),
    at("c119", "119-120", "the answer, down to the B", 8, 16),
    at("c121", "121-123", "the long B, held over the bar line", 16, 28),
    at("c124", "124", "the G#-B shake", 28, 32),
    at("c125", "125-128", "the same phrase, an octave up", 32, 48),
    at("c129", "129-131", "the D# figure, back down low", 48, 60),
    at("c132", "132-137", "D# to E, and out", 60, 84),
  ],

  // I-IV-bVII-ii in B major, one chord per bar, twice round; then the ending
  // slows to two bars a chord. Taken from the bass track's roots.
  harmony: [
    ...cycle(["E", "B", "A", "B", "C#m", "B", "A", "B"], 1, 16),
    { atBeat: bar(17), chord: "E" },
    { atBeat: bar(19), chord: "B" },
    { atBeat: bar(21), chord: "A" },
  ],

  notes: [
    /* --- 117 — the E, and the first full bend ------------------- */
    // G string 9 is E, 11 is F#; the bend takes that F# a whole step to G#.
    N(0, 2, 9, 2.5, { accent: true }),
    N(2.5, 2, 11, 0.5, bend(2)),
    N(3, 2, 11, 0.5, release(2)),
    N(3.5, 2, 9, 0.5),

    /* --- 118 — the same bend, given a whole bar ----------------- */
    N(4, 2, 11, 2, { accent: true }),
    N(6, 2, 11, 1, bend(2)),
    N(7, 2, 11, 0.5, release(2)),
    N(7.5, 2, 11, 0.25),
    N(7.75, 2, 9, 0.25),

    /* --- 119 — the answer, one note dropped to the D string ----- */
    // The 11 at beat 10.5 is on the D string: C#, an octave below the C# that
    // turns up in the same place in bar 127.
    N(8, 2, 11, 0.5),
    N(8.5, 2, 9, 0.5),
    N(9, 2, 9, 1.5),
    N(10.5, 3, 11, 0.5),
    N(11, 2, 9, 0.5),
    N(11.5, 2, 11, 0.5),

    /* --- 120 — down to the B ------------------------------------ */
    // The 7 is a D natural — the one accidental in the whole solo, and it is
    // gone in a sixteenth.
    N(12, 2, 6, 1),
    N(13, 2, 6, 0.5),
    N(13.5, 2, 7, 0.25),
    N(13.75, 2, 6, 0.25),
    N(14, 2, 4, 2),

    /* --- 121-123 — the long B ----------------------------------- */
    // Bent up and left there: the tab bends and never marks a release, so the
    // pitch stays at C# under the notes that follow.
    N(16, 1, 12, 3, { ...bend(2), accent: true }),
    N(19, 1, 12, 0.5),
    N(19.5, 1, 12, 3),
    N(22.5, 2, 11, 0.5),
    N(23, 1, 9, 0.5),
    N(23.5, 1, 12, 0.5),
    N(24, 1, 12, 2, bend(2)),
    N(26, 1, 12, 2),

    /* --- 124 — the shake ---------------------------------------- */
    // Straight eighths alternating B string 21 (G#) with high E 19 (B).
    N(28, 1, 21, 0.5),
    N(28.5, 0, 19, 0.5),
    N(29, 0, 19, 0.5),
    N(29.5, 1, 21, 0.5),
    N(30, 0, 19, 0.5),
    N(30.5, 1, 21, 0.5),
    N(31, 0, 19, 0.5),
    N(31.5, 1, 21, 0.5),

    /* --- 125-128 — bars 117-119 again, an octave up -------------- */
    // B string 17 is the same E as G string 9; the 17-to-19 bend is the same
    // whole step as 9-to-11 was. Then it moves to the top string and does bar
    // 118 and 119 up there too, before simplifying into two long Bs.
    N(32, 1, 17, 2.5, { accent: true }),
    N(34.5, 1, 19, 1, bend(2)),
    N(35.5, 1, 19, 0.25),
    N(35.75, 1, 17, 0.25),

    N(36, 0, 14, 2, { accent: true }),
    // Bar 118 bent this and let it back down; up here the tab bends and holds.
    N(38, 0, 14, 1.5, bend(2)),
    N(39.5, 0, 14, 0.25),
    N(39.75, 0, 12, 0.25),

    N(40, 0, 14, 0.5),
    N(40.5, 0, 12, 1),
    N(41.5, 0, 12, 1),
    N(42.5, 1, 14, 0.5),
    N(43, 0, 12, 1),

    N(44, 0, 19, 2, { accent: true }),
    N(46, 0, 19, 2),

    /* --- 129-131 — the D# figure -------------------------------- */
    // G string 8 is D#. Bar 131 sits on it over the A chord, where it is the
    // #11 — the one genuinely dissonant colour in the solo.
    N(48, 2, 8, 3, { accent: true }),
    N(51, 2, 8, 0.5),
    N(51.5, 2, 8, 3),
    N(54.5, 2, 6, 0.5),
    N(55, 2, 8, 0.5),
    N(55.5, 2, 9, 1),
    N(56.5, 2, 8, 0.5),
    N(57, 2, 9, 0.5),
    N(57.5, 2, 11, 1),
    N(58.5, 2, 9, 0.5),
    N(59, 2, 11, 1),

    /* --- 132-137 — D# to E, and out ----------------------------- */
    // B string 4 is D#, the third of the B chord under it; B string 5 is E,
    // the root of the E chord it lands on. Five bars of one note.
    N(60, 1, 4, 4),
    N(64, 1, 5, 20),
  ],
};

const SLOW_DANCING = {
  id: "tab-slow-dancing",
  meta: {
    title: "Slow Dancing in a Burning Room — Live in LA",
    artist: "John Mayer · transcription, converted from tab",
    key: "Db",
    mode: "dorian",
    scaleId: "dorian",
    songIds: ["m33"],
    capo: 0,
    source:
      "songsterr.com/a/wsa/john-mayer-slow-dancing-in-a-burning-room-live-in-la-tab-s678154 — " +
      "converted from the player's own note data, so the frets, the durations and the techniques " +
      "are all the transcription's. The chord changes are read off its bass notes.",
    note:
      "Db (C#) Dorian, and the natural 6 is the whole sound — that Bb against the C# minor is " +
      "what stops this being an ordinary minor blues. The body vamps C#m7 to E a bar each; the " +
      "chorus lifts to B and A. Learn it in the order the sections are listed: the intro riff " +
      "teaches the thumb-over shapes everything else reuses, and the solo is cut into four so " +
      "you can own one before starting the next. Bar 11 is in 7/8 — count it, do not feel it.",
  },
  tempo: [{ atBeat: 0, bpm: 72 }],
  timeSig: SLOW_DANCING_TIMESIG,
  sections: SLOW_DANCING_SECTIONS,
  harmony: SLOW_DANCING_HARMONY,
  notes: SLOW_DANCING_NOTES,
};

/* ================================================================== */

export const SEED_TABS = [PURPLE_RAIN, NOVEMBER_RAIN, GENTLY_WEEPS, ALONE, CHOO_LO, SLOW_DANCING].map(
  normaliseSolo,
);

/** Transcriptions entered for a given song in the library. */
export const tabsForSong = (songId, list = SEED_TABS) =>
  list.filter((t) => (t.meta.songIds || []).includes(songId));

export const loadTabs = () => {
  try {
    const raw = localStorage.getItem(KEY);
    const saved = raw ? JSON.parse(raw) : null;
    if (Array.isArray(saved) && saved.length) {
      const list = saved.map(normaliseSolo);
      const ids = new Set(list.map((t) => t.id));
      // New seeds appear without touching anything you have edited.
      return [...list, ...SEED_TABS.filter((t) => !ids.has(t.id))];
    }
  } catch {
    /* storage blocked or corrupt — the seeds are always enough */
  }
  return SEED_TABS;
};

export const saveTabs = (list) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
};

export { soloEndBeat };
