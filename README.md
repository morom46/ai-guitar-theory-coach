# Guitar Theory Coach

> Music is the language. The guitar is the dumb machine. This app decodes the machine.

An interactive theory lab for guitarists, built around one idea: **every pitch on the
neck is defined by its distance from the Tonic (the Sun)**. The app walks the six
levels of pitch — Silence → Note → Intervals → Scales → Chords → Harmony — on a
real, playable fretboard rendered as an engineer's blueprint.

## Feature 01 — The Fretboard Decoder

A 15-fret, standard-tuning neck you can interrogate through five lenses:

| Mode | Level | What it shows |
| --- | --- | --- |
| **Notes** | Lv 2 | Every note name on the neck; the tonic glows orange |
| **Intervals** | Lv 3 | Each note labelled by its distance from the root; the tritone flagged red |
| **Scales** | Lv 4 | 10 scales (modes, harmonic minor, pentatonics) as number-system degrees |
| **Chords** | Lv 5 | 8 chord qualities shown as stacked thirds across the whole neck |
| **Harmony** | Lv 6 | The diatonic chords of the key (I–vii°) lit up inside the dimmed key map |

Plus:

- **Tap any node to hear it** (Web Audio synth) and get a full spec readout —
  interval name, semitone distance, frequency in Hz, MIDI number, string/fret
  position, and the interval's emotional colour.
- **Correct enharmonic spelling per key** — D♭ major says D♭, not C♯.
- **The cyan node is always the 3rd** — the single tone that decides major vs. minor.
- A "why" card that explains the theory behind whatever lens you have open.

## Feature 02 — Chord Builder

A chord is not a shape you memorise; it is thirds stacked out of a scale. Pick a root
and a quality, watch the chord get built one third at a time, hear it, and see every
place its tones live across a full 24-fret neck.

- **8 chord qualities** — major, minor, dominant 7, major 7, minor 7, diminished,
  half-diminished (m7♭5), augmented.
- **Colour-coded roles** — root (orange), third (cyan), seventh (violet), other tones
  (blue). The third's colour tells you major vs. minor at a glance.
- **Stacked-thirds anatomy** — a card breakdown shows each tone, its interval name,
  and the third that connects it to the previous tone.
- **Tap any node** to hear it and see its full spec.
- **Practice Panel** — one-click YouTube backing tracks and a curated song list for
  the current key, so you can take the chord shapes straight to real music.

## Feature 03 — Number System

Stop thinking in letters; think in numbers. A I–IV–V is the same shape in every key.
This section trains the Nashville number system: degrees 1–7, the diatonic chords that
sit on them, and translating freely between number and name.

- **Diatonic map** — the full I–vii° chord table for any key, with quality (maj/min/dim)
  and the formula shown for each degree.
- **Drill mode** — two directions: *number → chord name* and *chord name → number*,
  with scoring, streak tracking, and a personal best saved to localStorage.
- **Playback** — tap any row to hear the triad arpeggiated; the tonic always plays
  first to anchor your ear to the key.
- **Practice Panel** — same backing-track and song shortcuts as Chord Builder.

## 🎧 Ear Trainer

Same theory engine, pointed at the ear instead of the eye. Two drills:

- **Intervals** — hear root → note, name the interval (all 12, ascending).
- **Degrees** — hear the tonic establish the key, then a single note; name its
  Nashville number.

Score, streak, and personal best tracked per drill (localStorage). The challenge
replays on demand so you can listen as many times as you need.

## 🎵 Song Practice

An offline, local song library that maps your real repertoire onto the fretboard.

- Each song stores a **key + base soloing scale** (minor pent, major pent, Aeolian,
  Dorian, Mixolydian, …); the neck lights those notes.
- **Vocabulary panel** — toggle individual in-between notes (blue notes, passing
  tones, mode colours) with a tip explaining what each one adds to your phrasing.
- **Fretboard position box** — drag to focus any 4-fret window on the neck.
- **Rainbow mode** — colour nodes by scale degree instead of role.
- **Fully offline** — all data lives in localStorage. Import / export JSON so you can
  have an AI generate a song list and paste it straight in.
- Ships with seven seed songs (Led Zeppelin, Mac Miller, Dire Straits, Guns N' Roses,
  …); add your own anytime.

### Practice links

At the foot of the page: pick a key and get **backing tracks** and **songs commonly in
that key**, each linking out to a YouTube or Ultimate-Guitar search. It starts on the
selected song's key. Every link is an outbound search — no account, no API key, nothing
that can stop working.

## ✦ The Solo Player

