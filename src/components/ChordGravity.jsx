import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ROOTS,
  DEG,
  KEY_MODES,
  FUNCTION_NAME,
  FUNCTION_BLURB,
  noteNameToPc,
  buildNoteNames,
  pcName,
} from "../theory/engine.js";
import { gravityMap, secondaryDominant, tritoneSub, tritoneResolution, dominantOf, borrowedChords } from "../theory/harmony.js";
import { rootPosition } from "../theory/voicing.js";
import { C } from "../ui/theme.js";
import { playMidi } from "../audio/engine.js";
import { useDroneFollow } from "../audio/useDrone.js";
import { useMicPitch, MIC_STATES } from "../audio/pitch.js";
import { pickWeighted, record } from "../data/progress.js";
import WeakSpots from "./WeakSpots.jsx";

/**
 * CHORD GRAVITY — why one chord follows another.
 *
 * Every other page in this app answers "what notes are in this thing". None of
 * them answered "why does this chord want to be followed by that one", which
 * is the question that turns a pile of chords into music.
 *
 * Three parts, in order of how much they teach:
 *   1. THE MAP — the seven chords of a key, coloured by function, with arrows
 *      weighted by how hard each one pulls toward the next.
 *   2. THE TRITONE — the two notes inside a dominant that do the actual work,
 *      resolved by hand, and then the substitution that falls out of it free.
 *   3. THE DRILL — the app plays a V7 in a random key, you play the I. Do it
 *      thirty times and resolution stops being a word and becomes a reflex.
 */

const FN_COLOR = { T: C.green, S: C.blue, D: C.sun };
const BASE = 52; // where the demonstration chords sit

const readBest = () => {
  try { return Number(localStorage.getItem("gravity.best")) || 0; } catch { return 0; }
};
const writeBest = (n) => {
  try { localStorage.setItem("gravity.best", String(n)); } catch {}
};

