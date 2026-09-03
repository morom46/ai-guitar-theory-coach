import React, { useEffect, useMemo, useRef } from "react";
import { C, RAINBOW, degBase, chordToneStyle } from "../ui/theme.js";
import { visibleNotes } from "../audio/soloClock.js";
import { degreeOf, noteMidi, TECHNIQUES } from "../data/soloSchema.js";

/**
 * THE NOTE HIGHWAY — one canvas, drawn from one number.
 *
 * Every frame asks the scheduler for the current beat and derives the whole
 * picture from it. Nothing here holds animation state, which is what makes
 * seeking, looping, step mode and speed changes correct by construction:
 * change the beat and the picture follows, with no second timeline to fall
 * out of step.
 *
 * WHY CANVAS, AND NOT THE NECK'S OWN NODES
 * ----------------------------------------
 * <Neck>'s `resolve` runs inside React's render and is keyed by pitch class:
 * it cannot tell two simultaneous events apart, and driving it per frame
 * would re-render 150 DOM nodes sixty times a second. This layer is one
 * element, one draw call per frame, zero React state, and no CSS/SVG filters
 * — `feGaussianBlur` and `shadowBlur` are the two things that reliably take a
 * mid-range phone off 60fps, so the glow is a radial gradient instead.
 *
 * The neck underneath still draws the scale shape through `resolve`, which is
 * the point of the underlay: the solo is visibly a path through a shape.
 */

const TAU = Math.PI * 2;
const HIT_BEATS = 0.14; // how long the bloom lasts
const TAIL_BEATS = 0.6; // how long a finished note takes to fade out

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);
const easeInOut = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

/* ---------------- colour ---------------- */

// The palette is CSS variables (so the theme can flip), and canvas cannot read
// `var(--sun)`. Resolve the variables once per theme instead of per frame.
const VARS = [
  "--sun", "--sun-deep", "--cyan", "--blue", "--violet", "--ink",
  "--muted", "--line", "--paper", "--red", "--green",
];

export function _readPalette() {
  return readPalette();
}

function readPalette() {
  if (typeof window === "undefined") return {};
  const cs = getComputedStyle(document.documentElement);
  const out = {};
  VARS.forEach((v) => {
    out[v] = cs.getPropertyValue(v).trim() || "#888888";
  });
  return out;
}

const resolveVar = (value, pal) => {
  const m = /^var\((--[\w-]+)\)$/.exec(String(value).trim());
  return m ? pal[m[1]] || "#888888" : String(value);
};

