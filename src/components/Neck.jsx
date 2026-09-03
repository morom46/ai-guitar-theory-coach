import React, { useMemo } from "react";
import { OPEN_MIDI, buildNoteNames, noteNameToPc } from "../theory/engine.js";
import { C } from "../ui/theme.js";

/**
 * NECK — the one shared fretboard.
 * Geometry and chrome (frets, strings, inlays, boxes, labels) live here;
 * each page decides what lights up via `resolve(pc, semis, ctx)`:
 *
 *   resolve(pc, semis, { s, f, open, names }) -> null | {
 *     label, bg, br, tx,          // text + colours (br = border colour)
 *     size, fontSize,             // node diameter / label size
 *     dashed,                     // dashed border (e.g. "added" notes)
 *     opacity, boxShadow, outline, zIndex, title,
 *   }
 *
 * `onTap(midi, { s, f, pc })` makes nodes clickable; omit it for a
 * display-only neck (Live Player). `boxes` draws 5-fret position windows.
 * `flip` inverts the string order (default: low E on top).
 *
 * `overlay(geom)` adds a layer over the notes, given this neck's geometry
 * ({ neckW, neckH, noteX, noteY, dispY, g, frets, flip }). `resolve` runs
 * during React's render and is keyed by pitch class, so it can neither
 * animate per frame nor tell two simultaneous events apart — anything that
 * moves belongs in an overlay instead. See SoloOverlay.jsx.
 *
 * SIZING — every page uses the same presets (SIZES.md / SIZES.mini) so the
 * fretboard looks identical across pages 01, 02, Live, Songs…  Use the
 * `size` prop; only pass `geom` overrides for special cases (e.g. the
 * Decoder's fit-to-width mode). NODE holds the standard note diameters.
 */

export const SIZES = {
  md:   { openW: 44, fretW: 42, rowH: 30, labelW: 56, labelDy: 8, labelPad: 8, labelFs: 12, headH: 16, numFs: 10, nutW: 3 },
  mini: { openW: 30, fretW: 27, rowH: 20, labelW: 36, labelDy: 6, labelPad: 5, labelFs: 9,  headH: 12, numFs: 8,  nutW: 2 },
};

// standard note-node diameters / font sizes per size preset
export const NODE = {
  md:   { root: 23, tone: 21, emph: 25, fs: 10 },
  mini: { root: 16, tone: 14, emph: 17, fs: 8 },
};

export function neckGeom(g, frets) {
  const neckW = g.openW + frets * g.fretW;
  const neckH = 6 * g.rowH;
  const noteX = (f) => (f === 0 ? g.openW / 2 : g.openW + (f - 0.5) * g.fretW);
  const noteY = (r) => (r + 0.5) * g.rowH;
  return { neckW, neckH, noteX, noteY };
}

const SLIDE = "top 0.4s cubic-bezier(0.45, 0, 0.15, 1)";

