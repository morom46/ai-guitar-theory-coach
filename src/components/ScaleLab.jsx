import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ROOTS,
  SCALES,
  DEG,
  FRETS,
  noteNameToPc,
  keyNames,
  tensionMap,
  tritonePairs,
  smallestGap,
} from "../theory/engine.js";
import { rootPosition } from "../theory/voicing.js";
import { C } from "../ui/theme.js";
import Neck from "./Neck.jsx";
import { playMidi } from "../audio/engine.js";
import { useDrone, useDroneFollow } from "../audio/useDrone.js";
import ScaleFormula from "./ScaleFormula.jsx";
import IntervalShapes from "./IntervalShapes.jsx";
import ScalePositions from "./ScalePositions.jsx";

/**
 * THE SCALE LAB — lesson 04.
 *
 * Four things the app could show but could not make you HEAR or DO:
 *
 *   Relative ⇄ parallel  which thing moves — the notes, or the home
 *   Why pentatonic works  the two notes it drops, and what they were doing
 *   Build it              a scale is a recipe of steps; follow it on one string
 *   Intervals as shapes   the fretboard's geometry, and its one exception
 *   Positions             the boxes your hand actually plays, walked in time
 *
 * Every one of them derives from the engine: the step patterns, the clash
 * distances and the fret offsets are all computed, never typed in, so a lesson
 * cannot drift away from what the rest of the app plays.
 */

const TABS = [
  { id: "rp", label: "Relative ⇄ parallel", sub: "two ways scales relate — watch which one moves" },
  { id: "pent", label: "Why pentatonic is safe", sub: "not the easy scale — the one with the danger removed" },
  { id: "formula", label: "Build it from the formula", sub: "a scale is a recipe of steps, not a list of notes" },
  { id: "shapes", label: "Intervals as shapes", sub: "the geometry of the neck, and the one place it breaks" },
  { id: "boxes", label: "Positions & sequences", sub: "one hand position at a time, walked in time with the click" },
];

