import React, { useEffect, useMemo, useRef, useState } from "react";
import { ROOTS, SCALES, DEG, FRETS, noteNameToPc, keyNames } from "../theory/engine.js";
import { positionsFor, sequenceOrder, PATTERNS } from "../theory/positions.js";
import { C } from "../ui/theme.js";
import Neck from "./Neck.jsx";
import { playMidi } from "../audio/engine.js";
import { useMetronome } from "../audio/useMetronome.jsx";
import { useDroneFollow } from "../audio/useDrone.js";

/**
 * POSITIONS & SEQUENCES — the scale as something your hand does.
 *
 * The app could always light up a scale across 24 frets, which is the least
 * useful way to see it: nobody plays a wall of dots. What you play is one box,
 * and then a sequence through that box.
 *
 * So: the boxes, derived rather than memorised (see theory/positions.js), and
 * a dot that walks a pattern through the one you picked — in time with the
 * metronome, because a scale sequence practised out of time is just finger
 * gymnastics. The click was built for exactly this and had nothing hanging off
 * it until now.
 */

const SCALE_IDS = ["minorPent", "majorPent", "blues", "major", "aeolian", "dorian", "mixolydian", "harmonicMinor", "melodicMinor"];

export default function ScalePositions() {
  const [root, setRoot] = useState("A");
  const [scaleId, setScaleId] = useState("minorPent");
  const [boxIdx, setBoxIdx] = useState(0);
  const [pattern, setPattern] = useState("straight");
  const [updown, setUpdown] = useState(true);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(-1);
  const [sound, setSound] = useState(true);
  const met = useMetronome();

  const rootPc = noteNameToPc(root);
  const names = useMemo(() => keyNames(root, SCALES[scaleId].ints.includes(3) ? "minor" : "major"), [root, scaleId]);
  useDroneFollow(root);

  const boxes = useMemo(() => positionsFor(scaleId, rootPc), [scaleId, rootPc]);
  const box = boxes[Math.min(boxIdx, boxes.length - 1)] || null;
  const order = useMemo(
    () => (box ? sequenceOrder(box.notes.length, pattern, { updown }) : []),
    [box, pattern, updown]
  );
  const current = step >= 0 && order.length ? box.notes[order[step % order.length]] : null;

  /* ---- the dot walks on the click ---- */
  const metRef = useRef(met);
  metRef.current = met;
  const orderRef = useRef(order);
  orderRef.current = order;
  const boxRef = useRef(box);
  boxRef.current = box;
  const soundRef = useRef(sound);
  soundRef.current = sound;

  useEffect(() => {
    if (!running) return;
    const m = metRef.current;
    if (!m) return;
    let i = -1;
    setStep(-1);
    const off = m.onTick((ev) => {
      if (ev.isCountIn) return;
      // Every subdivision, not every beat: switch the click to ♪♪ and the
      // sequence doubles, which is how you actually practise these.
      i += 1;
      const ord = orderRef.current;
      const b = boxRef.current;
      if (!ord.length || !b) return;
      const at = i % ord.length;
      setStep(at);
      const note = b.notes[ord[at]];
      if (note && soundRef.current) playMidi(note.midi, 0, 0.35, 0.22);
    });
    return () => off();
  }, [running]);

  const start = () => {
    setRunning(true);
    if (met && !met.running) met.start();
  };
  const stop = () => {
    setRunning(false);
    setStep(-1);
  };
  useEffect(() => stop, []);
  // A different box or pattern under a running sequence would leave the dot
  // pointing at a note that no longer exists.
  useEffect(() => { if (running) setStep(-1); }, [scaleId, root, boxIdx, pattern, updown, running]);

  const inBox = useMemo(() => {
    const set = new Set();
    if (box) box.notes.forEach((n) => set.add(n.s + ":" + n.f));
    return set;
  }, [box]);

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span className="eyebrow" style={{ margin: 0 }}>Key</span>
          {ROOTS.map((r) => (
            <button key={r} className={"chip" + (r === root ? " on" : "")} onClick={() => setRoot(r)}>{r}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span className="eyebrow" style={{ margin: 0 }}>Scale</span>
          {SCALE_IDS.map((id) => (
            <button key={id} className={"btn" + (scaleId === id ? " on" : "")} style={{ padding: "4px 8px" }}
                    onClick={() => { setScaleId(id); setBoxIdx(0); }}>
              {SCALES[id].name}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span className="eyebrow" style={{ margin: 0 }}>Box</span>
          {boxes.map((b, i) => (
            <button key={i} className={"btn" + (boxIdx === i ? " on" : "")} style={{ padding: "4px 9px" }} onClick={() => setBoxIdx(i)}
                    title={`Starts on the ${b.startDegree} at fret ${b.start} · ${b.span + 1} frets wide`}>
              {i + 1} <span style={{ opacity: 0.6, fontSize: 10 }}>fr {b.start} · {b.startDegree}</span>
            </button>
          ))}
          <span className="mono" style={{ fontSize: 11, color: C.muted }}>
            {boxes.length} boxes · {box ? box.perString : 0} notes per string
          </span>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span className="eyebrow" style={{ margin: 0 }}>Sequence</span>
          {Object.entries(PATTERNS).map(([id, p]) => (
            <button key={id} className={"btn" + (pattern === id ? " on" : "")} style={{ padding: "4px 9px" }} onClick={() => setPattern(id)} title={p.blurb}>
              {p.name}
            </button>
          ))}
          <button className={"btn" + (updown ? " on" : "")} style={{ padding: "4px 9px" }} onClick={() => setUpdown((v) => !v)}>
            {updown ? "up & down" : "up only"}
          </button>
          <button className={"btn" + (sound ? " on" : "")} style={{ padding: "4px 9px" }} onClick={() => setSound((v) => !v)}
                  title="Turn this off and follow the dot with your own hands">
            {sound ? "🔊 app plays" : "🔇 you play"}
          </button>
          {running ? (
            <button className="btn on" onClick={stop}>■ stop</button>
          ) : (
            <button className="btn" onClick={start} disabled={!met} style={{ borderColor: C.sun, color: C.sun }}>▶ run it on the click</button>
          )}
          {met && (
            <span className="mono" style={{ fontSize: 11, color: C.muted }}>
              {met.bpm} BPM · one note per {met.sub === 1 ? "beat" : met.sub === 2 ? "eighth" : met.sub === 3 ? "triplet" : "sixteenth"}
            </span>
          )}
        </div>
      </div>

      {/* the box on the neck */}
      <div style={{ marginTop: 16 }}>
        <Neck
          root={root}
          frets={FRETS}
          stringGauge
          inlays="double"
          boxes={box ? [{ start: box.start, span: box.span, color: C.sun, bg: "rgba(255,122,46,.07)" }] : []}
          onTap={(midi) => playMidi(midi, 0, 1)}
          resolve={(pc, semis, { s, f, names: nm }) => {
            const here = inBox.has(s + ":" + f);
            const isCurrent = current && current.s === s && current.f === f;
            const inScale = SCALES[scaleId].ints.includes(semis);
            if (!here && !inScale) return null;
            if (!here) {
              // The rest of the scale, faint: the box is a window onto it, not
              // a different set of notes.
              return {
                label: "",
                bg: "transparent",
                br: C.line,
                tx: C.muted,
                dashed: true,
                opacity: 0.3,
                size: 12,
                zIndex: 1,
                title: `${nm[pc]} — in the scale, outside this box`,
              };
            }
            const isRoot = semis === 0;
            return {
              label: DEG[semis],
              bg: isCurrent ? C.green : isRoot ? C.sun : semis === 3 || semis === 4 ? C.cyan : C.blue,
              br: isCurrent ? "#2C7E48" : isRoot ? C.sunDeep : semis === 3 || semis === 4 ? "#1F7E96" : "#123F62",
              tx: isCurrent || isRoot ? "#fff" : semis === 3 || semis === 4 ? "#06222B" : "#EAF2F7",
              size: isCurrent ? 26 : isRoot ? 23 : 21,
              zIndex: isCurrent ? 6 : 2,
              boxShadow: isCurrent ? "0 0 0 5px rgba(70,179,107,.35)" : isRoot ? "0 0 0 3px rgba(255,122,46,.3)" : "none",
              title: `${nm[pc]} · string ${s + 1} fret ${f}`,
            };
          }}
        />
      </div>

      {/* the sequence itself */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          {PATTERNS[pattern].name} — {PATTERNS[pattern].blurb} · {order.length} notes
        </div>
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          {order.slice(0, 64).map((noteIdx, i) => {
            const n = box ? box.notes[noteIdx] : null;
            const on = i === step;
            return (
              <span
                key={i}
                className="mono"
                style={{
                  minWidth: 22,
                  textAlign: "center",
                  padding: "2px 4px",
                  borderRadius: 3,
                  fontSize: 11,
                  border: `1px solid ${on ? C.green : C.line}`,
                  background: on ? C.green : "transparent",
                  color: on ? "#fff" : C.muted,
                }}
              >
                {n ? n.degree : "?"}
              </span>
            );
          })}
          {order.length > 64 && <span className="mono" style={{ fontSize: 11, color: C.muted }}>+{order.length - 64}</span>}
        </div>
        <div className="mono" style={{ fontSize: 12, color: C.ink, marginTop: 10, lineHeight: 1.6 }}>
          {current ? (
            <>
              now: <b style={{ color: C.green }}>{names[current.pc]}</b> — the {current.degree}, string {current.s + 1} fret {current.f}
            </>
          ) : (
            <span style={{ color: C.muted }}>
              Box {boxIdx + 1} starts on the {box ? box.startDegree : "?"} at fret {box ? box.start : "?"} and is{" "}
              {box ? box.span + 1 : 0} frets wide — one hand position. Run a sequence through it on the click; turn
              the app's sound off and it becomes a dot to chase.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