/** `#rgb` / `#rrggbb` -> `rgba(...)`. Anything else is passed through. */
function withAlpha(color, a) {
  const c = String(color).trim();
  if (c[0] === "#") {
    let r, g, b;
    if (c.length === 4) {
      r = parseInt(c[1] + c[1], 16);
      g = parseInt(c[2] + c[2], 16);
      b = parseInt(c[3] + c[3], 16);
    } else if (c.length >= 7) {
      r = parseInt(c.slice(1, 3), 16);
      g = parseInt(c.slice(3, 5), 16);
      b = parseInt(c.slice(5, 7), 16);
    }
    if (Number.isFinite(r)) return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(c);
  if (rgb) {
    const parts = rgb[1].split(",").map((s) => s.trim());
    return `rgba(${parts[0]},${parts[1]},${parts[2]},${Math.max(0, Math.min(1, a))})`;
  }
  return c;
}

const BEND_TEXT = { 0.5: "½", 1: "1", 1.5: "1½", 2: "2" };

/* ---------------- the component ---------------- */

export default function SoloOverlay({
  scheduler,
  solo,
  geom,                 // from <Neck overlay={...}>
  lead = 1,             // approach time, in beats
  showDegrees = true,
  showFingers = true,
  rainbow = false,
  onPick,               // (note) => void  — tap a note event
  onTapFret,            // (midi, {s, f}) => void — tap the bare neck
}) {
  const canvasRef = useRef(null);
  const palRef = useRef(readPalette());
  // Set whenever something outside the beat invalidates what is on screen —
  // a resize (which clears the backing store), a theme flip, a toggle. Without
  // it the "same beat, same picture" guard below would leave the canvas blank
  // until the playhead happened to move.
  const dirtyRef = useRef(true);

  // Props the draw loop reads. Kept in a ref so changing a toggle does not
  // tear down and restart the animation frame.
  const cfg = useRef({});
  cfg.current = { scheduler, solo, geom, lead, showDegrees, showFingers, rainbow };

  // A toggle changes the picture without moving the playhead.
  useEffect(() => {
    dirtyRef.current = true;
  }, [solo, lead, showDegrees, showFingers, rainbow]);

  const hooks = useRef({});
  hooks.current = { onPick, onTapFret };

  /**
   * Hammer-ons and pull-offs are drawn as a slur back to the note they came
   * from, so the previous note on the same string is precomputed once per
   * solo rather than searched for on every frame.
   */
  const prevOnString = useMemo(() => {
    const map = new Map();
    const last = new Map();
    (solo.notes || []).forEach((n) => {
      const p = last.get(n.string);
      if (p) map.set(n.id, p);
      last.set(n.string, n);
    });
    return map;
  }, [solo]);

  // Re-resolve the palette when the theme flips.
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => {
      palRef.current = readPalette();
      dirtyRef.current = true;
    });
    obs.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    palRef.current = readPalette();
    return () => obs.disconnect();
  }, []);

  // Size the backing store for the device pixel ratio.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1); // cap: 3x costs 2.25x the fill for nothing
    cv.width = Math.max(1, Math.round(geom.neckW * dpr));
    cv.height = Math.max(1, Math.round(geom.neckH * dpr));
    cv.style.width = geom.neckW + "px";
    cv.style.height = geom.neckH + "px";
    const c2d = cv.getContext("2d");
    if (c2d) c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    dirtyRef.current = true; // setting cv.width wiped the backing store
  }, [geom.neckW, geom.neckH]);

  /* ---------------- the frame loop ---------------- */

  useEffect(() => {
    let raf = 0;
    let lastBeat = NaN;

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const cv = canvasRef.current;
      const { scheduler: sch, solo: s, geom: gm } = cfg.current;
      if (!cv || !sch || !s) return;
      const c2d = cv.getContext("2d");
      if (!c2d) return;

      const beat = sch.beatNow();
      // A frozen playhead (paused, step mode) means a frozen picture — there
      // is nothing to redraw, so don't. Unless something else invalidated it.
      if (beat === lastBeat && !dirtyRef.current) return;
      lastBeat = beat;
      dirtyRef.current = false;

      c2d.clearRect(0, 0, gm.neckW, gm.neckH);
      const notes = visibleNotes(s.notes, beat, { lead: cfg.current.lead, tail: TAIL_BEATS });
      for (let i = 0; i < notes.length; i++) drawNote(c2d, notes[i], beat, cfg.current, palRef.current, prevOnString);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [prevOnString]);

  /* ---------------- picking ---------------- */

  const handleClick = (e) => {
    const cv = canvasRef.current;
    const { scheduler: sch, solo: s, geom: gm } = cfg.current;
    if (!cv || !sch) return;
    const r = cv.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;

    // A visible note event first — that is what the user is aiming at.
    const beat = sch.beatNow();
    const notes = visibleNotes(s.notes, beat, { lead: cfg.current.lead, tail: TAIL_BEATS });
    let best = null;
    let bestD = 22;
    notes.forEach((n) => {
      const d = Math.hypot(gm.noteX(n.fret) - x, gm.dispY(n.string) - y);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    });
    if (best && hooks.current.onPick) {
      hooks.current.onPick(best);
      return;
    }

    // Otherwise this was a tap on the bare neck. The overlay covers the whole
    // fretboard, so it has to hand the tap back rather than swallow it.
    if (!hooks.current.onTapFret) return;
    const fret = x < gm.g.openW ? 0 : Math.max(0, Math.min(gm.frets, Math.round((x - gm.g.openW) / gm.g.fretW + 0.5)));
    let str = 0;
    let dy = Infinity;
    for (let sIdx = 0; sIdx < 6; sIdx++) {
      const d = Math.abs(gm.dispY(sIdx) - y);
      if (d < dy) {
        dy = d;
        str = sIdx;
      }
    }
    if (dy > gm.g.rowH) return;
    hooks.current.onTapFret(noteMidi({ string: str, fret }, s.meta), { s: str, f: fret });
  };

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        zIndex: 3,
        // Auto, not none: the canvas covers the fretboard, so it has to take
        // taps and forward the ones that miss a note (see handleClick).
        pointerEvents: onPick || onTapFret ? "auto" : "none",
        cursor: onPick ? "pointer" : "default",
      }}
    />
  );
}

/* ================================================================== */
/* DRAWING ONE NOTE                                                   */
/* ================================================================== */

