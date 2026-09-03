import React, { useEffect, useMemo, useRef, useState } from "react";
import { ROOTS, CHORDS, KEY_MODES, diatonicChords, noteNameToPc, buildNoteNames } from "../theory/engine.js";
import { voiceLead, totalMotion, distance, inversionOf } from "../theory/voicing.js";
import { C } from "../ui/theme.js";
import { strum } from "../audio/engine.js";
import { useDroneFollow } from "../audio/useDrone.js";

/**
 * VOICE LEADING — the same progression twice, and you watch the difference.
 *
 * Left: every chord in root position, the way everybody plays them first.
 * Right: each chord takes the octave placement nearest the chord before it.
 *
 * The picture does the teaching. In the root-position version all three voices
 * leap at every change. In the nearest version the note the two chords SHARE
 * draws a dead-flat line straight through the change while the others slide by
 * a step or two. Nobody has to define "inversion" — you just see the 3rd end
 * up in the bass and hear that it is still the same chord.
 */

const PRESETS = {
  major: [
    { id: "1645", name: "I–vi–IV–V", degrees: [0, 5, 3, 4], note: "the 50s progression — every chord shares notes with its neighbour" },
    { id: "1564", name: "I–V–vi–IV", degrees: [0, 4, 5, 3], note: "the four chords half of pop is built from" },
    { id: "251", name: "ii–V–I", degrees: [1, 4, 0], note: "the jazz cadence — voice leading is the entire reason it sounds finished" },
    { id: "1451", name: "I–IV–V–I", degrees: [0, 3, 4, 0], note: "the oldest cadence there is" },
  ],
  minor: [
    { id: "i6741", name: "i–♭VI–♭VII–i", degrees: [0, 5, 6, 0], note: "the minor-key rock loop" },
    { id: "i4i5", name: "i–iv–v–i", degrees: [0, 3, 4, 0], note: "natural minor, no leading tone anywhere" },
    { id: "i3674", name: "i–♭III–♭VII–iv", degrees: [0, 2, 6, 3], note: "falling fifths, in the shade" },
  ],
};

const VOICE_COLOR = [C.blue, C.cyan, C.violet, C.sun];

