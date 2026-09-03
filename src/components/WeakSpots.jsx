import React, { useEffect, useState } from "react";
import { summary, resetDrill, BOX_COUNT } from "../data/progress.js";
import { C } from "../ui/theme.js";

/**
 * THE PRACTICE LOG — the bit a best-streak counter could never tell you.
 *
 * Not a chart of how much you have practised: a list of the specific things
 * you keep getting wrong, which is the only part of a practice record that
 * changes what you do next. It re-reads after every answer (`tick`), so it
 * updates as you go.
 */
export default function WeakSpots({ drill, label = String, title = "What you keep missing", tick = 0 }) {
  const [s, setS] = useState(() => summary(drill, { label }));
  useEffect(() => setS(summary(drill, { label })), [drill, tick, label]);

  if (!s.asked) {
    return (
      <div className="mono" style={{ fontSize: 11.5, color: C.muted }}>
        Answer a few and this becomes a list of the ones you keep missing — the drill will start asking
        for those more often.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline" }}>
        <span className="eyebrow" style={{ margin: 0 }}>{title}</span>
        <span className="mono" style={{ fontSize: 11.5, color: C.muted }}>
          {s.right}/{s.asked} all time · {Math.round(s.accuracy * 100)}% · {s.solid} of {s.seen} solid
        </span>
        <button
          className="btn"
          style={{ padding: "2px 7px", fontSize: 10, marginLeft: "auto" }}
          onClick={() => { resetDrill(drill); setS(summary(drill, { label })); }}
          title="Forget this drill's history and start weighting from scratch"
        >
          ↺ forget
        </button>
      </div>

      {s.weak.length === 0 ? (
        <div className="mono" style={{ fontSize: 11.5, color: C.green, marginTop: 6 }}>
          Nothing missed yet — every one of these is still coming up evenly.
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {s.weak.map((w) => (
            <span
              key={w.item}
              className="mono"
              style={{
                fontSize: 11.5,
                padding: "3px 8px",
                borderRadius: 3,
                border: `1.5px solid ${w.rate > 0.5 ? C.red : C.sun}`,
                color: w.rate > 0.5 ? C.red : C.sun,
              }}
              title={`${w.wrong} wrong out of ${w.n} · box ${w.box + 1}/${BOX_COUNT}`}
            >
              <b>{w.label}</b> <span style={{ color: C.muted }}>{Math.round((1 - w.rate) * 100)}%</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
