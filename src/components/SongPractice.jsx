import React, { useEffect, useMemo, useRef, useState } from "react";
import { ROOTS, DEG, INTERVALS, SCALES, OPEN_MIDI, midiToFreq, noteNameToPc, buildNoteNames } from "../theory/engine.js";

/**
 * SONG PRACTICE — offline, local song library in the Fretboard Decoder style.
 * Each song stores a key + a base soloing scale; the neck lights those notes,
 * and a "vocabulary" panel lets you toggle the IN-BETWEEN notes (blue notes,
 * passing tones, mode colours) so you can expand your solo lines.
 *
 * NEW: songs can be split into SECTIONS (intro / chorus / solo …), each with
 * its own root, scale and box position. Two views, toggled top-right:
 *   ▦ tabs  — section chips, one big neck re-lights per section
 *   ▤ stack — one mini neck per section, all visible at once
 * All data lives in localStorage — works fully offline, import/export JSON.
 */

const C = {
  paper: "#000000", ink: "#DCE6EC", blue: "#3E9BD6", cyan: "#36C7E0", sun: "#FF7A2E",
  sunDeep: "#E0601B", line: "#3A4853", red: "#E0533F", green: "#3FB68B", violet: "#B58CFF",
  muted: "#7C8A95", grid: "rgba(120,150,170,0.10)",
};

const RAINBOW = {
  1: { bg: "#E0533F", tx: "#fff", br: "#8E2A1D" }, 2: { bg: "#FF7A2E", tx: "#2A1300", br: "#C85A18" },
  3: { bg: "#E8C84A", tx: "#2A2300", br: "#B59A1E" }, 4: { bg: "#46B36B", tx: "#04220F", br: "#2C7E48" },
  5: { bg: "#3E9BD6", tx: "#04202E", br: "#1F6FA0" }, 6: { bg: "#6C7BE0", tx: "#0A0E2A", br: "#3F4DB0" },
  7: { bg: "#B58CFF", tx: "#1A1030", br: "#7A52C7" },
};
const degBase = (label) => { const m = String(label).match(/[1-7]/); return m ? Number(m[0]) : null; };
const FRETS = 24;

// Friendly base-scale choices for songs.
const SOLO_SCALES = ["minorPent", "majorPent", "aeolian", "major", "dorian", "mixolydian"];
const MINORISH = new Set(["minorPent", "aeolian", "dorian", "phrygian"]);

// Tips for the "in-between" (non-scale) notes, by semitone-from-root.
const TIP_MINOR = { 1: "♭2 — Phrygian spice (sparingly)", 2: "2 / 9 — smooth melodic add", 4: "♮3 — major-3rd, bluesy lift", 6: "♭5 — the BLUE note", 8: "♭6 — dark Aeolian colour", 9: "6 — bright Dorian colour", 11: "♮7 — leading tone → root" };
const TIP_MAJOR = { 1: "♭2 — outside colour", 3: "♭3 — the BLUE note (minor over major)", 5: "4 — completes the major scale", 6: "♭5 / ♯4 — blue / Lydian", 8: "♭6 — borrowed-minor colour", 10: "♭7 — Mixolydian / dominant" };

const SEED = [
  {
    id: "s1", title: "Stairway to Heaven", artist: "Led Zeppelin", root: "A", minor: true, scaleId: "minorPent", extras: [2, 9],
    sections: [
      { id: "s1a", name: "Intro", root: "A", scaleId: "aeolian", pos: 0 },
      { id: "s1b", name: "Verse", root: "A", scaleId: "minorPent", pos: 5 },
      { id: "s1c", name: "Solo", root: "A", scaleId: "minorPent", pos: 5 },
      { id: "s1d", name: "Outro", root: "A", scaleId: "minorPent", pos: 12 },
    ],
  },
  {
    id: "s2", title: "Sweet Child o' Mine", artist: "Guns N' Roses", root: "D", minor: false, scaleId: "majorPent", extras: [],
    sections: [
      { id: "s2a", name: "Intro riff", root: "D", scaleId: "majorPent", pos: 12 },
      { id: "s2b", name: "Verse", root: "D", scaleId: "majorPent", pos: 2 },
      { id: "s2c", name: "Solo", root: "E", scaleId: "minorPent", pos: 12 },
    ],
  },
  { id: "s3", title: "Sultans of Swing", artist: "Dire Straits", root: "D", minor: true, scaleId: "minorPent", extras: [6] },
  { id: "s4", title: "Good News", artist: "Mac Miller", root: "Db", minor: true, scaleId: "minorPent", extras: [2, 9] },
  { id: "s5", title: "Hand Me Downs", artist: "Mac Miller", root: "D", minor: false, scaleId: "majorPent", extras: [] },
  { id: "s6", title: "Surf", artist: "Mac Miller", root: "Db", minor: true, scaleId: "minorPent", extras: [2, 9] },
  { id: "s7", title: "Knockin' on Heaven's Door", artist: "Guns N' Roses", root: "G", minor: false, scaleId: "majorPent", extras: [3, 10] },
];

