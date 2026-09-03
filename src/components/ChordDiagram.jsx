import React from "react";
import { OPEN_MIDI } from "../theory/engine.js";
import { C, chordToneStyle } from "../ui/theme.js";

/**
 * A CHORD BOX — the diagram every guitarist already knows how to read.
 *
 * Drawn in the standard orientation: strings as columns with the low E on the
 * left, frets as rows running down the neck, ✕ and ○ above the nut. Each dot
 * carries its job in the chord (1, 3, 5, ♭7) rather than a finger number,
 * because the whole app is trying to make you see intervals instead of
 * memorised dots.
 *
 * Shapes come from the solver in theory/voicings.js — nothing here is typed
 * in, so the diagram cannot disagree with the chord it claims to be.
 */

const W = 26;   // string spacing
const H = 24;   // fret spacing
const PAD_X = 16;
const PAD_TOP = 26;
const ROWS = 5;

export default function ChordDiagram({ voicing, names, onPlay, label, sub, compact = false }) {
  if (!voicing) return null;
  const { frets, barre } = voicing;
  // Columns run low string -> high string, the way a chord box is drawn.
  const cols = [...OPEN_MIDI.keys()].reverse(); // [5,4,3,2,1,0]
  const fretted = frets.filter((f) => f != null && f > 0);
  const low = fretted.length ? Math.min(...fretted) : 1;
  // Open-position shapes show the nut; anything higher is drawn from its own
  // starting fret with the position printed beside it.
  const openPos = low <= 2 && fretted.every((f) => f <= ROWS);
  const base = openPos ? 1 : low;

  const w = PAD_X * 2 + W * 5;
  const h = PAD_TOP + H * ROWS + (compact ? 14 : 22);
  const x = (i) => PAD_X + i * W;
  const y = (row) => PAD_TOP + row * H;

  const row = (f) => f - base; // 0-based row for a fret number

  return (
    <button
      className="cd-box"
      onClick={onPlay}
      title={label ? `${label} — strum it` : "strum it"}
      style={{
        background: "var(--surface-lo)",
        border: `1.5px solid ${C.line}`,
        borderRadius: 5,
        padding: "6px 8px 8px",
        cursor: onPlay ? "pointer" : "default",
        textAlign: "center",
      }}
    >
      {label && (
        <div className="mono" style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, marginBottom: 1 }}>{label}</div>
      )}
      <svg width={w} height={h} role="img" aria-label={label || "chord diagram"}>
        {/* mutes and opens */}
        {cols.map((s, i) => {
          const f = frets[s];
          // Nothing above a fretted string — drawing it transparent kept it in
          // the text layer, where screen readers and innerText still found it.
          if (f != null && f > 0) return null;
          return (
            <text
              key={"m" + s}
              x={x(i)}
              y={PAD_TOP - 9}
              textAnchor="middle"
              fontSize="11"
              fill={f == null ? C.muted : C.cyan}
              style={{ fontFamily: "ui-monospace, monospace" }}
            >
              {f == null ? "✕" : "○"}
            </text>
          );
        })}

        {/* the nut, or the position marker */}
        {openPos ? (
          <rect x={PAD_X - 1} y={PAD_TOP - 3} width={W * 5 + 2} height="3.5" fill={C.ink} rx="1" />
        ) : (
          <text x={PAD_X - 9} y={y(0) + 15} textAnchor="end" fontSize="9.5" fill={C.muted} style={{ fontFamily: "ui-monospace, monospace" }}>
            {base}fr
          </text>
        )}

        {/* grid */}
        {Array.from({ length: ROWS + 1 }, (_, r) => (
          <line key={"h" + r} x1={PAD_X} y1={y(r)} x2={PAD_X + W * 5} y2={y(r)} stroke={C.line} strokeWidth="1" opacity="0.75" />
        ))}
        {cols.map((_, i) => (
          <line key={"v" + i} x1={x(i)} y1={y(0)} x2={x(i)} y2={y(ROWS)} stroke={C.line} strokeWidth="1" opacity="0.75" />
        ))}

        {/* barre */}
        {barre && row(barre.fret) >= 0 && row(barre.fret) < ROWS && (
          <rect
            x={x(cols.indexOf(barre.from)) - 9}
            y={y(row(barre.fret)) + H / 2 - 9}
            width={Math.abs(cols.indexOf(barre.to) - cols.indexOf(barre.from)) * W + 18}
            height="18"
            rx="9"
            fill={C.sun}
            opacity="0.9"
          />
        )}

        {/* the dots */}
        {cols.map((s, i) => {
          const f = frets[s];
          if (f == null || f === 0) return null;
          const r = row(f);
          if (r < 0 || r >= ROWS) return null;
          const pc = (OPEN_MIDI[s] + f) % 12;
          const semis = ((pc - voicing.rootPc) % 12 + 12) % 12;
          const st = chordToneStyle(semis);
          const isRoot = semis === 0;
          return (
            <g key={"d" + s}>
              <circle cx={x(i)} cy={y(r) + H / 2} r="9.5" fill={st.bg} stroke={st.br} strokeWidth="1.5" />
              <text
                x={x(i)}
                y={y(r) + H / 2 + 3.5}
                textAnchor="middle"
                fontSize={isRoot ? "9.5" : "9"}
                fontWeight="700"
                fill={st.tx}
                style={{ fontFamily: "ui-monospace, monospace" }}
              >
                {names ? names[pc] : ""}
              </text>
            </g>
          );
        })}
      </svg>
      {sub && <div className="mono" style={{ fontSize: 9.5, color: C.muted, marginTop: -2 }}>{sub}</div>}
    </button>
  );
}
