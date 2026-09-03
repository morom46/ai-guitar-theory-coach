 # What else the app could teach — and the interaction that teaches it

The app is strong at *showing* theory. What it mostly can't do yet is make you
**produce** it — build a chord instead of reading one, hear a mode against a
tonic instead of seeing a note highlighted violet.

So each idea below is written as a pair: **the concept**, and **the specific
interaction that makes it land**. The interaction is the part that matters; a
diagram of voice leading teaches nothing, watching two notes move by a semitone
while the third stays put teaches it in ten seconds.

Everything here builds on what's already in the repo: the theory engine, the
shared `Neck`, the audio engine, the metronome, and the microphone.

---

## CHORDS

### 1. Voice leading — ✅ BUILT
**Teaches:** inversions, why chords aren't shapes, why good progressions barely move.

**Interaction:** pick a progression (C–Am–F–G). Show it twice on one screen:
*root position everywhere* vs *nearest voicing*. Press play and **animate the
individual notes moving between chords.** In the root-position version everything
leaps. In the nearest-voicing version you watch the common tone stay completely
still while the other two slide by a step or two.

That single animation is the whole concept. It also silently teaches inversions —
you never have to define the word, you just see the 3rd end up in the bass.

**Shipped** as the Chord Builder's **Voice leading** tab. Both versions are drawn on
one shared pitch axis, so the leaping is visible right next to the flat lines:
C–Am–F–G is 43 semitones of movement in root position and 9 voiced nearest. A held
common tone draws a thick orange line straight through the chord change, every
column is labelled with the inversion it landed in (Am/C, F/C, G/B), and the number
between two columns is the semitones moved. Play either version, or both back to
back.

`src/theory/voicing.js` holds `invert` / `inversions` / `candidateVoicings` /
`nearestVoicing` / `voiceLead` / `motion` / `totalMotion`. The solver enumerates
every octave placement inside a register and keeps the smallest total distance —
about the 30 lines predicted. Both versions deliberately start on the same
root-position chord, so the comparison is honestly about what happens BETWEEN
chords.

---

### 2. Build the chord yourself — ✅ BUILT
**Teaches:** chords are stacked thirds *out of a scale*, not memorised shapes.

**Interaction:** show the seven degrees of a key as a row. The app asks
"stack a seventh chord on degree 5." You click **5 · 7 · 2 · 4**, and it names
what you built — G7 — and points out that the 3rd and ♭7 a tritone apart are
what make it want to resolve.

Chord Builder currently does the reverse: you pick a chord and it explains it.
Flipping the direction turns reading into recall, which is where learning
actually happens.

**Shipped** as the Chord Builder's **Stack it yourself** tab: the app sets the task
("stack a seventh chord on degree 5"), you tap degrees, and `identifyChord` names
whatever you actually built — including when that isn't what was asked for ("you
built Cmaj7/E — degree 2 wants 2·4·6·1, which is Dm7"). A dominant answer gets its
tritone pointed out. Streak in localStorage `stack.best`.

---

### 3. Chord gravity — ✅ BUILT
**Teaches:** tonic / subdominant / dominant; why a progression feels like it's
going somewhere.

**Interaction:** a "gravity map" of the seven diatonic chords. Play any one and
arrows appear showing where it wants to go, weighted by how strong the pull is
(V→I thick, vi→ii thin). Then the drill: **the app plays a V7 in a random key
and you have to play the I** — the mic checks it. Do that thirty times and
resolution stops being a word and becomes a reflex.

This is the biggest genuinely missing *concept* in the app. Everything currently
teaches what notes are in things; nothing teaches why one chord follows another.