export default function ChordGravity() {
  const [root, setRoot] = useState("C");
  const [keyMode, setKeyMode] = useState("major");
  const [sel, setSel] = useState(4); // V — the one worth looking at first
  const [muted, setMuted] = useState(false);

  useDroneFollow(root);

  const rootPc = noteNameToPc(root);
  const names = useMemo(() => buildNoteNames(root), [root]);
  const map = useMemo(() => gravityMap(rootPc, keyMode, root), [rootPc, keyMode, root]);
  const chords = map.chords;
  const here = chords[sel] || chords[0];

  const midisOf = (c) => rootPosition(c.rootPc, c.quality, BASE);
  const playChord = (c, when = 0) => {
    if (muted) return;
    const midis = midisOf(c);
    midis.forEach((m, i) => playMidi(m, when + i * 0.02, 1.5));
  };
  // Two chords back to back, which is the only way a "pull" can be heard.
  const playMove = (a, b) => {
    if (muted) return;
    playChord(a, 0);
    playChord(b, 0.95);
  };

  return (
    <div>
      <style>{`
        .cg-node{ cursor:pointer; }
        .cg-node text{ pointer-events:none; }
        .cg-bar{ height:6px; border-radius:3px; background: var(--surface); overflow:hidden; }
        .cg-bar i{ display:block; height:100%; border-radius:3px; }
        .cg-edge{ transition: opacity .18s, stroke-width .18s; }
        .cg-tt{ transition: transform .55s cubic-bezier(.4,0,.15,1), fill .4s; }
      `}</style>

      {/* ---- key ---- */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Key</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {ROOTS.map((r) => (
              <button key={r} className={"chip" + (r === root ? " on" : "")} onClick={() => setRoot(r)}>{r}</button>
            ))}
            <span style={{ width: 10 }} />
            {Object.entries(KEY_MODES).map(([id, m]) => (
              <button key={id} className={"btn" + (keyMode === id ? " on" : "")} onClick={() => setKeyMode(id)}>{m.name}</button>
            ))}
            <button className="btn" onClick={() => setMuted((m) => !m)} aria-pressed={muted}>{muted ? "♪ sound off" : "♪ sound on"}</button>
          </div>
        </div>
      </div>

      {/* ---- 1. the map ---- */}
      <div style={{ marginTop: 18 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          The gravity map — thicker arrow, stronger pull. Tap a chord.
        </div>
        <GravityGraph chords={chords} sel={sel} onSelect={(i) => { setSel(i); playChord(chords[i]); }} />
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
          {["T", "S", "D"].map((f) => (
            <span key={f} className="mono" style={{ fontSize: 11, color: C.ink, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 999, background: FN_COLOR[f], display: "inline-block" }} />
              {FUNCTION_NAME[f]} — {FUNCTION_BLURB[f]}
            </span>
          ))}
        </div>
      </div>

      {/* ---- the selected chord ---- */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16 }}>
        <div className="card" style={{ flex: "1 1 320px", minWidth: 300 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Where {here.label} wants to go</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
            <span className="mono" style={{ fontSize: 26, fontWeight: 700, color: FN_COLOR[here.fn] }}>{here.label}</span>
            <span className="mono" style={{ fontSize: 13, color: C.muted }}>{here.rn} · {FUNCTION_NAME[here.fn]}</span>
          </div>
          <div className="mono" style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>{here.why}</div>

          {here.out.length === 0 && (
            <div className="mono" style={{ fontSize: 12, color: C.muted }}>
              Nothing pulls hard out of this one — it is a chord you pass through, not one you leave from.
            </div>
          )}
          {here.out.map((e) => {
            const target = chords[e.to];
            return (
              <div key={e.to} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <button className="btn" style={{ padding: "3px 8px" }} onClick={() => playMove(here, target)} title={`Hear ${here.label} resolve to ${target.label}`}>
                    ▶ {here.rn} → {target.rn}
                  </button>
                  <span className="mono" style={{ fontSize: 12, color: C.ink }}>{target.label}</span>
                  <span className="mono" style={{ fontSize: 10.5, color: C.muted, marginLeft: "auto" }}>{Math.round(e.w * 100)}%</span>
                </div>
                <div className="cg-bar"><i style={{ width: `${e.w * 100}%`, background: e.w > 0.7 ? C.sun : e.w > 0.5 ? C.blue : C.line }} /></div>
                <div className="mono" style={{ fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>{e.why}</div>
              </div>
            );
          })}

          {/* #8 — secondary dominants: any chord can be a temporary tonic */}
          <SecondaryDominant here={here} root={root} playChord={playChord} muted={muted} />
        </div>

        {/* ---- 2. the tritone ---- */}
        <Tritone root={root} rootPc={rootPc} keyMode={keyMode} names={names} muted={muted} />
      </div>

      {/* ---- borrowed chords (#7) ---- */}
      {keyMode === "major" && <Borrowed rootPc={rootPc} root={root} chords={chords} playChord={playChord} playMove={playMove} />}

      {/* ---- 3. the drill ---- */}
      <ResolveDrill root={root} keyMode={keyMode} muted={muted} />
    </div>
  );
}

/* ======================= the map ======================= */

function GravityGraph({ chords, sel, onSelect }) {
  const n = chords.length;
  const colW = 96;
  const padX = 56;
  const W = padX * 2 + (n - 1) * colW;
  const arcH = 132;
  const H = arcH + 92;
  const cy = arcH + 32;
  const x = (i) => padX + i * colW;

  // Draw every edge, but bring the selected chord's own edges forward — the
  // full web at once is a hairball, one chord's pull is a lesson.
  const edges = chords.flatMap((c, i) => c.out.map((e) => ({ ...e, i })));

  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={W} height={H} role="img" aria-label="Chord gravity map">
        <defs>
          <marker id="cg-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 8 4 L 0 8 z" fill={C.sun} />
          </marker>
          <marker id="cg-arrow-dim" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 8 4 L 0 8 z" fill={C.line} />
          </marker>
        </defs>

        {edges.map((e, k) => {
          const on = e.from === sel;
          const x1 = x(e.from);
          const x2 = x(e.to);
          const lift = Math.min(arcH - 8, 34 + Math.abs(e.to - e.from) * 26);
          const mid = (x1 + x2) / 2;
          return (
            <path
              key={k}
              className="cg-edge"
              d={`M ${x1} ${cy - 26} Q ${mid} ${cy - 26 - lift} ${x2} ${cy - 26}`}
              fill="none"
              stroke={on ? C.sun : C.line}
              strokeWidth={on ? 1 + e.w * 6 : 1}
              opacity={on ? 0.9 : 0.22}
              markerEnd={on ? "url(#cg-arrow)" : "url(#cg-arrow-dim)"}
            />
          );
        })}

        {chords.map((c, i) => (
          <g key={i} className="cg-node" onClick={() => onSelect(i)} role="button" tabIndex={0}
             onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onSelect(i); } }}>
            <circle
              cx={x(i)}
              cy={cy}
              r={i === sel ? 27 : 24}
              fill={i === sel ? FN_COLOR[c.fn] : "var(--surface)"}
              stroke={FN_COLOR[c.fn]}
              strokeWidth={i === sel ? 3 : 2}
              style={{ transition: "r .15s, fill .15s" }}
            />
            <text x={x(i)} y={cy + 4} textAnchor="middle" fontSize="13" fontWeight="700"
                  fill={i === sel ? "#fff" : C.ink} style={{ fontFamily: "ui-monospace, monospace" }}>
              {c.label}
            </text>
            <text x={x(i)} y={cy + 44} textAnchor="middle" fontSize="12" fontWeight="700" fill={C.muted}
                  style={{ fontFamily: "ui-monospace, monospace" }}>
              {c.rn}
            </text>
            <text x={x(i)} y={cy + 58} textAnchor="middle" fontSize="9" fill={FN_COLOR[c.fn]}
                  style={{ fontFamily: "ui-monospace, monospace" }}>
              {c.fn}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ======================= secondary dominants (#8) ======================= */

function SecondaryDominant({ here, root, playChord, muted }) {
  const [shown, setShown] = useState(false);
  const sd = useMemo(() => secondaryDominant(here.rootPc, { key: root, targetLabel: here.rn }), [here, root]);
  // Aiming a dominant at the tonic is just V7 — there is nothing "secondary"
  // about it, so the button only appears for the other six.
  if (here.semis === 0) return null;

  const play = (withDom) => {
    if (muted) return;
    setShown(true);
    if (withDom) {
      playChord({ rootPc: sd.rootPc, quality: "dom7" }, 0);
      playChord(here, 1.0);
    } else {
      playChord(here, 0);
    }
  };

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${C.line}` }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>Aim a dominant at it — {sd.rn}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn" style={{ padding: "4px 9px" }} onClick={() => play(false)}>▶ {here.rn} on its own</button>
        <button className="btn" style={{ padding: "4px 9px", borderColor: C.sun, color: C.sun }} onClick={() => play(true)}>
          ▶ {sd.label} → {here.label}
        </button>
      </div>
      <div className="mono" style={{ fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 1.55 }}>
        {shown
          ? `${sd.label} is not in this key — that is exactly why it works. For one bar ${here.label} becomes the tonic, and it arrives like a destination instead of a passing chord.`
          : `Put ${sd.label} in front of ${here.label} and any chord can be a temporary tonic. Play them back to back; the difference is the whole lesson.`}
      </div>
    </div>
  );
}

/* ======================= the tritone (#4) ======================= */

const TT_HOME = [70, 220];   // where the two notes sit, a tritone apart
const TT_DEST = [108, 182];  // where they land, a semitone each, toward each other

function Tritone({ root, rootPc, keyMode, names, muted }) {
  const [resolved, setResolved] = useState(false);
  const [sub, setSub] = useState(false);
  // Dragging the two notes inward by hand is the point of this lesson: you do
  // the resolving, with your own fingers, one semitone each. The button is
  // still there for anyone on a device that hates dragging.
  const [drag, setDrag] = useState(null); // { i, dx }
  const dragRef = useRef(null);

  const dom = useMemo(() => dominantOf(rootPc, keyMode, root), [rootPc, keyMode, root]);
  const ts = useMemo(() => tritoneSub(dom.rootPc, { key: root }), [dom.rootPc, root]);
  const res = useMemo(() => tritoneResolution(dom.rootPc, { key: root }), [dom.rootPc, root]);
  const current = sub ? ts : dom;

  const play = (which) => {
    if (muted) return;
    const from = which === "sub" ? ts.rootPc : dom.rootPc;
    rootPosition(from, "dom7", BASE).forEach((m, i) => playMidi(m, i * 0.02, 1.3));
    const tonic = rootPosition(rootPc, keyMode === "minor" ? "min" : "maj", BASE);
    tonic.forEach((m, i) => playMidi(m, 1.0 + i * 0.02, 1.8));
    setResolved(true);
  };

  // Landing them by hand should sound like landing them: the pair, then the
  // chord they just turned into.
  const resolveIt = () => {
    setResolved(true);
    if (muted || !dom.tritone) return;
    playMidi(60 + dom.tritone.third.pc, 0, 0.9);
    playMidi(60 + dom.tritone.seventh.pc, 0, 0.9);
    rootPosition(rootPc, keyMode === "minor" ? "min" : "maj", BASE).forEach((m, i) =>
      playMidi(m, 0.5 + i * 0.02, 1.7)
    );
  };

  if (!dom.tritone || !res) return null;

  return (
    <div className="card" style={{ flex: "1 1 320px", minWidth: 300, background: "rgba(224,83,63,.08)" }}>
      <div className="eyebrow" style={{ marginBottom: 8, color: C.red }}>The tritone — what makes a dominant dominant</div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
        <span className="mono" style={{ fontSize: 24, fontWeight: 700, color: C.ink }}>{current.label}</span>
        <span className="mono" style={{ fontSize: 12, color: C.muted }}>
          {sub ? "the tritone substitute" : dom.rn + " of " + root}
        </span>
      </div>

      <div className="mono" style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.6, marginBottom: 10 }}>
        Of the four notes in {dom.label}, only two are doing anything:{" "}
        <b style={{ color: C.red }}>{names[dom.tritone.third.pc]}</b> (the 3rd) and{" "}
        <b style={{ color: C.red }}>{names[dom.tritone.seventh.pc]}</b> (the ♭7). They are a tritone
        apart — the least stable interval there is — and they resolve by moving
        <b> toward each other</b>, one fret each.
      </div>

      {/* the two notes — drag them toward each other, one fret each */}
      <svg
        width="290"
        height="92"
        role="img"
        aria-label="the tritone: drag the two notes toward each other to resolve them"
        style={{ touchAction: "none" }}
        onPointerMove={(e) => {
          const d = dragRef.current;
          if (!d) return;
          const travel = TT_DEST[d.i] - TT_HOME[d.i];       // +38 or −38
          const raw = e.clientX - d.startX + (d.from === "resolved" ? travel : 0);
          // Clamp to the semitone: you can move it exactly as far as the note
          // actually moves, and no further.
          const dx = travel > 0 ? Math.max(0, Math.min(travel, raw)) : Math.min(0, Math.max(travel, raw));
          setDrag({ i: d.i, dx });
        }}
        onPointerUp={(e) => {
          const d = dragRef.current;
          if (!d) return;
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
          const travel = TT_DEST[d.i] - TT_HOME[d.i];
          const got = drag ? drag.dx / travel : 0;   // 0 = home, 1 = landed
          dragRef.current = null;
          setDrag(null);
          if (got > 0.55) resolveIt();
          else if (got < 0.45) setResolved(false);
        }}
        onPointerLeave={() => { dragRef.current = null; setDrag(null); }}
      >
        <line x1="20" y1="46" x2="270" y2="46" stroke={C.line} strokeWidth="1" opacity="0.5" />
        {/* the semitone each note has to travel */}
        {!resolved && !drag && TT_HOME.map((h, i) => (
          <line key={"t" + i} x1={h + (i === 0 ? 22 : -22)} y1="46" x2={TT_DEST[i] + (i === 0 ? -22 : 22)} y2="46"
                stroke={C.muted} strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
        ))}
        {[
          { pc: dom.tritone.third.pc, to: res.moves[0].to, lab: "3" },
          { pc: dom.tritone.seventh.pc, to: res.moves[1].to, lab: "♭7" },
        ].map((t, i) => {
          const travel = TT_DEST[i] - TT_HOME[i];
          const dx = drag && drag.i === i ? drag.dx : resolved ? travel : 0;
          const frac = Math.abs(dx / travel);
          // Past halfway the note has become the note it resolves to — that is
          // the moment worth showing, and you get to see it happen under your
          // own finger.
          const there = frac > 0.5;
          const dragging = drag && drag.i === i;
          return (
            <g
              key={i}
              className={dragging ? undefined : "cg-tt"}
              style={{ transform: `translate(${dx}px, 0)`, cursor: "grab" }}
              onPointerDown={(e) => {
                e.preventDefault();
                try { e.currentTarget.ownerSVGElement.setPointerCapture(e.pointerId); } catch {}
                dragRef.current = { i, startX: e.clientX, from: resolved ? "resolved" : "home" };
                setDrag({ i, dx: resolved ? travel : 0 });
              }}
            >
              <circle cx={TT_HOME[i]} cy="46" r="20"
                      fill={there ? C.cyan : C.red}
                      stroke={there ? "#1F7E96" : "#8E2A1D"} strokeWidth="2" />
              <text x={TT_HOME[i]} y="50" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff"
                    style={{ fontFamily: "ui-monospace, monospace", pointerEvents: "none" }}>
                {names[there ? t.to : t.pc]}
              </text>
              <text x={TT_HOME[i]} y="82" textAnchor="middle" fontSize="9.5" fill={C.muted}
                    style={{ fontFamily: "ui-monospace, monospace", pointerEvents: "none" }}>
                {there ? (i === 0 ? "→ the 1" : "→ the 3") : t.lab}
              </text>
            </g>
          );
        })}
        {!resolved && !drag && (
          <text x="145" y="18" textAnchor="middle" fontSize="10" fill={C.red} style={{ fontFamily: "ui-monospace, monospace" }}>
            ← tritone · drag them together →
          </text>
        )}
      </svg>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
        <button className="btn" style={{ padding: "4px 9px" }} onClick={() => (resolved ? setResolved(false) : resolveIt())}>
          {resolved ? "↺ pull them apart" : "→ resolve them inward"}
        </button>
        <button className="btn" style={{ padding: "4px 9px" }} onClick={() => play("dom")}>♪ {dom.label} → {root}</button>
        <button
          className={"btn" + (sub ? " on" : "")}
          style={{ padding: "4px 9px" }}
          onClick={() => { setSub((v) => !v); play("sub"); }}
          title="The same two notes live inside this chord too"
        >
          ⇄ {ts.label} → {root}
        </button>
      </div>

      <div className="mono" style={{ fontSize: 11, color: C.muted, marginTop: 8, lineHeight: 1.6 }}>
        {sub
          ? `${ts.label} contains the identical pair — ${names[ts.shared[0]]} and ${names[ts.shared[1]]} — with the jobs swapped: the 3rd of one is the ♭7 of the other. Same tension, same resolution, and the bass walks down a semitone instead of leaping a fifth. That is tritone substitution, and it falls straight out of the interval.`
          : `A tritone is symmetrical, which means these two notes belong to two different dominants at once. Flip the switch and hear the other one.`}
      </div>
    </div>
  );
}

/* ======================= borrowed chords (#7) ======================= */

function Borrowed({ rootPc, root, chords, playChord, playMove }) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(0);
  const list = useMemo(() => borrowedChords(rootPc, { key: root }), [rootPc, root]);
  const b = list[pick];
  const home = chords[b.replaces];

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div className="eyebrow" style={{ margin: 0 }}>Borrowed chords — the parallel minor, dropped into a major key</div>
        <button className="btn" style={{ padding: "3px 9px" }} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? "− hide" : "+ show"}
        </button>
      </div>

      {open && (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            {list.map((x, i) => (
              <button key={x.rn} className={"btn" + (pick === i ? " on" : "")} onClick={() => setPick(i)}>
                {x.rn} <span style={{ opacity: 0.6, fontSize: 10 }}>{x.label}</span>
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
            <button className="btn" onClick={() => playChord(home)}>▶ {home.rn} · {home.label}</button>
            <span className="mono" style={{ color: C.muted, fontSize: 12 }}>↔</span>
            <button className="btn" style={{ borderColor: C.violet, color: C.violet }} onClick={() => playChord({ rootPc: b.rootPc, quality: b.quality })}>
              ▶ {b.rn} · {b.label}
            </button>
            <button className="btn" style={{ padding: "4px 9px" }} onClick={() => playMove({ rootPc: b.rootPc, quality: b.quality }, chords[0])}>
              ▶ {b.rn} → {chords[0].rn}
            </button>
          </div>

          <div className="mono" style={{ fontSize: 12, color: C.ink, marginTop: 10, lineHeight: 1.6 }}>
            {b.why}{" "}
            {b.newNotes.length > 0 && (
              <>
                The note it drags in from {root} minor is{" "}
                <b style={{ color: C.violet }}>{b.newNotes.map((pc) => pcName(pc, root, "flat")).join(" and ")}</b> — swap{" "}
                {b.replacesLabel} for {b.label} and that single note is what makes the chorus sound like that.
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ======================= the drill (#3) ======================= */

const DRILL_KEYS = ROOTS;

function ResolveDrill({ root, keyMode, muted }) {
  const [answerBy, setAnswerBy] = useState("tap"); // tap | play
  const [keyPool, setKeyPool] = useState("all"); // all | this
  const [q, setQ] = useState(null); // { tonicPc, keyName }
  const [status, setStatus] = useState("idle"); // idle | asking | right
  const [wrongPc, setWrongPc] = useState(null);
  const [score, setScore] = useState({ asked: 0, right: 0, streak: 0 });
  const [best, setBest] = useState(readBest);
  const [reveal, setReveal] = useState(false);
  const advance = useRef(null);
  const ringing = useRef(null);
  const lastWrong = useRef(null);

  const mic = useMicPitch({ active: answerBy === "play" });

  useEffect(() => () => clearTimeout(advance.current), []);
  useEffect(() => {
    // The mic is only open while this drill wants it — same contract as the
    // Listen page, and the drone ducks itself while it is.
    if (answerBy === "play") mic.start();
    else mic.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answerBy]);

  const playPrompt = (tonicPc) => {
    if (muted) return;
    const dom = dominantOf(tonicPc, keyMode, "C");
    rootPosition(dom.rootPc, "dom7", BASE).forEach((m, i) => playMidi(m, i * 0.03, 2.2));
  };

  const ask = () => {
    const pool = keyPool === "this" ? [root] : DRILL_KEYS;
    // The keys you keep failing to resolve come round more often.
    const keyName = pickWeighted("gravity.keys", pool, { avoid: q ? pcName(q.tonicPc, "C") : null });
    const tonicPc = noteNameToPc(keyName);
    setQ({ tonicPc, keyName });
    setStatus("asking");
    setWrongPc(null);
    setReveal(false);
    lastWrong.current = null;
    setScore((s) => ({ ...s, asked: s.asked + 1 }));
    playPrompt(tonicPc);
  };

  const stop = () => {
    clearTimeout(advance.current);
    setQ(null);
    setStatus("idle");
    setWrongPc(null);
    setReveal(false);
    ringing.current = null;
  };

  const land = () => {
    if (!q) return;
    record("gravity.keys", pcName(q.tonicPc, "C"), true);
    setStatus("right");
    setWrongPc(null);
    if (!muted) {
      rootPosition(q.tonicPc, keyMode === "minor" ? "min" : "maj", BASE).forEach((m, i) => playMidi(m, i * 0.02, 1.9));
    }
    const streak = score.streak + 1;
    setScore((s) => ({ ...s, right: s.right + 1, streak: s.streak + 1 }));
    if (streak > best) { setBest(streak); writeBest(streak); }
    clearTimeout(advance.current);
    advance.current = setTimeout(ask, 1600);
  };

  const miss = (pc) => {
    if (lastWrong.current === pc) return;
    lastWrong.current = pc;
    if (q) record("gravity.keys", pcName(q.tonicPc, "C"), false);
    setWrongPc(pc);
    setScore((s) => ({ ...s, streak: 0 }));
  };

  /* ---- the judge: same shape as the Listen page's ---- */
  const note = mic.note;
  useEffect(() => {
    if (answerBy !== "play" || status !== "asking" || !q) return;
    if (!note) { ringing.current = null; return; }
    if (ringing.current != null && note.midi === ringing.current) return;
    if (note.pc === q.tonicPc) {
      ringing.current = note.midi;
      land();
    } else {
      miss(note.pc);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.midi, status, q, answerBy]);

  const tonicName = q ? pcName(q.tonicPc, q.keyName) : null;
  const domName = q ? pcName(q.tonicPc + 7, q.keyName) : null;
  const wrongDeg = wrongPc != null && q ? DEG[(wrongPc - q.tonicPc + 12) % 12] : null;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Resolve it — the drill</div>
          <div className="mono" style={{ fontSize: 12, color: C.muted, maxWidth: 460, lineHeight: 1.55 }}>
            The app plays a dominant 7th in a random key. Find the chord it wants to land on and
            play its root. Thirty of these and resolution stops being a word.
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button className={"btn" + (answerBy === "tap" ? " on" : "")} onClick={() => setAnswerBy("tap")}>👆 tap it</button>
          <button className={"btn" + (answerBy === "play" ? " on" : "")} onClick={() => setAnswerBy("play")} title="Answer on the guitar — the microphone checks it">🎸 play it</button>
          <button className={"btn" + (keyPool === "this" ? " on" : "")} onClick={() => setKeyPool((k) => (k === "all" ? "this" : "all"))}>
            {keyPool === "all" ? "all 12 keys" : `${root} only`}
          </button>
        </div>
      </div>

      {answerBy === "play" && mic.state !== MIC_STATES.ready ? (
        <div style={{ marginTop: 14, textAlign: "center", padding: "18px 12px", border: `1px dashed ${C.line}`, borderRadius: 4 }}>
          <div style={{ fontSize: 26 }} aria-hidden="true">🎤</div>
          <div className="mono" style={{ fontSize: 12, color: C.muted, margin: "6px auto 12px", maxWidth: 420, lineHeight: 1.6 }}>
            {mic.state === MIC_STATES.denied
              ? "Microphone blocked. Allow it in your browser's site settings, then try again."
              : mic.state === MIC_STATES.unsupported
              ? "This browser can't open a microphone — Chrome, Edge or Safari on an https page will."
              : "Nothing is recorded or sent anywhere; the audio is analysed in this tab and thrown away."}
          </div>
          <button className="big" onClick={mic.start} disabled={mic.state === MIC_STATES.requesting}>
            {mic.state === MIC_STATES.requesting ? "waiting for permission…" : "🎤 Turn on the microphone"}
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
            {status === "idle" ? (
              <button className="big" onClick={ask}>▶ start the drill</button>
            ) : (
              <>
                <div className="mono" style={{ fontSize: 30, fontWeight: 700, color: status === "right" ? C.green : C.sun }}>
                  {domName}7
                  <span style={{ fontSize: 16, color: C.muted, margin: "0 8px" }}>→</span>
                  {status === "right" || reveal ? (
                    <span style={{ color: C.green }}>{tonicName}{keyMode === "minor" ? "m" : ""}</span>
                  ) : (
                    <span style={{ color: C.muted }}>?</span>
                  )}
                </div>
                <button className="btn" onClick={() => playPrompt(q.tonicPc)}>♪ again</button>
                <button className="btn" onClick={() => setReveal(true)}>◉ show me</button>
                <button className="btn" onClick={stop}>■ stop</button>
              </>
            )}
            <div className="mono" style={{ fontSize: 11.5, color: C.muted, marginLeft: "auto" }}>
              {score.right}/{score.asked} · streak {score.streak} · best {best}
            </div>
          </div>

          {status !== "idle" && (
            <div style={{ marginTop: 12 }}>
              {answerBy === "tap" ? (
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {ROOTS.map((r) => {
                    const pc = noteNameToPc(r);
                    const isRight = status === "right" && pc === q.tonicPc;
                    const isWrong = wrongPc === pc;
                    return (
                      <button
                        key={r}
                        className={"chip" + (isRight ? " on" : "")}
                        style={isWrong ? { borderColor: C.red, color: C.red } : undefined}
                        disabled={status === "right"}
                        onClick={() => (pc === q.tonicPc ? land() : miss(pc))}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mono" style={{ fontSize: 12, color: C.muted }}>
                  Listening… play the root of the chord it resolves to. Any octave counts.
                  {mic.note && <span style={{ color: C.ink }}> · hearing {mic.note.name}{mic.note.octave}</span>}
                </div>
              )}

              <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${C.line}` }}>
                <WeakSpots drill="gravity.keys" tick={score.asked} title="Keys you keep missing" label={(k) => k} />
              </div>

              <div className="mono" style={{ fontSize: 12.5, marginTop: 10, minHeight: 20, lineHeight: 1.6 }}>
                {status === "right" ? (
                  <span style={{ color: C.green }}>
                    ✓ {domName}7 → {tonicName}. The 3rd rose a semitone to the tonic and the ♭7 fell a semitone to its 3rd.
                  </span>
                ) : wrongPc != null ? (
                  <span style={{ color: C.red }}>
                    that's the {wrongDeg} — {pcName(wrongPc, q.keyName)}. A dominant 7th resolves down a fifth: {domName}7 wants{" "}
                    {reveal ? tonicName : "a fourth above its own root"}.
                  </span>
                ) : (
                  <span style={{ color: C.muted }}>a dominant 7th resolves down a fifth (or up a fourth) — find that root.</span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
