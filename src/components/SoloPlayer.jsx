import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEG, SCALES, CHORDS,
  noteNameToPc, pcName, scalesContaining, noteAgainstChord,
} from "../theory/engine.js";
import { positionsFor, boxAt } from "../theory/positions.js";
import { C, keyToneStyle, RAINBOW, degBase, chordToneStyle } from "../ui/theme.js";
import { playMidi, setAmp } from "../audio/engine.js";
import { ampFromTone, ampSummary } from "../audio/amp.js";
import { GUITAR } from "../data/tones.js";
import { useMetronome } from "../audio/useMetronome.jsx";
import Neck from "./Neck.jsx";
import AmpPanel, { PickupSwitch } from "./AmpPanel.jsx";
import SoloOverlay from "./SoloOverlay.jsx";
import { SoloScheduler, STATES, RATE_MIN, RATE_MAX, RATE_STEP, clampRate } from "../audio/soloClock.js";
import {
  beatToSec,
  barAtBeat,
  beatsPerBarAt,
  harmonyAt,
  sectionAt,
  degreeOf,
  noteMidi,
  noteFunctionText,
  describePhrase,
  parseChordSymbol,
  soloEndBeat,
  harmonyLoop,
  validateSolo,
  TECHNIQUES,
} from "../data/soloSchema.js";
import { loadTabs } from "../data/tabs.js";
import { loadSongs } from "../data/songs.js";

/**
 * THE SOLO PLAYER — a solo, played back on the fretboard, in time.
 *
 * A note-highway practice tool that is a THEORY tool underneath: every ring is
 * coloured by what the note is doing against the chord underneath it, so the
 * same shape visibly changes meaning when the harmony moves. That is the whole
 * point — the shapes are not the lesson, the intervals are.
 *
 * WHERE THE CLOCK LIVES
 * ---------------------
 * Outside React, in src/audio/soloClock.js, exactly like the metronome. React
 * holds only what a human changes: which solo, which mode, which toggles. The
 * beat is never React state — it is read per frame by the canvas overlay and
 * by one rAF loop here that mutates the playhead's transform directly. A
 * `setState` at 60fps on a page with a 150-node fretboard is the difference
 * between this being smooth and being a slideshow.
 */

const FRETS = 24;

const fmt = (sec) => {
  const s = Math.max(0, sec);
  return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
};

