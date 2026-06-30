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

### Spotify integration

Connect Spotify (PKCE — no secret, no backend) to see your **recently played tracks**
alongside the song library. Because Spotify removed audio-features from its API
(Nov 2024), keys come from an optional **key-proxy worker** (see `worker/`) that wraps
the GetSongBPM API. With a proxy set, the key of each recent track appears
automatically; without one, the panel falls back to manual Tunebat / YouTube links.

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
  components/
    FretboardDecoder.jsx            Feature 01 — the interactive neck
    ChordBuilder.jsx                Feature 02 — stacked-thirds chord explorer
    NumberSystem.jsx                Feature 03 — Nashville number system map + drill
    EarTrainer.jsx                  🎧 interval & degree recognition drills
    SongPractice.jsx                🎵 offline song library on the fretboard
    SpotifyRecent.jsx               Spotify recently-played + key lookup
    PracticePanel.jsx               shared backing-track & song panel (02 & 03)
  App.jsx                           app shell — tab nav, section routing
  main.jsx                          entry point

worker/
  getkey.js                         Cloudflare Worker — proxies GetSongBPM API,
                                    hides the key, adds CORS headers
  README.md                         deploy instructions (free, ~5 min)
```

The theory engine is deliberately separated from the UI: every feature consumes the
same primitives, so the music theory is defined exactly once.

## Tech

React 19 + Vite. No runtime dependencies beyond React — audio is raw Web Audio API,
Spotify auth is PKCE (no server), the key-proxy worker is a single Cloudflare Workers
file (~50 lines).