A solo played back on the fretboard in time — a note highway that is a *theory* tool
underneath. Every ring is coloured by what the note is doing **against the chord
underneath it**, so the same fingering visibly changes meaning when the harmony moves.
That is the whole point: the shapes are not the lesson, the intervals are.

Watch / Silent practice modes, step mode (one note per keypress, no clock), A/B loop
with one-tap "loop this section", 25–100% speed, a 1–2 bar count-in on the shared
click, and a "why this note" inspector that reads straight out of the theory engine.

Four solos ship with it, all entered by hand from published tabs:

| Solo | Key | Notes |
| --- | --- | --- |
| **Purple Rain** — Prince, outro | Bb major | 16 sections, one per timestamped block of the tab (3:46–6:13) |
| **November Rain** — Slash, outro | C minor *as written* | Source tab is tuned down a half step; see the tuning rule below |
| **While My Guitar Gently Weeps** — Prince, live 2004 | A minor | The Rock'n'Roll Hall of Fame solo, 22 phrases, standard tuning |
| **Alone** — Howard Leese | F# major | Eight bars over vi–IV–I–V |
| **Slow Dancing in a Burning Room** (Live in LA) — John Mayer | Db Dorian | The **whole 87-bar arrangement**, ten sections, the solo cut into four |

Slow Dancing is the odd one out and the only content here that is not hand-entered: Songsterr's
player fetches its own note data as JSON, so that was captured and converted
([`src/data/tab-slow-dancing.js`](src/data/tab-slow-dancing.js)). Every fret, duration and
technique is the transcription's — which is the only reason a document that size can be
trusted, and why it is the one that carries the whole song rather than a solo.

**Long documents get named, not crowded.** A solo over a real song's vamp has a
four- or eight-bar loop played twenty times, not seventy-five different chords, so the
timeline draws every change as a tick but only labels them while the labels can still be
read; underneath it, `harmonyLoop()` names the loop once. Section names are clipped to
their own slot on the ribbon and the current one is spelled out in full beside the bar
counter, so a 22-section document stays navigable.

### One library, on purpose

