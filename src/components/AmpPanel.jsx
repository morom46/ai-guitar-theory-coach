import React from "react";
import { C } from "../ui/theme.js";
import { AMP, GUITAR, msToBpm } from "../data/tones.js";

/**
 * AMP PANEL — an SVG front panel of the Blackstar ID:Core V4 (Stereo 10),
 * drawn in the app's blueprint style. Pure display: pass it a tone and it
 * dials every knob. Editing happens in the tone editor on Songs & Tones.
 */

/* five-way pickup switch diagram (HSS Strat) */
export function PickupSwitch({ pos }) {
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
      {[1, 2, 3, 4, 5].map((p) => (
        <div key={p} title={`${p} — ${GUITAR.positions[p]}`} style={{
          width: 26, height: 34, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center",
          border: `1.5px solid ${p === pos ? C.sun : C.line}`,
          background: p === pos ? "rgba(255,122,46,.16)" : "var(--surface-lo)",
          color: p === pos ? C.sun : C.muted, fontWeight: p === pos ? 700 : 400,
          fontFamily: "ui-monospace, monospace", fontSize: 12,
        }}>{p}</div>
      ))}
    </div>
  );
}

const A0 = -135, A1 = 135; // knob sweep

// pointer line endpoint for a 0..10 value
const pt = (v, r) => {
  const a = ((A0 + (Math.max(0, Math.min(10, v)) / 10) * (A1 - A0)) - 90) * (Math.PI / 180);
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
};

function Knob({ x = 0, y = 0, r = 20, value = 5, label, subLabel, accent }) {
  const p = pt(value, r - 6);
  const ticks = Array.from({ length: 11 }, (_, i) => {
    const t0 = pt(i, r + 3), t1 = pt(i, r + 7);
    return <line key={i} x1={t0.x} y1={t0.y} x2={t1.x} y2={t1.y} stroke={C.muted} strokeWidth="1" opacity="0.6" />;
  });
  return (
    <g transform={`translate(${x},${y})`}>
      {ticks}
      <circle r={r} fill="var(--surface-hi)" stroke={accent || C.ink} strokeWidth="1.5" />
      <line x1="0" y1="0" x2={p.x} y2={p.y} stroke={accent || C.sun} strokeWidth="2.5" strokeLinecap="round" />
      <circle r="2.5" fill={accent || C.sun} />
      <text y={r + 18} textAnchor="middle" fontSize="9" letterSpacing="1.5" fill={C.muted} style={{ fontFamily: "ui-monospace, monospace", textTransform: "uppercase" }}>{label}</text>
      <text y={r + 29} textAnchor="middle" fontSize="9" fontWeight="700" fill={C.ink} style={{ fontFamily: "ui-monospace, monospace" }}>{subLabel ?? value}</text>
    </g>
  );
}

function VoiceSelector({ x, y, voice }) {
  const idx = Math.max(0, AMP.voices.indexOf(voice));
  const r = 24;
  const p = pt((idx / (AMP.voices.length - 1)) * 10, r - 7);
  return (
    <g transform={`translate(${x},${y})`}>
      {AMP.voices.map((v, i) => {
        const lp = pt((i / (AMP.voices.length - 1)) * 10, r + 14);
        const on = i === idx;
        return (
          <text key={v} x={lp.x} y={lp.y + 3} textAnchor={lp.x < -4 ? "end" : lp.x > 4 ? "start" : "middle"} fontSize="7.5" fontWeight={on ? 700 : 400}
            fill={on ? C.sun : C.muted} style={{ fontFamily: "ui-monospace, monospace" }}>
            {v.replace("Clean ", "CL ").replace("Super Crunch", "S.CRUNCH").toUpperCase()}
          </text>
        );
      })}
      <circle r={r} fill="var(--surface-hi)" stroke={C.ink} strokeWidth="1.5" />
      <line x1="0" y1="0" x2={p.x} y2={p.y} stroke={C.sun} strokeWidth="3" strokeLinecap="round" />
      <circle r="3" fill={C.sun} />
      <text y={r + 30} textAnchor="middle" fontSize="9" letterSpacing="1.5" fill={C.muted} style={{ fontFamily: "ui-monospace, monospace" }}>VOICE</text>
    </g>
  );
}

