import React, { useMemo, useState } from "react";
import {
  ROOTS,
  SCALES,
  CHORDS,
  CHORD_FAMILY,
  DEG,
  FRETS,
  OPEN_MIDI,
  FUNCTION_NAME,
  identifyChord,
  scalesContaining,
  chordsIn,
  chordsContaining,
  chordToneLabel,
  noteNameToPc,
  buildNoteNames,
} from "../theory/engine.js";
import { rootPosition } from "../theory/voicing.js";
import { C, chordToneStyle } from "../ui/theme.js";
import Neck from "./Neck.jsx";
import { playMidi } from "../audio/engine.js";
import { useDroneFollow } from "../audio/useDrone.js";

/**
 * NAME IT — the engine, run backwards.
 *
 * Everything else in the app goes name → notes: pick C major, see the notes.
 * This goes the other way, which is the direction you actually need when you
 * have your hands on the guitar:
 *
 *   notes  → chord   tap a shape, it gets named, inversions and slash chords
 *                    included ("that's C/E — a C major with the 3rd in the bass")
 *   chord  → scales  which scales swallow this chord whole, tightest fit first
 *   scale  → chords  which chords live in this scale — click one and it lands
 *                    on the neck as a shape, chord tones solid over the rest of
 *                    the scale hollow. That picture (targets vs connective
 *                    tissue) is the single most useful thing for soloing.
 *   note   → chords  one note, every diatonic chord it has a home in. The
 *                    foundation of reharmonisation, and fun to poke at.
 *
 * All four are the same neck and the same tap. They answer each other: load a
 * chord out of a scale, and the readout names the voicing you just loaded.
 */

/** Fit a pitch onto the neck: lowest string that can reach it, one note per string. */
function place(midi, used) {
  for (let s = OPEN_MIDI.length - 1; s >= 0; s--) {
    if (used.has(s)) continue;
    const f = midi - OPEN_MIDI[s];
    if (f >= 0 && f <= FRETS) return { s, f, midi };
  }
  return null;
}

