# Guitar Theory Coach — Project Overview & Handoff

> Drop this file + the project folder into a new chat for full context.
> Last updated: 2026 (after the metronome + microphone build).

A browser-based, **static** (no backend) app that teaches guitar theory and helps
practice soloing, all driven by one music-theory engine. Built with **React 19 + Vite 6**,
plain CSS, and the Web Audio API. Visual identity: AMOLED black, monospace "blueprint",
orange "Sun" = root/tonic, cyan = 3rd, blue = other tones.

Live site: https://morom46.github.io/ai-guitar-theory-coach/ (deploys via GitHub Actions).
Repo: github.com/morom46/ai-guitar-theory-coach (owner: morom46).
Local path (Windows): C:\Users\arind\OneDrive\Desktop\Moromstudy\ai-guitar-theory-coach

---

## How to run / build / deploy

- `npm install` then `npm run dev` → open the printed URL (note Vite's base path, below).
- `npm run build` → production bundle in `dist/`.
- Deploy: pushing to `main` triggers `.github/workflows/deploy.yml`, which builds and
  publishes to GitHub Pages. Pages **Source must be "GitHub Actions"** (Settings → Pages).
- `vite.config.js` sets `base: "/ai-guitar-theory-coach/"` so asset URLs resolve under the
  GitHub Pages project subpath. (Local dev URL therefore includes that subpath too.)

---

## Tech stack & structure

```
src/
  main.jsx                 React entry
  index.css                app shell + nav styles (palette here too)
  theory/engine.js         THE shared music-theory engine (no UI)
  theory/modes.js          the brightness ladder — one-note steps between modes
  theory/voicing.js        inversions + the nearest-voicing solver (voice leading)
  theory/voicings.js       the SHAPE solver — playable chord fingerings, from the tuning
  theory/positions.js      pentatonic/CAGED boxes + sequence patterns (3s, 4s, thirds)
  theory/harmony.js        chord function, pull weights, tritone subs, borrowed chords
  audio/
    engine.js              THE shared audio engine — one AudioContext, 2 voices
    clock.js               Metronome class + pure timing maths (no React)
    useMetronome.jsx       MetronomeProvider / useMetronome / useMetronomeBeat
    drone.js               the sustained tonic — voice, state, mic ref-count
    useDrone.js            useDrone / useDroneFollow
    pitch.js               microphone + MPM pitch detector + note maths
  data/progress.js         per-item practice record + the weighted question picker
  data/soloSchema.js       THE solo schema — tempo maps, validation, degrees
  data/tabs.js             THE solo library — real solos entered from a tab; see policy
  data/tab-slow-dancing.js the one GENERATED data file — 87 bars converted from Songsterr
  audio/amp.js             your rig as a signal chain — tone knobs -> drive/EQ/cab/fx
  audio/soloClock.js       the solo sequencer: anchor queue on the audio clock
  App.jsx                  top nav (taskbar) + section router + TransportBar
  components/
    FretboardDecoder.jsx   Lesson 01 — the keystone
    ChordBuilder.jsx       Lesson 02 — four tabs (build / stack / voice leading / gravity)
    StackIt.jsx            02 · build a chord yourself + the 9-11-13 stack
    VoiceLeading.jsx       02 · root position vs nearest voicing, drawn and played
    ChordGravity.jsx       02 · the gravity map, the tritone, and the resolve drill
    NameIt.jsx             02 · the engine backwards — notes→chord, chord↔scale, note→chords
    ScaleLab.jsx           Lesson 04 — shell + relative⇄parallel + why pentatonic is safe
    ScaleFormula.jsx       04 · walk the W–H recipe on one string; name that scale
    IntervalShapes.jsx     04 · the neck's geometry, and the G–B exception
    CircleOfFifths.jsx     03 · the circle as a machine (shared notes, pivots)
    TargetPractice.jsx     Live · land on the chord tones, judged by the mic on the click
    ScalePositions.jsx     04 · the boxes, and a sequence runner on the metronome
    ChordDiagram.jsx       the chord box — a shape you can grab, drawn from the solver
    WeakSpots.jsx          the practice log: what you keep missing, per drill
    SoloPlayer.jsx         ✦ Solo tab — play a phrase back where your hands go
    SoloOverlay.jsx        the note highway drawn over the shared Neck
    NumberSystem.jsx       Lesson 03
    EarTrainer.jsx         Practice (🎧 icon, no number)
    SongPractice.jsx       Practice (🎵 icon) — offline song library w/ sections
    PracticePanel.jsx      backing-track + song-search links (foot of Songs & Tones)
    TransportBar.jsx       the metronome, docked to every page
    ListenPage.jsx         🎤 tab — tuner + "find the note" mic drill
test/
  engine.test.js           theory engine (vitest)
  harmony.test.js          voice leading, chord gravity, identifyChord
  scales.test.js           step patterns, tension maps, interval shapes, the circle
  voicings.test.js         the shape solver — including that it rediscovers x32010
  progress.test.js         the Leitner weighting and the practice log
  soloSchema.test.js       tempo maps, chord parsing, validation, the bundled content
  tabs.test.js             the transcriptions — the checks a hand-entered typo trips
  soloClock.test.js        the sequencer's anchor maths, with no audio device
  pitch.test.js            pitch detector, in cents, across the whole range
  clock.test.js            metronome scheduling maths
  browser-smoke.mjs        drives the real app in Chromium (needs playwright)
.github/workflows/deploy.yml   Pages CI
vite.config.js, index.html, package.json
```

### The theory engine (`src/theory/engine.js`)
One source of truth consumed by every component. Exports include:
`ROOTS` (12 preferred note names), `DEG` (semitone→Nashville number e.g. 3→"b3"),
`INTERVALS` (now to the 13th, so extended chords can name their tones), `SCALES`
(major, the modes, harmonic minor, both pentatonics, **blues, melodic minor, lydian
dominant, altered, harmonic major, whole-half diminished** — each has `ints` + `name`
+ `formula`), `CHORDS` (**19 qualities**: triads, sus, 6ths, sevenths, dim7 and the
9/11/13 extensions, grouped by `CHORD_FAMILY`), `DIATONIC` + **`DIATONIC_MINOR`**
(each degree tagged with its function `fn` — T/S/D — and a one-line `why`),
`KEY_MODES`, `OPEN_MIDI` (standard tuning, string1=high E .. string6=low E),
`FRETS` (= 24), and helpers `noteNameToPc`, `buildNoteNames` (enharmonic-correct per
key), `midiToFreq`, `majorScaleSpelling`.

Scales as recipes and the neck as geometry: `stepPattern` / `stepLabel` /
`formulaOf` (the W–H formula derived from the intervals, not typed),
`tensionMap(scale, chord)` (what each degree is doing against the tonic chord, and
which side it leans from), `tritonePairs`, `smallestGap`, `intervalShapes` /
`shapeSummary` (fret offsets per string pair, from which the G–B exception falls
out), `CIRCLE_OF_FIFTHS` + `circleDistance`, `keySignature`, `keyNames` (a minor key
spells itself from its relative major), and `noteAgainstChord` / `landingVerdict`
(the chord-tone drill's judgement, as a pure function).

Notes→name and back: **`identifyChord(pcs, {bassPc})`** names a set of
pitch classes including inversions and slash chords, `chordPcs`, `chordToneLabel`,
`pcName` (with an optional flat/sharp preference), `chordsIn(scale)`,
`scalesContaining(pcs)`, `diatonicChords(tonicPc, mode)`, `chordsContaining(pc, …)`
and `tritoneOf(root, quality)`.
**No music logic is hardcoded in components** — it all derives from the engine.

### Voice leading (`src/theory/voicing.js`)
`invert` / `inversions`, `rootPosition`, `candidateVoicings`, `distance`,
`nearestVoicing`, `voiceLead`, `motion`, `totalMotion`, `commonTones`,
`inversionOf`. The solver enumerates every octave placement of a chord inside a
register and keeps the one that moves least from the previous chord — that is all
"good voice leading" mechanically is, and it makes inversions self-explanatory.

### Harmony (`src/theory/harmony.js`)
`PULL_MAJOR` / `PULL_MINOR` (weighted, annotated pull edges between degrees),
`pullsFrom` / `pullsTo` / `resolutionOf`, `gravityMap`, `dominantOf` (a minor key
gets the harmonic-minor V7, because natural minor's v cannot pull),
`secondaryDominant`, `tritoneSub`, `tritoneResolution`, `borrowedChords`.

---

## Features (each page)

### Nav / taskbar (App.jsx)
Four numbered lesson tabs: **01 Fretboard Decoder · 02 Chord Builder · 03 Number
System · 04 The Scale Lab**.
Then a distinct accent **▶ LIVE** tab, a divider, and three icon-only buttons:
**🎵 Song Practice**, **🎧 Ear Trainer**. Active state via `aria-current="page"`.

### 01 — Fretboard Decoder (`FretboardDecoder.jsx`) — keystone
A 24-fret neck (standard tuning) that decodes pitch through modes:
- **Modes (top tabs):** Notes, Intervals, Scales, Chords, Harmony, **Modes**, **Progression**.
  - Scales: pick root + scale, lights the scale (number-system labels).
  - Chords: pick root + quality.
  - Harmony: diatonic triads of the key, now with a **major / natural-minor
    switch** (I ii iii IV V vi vii° · i ii° ♭III iv v ♭VI ♭VII), each chord labelled
    with its function. Minor-key songs are finally explainable here.
  - **Modes:** parent-key/movable-tonic view — same 7 notes, move the nucleus; modes are
    listed **in degree order Ionian→Locrian (1–7)**; each mode's characteristic note is
    highlighted violet (Lydian shows "#4").
  - **Progression:** loops a chord progression (incl. "I–IV (mode jam)"); same notes, the
    Sun jumps to each chord's root. Tempo slider, play/stop.
- **Toggles (top-right):** `⇅` flip string order (default **EADGBE**, low-E on top),
  `⤢ fit` (compress 24 frets to screen width via ResizeObserver), `🌈 colors`
  (Roy-G-Biv degree colours, root = red), `▢ box` + slider (lock one 5-fret box),
  `♪ sound`.
- **Spec readout** + **"why"** card; tap any node to hear it (Web Audio pluck).
- Minimal animated **tooltips** (ⓘ) at key labels.

### 02 — Chord Builder (`ChordBuilder.jsx`) — four tabs
**Build a chord** — the original: pick root + quality (19 of them, in three family
rows); shows the chord as **stacked thirds** (cards with number/note/interval and the
M3/m3 gaps), every chord-tone location on a 24-fret neck (low-E top), strum +
arpeggiate + per-tone playback.

**Stack it yourself** (`StackIt.jsx`) — the same lesson backwards. The app asks for
"a seventh chord on degree 5", you tap degrees out of the key, and `identifyChord`
names what you actually built — including when it isn't what was asked for. Dominant
answers get their tritone pointed out. Second half: a slider that keeps stacking
thirds (7 → 9 → 11 → 13) with the chord tones lit and the rest of the scale greyed
out, until at the 13th the chord has swallowed all seven degrees. Streak in
`stack.best`.

**Voice leading** (`VoiceLeading.jsx`) — the same progression twice on one shared
pitch axis: root position everywhere vs each chord taking the placement nearest the
last. C–Am–F–G is 43 semitones of movement against 9. Held common tones draw a flat
orange line through the chord change; each column is labelled with the inversion it
landed in. Play either side or both back to back, in major or minor, triads or 7ths.

**Name it** (`NameIt.jsx`) — the engine run backwards, all on one tapped neck.
Tap notes and it names the chord, using the lowest note as the bass, so inversions
and slash chords come out by themselves ("C/E · 1st inversion — 3rd in the bass");
ambiguous sets list their other readings. Tap a single note instead and it lists
every diatonic chord that note has a home in, with its job in each. Beside it,
every scale that contains the chord, tightest fit first — click one to light it
hollow behind the chord tones. Below, every chord that fits the chosen scale,
grouped by degree; click one and it lands on the neck as a playable shape, which
feeds straight back into the namer.

**Chord gravity** (`ChordGravity.jsx`) — why one chord follows another. A map of the
seven diatonic chords coloured by function (T/S/D) with weighted arrows out of the
selected one, each pull listed with its strength, its reason and a play button.
Then: **secondary dominants** ("aim a V7 at it"), **the tritone** — the two notes
that do the work, resolved inward by a semitone each, with a ⇄ switch to its tritone
substitute — **borrowed chords** from the parallel minor, and **the resolve drill**:
the app plays a dominant 7th in a random key and you answer with the tonic, either by
playing it (the microphone judges it) or by tapping it. Streak in `gravity.best`.

### 03 — Number System (`NumberSystem.jsx`)
**Key map** (1–7 → note + diatonic chord + roman numeral, tap to hear) and a **Drill**
(random key each question, "number→chord" and "chord→number", scoring + best streak in
localStorage `ns.best`). (PracticePanel embed removed — now on the ♫ page.)

**The circle** (`CircleOfFifths.jsx`) — the circle of fifths as a machine rather than
a poster. Outer ring major with key signatures, inner ring the relative minor. Click
any two keys and it answers: how many notes they share and which, what changes ("F
leaves, F♯ arrives"), the chords both keys contain with their roman numeral in each,
and the best pivot chord to modulate through — then plays I → pivot → V7 → I so you
hear the seam disappear. Distant keys are told the truth: nothing shared, nothing to
pivot on, you have to cut.

### Ear Trainer (`EarTrainer.jsx`) — 🎧
Two drills: **Intervals** (root→note, name the interval) and **Scale degrees** (tonic→note,
name the number). Multiple choice, score/accuracy/streak, best streak in `et.best`.

### Song Practice (`SongPractice.jsx`) — 🎵, fully offline
Local song library (localStorage `songs.v1`, seeded). Each song = `{title, artist, root,
minor, scaleId, extras[], sections?}`. Shows the key's scale on a 24-fret neck (role/🌈
colours, ▢ box). **Sections:** optional `sections:[{name, root, scaleId, pos}]` (Stairway
& Sweet Child seeded); section chips re-light the neck per part, each part's home box glows
sun-dashed. **▦ tabs ↔ ▤ stack** toggle: one big neck per active section, or stacked mini
necks (one per section, inactive ones dimmed). "＋ split into sections" bootstraps
Intro/Verse/Chorus/Solo; ✎ edit for name/root/scale/box (box −1 = none). Songs without
sections behave as before (virtual "Whole song" section). Vocabulary panel follows the
ACTIVE section's scale. load() back-fills seeded sections into saved seed songs.
**Vocabulary panel:** every non-scale "in-between" note as a toggle (blue note, passing
tones, mode colours) with tips — toggled ones appear as dashed violet "spice" notes.
Add/delete songs, import/export JSON. Seeded songs include Stairway, Sweet Child, Sultans,
plus **Good News / Hand Me Downs / Surf (Mac Miller)** and **Knockin' on Heaven's Door (GNR)**.

### 04 — The Scale Lab (`ScaleLab.jsx`) — NEW
Four tabs, all of them things the app could previously show but not let you hear or do.

**Relative ⇄ parallel** — one string, twelve frets, seven dots. Switch to relative
and every dot holds still while the sun slides to the 6th and the numbering
re-counts; switch to parallel and the sun holds still while three dots slide down a
fret. A counter reads *notes that moved / home moved* either way. Seeing which thing
moves is the whole distinction, and the drone is one button away because relative is
inaudible without a tonic under it.

**Why pentatonic is safe** — every degree measured against the tonic chord: chord
tone, or N semitones above/below the nearest one. The two leaning notes (the 4 and 7
in major, the 2 and ♭6 in minor) get a "hear the clash" button and a "drop it"
button. Drop both and the measured panel reports five notes, smallest gap 2
semitones, zero tritones, *this scale is: Major Pentatonic* — and points out that
the two notes you removed were the key's tritone.

**Build it from the formula** — walk W–W–H–W–W–W–H fret by fret on a single string,
where a whole step IS two frets. Wrong taps are named in the formula's own units
("that's a H; the formula asks for W"). Plus the reverse drill: seven notes light
up, name the scale.

**Intervals as shapes** — the shape table for each interval (same string, one string
up, one string across G–B), an anchor you can move anywhere, every partner note lit
and colour-coded, and a tap drill. The one-fret shift across G–B is computed from
the tuning, never hardcoded.

### ▶ LIVE — Live Player (`LivePlayer.jsx`) — Phase 1
Play a song; the fretboard follows the **sections** (intro/verse/solo…).
- **Clock source:** your own **MP3** (local object URL, offline) **or YouTube** (IFrame API,
  needs internet). A `requestAnimationFrame` loop reads the clock and drives highlights.
- Transport: play/pause, seek, **speed 0.5/0.75/1×**, **⟳ loop a section**.
- Sections timeline with playhead + progress; click to jump; fretboard shows the current
  section's scale + box position.
- **Editor:** play the track and tap **⌖ start / ⌖ end** to capture playhead times into a
  section; set each section's root/scale/box; add/delete; import/export JSON. localStorage
  `player.v1`. Seeded with **Pearl Jam — Yellow Ledbetter** (section *times are approximate*,
  meant to be nudged to the user's track).
- **CHORD FOLLOW (new):** each section holds `chords:[{root,q,start}]` (q = engine CHORDS id)
  + optional `cycle` seconds (progression repeats — capture ONE pass, it loops for the whole
  section). A chord lane under the sections timeline shows the progression with live progress;
  clicking a chord seeks to it. Fretboard modes `chords: off / glow / only` — glow keeps the
  scale lit and enlarges/rings the CURRENT chord's tones (chord root=sun, 3rd=cyan,
  7th=violet, others blue; out-of-scale chord tones appear too); only = arpeggio-only view.
  `numbers from: key / chord` re-labels every degree relative to the current chord's root.
  Editor: **＋ ⌖ chord** tap-captures a change at the playhead; per-chord root/quality/time +
  re-capture; cycle input. Seed yl sections a/b/e carry an approximate E–B–A progression
  (cycle 13.5s); load() back-fills chords into saved seeds only if the user has none.

**🎯 LAND ON THE CHORD TONES** (`TargetPractice.jsx`) — the section's chords become
the changes (a section with none gets its key as one chord), the metronome drives
them at N bars per chord, and the microphone judges what you land on. Every strong
beat is classified — chord tone / leaning (a semitone off one) / scale tone /
outside — and explained in a sentence that says WHY it sounded that way. A
beat-by-beat strip keeps the last two dozen landings, with a running percentage and a
streak in `target.best`. The judging is `landingVerdict` in the engine, so it is
unit-tested without a mic. Note the panel says plainly that the CLICK drives it, not
the recording: a mic in the room hears the track too, so practise with the song
paused or on headphones.

### The metronome (`audio/clock.js`, `components/TransportBar.jsx`) — NEW
A transport bar docked to the bottom of **every** page, mounted once in App.jsx
above the router so the click keeps running (and keeps its tempo) as you move
between sections. Collapses to a pill; state in localStorage `met.v1` / `met.open`.
- BPM field / ∓ buttons / slider / **tap tempo**, subdivisions (♩ ♪♪ ♪³ ♬),
  time signature 2–12, beat dots + bar counter, count-in (0/1/2 bars),
  accent on 1, and a **speed-trainer ramp** (+N BPM every M bars, up to a ceiling).
- ⚙ drawer also holds the app-wide sound settings: **voice** (pluck / pure),
  note volume, click volume, and the global mute.
- Keyboard: **M** start/stop · **[** / **]** tempo ∓1 (shift = ∓5) · **T** tap.
  Ignored while typing in a field.
- Timing is Web Audio lookahead scheduling (25ms timer books clicks 150ms ahead
  on the audio clock), so it does not drift when React re-renders. Visual beats
  fire from a queue at the click's real audio time. Stop cancels the lookahead.
- Handoffs: Songs & Tones **"→ set the click"** starts it at the song's delay-time
  BPM (`msToBpm`); the Decoder's progression has **"⟵ from click"** (one chord per
  bar) and **"→ to click"**.

### Mode A/B (`theory/modes.js` + the Decoder's "Mode A/B" tab) — NEW
Modes taught the *parallel* way, which is the way you can actually hear.

The existing **Modes** tab is the *relative* view: same seven notes, move the
tonic. True, but as long as C is the gravity well you are still hearing C major.
**Mode A/B** fixes the tonic and changes ONE note instead.

- **The brightness ladder** — all seven modes brightest→darkest
  (Lydian · Ionian · Mixolydian · Dorian · Aeolian · Phrygian · Locrian). Every
  adjacent pair differs by exactly one note, printed between the rungs:
  `♯4→4 · 7→♭7 · 3→♭3 · 6→♭6 · 2→♭2 · 5→♭5`. Those degrees are the circle of
  fourths, which is *why* the ladder exists — there's a test asserting it.
- **The flip** — two big buttons for the two modes with the changing degree
  between them. Click to swap. On the neck the changing note is violet and the
  neighbour's version of it sits alongside as a dashed ghost, so you can see
  where it's about to move before you flip.
- **♁ hold the tonic** starts the drone from inside the tab, because without a
  tonic sounding a mode is just a scale shape. **♪ hear it** plays the root,
  then the root together with the changing note (scheduled on the audio clock,
  no timers).
- `theory/modes.js` derives everything from `SCALES` rather than re-typing the
  intervals, so the ladder can't drift out of step with the rest of the app.

### The drone (`audio/drone.js`) — NEW
A held tonic to practise against, in the transport bar next to the click. A
scale degree only means something relative to a tonic: play a pentatonic box
with nothing underneath and you are learning finger patterns; play it over a
held A and you are hearing the ♭3 being sad and the ♭7 pulling.
- **Voice:** root + 5th + octave, each partial two oscillators detuned ±4 cents
  so it beats gently, through a low-pass, with a slow LFO on the gain so it
  breathes. The 5th (on by default) is what keeps it modally neutral — a drone
  containing a 3rd would decide major or minor for you, which defeats the point.
  It never sounds a 3rd; there is a test for that.
- **Register:** every root lands between E2 and E♭3, so changing key never makes
  the drone leap an octave and nothing falls below the guitar's own low E.
- **⇄ follow:** retunes to whatever key the current page shows — the Decoder's
  root (in Modes, the *mode's* tonic, not the parent key), the active section in
  Songs & Tones, the section under the playhead in the Live Player. Picking a
  root by hand pins it and switches following off.
- **Ducks for the microphone.** A sustained tone is the most periodic thing in
  the room, so anything that opens the mic takes a ref-counted hold
  (`suspendForMic`) and the drone goes silent — quickly, not over its usual
  350ms fade, because the detector starts analysing on the very next frame. It
  returns when the mic is released; the bar shows "mic" while it is held.
- Keyboard **D**. Prefs in localStorage `drone.v1` (root, 5th, follow — `on` is
  deliberately not restored, nobody wants a tone playing on page load).

### The audio engine (`audio/engine.js`) — NEW
One AudioContext for the whole app (there were seven). Buses: music → master,
click → master, drone → master, so each has its own fader and one mute kills
everything.
Two voices: **pluck** (Karplus-Strong, rendered once per note into a cached
AudioBuffer, exact pitch via playbackRate) and **pure** (the original triangle +
octave sine, clearer for interval ear-training). Created lazily on first sound
and degrades to silence — never throws — if Web Audio is unavailable.
Prefs in localStorage `audio.v1`. Components keep their own `tone()` wrappers
and their local `muted` flags; only the implementation moved.

### 🎤 Listen (`ListenPage.jsx`) — NEW, needs the microphone
Two tools on one mic. Audio is analysed in the tab and never leaves it; the mic
is released when you navigate away or press "● mic on".
- **Tuner** — chromatic or by-string, big note name, Hz, cents, a needle over
  ±50 cents, "in tune ✓" latching after 280ms inside ±5 cents. Adjustable A4
  (415–450, stored in `tuner.a4`) and a tappable reference tone per string.
  Strings are shown low-to-high, numbered the way a guitarist counts (6 = low E).
- **Find the note** — the app names a degree of a key/scale; you play it; the mic
  confirms. Prompt modes (number + note / number only / note only), optional
  single-string constraint, ◉ show-me, per-question timer, streak in `find.best`.
  The question stays open until you actually find it; a wrong note is named back
  to you ("that's the 4 — F"). Matching is by pitch class so any octave counts.

### Pitch detection (`audio/pitch.js`)
McLeod Pitch Method (NSDF + peak picking + parabolic interpolation) over a
2048-sample window, ~30 analyses/sec. Picks the FIRST peak above 0.87× the
tallest — that's the octave guard — and searches above the reporting range so a
note above E6 is rejected rather than reported an octave low. Mic constraints
turn OFF echo cancellation, noise suppression and AGC (all of them mangle a
guitar). A stabiliser needs 3 of the last 6 frames to agree before reporting,
which is also what stops the metronome click being read as a note.
Verified in `test/pitch.test.js`: every semitone E2→E6 within 5 cents (avg <1.5)
at both 44.1 and 48 kHz.

### Ear Trainer — answer by playing
The 🎧 page gained an **Answer by: 👆 Tapping / 🎸 Playing it** switch. In play
mode the mic is opened, judging arms ~1.9s after the prompt finishes (so the
app's own output isn't judged), and you answer by playing the note on the
guitar. Any octave counts. Switching back to Tapping releases the mic.

### Practice links (`PracticePanel.jsx`) — foot of Songs & Tones
A key picker (defaulting to the selected song's key, re-syncing when you switch songs)
over two link lists: **backing tracks** (YouTube searches for `<key> <tonality>` jam /
blues / pentatonic) and **songs commonly in this key** (a curated `SONGS` table, each
row linking to a YouTube and an Ultimate-Guitar search). Search URLs rather than
deep links, so nothing rots. No API, no account, no backend.

Lives in `SongPractice.jsx`'s `PracticeLinks` wrapper. It used to sit under a ♫ Spotify
page (PKCE login → recently-played → auto key lookup via a Cloudflare key-proxy worker);
that page, `SpotifyRecent.jsx` and `worker/` were removed before the app went public —
the panel is what was worth keeping.

---

## localStorage keys
`et.best`, `ns.best`, `find.best`, `stack.best`, `gravity.best`, `formula.best`,
`shapes.best`, `target.best` (best streaks) · `progress.v1` (per-item practice
record — what each drill has learned about you) · `audio.v1` (voice/volume/mute)
· `met.v1` + `met.open` (metronome) · `drone.v1` (drone) · `tuner.a4`
· `songs.v1` (Song Practice) · `player.v1` (Live Player)
· one-shot handoffs (read & removed on mount): `songs.sel`, `player.sel`, `solo.req`.

Retired: `sp.token`, `sp.refresh`, `sp.exp`, `sp.verifier`, `key.proxy` and `decode.req`
belonged to the removed Spotify page. Nothing reads them; installs from before the
removal may still have them sitting in localStorage.

---

## ⚠️ Important workflow gotchas (read before editing)

1. **The Write/Edit file tools TRUNCATE files on this OneDrive-mounted folder** (seen on both
   large and tiny files). **Always edit via the shell** (`cat > file <<'EOF'`,
   `perl -0777 -i -pe`, or a Python literal-replace script) and verify with `npx vite build`.
2. **OneDrive leaves `.fuse_hidden*` junk files** when a file is replaced while open — stale
   copies of superseded versions. They're in `.gitignore` and unreferenced, so they are safe
   to `find . -name ".fuse_hidden*" -delete` whenever the editor and dev server are closed.
   Fifteen of them were cleared this way; check for new ones after a long session.
3. **Regex-deleting an export can eat its neighbours.** Pruning `findSongTone` with a pattern
   that ran to the next `export` swallowed the whole `SEED_SONGS.push(m01…m42)` block after
   it, and the same trick on `harmony.js` took `dominantOf` with it. Delete by exact string,
   not by pattern — and if it happens, `dist/assets/*.js` from the last good build is a
   recovery source for untracked files that git cannot help with.
4. **Git locks:** the sandbox can't delete `.git/*.lock`. Commits here are made via a temp
   index + plumbing (`GIT_INDEX_FILE=… git read-tree HEAD; git add …; git write-tree;
   git commit-tree -p HEAD; echo <sha> > .git/refs/heads/main`).
5. **Pushing must be done from the user's own machine** (sandbox has no GitHub auth):
   `del .git\HEAD.lock` / `del .git\index.lock` then `git push origin main`.
5. **The microphone needs a secure context** — the Pages URL (https) is fine; for
   local dev use `http://127.0.0.1:<port>/ai-guitar-theory-coach/` or `localhost`,
   both of which browsers treat as secure. A plain LAN IP will not get mic access.
6. **Verify builds** with `npx vite build --outDir /tmp/x --emptyOutDir` (a clean Linux
   esbuild/rollup may need `npm i @rollup/rollup-linux-x64-gnu` in the sandbox).

---

## Tests
`npm test` runs vitest: 273 assertions over the theory engine, the pitch
detector (synthesised tones, asserted in cents), the metronome maths, the drone
(note choice plus the microphone ref-count), the mode ladder, and
(`harmony.test.js`) the voicing solver and gravity tables — including that the
nearest voicing moves less than a third as far as root position, that it holds every
available common tone, that `identifyChord` round-trips every chord from every root,
and that borrowed chords really do come from the parallel minor. `scales.test.js`
holds every claim the Scale Lab makes on screen: that each scale's steps sum to an
octave, that dropping the two leaning notes leaves exactly the pentatonic and that
those two notes are the key's tritone, that EVERY interval shifts exactly one fret
across G–B, that all twelve circle neighbours share six notes and four chords, and
that the chord-tone drill judges against the chord rather than the key. The scheduling
and detection logic is deliberately split into pure functions so it can be
tested with no audio device.

`npm run test:browser` drives the real app in Chromium via Playwright. It runs on
Windows and macOS as well as the Linux sandbox now: paths come from `os.tmpdir()`,
the 110 Hz test tone is synthesised if it is missing, and the browser is launched
with `channel: "chromium"` — Playwright's DEFAULT build is chromium-headless-shell,
whose `getUserMedia` throws "Not supported", which silently failed every microphone
check. Install with `npm i --no-save playwright && npx playwright install chromium`.
It: it walks
all nine pages failing on any console error, counts scheduled clicks to check the
tempo, feeds a synthetic 110 Hz guitar tone into a fake microphone and asserts
the tuner reads A2 at 0 cents, and checks the mic is released on navigation.
65 checks. Playwright is NOT a dependency (its postinstall downloads ~150MB of
browsers, and CI runs `npm ci`) — install it first with `npm i -D playwright`.

`npm run verify` = unit tests + build + browser run.

## Content policy — read before adding songs

The Solo Player used to have three shelves. It has one.

- **Tabs** (`data/tabs.js`) are the whole library: real solos entered note for note from
  a published tab, for personal practice. Each is a derivative of somebody's performance,
  so the file says so in its own header, each solo carries "transcription" in its artist
  line, and **this is the file to remove before the repo goes public** — it is imported in
  exactly two places (`SoloPlayer`'s picker, `SongPractice`'s per-song row) and nothing
  else depends on it. Currently: *Purple Rain* (Prince, outro), *November Rain* (Guns N'
  Roses, outro), *While My Guitar Gently Weeps* (Prince's solo from the 2004 Rock'n'Roll
  Hall of Fame induction) and *Alone* (Heart, Howard Leese).
- **`verified: false`** means nobody has checked it against the record. A tab states
  frets and nothing else, so the rhythm, the tempo, the bar alignment and the chords
  underneath are all inferred; `meta.unverified` lists which, and the player shows the
  list behind a banner. Correct them, set `verified: true`, empty `unverified`, and the
  banner goes.
- **Tuned-down tabs are named by their SHAPES.** `<Neck>` and `theory/positions.js` both
  draw standard tuning, so a document declaring `tuningMidi` in Eb would render its
  ghosted scale a fret away from its own notes. November Rain therefore says C minor,
  which is the B minor of the record played on a guitar tuned down a half step. The
  frets are the tab's, untouched; only the letters move.

**Removed, and why.** The original etudes (`data/solos.js`) and the song charts
(`data/charts.js`) are gone, along with the chart grid, the "over this chord" panel, the
one-grip neck mode, the chord comping in the scheduler, and the schema's `KINDS` /
`meta.kind` / `chordSpans` / `spanAt` / `romanOf`. A player with one kind of document
does not need a field for telling kinds apart.

## Design system
Palette (per component `C` object + `src/index.css`): paper `#000`, ink `#DCE6EC`,
blue `#3E9BD6`, cyan `#36C7E0`, sun `#FF7A2E` (+deep `#E0601B`), violet `#B58CFF`,
red `#E0533F`, line `#3A4853`, muted `#7C8A95`. Fonts: ui-monospace for labels/data,
ui-sans-serif for body. Roy-G-Biv degree colours in `RAINBOW` (FretboardDecoder).

---

## Recent changes (newest first)
- **Dead weight cleared.** Fifteen `.fuse_hidden*` OneDrive artifacts deleted; three orphaned
  components deleted (`TargetPractice.jsx` and `ToneStrip.jsx`, both Live Player features, and
  `TonesPage.jsx`, whose own header had said "safe to delete manually" since Tone Match moved
  into Songs & Tones); and three unused exports removed (`findSongTone`, `getAmp`,
  `SLOW_DANCING_BARS`). Everything else the scan flagged is used inside its own module or by
  the tests, and was left alone.
- **Slow Dancing in a Burning Room (Live in LA)** — the whole eighty-seven bar arrangement,
  not a solo, and the only content in the app that is not hand-entered. Songsterr's player
  loads its own note data as JSON; that was captured with Playwright and converted, so every
  fret, duration and technique is the transcription's rather than a reading of a picture of
  it. 1631 notes, ten sections named with the tab's bar numbers, the solo cut into four
  parts. Two things fell out of it: the schema's `beatsPerBarAt` / `barAtBeat` / `beatAtBar`
  were treating `den` as decorative, which made every bar of an x/8 document twice as long as
  it sounds (this song has one 7/8 bar); and `harmonyLoop` correctly returns null for a whole
  song, which is a form rather than a vamp.
- **The unverified banner is gone.** `meta.verified` / `meta.unverified` are replaced by one
  `meta.source` string, shown as a quiet line under the teaching note. These are entered from
  published tabs, so the useful thing to record is WHICH tab; a warning that "nobody has
  checked this against the record" was answering a question nobody was asking of a tab off a
  tab site, and it buried the provenance under an alarm.
- **The Live Player is gone** — page, nav entry and smoke coverage. `TargetPractice.jsx` is
  left on disk unreferenced (it was a Live Player feature) rather than deleted untracked.
- **The Solo Player plays through your amp.** The same tone object that draws the
  Blackstar panel on Songs & Tones now drives a real signal chain on the solo's notes:
  soft-clip drive off the voice + gain knobs, a mid and a presence filter moving in
  opposition off the ISF, a cabinet low-pass that closes down as the gain comes up, and
  whichever of chorus/flanger/tremolo, delay and reverb the panel has lit. `audio/amp.js`
  holds the mapping as a pure function (`ampFromTone`) so it is unit tested with no audio
  device; `engine.js` builds the nodes, once per tone and never per note. The panel is
  drawn on the Solo page under the transport with an Amp on/off toggle for the A/B, and
  only `voiceAt` routes through it — tapping a note elsewhere stays on the clean string,
  because an interval drill wants a reference pitch, not a Marshall.
- **Tempo is in BPM, and goes both ways.** The transport's speed control was "65%", a
  number about the file; it is now the BPM you want to practise at, with a `= 113` button
  back to the record's tempo. `RATE_MAX` went from 1 to 2 so you can run a solo FASTER
  than written, and `RATE_STEP` from 0.05 to 0.01 so the slider can move one beat per
  minute at any written tempo. The shared metronome in the transport bar follows the
  solo, and switching solos resets to the new song's written tempo instead of carrying
  the last one's percentage onto it.
- **Alone** (Heart), the eight bars the source marks Solo: F# major, over the chorus loop
  D#m-B-F#-C#, and the first document whose source states its own tempo (87) and time
  signature, so neither is in its `unverified` list. Entered from a rendered tab image,
  which cost a round trip: the first screenshot could not be read safely, because which
  string a number sits on has to be inferred from which line it is drawn on and a row of
  error changes every note. The reading was pinned two ways — all sixty notes land inside
  F# major with no accidental, and the chord stacks either side of the solo read out on
  the same grid as D#m-B-F#-C#, matching a published chord chart. The first of those is
  now a test. The unverified banner's lead-in was reworded to stop claiming a tab never
  carries rhythm, which this one does.
- **While My Guitar Gently Weeps**, Prince's 2004 Hall of Fame solo, entered from
  Daniel Paul's tab: 22 phrases, A minor, standard tuning, over the song's verse loop
  (Am–Am/G–D9/F#–F–Am–G–D–E). The source came as four page images in no order, so the
  reconstruction is pinned by a test asserting the sections run 1 to 22. Two display
  fixes came with it, both from the document simply being long: the timeline stops
  labelling chord changes once there are more than 32 of them and names the repeating
  vamp instead (`harmonyLoop()` in the schema, with its own tests), and the current
  section name is spelled out beside the bar counter rather than left to the ribbon's
  ellipsis.
- **The Solo Player is one library now, and it holds the real solos.** Two
  transcriptions entered by hand from published tabs — *Purple Rain* (Prince, sixteen
  timestamped blocks, 3:46–6:13, over the Bb–Gm–F–Eb loop) and *November Rain* (Slash,
  ten phrases in C-minor shapes, over Cm–Bb–Ab–G) — both in `data/tabs.js`, both behind
  the unverified banner, both reachable from their song's Solo section. Going the other
  way, the original etudes and the song charts were **deleted**: `data/solos.js`,
  `data/charts.js`, the chart grid, the "over this chord" panel, the one-grip neck mode,
  the scheduler's chord comping, and the schema's `KINDS` / `meta.kind` / `chordSpans` /
  `spanAt` / `romanOf`. November Rain also added the tuning rule in the content policy
  above: a tuned-down tab is named by its shapes, because the neck draws standard tuning.
- ~~**Solos for the famous songs.**~~ *(superseded — the etudes and charts described
  here were removed in the entry above.)* Three new original etudes — *Twelfth Fret* (E
  minor pentatonic at the 12th), *High Road in B minor* (7th position), *Open Road
  in G* (major pentatonic, open position) — written for the key, box and register
  that Nothing Else Matters, Hotel California, One, Free Bird and Sweet Child's
  solos sit in. Four new form-only charts: **While My Guitar Gently Weeps**, Hotel
  California, Nothing Else Matters and Stairway to Heaven, all behind the
  unverified banner, with the sections I could not frame honestly left as `?`
  rather than invented (Stairway's verses; the Gently Weeps chorus). Content is now
  linked to the library by `meta.songIds`, and **Songs & Tones offers it from the
  song's Solo section** — one click into the ✦ Solo tab with that etude loaded.
- **The backlog, cleared.** Chord SHAPES you can grab — solved from the tuning
  rather than tabulated, and tested by asserting it rediscovers x32010, 022100 and
  friends — drawn as proper chord boxes in lesson 02. The pentatonic/CAGED **boxes**
  with a **sequence runner** (3s, 4s, thirds, string-skip) that walks a dot through
  a box in time with the click. A **practice log** (`data/progress.js`): every drill
  now records each ITEM — every drill in the app: ear training (intervals and
  degrees), the number system, find-the-note, name-that-scale, interval shapes and
  the resolve-it drill — weights its question picker by what you keep missing, and
  shows you the list. **Live Player Phase 2**: per-note riff following with a
  tap-to-place recorder. Plus the follow-ups — the tritone is now **dragged**
  inward by hand, borrowed chords are wired into **Songs & Tones** per song, the 16
  songs that faked the blues scale through `extras` were promoted to the real
  `blues` scale, and the browser smoke suite covers every lesson tab (and runs
  outside the sandbox).
- **Lesson 04 · The Scale Lab** + the last of THEORY_IDEAS: relative ⇄ parallel
  animated on a one-string ruler (#11), why pentatonic is safe — with the engine
  proving the dropped notes are the key's tritone (#12), walk-the-formula and
  name-that-scale drills (#13), intervals as shapes with the G–B exception derived
  from the tuning (#14), the circle of fifths as a machine with shared notes,
  common chords and pivots (#19), and **🎯 land on the chord tones** on the Live
  Player — the metronome drives the changes, the mic judges every strong beat
  (#17). New engine primitives: `stepPattern`, `tensionMap`, `intervalShapes`,
  `keyRelationship`, `keyNames`, `landingVerdict`.
- **Chords, part two** (THEORY_IDEAS #1–#8, #15): the Chord Builder became four
  tabs — voice leading (root position vs nearest voicing, drawn and played), chord
  gravity (function map + pull weights + the resolve-it mic drill), the tritone and
  its substitution, secondary dominants, borrowed chords, build-the-chord-yourself
  and the 9-11-13 stack. Under them: `theory/voicing.js`, `theory/harmony.js`,
  `identifyChord`, `DIATONIC_MINOR` + T/S/D functions, six new scales, eleven new
  chord qualities, and a major/minor switch on the Decoder's Harmony tab.
  Then a fifth tab, **Name it**, which puts the reverse lookups on a neck you tap:
  notes → chord (with inversions and slash chords), chord → the scales that contain
  it, scale → the chords that fit it, and one note → every chord it lives in
  (THEORY_IDEAS #5, #16, #18).
- **Mode A/B:** a brightness-ladder tab in the Decoder — fixed tonic, flip the
  single note that separates two neighbouring modes, with the alternative shown
  as a dashed ghost on the neck.
- **Drone:** a sustained root+5th tonic in the transport bar, following the key
  each page is showing and ducking automatically whenever the microphone opens.
- **Metronome + shared audio engine:** docked transport on every page (tap tempo,
  subdivisions, count-in, speed-trainer ramp, keyboard shortcuts), lookahead
  scheduling on the audio clock; the seven per-component AudioContexts collapsed
  into one engine with a Karplus-Strong pluck voice and a global mute.
- **Microphone:** `audio/pitch.js` (MPM detector) + a 🎤 Listen page with a tuner
  and a "find the note" drill the app judges by ear; Ear Trainer can be answered
  by playing the note back. First tests in the project (vitest + a Chromium
  smoke run).
- **Live Player chord follow:** per-section chord progressions (tap-captured, optional repeat
  cycle); chord lane; glow/only fretboard modes; key↔chord degree re-labelling; yl seeds.
- **Song Practice sections:** per-song intro/chorus/solo sections (own root/scale/box),
  ▦ tabs ↔ ▤ stack views, section editor, seeded Stairway + Sweet Child sections.
- **♫ Spotify page:** dedicated nav page for recently-played + send-to (decode/songs/live);
  PracticePanel/SpotifyRecent embeds removed from lessons 01–03; OAuth return opens ♫ page.
  *(Removed before public release — see "Practice links" above.)*
- **Live Player (Phase 1):** new ▶ LIVE tab; MP3 + YouTube clock; sections roadmap with
  playhead/loop/speed; fretboard follows section scale+box; section editor; seeded Yellow Ledbetter.
- **Song Practice page:** offline local library + vocabulary/in-between notes; seeded Mac Miller
  & GNR songs; merge-loader so new seed songs appear for existing users.
- **Page 1 additions:** Spotify "▸ practice" → load key into Scales; pentatonic↔full toggle;
  animated ⓘ tooltips.
- **Naming:** removed "AI" → "Guitar Theory Coach" everywhere.
- **Nav restructure:** lessons 01–03; Ear Trainer became a 🎧 icon set apart; `aria-current`.
- **Modes order:** Modes selector now lists Ionian→Locrian (1–7) instead of brightness order.
- **Fretboard Decoder:** Roy-G-Biv 🌈 degree colours (red root); ▢ box position lock;
  I–IV mode-jam preset.
- **24-fret necks** on Decoder + Chord Builder; `⤢ fit` toggle.
- **Spotify recently-played** + optional auto-key via Cloudflare worker (GetSongBPM).
- **Practice panels** (backing-track + song links) on Chord Builder & Number System.
- **EADGBE** default string order; modal "parent key/movable tonic" + characteristic note +
  cross-fade animation; progression player.
- **Deploy:** Vite `base` + GitHub Actions Pages workflow.

## Next steps / backlog
See THEORY_IDEAS.md for the full list of interactive theory features; its build
order is up to date, and every engine primitive it called for now exists. Nearest
Every idea in that document is now built, bar one deliberate gap: naming a chord you
STRUM, which needs polyphonic pitch detection.

The older backlog below is now cleared too — positions and the pattern generator,
the chord-shape solver, per-item progress and Live Player Phase 2 all shipped. Kept
here for the record:
- **Positions + pattern generator:** name the 5 pentatonic boxes / CAGED shapes in
  the engine, then drive scale sequences (3s, 4s, thirds, string skipping) as a
  moving dot on the shared `Neck` in time with the metronome. The clock is now
  there to hang it on.
- **Chord voicings:** a `VOICINGS` table + a vertical chord-diagram component —
  Chord Builder still shows every chord-tone location rather than shapes you can
  grab.
- **Per-item progress:** weight the drill question pickers by miss rate
  (Leitner-lite) and add a practice log. Today it is still three best-streak ints.
- **Live Player Phase 2:** note-by-note (string/fret/time) highlighting for riffs/solos
  (true karaoke note-lighting), seeded with Yellow Ledbetter's intro + solo licks; plus a
  tap-to-place timing recorder. Foundation (clock + sections) already exists.
- Optional: bump GitHub Action versions to clear Node-20 deprecation warnings.
