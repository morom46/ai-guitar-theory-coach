import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ROOTS,
  SCALES,
  DEG,
  FRETS,
  OPEN_MIDI,
  stepPattern,
  stepLabel,
  formulaOf,
  noteNameToPc,
  keyNames,
} from "../theory/engine.js";
import { C } from "../ui/theme.js";
import Neck from "./Neck.jsx";
import { playMidi } from "../audio/engine.js";
import { useDroneFollow } from "../audio/useDrone.js";
import { pickWeighted, record } from "../data/progress.js";
import WeakSpots from "./WeakSpots.jsx";

/**
 * BUILD IT FROM THE FORMULA — #13.
 *
 * A scale is a recipe of steps, not a list of notes. The app has always shown
 * the finished list, which is why "what IS the major scale" gets answered with
 * seven letters instead of W–W–H–W–W–W–H.
 *
 * So: one string, the formula written out, and you walk it fret by fret. On a
 * single string a whole step IS two frets and a half step IS one — the recipe
 * stops being notation and becomes distance you can see. Get one wrong and the
 * app names what you actually played ("that's a W; the formula wants an H").
 *
 * Then the reverse drill: seven notes light up, name the scale.
 *
 * Every step comes from stepPattern(SCALES[id].ints), so the drill can never
 * mark you wrong against a formula the rest of the app disagrees with.
 */

const BUILDABLE = ["major", "aeolian", "dorian", "mixolydian", "lydian", "phrygian", "locrian", "harmonicMinor", "melodicMinor", "majorPent", "minorPent", "blues"];
const NAMEABLE = ["major", "aeolian", "dorian", "mixolydian", "lydian", "phrygian", "locrian", "harmonicMinor", "melodicMinor", "majorPent", "minorPent", "blues", "harmonicMajor", "lydianDom"];

const readBest = () => {
  try { return Number(localStorage.getItem("formula.best")) || 0; } catch { return 0; }
};
const writeBest = (n) => {
  try { localStorage.setItem("formula.best", String(n)); } catch {}
};

export default function ScaleFormula() {
  const [drill, setDrill] = useState("build"); // build | name
  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 16 }}>
        <button className={"btn" + (drill === "build" ? " on" : "")} onClick={() => setDrill("build")}>Walk the formula</button>
        <button className={"btn" + (drill === "name" ? " on" : "")} onClick={() => setDrill("name")}>Name that scale</button>
      </div>
      {drill === "build" ? <WalkIt /> : <NameThatScale />}
    </div>
  );
}

/* ------------------------------------------------------------------ build */

