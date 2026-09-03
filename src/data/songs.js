/**
 * SONG LIBRARY — one entry per song, holding BOTH sides of practice:
 *   fretboard: root, minor, scaleId, extras[], sections[]  (what to play)
 *   tone:      the song's sound dialed into YOUR rig        (how it sounds)
 *              — Blackstar ID:Core V4 Stereo 10 + HSS Strat
 *
 * Storage: localStorage "songs.v2". First run migrates the old split
 * stores (songs.v1 practice list + tones.v1 tone list) by title.
 *
 * Keys use the engine's ROOTS spellings: C Db D Eb E F F# G Ab A Bb B
 * (minor keys end in "m", e.g. "F#m").
 */

/* ---------- compact builders (keep 70 songs readable) ---------- */

// tone: voice, gain, isf, pickup(1-5), toneKnob, fx {m:[type,lvl], d:[type,lvl,ms], r:[type,lvl]}, rig, notes
const T = (voice, gain, isf, pickup, toneKnob, fx = {}, rig = "", notes = "") => ({
  voice, gain, volume: 5, isf, pickup, toneKnob,
  fx: {
    mod: fx.m ? { on: true, type: fx.m[0], level: fx.m[1] } : { on: false, type: "Chorus", level: 3 },
    dly: fx.d ? { on: true, type: fx.d[0], level: fx.d[1], ms: fx.d[2] || 0 } : { on: false, type: "Analogue", level: 3, ms: 400 },
    rev: fx.r ? { on: true, type: fx.r[0], level: fx.r[1] } : { on: false, type: "Room", level: 3 },
  },
  rig, notes,
});

/**
 * The blues scale used to be faked: minor pentatonic plus a ♭5 pencilled in
 * through `extras`. It is a real scale in the engine now, so a song written
 * that way is promoted to it — same notes, but the b5 stops being a bolt-on
 * and the vocabulary panel stops offering you a note you already have.
 *
 * Anything else in `extras` (the 2 and 6 that turn minor pentatonic into
 * Dorian vocabulary, the major 3rd blues players mix in) is left exactly as it
 * was: `extras` is a general mechanism, and this only fixes the one case where
 * it was standing in for a scale.
 */
export function normaliseSong(song) {
  if (!song || song.scaleId !== "minorPent") return song;
  const extras = song.extras || [];
  if (!extras.includes(6)) return song;
  return { ...song, scaleId: "blues", extras: extras.filter((n) => n !== 6) };
}

// song: id, title, artist, key ("Em"/"D"), scaleId, tone, opts { extras, sections }
const S = (id, title, artist, key, scaleId, tone, opts = {}) => normaliseSong({
  id, title, artist,
  root: key.replace(/m$/, ""),
  minor: /m$/.test(key),
  scaleId,
  extras: opts.extras || [],
  ...(opts.sections ? { sections: opts.sections } : {}),
  tone,
});

// sections accept "Am"/"E" style keys; the stored root is the plain note name
const sec = (id, name, key, scaleId, pos) => ({ id, name, root: key.replace(/m$/, ""), scaleId, pos });

/* ---------- the library ---------- */