export default function ScaleLab() {
  const [tab, setTab] = useState("rp");
  const here = TABS.find((t) => t.id === tab) || TABS[0];

  return (
    <div className="page">
      <div className="eyebrow">Guitar Theory Coach · 04</div>
      <h1 className="page-title">THE SCALE LAB</h1>
      <p className="page-sub">{here.sub}</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
        {TABS.map((t) => (
          <button key={t.id} className={"btn" + (tab === t.id ? " on" : "")} onClick={() => setTab(t.id)} aria-current={tab === t.id ? "true" : undefined}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "rp" && <RelativeParallel />}
      {tab === "pent" && <PentatonicWhy />}
      {tab === "formula" && <ScaleFormula />}
      {tab === "shapes" && <IntervalShapes />}
      {tab === "boxes" && <ScalePositions />}
    </div>
  );
}

/* ==================================================================== #11 */

const SLOT = 40;
const PAD = 26;

/**
 * RELATIVE vs PARALLEL — one switch, two animations.
 *
 * People confuse these two constantly, and the reason is that both are
 * described with the same sentence ("C major and A minor are related"). The
 * distinction is not verbal, it is kinetic: in one of them the NOTES stay put
 * and home moves; in the other home stays put and the notes move. So the whole
 * lesson is a ruler with seven dots on it and a switch that animates one or
 * the other. Whichever thing slides is the thing that defines the relationship.
 */
function RelativeParallel() {
  const [root, setRoot] = useState("C");
  const [mode, setMode] = useState("relative"); // relative | parallel
  const [moved, setMoved] = useState(false);
  const [muted, setMuted] = useState(false);
  const drone = useDrone();

  const rootPc = noteNameToPc(root);
  const major = SCALES.major.ints;
  const minor = SCALES.aeolian.ints;

  // Where each of the seven dots sits, and where home is — the only two things
  // that can move, and never both at once.
  const target = mode === "relative" ? major : minor;
  const ints = moved ? target : major;
  const tonicSemis = moved && mode === "relative" ? 9 : 0;
  const tonicPc = (rootPc + tonicSemis) % 12;

  // Spell from whichever key is sounding, so the notes are named the way that
  // key would name them: C minor borrows Eb major's spelling and says Eb, not
  // D#. (A minor key spells itself from the major a minor 3rd above it.)
  const minorNow = moved && mode === "parallel";
  const names = useMemo(() => keyNames(root, minorNow ? "minor" : "major"), [root, minorNow]);

  const movedNotes = major.filter((_, i) => target[i] !== major[i]).length;
  const label = moved
    ? mode === "relative"
      ? `${names[(rootPc + 9) % 12]} minor`
      : `${names[rootPc]} minor`
    : `${names[rootPc]} major`;

  const hear = (from, list) => {
    if (muted) return;
    // Ascending from the tonic that is actually home, because that is the only
    // way the difference is audible at all.
    const ordered = [...list].map((iv) => (iv - from + 12) % 12).sort((a, b) => a - b);
    ordered.forEach((iv, i) => playMidi(48 + rootPc + from + iv, i * 0.26, 0.55));
    playMidi(48 + rootPc + from + 12, ordered.length * 0.26, 1.4);
  };

  // Play the source scale, then swing the switch and play the target — the
  // comparison only works consecutively, which is the point of the button.
  const abRef = useRef(null);
  useEffect(() => () => clearTimeout(abRef.current), []);
  const hearBoth = () => {
    if (muted) return;
    clearTimeout(abRef.current);
    setMoved(false);
    hear(0, major);
    abRef.current = setTimeout(() => {
      setMoved(true);
      hear(mode === "relative" ? 9 : 0, mode === "relative" ? major : minor);
    }, (8 * 0.26 + 0.9) * 1000);
  };

  useDroneFollow(names[tonicPc]);

  return (
    <div>
      <style>{`
        .rp-dot{ position:absolute; top:0; width:34px; height:34px; margin-left:-17px; border-radius:999px;
          display:flex; flex-direction:column; align-items:center; justify-content:center;
          font-family: ui-monospace, monospace; border:2px solid; transition: transform .55s cubic-bezier(.4,0,.15,1), background-color .3s, border-color .3s; }
        .rp-sun{ position:absolute; top:-10px; width:54px; height:54px; margin-left:-27px; border-radius:999px;
          border:2px dashed var(--sun); transition: transform .55s cubic-bezier(.4,0,.15,1); pointer-events:none; }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Start from</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {ROOTS.map((r) => (
              <button key={r} className={"chip" + (r === root ? " on" : "")} onClick={() => { setRoot(r); setMoved(false); }}>{r}</button>
            ))}
            <span style={{ width: 8 }} />
            <button className="btn" onClick={() => setMuted((m) => !m)} aria-pressed={muted}>{muted ? "♪ sound off" : "♪ sound on"}</button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button className={"btn" + (mode === "relative" ? " on" : "")} onClick={() => { setMode("relative"); setMoved(false); }}>
            RELATIVE — {root} major → {names[(rootPc + 9) % 12]} minor
          </button>
          <button className={"btn" + (mode === "parallel" ? " on" : "")} onClick={() => { setMode("parallel"); setMoved(false); }}>
            PARALLEL — {root} major → {root} minor
          </button>
        </div>
      </div>

      {/* the ruler: one string, twelve frets */}
      <div className="card" style={{ marginTop: 16, overflowX: "auto" }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          One string, twelve frets — {mode === "relative" ? "watch the dots stay still" : "watch three dots slide down"}
        </div>
        <div style={{ position: "relative", height: 96, minWidth: PAD * 2 + 12 * SLOT }}>
          {/* the string */}
          <div style={{ position: "absolute", left: PAD, right: PAD, top: 17, height: 2, background: C.line }} />
          {/* frets */}
          {Array.from({ length: 13 }, (_, i) => (
            <div key={i} style={{ position: "absolute", left: PAD + i * SLOT, top: 0, transform: "translateX(-0.5px)" }}>
              <div style={{ width: 1, height: 34, background: i % 12 === 0 ? C.cyan : C.grid }} />
              <div className="mono" style={{ position: "absolute", top: 40, left: -12, width: 24, textAlign: "center", fontSize: 9, color: C.muted }}>
                {i}
              </div>
            </div>
          ))}

          {/* home */}
          <div className="rp-sun" style={{ transform: `translateX(${PAD + tonicSemis * SLOT}px)`, background: "rgba(255,122,46,.13)" }} />

          {/* the seven notes */}
          {major.map((_, i) => {
            const semis = ints[i];
            const pc = (rootPc + semis) % 12;
            const shifted = target[i] !== major[i];
            const degree = (semis - tonicSemis + 12) % 12;
            return (
              <div
                key={i}
                className="rp-dot"
                style={{
                  transform: `translateX(${PAD + semis * SLOT}px)`,
                  background: degree === 0 ? C.sun : shifted && moved ? C.violet : "var(--surface)",
                  borderColor: degree === 0 ? C.sunDeep : shifted ? C.violet : C.blue,
                  color: degree === 0 ? "#fff" : C.ink,
                }}
                title={`${names[pc]} — the ${DEG[degree]} of ${label}`}
              >
                <span style={{ fontSize: 11, fontWeight: 700 }}>{names[pc]}</span>
                <span style={{ fontSize: 8, opacity: 0.75 }}>{DEG[degree]}</span>
              </div>
            );
          })}

          <div className="mono" style={{ position: "absolute", right: 0, top: 62, fontSize: 12, color: C.sun, fontWeight: 700 }}>
            {label}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
          <button className="btn" style={{ borderColor: C.sun, color: C.sun }} onClick={() => { setMoved((v) => !v); if (!muted) hear(moved ? 0 : mode === "relative" ? 9 : 0, moved ? major : target); }}>
            {moved ? "↺ back to " + root + " major" : mode === "relative" ? "→ move home to the 6" : "→ flatten the 3, 6 and 7"}
          </button>
          <button className="btn" onClick={hearBoth}>♪ hear both</button>
          <button className={"btn" + (drone.on ? " on" : "")} onClick={() => (drone.on ? drone.stop() : drone.start())} title="Hold the tonic — the relative switch is inaudible without one">
            ♁ {drone.on ? "drone on" : "hold home"}
          </button>
          <span className="mono" style={{ fontSize: 11.5, color: C.muted, marginLeft: "auto" }}>
            notes that moved: <b style={{ color: mode === "parallel" ? C.violet : C.ink }}>{mode === "parallel" ? movedNotes : 0}</b>
            {" · "}home moved: <b style={{ color: mode === "relative" ? C.sun : C.ink }}>{mode === "relative" ? "yes, to the 6" : "no"}</b>
          </span>
        </div>
      </div>

      {/* the same fact on the real neck */}
      <div style={{ marginTop: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>…and on the neck</div>
        <Neck
          root={names[tonicPc]}
          frets={FRETS}
          slide
          stringGauge
          inlays="double"
          resolve={(pc, semis) => {
            const inSet = ints.some((iv) => (rootPc + iv) % 12 === pc);
            if (!inSet) return null;
            const isRoot = pc === tonicPc;
            return {
              label: DEG[semis],
              bg: isRoot ? C.sun : semis === 3 || semis === 4 ? C.cyan : C.blue,
              br: isRoot ? C.sunDeep : semis === 3 || semis === 4 ? "#1F7E96" : "#123F62",
              tx: isRoot ? "#fff" : semis === 3 || semis === 4 ? "#06222B" : "#EAF2F7",
              root: isRoot,
              boxShadow: isRoot ? "0 0 0 3px rgba(255,122,46,.32)" : "none",
            };
          }}
        />
      </div>

      <div className="card" style={{ marginTop: 14, background: "rgba(62,155,214,.10)" }}>
        <div className="eyebrow" style={{ marginBottom: 8, color: C.blue }}>The "why"</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.7 }}>
          {mode === "relative" ? (
            <>
              <b>Relative</b> — nothing about the notes changed. {root} major and {names[(rootPc + 9) % 12]} minor
              are the same seven pitches; the only thing that moved is which one you treat as home.
              That is why the switch is inaudible on paper and obvious over a drone: play the identical
              notes over a {root} pedal and it is major, play them over {names[(rootPc + 9) % 12]} and it is
              minor. The scale did not decide — the bass did.
            </>
          ) : (
            <>
              <b>Parallel</b> — home never moved. {root} major and {root} minor both live on {root}; what
              changed is the 3rd, the 6th and the 7th, each falling one fret. Three notes, one semitone
              each, and the whole colour of the key with them. This is the switch songs actually use
              mid-chorus, and it is why "borrowing from the parallel minor" is a real technique while
              "borrowing from the relative minor" is a category error — the relative minor has nothing
              different to lend.
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ==================================================================== #12 */

/**
 * WHY PENTATONIC IS SAFE.
 *
 * Pentatonic gets taught as the beginner scale, which gets the causation
 * backwards: it is safe because of what it LEAVES OUT. Drop the two notes that
 * sit a semitone from a chord tone and nothing left can clash — and those two
 * notes happen to be the tritone of the key, the only unstable interval in it.
 *
 * Both of those facts are computed here (tensionMap, tritonePairs, smallestGap)
 * rather than claimed, so the readout is checking the scale, not repeating me.
 */
function PentatonicWhy() {
  const [root, setRoot] = useState("C");
  const [flavour, setFlavour] = useState("major"); // major | minor
  const [dropped, setDropped] = useState([]);
  const [muted, setMuted] = useState(false);
  const [heard, setHeard] = useState(null);
  const drone = useDrone();

  const rootPc = noteNameToPc(root);
  const names = useMemo(() => keyNames(root, flavour), [root, flavour]);
  useDroneFollow(root);

  const scaleId = flavour === "major" ? "major" : "aeolian";
  const pentId = flavour === "major" ? "majorPent" : "minorPent";
  const quality = flavour === "major" ? "maj" : "min";

  const tension = useMemo(() => tensionMap(scaleId, quality), [scaleId, quality]);
  const clashers = tension.filter((t) => t.clash).map((t) => t.semis);
  const left = tension.filter((t) => !dropped.includes(t.semis)).map((t) => t.semis);

  // What the remaining notes actually are, checked rather than asserted.
  const isPent =
    left.length === SCALES[pentId].ints.length &&
    left.every((s) => SCALES[pentId].ints.includes(s));
  const gap = smallestGap(left);
  const tts = tritonePairs(left);
  const droppedPair = tritonePairs(dropped);

  const triad = () => rootPosition(rootPc, quality, 48);

  const hearAgainst = (semis) => {
    if (muted) return;
    setHeard(semis);
    // The chord first, then the note ON TOP of it — a clash is a relationship,
    // not a property of the note.
    triad().forEach((m, i) => playMidi(m, i * 0.03, 2.6));
    playMidi(60 + rootPc + semis, 0.65, 2.0);
  };

  const hearScale = () => {
    if (muted) return;
    triad().forEach((m, i) => playMidi(m, i * 0.03, 3.4));
    left.forEach((iv, i) => playMidi(60 + rootPc + iv, 0.5 + i * 0.24, 0.5));
    playMidi(72 + rootPc, 0.5 + left.length * 0.24, 1.2);
  };

  const drop = (semis) => setDropped((d) => (d.includes(semis) ? d.filter((x) => x !== semis) : [...d, semis]));

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Key</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {ROOTS.map((r) => (
              <button key={r} className={"chip" + (r === root ? " on" : "")} onClick={() => setRoot(r)}>{r}</button>
            ))}
            <span style={{ width: 8 }} />
            <button className={"btn" + (flavour === "major" ? " on" : "")} onClick={() => { setFlavour("major"); setDropped([]); }}>major</button>
            <button className={"btn" + (flavour === "minor" ? " on" : "")} onClick={() => { setFlavour("minor"); setDropped([]); }}>minor</button>
            <button className={"btn" + (drone.on ? " on" : "")} onClick={() => (drone.on ? drone.stop() : drone.start())} title="Hold the tonic — you cannot hear a clash without something to clash with">
              ♁ {drone.on ? "drone on" : "hold the tonic"}
            </button>
            <button className="btn" onClick={() => setMuted((m) => !m)} aria-pressed={muted}>{muted ? "♪ sound off" : "♪ sound on"}</button>
          </div>
        </div>
      </div>

      {/* the seven degrees, with what each one is doing */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          {root} {flavour} — every note measured against the {root}{flavour === "minor" ? "m" : ""} chord underneath it
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {tension.map((t) => {
            const out = dropped.includes(t.semis);
            const danger = t.clash;
            return (
              <div
                key={t.semis}
                style={{
                  minWidth: 92,
                  padding: "9px 10px",
                  borderRadius: 4,
                  border: `1.5px solid ${out ? C.line : danger ? C.red : t.isChordTone ? C.sun : C.line}`,
                  background: out ? "transparent" : danger ? "rgba(224,83,63,.10)" : t.isChordTone ? "rgba(255,122,46,.12)" : "var(--surface-lo)",
                  opacity: out ? 0.32 : 1,
                  transition: "all .3s ease",
                  textAlign: "center",
                }}
              >
                <div className="mono" style={{ fontSize: 17, fontWeight: 700, color: danger ? C.red : t.isChordTone ? C.sun : C.ink }}>
                  {t.label}
                </div>
                <div className="mono" style={{ fontSize: 11, color: C.ink }}>{names[(rootPc + t.semis) % 12]}</div>
                <div className="mono" style={{ fontSize: 9, color: C.muted, marginTop: 3, lineHeight: 1.4 }}>
                  {t.isChordTone ? "chord tone" : `${t.distance} semitone${t.distance > 1 ? "s" : ""} ${t.side} the ${t.nearestLabel}`}
                </div>
                {danger && (
                  <div style={{ display: "flex", gap: 4, marginTop: 6, justifyContent: "center" }}>
                    <button className="btn" style={{ padding: "2px 6px", fontSize: 10 }} onClick={() => hearAgainst(t.semis)}>♪</button>
                    <button className="btn" style={{ padding: "2px 6px", fontSize: 10 }} onClick={() => drop(t.semis)}>{out ? "↺" : "✕"}</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {heard != null && (
          <div className="mono" style={{ fontSize: 12, color: C.red, marginTop: 10, lineHeight: 1.6 }}>
            That is the {DEG[heard]} ({names[(rootPc + heard) % 12]}) held over the {root}{flavour === "minor" ? "m" : ""} chord —
            a semitone {tension.find((t) => t.semis === heard).side} the {tension.find((t) => t.semis === heard).nearestLabel}. It does not sound wrong
            passing through; it sounds wrong when you STOP on it, because a semitone wants to resolve and you
            are refusing to let it.
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
          <button className="btn" onClick={hearScale}>▶ hear what's left over the chord</button>
          {dropped.length < clashers.length && (
            <button className="btn" style={{ borderColor: C.sun, color: C.sun }} onClick={() => setDropped(clashers)}>
              ✕ drop both
            </button>
          )}
          {dropped.length > 0 && <button className="btn" onClick={() => setDropped([])}>↺ put them back</button>}
        </div>
      </div>

      {/* the computed verdict */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16 }}>
        <div className="card" style={{ flex: "1 1 300px", minWidth: 280 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>What's left, measured</div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px dashed ${C.grid}`, fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}>
            <span style={{ color: C.muted }}>notes</span><span style={{ fontWeight: 700 }}>{left.length}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px dashed ${C.grid}`, fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}>
            <span style={{ color: C.muted }}>smallest gap between any two</span>
            <span style={{ fontWeight: 700, color: gap === 1 ? C.red : C.green }}>{gap} semitone{gap === 1 ? "" : "s"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px dashed ${C.grid}`, fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}>
            <span style={{ color: C.muted }}>tritones inside it</span>
            <span style={{ fontWeight: 700, color: tts.length ? C.red : C.green }}>{tts.length}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}>
            <span style={{ color: C.muted }}>this scale is</span>
            <span style={{ fontWeight: 700, color: isPent ? C.sun : C.ink }}>
              {isPent ? SCALES[pentId].name : dropped.length ? "a 6-note scale" : SCALES[scaleId].name}
            </span>
          </div>
        </div>

        <div className="card" style={{ flex: "1 1 320px", minWidth: 300, background: "rgba(62,155,214,.10)" }}>
          <div className="eyebrow" style={{ marginBottom: 8, color: C.blue }}>The "why"</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.7 }}>
            {!isPent ? (
              <>
                Two of these seven notes sit a semitone away from a chord tone: the{" "}
                <b style={{ color: C.red }}>{clashers.map((s) => DEG[s]).join(" and the ")}</b>
                {" "}({tension.filter((t) => t.clash).map((t) => `the ${t.label} leans on the ${t.nearestLabel} from ${t.side}`).join(", ")}). Hold either one
                over the chord and it sounds like a mistake — not because the note is bad, but because a
                semitone is a question and stopping on it refuses to answer. Drop both and see what is left.
              </>
            ) : (
              <>
                That is {SCALES[pentId].name}, and now you know what it actually is: {root} {flavour} with
                the two dangerous notes taken out. Nothing left is closer than {gap} semitones to anything
                else, so <b>no note in it can clash with the chord underneath</b> — which is why you can
                run it blindfolded.
                {droppedPair.length > 0 && (
                  <>
                    {" "}And the two you removed — {dropped.map((s) => names[(rootPc + s) % 12]).join(" and ")} —
                    are a <b style={{ color: C.red }}>tritone apart</b>: the one unstable interval the key
                    contains. Pentatonic is the scale with its tritone removed. That is the whole trick.
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* the neck */}
      <div style={{ marginTop: 16 }}>
        <Neck
          root={root}
          frets={FRETS}
          slide
          stringGauge
          inlays="double"
          onTap={(midi) => { if (!muted) playMidi(midi, 0, 1.2); }}
          resolve={(pc, semis) => {
            const inScale = tension.some((t) => t.semis === semis);
            if (!inScale) return null;
            const out = dropped.includes(semis);
            const t = tension.find((x) => x.semis === semis);
            const chordTone = t.isChordTone;
            return {
              label: DEG[semis],
              bg: out ? "transparent" : chordTone ? (semis === 0 ? C.sun : C.cyan) : t.clash ? C.red : C.blue,
              br: out ? C.line : chordTone ? (semis === 0 ? C.sunDeep : "#1F7E96") : t.clash ? "#8E2A1D" : "#123F62",
              tx: out ? C.muted : semis === 0 ? "#fff" : chordTone ? "#06222B" : "#fff",
              dashed: out,
              opacity: out ? 0.35 : 1,
              root: semis === 0,
              title: `${names[pc]} — ${t.isChordTone ? "chord tone" : t.clash ? `a semitone ${t.side} the ${t.nearestLabel}` : "safe passing tone"}`,
            };
          }}
        />
      </div>
    </div>
  );
}