function FxSection({ x, y, label, fx, extra }) {
  const on = fx?.on;
  const col = on ? C.cyan : C.muted;
  return (
    <g transform={`translate(${x},${y})`} opacity={on ? 1 : 0.45}>
      <rect x="-34" y="-34" width="68" height="86" rx="4" fill="none" stroke={C.line} strokeWidth="1" strokeDasharray={on ? "0" : "3 3"} />
      <circle cx="24" cy="-24" r="3.5" fill={on ? C.green : "var(--surface-hi)"} stroke={C.line} strokeWidth="1" />
      <text y="-20" x="-28" fontSize="8.5" letterSpacing="1.5" fontWeight="700" fill={col} style={{ fontFamily: "ui-monospace, monospace" }}>{label}</text>
      <text y="-6" textAnchor="middle" fontSize="9" fontWeight="700" fill={on ? C.ink : C.muted} style={{ fontFamily: "ui-monospace, monospace" }}>{on ? fx.type.toUpperCase() : "OFF"}</text>
      <g transform="translate(0,20)">
        {on && <Knob r={13} value={fx.level} label="" accent={col} />}
      </g>
      <text y="46" textAnchor="middle" fontSize="8" fill={C.muted} style={{ fontFamily: "ui-monospace, monospace" }}>
        {on ? `LVL ${fx.level}${extra ? " · " + extra : ""}` : ""}
      </text>
    </g>
  );
}

export default function AmpPanel({ tone }) {
  if (!tone) return null;
  const { fx } = tone;
  const tap = fx?.dly?.on && fx.dly.ms > 0 ? `${fx.dly.ms}ms` : "";
  return (
    <svg viewBox="0 0 720 168" style={{ width: "100%", maxWidth: 720, display: "block" }} role="img"
      aria-label={`Amp settings: ${tone.voice}, gain ${tone.gain}, ISF ${tone.isf}`}>
      {/* panel */}
      <rect x="1" y="1" width="718" height="166" rx="8" fill="var(--surface-lo)" stroke={C.ink} strokeWidth="1.5" />
      <text x="18" y="22" fontSize="10" letterSpacing="2" fontWeight="700" fill={C.ink} style={{ fontFamily: "ui-monospace, monospace" }}>BLACKSTAR ID:CORE V4</text>
      <text x="18" y="34" fontSize="8" letterSpacing="1" fill={C.muted} style={{ fontFamily: "ui-monospace, monospace" }}>STEREO 10 · YOUR AMP</text>
      <line x1="18" y1="42" x2="702" y2="42" stroke={C.line} strokeWidth="1" strokeDasharray="4 4" />

      {/* input jack */}
      <circle cx="40" cy="100" r="9" fill="none" stroke={C.ink} strokeWidth="1.5" />
      <circle cx="40" cy="100" r="3" fill={C.ink} />
      <text x="40" y="132" textAnchor="middle" fontSize="8" letterSpacing="1" fill={C.muted} style={{ fontFamily: "ui-monospace, monospace" }}>INPUT</text>

      {/* main controls */}
      <VoiceSelector x={140} y={98} voice={tone.voice} />
      <Knob x={240} y={98} value={tone.gain} label="Gain" />
      <Knob x={320} y={98} value={tone.volume} label="Volume" />
      <Knob x={400} y={98} value={tone.isf} label="EQ · ISF" subLabel={tone.isf <= 4 ? `${tone.isf} · USA` : tone.isf >= 6 ? `${tone.isf} · UK` : tone.isf} />

      {/* fx sections */}
      <FxSection x={492} y={98} label="MOD" fx={fx?.mod} />
      <FxSection x={572} y={98} label="DLY" fx={fx?.dly} extra={tap} />
      <FxSection x={652} y={98} label="REV" fx={fx?.rev} />

      {/* tap tempo hint */}
      {fx?.dly?.on && fx.dly.ms > 0 && (
        <text x="702" y="22" textAnchor="end" fontSize="8.5" fill={C.cyan} style={{ fontFamily: "ui-monospace, monospace" }}>
          TAP ≈ {fx.dly.ms}ms ({msToBpm(fx.dly.ms)} BPM)
        </text>
      )}
    </svg>
  );
}