export const SEED_SONGS = [
  /* == carried over from the old libraries (sections kept) == */
  S("s1", "Stairway to Heaven", "Led Zeppelin", "Am", "minorPent",
    T("Crunch", 6, 7, 3, 8, { r: ["Room", 3] }, "Supro pushed hard · Telecaster", "Intro: Clean Warm g3, neck pickup, fingerpicked. Solo: middle single ≈ Page's tele bite."),
    { extras: [2, 9], sections: [sec("s1a", "Intro", "Am", "aeolian", 0), sec("s1b", "Verse", "Am", "minorPent", 5), sec("s1c", "Solo", "Am", "minorPent", 5), sec("s1d", "Outro", "Am", "minorPent", 12)] }),
  S("s2", "Sweet Child o' Mine", "Guns N' Roses", "D", "majorPent",
    T("Super Crunch", 6, 8, 1, 7, { r: ["Room", 2] }, "Marshall JCM (AFD) · Les Paul bridge", "Bridge humbucker. ISF high = UK mids. Intro riff cleaner — pick near the bridge."),
    { sections: [sec("s2a", "Intro riff", "D", "majorPent", 12), sec("s2b", "Verse", "D", "majorPent", 2), sec("s2c", "Solo", "E", "minorPent", 12)] }),
  S("s3", "Sultans of Swing", "Dire Straits", "Dm", "minorPent",
    T("Clean Bright", 3, 3, 4, 5, { r: ["Spring", 3] }, "Fender Vibrolux · Strat in-between · fingers", "Position 4 + fingerstyle = the quack. Keep gain low so the pops stay clean."),
    { extras: [6] }),
  S("s4", "Good News", "Mac Miller", "Dbm", "minorPent",
    T("Clean Warm", 2, 4, 5, 6, { r: ["Room", 3] }, "Mellow studio clean", "Soft neck-pickup plucks; let chords ring."), { extras: [2, 9] }),
  S("s5", "Hand Me Downs", "Mac Miller", "D", "majorPent",
    T("Clean Warm", 2, 4, 4, 7, { r: ["Room", 3] }, "Warm studio clean", "Gentle strums, position 4 sparkle."),),
  S("s6", "Surf", "Mac Miller", "Dbm", "minorPent",
    T("Clean Warm", 2, 4, 5, 6, { r: ["Hall", 3] }, "Dreamy clean + space", "Slow arpeggios; reverb does the gluing."), { extras: [2, 9] }),
  S("s7", "Knockin' on Heaven's Door", "Guns N' Roses", "G", "majorPent",
    T("Clean Warm", 3, 4, 4, 7, { r: ["Spring", 3] }, "Clean combo + spring reverb", "Open-chord strums. GN'R fills: jump to Super Crunch g6, bridge HB."), { extras: [3, 10] }),
  S("s8", "Yellow Ledbetter", "Pearl Jam", "E", "majorPent",
    T("Clean Warm", 3, 3, 5, 6, { d: ["Analogue", 3, 380], r: ["Room", 4] }, "Fender-style clean · Strat neck", "Fingers or feather-light pick; the wobble is bends and slides, not gain.")),
  S("s9", "Smells Like Teen Spirit", "Nirvana", "Fm", "minorPent",
    T("OD 1", 8, 3, 1, 10, { m: ["Chorus", 6] }, "DS-1 style dirt · Small Clone chorus", "Chorus is the clean verse — guitar volume ~3 verse, 10 chorus.")),
  S("s10", "Come As You Are", "Nirvana", "Em", "minorPent",
    T("Clean Warm", 3, 3, 5, 7, { m: ["Chorus", 7], r: ["Room", 2] }, "Fender Twin · Small Clone", "Low-string riff, heavy chorus. Solo: OD 1 g7, chorus stays on.")),
  S("s11", "Enter Sandman", "Metallica", "Em", "minorPent",
    T("OD 2", 8, 1, 1, 10, {}, "Mesa Dual Rectifier, scooped", "ISF near 0 = tight USA metal. All downpicks, hard palm mutes.")),
  S("s12", "Nothing Else Matters", "Metallica", "Em", "aeolian",
    T("Clean Warm", 2, 4, 5, 6, { r: ["Hall", 5] }, "Mesa clean / JC-120 · big hall", "Fingerpicked open Em. Solo: OD 1 g7, neck pickup."),
    { sections: [sec("s12a", "Intro", "Em", "aeolian", 0), sec("s12b", "Verse", "Em", "aeolian", 0), sec("s12c", "Solo", "Em", "minorPent", 12)] }),
  S("s13", "Californication", "Red Hot Chili Peppers", "Am", "minorPent",
    T("Clean Warm", 2, 4, 4, 7, { r: ["Room", 2] }, "Marshall Major clean · Strat", "Position 4 hollow pluck; barely brush the strings."), { extras: [2, 9] }),
  S("s14", "Hotel California (solo)", "Eagles", "Bm", "minorPent",
    T("Crunch", 5, 6, 2, 7, { d: ["Analogue", 4, 440] }, "Tweed pushed · LP burst · analog delay", "Delay fills the twin-guitar harmony space."),
    { sections: [sec("s14a", "Verse", "Bm", "aeolian", 0), sec("s14b", "Solo", "Bm", "minorPent", 7)] }),
  S("s15", "Comfortably Numb (solo)", "Pink Floyd", "Bm", "minorPent",
    T("OD 1", 7, 4, 5, 6, { d: ["Tape", 5, 470], r: ["Plate", 3] }, "Hiwatt + Big Muff · Strat neck", "Singing sustain — big slow bends, let repeats breathe."), { extras: [2, 9] }),
  S("s16", "Purple Haze", "Jimi Hendrix", "E", "minorPent",
    T("OD 1", 9, 6, 5, 5, {}, "Marshall Super Lead + Fuzz Face", "Fuzz ≈ max gain + neck single + tone ~5; clean up with guitar volume."), { extras: [4] }),
  S("s17", "Back in Black", "AC/DC", "E", "minorPent",
    T("Crunch", 5, 8, 1, 8, {}, "Marshall JMP, no pedals · SG", "Less gain than you think; punch is the right hand. No effects."), { extras: [4, 9] }),
  S("s18", "Johnny B. Goode", "Chuck Berry", "Bb", "majorPent",
    T("Clean Bright", 4, 3, 2, 8, { r: ["Spring", 2] }, "Small tweed on the edge · ES-350", "Edge-of-breakup; growls only when you dig in. Double-stops everywhere."), { extras: [3, 10] }),

  /* == classic rock == */
  S("n01", "Highway to Hell", "AC/DC", "A", "majorPent",
    T("Crunch", 5, 8, 1, 8, {}, "Marshall plexi crunch · SG", "Open A-D-G cowboy-chord riff; stop between chords, no wash."), { extras: [3, 10] }),
  S("n02", "Thunderstruck", "AC/DC", "B", "majorPent",
    T("Crunch", 5, 8, 1, 8, {}, "Marshall · SG", "Intro is one-string hammer-ons/pull-offs on B — no pick hand needed at first.")),
  S("n03", "You Shook Me All Night Long", "AC/DC", "G", "majorPent",
    T("Crunch", 5, 8, 1, 8, {}, "Marshall · SG", "G-C-D with double-stop fills from G major pentatonic."), { extras: [3, 10] }),
  S("n04", "Whole Lotta Love", "Led Zeppelin", "E", "minorPent",
    T("Crunch", 6, 7, 1, 7, {}, "Marshall pushed · Les Paul", "The riff is E blues; slide into the b7. Theremin part = ignore, play the riff."), { extras: [6] }),
  S("n05", "Kashmir", "Led Zeppelin", "D", "major",
    T("Crunch", 6, 7, 1, 7, { r: ["Room", 2] }, "Marshall · Danelectro (DADGAD)", "Original is DADGAD; in standard, play the climb on D with big open-string drones.")),
  S("n06", "Black Dog", "Led Zeppelin", "A", "minorPent",
    T("Crunch", 6, 7, 1, 8, {}, "Direct-into-desk crunch · Les Paul", "A blues lick chained around the pentatonic — count carefully, the turnaround is tricky."), { extras: [4, 6] }),
  S("n07", "Smoke on the Water", "Deep Purple", "Gm", "minorPent",
    T("Crunch", 6, 6, 1, 8, {}, "Marshall Major · Strat (interval riff)", "Riff = two-note fourths, fingers not pick (Blackmore used fingers). Solo Gm pent."), { extras: [6] }),
  S("n08", "Sunshine of Your Love", "Cream", "D", "minorPent",
    T("OD 1", 7, 6, 5, 4, {}, "Marshall + SG 'woman tone'", "Woman tone = neck pickup, tone rolled almost off, thick sustain."), { extras: [4, 6] }),
  S("n09", "La Grange", "ZZ Top", "Am", "minorPent",
    T("Crunch", 5, 6, 1, 8, {}, "Marshall-ish · Les Paul, pinch harmonics", "A-blues shuffle; the squeals are pinch harmonics on the pentatonic."), { extras: [4, 6] }),
  S("n10", "Sharp Dressed Man", "ZZ Top", "C", "minorPent",
    T("Crunch", 6, 6, 1, 8, {}, "Tight Marshall crunch", "C blues riff; slide into everything."), { extras: [6] }),
  S("n11", "Sweet Home Alabama", "Lynyrd Skynyrd", "D", "majorPent",
    T("Clean Bright", 4, 3, 2, 8, { r: ["Spring", 2] }, "Fender clean edge · Strat/LP mix", "D-C-G loop; fills from D major pentatonic. Keep it twangy — position 2."), { extras: [3, 10] }),
  S("n12", "Free Bird", "Lynyrd Skynyrd", "G", "majorPent",
    T("Crunch", 6, 7, 1, 8, { d: ["Analogue", 3, 420] }, "Marshall + LP for the solo · slide intro", "Ballad half: Clean Warm g3. Solo half: this tone, G major/Em pent boxes forever."),
    { sections: [sec("n12a", "Verse", "G", "major", 0), sec("n12b", "Solo", "Em", "minorPent", 12)] }),
  S("n13", "Simple Man", "Lynyrd Skynyrd", "Am", "minorPent",
    T("Clean Warm", 3, 4, 5, 7, { r: ["Room", 3] }, "Clean arpeggios, then pushed leads", "C-G-Am arpeggio loop; solo from Am pentatonic with OD 1 g6."), { extras: [2, 9] }),
  S("n14", "More Than a Feeling", "Boston", "G", "major",
    T("Super Crunch", 6, 5, 1, 7, { r: ["Room", 3] }, "Rockman-style compressed lead", "Verse arpeggios: Clean Bright. Chorus/lead: this — smooth, compressed, singing.")),
  S("n15", "Don't Stop Believin'", "Journey", "E", "major",
    T("Crunch", 5, 6, 1, 7, { d: ["Linear", 3, 320], r: ["Room", 3] }, "Marshall smooth lead · LP", "Piano owns the verse; the arpeggio pattern is E major, pinky workout.")),
  S("n16", "Livin' on a Prayer", "Bon Jovi", "Em", "minorPent",
    T("Super Crunch", 6, 6, 1, 8, { m: ["Chorus", 4] }, "JCM800 + talk box", "Talk box line — play it as Em pent on the neck; chorus fattens the chords.")),
  S("n17", "Paranoid", "Black Sabbath", "Em", "minorPent",
    T("OD 1", 7, 7, 1, 9, {}, "Laney pushed hard · SG", "Fast downstroke gallop on E; solo is Em pent up at fret 12."),),
  S("n18", "Iron Man", "Black Sabbath", "Bm", "minorPent",
    T("OD 1", 7, 6, 1, 8, {}, "Laney · SG, doom bends", "The riff is slow power-chord bends — bend up INTO each chord."),),
  S("n19", "Crazy Train", "Ozzy Osbourne", "F#m", "minorPent",
    T("Super Crunch", 7, 6, 1, 9, { r: ["Room", 2] }, "Marshall + MXR Distortion+ · Randy's LP", "Riff is F# minor with a natural 6 (Dorian flavour) — add the 9/6 extras."), { extras: [2, 9] }),
  S("n20", "Sweet Emotion", "Aerosmith", "A", "minorPent",
    T("Crunch", 5, 6, 1, 7, {}, "Marshall · LP, talkbox intro", "Bass owns the intro; guitar answers with A pent stabs and slides."), { extras: [4] }),
  S("n21", "Walk This Way", "Aerosmith", "E", "minorPent",
    T("Crunch", 6, 6, 1, 8, {}, "Marshall funk-rock · LP", "The riff is E blues with 16th-note funk timing — mute everything between notes."), { extras: [4, 6] }),
  S("n22", "Paradise City", "Guns N' Roses", "G", "majorPent",
    T("Super Crunch", 6, 8, 1, 7, { r: ["Room", 2] }, "Marshall (AFD) · LP", "Clean intro: Clean Warm + position 4. Riff: this tone, palm-muted G chugs.")),
  S("n23", "Patience", "Guns N' Roses", "G", "major",
    T("Clean Warm", 2, 4, 4, 7, { r: ["Room", 3] }, "Acoustic on record", "Whistle-and-strum ballad; works clean with soft open chords.")),
  S("n24", "Don't Cry", "Guns N' Roses", "Am", "minorPent",
    T("Clean Warm", 3, 5, 4, 7, { r: ["Hall", 3] }, "Clean verse · big lead", "Solo: Super Crunch g7, bridge HB, slow singing bends.")),
  S("n85", "November Rain", "Guns N' Roses", "B", "major",
    T("Clean Warm", 3, 6, 4, 7, { d: ["Analogue", 3, 400], r: ["Hall", 5] }, "Clean verse · huge lead for the outro", "Tuned down a half step on record, so it's C shapes sounding in B. Outro solo: OD g7, bridge HB, slow wide vibrato."),
    { sections: [
      sec("n85a", "Verse", "B", "major", 7),
      sec("n85b", "Solo 1", "B", "major", 7),
      sec("n85c", "Outro solo", "Bm", "aeolian", 7),
    ] }),
  S("n86", "Alone", "Heart", "F#", "major",
    T("Crunch", 5, 6, 4, 7, { m: ["Chorus", 3], d: ["Analogue", 3, 400], r: ["Hall", 6] }, "80s stack, huge room · Howard Leese", "Six sharps — F# major, and the verse sits on its iii (Bbm). Solo: OD 1 g7, bridge HB, full-step bends and slow wide vibrato."),
    { sections: [
      sec("n86a", "Verse", "Bbm", "aeolian", 6),
      sec("n86b", "Chorus", "F#", "major", 11),
      // The solo runs over the chorus loop — D#m–B–F#–C#, which is vi–IV–I–V
      // in F# major, so the parent scale is the same one the chorus uses.
      sec("n86c", "Solo", "F#", "major", 11),
    ] }),
  S("n87", "Choo Lo", "The Local Train", "B", "major",
    T("Super Crunch", 6, 6, 1, 7, { d: ["Analogue", 3, 400], r: ["Hall", 4] }, "Pushed British crunch · bridge humbucker", "Outro solo tone: bridge HB, enough gain to hold a bent note for three bars but not so much that the eighth-note shake in bar 124 turns to mush. Delay and a big reverb do the sustaining, not the gain knob."),
    { sections: [
      // The loop that runs under everything — B-E-A-C#m, read off the bass.
      sec("n87a", "The B-E-A-C#m loop", "B", "major", 4),
      sec("n87b", "Outro solo — the low half", "B", "major", 9),
      // Bars 124-128 sit at frets 17-21.
      sec("n87c", "Outro solo — the top", "B", "major", 16),
    ] }),

  /* == blues / blues-rock == */
  S("n25", "Pride and Joy", "Stevie Ray Vaughan", "E", "minorPent",
    T("Clean Bright", 5, 3, 4, 8, { r: ["Spring", 2] }, "Super Reverb cranked · Strat, heavy strings", "Texas shuffle — thumb hits low E on every beat. Dig in HARD; the amp edge is your drive."), { extras: [4, 6] }),
  S("n26", "The Thrill Is Gone", "B.B. King", "Bm", "minorPent",
    T("Clean Warm", 4, 4, 3, 7, { r: ["Room", 3] }, "Lab Series clean · Lucille (ES-355)", "One-note-at-a-time phrasing, butterfly vibrato. Say something, then stop."), { extras: [2, 9] }),
  S("n27", "Still Got the Blues", "Gary Moore", "Am", "aeolian",
    T("OD 1", 7, 5, 5, 6, { d: ["Analogue", 4, 430], r: ["Hall", 3] }, "Marshall + LP neck, huge sustain", "Long held bends with wide vibrato; every note aims at a chord tone.")),
  S("n28", "Parisienne Walkways", "Gary Moore", "Am", "aeolian",
    T("OD 1", 7, 5, 5, 6, { d: ["Analogue", 4, 450], r: ["Hall", 4] }, "Marshall · LP neck", "THE long-note song — one bend held for bars. Practice your vibrato here.")),
  S("n29", "Cocaine", "Eric Clapton", "E", "minorPent",
    T("Crunch", 5, 6, 2, 7, {}, "Tweed pushed · Strat", "E-D riff with lazy behind-the-beat pentatonic fills."), { extras: [4, 6] }),
  S("n30", "Wonderful Tonight", "Eric Clapton", "G", "major",
    T("Clean Warm", 3, 4, 5, 6, { r: ["Room", 3] }, "Clean Fender · Strat neck", "The hook is two-note bends into thirds — sweet, slow, quiet."),),
  S("n31", "Tears in Heaven", "Eric Clapton", "A", "major",
    T("Clean Warm", 2, 4, 5, 7, { r: ["Room", 2] }, "Nylon acoustic on record", "Fingerstyle; thumb keeps the bass moving under the melody."),),
  S("n32", "Folsom Prison Blues", "Johnny Cash", "E", "majorPent",
    T("Clean Bright", 4, 3, 2, 8, { r: ["Spring", 2] }, "Small tweed · Tele twang", "Boom-chicka rhythm — mute the bass strings with your palm the whole time."), { extras: [3, 10] }),

  /* == grunge / 90s == */
  S("n33", "Black", "Pearl Jam", "E", "major",
    T("Clean Warm", 3, 4, 4, 7, { r: ["Room", 3] }, "Fender clean · light break-up on choruses", "E-A loop; let open strings ring through the changes.")),
  S("n34", "Alive", "Pearl Jam", "A", "majorPent",
    T("Crunch", 6, 6, 1, 8, { r: ["Room", 2] }, "Marshall · LP", "Riff is A mixolydian-ish; solo switches to A minor pent — classic trick."), { extras: [3, 10] }),
  S("n35", "Even Flow", "Pearl Jam", "D", "majorPent",
    T("Crunch", 6, 6, 1, 7, {}, "Marshall · Strat", "Funky 16th strums with muted ghosts; solo D minor pent over major riff."), { extras: [4, 10] }),
  S("n36", "Man in the Box", "Alice in Chains", "Em", "minorPent",
    T("OD 1", 7, 5, 1, 9, { m: ["Phaser", 3] }, "Bogner-ish thick drive (talk box hook)", "Half-step down on record. Slow heavy bends; the phaser hints at the talkbox."),),
  S("n37", "Plush", "Stone Temple Pilots", "G", "major",
    T("Crunch", 6, 6, 1, 7, {}, "Big rock crunch · LP", "Descending G progression; let each chord bloom before the next.")),
  S("n38", "About a Girl", "Nirvana", "Em", "minorPent",
    T("Clean Warm", 3, 4, 4, 7, {}, "Unplugged vibe", "Em-G loop all song; strum with wrist, not arm.")),
  S("n39", "Lithium", "Nirvana", "D", "major",
    T("OD 1", 7, 3, 1, 9, { m: ["Chorus", 4] }, "Boston-scooped grunge dirt", "Quiet-loud again: chords clean-ish (roll volume), chorus slams."),),
  S("n40", "Zombie", "The Cranberries", "Em", "aeolian",
    T("OD 1", 6, 4, 1, 8, { m: ["Chorus", 3] }, "Big washy 90s distortion", "Em-C-G-D forever; eighth-note downstrokes, let it drone.")),
  S("n41", "Creep", "Radiohead", "G", "major",
    T("Clean Warm", 3, 4, 4, 7, {}, "Clean arps + THAT dead-note crunch stab", "The 'chunk-chunk' before each chorus: Super Crunch g7, muted strings."),),
  S("n42", "Karma Police", "Radiohead", "Am", "aeolian",
    T("Clean Warm", 3, 4, 4, 7, { r: ["Room", 3] }, "Warm clean piano-band blend", "Strummed Am-D-G-C; keep dynamics low until the outro.")),
  S("n43", "Wonderwall", "Oasis", "F#m", "minorPent",
    T("Crunch", 3, 6, 3, 7, { r: ["Room", 3] }, "Acoustic on record (capo 2)", "Capo 2, Em shapes. Keep the top two strings ringing in every chord."), { extras: [2, 9] }),
  S("n44", "Champagne Supernova", "Oasis", "A", "major",
    T("Clean Warm", 3, 5, 4, 7, { m: ["Chorus", 3], r: ["Hall", 3] }, "Layered cleans → big wall", "A-A/G-A/F# descent; outro solo = A major pent, Crunch g6.")),
  S("n45", "Everlong", "Foo Fighters", "Bm", "minorPent",
    T("OD 1", 7, 5, 1, 9, {}, "Mesa rhythm wall (drop D on record)", "Drop-D on record; in standard play Bm-G-D. 16th-note strums, palm-muted verses.")),
  S("n46", "Times Like These", "Foo Fighters", "D", "major",
    T("Crunch", 6, 6, 1, 8, {}, "Vox-y jangle into big rock", "Odd-time intro riff (7/4) — count it slow before you speed up.")),
  S("n47", "Basket Case", "Green Day", "Eb", "major",
    T("Super Crunch", 7, 5, 1, 9, {}, "Marshall + 'Pete' Strat HB", "All downstroke power chords (Eb on record = half-step down)."),),
  S("n48", "Boulevard of Broken Dreams", "Green Day", "Fm", "minorPent",
    T("OD 1", 6, 5, 1, 8, { m: ["Tremolo", 5] }, "Tremolo guitar hook", "The stutter is tremolo, not picking — set MOD to Tremolo and strum whole notes.")),
  S("n49", "Seven Nation Army", "The White Stripes", "Em", "minorPent",
    T("OD 2", 7, 4, 5, 7, {}, "Octave-fuzz 'bass' line", "The 'bass' is a guitar an octave down — play the riff on the low E, let OD 2 thicken it.")),
  S("n50", "Do I Wanna Know", "Arctic Monkeys", "Gm", "minorPent",
    T("OD 1", 5, 5, 1, 6, { r: ["Room", 2] }, "Fuzzy sludge riff", "Slow, behind the beat. Bend the b5 lazily."), { extras: [6] }),
  S("n51", "Where Is My Mind", "Pixies", "E", "major",
    T("Clean Warm", 3, 4, 4, 7, { r: ["Hall", 4] }, "Clean strums + lead wail", "E-C#m-G#-A; the two-note lead hook floats on reverb.")),
  S("n52", "Losing My Religion", "R.E.M.", "Am", "aeolian",
    T("Clean Warm", 2, 4, 4, 8, {}, "Mandolin on record", "Mandolin line sits fine on guitar: Am-Em arpeggios, high on the neck.")),
  S("n53", "Everybody Hurts", "R.E.M.", "D", "major",
    T("Clean Warm", 2, 4, 5, 7, { r: ["Room", 3] }, "Clean arpeggio ballad", "D-G arpeggios, straight 8ths — patience is the whole technique.")),

  /* == metal == */
  S("n54", "Master of Puppets", "Metallica", "Em", "minorPent",
    T("OD 2", 9, 1, 1, 10, {}, "Mesa rhythm, scooped tight", "ALL downpicks. Start at half speed; tightness before tempo."),),
  S("n55", "Fade to Black", "Metallica", "Bm", "minorPent",
    T("Clean Warm", 3, 4, 5, 7, { m: ["Chorus", 4], r: ["Hall", 3] }, "Clean arp intro → heavy outro", "Intro solo: OD 1 g7 neck. Outro riffing: OD 2 g9, downpicks."),
    { sections: [sec("n55a", "Intro", "Bm", "aeolian", 0), sec("n55b", "Verse", "Bm", "aeolian", 0), sec("n55c", "Outro", "Em", "minorPent", 12)] }),
  S("n56", "One", "Metallica", "Bm", "aeolian",
    T("Clean Warm", 3, 4, 4, 7, { d: ["Linear", 3, 350], r: ["Room", 3] }, "Clean intro → machine-gun outro", "Intro arpeggios clean; kick to OD 2 g9 ISF1 for the gallop."),
    { sections: [sec("n56a", "Intro", "Bm", "aeolian", 0), sec("n56b", "Heavy", "Em", "minorPent", 0), sec("n56c", "Solo", "Em", "minorPent", 12)] }),

  /* == Hendrix / classics == */
  S("n57", "Little Wing", "Jimi Hendrix", "Em", "minorPent",
    T("Clean Warm", 4, 5, 4, 7, { r: ["Room", 3] }, "Fender clean + Strat pos 4, thumb chords", "Chord-melody: thumb over the neck, hammer-on embellishments inside chords."), { extras: [2, 9] }),
  S("n58", "Hey Joe", "Jimi Hendrix", "E", "minorPent",
    T("Crunch", 4, 5, 4, 7, {}, "Just-breaking-up Marshall", "C-G-D-A-E cycle; fills from E pentatonic between every chord."), { extras: [3, 10] }),
  S("n59", "Voodoo Child (Slight Return)", "Jimi Hendrix", "E", "minorPent",
    T("OD 1", 8, 6, 5, 6, {}, "Marshall + Fuzz + wah", "No wah on your amp — fake it: pick near bridge (toe) then near neck (heel)."), { extras: [4, 6] }),
  S("n60", "While My Guitar Gently Weeps", "The Beatles", "Am", "aeolian",
    T("Crunch", 5, 5, 5, 6, { r: ["Room", 3] }, "Clapton's LP through cranked combo", "Weeping = bends that fall INTO chord tones. Neck pickup, sing every note.")),
  S("n61", "Let It Be", "The Beatles", "C", "major",
    T("Clean Warm", 3, 4, 4, 7, { r: ["Room", 2] }, "Leslie'd clean · solo through rotary", "Solo: Crunch g5, position 2; MOD Phaser 4 fakes the Leslie swirl.")),
  S("n62", "Come Together", "The Beatles", "Dm", "minorPent",
    T("Clean Warm", 3, 5, 5, 5, { m: ["Tremolo", 3] }, "Swampy clean", "The 'shoop' groove — muted Dm pent walk; leave space.")),
  S("n63", "Day Tripper", "The Beatles", "E", "majorPent",
    T("Crunch", 4, 5, 2, 8, {}, "Vox top-boost edge", "The riff IS the song — E major pent with the b3 passing note."), { extras: [3] }),
  S("n64", "House of the Rising Sun", "The Animals", "Am", "aeolian",
    T("Clean Warm", 3, 4, 4, 7, { r: ["Room", 3] }, "Arpeggiated combo clean", "Am-C-D-F arpeggios in 6/8 — the eternal picking-pattern exercise.")),

  /* == pop / soul / reggae == */
  S("n65", "Wicked Game", "Chris Isaak", "Bm", "aeolian",
    T("Clean Warm", 2, 4, 5, 5, { m: ["Tremolo", 4], r: ["Hall", 5] }, "Tremolo + huge reverb", "Slow slides between positions; the tremolo+hall IS the tone.")),
  S("n66", "Stand by Me", "Ben E. King", "A", "major",
    T("Clean Warm", 2, 4, 4, 7, { r: ["Room", 2] }, "Clean comping", "Bass line carries it: A-F#m-D-E. Great Number System practice (1-6-4-5)."),),
  S("n67", "Three Little Birds", "Bob Marley", "A", "major",
    T("Clean Bright", 3, 3, 2, 7, { r: ["Spring", 2] }, "Reggae skank", "Chop on beats 2 and 4 only — short, muted, bright.")),
  S("n68", "Redemption Song", "Bob Marley", "G", "major",
    T("Clean Warm", 2, 4, 4, 7, {}, "Solo acoustic on record", "G-Em-C-Am; the intro run is the G major scale walked down.")),
  S("n69", "Brown Eyed Girl", "Van Morrison", "G", "major",
    T("Clean Bright", 3, 3, 2, 8, { r: ["Spring", 2] }, "Bright clean combo", "The intro double-stop thirds run G major — slow it down, it's a great scale drill."), { extras: [3, 10] }),
  S("n70", "Purple Rain", "Prince", "Bb", "major",
    T("Clean Warm", 3, 5, 5, 6, { m: ["Chorus", 4], r: ["Hall", 6] }, "Huge hall + chorus · solo on neck HB", "Solo: OD 1 g7, neck, Bb major pent — melodic, not fast."),),
  S("n71", "Hallelujah", "Leonard Cohen", "C", "major",
    T("Clean Warm", 2, 4, 5, 7, { r: ["Room", 3] }, "Fingerpicked clean", "C-Am-F-G in 6/8; arpeggiate and let every note overlap.")),
  S("n72", "Hey There Delilah", "Plain White T's", "D", "major",
    T("Clean Warm", 2, 4, 5, 7, {}, "Bare fingerpicked clean", "Two-finger pinch pattern D-F#m; nothing else, keep it naked."),),
  S("n73", "Perfect", "Ed Sheeran", "Ab", "major",
    T("Clean Warm", 2, 4, 5, 7, { r: ["Room", 2] }, "Acoustic ballad", "6/8 fingerpicking; on record it's Ab (capo 1, G shapes)."),),
  S("n74", "Thinking Out Loud", "Ed Sheeran", "D", "major",
    T("Clean Warm", 3, 4, 4, 6, {}, "Soul clean, plucked chords", "The groove is muted 16th plucks on 2&4 — right hand does everything."),),

  /* == punk == */
  S("n75", "Should I Stay or Should I Go", "The Clash", "D", "majorPent",
    T("Crunch", 5, 6, 1, 8, {}, "Raw Tele into cooking amp", "D-G-D stabs with stops — mute HARD in the gaps."), { extras: [3, 10] }),
  S("n76", "Blitzkrieg Bop", "Ramones", "A", "majorPent",
    T("Super Crunch", 7, 6, 1, 9, {}, "Marshall wall, downstrokes only", "A-D-E barre chords, all downstrokes, no fills, no mercy."),),
  S("n77", "I Wanna Be Sedated", "Ramones", "E", "majorPent",
    T("Super Crunch", 7, 6, 1, 9, {}, "Same wall, faster", "Two chords and attitude; endurance training for the picking wrist."),),

  /* == RHCP extras == */
  S("n78", "Under the Bridge", "Red Hot Chili Peppers", "E", "major",
    T("Clean Warm", 2, 4, 4, 7, { r: ["Room", 2] }, "Clean Strat, thumb-slap arpeggios", "Intro D-F# is its own world; verse arpeggios need position 4 sparkle.")),
  S("n79", "Otherside", "Red Hot Chili Peppers", "Am", "aeolian",
    T("Clean Warm", 3, 4, 4, 7, {}, "Dry clean funk", "Am-F-C-G; verse riff walks the A aeolian scale on two strings.")),
  S("n80", "Can't Stop", "Red Hot Chili Peppers", "Em", "minorPent",
    T("Clean Bright", 4, 4, 2, 8, {}, "Percussive dry funk", "Ghost-note 16ths — mute with the left hand, strum continuously."), { extras: [2, 9] }),
  S("n81", "Dani California", "Red Hot Chili Peppers", "Am", "minorPent",
    T("Crunch", 5, 5, 4, 7, {}, "Hendrix-y verse, big chorus", "Am-G-Dm loop; outro solo = Am pent, OD 1 g7, wah faked with pick position."), { extras: [2, 9] }),

  /* == Pink Floyd extras == */
  S("n82", "Wish You Were Here", "Pink Floyd", "G", "major",
    T("Clean Warm", 2, 4, 4, 7, { r: ["Room", 3] }, "Acoustic duet on record", "Intro riff = Em pent fills between G-shape strums; hammer-ons on the D string.")),
  S("n83", "Time (solo)", "Pink Floyd", "F#m", "minorPent",
    T("OD 1", 7, 4, 5, 6, { d: ["Tape", 4, 480], r: ["Plate", 3] }, "Hiwatt + Muff · Strat neck", "Bends up to the 9th — F#m pent + the 9 (add extras). Slow hands, big vibrato."), { extras: [2, 9] }),
  S("n84", "Another Brick in the Wall Pt. 2 (solo)", "Pink Floyd", "Dm", "minorPent",
    T("Crunch", 5, 4, 2, 8, { d: ["Analogue", 3, 440] }, "Funky verse · LP neck solo", "Verse: tight muted clean funk. Solo: Dm pent, every phrase lands on a chord tone."), { extras: [2, 9] }),
];