**Shipped** as the Chord Builder's **Chord gravity** tab. The map draws the seven
diatonic chords coloured by function, with weighted arrows out of whichever one you
tap; beside it every pull is listed with its strength, its reason and a button that
plays the move. Minor keys have their own map. The drill sits underneath: the app
plays a dominant 7th in a random key and you answer by playing the tonic (the mic
judges it, reusing `ListenPage`'s judge) or by tapping it. Wrong answers are named
back as a degree ("that's the b5 — D"). Streak in `gravity.best`.

`src/theory/harmony.js` holds `PULL_MAJOR` / `PULL_MINOR`, `pullsFrom`,
`resolutionOf`, `gravityMap` and `dominantOf` — the last of which hands a minor key
the harmonic-minor V7, because natural minor's v has no leading tone to pull with.

---

### 4. The tritone, and tritone substitution — ✅ BUILT
**Teaches:** why dominant chords resolve; then, as a bonus, tritone subs.

**Interaction:** show G7. Highlight just **B and F** — the tritone. Let the user
drag those two notes inward: B→C, F→E. They've just resolved to C major with
their own hands. Then flip a switch: the *same two notes* also live inside D♭7.
Play D♭7→C.

One interaction, three concepts: what makes a dominant dominant, contrary motion,
and the substitution that jazz is built on. Very high teaching-per-line ratio.

**Shipped** inside the gravity tab. The two notes get their own strip; "resolve them
inward" slides them toward each other by a semitone each and relabels them as the 1
and the 3 of the target. The ⇄ switch swaps G7 for D♭7 and plays it, naming the
shared pair. `tritoneOf`, `tritoneSub` and `tritoneResolution` do the maths. Letting
the user drag the notes themselves is still worth doing one day; the animation
carries the lesson in the meantime.

---

### 5. Name what I played (reverse lookup) — 🟡 ENGINE BUILT
**Teaches:** chord spelling in the direction you actually need it.

**Interaction:** tap any set of notes on the neck → the app names the chord,
including inversions and slash chords ("that's C/E — a C major with the 3rd in
the bass"). Extend to the mic later: strum a chord, the app names it.

The engine can go scale→notes but not notes→name, which blocks a whole family of
drills. The lookup itself is small: normalise the pitch-class set, try all 12
roots × every quality, prefer the interpretation with the lowest note as root.

`identifyChord(pcs, { bassPc })` is in the engine: an exact set match against all 12
roots × every quality, scored by whether the bass IS the root and then by how plain
the quality is — so C-E-G-A comes back as C6 over C and Am7 over A. It names
inversions and slash chords, and returns the other honest readings as `alternatives`
(a dim7 has four). The Stack-it drill already uses it.

**Still to do:** tapping arbitrary notes on the shared `Neck` and having them named.
The lookup is done, that UI is not. Polyphonic mic detection remains much harder.

---

### 6. Extensions are just the scale, stacked higher — ✅ BUILT
**Teaches:** 9ths, 11ths, 13ths stop being exotic.

**Interaction:** a slider that keeps stacking thirds. 1–3–5 → add 7 → add 9 →
11 → 13. As you slide, the neck shows chord tones lighting up **and the
"remaining" scale notes greying out.** By the 13th the chord has swallowed the
entire scale. That's the moment you understand a 13th chord isn't a weird shape,
it's the key itself played vertically.

**Shipped** as the second half of the **Stack it yourself** tab: a slider that keeps
stacking thirds across the seven degrees of the key, chord tones lit and the rest of
the scale greying out, with a running count of how much of the scale the chord has
swallowed. At the 13th it reads "7 of 7 degrees swallowed".

`CHORDS` now runs to sus2/sus4, 6/m6, dim7, add9, maj9/9/m9, 11/m11 and 13, grouped
into `CHORD_FAMILY` so the quality picker stays readable rather than becoming a wall
of nineteen buttons.

---

### 7. Borrowed chords — ✅ BUILT (the songs wiring is still to do)
**Teaches:** modal interchange, ♭VI–♭VII–I, minor-key colour in major songs.

**Interaction:** a **parallel-key toggle.** Show I–IV–V in C major, then flip to
"borrow from C minor" and hear iv, ♭VI, ♭VII drop in. Half your seeded library
(Nirvana, Metallica, RHCP) is built on exactly this move, so wire the toggle to
the actual songs — "this is the chord that makes the chorus sound like that."

**Shipped** as a panel in the gravity tab: the six chords worth borrowing, each
shown against the diatonic chord it replaces, with the note it drags in from the
parallel minor named ("swap F for Fm — the note is A♭"). Spelled flat, because ♭VI
is A♭ and never G♯.

`DIATONIC_MINOR` closes the hole this idea called out, and the **Decoder's Harmony
tab now has a major / natural-minor switch** — minor-key songs are finally
explainable there.

**Still to do:** wire the toggle to the actual seeded songs — "this is the chord
that makes the chorus sound like that".

---

### 8. Secondary dominants — ✅ BUILT
**Teaches:** any chord can be a temporary tonic.

**Interaction:** click a chord inside a progression and press "aim at it." The
app inserts its V7 in front and plays both versions back to back — C–Am–F–G vs
C–**E7**–Am–F–G. Hearing them consecutively is the whole lesson.

**Shipped** inside the gravity tab: select any chord that isn't the tonic and it
offers "▶ vi on its own" against "▶ E7 → Am". `secondaryDominant()` lives in
`theory/harmony.js`.

---

## SCALES

### 9. A drone — ✅ BUILT
**Teaches:** what every scale degree actually *sounds* like.

**Interaction:** hold a sustained tonic under whatever you're practising. One
button. That's it.

Playing A minor pentatonic with no reference is finger patterns. Playing it over
a held A is the ♭3 sounding sad, the ♭7 pulling, the root landing. Scale degrees
have no meaning without a tonic to measure against, and a drone supplies one for
free.

**Shipped.** It lives in the transport bar (♁ DRONE + a root selector + a ⇄
follow toggle), holds root + 5th + octave so it stays modally neutral, follows
whatever key the current page is showing, and goes silent automatically while
the microphone is capturing. Keyboard: **D**.

---

### 10. Modes, one note at a time — ✅ BUILT
**Teaches:** what actually separates Dorian from Aeolian.

**Interaction:** drone on the tonic. Show the scale. Now a single toggle for the
**one note that differs** — ♮6 vs ♭6 — and let the user flip it back and forth
while playing. Dorian's brightness is *that one note*, and you can hear it move.

The Decoder already highlights the characteristic note in violet. Adding the
drone plus a flip toggle converts a visual annotation into an audible fact.

**Shipped** as the Decoder's **Mode A/B** tab: the full brightness ladder with
all six one-note steps, a flip button, the alternative note ghosted on the neck,
and a shortcut to start the drone. This also delivers most of #11 — it *is* the
parallel view.

---

### 11. Relative vs parallel, animated
**Teaches:** the two ways scales relate, which people constantly confuse.

**Interaction:** one switch with two animations.
*Relative* — the notes stay exactly where they are and the sun slides to a new
note (C major → A minor).
*Parallel* — the sun stays put and three notes slide down a fret (C major → C
minor).

Seeing which thing moves is the entire distinction. The Decoder's modal view
already does half of this.

---

### 12. Why pentatonic is safe
**Teaches:** pentatonic isn't a beginner scale, it's the major scale with the
danger removed.

**Interaction:** show C major over a C drone. Fade out the 4 and the 7 one at a
time, listening to each first — those are the two notes that create half-step
tension against the chord. What's left is major pentatonic. Then the same in
minor: remove 2 and ♭6.

This reframes pentatonic from "the easy one" to "the one that can't clash," which
is a much more useful thing to know.

---

### 13. Build the scale from its formula
**Teaches:** scales are interval recipes, not note lists.

**Interaction:** show `W–W–H–W–W–W–H` and a blank neck. The user clicks frets to
build it from a given root; the app checks each step. Then the reverse: it lights
seven random notes and asks which mode they are.

**Needs:** nothing new. Pure UI over `SCALES`.

---

### 14. Intervals as shapes, not names
**Teaches:** the actual geography of the fretboard.

**Interaction:** a P5 is *always* the same two-fret-over, two-strings-down shape
— except across the G–B string, where it shifts. Drill it: the app plays or names
an interval, you play both notes anywhere. The mic can verify the second note.

This is the guitar-specific insight the app is otherwise missing, and it's the
thing that makes the neck feel small instead of infinite.

---

### 15. Missing scales worth adding — ✅ BUILT
All of them are in `SCALES` now: **blues**, **melodic minor**, **lydian dominant**,
**altered**, **harmonic major** and **whole-half diminished**. As predicted, each one
appeared in the Decoder, Songs, Live Player and Ear Trainer at once, since
everything reads from the same engine. (There is a test asserting that lydian
dominant and altered really are modes of melodic minor, and that blues really is
minor pentatonic plus the ♭5.)

---

## WHERE CHORDS AND SCALES MEET

This is the part the app has the least of, and it's where playing actually
happens.

### 16. Two-way chord ↔ scale lookup — 🟡 ENGINE BUILT
`chordsIn(scaleId, tonicPc)` and `scalesContaining(pcs)` are in the engine, the
latter sorted tightest-fit first. The neck picture — chord tones solid, the rest of
the scale hollow — is still to build.

**Interaction:** "which scales contain this chord?" and "which chords fit this
scale?" — with the neck lighting up both at once: chord tones solid, the rest of
the scale hollow. That visual (targets vs connective tissue) is the single most
useful picture for soloing, and it's the bridge between lessons 02 and 04.

### 17. Chord tones vs passing tones, over a real progression
**Teaches:** why great solos land on chord tones.

**Interaction:** the Live Player already tracks chords per section. Add a mode
that scores which notes you land **on the beat** — the metronome and the mic are
both already there. Land on chord tones on strong beats and the app tells you the
line sounded resolved; land on the 4 over a major chord and it tells you why that
clashed.

That's the most advanced idea here and the most valuable: it's the difference
between knowing a scale and playing music with it.

### 18. Harmonise a melody — 🟡 ENGINE BUILT
`chordsContaining(pc, tonicPc, mode)` returns every diatonic chord a note lives in
(E in C major → I, iii, vi). The UI is still to build.

**Interaction:** play or click a single note, and the app shows every diatonic
chord containing it. Teaches that one note has several harmonic homes — the
foundation of reharmonisation, and a genuinely fun thing to poke at.

### 19. The circle of fifths as a machine
**Interaction:** not a poster. Click any two keys and it tells you how many notes
they share, which chords they have in common, and the smoothest chord to pivot
through when modulating. Adjacent keys share six of seven notes — that's *why*
the circle is shaped like that, and it's much better felt than read.

---

## Shared engine work these depend on

Most of the above needs one of a small set of primitives, and building those
first is what made the recent batch cheap. Every one of them now exists:

| Primitive | Where it lives | Unlocks |
|---|---|---|
| `invert` + `nearestVoicing` / `voiceLead` | `theory/voicing.js` | ✅ 1, 2 |
| `identifyChord(pcs, {bassPc})` | `theory/engine.js` | ✅ 5, 18 |
| `DIATONIC_MINOR` + T/S/D function labels | `theory/engine.js` | ✅ 3, 7, 8 |
| extended chords (9/11/13, sus, add, dim7, 6) | `theory/engine.js` | ✅ 2, 6 |
| `scalesContaining` / `chordsIn` / `chordsContaining` | `theory/engine.js` | ✅ 16, 17 |
| a drone voice on the audio bus | `audio/drone.js` | ✅ 9, 10, 11, 12 |
| more scales (blues, melodic minor…) | `theory/engine.js` | ✅ 15, everywhere |
| pull weights + `gravityMap` / `tritoneSub` / `borrowedChords` | `theory/harmony.js` | ✅ 3, 4, 7, 8 |

---

## Build order

1. ~~**The drone** (#9)~~ — ✅ built.
2. ~~**Modes one note at a time** (#10)~~ — ✅ built.
3. ~~**Voice-leading animation** (#1)~~ — ✅ built.
4. ~~**Chord gravity + resolve-it drill** (#3)~~ — ✅ built, along with the tritone
   and its substitution (#4), secondary dominants (#8), borrowed chords (#7),
   build-the-chord-yourself (#2), the extension stack (#6) and the missing
   scales (#15).

Next, in order:

5. **Tap the neck, name the chord** (#5) — the lookup is done; it needs a neck that
   collects taps and a readout. Small, and it unlocks a whole family of drills.
6. **Chord tones vs the rest of the scale, on one neck** (#16) — `chordsIn` and
   `scalesContaining` are waiting; this is the picture that turns scales into
   soloing.
7. **Relative vs parallel, animated** (#11) and **why pentatonic is safe** (#12) —
   both are small now that the drone and Mode A/B exist.
8. **Chord tones on strong beats** (#17) — still the most valuable and the most
   work: it needs the metronome, the mic and the Live Player's chord lane together.