export default function NameIt() {
  const [key, setKey] = useState("C");
  const [scaleId, setScaleId] = useState("major");
  const [taps, setTaps] = useState([]); // [{ s, f, midi }] in tap order
  const [showScale, setShowScale] = useState(true);
  const [showOthers, setShowOthers] = useState(false);
  const [family, setFamily] = useState("triad");
  const [muted, setMuted] = useState(false);
  const [more, setMore] = useState(false);

  useDroneFollow(key);

  const keyPc = noteNameToPc(key);
  const names = useMemo(() => buildNoteNames(key), [key]);
  const scale = SCALES[scaleId];
  const scaleSet = useMemo(
    () => new Set(scale.ints.map((i) => (keyPc + i) % 12)),
    [scale, keyPc]
  );

  // A scale with a major 3rd harmonises out of the major map, everything else
  // out of the minor one. Named in the card, so the frame is never implied.
  const keyMode = scale.ints.includes(4) ? "major" : "minor";

  const midis = useMemo(() => taps.map((t) => t.midi).sort((a, b) => a - b), [taps]);
  const pcs = useMemo(() => [...new Set(midis.map((m) => m % 12))], [midis]);
  const bassPc = midis.length ? midis[0] % 12 : null;

  /* ---- notes → chord (#5) ---- */
  const chord = useMemo(
    () => (pcs.length >= 2 ? identifyChord(pcs, { bassPc, key }) : null),
    [pcs, bassPc, key]
  );

  /* ---- chord → scales (#16) ---- */
  const homes = useMemo(() => {
    if (pcs.length < 2) return [];
    const found = scalesContaining(pcs);
    // Tightest fit first is already done; among equals, a scale rooted on the
    // chord's own root says more about it than one rooted anywhere else.
    const rootOf = chord ? chord.rootPc : bassPc;
    return found.sort((a, b) => a.size - b.size || (a.rootPc === rootOf ? -1 : b.rootPc === rootOf ? 1 : 0));
  }, [pcs, chord, bassPc]);

  /* ---- note → chords (#18) ---- */
  const harmonies = useMemo(
    () => (pcs.length === 1 ? chordsContaining(pcs[0], keyPc, keyMode, key) : []),
    [pcs, keyPc, keyMode, key]
  );

  /* ---- scale → chords (#16, the other direction) ---- */
  const fits = useMemo(() => {
    const found = chordsIn(scaleId, keyPc, { family });
    // One row per degree of the scale.
    const rows = new Map();
    found.forEach((c) => {
      if (!rows.has(c.semis)) rows.set(c.semis, []);
      rows.get(c.semis).push(c);
    });
    return [...rows.entries()].sort((a, b) => a[0] - b[0]);
  }, [scaleId, keyPc, family]);

  /* ---- audio ---- */
  const hear = (list, { stagger = 0.035, dur = 1.7 } = {}) => {
    if (muted) return;
    [...list].sort((a, b) => a - b).forEach((m, i) => playMidi(m, i * stagger, dur));
  };

  /* ---- tapping ---- */
  const tap = (midi, { s, f }) => {
    setTaps((prev) => {
      const at = prev.findIndex((t) => t.s === s && t.f === f);
      return at >= 0 ? prev.filter((_, i) => i !== at) : [...prev, { s, f, midi }];
    });
    if (!muted) playMidi(midi, 0, 1.1);
  };

  /** Drop a chord onto the neck as a shape, lowest note first. */
  const load = (rootPc, quality) => {
    const used = new Set();
    const next = [];
    rootPosition(rootPc, quality, 43).forEach((m) => {
      const p = place(m, used);
      if (p) {
        used.add(p.s);
        next.push(p);
      }
    });
    setTaps(next);
    hear(next.map((p) => p.midi));
  };

  const clear = () => setTaps([]);

  return (
    <div>
      <style>{`
        .ni-pill{ display:inline-flex; align-items:center; gap:6px; padding:4px 9px; border-radius:3px;
          border:1.5px solid var(--line); background: var(--surface-lo); font-family: ui-monospace, monospace;
          font-size:12px; cursor:pointer; transition: all .15s; }
        .ni-pill:hover{ border-color: var(--ink); }
        .ni-pill.on{ border-color: var(--sun); color: var(--sun); background: rgba(255,122,46,.14); }
        .ni-deg{ font-size:10px; color: var(--muted); min-width:26px; }
        .ni-row{ display:flex; align-items:center; gap:6px; flex-wrap:wrap; padding:5px 0;
          border-bottom:1px dashed var(--grid); }
        .ni-row:last-child{ border-bottom:none; }
      `}</style>

      {/* ---- controls ---- */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Key — how the notes get spelled, and the scale behind them</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {ROOTS.map((r) => (
              <button key={r} className={"chip" + (r === key ? " on" : "")} onClick={() => setKey(r)}>{r}</button>
            ))}
            <span style={{ width: 8 }} />
            <select className="inp" value={scaleId} onChange={(e) => setScaleId(e.target.value)} style={{ padding: "4px 6px" }}>
              {Object.entries(SCALES).map(([id, s]) => (
                <option key={id} value={id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <button className={"btn" + (showScale ? " on" : "")} onClick={() => setShowScale((v) => !v)} aria-pressed={showScale} title="Show the rest of the scale as hollow nodes behind the chord">
            ▨ scale behind
          </button>
          <button className={"btn" + (showOthers ? " on" : "")} onClick={() => setShowOthers((v) => !v)} aria-pressed={showOthers} title="Every other place the notes you tapped also live">
            ◎ same notes elsewhere
          </button>
          <button className="btn" onClick={() => hear(midis)} disabled={!midis.length}>▶ hear it</button>
          <button className="btn" onClick={clear} disabled={!taps.length}>✕ clear</button>
          <button className="btn" onClick={() => setMuted((m) => !m)} aria-pressed={muted}>{muted ? "♪ sound off" : "♪ sound on"}</button>
          <span className="mono" style={{ fontSize: 11, color: C.muted, marginLeft: "auto" }}>
            {taps.length === 0 ? "tap notes on the neck — tap again to remove" : `${taps.length} note${taps.length > 1 ? "s" : ""} · lowest is the bass`}
          </span>
        </div>
      </div>

      {/* ---- the neck ---- */}
      <div style={{ marginTop: 16 }}>
        <Neck
          root={key}
          frets={FRETS}
          stringGauge
          inlays="double"
          onTap={tap}
          resolve={(pc, semis, { s, f, names: nm }) => {
            const tapped = taps.some((t) => t.s === s && t.f === f);
            const inScale = showScale && scaleSet.has(pc);
            const elsewhere = showOthers && !tapped && pcs.includes(pc);
            if (!tapped && !inScale && !elsewhere) return null;

            if (tapped) {
              // Colour by the note's job in the chord we just named, not by its
              // distance from the key — that is the thing being taught.
              const rel = chord ? (pc - chord.rootPc + 12) % 12 : 0;
              const st = chord ? chordToneStyle(rel) : { bg: C.sun, br: C.sunDeep, tx: "#fff" };
              const label = chord ? chordToneLabel(chord.rootPc, chord.quality, pc) || nm[pc] : nm[pc];
              const isBass = midis.length > 0 && OPEN_MIDI[s] + f === midis[0];
              return {
                label,
                ...st,
                size: 23,
                fontSize: String(label).length > 2 ? 9 : 10,
                boxShadow: rel === 0 ? "0 0 0 3px rgba(255,122,46,.32)" : "none",
                outline: isBass ? `2px dashed ${C.ink}` : undefined,
                zIndex: 5,
                title: `${nm[pc]} · string ${s + 1} fret ${f}${isBass ? " · the bass note" : ""}`,
              };
            }
            if (elsewhere) {
              return {
                label: nm[pc],
                bg: "transparent",
                br: C.cyan,
                tx: C.cyan,
                opacity: 0.5,
                size: 17,
                fontSize: 9,
                title: `${nm[pc]} — the same note, over here · string ${s + 1} fret ${f}`,
              };
            }
            // the rest of the scale: connective tissue, hollow
            return {
              label: DEG[(pc - keyPc + 12) % 12],
              bg: "transparent",
              br: C.line,
              tx: C.muted,
              dashed: true,
              opacity: 0.75,
              size: 16,
              fontSize: 9,
              zIndex: 1,
              // Don't claim a note isn't in the chord when it is — it may
              // simply have been tapped at another position.
              title:
                (pcs.includes(pc)
                  ? `${nm[pc]} — in the chord; you played it further along`
                  : `${nm[pc]} — in ${key} ${scale.name}, not in the chord`) +
                ` · string ${s + 1} fret ${f}`,
            };
          }}
        />
      </div>

      {/* ---- the readouts ---- */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16 }}>
        {/* #5 / #18 */}
        <div className="card" style={{ flex: "1 1 340px", minWidth: 300 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            {pcs.length === 1 ? "One note, several homes" : "What you played"}
          </div>

          {taps.length === 0 && (
            <div className="mono" style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.7 }}>
              Tap one note and this becomes a list of every chord it belongs to. Tap three
              and it names the chord — including which inversion, because the lowest note
              you tapped is the bass.
            </div>
          )}

          {pcs.length === 1 && (
            <>
              <div className="mono" style={{ fontSize: 26, fontWeight: 700, color: C.sun, marginBottom: 2 }}>
                {names[pcs[0]]}
                <span style={{ fontSize: 13, color: C.muted, fontWeight: 400 }}> · the {DEG[(pcs[0] - keyPc + 12) % 12]} of {key}</span>
              </div>
              <div className="mono" style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>
                harmonised in {key} {keyMode === "minor" ? "natural minor" : "major"}
              </div>
              {harmonies.length === 0 ? (
                <div className="mono" style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
                  This note isn't in {key} {keyMode === "minor" ? "minor" : "major"} at all — no diatonic chord contains it.
                  That is what makes it a colour note rather than a target.
                </div>
              ) : (
                <>
                  {harmonies.map((c) => (
                    <div key={c.rn} className="ni-row">
                      <button className="ni-pill" onClick={() => load(c.rootPc, c.quality)} title={`Put ${c.label} on the neck`}>
                        {c.label}
                      </button>
                      <span className="mono" style={{ fontSize: 12, color: C.ink, minWidth: 34 }}>{c.rn}</span>
                      <span className="mono ni-deg">{FUNCTION_NAME[c.fn]}</span>
                      <span className="mono" style={{ fontSize: 11, color: C.muted, marginLeft: "auto" }}>
                        the {chordToneLabel(c.rootPc, c.quality, pcs[0])} of it
                      </span>
                    </div>
                  ))}
                  <div className="mono" style={{ fontSize: 11.5, color: C.muted, marginTop: 8, lineHeight: 1.6 }}>
                    One note, {harmonies.length} harmonic homes — it is the root of one, the 3rd of
                    another, the 5th of a third. Holding the melody still and changing which of
                    these sits underneath it is the whole of reharmonisation.
                  </div>
                </>
              )}
            </>
          )}

          {pcs.length >= 2 && (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <span className="mono" style={{ fontSize: 30, fontWeight: 700, color: chord ? C.sun : C.muted }}>
                  {chord ? chord.label : "not a chord I know"}
                </span>
                {chord && chord.slash && (
                  <span className="mono" style={{ fontSize: 12, color: C.cyan }}>{chord.inversionName}</span>
                )}
              </div>

              {chord ? (
                <>
                  <div className="mono" style={{ fontSize: 12.5, color: C.ink, marginTop: 6, lineHeight: 1.7 }}>
                    {chord.rootName} {chord.name}
                    {chord.slash
                      ? ` with the ${chordToneLabel(chord.rootPc, chord.quality, bassPc)} (${chord.bassName}) in the bass — same chord, different weight.`
                      : " in root position."}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    {chord.tones.map((t) => (
                      <span key={t.pc} className="mono" style={{ fontSize: 11.5, padding: "3px 8px", borderRadius: 3, border: `1.5px solid ${C.line}`, color: C.ink }}>
                        <b style={{ color: C.sun }}>{t.label}</b> {t.name}
                      </span>
                    ))}
                  </div>
                  {chord.alternatives.length > 0 && (
                    <div className="mono" style={{ fontSize: 11, color: C.muted, marginTop: 8, lineHeight: 1.6 }}>
                      also readable as{" "}
                      {chord.alternatives.map((a, i) => (
                        <React.Fragment key={a.rootPc + a.quality}>
                          {i > 0 && " · "}
                          <b style={{ color: C.ink }}>{a.label}</b>
                        </React.Fragment>
                      ))}
                      {" "}— the same notes; which one it IS depends on what the bass is doing.
                    </div>
                  )}
                </>
              ) : (
                <div className="mono" style={{ fontSize: 12.5, color: C.muted, marginTop: 6, lineHeight: 1.7 }}>
                  {pcs.map((pc) => names[pc]).join(" · ")} — no chord in the book has exactly these
                  notes. Add or remove one; most shapes that feel wrong are a stack of thirds with
                  a note missing.
                </div>
              )}
            </>
          )}
        </div>

        {/* #16 — chord → scales */}
        <div className="card" style={{ flex: "1 1 300px", minWidth: 280 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Which scales contain it — tightest fit first</div>
          {pcs.length < 2 ? (
            <div className="mono" style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.7 }}>
              Tap a chord and this lists every scale that swallows it whole. The top of the
              list is what you solo with — the smallest scale that contains the chord has the
              fewest notes that can fight it.
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {homes.slice(0, more ? 24 : 8).map((h) => {
                  const on = h.scaleId === scaleId && h.rootPc === keyPc;
                  const rootName = ROOTS.find((r) => noteNameToPc(r) === h.rootPc) || names[h.rootPc];
                  return (
                    <button
                      key={h.scaleId + h.rootPc}
                      className={"ni-pill" + (on ? " on" : "")}
                      onClick={() => { setKey(rootName); setScaleId(h.scaleId); setShowScale(true); }}
                      title={`Light ${rootName} ${SCALES[h.scaleId].name} behind the chord`}
                    >
                      {rootName} {SCALES[h.scaleId].name}
                      <span style={{ color: C.muted, fontSize: 10 }}>{h.size}</span>
                    </button>
                  );
                })}
              </div>
              {homes.length > 8 && (
                <button className="btn" style={{ padding: "3px 8px", marginTop: 8 }} onClick={() => setMore((v) => !v)}>
                  {more ? "− fewer" : `+ ${homes.length - 8} more`}
                </button>
              )}
              <div className="mono" style={{ fontSize: 11.5, color: C.muted, marginTop: 10, lineHeight: 1.6 }}>
                Click one and it lights up hollow behind the chord: solid nodes are the
                targets, hollow ones are the connective tissue between them.
              </div>
            </>
          )}
        </div>
      </div>

      {/* #16 — scale → chords */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div className="eyebrow" style={{ margin: 0 }}>
            Which chords fit {key} {scale.name} — click one to put it on the neck
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {Object.entries(CHORD_FAMILY).filter(([id]) => id !== "extended").map(([id, f]) => (
              <button key={id} className={"btn" + (family === id ? " on" : "")} style={{ padding: "3px 9px" }} onClick={() => setFamily(id)}>
                {f.name}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          {fits.length === 0 ? (
            <div className="mono" style={{ fontSize: 12, color: C.muted }}>
              Nothing in this family sits entirely inside {key} {scale.name} — a five-note scale
              cannot host many four-note chords.
            </div>
          ) : (
            fits.map(([semis, list]) => (
              <div key={semis} className="ni-row">
                <span className="mono ni-deg" style={{ color: C.sun, fontWeight: 700 }}>{DEG[semis]}</span>
                <span className="mono" style={{ fontSize: 11, color: C.muted, minWidth: 26 }}>{names[(keyPc + semis) % 12]}</span>
                {list.map((c) => (
                  <button
                    key={c.quality}
                    className="ni-pill"
                    onClick={() => load(c.rootPc, c.quality)}
                    title={`${CHORDS[c.quality].name} — ${CHORDS[c.quality].formula}`}
                  >
                    {names[c.rootPc]}{CHORDS[c.quality].sym}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        <div className="mono" style={{ fontSize: 11.5, color: C.muted, marginTop: 10, lineHeight: 1.6 }}>
          Every chord here is built only from notes of the scale, so all of them are safe over
          it — and the scale is safe over all of them. That is the same fact, read from both
          ends, and it is why "what scale do I play over this chord" has an answer at all.
        </div>
      </div>
    </div>
  );
}
