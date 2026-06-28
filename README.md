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
  theory/engine.js              the single theory engine — pitch classes,
                                intervals, scales, chords, enharmonic
                                spelling, MIDI/frequency math
  components/FretboardDecoder.jsx   Feature 01 — the interactive neck
  App.jsx                       app shell + feature roadmap
  main.jsx                      entry point
```

The theory engine is deliberately separated from the UI: every future feature
consumes the same primitives, so the music theory is defined exactly once.

## Roadmap

- **02 · Ear Trainer** — interval recognition drills driven by the same
  `INTERVALS` table and synth.
- **03 · Chord Builder** — assemble chords from stacked thirds and see them
  mapped onto the neck.
- **04 · Number System Trainer** — think in degrees (1, b3, 5, b7) instead of
  note names, in every key.

## Tech

React 19 + Vite. No other runtime dependencies — the audio is raw Web Audio API.