const load = () => {
  let saved = null;
  try { const v = JSON.parse(localStorage.getItem("songs.v1")); if (Array.isArray(v) && v.length) saved = v; } catch {}
  if (!saved) return SEED;
  // enrich saved seed songs with newly-seeded sections (only if the user hasn't made any)
  saved = saved.map((s) => {
    const seed = SEED.find((x) => x.id === s.id);
    return seed?.sections && !s.sections ? { ...s, sections: seed.sections } : s;
  });
  const ids = new Set(saved.map((s) => s.id));
  return [...saved, ...SEED.filter((s) => !ids.has(s.id))]; // add any new seed songs
};
const save = (list) => { try { localStorage.setItem("songs.v1", JSON.stringify(list)); } catch {} };
const yt = (q) => "https://www.youtube.com/results?search_query=" + encodeURIComponent(q);
const newId = () => Math.random().toString(36).slice(2, 7);

// Every song exposes sections; songs without explicit ones get a virtual "whole song".
const sectionsOf = (song) =>
  song.sections?.length ? song.sections : [{ id: "__whole", name: "Whole song", root: song.root, scaleId: song.scaleId, pos: null, virtual: true }];

/* ---------- reusable neck (big + mini) ---------- */
function Neck({ sec, extras, rainbow, boxOn, boxStart, mini, tone, dim }) {
  const rootPc = noteNameToPc(sec.root);
  const names = useMemo(() => buildNoteNames(sec.root), [sec.root]);
  const baseSet = new Set(SCALES[sec.scaleId].ints);
  const rows = [...OPEN_MIDI].reverse();
  const openW = mini ? 30 : 40, fretW = mini ? 27 : 42, rowH = mini ? 20 : 30;
  const neckW = openW + FRETS * fretW, neckH = 6 * rowH;
  const noteX = (f) => (f === 0 ? openW / 2 : openW + (f - 0.5) * fretW);
  const noteY = (r) => (r + 0.5) * rowH;
  const inlays = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
  const pos = sec.pos ?? null;

  return (
    <div style={{ overflowX: "auto", paddingBottom: 6, opacity: dim ? 0.55 : 1, transition: "opacity .2s" }}>
      <div style={{ minWidth: neckW + (mini ? 40 : 56) }}>
        <div style={{ position: "relative", height: mini ? 12 : 16, marginLeft: mini ? 36 : 50 }}>
          {Array.from({ length: FRETS + 1 }, (_, f) => (
            <div key={f} className="song-mono" style={{ position: "absolute", left: noteX(f) - 8, width: 16, textAlign: "center", fontSize: mini ? 8 : 10, color: f !== 0 && f % 12 === 0 ? C.sun : C.muted }}>{f}</div>
          ))}
        </div>
        <div style={{ display: "flex" }}>
          <div style={{ width: mini ? 36 : 50, position: "relative", height: neckH }}>
            {rows.map((m, r) => (
              <div key={r} className="song-mono" style={{ position: "absolute", top: noteY(r) - (mini ? 6 : 8), right: mini ? 5 : 8, fontSize: mini ? 9 : 12, fontWeight: 700 }}>{names[m % 12]}</div>
            ))}
          </div>
          <div style={{ position: "relative", width: neckW, height: neckH, background: "linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.012))", border: `1.5px solid ${C.ink}`, borderLeft: "none" }}>
            <div style={{ position: "absolute", left: openW, top: 0, width: mini ? 2 : 3, height: neckH, background: C.ink }} />
            {Array.from({ length: FRETS }, (_, i) => i + 1).map((f) => (
              <div key={f} style={{ position: "absolute", left: openW + f * fretW, top: 0, width: f % 12 === 0 ? 2 : 1, height: neckH, background: f % 12 === 0 ? C.cyan : C.line }} />
            ))}
            {rows.map((_, r) => (<div key={r} style={{ position: "absolute", left: openW, right: 0, top: noteY(r), height: 1, background: C.line, opacity: 0.7 }} />))}
            {inlays.filter((d) => d <= FRETS).map((d) => (
              <div key={d} style={{ position: "absolute", left: noteX(d) - 4, top: neckH / 2 - 4, width: 8, height: 8, borderRadius: 999, border: `1.5px solid ${d % 12 === 0 ? C.cyan : C.line}`, opacity: 0.6 }} />
            ))}
            {/* section's home box (sun, dashed) */}
            {pos != null && (
              <div style={{ position: "absolute", top: 0, height: neckH, zIndex: 1, pointerEvents: "none",
                left: pos === 0 ? 0 : openW + (pos - 1) * fretW,
                width: (openW + (pos + 4) * fretW) - (pos === 0 ? 0 : openW + (pos - 1) * fretW),
                background: "rgba(255,122,46,0.07)", border: `1px dashed ${C.sun}`, borderRadius: 4 }} />
            )}
            {/* manual practice box (grey, dashed) */}
            {boxOn && (
              <div style={{ position: "absolute", top: 0, height: neckH, zIndex: 1, pointerEvents: "none",
                left: boxStart === 0 ? 0 : openW + (boxStart - 1) * fretW,
                width: (openW + (boxStart + 4) * fretW) - (boxStart === 0 ? 0 : openW + (boxStart - 1) * fretW),
                background: "rgba(255,255,255,0.05)", border: `1px dashed ${C.muted}`, borderRadius: 4 }} />
            )}
            {rows.map((open, r) =>
              Array.from({ length: FRETS + 1 }, (_, f) => {
                const pc = (open + f) % 12;
                const semis = (pc - rootPc + 12) % 12;
                const inScale = baseSet.has(semis);
                const isExtra = extras.has(semis);
                if (!inScale && !isExtra) return null;
                if (boxOn && !(f >= boxStart && f <= boxStart + 4)) return null;
                const label = DEG[semis];
                const isRoot = semis === 0;
                const size = mini ? (isRoot ? 16 : 14) : (isRoot ? 23 : 21);
                let style;
                if (isExtra && !inScale) {
                  style = { background: "rgba(181,140,255,.16)", color: C.violet, border: `2px dashed ${C.violet}` };
                } else if (rainbow) {
                  const rb = RAINBOW[degBase(label)] || RAINBOW[1];
                  style = { background: rb.bg, color: rb.tx, border: `2px solid ${rb.br}` };
                } else {
                  const role = isRoot ? { bg: C.sun, br: C.sunDeep, tx: "#fff" } : (semis === 3 || semis === 4 ? { bg: C.cyan, br: "#1F7E96", tx: "#06222B" } : { bg: C.blue, br: "#123F62", tx: "#EAF2F7" });
                  style = { background: role.bg, color: role.tx, border: `2px solid ${role.br}` };
                }
                return (
                  <button key={r + "-" + f} className="song-node" onClick={() => tone(midiToFreq(open + f))}
                    title={`${names[pc]} · ${label}${isExtra && !inScale ? " (added)" : ""}`}
                    style={{ position: "absolute", left: noteX(f) - size / 2, top: noteY(r) - size / 2, width: size, height: size, fontSize: mini ? 8 : 10,
                      boxShadow: isRoot && !mini ? `0 0 0 3px rgba(255,122,46,.3)` : "none", zIndex: 2, ...style }}>
                    {label}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SongPractice() {
  const [songs, setSongs] = useState(load);
  const [selId, setSelId] = useState(() => {
    try { const req = localStorage.getItem("songs.sel"); if (req) { localStorage.removeItem("songs.sel"); return req; } } catch {}
    return null;
  });
  const [secId, setSecId] = useState(null);
  const [view, setView] = useState("tabs"); // "tabs" | "stack"
  const [adding, setAdding] = useState(false);
  const [editSec, setEditSec] = useState(false);
  const [showData, setShowData] = useState(false);
  const [dataText, setDataText] = useState("");
  const [rainbow, setRainbow] = useState(false);
  const [boxOn, setBoxOn] = useState(false);
  const [boxStart, setBoxStart] = useState(0);
  const [muted, setMuted] = useState(false);
  const [form, setForm] = useState({ title: "", artist: "", root: "A", minor: true, scaleId: "minorPent" });
  const audioRef = useRef(null);

  const song = songs.find((s) => s.id === selId) || songs[0] || null;
  const persist = (list) => { setSongs(list); save(list); };
  const patchSong = (patch) => persist(songs.map((x) => (x.id === song.id ? { ...x, ...patch } : x)));

  const sections = song ? sectionsOf(song) : [];
  const sec = sections.find((s) => s.id === secId) || sections[0] || null;
  useEffect(() => { setSecId(null); setEditSec(false); }, [song?.id]);

  const secMinor = sec ? MINORISH.has(sec.scaleId) : true;
  const baseSet = new Set(sec ? SCALES[sec.scaleId].ints : []);
  const extras = new Set(song?.extras || []);
  const tips = secMinor ? TIP_MINOR : TIP_MAJOR;

  // candidate in-between notes = chromatic degrees not in the active section's scale
  const candidates = [];
  for (let s = 1; s < 12; s++) if (!baseSet.has(s)) candidates.push(s);

  /* audio */
  const tone = (freq) => {
    if (muted) return;
    try {
      if (!audioRef.current) audioRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioRef.current; if (ctx.state === "suspended") ctx.resume();
      const t0 = ctx.currentTime, o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), g2 = ctx.createGain();
      o.type = "triangle"; o.frequency.value = freq; o2.type = "sine"; o2.frequency.value = freq * 2; g2.gain.value = 0.25;
      o2.connect(g2); g2.connect(g); o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.24, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.0);
      o.start(t0); o2.start(t0); o.stop(t0 + 1.05); o2.stop(t0 + 1.05);
    } catch (e) {}
  };

  const toggleExtra = (s) => {
    if (!song) return;
    const cur = new Set(song.extras || []);
    cur.has(s) ? cur.delete(s) : cur.add(s);
    patchSong({ extras: [...cur].sort((a, b) => a - b) });
  };

  /* section editing */
  const realSections = song?.sections || [];
  const patchSection = (id, patch) => patchSong({ sections: realSections.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const addSection = () => {
    const base = realSections[realSections.length - 1] || { root: song.root, scaleId: song.scaleId, pos: null };
    const s = { id: newId(), name: "Section", root: base.root, scaleId: base.scaleId, pos: base.pos };
    patchSong({ sections: [...realSections, s] }); setSecId(s.id);
  };
  const delSection = (id) => { const list = realSections.filter((s) => s.id !== id); patchSong({ sections: list.length ? list : undefined }); if (secId === id) setSecId(null); };
  const splitIntoSections = () => {
    const mk = (name) => ({ id: newId(), name, root: song.root, scaleId: song.scaleId, pos: null });
    patchSong({ sections: [mk("Intro"), mk("Verse"), mk("Chorus"), mk("Solo")] });
    setEditSec(true);
  };

  const addSong = () => {
    if (!form.title.trim()) return;
    const s = { id: "u" + Date.now(), title: form.title.trim(), artist: form.artist.trim(), root: form.root, minor: form.minor, scaleId: form.scaleId, extras: [] };
    persist([...songs, s]); setSelId(s.id); setAdding(false);
    setForm({ title: "", artist: "", root: "A", minor: true, scaleId: "minorPent" });
  };
  const delSong = (id) => { const list = songs.filter((s) => s.id !== id); persist(list); if (selId === id) setSelId(list[0]?.id || null); };
  const doExport = () => { setShowData(true); setDataText(JSON.stringify(songs, null, 2)); };
  const doImport = () => { try { const v = JSON.parse(dataText); if (Array.isArray(v)) { persist(v); setSelId(v[0]?.id || null); setShowData(false); } } catch { alert("Invalid JSON"); } };

  return (
    <div className="song-root">
      <style>{`
        .song-root{ --ink:${C.ink};--muted:${C.muted};--line:${C.line};
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--ink);
          background: linear-gradient(${C.grid} 1px, transparent 1px), linear-gradient(90deg, ${C.grid} 1px, transparent 1px), ${C.paper};
          background-size: 24px 24px, 24px 24px; padding: 22px; border-radius: 8px; box-shadow: inset 0 0 0 1.5px rgba(220,230,236,0.16); }
        .song-mono{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, "Courier New", monospace; }
        .song-title{ font-family: ui-monospace, monospace; font-size: 26px; font-weight: 700; letter-spacing: 1px; margin: 0; }
        .song-sub{ font-family: ui-monospace, monospace; font-size: 12.5px; color: var(--muted); margin: 4px 0 0; }
        .song-eyebrow{ font-family: ui-monospace, monospace; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: var(--muted); }
        .song-btn{ font-family: ui-monospace, monospace; font-size: 12px; padding: 7px 11px; border-radius: 3px; cursor: pointer;
          border:1.5px solid var(--line); background: rgba(255,255,255,.05); color: var(--ink); transition: all .12s; }
        .song-btn:hover{ border-color: var(--ink); }
        .song-btn.on{ background: var(--ink); color: ${C.paper}; border-color: var(--ink); }
        .song-chip{ font-family: ui-monospace, monospace; font-size: 12px; padding: 7px 10px; border-radius:4px; cursor:pointer;
          border:1.5px solid var(--line); background: rgba(255,255,255,.04); color: var(--ink); transition: all .12s; }
        .song-chip:hover{ border-color: var(--ink); }
        .song-chip.on{ background: ${C.sun}; border-color:${C.sunDeep}; color:#fff; }
        .song-sec{ font-family: ui-monospace, monospace; font-size: 11.5px; padding: 6px 10px; border-radius:4px; cursor:pointer;
          border:1.5px solid var(--line); background: rgba(255,255,255,.04); color: var(--ink); transition: all .12s; }
        .song-sec:hover{ border-color: var(--ink); }
        .song-sec.on{ border-color:${C.sun}; color:${C.sun}; background: rgba(255,122,46,.12); }
        .song-node{ display:flex; align-items:center; justify-content:center; font-family: ui-monospace, monospace; font-weight:700;
          cursor:pointer; border-radius:999px; transition: transform .1s, background-color .3s, border-color .3s, color .3s; user-select:none; }
        .song-node:hover{ transform: scale(1.12); }
        .song-in{ font-family: ui-monospace, monospace; font-size:12px; padding:7px 9px; border-radius:3px; border:1.5px solid var(--line); background:#0b0b0b; color:var(--ink); }
        .song-card{ border:1.5px solid var(--ink); background: rgba(255,255,255,.04); border-radius:4px; padding:14px 16px; }
        .song-spice{ font-family: ui-monospace, monospace; font-size:11.5px; padding:8px 10px; border-radius:4px; cursor:pointer;
          border:1.5px dashed ${C.violet}; background: rgba(181,140,255,.08); color: var(--ink); transition: all .12s; text-align:left; }
        .song-spice.on{ background: ${C.violet}; color:#1A1030; border-style: solid; }
      `}</style>

      <div className="song-eyebrow">Guitar Theory Coach · Practice</div>
      <h1 className="song-title">SONG PRACTICE</h1>
      <p className="song-sub">Your songs, split into sections — each part's key lit on the neck, plus the in-between notes to grow your solo vocabulary. Offline & editable.</p>

      {/* song selector */}
      <div style={{ marginTop: 16 }}>
        <div className="song-eyebrow" style={{ marginBottom: 6 }}>Songs (saved in your browser)</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {songs.map((s) => (
            <button key={s.id} className={"song-chip" + (s.id === (song?.id) ? " on" : "")} onClick={() => setSelId(s.id)}>
              {s.title} <span style={{ opacity: 0.7, fontSize: 10 }}>{s.root}{s.minor ? "m" : ""}</span>
            </button>
          ))}
          <button className="song-btn" onClick={() => setAdding((v) => !v)}>+ add</button>
          <button className="song-btn" onClick={doExport}>⤓ data</button>
        </div>
      </div>

      {adding && (
        <div className="song-card" style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input className="song-in" placeholder="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input className="song-in" placeholder="artist" value={form.artist} onChange={(e) => setForm({ ...form, artist: e.target.value })} />
          <select className="song-in" value={form.root} onChange={(e) => setForm({ ...form, root: e.target.value })}>
            {ROOTS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select className="song-in" value={form.minor ? "m" : "M"} onChange={(e) => setForm({ ...form, minor: e.target.value === "m" })}>
            <option value="M">major</option><option value="m">minor</option>
          </select>
          <select className="song-in" value={form.scaleId} onChange={(e) => setForm({ ...form, scaleId: e.target.value })}>
            {SOLO_SCALES.map((id) => <option key={id} value={id}>{SCALES[id].name}</option>)}
          </select>
          <button className="song-btn on" onClick={addSong}>save song</button>
        </div>
      )}

      {showData && (
        <div className="song-card" style={{ marginTop: 12 }}>
          <div className="song-eyebrow" style={{ marginBottom: 6 }}>Song data (JSON) — copy to back up, or paste AI-generated songs and Import</div>
          <textarea className="song-in" style={{ width: "100%", minHeight: 120, whiteSpace: "pre" }} value={dataText} onChange={(e) => setDataText(e.target.value)} />
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <button className="song-btn on" onClick={doImport}>Import (replace all)</button>
            <button className="song-btn" onClick={() => setShowData(false)}>close</button>
            <span className="song-mono" style={{ fontSize: 10.5, color: C.muted, alignSelf: "center" }}>
              shape: {'{'} title, artist, root:"A", minor:true, scaleId:"minorPent", extras:[6], sections:[{'{'} name, root, scaleId, pos {'}'}] {'}'}
            </span>
          </div>
        </div>
      )}

      {!song ? (
        <div className="song-card" style={{ marginTop: 16, color: C.muted }} >No song selected — add one above.</div>
      ) : (
        <>
          {/* song header + controls */}
          <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div className="song-mono" style={{ fontSize: 16, fontWeight: 700 }}>
              {song.title} <span style={{ color: C.muted, fontWeight: 400 }}>— {song.artist}</span>
            </div>
            {sec && (
              <span className="song-mono" style={{ fontSize: 13, padding: "3px 9px", border: `1.5px solid ${C.sun}`, color: C.sun, borderRadius: 3 }}>
                {sec.virtual ? "" : sec.name + " · "}{sec.root} {SCALES[sec.scaleId].name}
              </span>
            )}
            <a className="song-btn" href={yt(`${sec ? sec.root : song.root} ${secMinor ? "minor" : "major"} backing track`)} target="_blank" rel="noopener noreferrer">▶ backing track</a>
            <div style={{ flex: 1 }} />
            <button className={"song-btn" + (view === "stack" ? " on" : "")} onClick={() => setView((v) => (v === "stack" ? "tabs" : "stack"))} title="Toggle: one neck with section tabs ↔ all sections stacked">
              {view === "stack" ? "▤ stack" : "▦ tabs"}
            </button>
            <button className={"song-btn" + (rainbow ? " on" : "")} onClick={() => setRainbow((v) => !v)} title="Colour degrees 1-7 (root = red)">🌈</button>
            <button className={"song-btn" + (boxOn ? " on" : "")} onClick={() => setBoxOn((v) => !v)} title="Lock to one 5-fret box">▢ box</button>
            {boxOn && <input type="range" min="0" max={FRETS - 4} value={boxStart} onChange={(e) => setBoxStart(Number(e.target.value))} />}
            <button className="song-btn" onClick={() => setMuted((m) => !m)}>{muted ? "♪ off" : "♪ on"}</button>
            <button className="song-btn" onClick={() => delSong(song.id)} title="Delete this song" style={{ borderColor: C.red, color: C.red }}>✕</button>
          </div>

          {/* section chips + editor toggle */}
          <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span className="song-eyebrow" style={{ marginRight: 4 }}>Sections</span>
            {sections.map((s) => (
              <button key={s.id} className={"song-sec" + (sec?.id === s.id ? " on" : "")} onClick={() => setSecId(s.id)}
                title={`${s.root} ${SCALES[s.scaleId].name}${s.pos != null ? ` · box ${s.pos}` : ""}`}>
                {s.name} <span style={{ opacity: 0.75, fontSize: 9.5 }}>{s.root}</span>
              </button>
            ))}
            {realSections.length ? (
              <button className={"song-btn" + (editSec ? " on" : "")} style={{ padding: "5px 9px", fontSize: 11 }} onClick={() => setEditSec((v) => !v)}>✎ edit</button>
            ) : (
              <button className="song-btn" style={{ padding: "5px 9px", fontSize: 11 }} onClick={splitIntoSections} title="Split this song into intro / verse / chorus / solo sections">＋ split into sections</button>
            )}
          </div>

          {editSec && realSections.length > 0 && (
            <div className="song-card" style={{ marginTop: 10 }}>
              <div className="song-mono" style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Each section has its own root, scale, and (optional) home box on the neck. Box −1 = none.</div>
              {realSections.map((s) => (
                <div key={s.id} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", padding: "6px 0", borderTop: `1px dashed ${C.grid}` }}>
                  <input className="song-in" style={{ width: 110 }} value={s.name} onChange={(e) => patchSection(s.id, { name: e.target.value })} />
                  <select className="song-in" value={s.root} onChange={(e) => patchSection(s.id, { root: e.target.value })}>{ROOTS.map((r) => <option key={r} value={r}>{r}</option>)}</select>
                  <select className="song-in" value={s.scaleId} onChange={(e) => patchSection(s.id, { scaleId: e.target.value })}>{SOLO_SCALES.map((id) => <option key={id} value={id}>{SCALES[id].name}</option>)}</select>
                  <label className="song-mono" style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 4 }}>
                    box<input type="number" min="-1" max={FRETS - 4} className="song-in" style={{ width: 56 }} value={s.pos ?? -1}
                      onChange={(e) => { const v = Number(e.target.value); patchSection(s.id, { pos: v < 0 ? null : v }); }} />
                  </label>
                  <button className="song-btn" onClick={() => delSection(s.id)} style={{ padding: "5px 7px", borderColor: C.red, color: C.red }}>✕</button>
                </div>
              ))}
              <button className="song-btn" onClick={addSection} style={{ marginTop: 8 }}>+ section</button>
            </div>
          )}

          {/* fretboard(s) */}
          {view === "tabs" ? (
            <div style={{ marginTop: 14 }}>
              {sec && <Neck sec={sec} extras={extras} rainbow={rainbow} boxOn={boxOn} boxStart={boxStart} tone={tone} />}
            </div>
          ) : (
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              {sections.map((s) => (
                <div key={s.id}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 2, cursor: "pointer" }} onClick={() => setSecId(s.id)}>
                    <span className="song-mono" style={{ fontSize: 12.5, fontWeight: 700, color: sec?.id === s.id ? C.sun : C.ink }}>{s.name}</span>
                    <span className="song-mono" style={{ fontSize: 10.5, color: C.muted }}>{s.root} {SCALES[s.scaleId].name}{s.pos != null ? ` · box ${s.pos}` : ""}</span>
                  </div>
                  <Neck sec={s} extras={extras} rainbow={rainbow} boxOn={boxOn} boxStart={boxStart} mini tone={tone} dim={sections.length > 1 && sec?.id !== s.id} />
                </div>
              ))}
            </div>
          )}

          {/* vocabulary panel */}
          <div style={{ marginTop: 16 }}>
            <div className="song-eyebrow" style={{ marginBottom: 8 }}>
              Grow your vocabulary — toggle in-between notes to add to the {sec ? SCALES[sec.scaleId].name : ""}{sec && !sec.virtual ? ` (${sec.name})` : ""}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 8 }}>
              {candidates.map((s) => (
                <button key={s} className={"song-spice" + (extras.has(s) ? " on" : "")} onClick={() => toggleExtra(s)}>
                  <b>{DEG[s]}</b> · {INTERVALS[s].name}
                  <div style={{ fontSize: 10, opacity: 0.85, marginTop: 2 }}>{tips[s] || "chromatic passing tone"}</div>
                </button>
              ))}
            </div>
          </div>

          {/* how-to */}
          <div className="song-card" style={{ marginTop: 14, background: "rgba(62,155,214,.10)" }}>
            <div className="song-eyebrow" style={{ marginBottom: 6, color: C.blue }}>How to use this</div>
            <div className="song-mono" style={{ fontSize: 13, lineHeight: 1.6 }}>
              Pick a <b>section</b> (intro, chorus, solo…) — the neck re-lights with that part's scale, and its home <span style={{ color: C.sun }}>box</span> glows orange. Toggle <b>▤ stack</b> to see every section's neck at once and compare where your hand moves between parts. Solid dots are safe notes; tap a <span style={{ color: C.violet }}>dashed</span> note to add an in-between tone — lean on it as a passing note, not a landing note. The <b>blue note</b> (♭5 in minor, ♭3 in major) is the classic first add.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
