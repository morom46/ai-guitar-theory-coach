import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  INTERVALS,
  ROOTS,
  FRETS,
  OPEN_MIDI,
  noteNameToPc,
  intervalShapes,
  shapeSummary,
  buildNoteNames,
} from "../theory/engine.js";
import { C } from "../ui/theme.js";
import Neck from "./Neck.jsx";
import { playMidi } from "../audio/engine.js";
import { pickWeighted, record } from "../data/progress.js";
import WeakSpots from "./WeakSpots.jsx";

/**
 * INTERVALS AS SHAPES — #14.
 *
 * Every other page in the app treats an interval as a number of semitones.
 * On a guitar it is a SHAPE, and the shape is the same everywhere because the
 * strings are tuned in fourths — everywhere except across the G and B strings,
 * which are tuned a third apart, so every shape crossing that pair shifts one
 * fret higher.
 *
 * That single exception is the whole geography of the instrument, and knowing
 * it is what makes the neck feel small. So: pick an interval, tap an anchor
 * note, and the app draws every place its partner lives — colour-coded by
 * which shape it is, with the G–B crossings marked. Then drill it.
 *
 * The offsets are computed from OPEN_MIDI (see intervalShapes), so the famous
 * exception is not special-cased anywhere. It falls out of the tuning.
 */

const PICKS = [
  { semis: 3, name: "minor 3rd" },
  { semis: 4, name: "major 3rd" },
  { semis: 5, name: "perfect 4th" },
  { semis: 7, name: "perfect 5th" },
  { semis: 9, name: "major 6th" },
  { semis: 10, name: "minor 7th" },
  { semis: 12, name: "octave" },
];

const readBest = () => {
  try { return Number(localStorage.getItem("shapes.best")) || 0; } catch { return 0; }
};
const writeBest = (n) => {
  try { localStorage.setItem("shapes.best", String(n)); } catch {}
};