export default function Neck({
  root,                 // note name the labels are spelled from ("A", "Db"…)
  frets = 24,
  size = "md",          // "md" | "mini" — shared preset (keep pages uniform)
  geom = {},            // partial override of the preset (special cases only)
  resolve,              // which notes light up (see above)
  onTap,                // (midi, {s,f,pc}) => void — omit for display-only
  flip = false,         // invert string order
  slide = false,        // animate the flip (labels/strings/nodes slide)
  boxes = [],           // [{ start, span?, color, bg }] position windows
  inlays = "center",    // "center" | "double" (12/24 as double dots)
  stringGauge = false,  // thicker lines toward the low strings
  stringLabel,          // (openMidi, names) => JSX — custom label column
  dim = false,          // fade the whole neck (stack view)
  header = null,        // extra JSX above the ruler, inside the scroll area
  overlay = null,       // (geom) => JSX — a layer drawn OVER the notes
}) {
  const names = useMemo(() => buildNoteNames(root), [root]);
  const rootPc = noteNameToPc(root);
  const g = { ...(SIZES[size] || SIZES.md), ...geom };
  const { neckW, neckH, noteX, noteY } = neckGeom(g, frets);
  const dispY = (s) => noteY(flip ? s : OPEN_MIDI.length - 1 - s);
  const trans = slide ? SLIDE : undefined;
  const nodeTrans = slide
    ? `transform .1s, ${SLIDE}, background-color .35s ease, border-color .35s ease, color .3s ease, box-shadow .35s ease`
    : undefined;
  const singleDots = inlays === "double" ? [3, 5, 7, 9, 15, 17, 19, 21] : [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
  const doubleDots = inlays === "double" ? [12, 24] : [];

  return (
    <div style={{ overflowX: "auto", paddingBottom: 6, opacity: dim ? 0.55 : 1, transition: "opacity .2s" }}>
      <div style={{ minWidth: neckW + g.labelW + 6 }}>
        {header}

        {/* fret numbers */}
        <div style={{ position: "relative", height: g.headH, marginLeft: g.labelW }}>
          {Array.from({ length: frets + 1 }, (_, f) => (
            <div key={f} className="mono" style={{ position: "absolute", left: noteX(f) - 8, width: 16, textAlign: "center", fontSize: g.numFs, color: f !== 0 && f % 12 === 0 ? C.sun : C.muted, fontWeight: f !== 0 && f % 12 === 0 ? 700 : 400 }}>{f}</div>
          ))}
        </div>

        <div style={{ display: "flex" }}>
          {/* string labels */}
          <div style={{ width: g.labelW, position: "relative", height: neckH }}>
            {OPEN_MIDI.map((m, s) => (
              <div key={s} style={{ position: "absolute", top: dispY(s) - g.labelDy, right: g.labelPad, textAlign: "right", transition: trans }}>
                {stringLabel ? stringLabel(m, names) : (
                  <div className="mono" style={{ fontSize: g.labelFs, fontWeight: 700, color: C.ink }}>{names[m % 12]}</div>
                )}
              </div>
            ))}
          </div>

          {/* the neck */}
          <div style={{ position: "relative", width: neckW, height: neckH, background: "linear-gradient(180deg, var(--neck-a), var(--neck-b))", border: `1.5px solid ${C.ink}`, borderLeft: "none" }}>
            {/* nut + frets */}
            <div style={{ position: "absolute", left: g.openW, top: 0, width: g.nutW, height: neckH, background: C.ink }} />
            {Array.from({ length: frets }, (_, i) => i + 1).map((f) => (
              <div key={f} style={{ position: "absolute", left: g.openW + f * g.fretW, top: 0, width: f % 12 === 0 ? 2 : 1, height: neckH, background: f % 12 === 0 ? C.cyan : C.line }} />
            ))}
            {/* strings */}
            {OPEN_MIDI.map((_, s) => (
              <div key={s} style={{ position: "absolute", left: g.openW, right: 0, top: dispY(s), height: stringGauge ? Math.max(1, s * 0.4 + 1) : 1, background: C.line, opacity: 0.7, transition: trans }} />
            ))}
            {/* inlays */}
            {singleDots.filter((d) => d <= frets).map((d) => (
              <div key={"s" + d} style={{ position: "absolute", left: noteX(d) - 4, top: neckH / 2 - 4, width: 8, height: 8, borderRadius: 999, border: `1.5px solid ${inlays === "center" && d % 12 === 0 ? C.cyan : C.line}`, opacity: 0.6 }} />
            ))}
            {doubleDots.filter((d) => d <= frets).map((d) => (
              <React.Fragment key={"d" + d}>
                <div style={{ position: "absolute", left: noteX(d) - 5, top: neckH * 0.30 - 5, width: 10, height: 10, borderRadius: 999, border: `1.5px solid ${C.cyan}`, opacity: 0.7 }} />
                <div style={{ position: "absolute", left: noteX(d) - 5, top: neckH * 0.70 - 5, width: 10, height: 10, borderRadius: 999, border: `1.5px solid ${C.cyan}`, opacity: 0.7 }} />
              </React.Fragment>
            ))}
            {/* position boxes */}
            {boxes.filter(Boolean).map((b, i) => {
              const span = b.span ?? 4;
              const left = b.start === 0 ? 0 : g.openW + (b.start - 1) * g.fretW;
              const width = g.openW + (b.start + span) * g.fretW - left;
              return <div key={i} style={{ position: "absolute", top: 0, height: neckH, zIndex: 1, pointerEvents: "none", left, width, background: b.bg, border: `1px dashed ${b.color}`, borderRadius: 4 }} />;
            })}
            {/* the notes */}
            {OPEN_MIDI.map((open, s) =>
              Array.from({ length: frets + 1 }, (_, f) => {
                const pc = (open + f) % 12;
                const semis = (pc - rootPc + 12) % 12;
                const spec = resolve(pc, semis, { s, f, open, names });
                if (!spec) return null;
                const nd = NODE[size] || NODE.md;
                const d = spec.size ?? (spec.root ? nd.root : nd.tone);
                const style = {
                  position: "absolute", left: noteX(f) - d / 2, top: dispY(s) - d / 2,
                  width: d, height: d, fontSize: spec.fontSize ?? nd.fs,
                  background: spec.bg, color: spec.tx,
                  border: `2px ${spec.dashed ? "dashed" : "solid"} ${spec.br}`,
                  boxShadow: spec.boxShadow || "none",
                  opacity: spec.opacity ?? 1,
                  outline: spec.outline || "none", outlineOffset: spec.outline ? 2 : undefined,
                  zIndex: spec.zIndex ?? 2,
                  transition: nodeTrans,
                };
                const title = spec.title ?? names[pc];
                return onTap ? (
                  <button key={s + "-" + f} className="node" onClick={() => onTap(open + f, { s, f, pc })} title={title} style={style}>{spec.label}</button>
                ) : (
                  <div key={s + "-" + f} className="node still" title={title} style={style}>{spec.label}</div>
                );
              })
            )}
            {/* Anything that has to animate per frame (the Solo Player's note
                highway). It lives INSIDE this box on purpose: the neck sits in
                a horizontal scroller, and a layer outside it would not scroll
                with the frets. Geometry is handed over rather than recomputed
                so there is only ever one source of fret positions. */}
            {overlay ? overlay({ neckW, neckH, noteX, noteY, dispY, g, frets, flip }) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