function WalkIt() {
  const [root, setRoot] = useState("A");
  const [scaleId, setScaleId] = useState("major");
  const [string, setString] = useState(5); // 5 = low E, where the fret maths is easiest to see
  const [placed, setPlaced] = useState([]); // fret numbers, ascending from the root
  const [wrong, setWrong] = useState(null);
  const [muted, setMuted] = useState(false);

  const rootPc = noteNameToPc(root);
  // A minor-ish scale spells itself flat — E♭, not D♯.
  const names = useMemo(() => keyNames(root, SCALES[scaleId].ints.includes(3) ? "minor" : "major"), [root, scaleId]);
  useDroneFollow(root);

  const steps = useMemo(() => stepPattern(SCALES[scaleId].ints), [scaleId]);
  const open = OPEN_MIDI[string];
  // Lowest fret on this string that gives the root, kept low enough that the
  // whole scale still fits inside 24 frets.
  const startFret = ((rootPc - open) % 12 + 12) % 12;
  const target = useMemo(() => {
    const out = [startFret];
    steps.forEach((st) => out.push(out[out.length - 1] + st));
    return out; // root … octave
  }, [startFret, steps]);

  const doneIdx = placed.length; // how many steps are already walked
  const nextFret = target[doneIdx + 1];
  const finished = doneIdx >= steps.length;

  const reset = () => { setPlaced([]); setWrong(null); };
  useEffect(() => { reset(); }, [root, scaleId, string]);

  const say = (fret) => {
    if (muted) return;
    playMidi(open + fret, 0, 1.1);
  };

  const tap = (fret) => {
    if (finished) return;
    say(fret);
    if (fret === nextFret) {
      setWrong(null);
      setPlaced((p) => [...p, fret]);
      return;
    }
    // Name what they actually played, in the formula's own units.
    const from = target[doneIdx];
    setWrong({ fret, gap: fret - from });
  };

  const walked = [target[0], ...placed];

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span className="eyebrow" style={{ margin: 0 }}>Root</span>
          {ROOTS.map((r) => (
            <button key={r} className={"chip" + (r === root ? " on" : "")} onClick={() => setRoot(r)}>{r}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span className="eyebrow" style={{ margin: 0 }}>Scale</span>
          {BUILDABLE.map((id) => (
            <button key={id} className={"btn" + (scaleId === id ? " on" : "")} style={{ padding: "4px 8px" }} onClick={() => setScaleId(id)}>
              {SCALES[id].name}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span className="eyebrow" style={{ margin: 0 }}>On string</span>
          {OPEN_MIDI.map((m, i) => (
            <button key={i} className={"chip" + (string === i ? " on" : "")} onClick={() => setString(i)}>
              {i + 1} · {names[m % 12]}
            </button>
          ))}
          <button className="btn" onClick={() => setMuted((v) => !v)} aria-pressed={muted}>{muted ? "♪ sound off" : "♪ sound on"}</button>
          <button className="btn" onClick={reset}>↺ start over</button>
        </div>
      </div>

      {/* the recipe */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          {root} {SCALES[scaleId].name} — {formulaOf(scaleId)}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: C.sun, padding: "6px 10px", border: `1.5px solid ${C.sun}`, borderRadius: 4 }}>
            {root}
          </span>
          {steps.map((st, i) => {
            const done = i < doneIdx;
            const now = i === doneIdx;
            return (
              <React.Fragment key={i}>
                <span
                  className="mono"
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "3px 7px",
                    borderRadius: 3,
                    color: done ? C.green : now ? "#fff" : C.muted,
                    background: now ? C.sun : "transparent",
                    border: `1.5px ${now ? "solid" : "dashed"} ${done ? C.green : now ? C.sunDeep : C.line}`,
                  }}
                  title={`${stepLabel(st)} = ${st} fret${st > 1 ? "s" : ""}`}
                >
                  {stepLabel(st)}
                </span>
                <span
                  className="mono"
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    padding: "6px 10px",
                    borderRadius: 4,
                    minWidth: 34,
                    textAlign: "center",
                    color: done ? C.ink : C.muted,
                    border: `1.5px ${done ? "solid" : "dashed"} ${done ? C.green : C.line}`,
                    background: done ? "rgba(70,179,107,.12)" : "transparent",
                  }}
                >
                  {done ? names[(open + walked[i + 1]) % 12] : "?"}
                </span>
              </React.Fragment>
            );
          })}
        </div>

        <div className="mono" style={{ fontSize: 12.5, marginTop: 12, lineHeight: 1.65, minHeight: 38 }}>
          {finished ? (
            <span style={{ color: C.green }}>
              ✓ That's {root} {SCALES[scaleId].name}, built out of nothing but the recipe. On one string the
              formula is literally distance: {steps.filter((s) => s === 2).length} whole steps of two frets and{" "}
              {steps.filter((s) => s === 1).length} half steps of one. Move the whole shape up three frets and
              you have the same scale in a different key — that is all transposition is.
            </span>
          ) : wrong ? (
            <span style={{ color: C.red }}>
              {wrong.gap <= 0
                ? "That one's behind you — the formula only goes up."
                : `That's a ${stepLabel(wrong.gap)} (${wrong.gap} fret${wrong.gap > 1 ? "s" : ""}). The formula asks for ${stepLabel(steps[doneIdx])} — ${steps[doneIdx]} fret${steps[doneIdx] > 1 ? "s" : ""} up from ${names[(open + target[doneIdx]) % 12]}, fret ${target[doneIdx]}.`}
            </span>
          ) : (
            <span style={{ color: C.muted }}>
              Next step: <b style={{ color: C.sun }}>{stepLabel(steps[doneIdx])}</b> — move{" "}
              {steps[doneIdx]} fret{steps[doneIdx] > 1 ? "s" : ""} up from fret {target[doneIdx]} and tap it.
            </span>
          )}
        </div>
      </div>

      {/* one string of the neck */}
      <div style={{ marginTop: 16 }}>
        <Neck
          root={root}
          frets={FRETS}
          stringGauge
          inlays="double"
          onTap={(midi, { s, f }) => { if (s === string) tap(f); }}
          resolve={(pc, semis, { s, f, names: nm }) => {
            if (s !== string) return null;
            const at = walked.indexOf(f);
            const isRoot = f === target[0];
            const isWrong = wrong && wrong.fret === f;
            if (at >= 0) {
              return {
                label: DEG[(pc - noteNameToPc(root) + 12) % 12],
                bg: isRoot ? C.sun : C.green,
                br: isRoot ? C.sunDeep : "#2C7E48",
                tx: "#fff",
                size: 22,
                boxShadow: isRoot ? "0 0 0 3px rgba(255,122,46,.32)" : "none",
                title: `${nm[pc]} · fret ${f}`,
              };
            }
            if (isWrong) {
              return { label: nm[pc], bg: C.red, br: "#8E2A1D", tx: "#fff", size: 20, title: "not this one" };
            }
            // Every other fret on this string stays available and unlabelled —
            // being able to pick wrong is what makes it a drill.
            if (f > target[0] && f <= target[target.length - 1] + 1) {
              return { label: "", bg: "transparent", br: C.line, tx: C.muted, dashed: true, opacity: 0.5, size: 14 };
            }
            return null;
          }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- name */

function NameThatScale() {
  const [q, setQ] = useState(null); // { scaleId, root, options }
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState({ asked: 0, right: 0, streak: 0 });
  const [best, setBest] = useState(readBest);
  const [muted, setMuted] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const ask = () => {
    clearTimeout(timer.current);
    const scaleId = pickWeighted("scales.name", NAMEABLE, { avoid: q ? q.scaleId : null });
    const root = ROOTS[Math.floor(Math.random() * ROOTS.length)];
    // Decoys within one note of the answer's size. Same-size-only sounded
    // tidier but left the two pentatonics as a coin flip against each other,
    // and telling minor pentatonic from the blues scale (one note apart) is a
    // more useful thing to be able to do anyway.
    const size = SCALES[scaleId].ints.length;
    const pool = NAMEABLE.filter((id) => id !== scaleId && Math.abs(SCALES[id].ints.length - size) <= 1);
    const decoys = [];
    while (decoys.length < Math.min(3, pool.length)) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if (!decoys.includes(pick)) decoys.push(pick);
    }
    const options = [scaleId, ...decoys].sort(() => Math.random() - 0.5);
    setQ({ scaleId, root, options });
    setPicked(null);
    setScore((s) => ({ ...s, asked: s.asked + 1 }));
    if (!muted) {
      const pc = noteNameToPc(root);
      SCALES[scaleId].ints.forEach((iv, i) => playMidi(52 + pc + iv, i * 0.22, 0.5));
      playMidi(52 + pc + 12, SCALES[scaleId].ints.length * 0.22, 1.2);
    }
  };

  const answer = (id) => {
    if (picked) return;
    setPicked(id);
    record("scales.name", q.scaleId, id === q.scaleId);
    if (id === q.scaleId) {
      const streak = score.streak + 1;
      setScore((s) => ({ ...s, right: s.right + 1, streak: s.streak + 1 }));
      if (streak > best) { setBest(streak); writeBest(streak); }
      timer.current = setTimeout(ask, 2200);
    } else {
      setScore((s) => ({ ...s, streak: 0 }));
    }
  };

  const rootPc = q ? noteNameToPc(q.root) : 0;
  const ints = q ? SCALES[q.scaleId].ints : [];

  return (
    <div>
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div className="mono" style={{ fontSize: 14, fontWeight: 700 }}>
            {q ? (
              <>Which scale is this? <span style={{ color: C.sun }}>root = {q.root}</span></>
            ) : (
              <span style={{ color: C.muted, fontWeight: 400, fontSize: 13 }}>
                Seven notes and a root. Read the gaps, not the letters.
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button className={q ? "btn" : "big"} onClick={ask}>{q ? "↻ next" : "▶ start"}</button>
            <button className="btn" onClick={() => setMuted((m) => !m)} aria-pressed={muted}>{muted ? "♪ off" : "♪ on"}</button>
            <span className="mono" style={{ fontSize: 11, color: C.muted }}>
              {score.right}/{score.asked} · streak {score.streak} · best {best}
            </span>
          </div>
        </div>

        {q && (
          <>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
              {q.options.map((id) => {
                const right = picked && id === q.scaleId;
                const wrong = picked === id && id !== q.scaleId;
                return (
                  <button
                    key={id}
                    className="opt"
                    onClick={() => answer(id)}
                    disabled={!!picked}
                    style={{
                      borderColor: right ? C.green : wrong ? C.red : undefined,
                      color: right ? C.green : wrong ? C.red : undefined,
                    }}
                  >
                    {SCALES[id].name}
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${C.line}` }}>
              <WeakSpots drill="scales.name" tick={score.asked} title="Scales you keep missing" label={(k) => SCALES[k].name} />
            </div>

            <div className="mono" style={{ fontSize: 12.5, marginTop: 10, minHeight: 34, lineHeight: 1.6 }}>
              {picked ? (
                picked === q.scaleId ? (
                  <span style={{ color: C.green }}>
                    ✓ {q.root} {SCALES[q.scaleId].name} — {formulaOf(q.scaleId)}
                  </span>
                ) : (
                  <span style={{ color: C.red }}>
                    That's {formulaOf(picked)}. This one is {formulaOf(q.scaleId)} — {SCALES[q.scaleId].name}.
                  </span>
                )
              ) : (
                <span style={{ color: C.muted }}>The step pattern is the fingerprint: {ints.length} notes, and where the half steps fall decides everything.</span>
              )}
            </div>
          </>
        )}
      </div>

      {q && (
        <div style={{ marginTop: 16 }}>
          <Neck
            root={q.root}
            frets={FRETS}
            stringGauge
            inlays="double"
            resolve={(pc, semis, { names: nm }) => {
              if (!ints.includes(semis)) return null;
              const isRoot = semis === 0;
              return {
                label: picked ? DEG[semis] : isRoot ? "R" : "",
                bg: isRoot ? C.sun : C.blue,
                br: isRoot ? C.sunDeep : "#123F62",
                tx: "#fff",
                root: isRoot,
                boxShadow: isRoot ? "0 0 0 3px rgba(255,122,46,.32)" : "none",
                title: picked ? nm[pc] : "?",
              };
            }}
          />
        </div>
      )}
    </div>
  );
}
