import React, { useEffect, useMemo, useRef, useState } from "react";
import { ROOTS, DEG, INTERVALS, SCALES, CHORDS, DIATONIC, buildNoteNames, noteNameToPc, midiToFreq } from "../theory/engine.js";
import { C, keyToneStyle } from "../ui/theme.js";
import Neck from "./Neck.jsx";
import { SEED_SONGS } from "../data/songs.js";

/**
 * THE THEORY MANUAL — one scrolling page that teaches the whole map,
 * from "what is a note" to "soloing over changes", told as a story and
 * proven with songs from YOUR library (every example opens in
 * Songs & Tones with your Blackstar settings ready). Scroll-reveal
 * animations live in index.css (.th-reveal), honouring reduced motion.
 */

const MAJOR = SCALES.major.ints;

/* ---------- scroll machinery ---------- */
function useProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const on = () => {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      setP(max > 0 ? Math.min(1, el.scrollTop / max) : 0);
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return p;
}

function Reveal({ children, delay = 0 }) {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={"th-reveal" + (on ? " in" : "")} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>{children}</div>;
}

/* ---------- shared bits ---------- */
function GoLink({ go, page, children }) {
  return (
    <button className="link sm" style={{ cursor: "pointer", borderColor: C.sun, color: C.sun }} onClick={() => go && go(page)}>
      {children}
    </button>
  );
}

function Apps({ go, items, label = "Practice this in the app" }) {
  return (
    <div className="th-apps">
      <span className="eyebrow" style={{ color: C.sun }}>{label}</span>
      {items.map(([page, text]) => <GoLink key={page + text} go={go} page={page}>{text}</GoLink>)}
    </div>
  );
}

/* song examples pulled from YOUR library — clicking opens Songs & Tones */
const SONG_BY_ID = new Map(SEED_SONGS.map((s) => [s.id, s]));
function SongRefs({ go, refs }) {
  const open = (id) => {
    try { localStorage.setItem("songs.sel", id); } catch {}
    go && go("songs");
  };
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>🎵 Hear it in songs you already have — tap to open with your amp settings</div>
      {refs.map(([id, why]) => {
        const s = SONG_BY_ID.get(id);
        if (!s) return null;
        return (
          <div key={id} className="th-songref">
            <button className="chip" onClick={() => open(id)} title="Open in Songs & Tones">
              {s.title} <span style={{ opacity: 0.7, fontSize: 10 }}>{s.artist} · {s.root}{s.minor ? "m" : ""}</span>
            </button>
            <span className="why">{why}</span>
          </div>
        );
      })}
    </div>
  );
}

function Chapter({ id, level, title, ghost, children }) {
  return (
    <section id={id} className="th-chapter">
      <span className="th-ghost" aria-hidden="true">{ghost}</span>
      <Reveal>
        <div className="eyebrow">{level}</div>
        <h2 className="th-title mono">{title}</h2>
      </Reveal>
      {children}
    </section>
  );
}

function P({ children, delay = 80 }) {
  return <Reveal delay={delay}><p className="th-prose">{children}</p></Reveal>;
}

/* ==================================================================== */