export default function VoiceLeading() {
  const [root, setRoot] = useState("C");
  const [keyMode, setKeyMode] = useState("major");
  const [presetId, setPresetId] = useState("1645");
  const [sevenths, setSevenths] = useState(false);
  const [playing, setPlaying] = useState(null); // null | "root" | "near" | "both"
  const [idx, setIdx] = useState(-1);
  const [stepMs, setStepMs] = useState(1100);
  const [muted, setMuted] = useState(false);
  const timerRef = useRef(null);

  useDroneFollow(root);

  const rootPc = noteNameToPc(root);
  const names = useMemo(() => buildNoteNames(root), [root]);
  const presets = PRESETS[keyMode];
  const preset = presets.find((p) => p.id === presetId) || presets[0];

  // Degrees -> real chords in this key. Sevenths make the common tones even
  // more obvious (a ii7 and a V7 share two notes), which is why the toggle
  // exists at all.
  const chords = useMemo(() => {
    const dia = diatonicChords(rootPc, keyMode, root);
    return preset.degrees.map((d) => {
      const c = dia[d];
      const quality = sevenths ? seventhOf(c.quality) : c.quality;
      return {
        rootPc: c.rootPc,
        quality,
        rn: c.rn,
        label: c.rootName + CHORDS[quality].sym,
      };
    });
  }, [rootPc, keyMode, preset, sevenths, root]);

  const versions = useMemo(
    () => ({
      root: voiceLead(chords, { mode: "root" }),
      near: voiceLead(chords, { mode: "nearest" }),
    }),
    [chords]
  );

  // One shared vertical scale for both panels — the whole comparison is "how
  // far do the notes travel", and two different axes would flatter the loser.
  const span = useMemo(() => {
    const all = [...versions.root, ...versions.near].flatMap((c) => c.midis);
    return { lo: Math.min(...all), hi: Math.max(...all) };
  }, [versions]);

  /* ---------- playback ---------- */
  const stop = () => {
    clearTimeout(timerRef.current);
    setPlaying(null);
    setIdx(-1);
  };
  useEffect(() => () => clearTimeout(timerRef.current), []);
  // A key or progression change under a running playback would leave the
  // playhead pointing at chords that no longer exist.
  useEffect(() => {
    stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, keyMode, presetId, sevenths]);

  const play = (which) => {
    clearTimeout(timerRef.current);
    if (playing === which) return stop();
    setPlaying(which);
    const seq =
      which === "both"
        ? [...versions.root.map((c) => ({ ...c, v: "root" })), ...versions.near.map((c) => ({ ...c, v: "near" }))]
        : versions[which].map((c) => ({ ...c, v: which }));
    let i = 0;
    const tick = () => {
      if (i >= seq.length) return stop();
      const c = seq[i];
      if (!muted) strum(c.midis, { stagger: 0.02, dur: stepMs / 1000 + 0.35 });
      setIdx(which === "both" ? i : i);
      i += 1;
      // A beat of silence between the two versions when playing both, so the
      // second one lands as a comparison rather than a continuation.
      const gap = which === "both" && i === versions.root.length ? stepMs * 1.8 : stepMs;
      timerRef.current = setTimeout(tick, gap);
    };
    tick();
  };

  // Which column is lit in each panel right now.
  const liveIdx = (which) => {
    if (idx < 0) return -1;
    if (playing === "both") {
      const n = versions.root.length;
      return which === "root" ? (idx < n ? idx : -1) : idx >= n ? idx - n : -1;
    }
    return playing === which ? idx : -1;
  };

  const moved = { root: totalMotion(versions.root), near: totalMotion(versions.near) };
  // Name the inversions actually on screen rather than a hardcoded example —
  // they change with every key and progression.
  const inverted = versions.near
    .filter((c) => inversionOf(c.midis, c.rootPc, c.quality) > 0)
    .map((c) => `${c.label}/${names[Math.min(...c.midis) % 12]}`);

  return (
    <div>
      <style>{`
        .vl-grid{ display:flex; gap:16px; flex-wrap:wrap; align-items:stretch; }
        .vl-panel{ flex:1 1 340px; min-width:320px; }
        .vl-dot{ transition: transform .42s cubic-bezier(.4,0,.15,1); }
        .vl-num{ font-family: ui-monospace, monospace; font-size: 26px; font-weight: 700; }
      `}</style>

      {/* ---- setup ---- */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Key</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {ROOTS.map((r) => (
              <button key={r} className={"chip" + (r === root ? " on" : "")} onClick={() => setRoot(r)}>{r}</button>
            ))}
            <span style={{ width: 10 }} />
            {Object.entries(KEY_MODES).map(([id, m]) => (
              <button
                key={id}
                className={"btn" + (keyMode === id ? " on" : "")}
                onClick={() => { setKeyMode(id); setPresetId(PRESETS[id][0].id); }}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Progression</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {presets.map((p) => (
              <button key={p.id} className={"btn" + (presetId === p.id ? " on" : "")} onClick={() => setPresetId(p.id)}>{p.name}</button>
            ))}
            <span style={{ width: 10 }} />
            <button className={"btn" + (sevenths ? " on" : "")} onClick={() => setSevenths((v) => !v)} aria-pressed={sevenths} title="Four voices instead of three — more shared notes, even less movement">
              7ths
            </button>
            <button className="btn" onClick={() => setMuted((m) => !m)} aria-pressed={muted}>{muted ? "♪ sound off" : "♪ sound on"}</button>
            <label className="mono" style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 6 }}>
              tempo
              <input type="range" min="600" max="2200" step="100" value={stepMs} onChange={(e) => setStepMs(Number(e.target.value))} />
            </label>
            <button className={"btn" + (playing === "both" ? " on" : "")} onClick={() => play("both")} title="Root position first, then the same chords voiced nearest — back to back">
              {playing === "both" ? "■ stop" : "▶ both, back to back"}
            </button>
          </div>
          <div className="mono" style={{ fontSize: 11, color: C.muted, marginTop: 7 }}>
            {preset.note} · {chords.map((c) => c.label).join(" – ")}
          </div>
        </div>
      </div>

      {/* ---- the two versions ---- */}
      <div className="vl-grid" style={{ marginTop: 18 }}>
        <Panel
          title="Root position everywhere"
          sub="what everybody plays first"
          accent={C.red}
          voiced={versions.root}
          span={span}
          live={liveIdx("root")}
          names={names}
          total={moved.root}
          onPlay={() => play("root")}
          playing={playing === "root"}
        />
        <Panel
          title="Nearest voicing"
          sub="each chord takes the closest placement to the last"
          accent={C.cyan}
          voiced={versions.near}
          span={span}
          live={liveIdx("near")}
          names={names}
          total={moved.near}
          onPlay={() => play("near")}
          playing={playing === "near"}
        />
      </div>

      {/* ---- the readout ---- */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16 }}>
        <div className="card" style={{ flex: "1 1 300px", minWidth: 280 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Total movement — every voice, added up</div>
          <div style={{ display: "flex", gap: 22, alignItems: "baseline", flexWrap: "wrap" }}>
            <div>
              <div className="vl-num" style={{ color: C.red }}>{moved.root}</div>
              <div className="mono" style={{ fontSize: 10.5, color: C.muted }}>semitones · root position</div>
            </div>
            <div>
              <div className="vl-num" style={{ color: C.cyan }}>{moved.near}</div>
              <div className="mono" style={{ fontSize: 10.5, color: C.muted }}>semitones · nearest</div>
            </div>
            <div style={{ flex: "1 1 120px" }}>
              <div className="mono" style={{ fontSize: 12, color: C.ink, lineHeight: 1.6 }}>
                Same chords. Same notes. {moved.root > 0 ? Math.round((1 - moved.near / moved.root) * 100) : 0}% less hand travel — and a
                held common tone your ear reads as the progression staying in one place while the harmony moves underneath it.
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ flex: "1 1 300px", minWidth: 280, background: "rgba(62,155,214,.10)" }}>
          <div className="eyebrow" style={{ marginBottom: 8, color: C.blue }}>The "why"</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.65 }}>
            A chord is a set of notes, not a shape. Which octave each note sits in is a
            separate decision — and that decision is what an <b>inversion</b> is. Look at the
            right-hand panel: the flat orange lines are notes the two chords share, held
            still{inverted.length > 0 && (
              <>, and the chords that ended up with something other than their root in the bass —{" "}
                <b>{inverted.join(", ")}</b> — are the inversions</>
            )}. You never had to memorise a new shape; the notes just stayed where they
            already were.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================ one version ============================ */

function Panel({ title, sub, accent, voiced, span, live, names, total, onPlay, playing }) {
  const n = voiced.length;
  const colW = 88;
  const padX = 52;
  const H = 250;
  const padY = 30;
  const W = padX * 2 + (n - 1) * colW;
  const range = Math.max(1, span.hi - span.lo);
  const y = (m) => padY + (span.hi - m) * ((H - padY * 2) / range);
  const x = (i) => padX + i * colW;
  const voices = Math.max(...voiced.map((c) => c.midis.length));

  return (
    <div className="vl-panel card" style={{ padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: accent }}>{title}</div>
          <div className="mono" style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>{sub}</div>
        </div>
        <button className={"btn" + (playing ? " on" : "")} onClick={onPlay} style={{ whiteSpace: "nowrap" }}>
          {playing ? "■ stop" : "▶ hear it"}
        </button>
      </div>

      <div style={{ overflowX: "auto", marginTop: 6 }}>
        <svg width={W} height={H + 34} role="img" aria-label={`${title}: ${total} semitones of movement`}>
          {/* the column each chord lives in */}
          {voiced.map((c, i) => (
            <g key={"c" + i}>
              <line x1={x(i)} y1={padY - 14} x2={x(i)} y2={H - padY + 14} stroke={i === live ? accent : C.line} strokeWidth={i === live ? 1.5 : 1} opacity={i === live ? 0.7 : 0.35} />
              <text x={x(i)} y={H + 6} textAnchor="middle" fontSize="12" fontWeight="700" fill={i === live ? accent : C.ink} style={{ fontFamily: "ui-monospace, monospace" }}>
                {c.label}
              </text>
              <text x={x(i)} y={H + 20} textAnchor="middle" fontSize="9" fill={C.muted} style={{ fontFamily: "ui-monospace, monospace" }}>
                {inversionLabel(c, names)}
              </text>
              {i > 0 && (
                <text x={(x(i) + x(i - 1)) / 2} y={H + 20} textAnchor="middle" fontSize="9" fill={C.muted} style={{ fontFamily: "ui-monospace, monospace" }}>
                  {distance(voiced[i - 1].midis, c.midis)}
                </text>
              )}
            </g>
          ))}

          {/* one line per voice — this is the whole lesson */}
          {Array.from({ length: voices }, (_, v) =>
            voiced.slice(0, -1).map((c, i) => {
              const a = [...c.midis].sort((p, q) => p - q)[v];
              const b = [...voiced[i + 1].midis].sort((p, q) => p - q)[v];
              if (a == null || b == null) return null;
              const held = a === b;
              return (
                <line
                  key={`v${v}-${i}`}
                  x1={x(i)}
                  y1={y(a)}
                  x2={x(i + 1)}
                  y2={y(b)}
                  stroke={held ? C.sun : VOICE_COLOR[v % VOICE_COLOR.length]}
                  strokeWidth={held ? 3.5 : 1.6}
                  opacity={held ? 0.95 : 0.55}
                  strokeDasharray={held ? undefined : Math.abs(b - a) > 4 ? "4 3" : undefined}
                />
              );
            })
          )}

          {/* every note of every chord */}
          {voiced.map((c, i) =>
            [...c.midis].sort((p, q) => p - q).map((m, v) => (
              <g key={`n${i}-${v}`}>
                <circle
                  cx={x(i)}
                  cy={y(m)}
                  r={i === live ? 11 : 8}
                  fill={i === live ? VOICE_COLOR[v % VOICE_COLOR.length] : "var(--surface)"}
                  stroke={VOICE_COLOR[v % VOICE_COLOR.length]}
                  strokeWidth="2"
                  style={{ transition: "r .2s, fill .2s" }}
                />
                <text
                  x={x(i)}
                  y={y(m) + 3.5}
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="700"
                  fill={i === live ? "#fff" : C.ink}
                  style={{ fontFamily: "ui-monospace, monospace", pointerEvents: "none" }}
                >
                  {names[m % 12]}
                </text>
              </g>
            ))
          )}

          {/* the moving voices — they slide when the playhead advances, which
              is the moment the whole idea lands */}
          {live >= 0 &&
            [...voiced[live].midis].sort((p, q) => p - q).map((m, v) => (
              <circle
                key={"live" + v}
                className="vl-dot"
                r="14"
                fill="none"
                stroke={C.sun}
                strokeWidth="2"
                opacity="0.85"
                style={{ transform: `translate(${x(live)}px, ${y(m)}px)` }}
              />
            ))}
        </svg>
      </div>

      <div className="mono" style={{ fontSize: 11, color: C.muted, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
        <span>numbers between columns = semitones moved</span>
        <span style={{ color: accent, fontWeight: 700 }}>{total} total</span>
      </div>
    </div>
  );
}

/* ============================ helpers ============================ */

const SEVENTH_OF = { maj: "maj7", min: "min7", dim: "m7b5" };
const seventhOf = (q) => SEVENTH_OF[q] || q;

function inversionLabel(c, names) {
  const inv = inversionOf(c.midis, c.rootPc, c.quality);
  if (inv <= 0) return "root position";
  const bass = names[Math.min(...c.midis) % 12];
  return `${c.label}/${bass} · ${["", "1st", "2nd", "3rd"][inv] || inv + "th"} inv`;
}