/* ---------- storage + migration ---------- */
const KEY = "songs.v2";
const OLD_SONGS = "songs.v1";
const OLD_TONES = "tones.v1";

const norm = (s) => String(s || "").toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]/g, "");

const readArr = (k) => { try { const v = JSON.parse(localStorage.getItem(k)); return Array.isArray(v) ? v : null; } catch { return null; } };

export const loadSongs = () => {
  const v2 = readArr(KEY);
  if (v2 && v2.length) {
    const ids = new Set(v2.map((s) => s.id));
    // Saved songs get the same blues promotion as the seeds — including ones
    // the user wrote themselves.
    return [...v2.map(normaliseSong), ...SEED_SONGS.filter((s) => !ids.has(s.id))];
  }
  // first run on the unified store: merge the old split libraries into the seeds
  const seeds = [...SEED_SONGS];
  const seedByTitle = new Map(seeds.map((s) => [norm(s.title), s]));
  const oldTones = readArr(OLD_TONES) || [];
  const toneByTitle = new Map(oldTones.map((t) => [norm(t.title), t]));

  for (const s of readArr(OLD_SONGS) || []) {
    const hit = seedByTitle.get(norm(s.title));
    if (hit) {
      // keep the user's practice edits, keep the seed's tone
      Object.assign(hit, { ...s, id: hit.id, tone: hit.tone });
    } else {
      const t = toneByTitle.get(norm(s.title));
      seeds.push({ ...s, tone: t ? stripToneMeta(t) : undefined });
    }
  }
  for (const t of oldTones) {
    if (!seedByTitle.has(norm(t.title)) && !seeds.some((s) => norm(s.title) === norm(t.title))) {
      const key = String(t.key || "E");
      seeds.push({
        id: t.id, title: t.title, artist: t.artist || "",
        root: key.replace(/m$/, "") || "E", minor: /m$/.test(key),
        scaleId: /m$/.test(key) ? "minorPent" : "majorPent", extras: [],
        tone: stripToneMeta(t),
      });
    }
  }
  return seeds;
};

