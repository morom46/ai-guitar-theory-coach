# Guitar Theory Coach — Project Overview & Handoff

> Drop this file + the project folder into a new chat for full context.
> Last updated: 2026 (after the Live Player Phase-1 build).

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
  App.jsx                  top nav (taskbar) + section router
  components/
    FretboardDecoder.jsx   Lesson 01 — the keystone
    ChordBuilder.jsx       Lesson 02
    NumberSystem.jsx       Lesson 03
    EarTrainer.jsx         Practice (🎧 icon, no number)
    SongPractice.jsx       Practice (🎵 icon) — offline song library w/ sections
    LivePlayer.jsx         "▶ LIVE" tab — play-along, sections + chord-follow
    SpotifyPage.jsx        ♫ tab — dedicated Spotify page (send-to actions)
    PracticePanel.jsx      backing-track + song-search links (used by SpotifyPage)
    SpotifyRecent.jsx      Spotify recently-played + auto key lookup
worker/
  getkey.js                Cloudflare Worker proxy for GetSongBPM (auto key)
  README.md                worker deploy steps
.github/workflows/deploy.yml   Pages CI
vite.config.js, index.html, package.json
```

### The theory engine (`src/theory/engine.js`)
One source of truth consumed by every component. Exports include:
`ROOTS` (12 preferred note names), `DEG` (semitone→Nashville number e.g. 3→"b3"),
`INTERVALS`, `SCALES` (major, modes, harmonic minor, major/minor pentatonic — each has
`ints` + `name` + `formula`), `CHORDS`, `DIATONIC`, `OPEN_MIDI` (standard tuning,
string1=high E .. string6=low E), `FRETS` (= 24), and helpers `noteNameToPc`,
`buildNoteNames` (enharmonic-correct per key), `midiToFreq`, `majorScaleSpelling`.
**No music logic is hardcoded in components** — it all derives from the engine.

---

## Features (each page)

### Nav / taskbar (App.jsx)
Three numbered lesson tabs: **01 Fretboard Decoder · 02 Chord Builder · 03 Number System**.
Then a distinct accent **▶ LIVE** tab, a divider, and three icon-only buttons:
**🎵 Song Practice**, **♫ Spotify** (green), **🎧 Ear Trainer**. Active state via `aria-current="page"`.
If the URL has `?code=` (Spotify OAuth return), App opens the ♫ page so the token exchange completes.

### 01 — Fretboard Decoder (`FretboardDecoder.jsx`) — keystone
A 24-fret neck (standard tuning) that decodes pitch through modes:
- **Modes (top tabs):** Notes, Intervals, Scales, Chords, Harmony, **Modes**, **Progression**.
  - Scales: pick root + scale, lights the scale (number-system labels).
  - Chords: pick root + quality.
  - Harmony: diatonic triads of the major key (I ii iii IV V vi vii°).
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
- On mount, consumes `localStorage decode.req` (a key string queued by the ♫ Spotify
  page's **▸ decode** button) and loads it via handlePickKey (pentatonic by default).

### 02 — Chord Builder (`ChordBuilder.jsx`)
Pick root + quality; shows the chord as **stacked thirds** (cards with number/note/interval
and the M3/m3 gaps), every chord-tone location on a 24-fret neck (low-E top), strum +
arpeggiate + per-tone playback. (PracticePanel embed removed — now on the ♫ page.)

### 03 — Number System (`NumberSystem.jsx`)
**Key map** (1–7 → note + diatonic chord + roman numeral, tap to hear) and a **Drill**
(random key each question, "number→chord" and "chord→number", scoring + best streak in
localStorage `ns.best`). (PracticePanel embed removed — now on the ♫ page.)

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

### ♫ Spotify page (`SpotifyPage.jsx`) — NEW dedicated page
Hosts SpotifyRecent (below) with per-track **send-to actions**: **▸ decode** (queue key in
`decode.req` → Fretboard Decoder), **＋ songs** (append to `songs.v1` + select via
`songs.sel` → Song Practice), **＋ live** (append to `player.v1` + `player.sel` → Live
Player, one default section). Key parsing "Em"/"F#m"/"C" → root+minor. Below: a pick-any-key
selector + PracticePanel (`spotify={false}`) for backing tracks & curated songs. SpotifyRecent
gained an `actions(track, key)` render prop; PracticePanel a `spotify` prop (default true).

### Spotify + auto key (`SpotifyRecent.jsx`, used by SpotifyPage)
- PKCE login (no secret). **Client ID is hardcoded** in the file
  (`CLIENT_ID = "d0df00eaf98b442c85099d732a3f1587"`) — a Spotify Client ID is public-safe.
- Reads `/me/player/recently-played`. Redirect URI = current origin+path
  (registered: the Pages URL; for local use `http://127.0.0.1:<port>/ai-guitar-theory-coach/`,
  NOT `localhost`).
