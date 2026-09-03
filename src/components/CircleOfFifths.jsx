import React, { useMemo, useState } from "react";
import {
  ROOTS,
  CIRCLE_OF_FIFTHS,
  keySignature,
  keyNames,
  pcName,
  noteNameToPc,
} from "../theory/engine.js";
import { keyRelationship } from "../theory/harmony.js";
import { rootPosition } from "../theory/voicing.js";
import { C } from "../ui/theme.js";
import { playMidi } from "../audio/engine.js";
import { useDroneFollow } from "../audio/useDrone.js";

/**
 * THE CIRCLE OF FIFTHS AS A MACHINE — #19.
 *
 * As a poster it teaches nothing: twelve names in a ring, memorised and never
 * used. The useful questions are the ones you have when you are actually
 * writing something — how close are these two keys, what do they already
 * share, and which chord can I walk across to get from one to the other?
 *
 * So this asks you to pick two keys and then answers those three questions
 * with computed facts: shared notes, the note that changes, the chords both
 * keys contain, and the best pivot. Neighbouring keys share six of seven
 * notes — that is WHY the circle is in this order, and here you watch it be
 * true rather than being told.
 */

const R_MAJOR = 132;
const R_MINOR = 92;
const CX = 168;
const CY = 168;

const nameOf = (pc) => ROOTS.find((r) => noteNameToPc(r) === ((pc % 12) + 12) % 12) || "C";

/**
 * A relative minor is spelled by its parent's signature: the relative minor of
 * E (four sharps) is C♯m, not D♭m. ROOTS prefers flats for those pitches, so
 * the inner ring has to ask the key signature which side of the circle it is
 * on rather than reusing the same table as the outer one.
 */
const minorNameUnder = (majorPc) => {
  const sig = keySignature(nameOf(majorPc));
  const pc = (majorPc + 9) % 12;
  return pcName(pc, "C", sig.sharps > 0 ? "sharp" : "flat");
};