/**
 * Exported for tests and for checking the render path by hand — a headless or
 * hidden tab never fires requestAnimationFrame, so the frame loop cannot be
 * exercised there, but this can (see `_readPalette` for the palette it wants).
 */
export function drawNote(c2d, n, beat, cfg, pal, prevOnString = new Map()) {
  const { solo, geom, lead, showDegrees, showFingers, rainbow } = cfg;
  const rel = beat - n.startBeat; // < 0 = still approaching
  const dur = n.durBeats;

  /* ---- life: alpha and scale, from the beat alone ---- */
  let alpha;
  let scale;
  let bloom = 0;
  if (rel < 0) {
    const p = clamp01((rel + lead) / lead);
    alpha = 0.14 + 0.62 * p * p; // ease in, so distant notes stay quiet
    scale = 1.75 - 0.75 * p;
  } else if (rel < HIT_BEATS) {
    const p = rel / HIT_BEATS;
    alpha = 1;
    scale = 1 + 0.45 * (1 - p);
    bloom = 1 - p;
  } else if (rel <= dur) {
    const p = (rel - HIT_BEATS) / Math.max(0.001, dur - HIT_BEATS);
    alpha = 1 - 0.42 * p;
    scale = 1;
  } else {
    const p = clamp01((rel - dur) / TAIL_BEATS);
    alpha = 0.58 * (1 - p);
    scale = 1 - 0.14 * p;
  }
  if (alpha <= 0.015) return;

  /* ---- colour: from the theory engine, against the CURRENT harmony ---- */
  const deg = degreeOf(n, solo, Math.max(n.startBeat, Math.min(beat, n.startBeat + dur)));
  const style = rainbow ? RAINBOW[degBase(deg.label)] || RAINBOW[1] : chordToneStyle(deg.semis);
  const bg = resolveVar(style.bg, pal);
  const br = resolveVar(style.br, pal);
  const tx = resolveVar(style.tx, pal);

  /* ---- position ---- */
  const stringY = geom.dispY(n.string);
  let fret = n.fret;
  if (n.technique === "slide" && n.slideToFret != null && rel > 0) {
    fret = n.fret + (n.slideToFret - n.fret) * easeInOut(clamp01(rel / Math.max(0.001, dur)));
  }
  let x = geom.noteX(fret);
  let y = stringY;

  // A bend pushes the ring toward the ceiling, the way the string goes.
  if ((n.technique === "bend" || n.technique === "release") && n.bendSemitones && rel > 0) {
    const p = clamp01((rel / Math.max(0.001, dur) - 0.28) / 0.5);
    const amount = n.technique === "release" ? 1 - p : p;
    y -= amount * Math.min(2, n.bendSemitones) * geom.g.rowH * 0.4;
  }
  if (n.technique === "vibrato" && rel > 0 && rel <= dur) {
    x += Math.sin(rel * TAU * 3) * 2.4;
  }

  const base = n.accent ? 13 : 11.5;
  const r = base * scale * (geom.g.rowH < 26 ? 0.78 : 1);

  /* ---- the string trail: WHICH STRING TO PICK ---- */
  // Runs from the bridge end up to the target and is brightest at the target,
  // so the string reads before the fret does.
  const trailA = rel < 0 ? alpha * 0.95 : Math.max(0, 1 - rel / 0.7) * 0.7;
  if (trailA > 0.02) {
    const grad = c2d.createLinearGradient(geom.neckW, 0, x, 0);
    grad.addColorStop(0, withAlpha(bg, 0));
    grad.addColorStop(0.6, withAlpha(bg, 0.1 * trailA));
    grad.addColorStop(1, withAlpha(bg, 0.9 * trailA));
    c2d.strokeStyle = grad;
    c2d.lineWidth = n.accent ? 3.2 : 2.4;
    c2d.beginPath();
    c2d.moveTo(geom.neckW, stringY);
    c2d.lineTo(x, stringY);
    c2d.stroke();
  }

  /* ---- slur back to the previous note, for hammer-ons and pull-offs ---- */
  if ((n.technique === "hammer" || n.technique === "pull") && alpha > 0.2) {
    const p = prevOnString.get(n.id);
    if (p) {
      const px = geom.noteX(p.fret);
      const up = n.technique === "hammer" ? -1 : 1;
      const midY = stringY + up * geom.g.rowH * 0.44;
      c2d.strokeStyle = withAlpha(br, alpha * 0.75);
      c2d.lineWidth = 1.6;
      c2d.beginPath();
      c2d.moveTo(px, stringY + up * 2);
      c2d.quadraticCurveTo((px + x) / 2, midY, x, stringY + up * 2);
      c2d.stroke();
      c2d.fillStyle = withAlpha(br, alpha * 0.9);
      c2d.font = "700 8px ui-monospace, monospace";
      c2d.textAlign = "center";
      c2d.textBaseline = "middle";
      c2d.fillText(TECHNIQUES[n.technique].glyph, (px + x) / 2, midY + up * 4);
    }
  }

  /* ---- glow: a radial gradient, never a shadow blur ---- */
  const halo = r * 2.7;
  const g2 = c2d.createRadialGradient(x, y, r * 0.4, x, y, halo);
  g2.addColorStop(0, withAlpha(bg, (0.34 + 0.4 * bloom) * alpha));
  g2.addColorStop(1, withAlpha(bg, 0));
  c2d.fillStyle = g2;
  c2d.beginPath();
  c2d.arc(x, y, halo, 0, TAU);
  c2d.fill();

  /* ---- the ring ---- */
  const filled = rel >= 0;
  c2d.lineWidth = n.accent ? 3 : 2.2;
  c2d.strokeStyle = withAlpha(br, alpha);
  c2d.fillStyle = withAlpha(bg, filled ? alpha * 0.95 : alpha * 0.22);
  c2d.beginPath();
  if (n.technique === "harmonic") {
    c2d.moveTo(x, y - r);
    c2d.lineTo(x + r, y);
    c2d.lineTo(x, y + r);
    c2d.lineTo(x - r, y);
    c2d.closePath();
  } else {
    c2d.arc(x, y, r, 0, TAU);
  }
  c2d.fill();
  c2d.stroke();

  /* ---- what goes inside ---- */
  const fs = Math.max(8, Math.round(r * 0.85));
  c2d.textAlign = "center";
  c2d.textBaseline = "middle";
  c2d.font = `700 ${fs}px ui-monospace, SFMono-Regular, Menlo, monospace`;

  if (n.technique === "mute") {
    c2d.strokeStyle = withAlpha(filled ? tx : br, alpha);
    c2d.lineWidth = 2;
    const m = r * 0.45;
    c2d.beginPath();
    c2d.moveTo(x - m, y - m);
    c2d.lineTo(x + m, y + m);
    c2d.moveTo(x + m, y - m);
    c2d.lineTo(x - m, y + m);
    c2d.stroke();
  } else {
    const inside = showFingers && n.finger ? String(n.finger) : showDegrees ? deg.label : "";
    if (inside) {
      c2d.fillStyle = withAlpha(filled ? tx : br, alpha);
      c2d.fillText(inside, x, y + 0.5);
    }
    // With a fingering numeral inside, the degree moves out beside it —
    // both are wanted at once, and the degree is the teaching half.
    if (showFingers && n.finger && showDegrees) {
      c2d.font = `700 ${Math.max(7, fs - 2)}px ui-monospace, monospace`;
      c2d.fillStyle = withAlpha(br, alpha * 0.95);
      c2d.fillText(deg.label, x, y - r - 6);
    }
  }

  /* ---- technique marks ---- */
  c2d.font = "700 9px ui-monospace, monospace";
  c2d.fillStyle = withAlpha(br, alpha);

  if ((n.technique === "bend" || n.technique === "release") && n.bendSemitones) {
    const label = String(BEND_TEXT[n.bendSemitones] || n.bendSemitones);
    const dir = n.technique === "bend" ? -1 : 1; // bend pulls up, release drops
    const ax = x + r + 7;
    const tip = y + dir * 12;
    c2d.strokeStyle = withAlpha(br, alpha);
    c2d.lineWidth = 1.6;
    c2d.beginPath();
    c2d.moveTo(ax, y);
    c2d.lineTo(ax, tip);
    c2d.moveTo(ax - 3, tip - dir * 4);
    c2d.lineTo(ax, tip);
    c2d.lineTo(ax + 3, tip - dir * 4);
    c2d.stroke();
    c2d.fillText(label, ax + 8, tip);
  } else if (n.technique === "slide" && n.slideToFret != null) {
    c2d.fillText(n.slideToFret > n.fret ? "/" : "\\", x + r + 6, y - r * 0.4);
  } else if (n.technique === "vibrato") {
    c2d.fillText("~", x, y - r - 5);
  } else if (n.technique === "tap") {
    c2d.fillText("T", x + r + 6, y - r * 0.5);
  }
}