export default function SoloPlayer() {
  // ONE library: real solos, entered note for note from a published tab.
  //
  // This page used to hold three shelves — original etudes, these, and song
  // CHARTS to improvise over. Two of them went, and everything that existed
  // only to serve them went with them: the shelf buttons, the one-grip neck
  // mode, the chart grid, the "over this chord" panel, and the schema's whole
  // notion of a document `kind`. A page that does one thing does not need to
  // ask which thing it is doing.
  const tabs = useMemo(() => loadTabs(), []);
  // Your rig, from Songs & Tones. The solo knows which song it belongs to, so
  // it can show you what to dial — and play itself through the same settings.
  const songs = useMemo(() => loadSongs(), []);

  // Songs & Tones can send you here from a song's solo section, the same way
  // the Spotify page hands a key to the Decoder: one localStorage key, read
  // once and cleared, so a refresh does not keep re-opening the same solo.
  const [soloId, setSoloId] = useState(() => {
    try {
      const req = localStorage.getItem("solo.req");
      if (req) {
        localStorage.removeItem("solo.req");
        return req;
      }
    } catch {
      /* private mode — just open the first solo */
    }
    return tabs[0].id;
  });
  const solo = useMemo(() => tabs.find((s) => s.id === soloId) || tabs[0], [tabs, soloId]);
  const check = useMemo(() => validateSolo(solo), [solo]);

  /* ---------------- the amp ---------------- */

  const song = useMemo(
    () => songs.find((sg) => (solo.meta.songIds || []).includes(sg.id)) || null,
    [songs, solo]
  );
  const tone = song ? song.tone : null;
  const [ampOn, setAmpOn] = useState(true);
  const [showAmp, setShowAmp] = useState(true);

  // One tone in, one signal chain out. Turning it off puts playback back on
  // the bare plucked string, which is the honest A/B: the notes are the same,
  // the SOUND is what the amp is doing.
  useEffect(() => {
    setAmp(ampOn ? ampFromTone(tone) : null);
    return () => setAmp(null);
  }, [tone, ampOn]);

  /* ---------------- the scheduler ---------------- */

  const schedRef = useRef(null);
  if (!schedRef.current) schedRef.current = new SoloScheduler({ solo });
  const sched = schedRef.current;

  // Discrete transport state, mirrored into React so the buttons can render.
  const [tp, setTp] = useState(() => ({
    state: STATES.idle,
    rate: 1,
    loop: null,
    laps: 0,
    countInBars: 1,
    audible: true,
    running: false,
  }));

  useEffect(() => sched.onState(setTp), [sched]);
  useEffect(() => () => sched.dispose(), [sched]);

  /* ---------------- view options ---------------- */

  const [mode, setMode] = useState("watch");
  const [showDegrees, setShowDegrees] = useState(true);
  const [showFingers, setShowFingers] = useState(false);
  const [rainbow, setRainbow] = useState(false);
  const [underlay, setUnderlay] = useState(true);
  // Default ON: the whole neck lit at once is the single biggest source of
  // "too much to look at" on this page.
  const [inPosition, setInPosition] = useState(true);
  const [showMore, setShowMore] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    sched.setAudible(mode === "watch");
  }, [sched, mode]);

  /* ---------------- derived theory ---------------- */

  const keyPc = noteNameToPc(solo.meta.key);
  const scale = SCALES[solo.meta.scaleId] || SCALES.aeolian;
  const scaleSet = useMemo(() => new Set(scale.ints), [scale]);
  const endBeat = useMemo(() => soloEndBeat(solo), [solo]);

  // A solo over a song's vamp has a loop, not seventy-five chords. Name it
  // once under the timeline, and stop labelling every change when there are
  // too many for the labels to be read — the ticks still show where they fall,
  // and the big read-out above the neck always names the one sounding now.
  const loop = useMemo(() => harmonyLoop(solo.harmony), [solo]);
  const labelChords = solo.harmony.length <= 32;

  /**
   * TEMPO, IN BPM RATHER THAN PER CENT.
   *
   * The speed control used to read "65%", which is a number about the file
   * rather than about the music: nobody practises at sixty-five per cent, they
   * practise at seventy beats a minute against a click. So the slider is the
   * BPM you want and the rate is derived from it — same scheduler underneath,
   * and the written tempo stays the document's, unedited.
   */
  const writtenBpm = solo.tempo[0].bpm;
  const bpmNow = Math.round(writtenBpm * tp.rate);
  const bpmMin = Math.max(30, Math.round(writtenBpm * RATE_MIN));
  const bpmMax = Math.round(writtenBpm * RATE_MAX);
  const setBpmTarget = useCallback(
    (bpm) => sched.setRate(clampRate(Number(bpm) / writtenBpm)),
    [sched, writtenBpm]
  );

  /**
   * The click in the transport bar is a different clock, and it was sitting at
   * whatever you last used it for while a solo played at 113 — two tempos on
   * one screen, one of them a lie. Point it at the solo's, and keep pointing
   * it there when the speed changes.
   */
  const met = useMetronome();
  const metSetBpm = met && met.setBpm;
  useEffect(() => {
    if (metSetBpm) metSetBpm(bpmNow);
  }, [metSetBpm, bpmNow]);

  // Which position the phrase actually sits in — derived from the notes, not
  // typed in, using the same box finder the Scale Lab uses.
  const boxes = useMemo(() => positionsFor(solo.meta.scaleId, keyPc, { maxFret: FRETS }), [solo.meta.scaleId, keyPc]);
  const homeBox = useMemo(() => {
    const frets = solo.notes.map((n) => n.fret).filter((f) => f > 0).sort((a, b) => a - b);
    if (!frets.length) return boxes[0] || null;
    return boxAt(boxes, frets[Math.floor(frets.length / 2)]);
  }, [boxes, solo]);

  /* ---------------- the live read-outs ---------------- */

  // These change a handful of times per solo, not per frame, so they may live
  // in React — but they are still DERIVED from the beat, never accumulated.
  const [live, setLive] = useState({ chord: null, section: null, bar: 0, sec: 0 });
  const playheadRef = useRef(null);
  const timelineRef = useRef(null);
  const lastLive = useRef({ chord: null, section: null, bar: -1, sec: -1 });

  /**
   * Recompute the read-outs from a beat, and re-render only when one of them
   * has actually changed. Shared by the frame loop and by every discrete jump
   * (seek, step, tapping a bar) — a jump must not have to wait for a frame to
   * repaint the chord panel, and in a backgrounded tab there is no next frame.
   */
  const syncLive = useCallback(
    (beat) => {
      const h = harmonyAt(solo, beat);
      const s = sectionAt(solo, beat);
      const b = barAtBeat(solo.timeSig, Math.max(0, beat)).bar;
      const secs = Math.floor(beatToSec(sched.tempoMap, Math.max(0, beat)));
      const prev = lastLive.current;
      if (h === prev.chord && s === prev.section && b === prev.bar && secs === prev.sec) return;
      lastLive.current = { chord: h, section: s, bar: b, sec: secs };
      setLive({ chord: h, section: s, bar: b, sec: secs });
    },
    [sched, solo]
  );

  // Switching document is the biggest discrete jump there is: the scheduler
  // reloads and the read-outs must follow at once rather than on the next
  // frame — otherwise the chord panel and the neck's grip briefly describe the
  // document you just left.
  useEffect(() => {
    sched.load(solo);
    // Back to the record's tempo. Speed is a property of how YOU are
    // practising one phrase, not of the library — carrying 109% from Purple
    // Rain onto Alone silently plays Alone at the wrong tempo, and the number
    // on the slider is the only clue.
    sched.setRate(1);
    setSelected(null);
    lastLive.current = { chord: null, section: null, bar: -1, sec: -1 };
    syncLive(sched.beatNow());
  }, [sched, solo, syncLive]);

  // Jumping somewhere is a discrete action; the read-outs follow immediately.
  const seekTo = useCallback(
    (beat) => {
      sched.seek(beat);
      syncLive(sched.beatNow());
    },
    [sched, syncLive]
  );

  useEffect(() => {
    let raf = 0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const beat = sched.beatNow();

      // The playhead moves every frame — by transform, never by setState, and
      // not by `left` either: a transform does not make the browser re-lay-out
      // the sections and chord labels sixty times a second.
      const head = playheadRef.current;
      const track = timelineRef.current;
      if (head && track) {
        const p = Math.max(0, Math.min(endBeat, beat)) / endBeat;
        head.style.transform = `translateX(${p * track.clientWidth}px)`;
      }

      syncLive(beat);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sched, endBeat, syncLive]);

  /* ---------------- controls ---------------- */

  const play = useCallback(() => {
    if (tp.state === STATES.stepping) sched.exitStep();
    sched.toggle();
  }, [sched, tp.state]);

  const pickStep = useCallback(
    (delta) => {
      setSelected(sched.stepBy(delta));
      syncLive(sched.beatNow());
    },
    [sched, syncLive]
  );

  const setLoopEdge = useCallback(
    (which) => {
      const at = Math.max(0, Math.min(endBeat, sched.beatNow()));
      const cur = sched.loop || { startBeat: 0, endBeat };
      const next =
        which === "a"
          ? { startBeat: at, endBeat: Math.max(at + 1, cur.endBeat) }
          : { startBeat: Math.min(cur.startBeat, at - 1), endBeat: at };
      sched.setLoop({ startBeat: Math.max(0, next.startBeat), endBeat: next.endBeat });
    },
    [sched, endBeat]
  );

  const seekFromEvent = useCallback(
    (e) => {
      const el = timelineRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      seekTo(((e.clientX - r.left) / r.width) * endBeat);
    },
    [seekTo, endBeat]
  );

  // Space plays, arrows step. Step mode is meant to be used with one hand on
  // the guitar, so it has to work from the keyboard.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.code === "Space") {
        e.preventDefault();
        play();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        pickStep(1);
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        pickStep(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [play, sched]);

  /* ---------------- the neck ---------------- */

  const resolve = useCallback(
    (pc, semis, { s, f }) => {
      if (!underlay) return null;
      if (!scaleSet.has(semis)) return null;
      // STAY IN POSITION. The scale across all 24 frets is 65 dots and reads as
      // noise; one box is what a hand plays and what the phrase is actually in.
      if (inPosition && homeBox && !(f >= homeBox.start && f <= homeBox.start + homeBox.span)) return null;
      // The parent scale, ghosted: the solo is visibly a PATH through a shape.
      const st = rainbow ? RAINBOW[degBase(DEG[semis])] || RAINBOW[1] : keyToneStyle(semis);
      return {
        label: DEG[semis],
        ...st,
        opacity: semis === 0 ? 0.42 : 0.26,
        size: semis === 0 ? 21 : 19,
        fontSize: 9,
        zIndex: 1,
      };
    },
    [underlay, scaleSet, rainbow, inPosition, homeBox]
  );

  const overlay = useCallback(
    (geom) => (
      <SoloOverlay
        scheduler={sched}
        solo={solo}
        geom={geom}
        showDegrees={showDegrees}
        showFingers={showFingers}
        rainbow={rainbow}
        onPick={(n) => {
          setSelected(n);
          playMidi(noteMidi(n, solo.meta), 0, 0.7, 0.22);
        }}
        onTapFret={(midi) => playMidi(midi, 0, 0.7, 0.2)}
      />
    ),
    [sched, solo, showDegrees, showFingers, rainbow]
  );

  /* ---------------- render ---------------- */

  const running = tp.running;
  const stepping = tp.state === STATES.stepping;
  const chordSym = live.chord ? live.chord.chord : null;

  return (
    <div className="page">
      <div className="eyebrow">Guitar Theory Coach · Play</div>
      <h1 className="page-title">THE SOLO PLAYER</h1>
      <p className="page-sub">
        A phrase, played back where your hands go. The colour of every note is what it is doing
        against the chord underneath it — not what it is called.
      </p>

      {/* ---------------- the library ---------------- */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16, alignItems: "center" }}>
        {tabs.map((s) => (
          <button
            key={s.id}
            className={"chip" + (s.id === soloId ? " on" : "")}
            onClick={() => {
              sched.stop();
              setSoloId(s.id);
            }}
            title={s.meta.note}
          >
            {s.meta.title}
          </button>
        ))}
      </div>

      {solo.meta.note ? (
        <div className="card" style={{ marginTop: 12, background: "rgba(62,155,214,.10)" }}>
          <div className="eyebrow" style={{ marginBottom: 6, color: C.blue }}>
            What this one teaches
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.65, color: C.ink }}>{solo.meta.note}</div>
          {solo.meta.source ? (
            <div className="mono" style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
              Source: {solo.meta.source}
            </div>
          ) : null}
        </div>
      ) : null}

      {check.warnings.length ? (
        <div className="card" style={{ marginTop: 12, borderColor: C.sun }}>
          <div className="eyebrow" style={{ marginBottom: 6, color: C.sun }}>
            Schema warnings
          </div>
          {check.warnings.slice(0, 4).map((w, i) => (
            <div key={i} className="mono" style={{ fontSize: 11, color: C.muted }}>
              {w}
            </div>
          ))}
          {check.warnings.length > 4 ? (
            <div className="mono" style={{ fontSize: 11, color: C.muted, opacity: 0.7 }}>
              …and {check.warnings.length - 4} more of the same.
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ---------------- the neck ---------------- */}
      <div className="card" style={{ marginTop: 14 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <div className="eyebrow">
            {solo.meta.key} {solo.meta.mode} · {scale.name}
            {homeBox ? ` · box on the ${homeBox.startDegree}` : ""}
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "baseline" }}>
            <span className="mono" style={{ fontSize: 20, fontWeight: 700, color: chordSym ? C.sun : C.muted }}>
              {chordSym || solo.meta.key + "m"}
            </span>
            <span className="mono" style={{ fontSize: 11, color: C.muted }}>
              bar {live.bar + 1} · {fmt(live.sec)}
              {tp.laps > 0 ? ` · lap ${tp.laps + 1}` : ""}
            </span>
            {/* Which phrase you are in. The timeline ribbon below has to
                ellipsis its labels once a document runs to twenty-odd
                sections, so the name lives here where it always fits. */}
            {live.section ? (
              <span className="mono" style={{ fontSize: 11, color: C.blue, fontWeight: 700 }}>
                {live.section.name}
              </span>
            ) : null}
          </div>
        </div>

        <Neck
          root={solo.meta.key}
          frets={FRETS}
          size="md"
          inlays="double"
          stringGauge
          boxes={inPosition && homeBox ? [{ start: homeBox.start, span: homeBox.span, color: C.muted, bg: "var(--surface)" }] : []}
          resolve={resolve}
          overlay={overlay}
        />


        {/* ---------------- timeline ---------------- */}
        <div
          ref={timelineRef}
          onClick={seekFromEvent}
          style={{
            position: "relative",
            height: 46,
            marginTop: 12,
            border: `1.5px solid ${C.line}`,
            borderRadius: 3,
            background: "var(--surface-lo)",
            cursor: "pointer",
            overflow: "hidden",
          }}
        >
          {/* sections */}
          {solo.sections.map((s, i) => (
            <div
              key={s.id}
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: (s.startBeat / endBeat) * 100 + "%",
                width: ((s.endBeat - s.startBeat) / endBeat) * 100 + "%",
                borderRight: `1px solid ${C.line}`,
                background: i % 2 ? "var(--surface)" : "transparent",
              }}
            >
              {/* Clipped to its OWN slot. A transcription entered from a tab
                  has a section per timestamped block — sixteen of them for
                  Purple Rain — and an unclipped nowrap label at that density
                  spills across its neighbours until the whole ribbon is one
                  unreadable line. The timestamp is the front of the name, so
                  what survives the ellipsis is the part you navigate by. */}
              <div
                className="mono"
                title={s.name}
                style={{
                  position: "absolute",
                  top: 4,
                  left: 5,
                  right: 4,
                  fontSize: 9,
                  color: C.muted,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {s.name}
              </div>
            </div>
          ))}
          {/* the A/B loop */}
          {tp.loop ? (
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: (tp.loop.startBeat / endBeat) * 100 + "%",
                width: ((tp.loop.endBeat - tp.loop.startBeat) / endBeat) * 100 + "%",
                background: "rgba(255,122,46,0.14)",
                borderLeft: `2px solid ${C.sun}`,
                borderRight: `2px solid ${C.sun}`,
              }}
            />
          ) : null}
          {/* chord changes */}
          {solo.harmony.map((h, i) => (
            <div
              key={i}
              style={{ position: "absolute", bottom: 3, left: (h.atBeat / endBeat) * 100 + "%", pointerEvents: "none" }}
            >
              <div style={{ width: 1, height: labelChords ? 12 : 8, background: C.cyan, opacity: 0.7 }} />
              {labelChords ? (
                <div className="mono" style={{ fontSize: 9, color: C.cyan, marginLeft: 3, marginTop: -14 }}>
                  {h.chord}
                </div>
              ) : null}
            </div>
          ))}
          {/* the playhead — moved by the rAF loop, never by React */}
          <div
            ref={playheadRef}
            style={{ position: "absolute", top: 0, bottom: 0, width: 2, background: C.sun, left: 0, pointerEvents: "none" }}
          />
        </div>

        {loop ? (
          <div className="mono" style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
            Loop:{" "}
            {loop.map((c, i) => (
              <React.Fragment key={i}>
                {i ? " · " : ""}
                <b style={{ color: C.cyan }}>{c}</b>
              </React.Fragment>
            ))}{" "}
            — one bar each, round and round.
          </div>
        ) : null}
      </div>

      {/* ---------------- transport ----------------
          One row you use constantly, and everything else folded away. The
          previous version put twenty-odd controls on screen at once, which is
          a lot to look past while you are trying to play. */}
      <div className="card" style={{ marginTop: 14 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn" onClick={() => seekTo(tp.loop ? tp.loop.startBeat : 0)} title="Back to the start">
            ⏮
          </button>
          <button className={"btn" + (running ? " on" : "")} onClick={play} style={{ minWidth: 78 }} title="Play / pause (space)">
            {running ? "⏸ Pause" : "▶ Play"}
          </button>
          <button className="btn" onClick={() => sched.stop()} title="Stop">
            ■
          </button>

          <span style={{ width: 8 }} />

          <button className="btn" onClick={() => pickStep(-1)} title="Previous (←)">
            ◀
          </button>
          <button
            className={"btn" + (stepping ? " on" : "")}
            onClick={() => (stepping ? sched.exitStep() : sched.enterStep())}
            title="Step through one note at a time — no clock"
          >
            Step
          </button>
          <button className="btn" onClick={() => pickStep(1)} title="Next (→)">
            ▶
          </button>

          <span style={{ width: 8 }} />

          <input
            type="range"
            min={bpmMin}
            max={bpmMax}
            step={1}
            value={bpmNow}
            onChange={(e) => setBpmTarget(e.target.value)}
            title={`Tempo — the record is ${writtenBpm} bpm`}
            style={{ flex: "1 1 140px", minWidth: 110, accentColor: C.sun }}
          />
          <span
            className="mono"
            style={{ fontSize: 13, fontWeight: 700, color: C.sun, minWidth: 64 }}
            title={`${Math.round(tp.rate * 100)}% of the written tempo`}
          >
            {bpmNow} bpm
          </span>
          <button
            className="btn"
            onClick={() => sched.setRate(1)}
            disabled={tp.rate === 1}
            title={`Back to the record's tempo (${writtenBpm})`}
            style={{ padding: "4px 8px", fontSize: 11, opacity: tp.rate === 1 ? 0.4 : 1 }}
          >
            = {writtenBpm}
          </button>

          <span style={{ flex: 1 }} />

          <button
            className={"btn" + (mode === "silent" ? " on" : "")}
            onClick={() => setMode(mode === "silent" ? "watch" : "silent")}
            title={mode === "silent" ? "Silent — you play it" : "Watch — the app plays it"}
          >
            {mode === "silent" ? "🔇 Silent" : "🔊 Watch"}
          </button>
          <button
            className={"btn" + (showMore ? " on" : "")}
            onClick={() => setShowMore((v) => !v)}
            title="Loop, count-in and display options"
          >
            {showMore ? "Less ▲" : "More ▾"}
          </button>
        </div>

        {tp.loop ? (
          <div className="mono" style={{ fontSize: 11, color: C.sun, marginTop: 8 }}>
            ⟲ looping bars {barAtBeat(solo.timeSig, tp.loop.startBeat).bar + 1}–
            {barAtBeat(solo.timeSig, tp.loop.endBeat).bar}
            {tp.laps > 0 ? ` · lap ${tp.laps + 1}` : ""}
            <button className="btn" style={{ marginLeft: 10, padding: "3px 8px" }} onClick={() => sched.setLoop(null)}>
              clear
            </button>
          </div>
        ) : null}

        {/* ---------------- folded away ---------------- */}
        {showMore ? (
          <div style={{ marginTop: 14, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span className="eyebrow" style={{ minWidth: 56 }}>Loop</span>
              <button className="btn" onClick={() => setLoopEdge("a")} title="Loop start at the playhead">
                Set A
              </button>
              <button className="btn" onClick={() => setLoopEdge("b")} title="Loop end at the playhead">
                Set B
              </button>
              {solo.sections.map((s) => (
                <button
                  key={s.id}
                  className={
                    "chip" + (tp.loop && tp.loop.startBeat === s.startBeat && tp.loop.endBeat === s.endBeat ? " on" : "")
                  }
                  onClick={() => sched.loopSection(s)}
                >
                  {s.name}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
              <span className="eyebrow" style={{ minWidth: 56 }}>Count-in</span>
              {[0, 1, 2].map((n) => (
                <button
                  key={n}
                  className={"chip" + (tp.countInBars === n ? " on" : "")}
                  onClick={() => sched.setCountInBars(n)}
                >
                  {n === 0 ? "off" : n + " bar"}
                </button>
              ))}
              <span className="mono" style={{ fontSize: 11, color: C.muted, marginLeft: 6 }}>
                {writtenBpm} bpm written · {bpmNow} now ({Math.round(tp.rate * 100)}%) · the click follows
              </span>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
              <span className="eyebrow" style={{ minWidth: 56 }}>Show</span>
              <button className={"chip" + (showDegrees ? " on" : "")} onClick={() => setShowDegrees((v) => !v)}>
                Degrees
              </button>
              <button className={"chip" + (showFingers ? " on" : "")} onClick={() => setShowFingers((v) => !v)}>
                Fingering
              </button>
              <button className={"chip" + (underlay ? " on" : "")} onClick={() => setUnderlay((v) => !v)}>
                Scale shape
              </button>
              <button
                className={"chip" + (inPosition ? " on" : "")}
                onClick={() => setInPosition((v) => !v)}
                title="Show only the notes inside one five-fret box — the whole neck at once is unreadable"
              >
                In position
              </button>
              <button className={"chip" + (rainbow ? " on" : "")} onClick={() => setRainbow((v) => !v)}>
                Rainbow
              </button>
              <button
                className={"chip" + (mode === "follow" ? " on" : "")}
                disabled
                title="Waits for you to play the right note — needs the microphone, coming next"
                style={{ opacity: 0.45, cursor: "not-allowed" }}
              >
                Follow ·soon
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* ---------------- what this is teaching ---------------- */}
      {/* ---------------- your amp, for this solo ----------------
          The same tone object that draws the panel on Songs & Tones, drawn
          again here and — the part that matters — actually driving playback.
          Dial a song's tone over there and this solo starts sounding like it. */}
      {tone ? (
        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
            <div className="eyebrow" style={{ color: C.sun }}>Your amp · {song.title}</div>
            <span className="mono" style={{ fontSize: 11, color: C.muted, flex: 1, minWidth: 180 }}>
              {ampSummary(tone)}
            </span>
            <button
              className={"chip" + (ampOn ? " on" : "")}
              onClick={() => setAmpOn((v) => !v)}
              title="Play the solo through these settings, or fall back to the bare plucked string"
            >
              {ampOn ? "Amp on" : "Amp off"}
            </button>
            <button className="chip" onClick={() => setShowAmp((v) => !v)}>
              {showAmp ? "Hide panel" : "Show panel"}
            </button>
          </div>

          {showAmp ? (
            <>
              <div style={{ marginTop: 10 }}>
                <AmpPanel tone={tone} />
              </div>
              <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
                <span className="eyebrow" style={{ minWidth: 56 }}>Pickup</span>
                <PickupSwitch pos={tone.pickup} />
                <span className="mono" style={{ fontSize: 11, color: C.muted }}>
                  {GUITAR.positions[tone.pickup]}
                </span>
              </div>
              {tone.rig || tone.notes ? (
                <div className="mono" style={{ fontSize: 11.5, color: C.muted, marginTop: 10, lineHeight: 1.7 }}>
                  {tone.rig ? (
                    <div>
                      <b style={{ color: C.ink }}>On the record:</b> {tone.rig}
                    </div>
                  ) : null}
                  {tone.notes ? <div>{tone.notes}</div> : null}
                </div>
              ) : null}
              <div className="mono" style={{ fontSize: 11, color: C.muted, marginTop: 10, lineHeight: 1.7 }}>
                These are YOUR settings, from Songs &amp; Tones — edit them there and the sound here
                follows. What you hear is the string through a drive stage, the amp's mid and
                presence off the ISF knob, a cabinet that closes down as the gain comes up, and
                whichever of mod / delay / reverb the panel has lit.
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <WhyThisNote note={selected} solo={solo} boxes={boxes} onClear={() => setSelected(null)} />
    </div>
  );
}

/* ================================================================== */
/* THE INSPECTOR — the actual differentiator                          */
/* ================================================================== */

function WhyThisNote({ note, solo, boxes, onClear }) {
  const [copied, setCopied] = useState(false);

  const info = useMemo(() => {
    if (!note) return null;
    const deg = degreeOf(note, solo, note.startBeat);
    const midi = noteMidi(note, solo.meta);
    const chord = deg.chordSym ? parseChordSymbol(deg.chordSym) : null;
    const against = chord ? noteAgainstChord(deg.pc, chord.rootPc, chord.quality) : null;
    // Which parent scales swallow BOTH this note and the chord under it —
    // "the scale this phrase implies", asked the honest way round.
    const pcs = chord ? [...CHORDS[chord.quality].ints.map((i) => (chord.rootPc + i) % 12), deg.pc] : [deg.pc];
    const parents = scalesContaining(pcs, {
      ids: ["minorPent", "majorPent", "blues", "aeolian", "dorian", "mixolydian", "major", "harmonicMinor"],
    }).slice(0, 3);
    const box = boxAt(boxes, note.fret);
    return { deg, midi, chord, against, parents, box };
  }, [note, solo, boxes]);

  const phrase = useMemo(() => {
    if (!note) return "";
    // The phrase around the tapped note — its bar — is the useful unit to
    // ask about, not one isolated dot.
    const per = beatsPerBarAt(solo.timeSig, note.startBeat);
    const barStart = Math.floor(note.startBeat / per) * per;
    const ids = solo.notes.filter((n) => n.startBeat >= barStart && n.startBeat < barStart + per).map((n) => n.id);
    return describePhrase(solo, ids);
  }, [note, solo]);

  if (!note || !info) {
    return (
      <div className="card" style={{ marginTop: 14 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Why this note
        </div>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
          Tap any note on the neck — or step through with the arrow keys — and this explains what it
          is doing against the chord underneath it.
        </div>
      </div>
    );
  }

  const { deg, midi, chord, against, parents, box } = info;
  const st = chordToneStyle(deg.semis);

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="eyebrow">Why this note</div>
        <button className="btn" onClick={onClear}>
          Clear
        </button>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div
          className="mono"
          style={{
            width: 54,
            height: 54,
            borderRadius: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 19,
            fontWeight: 700,
            background: st.bg,
            color: st.tx,
            border: `2px solid ${st.br}`,
          }}
        >
          {deg.label}
        </div>
        <div>
          <div className="mono" style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>
            {pcName(deg.pc, solo.meta.key)}
            <span style={{ color: C.muted, fontWeight: 400 }}>
              {"  "}string {note.string + 1} · fret {note.fret} · MIDI {midi}
            </span>
          </div>
          <div style={{ fontSize: 13, color: C.ink, marginTop: 4, lineHeight: 1.6 }}>
            {noteFunctionText(note, solo)}
          </div>
        </div>
      </div>

      <div className="mono" style={{ fontSize: 12, color: C.muted, marginTop: 12, lineHeight: 1.9 }}>
        {chord ? (
          <div>
            Against <b style={{ color: C.ink }}>{deg.chordSym}</b>: {deg.label}
            {against && !against.isChordTone ? (
              <>
                {" "}
                — a semitone {against.side} the {against.nearestLabel}
                {against.kind === "leaning" ? ", so it wants to move" : ""}
              </>
            ) : (
              " — a chord tone"
            )}
            .
          </div>
        ) : null}
        <div>
          In the key of {solo.meta.key}: <b style={{ color: C.ink }}>{deg.keyLabel}</b>.
        </div>
        {parents.length ? (
          <div>
            Implies:{" "}
            {parents
              .map((p) => pcName(p.rootPc, solo.meta.key) + " " + SCALES[p.scaleId].name)
              .join("  ·  ")}
          </div>
        ) : null}
        {box ? (
          <div>
            Position: the box starting on the <b style={{ color: C.ink }}>{box.startDegree}</b>, frets {box.start}–
            {box.start + box.span}.
          </div>
        ) : null}
        <div>
          Technique: {TECHNIQUES[note.technique].name}
          {note.technique === "slide" && note.slideToFret != null ? ` to fret ${note.slideToFret}` : ""}
          {note.bendSemitones ? ` · ${note.bendSemitones} semitone${note.bendSemitones > 1 ? "s" : ""}` : ""}
          {note.finger ? ` · finger ${note.finger}` : ""}
        </div>
      </div>

      {/* The AI Tutor hook: the serializer and its call site. The prompt that
          wraps this is a separate job — this is the payload. */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
        <button
          className="btn"
          onClick={() => {
            try {
              navigator.clipboard.writeText(phrase);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {
              setCopied(false);
            }
          }}
          title="Copy this bar as a compact description, ready to ask a model about"
        >
          {copied ? "Copied ✓" : "Copy phrase for the tutor"}
        </button>
        <span className="mono" style={{ fontSize: 10, color: C.muted }}>
          {phrase.split("\n").length} lines · degrees, harmony and technique
        </span>
      </div>
    </div>
  );
}