const stripToneMeta = (t) => {
  const { id, title, artist, key, ...rest } = t;
  return rest;
};

export const saveSongs = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {} };

// a default tone for songs that don't have one yet
export const defaultTone = () => T("Clean Warm", 4, 5, 3, 8, {}, "", "");

/* ---------- batch 2: more RHCP + classics (m01…m42) ---------- */
SEED_SONGS.push(
  /* RHCP */
  S("m01", "Scar Tissue", "Red Hot Chili Peppers", "F", "majorPent",
    T("Clean Warm", 3, 4, 4, 7, { r: ["Room", 2] }, "Marshall clean-ish · Strat", "Sliding double-stops up the neck; the solo licks are F major pent with a blue b3."),
    { extras: [3] }),
  S("m02", "Snow (Hey Oh)", "Red Hot Chili Peppers", "Abm", "minorPent",
    T("Clean Bright", 3, 4, 4, 7, {}, "Dry bright clean · Strat", "The fast intro is a two-string pattern — practice the picking loop slowly; accuracy over speed."),
    { extras: [2, 9] }),
  S("m03", "Give It Away", "Red Hot Chili Peppers", "Am", "minorPent",
    T("Crunch", 5, 5, 1, 8, {}, "Funky drive · Strat bridge", "One-chord funk — the riff is rhythm, not notes. Mute everything between stabs."),
    { extras: [4, 9] }),
  S("m04", "Suck My Kiss", "Red Hot Chili Peppers", "E", "minorPent",
    T("OD 1", 6, 5, 1, 8, {}, "Pushed Marshall · Strat bridge", "Heavy funk-rock stabs on E; the b5 slide is the hook."),
    { extras: [6] }),

  /* rock / classics */
  S("m05", "Money for Nothing", "Dire Straits", "Gm", "minorPent",
    T("Crunch", 6, 4, 2, 5, {}, "Laney + wah half-cocked (the 'brown' tone)", "The honk comes from a fixed half-open wah — position 2 with tone ~5 fakes it. Fingers, no pick."),
    { extras: [4] }),
  S("m06", "Since I've Been Loving You", "Led Zeppelin", "Cm", "aeolian",
    T("Crunch", 5, 6, 5, 6, { r: ["Hall", 3] }, "Marshall on the edge · LP neck", "Slow 6/8 minor blues — dynamics from a whisper to a scream, mostly in the right hand."),
    { extras: [6] }),
  S("m07", "Take It Easy", "Eagles", "G", "majorPent",
    T("Clean Bright", 3, 3, 2, 8, { r: ["Spring", 2] }, "Fender clean twang", "Country-rock strums with G major pent fills; keep it bouncy."),
    { extras: [3, 10] }),
  S("m08", "Proud Mary", "Creedence Clearwater Revival", "D", "majorPent",
    T("Crunch", 4, 5, 2, 8, {}, "Kustom amp edge · Tele-ish", "The intro C-A hits, then chug on D. Swampy = slightly behind the beat."),
    { extras: [3, 10] }),
  S("m09", "Twist and Shout", "The Beatles", "D", "majorPent",
    T("Clean Bright", 4, 4, 2, 8, {}, "Vox AC30 pushed", "D-G-A forever; stabs short and bright."),),
  S("m10", "Hey Jude", "The Beatles", "F", "major",
    T("Clean Warm", 2, 4, 4, 7, {}, "Clean strums behind the piano", "F-C-Bb; the outro is one long I-bVII-IV singalong."),),
  S("m11", "Every Breath You Take", "The Police", "Ab", "major",
    T("Clean Warm", 2, 4, 4, 8, { m: ["Chorus", 5], r: ["Room", 2] }, "Compressed chorus clean · Strat", "Add9 arpeggios with a stretch (on record it's Ab — many play G shapes, capo 1). Chorus is essential."),),
  S("m12", "With or Without You", "U2", "D", "major",
    T("Clean Warm", 3, 4, 2, 8, { d: ["Multi", 5, 410], r: ["Room", 3] }, "The Edge: dotted-eighth delay · Strat", "Two notes + delay does the arranging. Play straight 8ths and let the Multi delay make the pattern."),),
  S("m13", "Ain't Talkin' 'bout Love", "Van Halen", "Am", "minorPent",
    T("Super Crunch", 7, 6, 1, 9, { m: ["Phaser", 5] }, "Marshall 'brown sound' + Phase 90", "Am arpeggio riff with attitude; the phaser swirl is half the character."),),
  S("m14", "Rock You Like a Hurricane", "Scorpions", "Em", "minorPent",
    T("Super Crunch", 7, 7, 1, 9, {}, "Marshall stack", "Em-G-C-D power chords; leave the open-string gap before each hit."),),
  S("m15", "More Than Words", "Extreme", "G", "major",
    T("Clean Warm", 2, 4, 4, 7, { r: ["Room", 2] }, "Acoustic duet on record", "Percussive fingerstyle — slap the strings on 2 and 4 while picking the chords."),),
  S("m16", "(I Can't Get No) Satisfaction", "The Rolling Stones", "E", "majorPent",
    T("OD 1", 8, 5, 1, 6, {}, "Maestro Fuzz-Tone · the riff that sold fuzz", "Max-ish gain + tone rolled down fakes the fuzz box. Riff = three notes, all attitude."),
    { extras: [3, 10] }),
  S("m17", "Paint It Black", "The Rolling Stones", "Em", "aeolian",
    T("Clean Bright", 4, 4, 2, 8, {}, "Bright clean (sitar on record)", "The melody walks E harmonic-ish minor — try adding the ♮7 from the vocabulary panel."),
    { extras: [11] }),
  S("m18", "Angie", "The Rolling Stones", "Am", "aeolian",
    T("Clean Warm", 2, 4, 4, 7, { r: ["Room", 2] }, "Acoustic ballad", "Am-E-G-F; the little runs between chords are the song."),),
  S("m19", "Lonely Boy", "The Black Keys", "E", "minorPent",
    T("OD 1", 7, 5, 1, 7, {}, "Fuzzy garage tone", "One riff, huge groove. Slightly loose timing is the style."),
    { extras: [6] }),
  S("m20", "Dream On", "Aerosmith", "Fm", "aeolian",
    T("Clean Warm", 3, 4, 5, 7, { r: ["Hall", 3] }, "Clean arpeggios building to a scream", "F minor arpeggio staircase; switch to Super Crunch g7 for the climax."),),
  S("m21", "No Surprises", "Radiohead", "F", "major",
    T("Clean Warm", 2, 4, 5, 8, { r: ["Room", 2] }, "Music-box clean high on the neck", "The riff sits way up around fret 10 on the top strings — let every note ring into the next."),),
  S("m22", "Yellow", "Coldplay", "B", "major",
    T("Clean Warm", 3, 4, 4, 7, { r: ["Room", 3] }, "Shimmery clean strums", "In B (on record the guitar is tuned oddly — standard works fine with B-F#-E)."),),
  S("m23", "Don't Look Back in Anger", "Oasis", "C", "major",
    T("Crunch", 4, 6, 2, 7, { r: ["Room", 2] }, "Epiphone through cooking Marshall", "C-G-Am-E strums; solo is C major pent up high, gain up to 6."),
    { extras: [3] }),
  S("m24", "When I Come Around", "Green Day", "G", "majorPent",
    T("Crunch", 6, 5, 1, 8, {}, "Marshall wall, mid-gain", "G-D-Em-C power shapes, all downstrokes, palm-light."),),
  S("m25", "Good Riddance (Time of Your Life)", "Green Day", "G", "major",
    T("Clean Warm", 2, 4, 4, 7, {}, "Solo acoustic on record", "G-C-D with the famous double-pick flub — keep the G-string drone through everything."),),
  S("m26", "Island in the Sun", "Weezer", "Em", "minorPent",
    T("Crunch", 4, 5, 2, 7, { r: ["Room", 2] }, "Soft fuzz-lite", "Em-Am-D-G loop; the lead break is simple Em pent — sing it, don't shred it."),
    { extras: [2, 9] }),
  S("m27", "Texas Flood", "Stevie Ray Vaughan", "G", "minorPent",
    T("Crunch", 5, 3, 4, 8, { r: ["Spring", 2] }, "Super Reverb, cranked · Strat", "Slow G blues. Big bends, thick strings, dig HARD — the amp edge is the drive."),
    { extras: [4, 6] }),
  S("m28", "White Room", "Cream", "Dm", "minorPent",
    T("OD 1", 7, 6, 5, 5, {}, "Marshall + wah · SG", "The wah vocal solo — fake it with pick position: bridge-ward = toe down, neck-ward = heel."),
    { extras: [2, 9] }),
  S("m29", "Layla", "Derek & the Dominos", "Dm", "minorPent",
    T("OD 1", 7, 5, 2, 7, {}, "Champ cranked · Strat ('Brownie')", "THE riff: Dm pent with the high bend answered low. Duet with yourself between octaves."),
    { extras: [2, 9] }),
  S("m30", "The Chain", "Fleetwood Mac", "Em", "minorPent",
    T("Crunch", 5, 5, 1, 7, {}, "Tight mid-gain", "Verse fingerpicked and dry; the famous outro riff climbs Em pent on the low strings."),),
  S("m31", "Beat It", "Michael Jackson", "Em", "minorPent",
    T("Super Crunch", 7, 5, 1, 9, {}, "Rocked-up studio stack (EVH solo)", "Riff = Em-D-Em on power chords. The solo's tapping is a bonus level — the riff is the lesson."),),
  S("m32", "Billie Jean", "Michael Jackson", "F#m", "minorPent",
    T("Clean Bright", 3, 3, 2, 7, {}, "Dry funk clean", "Chorus stabs only — short 16th chops with the left hand muting the rest."),
    { extras: [2, 9] }),
  // Sections follow the BAR NUMBERS of the Live in LA transcription, so a
  // section here and a page of the tab are the same thing — which is the only
  // way an eighty-seven bar song gets learned a piece at a time.
  S("m33", "Slow Dancing in a Burning Room", "John Mayer", "Dbm", "minorPent",
    T("Clean Warm", 5, 4, 5, 6, { d: ["Analogue", 2, 380], r: ["Room", 4] }, "Two Rock Custom Reverb · Strat neck (Where the Light Is)", "Thumb-over chords with hammered embellishments; the intro lick is the whole vibe. ♩=72. Live in LA is warmer and pushed harder than the record — for the solo from bar 58 go Crunch g6 on the neck pickup and let the guitar's volume knob do the rest."),
    { extras: [2, 9], sections: [
      sec("m33a", "Intro (bars 1-13)", "Dbm", "minorPent", 4),
      sec("m33b", "Verse (14-31)", "Dbm", "minorPent", 4),
      sec("m33c", "Chorus (32-39)", "Dbm", "minorPent", 7),
      sec("m33d", "Bridge (40-48)", "Dbm", "dorian", 9),
      sec("m33e", "Chorus 2 (49-57)", "Dbm", "minorPent", 9),
      // The solo runs over the chorus loop — D#m–B–F#–C#, which is vi–IV–I–V
      // in F# major, so the parent scale is the same one the chorus uses.
      sec("m33f", "Solo (58-86)", "Dbm", "dorian", 9),
    ] }),
  S("m34", "Gravity", "John Mayer", "G", "majorPent",
    T("Clean Warm", 4, 4, 4, 6, { r: ["Room", 3] }, "Clean edge · Strat pos 4", "Slow G major pent with the b3 curl — one note per bar can be enough."),
    { extras: [3] }),
  S("m35", "For Whom the Bell Tolls", "Metallica", "Em", "minorPent",
    T("OD 2", 8, 2, 1, 10, {}, "Mesa scoop", "Half-time stomp; every chord is a downpick with a palm mute release."),),
  S("m36", "The Trooper", "Iron Maiden", "Em", "minorPent",
    T("Super Crunch", 7, 6, 1, 9, {}, "Marshall crunch (not too much gain!)", "Gallop: down-down-up at speed. Maiden runs LESS gain than you think — clarity is the sound."),
    { extras: [2, 9] }),
  S("m37", "Symphony of Destruction", "Megadeth", "Em", "minorPent",
    T("OD 2", 8, 3, 1, 10, {}, "Tight scooped rhythm", "March riff in E; the phrygian b2 stab is the flavour — add it from the vocabulary panel."),
    { extras: [1] }),
  S("m38", "Walk", "Pantera", "E", "minorPent",
    T("OD 2", 8, 2, 1, 10, {}, "Randall solid-state grind", "The groove riff leans on the b5 slide. Tune-vibe: Dime was slightly flat; standard works."),
    { extras: [6] }),
  S("m39", "Crazy Little Thing Called Love", "Queen", "D", "majorPent",
    T("Clean Bright", 4, 3, 2, 8, { d: ["Tape", 3, 120], r: ["Spring", 2] }, "Rockabilly clean + slapback", "120ms slapback = instant rockabilly. D-G-C strums, solo on D major pent."),
    { extras: [3, 10] }),
  S("m40", "Free Fallin'", "Tom Petty", "F", "major",
    T("Clean Bright", 3, 4, 2, 8, { r: ["Room", 2] }, "Jangly 12-string-ish clean", "On record it's F — most play D shapes with a capo on 3. Let the open strings ring."),),
  S("m41", "Fortunate Son", "Creedence Clearwater Revival", "A", "majorPent",
    T("Crunch", 4, 5, 1, 8, {}, "Kustom edge", "The intro riff walks A-G-D; verse is choked stabs on A."),
    { extras: [3, 10] }),
  S("m42", "You Really Got Me", "The Kinks", "G", "majorPent",
    T("OD 1", 7, 6, 1, 7, {}, "Slashed-speaker fuzz (Dave Davies' Elpico)", "Two-chord shove: F-G all downstrokes. The nasty tone IS the song — don't clean it up."),
    { extras: [3, 10] })
);