- Spotify removed key data (Nov 2024), so keys come from an optional **key-proxy**: paste a
  worker URL → each track shows its key automatically (badge links to a backing track);
  without a proxy it falls back to Tunebat "🔑 key" links.

### Key-proxy worker (`worker/getkey.js`)
One-file Cloudflare Worker wrapping the GetSongBPM API (hides API key, adds CORS).
Returns `{key,tempo}` for `?q=<title artist>`. Deploy steps in `worker/README.md`.

---

## localStorage keys
`et.best`, `ns.best` (best streaks) · `songs.v1` (Song Practice) · `player.v1` (Live Player)
· Spotify: `sp.token`, `sp.refresh`, `sp.exp`, `sp.verifier` · `key.proxy` (auto-key worker URL)
· one-shot handoffs (read & removed on mount): `decode.req`, `songs.sel`, `player.sel`.

---

## ⚠️ Important workflow gotchas (read before editing)

1. **The Write/Edit file tools TRUNCATE files on this OneDrive-mounted folder** (seen on both
   large and tiny files). **Always edit via the shell** (`cat > file <<'EOF'`,
   `perl -0777 -i -pe`, or a Python literal-replace script) and verify with `npx vite build`.
2. **OneDrive leaves `.fuse_hidden*` junk files** when a file is replaced while open. They're
   in `.gitignore`, harmless, and only deletable after closing the editor/dev server.
3. **Git locks:** the sandbox can't delete `.git/*.lock`. Commits here are made via a temp
   index + plumbing (`GIT_INDEX_FILE=… git read-tree HEAD; git add …; git write-tree;
   git commit-tree -p HEAD; echo <sha> > .git/refs/heads/main`).
4. **Pushing must be done from the user's own machine** (sandbox has no GitHub auth):
   `del .git\HEAD.lock` / `del .git\index.lock` then `git push origin main`.
5. **Verify builds** with `npx vite build --outDir /tmp/x --emptyOutDir` (a clean Linux
   esbuild/rollup may need `npm i @rollup/rollup-linux-x64-gnu` in the sandbox).

---

## Design system
Palette (per component `C` object + `src/index.css`): paper `#000`, ink `#DCE6EC`,
blue `#3E9BD6`, cyan `#36C7E0`, sun `#FF7A2E` (+deep `#E0601B`), violet `#B58CFF`,
red `#E0533F`, line `#3A4853`, muted `#7C8A95`. Fonts: ui-monospace for labels/data,
ui-sans-serif for body. Roy-G-Biv degree colours in `RAINBOW` (FretboardDecoder).

---

## Recent changes (newest first)
- **Live Player chord follow:** per-section chord progressions (tap-captured, optional repeat
  cycle); chord lane; glow/only fretboard modes; key↔chord degree re-labelling; yl seeds.
- **Song Practice sections:** per-song intro/chorus/solo sections (own root/scale/box),
  ▦ tabs ↔ ▤ stack views, section editor, seeded Stairway + Sweet Child sections.
- **♫ Spotify page:** dedicated nav page for recently-played + send-to (decode/songs/live);
  PracticePanel/SpotifyRecent embeds removed from lessons 01–03; OAuth return opens ♫ page.
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
- **Live Player Phase 2:** note-by-note (string/fret/time) highlighting for riffs/solos
  (true karaoke note-lighting), seeded with Yellow Ledbetter's intro + solo licks; plus a
  tap-to-place timing recorder. Foundation (clock + sections) already exists.
- Optional: bump GitHub Action versions to clear Node-20 deprecation warnings.