export default function CircleOfFifths({ muted }) {
  const [from, setFrom] = useState({ pc: 0, mode: "major" });
  const [to, setTo] = useState({ pc: 7, mode: "major" });
  const [next, setNext] = useState("to"); // which end the next click sets

  const fromName = nameOf(from.pc);
  const toName = nameOf(to.pc);
  useDroneFollow(fromName);

  const rel = useMemo(
    () => keyRelationship(from.pc, from.mode, to.pc, to.mode, { key: fromName }),
    [from, to, fromName]
  );

  const label = (k) => nameOf(k.pc) + (k.mode === "minor" ? " minor" : " major");
  const names = keyNames(fromName, from.mode);

  const pick = (pc, mode) => {
    if (next === "to") {
      setTo({ pc, mode });
      setNext("from");
    } else {
      setFrom({ pc, mode });
      setNext("to");
    }
  };

  /* ---- hear the move ---- */
  const play = () => {
    if (muted) return;
    const triad = (pc, quality, at) =>
      rootPosition(pc, quality, 48).forEach((m, i) => playMidi(m, at + i * 0.03, 1.5));
    const fromTonic = from.mode === "minor" ? "min" : "maj";
    const toTonic = to.mode === "minor" ? "min" : "maj";
    // I of the old key → the pivot → V of the new → I of the new. With no
    // pivot available there is nothing to walk across, so it just jumps, which
    // is itself the answer to "how far apart are these two".
    triad(from.pc, fromTonic, 0);
    if (rel.pivot) {
      triad(rel.pivot.rootPc, rel.pivot.quality, 1.0);
      triad((to.pc + 7) % 12, "dom7", 2.0);
      triad(to.pc, toTonic, 3.0);
    } else {
      triad((to.pc + 7) % 12, "dom7", 1.2);
      triad(to.pc, toTonic, 2.2);
    }
  };

  return (
    <div>
      <style>{`
        .cf-key{ cursor:pointer; }
        .cf-key text{ pointer-events:none; }
        .cf-row{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:6px 0;
          border-bottom:1px dashed var(--grid); font-family: ui-monospace, monospace; font-size:12.5px; }
        .cf-row:last-child{ border-bottom:none; }
        .cf-pill{ padding:3px 8px; border-radius:3px; border:1.5px solid var(--line); font-size:11.5px; }
      `}</style>

      <div className="mono" style={{ fontSize: 12, color: C.muted, marginTop: 14, lineHeight: 1.6 }}>
        Click any two keys — outer ring major, inner ring its relative minor. The next click sets the{" "}
        <b style={{ color: next === "to" ? C.cyan : C.sun }}>{next === "to" ? "destination" : "starting key"}</b>.
      </div>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 12, alignItems: "flex-start" }}>
        {/* the circle */}
        <svg width={CX * 2} height={CY * 2} role="img" aria-label="circle of fifths" style={{ flex: "0 0 auto" }}>
          {/* the arc between the two keys */}
          <circle cx={CX} cy={CY} r={R_MAJOR} fill="none" stroke={C.grid} strokeWidth="1" />
          <circle cx={CX} cy={CY} r={R_MINOR} fill="none" stroke={C.grid} strokeWidth="1" opacity="0.6" />
          {(() => {
            const p = (k, r) => {
              const i = CIRCLE_OF_FIFTHS.indexOf(k.pc);
              const a = ((i * 30 - 90) * Math.PI) / 180;
              return [CX + Math.cos(a) * r, CY + Math.sin(a) * r];
            };
            const [x1, y1] = p(from, from.mode === "minor" ? R_MINOR : R_MAJOR);
            const [x2, y2] = p(to, to.mode === "minor" ? R_MINOR : R_MAJOR);
            return (
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={rel.sharedCount >= 6 ? C.green : rel.sharedCount >= 4 ? C.sun : C.red}
                strokeWidth={Math.max(1, rel.sharedCount - 2)}
                opacity="0.75"
                strokeLinecap="round"
              />
            );
          })()}

          {CIRCLE_OF_FIFTHS.map((pc, i) => {
            const a = ((i * 30 - 90) * Math.PI) / 180;
            const mx = CX + Math.cos(a) * R_MAJOR;
            const my = CY + Math.sin(a) * R_MAJOR;
            const nx = CX + Math.cos(a) * R_MINOR;
            const ny = CY + Math.sin(a) * R_MINOR;
            const sig = keySignature(nameOf(pc));
            const isFrom = from.pc === pc && from.mode === "major";
            const isTo = to.pc === pc && to.mode === "major";
            const minPc = (pc + 9) % 12;
            const isFromM = from.pc === minPc && from.mode === "minor";
            const isToM = to.pc === minPc && to.mode === "minor";
            return (
              <g key={pc}>
                <g className="cf-key" onClick={() => pick(pc, "major")} role="button" tabIndex={0}
                   onKeyDown={(e) => { if (e.key === "Enter") pick(pc, "major"); }}>
                  <circle cx={mx} cy={my} r="24"
                    fill={isFrom ? C.sun : isTo ? C.cyan : "var(--surface)"}
                    stroke={isFrom ? C.sunDeep : isTo ? "#1F7E96" : C.line} strokeWidth="2" />
                  <text x={mx} y={my + 1} textAnchor="middle" fontSize="13" fontWeight="700"
                        fill={isFrom || isTo ? "#fff" : C.ink} style={{ fontFamily: "ui-monospace, monospace" }}>
                    {nameOf(pc)}
                  </text>
                  <text x={mx} y={my + 13} textAnchor="middle" fontSize="8"
                        fill={isFrom || isTo ? "#fff" : C.muted} style={{ fontFamily: "ui-monospace, monospace" }}>
                    {sig.text}
                  </text>
                </g>
                <g className="cf-key" onClick={() => pick(minPc, "minor")} role="button" tabIndex={0}
                   onKeyDown={(e) => { if (e.key === "Enter") pick(minPc, "minor"); }}>
                  <circle cx={nx} cy={ny} r="17"
                    fill={isFromM ? C.sun : isToM ? C.cyan : "var(--surface-lo)"}
                    stroke={isFromM ? C.sunDeep : isToM ? "#1F7E96" : C.grid} strokeWidth="1.5" />
                  <text x={nx} y={ny + 4} textAnchor="middle" fontSize="10.5"
                        fill={isFromM || isToM ? "#fff" : C.muted} style={{ fontFamily: "ui-monospace, monospace" }}>
                    {minorNameUnder(pc)}m
                  </text>
                </g>
              </g>
            );
          })}

          <text x={CX} y={CY - 6} textAnchor="middle" fontSize="11" fill={C.muted} style={{ fontFamily: "ui-monospace, monospace" }}>
            {rel.same ? "same key" : `${rel.distance} step${rel.distance === 1 ? "" : "s"} apart`}
          </text>
          <text x={CX} y={CY + 10} textAnchor="middle" fontSize="15" fontWeight="700"
                fill={rel.sharedCount >= 6 ? C.green : rel.sharedCount >= 4 ? C.sun : C.red}
                style={{ fontFamily: "ui-monospace, monospace" }}>
            {rel.sharedCount}/7 notes
          </text>
        </svg>

        {/* the answer */}
        <div style={{ flex: "1 1 320px", minWidth: 300 }}>
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              <span style={{ color: C.sun }}>{label(from)}</span> → <span style={{ color: C.cyan }}>{label(to)}</span>
            </div>

            <div className="cf-row">
              <span style={{ color: C.muted, minWidth: 92 }}>shared notes</span>
              <b>{rel.sharedCount} of 7</b>
              <span style={{ color: C.muted, fontSize: 11 }}>
                {rel.shared.map((pc) => names[pc]).join(" ")}
              </span>
            </div>

            {!rel.same && (
              <div className="cf-row">
                <span style={{ color: C.muted, minWidth: 92 }}>what changes</span>
                <span>
                  {rel.changes.leaves.length === 0 ? (
                    "nothing — these two keys hold identical notes"
                  ) : (
                    <>
                      <b style={{ color: C.red }}>{rel.changes.leaves.map((pc) => names[pc]).join(" ")}</b> leaves,{" "}
                      <b style={{ color: C.green }}>{rel.changes.arrives.map((pc) => names[pc]).join(" ")}</b> arrives
                    </>
                  )}
                </span>
              </div>
            )}

            <div className="cf-row">
              <span style={{ color: C.muted, minWidth: 92 }}>common chords</span>
              {rel.common.length === 0 ? (
                <span style={{ color: C.red }}>none — nothing to walk across</span>
              ) : (
                rel.common.map((c) => (
                  <span key={c.label + c.fromRn} className="cf-pill" style={{ borderColor: c === rel.pivot ? C.sun : C.line, color: c === rel.pivot ? C.sun : C.ink }}>
                    {c.label} <span style={{ color: C.muted, fontSize: 10 }}>{c.fromRn}→{c.toRn}</span>
                  </span>
                ))
              )}
            </div>

            <div className="cf-row">
              <span style={{ color: C.muted, minWidth: 92 }}>pivot through</span>
              {rel.pivot ? (
                <span>
                  <b style={{ color: C.sun, fontSize: 15 }}>{rel.pivot.label}</b>
                  <span style={{ color: C.muted }}>
                    {" "}— the {rel.pivot.fromRn} of {label(from)} and the {rel.pivot.toRn} of {label(to)}
                  </span>
                </span>
              ) : (
                <span style={{ color: C.muted }}>nothing diatonic to both — you have to jump, not slide</span>
              )}
            </div>

            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              <button className="btn" onClick={play}>▶ hear the move</button>
              <button className="btn" onClick={() => { const f = from; setFrom(to); setTo(f); }}>⇄ swap</button>
              <button className="btn" onClick={() => setTo({ pc: (from.pc + 7) % 12, mode: from.mode })}>→ one step clockwise</button>
              <button className="btn" onClick={() => setTo({ pc: from.mode === "major" ? (from.pc + 9) % 12 : (from.pc + 3) % 12, mode: from.mode === "major" ? "minor" : "major" })}>
                → its relative
              </button>
              <button className="btn" onClick={() => setTo({ pc: from.pc, mode: from.mode === "major" ? "minor" : "major" })}>→ its parallel</button>
            </div>
          </div>

          <div className="card" style={{ marginTop: 12, background: "rgba(62,155,214,.10)" }}>
            <div className="eyebrow" style={{ marginBottom: 8, color: C.blue }}>The "why"</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.7 }}>
              {/* Branch on what the keys SHARE, not on how far apart their
                  tonics sit: C major and A minor are three steps apart on the
                  circle and yet hold identical notes, so distance alone would
                  describe that relationship wrongly. */}
              {rel.same ? (
                "Pick a second key — the circle only says something about a relationship."
              ) : rel.sharedCount === 7 ? (
                <>
                  Identical notes, different home. Nothing has to change to move between these two — the
                  move is entirely about which chord you keep landing on. That is the relative
                  relationship, and it is why they share a spoke and a key signature.
                </>
              ) : rel.sharedCount === 6 ? (
                <>
                  <b>Exactly one note changes.</b> That is not a coincidence and it is not a mnemonic — it
                  is what stacking fifths does: each new key inherits everything but one pitch from its
                  neighbour. Six shared notes leave {rel.common.length} shared chord
                  {rel.common.length === 1 ? "" : "s"}, which is why this move barely feels like moving.
                </>
              ) : rel.sharedCount >= 4 ? (
                <>
                  {rel.sharedCount} of the seven notes survive the move.
                  {rel.pivot ? (
                    <>
                      {" "}The smooth road is <b style={{ color: C.sun }}>{rel.pivot.label}</b> — play it while
                      the old key is still ringing and it sounds like the {rel.pivot.fromRn}; follow it with
                      the new key's V and it has already become the {rel.pivot.toRn}. Nobody hears the seam.
                    </>
                  ) : (
                    <> With no chord diatonic to both, there is nothing to pivot on — the change has to be
                      announced rather than smuggled.</>
                  )}
                </>
              ) : (
                <>
                  Almost nothing in common — {rel.sharedCount} shared notes and{" "}
                  {rel.common.length === 0
                    ? "no shared chords at all"
                    : `only ${rel.common.length} shared chord${rel.common.length === 1 ? "" : "s"}`}.
                  {rel.distance === 6
                    ? " These two sit opposite each other on the circle, a tritone apart: the furthest any two keys can be, and the reason that interval sounds like a different world."
                    : " You cannot ease into a key this far away; you can only cut to it."}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}