export default function IntervalShapes() {
  const [semis, setSemis] = useState(7);
  const [anchor, setAnchor] = useState({ s: 5, f: 5 }); // low E, fret 5 = A
  const [drill, setDrill] = useState(false);
  const [q, setQ] = useState(null);
  const [verdict, setVerdict] = useState(null);
  const [score, setScore] = useState({ asked: 0, right: 0, streak: 0 });
  const [best, setBest] = useState(readBest);
  const [muted, setMuted] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const anchorMidi = OPEN_MIDI[anchor.s] + anchor.f;
  // Spell the neck from a practical key rather than from whatever the anchor
  // happens to be: buildNoteNames("A#") is a real key signature and it writes
  // B# for C, which reads like a bug even though it is technically correct.
  const spell = ROOTS.find((r) => noteNameToPc(r) === anchorMidi % 12) || "C";
  const names = useMemo(() => buildNoteNames(spell), [spell]);
  const iv = INTERVALS[semis];

  // Where the partner note lives, for real, from this anchor.
  const partners = useMemo(() => {
    const out = [];
    OPEN_MIDI.forEach((open, s) => {
      const f = anchorMidi + semis - open;
      if (f >= 0 && f <= FRETS) out.push({ s, f, span: anchor.s - s });
    });
    return out;
  }, [anchorMidi, semis, anchor.s]);

  // The shape table: what the fret offset is per string-span, and what it
  // becomes when the pair straddles G and B.
  const table = useMemo(
    () => [1, 2].map((span) => shapeSummary(semis, span)).filter((t) => t.normal != null || t.acrossGB != null),
    [semis]
  );
  const sameString = semis; // trivially: n frets along the same string

  const play = (midi) => { if (!muted) playMidi(midi, 0, 1.1); };

  const hearPair = (partnerMidi) => {
    if (muted) return;
    playMidi(anchorMidi, 0, 1.3);
    playMidi(partnerMidi, 0.45, 1.5);
    playMidi(anchorMidi, 1.1, 1.6);
    playMidi(partnerMidi, 1.1, 1.6);
  };

  /* ---- the drill ---- */
  const ask = () => {
    clearTimeout(timer.current);
    const semisWanted = pickWeighted("shapes.intervals", PICKS.map((p) => p.semis), { avoid: q ? q.semis : null });
    const pick = PICKS.find((p) => p.semis === semisWanted) || PICKS[0];
    // An anchor low enough that the partner is always reachable.
    const s = 2 + Math.floor(Math.random() * 4); // strings 3..6 (index 2..5)
    const f = 1 + Math.floor(Math.random() * 9);
    setAnchor({ s, f });
    setSemis(pick.semis);
    setQ(pick);
    setVerdict(null);
    setScore((sc) => ({ ...sc, asked: sc.asked + 1 }));
    if (!muted) {
      const m = OPEN_MIDI[s] + f;
      playMidi(m, 0, 1.2);
      playMidi(m + pick.semis, 0.5, 1.4);
    }
  };

  const judge = (midi, at) => {
    if (!drill || !q || verdict) return;
    play(midi);
    const want = anchorMidi + semis;
    record("shapes.intervals", semis, midi === want);
    if (midi === want) {
      const span = anchor.s - at.s;
      const crosses = Math.min(anchor.s, at.s) <= 1 && Math.max(anchor.s, at.s) >= 2;
      setVerdict({ ok: true, span, crosses });
      const streak = score.streak + 1;
      setScore((sc) => ({ ...sc, right: sc.right + 1, streak: sc.streak + 1 }));
      if (streak > best) { setBest(streak); writeBest(streak); }
      timer.current = setTimeout(ask, 2400);
    } else {
      const off = midi - anchorMidi;
      setVerdict({ ok: false, off });
      setScore((sc) => ({ ...sc, streak: 0 }));
    }
  };

  const startDrill = () => { setDrill(true); ask(); };
  const stopDrill = () => { clearTimeout(timer.current); setDrill(false); setQ(null); setVerdict(null); };

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span className="eyebrow" style={{ margin: 0 }}>Interval</span>
          {PICKS.map((p) => (
            <button
              key={p.semis}
              className={"btn" + (semis === p.semis ? " on" : "")}
              style={{ padding: "4px 9px" }}
              onClick={() => { setSemis(p.semis); setVerdict(null); }}
              disabled={drill}
            >
              {INTERVALS[p.semis].ab} <span style={{ opacity: 0.6, fontSize: 10 }}>{p.name}</span>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <button className={"btn" + (drill ? " on" : "")} onClick={() => (drill ? stopDrill() : startDrill())}>
            {drill ? "■ stop the drill" : "🎯 drill it"}
          </button>
          {drill && <button className="btn" onClick={ask}>↻ next</button>}
          <button className="btn" onClick={() => setMuted((m) => !m)} aria-pressed={muted}>{muted ? "♪ sound off" : "♪ sound on"}</button>
          {drill && (
            <span className="mono" style={{ fontSize: 11, color: C.muted, marginLeft: "auto" }}>
              {score.right}/{score.asked} · streak {score.streak} · best {best}
            </span>
          )}
        </div>
        {drill && (
          <div style={{ marginTop: 4 }}>
            <WeakSpots drill="shapes.intervals" tick={score.asked} title="Intervals you keep missing" label={(k) => INTERVALS[Number(k)].name} />
          </div>
        )}
      </div>

      {/* the shape table */}
      {!drill && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            The {iv.name} as a shape — measured from the tuning, not memorised
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Shape title="same string" fret={sameString} sub={`${sameString} frets along`} />
            {table.map((t) => (
              <React.Fragment key={t.span}>
                <Shape
                  title={`${t.span} string${t.span > 1 ? "s" : ""} up`}
                  fret={t.normal}
                  sub={t.normal == null ? "off the neck" : t.normal === 0 ? "straight across" : `${t.normal > 0 ? "+" : ""}${t.normal} fret${Math.abs(t.normal) === 1 ? "" : "s"}`}
                />
                <Shape
                  title={`${t.span} string${t.span > 1 ? "s" : ""} · across G–B`}
                  fret={t.acrossGB}
                  sub={t.shifts ? `${t.shifts > 0 ? "+" : ""}${t.shifts} fret vs the others` : "same as the others"}
                  warn
                />
              </React.Fragment>
            ))}
          </div>
          <div className="mono" style={{ fontSize: 12, color: C.muted, marginTop: 10, lineHeight: 1.65 }}>
            Standard tuning stacks perfect 4ths — except G to B, which is a major 3rd. One string pair
            out of five is a semitone narrower than the rest, so every shape that steps over it lands one
            fret higher. That is the entire exception, and it is why the same shape works everywhere
            else on the neck.
          </div>
        </div>
      )}

      {/* the drill prompt */}
      {drill && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <span className="mono" style={{ fontSize: 24, fontWeight: 700, color: C.sun }}>
              find the {q ? q.name : "…"}
            </span>
            <span className="mono" style={{ fontSize: 12.5, color: C.muted }}>
              above the orange note — string {anchor.s + 1}, fret {anchor.f}
            </span>
          </div>
          <div className="mono" style={{ fontSize: 12.5, marginTop: 8, minHeight: 36, lineHeight: 1.6 }}>
            {verdict ? (
              verdict.ok ? (
                <span style={{ color: C.green }}>
                  ✓ {verdict.span === 0
                    ? `same string, ${semis} frets up`
                    : `${verdict.span} string${verdict.span > 1 ? "s" : ""} up, ${shapeSummary(semis, verdict.span)[verdict.crosses ? "acrossGB" : "normal"]} fret${Math.abs(shapeSummary(semis, verdict.span)[verdict.crosses ? "acrossGB" : "normal"]) === 1 ? "" : "s"} across`}
                  {verdict.crosses && " — and that one crossed G–B, which is why it sat a fret higher than the same shape anywhere else."}
                </span>
              ) : (
                <span style={{ color: C.red }}>
                  That's {Math.abs(verdict.off)} semitone{Math.abs(verdict.off) === 1 ? "" : "s"}{" "}
                  {verdict.off < 0 ? "below" : "above"} the anchor — a {INTERVALS[Math.abs(verdict.off) % 12].name}
                  {Math.abs(verdict.off) >= 12 ? " plus an octave" : ""}. A {q.name} is {semis} semitones:
                  {" "}{semis} frets along the same string, or {shapeSummary(semis, 1).normal >= 0 ? "+" : ""}
                  {shapeSummary(semis, 1).normal} on the next string up.
                </span>
              )
            ) : (
              <span style={{ color: C.muted }}>Tap the note a {q ? q.name : "…"} above it — anywhere on the neck it exists.</span>
            )}
          </div>
        </div>
      )}

      {/* the neck */}
      <div style={{ marginTop: 16 }}>
        <Neck
          root={names[anchorMidi % 12]}
          frets={FRETS}
          stringGauge
          inlays="double"
          onTap={(midi, at) => {
            if (drill) return judge(midi, at);
            // Outside the drill, tapping moves the anchor — which is the point:
            // the shape is the same wherever you put it.
            const partner = partners.find((p) => p.s === at.s && p.f === at.f);
            if (partner) return hearPair(midi);
            setAnchor({ s: at.s, f: at.f });
            play(midi);
          }}
          resolve={(pc, semisFromAnchor, { s, f, names: nm }) => {
            const isAnchor = s === anchor.s && f === anchor.f;
            if (isAnchor) {
              return {
                label: nm[pc],
                bg: C.sun,
                br: C.sunDeep,
                tx: "#fff",
                size: 24,
                boxShadow: "0 0 0 4px rgba(255,122,46,.3)",
                zIndex: 6,
                title: `anchor — ${nm[pc]}`,
              };
            }
            const hit = partners.find((p) => p.s === s && p.f === f);
            // Every other fret stays present and tappable but nearly invisible:
            // outside the drill that is how you move the anchor, and inside it
            // that is how you answer.
            const blank = {
              label: "",
              bg: "transparent",
              br: C.line,
              tx: C.muted,
              dashed: true,
              opacity: 0.28,
              size: 13,
              zIndex: 1,
              title: `${nm[pc]} · string ${s + 1} fret ${f}`,
            };
            if (!hit) return blank;
            // In the drill, the answer must not be sitting there highlighted.
            if (drill && !verdict) return blank;
            const crosses = Math.min(anchor.s, s) <= 1 && Math.max(anchor.s, s) >= 2;
            const same = hit.span === 0;
            return {
              label: iv.ab,
              bg: same ? C.blue : crosses ? C.violet : C.cyan,
              br: same ? "#123F62" : crosses ? "#7A52C7" : "#1F7E96",
              tx: same ? "#EAF2F7" : crosses ? "#1A1030" : "#06222B",
              size: 21,
              fontSize: 9,
              title: same
                ? `${nm[pc]} — same string, ${semis} frets up`
                : `${nm[pc]} — ${Math.abs(hit.span)} string${Math.abs(hit.span) > 1 ? "s" : ""} ${hit.span > 0 ? "up" : "down"}${crosses ? ", crossing G–B (one fret higher)" : ""}`,
            };
          }}
        />
      </div>

      {!drill && (
        <div className="mono" style={{ fontSize: 11.5, color: C.muted, marginTop: 10, display: "flex", gap: 16, flexWrap: "wrap" }}>
          <span><Dot c={C.sun} /> anchor — tap any empty fret to move it</span>
          <span><Dot c={C.cyan} /> the same shape, string to string</span>
          <span><Dot c={C.violet} /> crosses G–B — one fret higher</span>
          <span><Dot c={C.blue} /> same string</span>
        </div>
      )}
    </div>
  );
}

function Shape({ title, fret, sub, warn }) {
  return (
    <div
      style={{
        minWidth: 118,
        padding: "10px 12px",
        borderRadius: 4,
        border: `1.5px solid ${warn ? C.violet : C.line}`,
        background: warn ? "rgba(181,140,255,.10)" : "var(--surface-lo)",
        textAlign: "center",
      }}
    >
      <div className="mono" style={{ fontSize: 9.5, color: C.muted, letterSpacing: 0.4 }}>{title}</div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: fret == null ? C.muted : warn ? C.violet : C.ink, margin: "3px 0" }}>
        {fret == null ? "—" : `${fret > 0 ? "+" : ""}${fret}`}
      </div>
      <div className="mono" style={{ fontSize: 9.5, color: C.muted }}>{sub}</div>
    </div>
  );
}

function Dot({ c }) {
  return <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 999, background: c, marginRight: 5, verticalAlign: "middle" }} />;
}