export default function TheoryPage({ go }) {
  const progress = useProgress();
  const audioRef = useRef(null);

  const tone = (freq, when = 0, dur = 0.8, vol = 0.24) => {
    try {
      if (!audioRef.current) audioRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const t0 = ctx.currentTime + when;
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), g2 = ctx.createGain();
      o.type = "triangle"; o.frequency.value = freq;
      o2.type = "sine"; o2.frequency.value = freq * 2; g2.gain.value = 0.25;
      o2.connect(g2); g2.connect(g); o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.start(t0); o2.start(t0); o.stop(t0 + dur + 0.05); o2.stop(t0 + dur + 0.05);
    } catch (e) {}
  };
  const playMidi = (m, when = 0, dur = 0.8) => tone(midiToFreq(m), when, dur);

  const TOC = [
    ["ch1", "1 · Pitch"], ["ch2", "2 · 12 Notes"], ["ch3", "3 · Intervals"],
    ["ch4", "4 · Scales"], ["ch5", "5 · Chords"], ["ch6", "6 · Keys"], ["ch7", "7 · Modes"],
  ];
  const jump = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const namesC = useMemo(() => buildNoteNames("C"), []);
  const [circleSel, setCircleSel] = useState(0);
  const [ivSel, setIvSel] = useState(7);
  const playInterval = (s) => { setIvSel(s); playMidi(57); playMidi(57 + s, 0.55); };
  const [labScale, setLabScale] = useState("major");
  const [labRoot, setLabRoot] = useState("A");
  const labSet = new Set(SCALES[labScale].ints);
  const [labChord, setLabChord] = useState("maj");
  const ch = CHORDS[labChord];
  const strum = () => ch.ints.forEach((iv, i) => playMidi(57 + iv, i * 0.06, 1.0));
  const [ladderKey, setLadderKey] = useState("C");
  const ladNames = useMemo(() => buildNoteNames(ladderKey), [ladderKey]);
  const ladPc = noteNameToPc(ladderKey);
  const playTriad = (d) => {
    [0, 2, 4].forEach((k, i) => {
      const idx = d + k;
      playMidi(48 + ladPc + MAJOR[idx % 7] + 12 * Math.floor(idx / 7), i * 0.14, 0.7);
    });
  };
  const MODES = ["Ionian", "Dorian", "Phrygian", "Lydian", "Mixolydian", "Aeolian", "Locrian"];
  const MODE_Q = ["major", "minor", "minor", "major", "major", "minor", "diminished"];
  const [modeDeg, setModeDeg] = useState(0);

  return (
    <div className="page">
      <div className="th-progress" style={{ width: `${progress * 100}%` }} />

      <div className="eyebrow">Guitar Theory Coach · The Manual</div>
      <h1 className="page-title">MUSIC THEORY, DECODED</h1>
      <p className="page-sub">
        The whole map in one scroll — told as a story, heard out loud, and proven with songs from your own library.
        Music is the language; the guitar is the machine.
      </p>

      <nav className="th-toc" aria-label="Chapters">
        {TOC.map(([id, label]) => (
          <button key={id} className="btn" style={{ padding: "5px 9px", fontSize: 11 }} onClick={() => jump(id)}>{label}</button>
        ))}
      </nav>

      {/* ============ 1 · PITCH ============ */}
      <Chapter id="ch1" level="Level 1 — the raw material" title="A NOTE IS A SPEED" ghost="01">
        <P>
          Start with what's physically happening when you hit your open A string. The string swings back and forth 110
          times every second, shoving air at your ear each pass. Your brain counts the shoves and files the result away
          as a <b>pitch</b>. That's all a note is — a speed, measured in Hz. Slow wobble, low note. Fast wobble, high note.
          When your Blackstar "makes it louder", it's pushing the same wobble with more air. Nothing mystical yet.
        </P>
        <P delay={120}>
          The first mystical thing happens when you fret that A string at the 12th fret. You've pinned the string at
          exactly half its length, so it vibrates exactly twice as fast — 220 Hz. And here's the strange part your ear
          already knows: 220 doesn't sound like a <i>different</i> note. It sounds like the <b>same note, higher</b> —
          the way a kid and their parent can sing "the same tune" in different voices. The ancient Greeks noticed this
          with stretched strings two and a half thousand years ago: <b>halve the string, double the speed, and the note
          comes home</b>. We call that distance an <b>octave</b>, and it's the one interval physics hands us for free.
          Every fretboard in this app marks it with the double dot at fret 12 — the point where the whole story restarts.
        </P>
        <P delay={160}>
          Everything else in music — every scale, chord, key and mode in the chapters below — is just humanity arguing
          about how to slice the space <i>inside</i> that octave. Keep that in mind and theory stops being rules and
          starts being a map of one small, loopable territory.
        </P>
        <Reveal delay={200}>
          <div className="th-lab">
            <div className="eyebrow" style={{ marginBottom: 8 }}>Hear it — the same note at four speeds</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[55, 110, 220, 440].map((hz, i) => (
                <button key={hz} className="btn" onClick={() => tone(hz, 0, 1.2)}>A · {hz} Hz {i === 1 ? "· open A string" : ""}</button>
              ))}
              <button className="btn" style={{ borderColor: C.sunDeep, color: C.sun }} onClick={() => { tone(110, 0, 1.4); tone(220, 0, 1.4); }}>both together — hear them fuse</button>
            </div>
            <div className="mono" style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>
              Play 110 and 220 together: they melt into one sound. That fusion is WHY octaves get the same letter name.
            </div>
          </div>
        </Reveal>
        <SongRefs go={go} refs={[
          ["n49", "The whole 'bass line' is a guitar dropped an octave — one riff, same note names, lower speed."],
          ["s16", "Hendrix ran an Octavia pedal on the solo: the same notes doubled an octave UP. Octaves as an effect."],
        ]} />
        <Reveal delay={220}><Apps go={go} items={[["decoder", "→ Decoder: tap any note, read its exact Hz"]]} /></Reveal>
      </Chapter>

      {/* ============ 2 · THE 12 NOTES ============ */}
      <Chapter id="ch2" level="Level 2 — the alphabet" title="TWELVE NOTES, THEN IT REPEATS" ghost="02">
        <P>
          So the octave is the loop. How many stops do you put inside it? Different cultures answered differently —
          some picked 5, some 7, some 22. The West eventually settled on <b>12 equal steps</b>, because 12 slices let
          you build pleasing combinations starting from ANY note (a trick called equal temperament that took centuries
          of argument, and that Bach threw a victory party for in sheet-music form). On your guitar the deal is beautifully
          honest: <b>one step = one fret</b>. That step is called a <b>semitone</b>. Twelve frets up any string, the loop
          closes and the letters repeat.
        </P>
        <P delay={120}>
          The naming is the only genuinely annoying part, and it's history's fault. Seven of the twelve got clean letters —
          A B C D E F G — because early church music only used those seven. The other five arrived later and were named
          <i> relative to their neighbours</i>: <b>♯ sharp = one fret up</b>, <b>♭ flat = one fret down</b>. So the note
          between C and D answers to two names, C♯ and D♭ — same fret, same sound, two spellings. Which name you use
          depends on the sentence you're writing (the key you're in) — exactly like choosing "their" vs "there". The
          Decoder spells notes for you correctly per key, so you never have to sweat it.
        </P>
        <Reveal delay={160}>
          <div className="th-lab">
            <div className="eyebrow" style={{ marginBottom: 8 }}>The chromatic clock — tap a note to hear it</div>
            <svg viewBox="0 0 260 260" style={{ maxWidth: 260, display: "block" }}>
              <circle cx="130" cy="130" r="98" fill="none" stroke={C.line} strokeWidth="1" strokeDasharray="3 4" />
              {namesC.map((n, pc) => {
                const a = (pc / 12) * Math.PI * 2 - Math.PI / 2;
                const x = 130 + Math.cos(a) * 98, y = 130 + Math.sin(a) * 98;
                const sel = pc === circleSel;
                return (
                  <g key={pc} className="th-cnote" onClick={() => { setCircleSel(pc); playMidi(60 + pc); }}>
                    <circle cx={x} cy={y} r="15" fill={sel ? C.sun : "var(--surface-hi)"} stroke={sel ? C.sunDeep : C.line} strokeWidth="1.5" />
                    <text x={x} y={y + 3.5} textAnchor="middle" fontSize="10" fontWeight="700" fill={sel ? "#fff" : C.ink} style={{ fontFamily: "ui-monospace, monospace" }}>{n}</text>
                  </g>
                );
              })}
              <text x="130" y="126" textAnchor="middle" fontSize="11" fill={C.muted} style={{ fontFamily: "ui-monospace, monospace" }}>12 semitones</text>
              <text x="130" y="140" textAnchor="middle" fontSize="11" fill={C.muted} style={{ fontFamily: "ui-monospace, monospace" }}>= 12 frets = 1 octave</text>
            </svg>
            <div className="mono" style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>
              Selected: <b style={{ color: C.sun }}>{namesC[circleSel]}</b> — {circleSel} semitone{circleSel === 1 ? "" : "s"} above C.
              Walking clockwise is walking up one string, fret by fret.
            </div>
          </div>
        </Reveal>
        <SongRefs go={go} refs={[
          ["n37", "The verse rides a bass line walking DOWN fret by fret — a pure chromatic descent you can hear."],
          ["m20", "The intro is a chromatic staircase: each chord slides one semitone at a time. Spooky = semitones."],
          ["s3", "Knopfler stitches his licks together with chromatic passing notes — the 'in-between' frets as glue."],
        ]} />
        <Reveal delay={200}><Apps go={go} items={[["decoder", "→ Decoder (Notes mode): all 12 on the whole neck"], ["ear", "→ Ear Trainer: learn their sound"]]} /></Reveal>
      </Chapter>

      {/* ============ 3 · INTERVALS ============ */}
      <Chapter id="ch3" level="Level 3 — distances" title="INTERVALS: THE FEELING OF A GAP" ghost="03">
        <P>
          Here's the idea that flips theory from memorising to understanding: <b>your ear doesn't care what note you play.
          It cares about the distance to the note before it.</b> Play any two notes 7 frets apart and you get the same
          hollow, heroic ring — whether you start on E or on B♭. That distance is an <b>interval</b>, and each of the
          twelve has a personality so consistent that Hollywood runs on them: two notes ONE fret apart is the Jaws shark
          (pure dread); five frets is "Here Comes the Bride" (arrival); seven frets is the Star Wars leap (heroism).
          You already speak this language — you've just never seen it written down.
        </P>
        <P delay={120}>
          Two intervals deserve their own paragraphs. The <b>perfect 5th</b> (7 frets) is so stable that when you add
          distortion — which multiplies sounds together and punishes any friction — it's practically the only interval
          left standing. That's the <b>power chord</b>, and it's why metal is built from 5ths. At the exact opposite pole
          sits the <b>tritone</b> (6 frets — dead centre of the octave, belonging to neither end). Medieval theorists
          nicknamed it <i>diabolus in musica</i>, the devil in music, and wrote rules about avoiding it. Rock guitarists
          read that as a product recommendation.
        </P>
        <Reveal delay={160}>
          <div className="th-lab">
            <div className="eyebrow" style={{ marginBottom: 8 }}>The flavour shelf — pick a distance, hear root → note</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((s) => (
                <button key={s} className={"btn" + (ivSel === s ? " on" : "")} style={{ padding: "5px 9px" }} onClick={() => playInterval(s)}>
                  {INTERVALS[s].ab} <span style={{ opacity: 0.6, fontSize: 10 }}>{s}fr</span>
                </button>
              ))}
            </div>
            <div style={{ marginTop: 12, position: "relative", height: 40, maxWidth: 560 }}>
              <div style={{ position: "absolute", left: 0, right: 0, top: 19, height: 2, background: C.line }} />
              {Array.from({ length: 13 }, (_, f) => (
                <div key={f} style={{ position: "absolute", left: `${(f / 12) * 96}%`, top: 12, width: 1, height: 16, background: C.line, opacity: 0.5 }} />
              ))}
              <div className="node still" style={{ position: "absolute", left: 0, top: 8, width: 24, height: 24, background: C.sun, border: `2px solid ${C.sunDeep}`, color: "#fff", fontSize: 10 }}>1</div>
              <div className="node still" style={{ position: "absolute", left: `${(ivSel / 12) * 96}%`, top: 8, width: 24, height: 24, background: C.cyan, border: "2px solid #1F7E96", color: "#06222B", fontSize: 9 }}>{INTERVALS[ivSel].ab}</div>
            </div>
            <div className="mono" style={{ fontSize: 12, marginTop: 6 }}>
              <b style={{ color: C.cyan }}>{INTERVALS[ivSel].name}</b> — {ivSel} frets up one string.{" "}
              <span style={{ color: C.muted }}>{INTERVALS[ivSel].feel}</span>
            </div>
          </div>
        </Reveal>
        <SongRefs go={go} refs={[
          ["n07", "The most famous riff ever is two-note FOURTHS (5 frets), not power chords — that's its hollow stomp."],
          ["s16", "The intro stabs are a naked TRITONE (E against B♭) — the devil's interval as a hook."],
          ["n47", "Wall-to-wall perfect 5ths. Power-chord punk is interval theory with the distortion up."],
        ]} />
        <Reveal delay={200}><Apps go={go} items={[["decoder", "→ Decoder (Intervals mode): every distance from your root"], ["ear", "→ Ear Trainer: name intervals blind"]]} /></Reveal>
      </Chapter>

      {/* ============ 4 · SCALES ============ */}
      <Chapter id="ch4" level="Level 4 — engineered sequences" title="A SCALE IS A RECIPE, NOT A SHAPE" ghost="04">
        <P>
          Twelve notes is too many to use at once — every song would sound like a piano falling down stairs. So music
          works from a <b>palette</b>: pick roughly seven of the twelve, ignore the rest, and suddenly everything you
          play sounds like it belongs together. That palette is a <b>scale</b>, and the crucial insight is that it's
          defined by the <b>gaps, not the notes</b>. The major scale is the recipe <b>W-W-H-W-W-W-H</b> — whole step,
          whole step, half step… (whole = 2 frets, half = 1). Follow that recipe from C and you get C major; follow it
          from F♯ and you get F♯ major. Same recipe, different kitchen. This is why every page in this app asks for a
          root note first: the recipe needs a starting ingredient.
        </P>
        <P delay={120}>
          Inside any scale, one note is the boss. Not the loudest — the one everything <b>leans toward</b>, the note that
          sounds like coming home. This app draws it as the orange <b>Sun</b>. And one other note secretly runs the mood:
          the <b>3rd</b>. Four frets above home and the whole palette turns bright (major); three frets and it darkens
          (minor). One fret of difference carries almost the entire emotional weight of Western music — which is why the
          3rd is always cyan on our fretboards. Watch those two colours and you can read any diagram in the app at a glance.
        </P>
        <P delay={150}>
          Then there's the people's champion: the <b>pentatonic</b>. Take the seven-note scale and delete the two notes
          most likely to clash with the band. Five survivors, zero landmines. Cultures that never met — West African
          griots, Chinese court musicians, Scottish pipers, Delta bluesmen — all landed on this same five-note skeleton
          independently, because it's simply the set of notes that can't fail. It's the soloing scale on most of the 144
          songs in your library, and the reason a beginner's first pentatonic box already sounds like music.
        </P>
        <Reveal delay={180}>
          <div className="th-lab">
            <div className="eyebrow" style={{ marginBottom: 8 }}>Recipe lab — same neck you see everywhere in the app</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
              {["A", "C", "E", "G"].map((r) => (
                <button key={r} className={"chip" + (labRoot === r ? " on" : "")} onClick={() => setLabRoot(r)}>{r}</button>
              ))}
              <span style={{ width: 10 }} />
              {["major", "aeolian", "majorPent", "minorPent"].map((id) => (
                <button key={id} className={"btn" + (labScale === id ? " on" : "")} style={{ padding: "5px 9px" }} onClick={() => setLabScale(id)}>{SCALES[id].name}</button>
              ))}
            </div>
            <Neck
              root={labRoot}
              frets={12}
              onTap={(midi) => playMidi(midi)}
              resolve={(pc, semis, { names }) => {
                if (!labSet.has(semis)) return null;
                return { label: DEG[semis], ...keyToneStyle(semis), root: semis === 0, title: `${names[pc]} · ${DEG[semis]}` };
              }}
            />
            <div className="mono" style={{ fontSize: 11.5, color: C.muted }}>
              Formula: <b style={{ color: C.ink }}>{SCALES[labScale].formula || SCALES[labScale].name}</b> — orange = the Sun, cyan = the 3rd (mood switch), blue = the rest.
              Swap major ↔ pentatonic and watch which notes vanish.
            </div>
          </div>
        </Reveal>
        <SongRefs go={go} refs={[
          ["s1", "THE minor-pentatonic solo. Page barely leaves the five-note box — the box does the singing."],
          ["n11", "Those sweet country fills are D MAJOR pentatonic — the bright twin of the blues box."],
          ["m27", "Pentatonic plus ONE extra note — the ♭5 'blue note' — is the entire Texas blues language."],
          ["s12", "Pure natural minor (Aeolian), fingerpicked. The full seven-note palette in its saddest mood."],
        ]} />
        <Reveal delay={220}><Apps go={go} items={[["decoder", "→ Decoder (Scales mode): full 24 frets + 🌈 degrees"], ["songs", "→ Songs & Tones: the right scale per song section"]]} /></Reveal>
      </Chapter>

      {/* ============ 5 · CHORDS ============ */}
      <Chapter id="ch5" level="Level 5 — vertical stacks" title="CHORDS: THIRDS STACKED OUT OF A SCALE" ghost="05">
        <P>
          For most of history, music was a single line — one monk, one melody. Then somebody's choir-mate got bored,
          sang a different scale note at the SAME time, and harmony was born. The combination that stuck: sing a note,
          skip your neighbour, take the next one. That skip-one move is called a <b>third</b>, and stacking two of them —
          <b> 1, 3, 5</b> — makes a <b>triad</b>, the atom every chord is built from. When your library says a song is
          "G–C–D", it means three of these atoms taking turns.
        </P>
        <P delay={120}>
          The personality of a triad comes entirely from WHICH thirds you stacked, and there are only four combinations.
          Big third then small (4+3 frets): <b>major</b> — confident, home by dinner. Small then big (3+4): <b>minor</b> —
          same shape, heavier heart. Two small (3+3): <b>diminished</b> — the horror-movie doorbell, dying to move
          somewhere. Two big (4+4): <b>augmented</b> — the dream-sequence shimmer. That's the entire emotional engine:
          one fret in the middle of the stack. Glue a fourth note on top (another third) and you get 7th chords — the
          doorway to blues and jazz, where chords stop being furniture and start being conversation.
        </P>
        <Reveal delay={160}>
          <div className="th-lab">
            <div className="eyebrow" style={{ marginBottom: 8 }}>Stack lab — build it, hear it</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {Object.entries(CHORDS).map(([id, c]) => (
                <button key={id} className={"btn" + (labChord === id ? " on" : "")} style={{ padding: "5px 9px" }} onClick={() => setLabChord(id)}>{c.name}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {ch.ints.map((iv, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="mono" style={{ fontSize: 10, color: C.muted }}>+{INTERVALS[ch.ints[i] - ch.ints[i - 1]].name}→</span>}
                  <button className="btn" style={{ borderColor: (i === 0 ? C.sunDeep : i === 1 ? "#1F7E96" : C.line) }} onClick={() => playMidi(57 + iv)}>
                    <b style={{ color: i === 0 ? C.sun : i === 1 ? C.cyan : C.blue }}>{ch.labels[i]}</b>
                  </button>
                </React.Fragment>
              ))}
              <button className="btn" style={{ borderColor: C.sunDeep, background: C.sun, color: "#fff" }} onClick={strum}>▶ strum A{ch.sym}</button>
            </div>
            <div className="mono" style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>
              {ch.formula} — the gaps between the buttons ARE the chord. Try major, then minor: one button moves one fret.
            </div>
          </div>
        </Reveal>
        <SongRefs go={go} refs={[
          ["n64", "A guided tour of naked triads — Am, C, D, F arpeggiated one note at a time so you hear each stack."],
          ["s7", "G · D · Am · C — two majors, one minor, round and round. Hear the mood flip on the Am."],
          ["m18", "Am–E–G–F: minor and major triads taking turns telling the story. Chord quality AS the narrative."],
        ]} />
        <Reveal delay={200}><Apps go={go} items={[["chord", "→ Chord Builder: every place these tones live on the neck"]]} /></Reveal>
      </Chapter>

      {/* ============ 6 · KEYS ============ */}
      <Chapter id="ch6" level="Level 6 — the solar system" title="KEYS & THE NUMBER SYSTEM" ghost="06">
        <P>
          Now aim the chord machine at a whole scale. Build a triad on <i>each</i> of the seven degrees — using only
          scale notes — and you get the seven chords of a <b>key</b>: a family that all pull toward the same Sun. And
          here is the most useful fact in this entire manual: <b>the pattern of qualities is identical in every key</b>.
          Chords 1, 4 and 5 come out major. Chords 2, 3 and 6 come out minor. Chord 7 comes out diminished. Always. It's
          not a convention — it falls straight out of the W-W-H recipe, like clockwork gears meshing.
        </P>
        <P delay={120}>
          In 1950s Nashville, session players turned that fact into a superpower. Singers kept changing keys between
          takes, so charts with letter names kept going stale. Guitarist Neal Matthews started writing charts as
          <b> numbers</b> instead — 1, 4, 5, 6m — and suddenly one chart worked in every key: the band just aimed the
          numbers at whatever Sun the singer wanted. That shorthand, the <b>Nashville Number System</b>, is still how
          pros communicate, and it's why this app keeps drilling numbers into you. Learn "Let It Be" as C–G–Am–F and you
          know one song; learn it as <b>1–5–6m–4</b> and you know it in twelve keys — and you'll start recognising that
          same 1–5–6m–4 skeleton hiding inside half the radio.
        </P>
        <P delay={150}>
          One more piece of physics-turned-feeling: the <b>5 chord</b> contains the key's most restless notes, and they
          ache to collapse home into <b>1</b>. That ache — tension, then release — is the heartbeat of nearly every
          progression. Play 1 → 4 → 5 and stop. Feel how illegal it is to not play 1 again. That's the pull composers
          have been steering for four hundred years.
        </P>
        <Reveal delay={180}>
          <div className="th-lab">
            <div className="eyebrow" style={{ marginBottom: 8 }}>The seven chords of a key — tap a rung to hear it</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
              {ROOTS.map((r) => (
                <button key={r} className={"chip" + (ladderKey === r ? " on" : "")} onClick={() => setLadderKey(r)}>{r}</button>
              ))}
            </div>
            <div className="th-ladder">
              {DIATONIC.map((d, i) => {
                const pc = (ladPc + MAJOR[i]) % 12;
                const col = d.q === "Maj" ? C.sun : d.q === "dim" ? C.red : C.cyan;
                return (
                  <div key={i} className="th-rung" onClick={() => playTriad(i)} title={`play ${ladNames[pc]}${d.q === "min" ? "m" : d.q === "dim" ? "°" : ""}`}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: i === 0 ? C.sun : C.ink }}>{i + 1}</div>
                    <div style={{ fontSize: 10, color: C.muted }}>{d.rn}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: col, marginTop: 2 }}>{ladNames[pc]}{d.q === "min" ? "m" : d.q === "dim" ? "°" : ""}</div>
                  </div>
                );
              })}
            </div>
            <div className="mono" style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>
              Change the key chip: the letters change, the COLOURS never do. Now play 1 → 5 → 6 → 4 and name three songs that use it.
            </div>
          </div>
        </Reveal>
        <SongRefs go={go} refs={[
          ["n61", "C–G–Am–F = 1–5–6m–4, the most reused skeleton in pop. Learn it here, spot it everywhere."],
          ["m12", "Same numbers — 1–5–6m–4 in D — completely different song. THAT's why numbers beat letters."],
          ["m07", "1–4–5 with a country accent. Three chords, the whole key's gravity in miniature."],
        ]} />
        <Reveal delay={220}><Apps go={go} items={[["numbers", "→ Number System: the key map + drills"], ["decoder", "→ Decoder (Harmony mode): the chords on the neck"]]} /></Reveal>
      </Chapter>

      {/* ============ 7 · MODES ============ */}
      <Chapter id="ch7" level="Level 7 — moving the sun" title="MODES & SOLOING OVER CHANGES" ghost="07">
        <P>
          The finale is a plot twist, and it's older than everything above — the medieval church was doing this before
          major and minor even had names. Take the seven notes of C major. Don't add anything, don't remove anything.
          Just <b>decide a different note is home</b>. Land your phrases on D instead of C and those same seven notes
          rearrange their gravity around D — suddenly there's a moody ♭3 but a bright natural 6 in your orbit. That's
          <b> Dorian</b>. Make G home and you inherit a cocky ♭7: <b>Mixolydian</b>, the sound of classic rock. Make A
          home and you get the natural minor you already know (<b>Aeolian</b>). Seven notes, seven possible homes, seven
          <b> modes</b> — each named after an ancient Greek region, each just a different Sun for the same solar system.
        </P>
        <P delay={120}>
          Why should a guitarist care? Because this is the secret of soloing that actually follows the song. A beginner
          learns one box and wanders it no matter what the band plays. A player who gets modes knows the notes don't
          need to change when the chord changes — the <b>targets</b> do. Chord moves to A? Your 1 is A now; lean on A's
          chord tones. Chord moves to G? New Sun, new targets, same seven notes under your fingers. The Live Player's
          chord-follow view literally draws this: watch the glowing notes jump when the chord changes while the scale
          stays put. That's modes, animated.
        </P>
        <Reveal delay={160}>
          <div className="th-lab">
            <div className="eyebrow" style={{ marginBottom: 8 }}>Move the sun — seven notes of C major, seven homes</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {MODES.map((m, i) => (
                <button key={m} className={"btn" + (modeDeg === i ? " on" : "")} style={{ padding: "5px 9px" }}
                  onClick={() => { setModeDeg(i); [0, 2, 4].forEach((k, j) => playMidi(48 + MAJOR[(i + k) % 7] + 12 * Math.floor((i + k) / 7), j * 0.14)); }}>
                  <span style={{ opacity: 0.5, fontSize: 10, marginRight: 3 }}>{i + 1}</span>{m}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {MAJOR.map((iv, i) => {
                const sunHere = i === modeDeg;
                return (
                  <div key={i} className="node still" style={{
                    width: sunHere ? 40 : 34, height: sunHere ? 40 : 34, fontSize: 12,
                    background: sunHere ? C.sun : "var(--surface-hi)",
                    border: `2px solid ${sunHere ? C.sunDeep : C.line}`,
                    color: sunHere ? "#fff" : C.ink,
                    boxShadow: sunHere ? "0 0 0 4px rgba(255,122,46,.3)" : "none",
                  }}>
                    {namesC[iv]}
                  </div>
                );
              })}
            </div>
            <div className="mono" style={{ fontSize: 12, marginTop: 10 }}>
              <b style={{ color: C.sun }}>{namesC[MAJOR[modeDeg]]} {MODES[modeDeg]}</b>
              <span style={{ color: C.muted }}> · {MODE_Q[modeDeg]} · the same seven notes — only home moved.</span>
            </div>
          </div>
        </Reveal>
        <SongRefs go={go} refs={[
          ["n19", "F♯ minor with a bright natural 6 in the riff — that's the Dorian colour, hiding in a metal classic."],
          ["n01", "A–G–D: the ♭7 chord that 'shouldn't' be in A major. Mixolydian — rock's home dialect."],
          ["n40", "Em–C–G–D looping forever with no pull to a major home: Aeolian as an anthem."],
        ]} />
        <Reveal delay={200}>
          <Apps go={go} items={[["decoder", "→ Decoder (Modes & Progression): watch the sun move"], ["live", "→ Live Player: chase chord tones in real time"], ["songs", "→ Songs & Tones: apply it to real songs"]]} />
        </Reveal>
      </Chapter>

      {/* ============ outro ============ */}
      <Reveal>
        <div className="card" style={{ marginTop: 30, background: "rgba(62,155,214,.10)" }}>
          <div className="eyebrow" style={{ marginBottom: 6, color: C.blue }}>The practice loop</div>
          <div className="mono" style={{ fontSize: 13, lineHeight: 1.7 }}>
            Read a chapter → tap its song examples and SEE the idea on the neck → drill it in the <b>Ear Trainer</b> /{" "}
            <b>Number System</b> → then make it music on <b>Songs & Tones</b> with your Blackstar dialed in, or follow a
            track in the <b>Live Player</b>. Theory only sticks when it comes out of an amp.
          </div>
        </div>
      </Reveal>
    </div>
  );
}