The page used to carry three shelves: original etudes, these transcriptions, and song
**charts** (a song's form — sections and chord changes, no notes — to improvise over).
The etudes and the charts are gone. They were answering a question nobody was asking,
and a page that does one thing does not need shelf buttons, a second neck mode, a chart
grid, or a `meta.kind` field in the schema to tell its documents apart. All of that came
out with them; what is left is the note highway and the things that serve it.

**It plays through your amp.** The tone you dialed for the song on Songs & Tones drives
the playback: drive off the voice and gain knobs, mid and presence off the ISF, a cabinet
that closes down as the gain comes up, and whatever mod/delay/reverb the panel has lit.
The panel is drawn under the transport with an **Amp on/off** toggle, so you can hear what
it is doing. The mapping lives in [`src/audio/amp.js`](src/audio/amp.js) as a pure
function and is unit tested; the nodes are built once per tone, never per note. Only the
Solo Player routes through it — tapping a note on any other page stays on the clean
string, because an ear-training drill wants a reference pitch.

**The tempo control is in BPM**, not per cent, and reaches past the written tempo as well
as below it (25%–200%), with a one-click button back to the record's. The metronome in the
transport bar follows it, and opening a different solo resets to that song's own tempo.

**In position** (on by default) limits the ghosted scale underneath the phrase to one
five-fret box, taking the underlay from 65 dots to about 12. The note highway is
unaffected — it always draws the whole phrase, in or out of the box. The transport is one
row (play, step, speed, Watch/Silent) with loop, count-in and display options folded
behind **More**.

**Why a transcription needs its own file.** A key, a tempo and a chord sequence are facts
about a piece of music; a note-for-note copy of somebody's recorded solo is a derivative
work of their performance. Every solo here is the second thing, entered for personal
practice, and they live in [`src/data/tabs.js`](src/data/tabs.js) and nowhere else. Each
carries "transcription" in its artist line so the player can never present it as anything
but what it is, the file is imported in exactly two places, and it is the one file to
delete before this repo is made public.

**`meta.source` says where the frets came from.** These are entered from published tabs, so
the thing worth recording is *which* tab — shown as one quiet line under the teaching note,
along with whatever the tab did not itself state (usually the rhythm and the chords
underneath). This replaced a `verified`/`unverified` pair that flew a warning banner over
every document; the warning was answering a question nobody was asking of a tab off a tab
site, and it buried the provenance under an alarm.

November Rain adds one more line to that list, because its source tab is written for a
guitar **tuned down a half step**. (The other three are standard tuning and need none of
this.) The frets are the tab's, unchanged — tune down and
they are right against the record. But the schema's `tuningMidi` is not enough on its
own: `<Neck>` and the box finder in `theory/positions.js` both draw standard tuning, so
declaring Eb there would put the ghosted scale a fret away from the notes on the highway.
So the key is named by the **shapes**: the app says C minor, and a guitar tuned down
turns those shapes into the B minor you hear. Every interval, degree and colour is
identical either way; only the letters move.

### The schema — `src/data/soloSchema.js`

A solo places notes in **beats**, never seconds. Seconds are derived through the tempo
map at schedule time, which is what makes speed control and tempo changes free.

```js
{
  meta: {
    title, artist,
    key: "A", mode: "aeolian", scaleId: "minorPent",
    tuningMidi: [64, 59, 55, 50, 45, 40],   // open strings, HIGH to LOW
    capo: 0,
    note: "what this one teaches",
  },
  tempo:   [{ atBeat: 0, bpm: 92 }],          // a map: tempo changes are supported
  timeSig: [{ atBeat: 0, num: 4, den: 4 }],
  sections:[{ id, name, startBeat, endBeat }],
  harmony: [{ atBeat: 0, chord: "Am7" }],     // drives the colouring over time
  notes:   [{
    id, startBeat, durBeats,
    string: 0,          // index into OPEN_MIDI — 0 = HIGH E, 5 = low E
    fret: 5,
    technique: "pick" | "hammer" | "pull" | "slide" | "bend" | "release"
             | "vibrato" | "tap" | "harmonic" | "mute",
    slideToFret, bendSemitones,   // technique-specific, null when unused
    finger: 1|2|3|4,              // null when unused
    accent: false,
  }],
}
```

Three conventions worth stating, because getting one wrong is a miserable bug:

- **`string` is an OPEN_MIDI index — 0 is the high E**, not tab's "6 = low E". The
  same convention as `Neck` and `pitch.js`.
- **`tuningMidi` is MIDI numbers, high to low.** Note names were rejected on purpose:
  `["E","A","D","G","B","E"]` and `["E","B","G","D","A","E"]` share a first and last
  entry, and a silently reversed neck is very hard to spot.
- **A beat is a quarter note.** Exact for x/4; 6/8 is stored as six eighth-beats and
  `den` is carried for display only.

Degree and colour are **computed, never stored**: `(string, fret, tuning, capo)` →
pitch class → degree against the active `harmony` entry (falling back to `meta.key`) →
colour from `ui/theme.js`. `normaliseSolo()` fills every optional field so nothing is
duck-typed downstream, and `validateSolo()` separates errors ("cannot draw this") from
warnings ("will draw, but not as you meant"). v1 renders standard tuning only — the
schema carries `tuningMidi`/`capo` for importers, and warns when they go unused.

### The timing model — `src/audio/soloClock.js`

`AudioContext.currentTime` is the only clock, exactly as in `audio/clock.js`:

- a **25 ms timer** looks at the audio clock and books every note inside the next
  **150 ms**. Nothing musical is ever driven by `setTimeout` or a frame counter;
- **`requestAnimationFrame` schedules nothing** — it reads the current beat and draws;
- position is **derived, not accumulated**, from one anchor:

  ```
  transportNow = anchorT + (ctx.currentTime - anchorCtx)
  beatNow      = secToBeat(tempoMap, transportNow)
  ```

Everything visible is a function of that single number, so seeking, looping and speed
changes are consistent by construction. Two consequences worth knowing:

- **Anchors are a queue, not a variable.** The scheduler books the loop jump ~150 ms
  before you hear it. Swapping one anchor in place makes the playhead teleport a beat
  early on every lap; instead, scheduling reads the newest anchor while drawing reads
  the newest anchor whose time has actually *arrived*.
- **Changing speed re-anchors around the held beat.** Rebuilding the tempo map changes
  how many seconds a beat is, so an untouched anchor would point somewhere else
  afterwards — that is the classic audio/visual desync, and `setRate` exists to avoid
  it. Seeks, loop jumps and speed changes all call `cancelScheduledNotes()`, or the
  150 ms already committed to the audio graph plays over the new timeline.

`test/soloClock.test.js` proves the two things you cannot eyeball: 300 consecutive
loop wraps landing on the analytic answer (3.5 hours of audio, no drift), and a speed
sweep from 100% to 25% moving the playhead by exactly zero.

### Rendering — `SoloOverlay.jsx`

The note highway is **one canvas**, added through `Neck`'s `overlay` prop. It is not
drawn with `Neck`'s own nodes because `resolve` runs inside React's render and is keyed
by pitch class: it cannot tell two simultaneous events apart, and driving it per frame
would re-render 150 DOM nodes 60 times a second. There are no CSS or SVG filters
anywhere — `feGaussianBlur` and `shadowBlur` are what take a mid-range phone off 60fps,
so the bloom is a radial gradient. The neck underneath still draws the scale shape, so
the solo reads as a *path through a shape* rather than a row of dots.

### Adding a solo

1. Enter it in [`src/data/tabs.js`](src/data/tabs.js) using the positional
   `N(startBeat, string, fret, durBeats, extra)` helper — a 300-note solo in object
   literals does not get proof-read. Technique helpers (`hammer`, `pull`, `vib`,
   `bend(2)`, `release(2)`, `slide(7)`) spread into `extra`. **`string` is 0 = high E**,
   the other way up from a tab stave, so convert once on the way in.
2. Write any figure the tab repeats as a function of the beat it starts on, the way
   `shakeFromBb` and `nrTheme` are. Typing a lick out five times is where a wrong fret
   gets in and stays in.
3. Add it to `SEED_TABS`. It appears in the picker; user edits in `localStorage`
   (`tabs.v1`) are merged over the seeds, so new seeds never wipe saved work.
4. `npm test`. `test/tabs.test.js` checks what a typo actually breaks: nothing off the
   neck, no two notes stacked on one string at one beat, no note outside its own
   section, sections end to end, every chord parseable, and — the one that catches a
   whole-file mistake — that the string index has not quietly flipped to tab numbering.

Two things a transcription owes you on top of that: keep `verified: false` with an
honest `unverified` list, since a tab states no rhythm and no chords; and label each
section by where it is on the record (a timestamp where the tab gives one, a phrase
number where it does not) so you can loop a phrase and then find it.

**Reading a source that is a picture rather than text costs you two things**, and both
need pinning down before you write a note:

*Which order the pages go in.* Pages do not sort themselves, and a solo reassembled out
of order is wrong in a way nothing can catch later. Gently Weeps asserts its 22 sections
run 1 to 22 in sequence.

*Which string each number sits on.* An ASCII tab tells you; a rendered one makes you
infer it from which line a digit is drawn on, and being one row out turns every note into
a different note while still looking perfectly plausible. Two things pin it, and Alone
used both: a correct reading of a diatonic solo lands entirely inside one scale (a
misread row does not), and any chord stacks in the same image should read out as the
song's known progression on the same grid. `test/tabs.test.js` keeps the first of those
as a permanent assertion — every note of Alone is in F# major, so a disturbed
transcription fails loudly.

Anything that produces this shape can feed the player, so an importer only has to emit
the schema — `normaliseSolo()` handles the rest.

## Run it

```bash
npm install
npm run dev
```

Then open the printed local URL (Vite defaults to `http://localhost:5173`).

To build for production:

```bash
npm run build
npm run preview
```

## Project structure

```
src/
  theory/engine.js                  the single theory engine — pitch classes,
                                    intervals, scales, chords, enharmonic
                                    spelling, MIDI/frequency math
  audio/engine.js                   one AudioContext for the whole app
  audio/clock.js                    the metronome's lookahead scheduler
  audio/soloClock.js                ✦ the solo sequencer — same discipline
  audio/pitch.js                    pitch detection (tuner, ear drills)
  data/soloSchema.js                ✦ the Solo schema, tempo map, validation
  data/tabs.js                      ✦ the solo library — real solos entered
                                      from a tab (see the content policy)
  components/
    FretboardDecoder.jsx            Feature 01 — the interactive neck
    ChordBuilder.jsx                Feature 02 — stacked-thirds chord explorer
    NumberSystem.jsx                Feature 03 — Nashville number system map + drill
    EarTrainer.jsx                  🎧 interval & degree recognition drills
    SongPractice.jsx                🎵 offline song library on the fretboard
    SoloPlayer.jsx                  ✦ solo playback page — transport, modes, inspector
    SoloOverlay.jsx                 ✦ the note highway (one canvas, no React per frame)
    Neck.jsx                        the one shared fretboard (+ `overlay` slot)
    PracticePanel.jsx               backing-track & curated-song links, per key
  App.jsx                           app shell — tab nav, section routing
  main.jsx                          entry point
```

The theory engine is deliberately separated from the UI: every feature consumes the
same primitives, so the music theory is defined exactly once.

## Tech

React 19 + Vite. No runtime dependencies beyond React — audio is raw Web Audio API.
No backend, no accounts, no third-party APIs: the app is a static bundle that keeps
everything in your own browser's localStorage.
