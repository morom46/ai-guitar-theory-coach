import React, { useEffect, useMemo, useState } from "react";
import { ROOTS, DEG, INTERVALS, SCALES, CHORDS, midiToFreq, noteNameToPc, buildNoteNames, pcName, diatonicChords } from "../theory/engine.js";
import { borrowedChords, dominantOf } from "../theory/harmony.js";
import { parseChord, chordSymbol, transposeChord, chordDegree, chordTonePcs } from "../theory/chordSymbol.js";
import { tabsForSong } from "../data/tabs.js";
import { rootPosition } from "../theory/voicing.js";
import { findVoicings } from "../theory/voicings.js";
import { playMidi, strum as strumMidis } from "../audio/engine.js";
import { C, RAINBOW, degBase, keyToneStyle } from "../ui/theme.js";
import Neck from "./Neck.jsx";
import ChordDiagram from "./ChordDiagram.jsx";
import PracticePanel from "./PracticePanel.jsx";
import AmpPanel, { PickupSwitch } from "./AmpPanel.jsx";
import { AMP, GUITAR, msToBpm } from "../data/tones.js";
import { loadSongs, saveSongs, defaultTone } from "../data/songs.js";
import { tone as audioTone } from "../audio/engine.js";
import { useMetronome } from "../audio/useMetronome.jsx";
import { useDroneFollow } from "../audio/useDrone.js";

/**
 * SONGS & TONES — the one page for practising a song.
 * Every song carries BOTH sides:
 *   what to play — key, scale, sections lit on the fretboard, extra notes
 *   how it sounds — the song's tone dialed into YOUR Blackstar ID:Core V4
 *                   + HSS Strat (amp panel, pickup position, playing notes)
 * ~100 songs seeded; everything editable; JSON import/export; offline.
 */

const FRETS = 24;
const SOLO_SCALES = ["minorPent", "majorPent", "blues", "aeolian", "major", "dorian", "mixolydian", "harmonicMinor"];
const MINORISH = new Set(["minorPent", "aeolian", "dorian", "phrygian"]);

const TIP_MINOR = { 1: "♭2: Phrygian spice (sparingly)", 2: "2 / 9: smooth melodic add", 4: "♮3: major-3rd, bluesy lift", 6: "♭5: the BLUE note", 8: "♭6: dark Aeolian colour", 9: "6: bright Dorian colour", 11: "♮7: leading tone → root" };
const TIP_MAJOR = { 1: "♭2: outside colour", 3: "♭3: the BLUE note (minor over major)", 5: "4: completes the major scale", 6: "♭5 / ♯4: blue / Lydian", 8: "♭6: borrowed-minor colour", 10: "♭7: Mixolydian / dominant" };

const yt = (q) => "https://www.youtube.com/results?search_query=" + encodeURIComponent(q);
const newId = () => "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

// Every song exposes sections; songs without explicit ones get a virtual "whole song".
const sectionsOf = (song) =>
  song.sections?.length ? song.sections : [{ id: "__whole", name: "Whole song", root: song.root, scaleId: song.scaleId, pos: null, virtual: true }];

/* ---------- the section neck (big + mini), on the shared <Neck> ---------- */
function SectionNeck({ sec, extras, rainbow, boxOn, boxStart, mini, tone, dim }) {
  const baseSet = new Set(SCALES[sec.scaleId].ints);
  return (
    <Neck
      root={sec.root}
      frets={FRETS}
      dim={dim}
      size={mini ? "mini" : "md"}
      boxes={[
        sec.pos != null && { start: sec.pos, color: C.sun, bg: "rgba(255,122,46,0.07)" },
        boxOn && { start: boxStart, color: C.muted, bg: "var(--surface)" },
      ]}
      onTap={(midi) => tone(midiToFreq(midi))}
      resolve={(pc, semis, { f, names }) => {
        const inScale = baseSet.has(semis);
        const isExtra = extras.has(semis);
        if (!inScale && !isExtra) return null;
        if (boxOn && !(f >= boxStart && f <= boxStart + 4)) return null;
        const label = DEG[semis];
        const isRoot = semis === 0;
        let st;
        if (isExtra && !inScale) st = { bg: "rgba(181,140,255,.16)", tx: C.violet, br: C.violet, dashed: true };
        else if (rainbow) st = RAINBOW[degBase(label)] || RAINBOW[1];
        else st = keyToneStyle(semis);
        return {
          label,
          ...st,
          root: isRoot,
          boxShadow: isRoot && !mini ? "0 0 0 3px rgba(255,122,46,.3)" : "none",
          title: `${names[pc]} · ${label}${isExtra && !inScale ? " (added)" : ""}`,
        };
      }}
    />
  );
}

/* ---------- amp tone editor ---------- */
function Slider({ label, value, onChange, wide }) {
  return (
    <label className="mono" style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 6 }}>
      {label}
      <input type="range" min="0" max="10" step="1" value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: wide ? 140 : 90 }} />
      <b style={{ color: C.ink, minWidth: 24 }}>{value}</b>
    </label>
  );
}

function ToneEditor({ tone, onPatch }) {
  const patchFx = (slot, p) => onPatch({ fx: { ...tone.fx, [slot]: { ...tone.fx[slot], ...p } } });
  return (
    <div className="card" style={{ marginTop: 10 }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>Edit tone</div>
      <input className="inp" style={{ width: "100%" }} value={tone.rig || ""} onChange={(e) => onPatch({ rig: e.target.value })} placeholder="original rig (amp · guitar · pedals)" />

      <div className="eyebrow" style={{ margin: "12px 0 6px" }}>Voice</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {AMP.voices.map((v) => (
          <button key={v} className={"btn" + (tone.voice === v ? " on" : "")} style={{ padding: "5px 9px" }} onClick={() => onPatch({ voice: v })}>{v}</button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 12 }}>
        <Slider label="gain" value={tone.gain} onChange={(v) => onPatch({ gain: v })} wide />
        <Slider label="volume" value={tone.volume} onChange={(v) => onPatch({ volume: v })} wide />
        <Slider label="ISF (0 USA · 10 UK)" value={tone.isf} onChange={(v) => onPatch({ isf: v })} wide />
      </div>

      <div className="eyebrow" style={{ margin: "14px 0 6px" }}>Built-in effects</div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {["mod", "dly", "rev"].map((slot) => {
          const f = tone.fx[slot];
          const label = slot === "mod" ? "MOD" : slot === "dly" ? "DELAY" : "REVERB";
          return (
            <div key={slot} style={{ border: `1px dashed ${C.line}`, borderRadius: 4, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button className={"btn" + (f.on ? " on" : "")} style={{ padding: "3px 8px", fontSize: 10 }} onClick={() => patchFx(slot, { on: !f.on })}>{label} {f.on ? "on" : "off"}</button>
                <select className="inp" style={{ padding: "3px 5px" }} value={f.type} onChange={(e) => patchFx(slot, { type: e.target.value })}>
                  {AMP.fxTypes[slot].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <Slider label="level" value={f.level} onChange={(v) => patchFx(slot, { level: v })} />
              {slot === "dly" && (
                <label className="mono" style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 6 }}>
                  time <input type="number" className="inp" style={{ width: 70, padding: "3px 5px" }} min="0" max="2000" step="10" value={f.ms || 0} onChange={(e) => patchFx(slot, { ms: Number(e.target.value) })} /> ms
                </label>
              )}
            </div>
          );
        })}
      </div>

      <div className="eyebrow" style={{ margin: "14px 0 6px" }}>Guitar</div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
        <label className="mono" style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 6 }}>
          pickup
          <select className="inp" value={tone.pickup} onChange={(e) => onPatch({ pickup: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map((p) => <option key={p} value={p}>{p} · {GUITAR.positions[p]}</option>)}
          </select>
        </label>
        <Slider label="tone knob" value={tone.toneKnob} onChange={(v) => onPatch({ toneKnob: v })} />
      </div>

      <div className="eyebrow" style={{ margin: "14px 0 6px" }}>Playing notes</div>
      <textarea className="inp" style={{ width: "100%", minHeight: 60 }} value={tone.notes || ""} onChange={(e) => onPatch({ notes: e.target.value })} />
    </div>
  );
}

/* ==================================================================== */

export default function SongPractice({ go }) {
  const [songs, setSongs] = useState(loadSongs);
  const [selId, setSelId] = useState(() => {
    try { const req = localStorage.getItem("songs.sel"); if (req) { localStorage.removeItem("songs.sel"); return req; } } catch {}
    return null;
  });
  const [secId, setSecId] = useState(null);
  const [view, setView] = useState("tabs"); // "tabs" | "stack"
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const [editSec, setEditSec] = useState(false);
  const [editTone, setEditTone] = useState(false);
  const [showData, setShowData] = useState(false);
  const [dataText, setDataText] = useState("");
  const [rainbow, setRainbow] = useState(false);
  const [boxOn, setBoxOn] = useState(false);
  const [boxStart, setBoxStart] = useState(0);
  const [muted, setMuted] = useState(false);
  const met = useMetronome();
  const [form, setForm] = useState({ title: "", artist: "", root: "A", minor: true, scaleId: "minorPent" });

  const song = songs.find((s) => s.id === selId) || songs[0] || null;
  const persist = (list) => { setSongs(list); saveSongs(list); };
  const patchSong = (patch) => persist(songs.map((x) => (x.id === song.id ? { ...x, ...patch } : x)));
  const patchTone = (patch) => patchSong({ tone: { ...song.tone, ...patch } });

  const sections = song ? sectionsOf(song) : [];
  const sec = sections.find((s) => s.id === secId) || sections[0] || null;
  // The drone follows the active SECTION — sections modulate.
  useDroneFollow(sec?.root);
  useEffect(() => { setSecId(null); setEditSec(false); setEditTone(false); }, [song?.id]);

  const secMinor = sec ? MINORISH.has(sec.scaleId) : true;
  const baseSet = new Set(sec ? SCALES[sec.scaleId].ints : []);
  const extras = new Set(song?.extras || []);
  const tips = secMinor ? TIP_MINOR : TIP_MAJOR;

  const candidates = [];
  for (let s = 1; s < 12; s++) if (!baseSet.has(s)) candidates.push(s);

  const list = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f ? songs.filter((s) => (s.title + " " + s.artist).toLowerCase().includes(f)) : songs;
  }, [songs, filter]);

  // library grouped by artist, artists alphabetical
  const groups = useMemo(() => {
    const map = new Map();
    for (const s of list) { const a = s.artist || "Unfiled"; if (!map.has(a)) map.set(a, []); map.get(a).push(s); }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [list]);

  /* audio */
  const tone = (freq) => {
    if (muted) return;
    audioTone(freq, 0, 1.0);
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
    const s = { id: newId(), title: form.title.trim(), artist: form.artist.trim(), root: form.root, minor: form.minor, scaleId: form.scaleId, extras: [], tone: defaultTone() };
    persist([...songs, s]); setSelId(s.id); setAdding(false);
    setForm({ title: "", artist: "", root: "A", minor: true, scaleId: "minorPent" });
  };
  const delSong = (id) => { const list = songs.filter((s) => s.id !== id); persist(list); if (selId === id) setSelId(list[0]?.id || null); };
  const doExport = () => { setShowData(true); setDataText(JSON.stringify(songs, null, 2)); };
  const doImport = () => { try { const v = JSON.parse(dataText); if (Array.isArray(v)) { persist(v); setSelId(v[0]?.id || null); setShowData(false); } } catch { alert("Invalid JSON"); } };

  return (
    <div className="page">
      <style>{`
        .song-sec{ font-family: ui-monospace, monospace; font-size: 11.5px; padding: 6px 10px; border-radius:4px; cursor:pointer;
          border:1.5px solid var(--line); background: var(--surface-lo); color: var(--ink); transition: all .12s; }
        .song-sec:hover{ border-color: var(--ink); }
        .song-sec.on{ border-color:var(--sun); color:var(--sun); background: rgba(255,122,46,.12); }
        .song-spice{ font-family: ui-monospace, monospace; font-size:11.5px; padding:8px 10px; border-radius:4px; cursor:pointer;
          border:1.5px dashed var(--violet); background: rgba(181,140,255,.08); color: var(--ink); transition: all .12s; text-align:left; }
        .song-spice.on{ background: var(--violet); color:#1A1030; border-style: solid; }
        /* One width for every box in a chart, so a long caption makes its own
           box taller rather than wider than the one beside it. */
        .song-chords{ display:flex; gap:10px; flex-wrap:wrap; align-items:flex-start; }
        .song-chords > div{ position:relative; width:182px; }
        .song-chords .cd-box{ width:100%; box-sizing:border-box; }
      `}</style>

      <div className="eyebrow">Guitar Theory Coach · Practice</div>
      <h1 className="page-title">SONGS & TONES</h1>
      <p className="page-sub">
        One page per song: <b style={{ color: C.sun }}>what to play</b> (key, scale, sections on the neck) and{" "}
        <b style={{ color: C.sun }}>how it sounds</b>, dialed into your {AMP.name} + {GUITAR.name}.
      </p>

      {/* song library */}
      <div style={{ marginTop: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Song library · {songs.length} songs{filter.trim() ? ` · showing ${list.length}` : ""} (saved in your browser)
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <input className="inp" placeholder="🔍 search song or artist…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 220 }} />
          {filter.trim() && <button className="btn" style={{ padding: "5px 9px", fontSize: 11 }} onClick={() => setFilter("")}>✕ clear</button>}
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={() => setAdding((v) => !v)}>+ add</button>
          <button className="btn" onClick={doExport}>⤓ data</button>
        </div>
        <div className="lib">
          {groups.map(([artist, items]) => (
            <div key={artist} className="lib-artist">
              <span className="a">{artist}</span>
              <span className="s">
                {items.map((s) => (
                  <button key={s.id} className={"chip" + (s.id === (song?.id) ? " on" : "")} onClick={() => setSelId(s.id)}>
                    {s.title} <span style={{ opacity: 0.7, fontSize: 10 }}>{s.root}{s.minor ? "m" : ""}</span>
                  </button>
                ))}
              </span>
            </div>
          ))}
          {!list.length && <span className="mono" style={{ fontSize: 12, color: C.muted }}>no match. Try fewer letters, or + add it.</span>}
        </div>
      </div>

      {adding && (
        <div className="card" style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input className="inp" placeholder="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input className="inp" placeholder="artist" value={form.artist} onChange={(e) => setForm({ ...form, artist: e.target.value })} />
          <select className="inp" value={form.root} onChange={(e) => setForm({ ...form, root: e.target.value })}>
            {ROOTS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select className="inp" value={form.minor ? "m" : "M"} onChange={(e) => setForm({ ...form, minor: e.target.value === "m" })}>
            <option value="M">major</option><option value="m">minor</option>
          </select>
          <select className="inp" value={form.scaleId} onChange={(e) => setForm({ ...form, scaleId: e.target.value })}>
            {SOLO_SCALES.map((id) => <option key={id} value={id}>{SCALES[id].name}</option>)}
          </select>
          <button className="btn on" onClick={addSong}>save song</button>
        </div>
      )}

      {showData && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Song data (JSON) · copy to back up, or paste AI-generated songs and Import</div>
          <textarea className="inp" style={{ width: "100%", minHeight: 120, whiteSpace: "pre" }} value={dataText} onChange={(e) => setDataText(e.target.value)} />
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <button className="btn on" onClick={doImport}>Import (replace all)</button>
            <button className="btn" onClick={() => setShowData(false)}>close</button>
            <span className="mono" style={{ fontSize: 10.5, color: C.muted, alignSelf: "center" }}>
              shape: {'{'} title, artist, root, minor, scaleId, extras, chords?, capo?, tuning?, sections?, tone {'}'}
            </span>
          </div>
        </div>
      )}

      {!song ? (
        <div className="card" style={{ marginTop: 16, color: C.muted }}>No song selected. Add one above.</div>
      ) : (
        <>
          {/* song header + controls */}
          <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div className="mono" style={{ fontSize: 16, fontWeight: 700 }}>
              {song.title} <span style={{ color: C.muted, fontWeight: 400 }}>· {song.artist}</span>
            </div>
            {sec && (
              <span className="mono" style={{ fontSize: 13, padding: "3px 9px", border: `1.5px solid ${C.sun}`, color: C.sun, borderRadius: 3 }}>
                {sec.virtual ? "" : sec.name + " · "}{sec.root} {SCALES[sec.scaleId].name}
              </span>
            )}
            <a className="btn" style={{ textDecoration: "none" }} href={yt(`${song.title} ${song.artist} backing track`)} target="_blank" rel="noopener noreferrer">▶ backing track</a>
            <div style={{ flex: 1 }} />
            <button className={"btn" + (view === "stack" ? " on" : "")} onClick={() => setView((v) => (v === "stack" ? "tabs" : "stack"))} title="Toggle: one neck with section tabs ↔ all sections stacked">
              {view === "stack" ? "▤ stack" : "▦ tabs"}
            </button>
            <button className={"btn" + (rainbow ? " on" : "")} onClick={() => setRainbow((v) => !v)} title="Colour degrees 1-7 (root = red)">🌈</button>
            <button className={"btn" + (boxOn ? " on" : "")} onClick={() => setBoxOn((v) => !v)} title="Lock to one 5-fret box">▢ box</button>
            {boxOn && <input type="range" min="0" max={FRETS - 4} value={boxStart} onChange={(e) => setBoxStart(Number(e.target.value))} />}
            <button className="btn" onClick={() => setMuted((m) => !m)}>{muted ? "♪ off" : "♪ on"}</button>
            <button className="btn" onClick={() => delSong(song.id)} title="Delete this song" style={{ borderColor: C.red, color: C.red }}>✕</button>
          </div>

          {/* section chips + editor toggle */}
          <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span className="eyebrow" style={{ marginRight: 4 }}>Sections</span>
            {sections.map((s) => (
              <button key={s.id} className={"song-sec" + (sec?.id === s.id ? " on" : "")} onClick={() => setSecId(s.id)}
                title={`${s.root} ${SCALES[s.scaleId].name}${s.pos != null ? ` · box ${s.pos}` : ""}`}>
                {s.name} <span style={{ opacity: 0.75, fontSize: 9.5 }}>{s.root}</span>
              </button>
            ))}
            {realSections.length ? (
              <button className={"btn" + (editSec ? " on" : "")} style={{ padding: "5px 9px", fontSize: 11 }} onClick={() => setEditSec((v) => !v)}>✎ edit</button>
            ) : (
              <button className="btn" style={{ padding: "5px 9px", fontSize: 11 }} onClick={splitIntoSections} title="Split this song into intro / verse / chorus / solo sections">＋ split into sections</button>
            )}
          </div>

          {editSec && realSections.length > 0 && (
            <div className="card" style={{ marginTop: 10 }}>
              <div className="mono" style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Each section has its own root, scale, and (optional) home box on the neck. Box −1 = none.</div>
              {realSections.map((s) => (
                <div key={s.id} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", padding: "6px 0", borderTop: `1px dashed ${C.grid}` }}>
                  <input className="inp" style={{ width: 110 }} value={s.name} onChange={(e) => patchSection(s.id, { name: e.target.value })} />
                  <select className="inp" value={s.root} onChange={(e) => patchSection(s.id, { root: e.target.value })}>{ROOTS.map((r) => <option key={r} value={r}>{r}</option>)}</select>
                  <select className="inp" value={s.scaleId} onChange={(e) => patchSection(s.id, { scaleId: e.target.value })}>{SOLO_SCALES.map((id) => <option key={id} value={id}>{SCALES[id].name}</option>)}</select>
                  <label className="mono" style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 4 }}>
                    box<input type="number" min="-1" max={FRETS - 4} className="inp" style={{ width: 56 }} value={s.pos ?? -1}
                      onChange={(e) => { const v = Number(e.target.value); patchSection(s.id, { pos: v < 0 ? null : v }); }} />
                  </label>
                  <button className="btn" onClick={() => delSection(s.id)} style={{ padding: "5px 7px", borderColor: C.red, color: C.red }}>✕</button>
                </div>
              ))}
              <button className="btn" onClick={addSection} style={{ marginTop: 8 }}>+ section</button>
            </div>
          )}

          {/* fretboard(s) */}
          {view === "tabs" ? (
            <div style={{ marginTop: 14 }}>
              {sec && <SectionNeck sec={sec} extras={extras} rainbow={rainbow} boxOn={boxOn} boxStart={boxStart} tone={tone} />}
            </div>
          ) : (
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              {sections.map((s) => (
                <div key={s.id}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 2, cursor: "pointer" }} onClick={() => setSecId(s.id)}>
                    <span className="mono" style={{ fontSize: 12.5, fontWeight: 700, color: sec?.id === s.id ? C.sun : C.ink }}>{s.name}</span>
                    <span className="mono" style={{ fontSize: 10.5, color: C.muted }}>{s.root} {SCALES[s.scaleId].name}{s.pos != null ? ` · box ${s.pos}` : ""}</span>
                  </div>
                  <SectionNeck sec={s} extras={extras} rainbow={rainbow} boxOn={boxOn} boxStart={boxStart} mini tone={tone} dim={sections.length > 1 && sec?.id !== s.id} />
                </div>
              ))}
            </div>
          )}

          {/* ---- the chords the song is built from ---- */}
          <ChordsPanel song={song} sec={sec} muted={muted} patchSong={patchSong} patchSection={patchSection} />

          {/* ---- amp tone (the old Tone Match, now part of every song) ---- */}
          <div style={{ marginTop: 20 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
              <span className="eyebrow">Amp tone · {AMP.name}</span>
              {song.tone?.rig && <span className="mono" style={{ fontSize: 11, color: C.muted }}>original rig: {song.tone.rig}</span>}
              <div style={{ flex: 1 }} />
              {song.tone ? (
                <button className={"btn" + (editTone ? " on" : "")} style={{ padding: "5px 9px", fontSize: 11 }} onClick={() => setEditTone((v) => !v)}>✎ tone</button>
              ) : (
                <button className="btn" style={{ padding: "5px 9px", fontSize: 11 }} onClick={() => { patchSong({ tone: defaultTone() }); setEditTone(true); }}>＋ add tone</button>
              )}
            </div>

            {song.tone && (
              <>
                <div style={{ overflowX: "auto" }}>
                  <AmpPanel tone={song.tone} />
                </div>
                <div style={{ marginTop: 12, display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <div className="card" style={{ flex: "1 1 280px", minWidth: 260 }}>
                    <div className="eyebrow" style={{ marginBottom: 10 }}>Your guitar · {GUITAR.name}</div>
                    <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                      <PickupSwitch pos={song.tone.pickup} />
                      <div className="mono" style={{ fontSize: 12, lineHeight: 1.6 }}>
                        <div><b style={{ color: C.sun }}>Position {song.tone.pickup}</b> · {GUITAR.positions[song.tone.pickup]}</div>
                        <div style={{ color: C.muted }}>tone knob ≈ <b style={{ color: C.ink }}>{song.tone.toneKnob}</b></div>
                      </div>
                    </div>
                  </div>
                  <div className="card" style={{ flex: "1 1 280px", minWidth: 260, background: "rgba(62,155,214,.10)" }}>
                    <div className="eyebrow" style={{ marginBottom: 8, color: C.blue }}>How to play it</div>
                    <div className="mono" style={{ fontSize: 12.5, lineHeight: 1.6 }}>{song.tone.notes || "No notes yet. Hit ✎ tone."}</div>
                    {song.tone.fx?.dly?.on && song.tone.fx.dly.ms > 0 && (
                      <div className="mono" style={{ fontSize: 11, color: C.cyan, marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span>⏱ tap the amp's TAP button ≈ every {song.tone.fx.dly.ms}ms ({msToBpm(song.tone.fx.dly.ms)} BPM)</span>
                        {met && (
                          // The delay time IS the song's pulse — hand it to the click and
                          // you have a metronome to set the amp's tap tempo against.
                          <button
                            className="btn"
                            style={{ padding: "4px 7px" }}
                            onClick={() => met.setFromBpm(msToBpm(song.tone.fx.dly.ms), { start: true })}
                            title={`Start the click at ${msToBpm(song.tone.fx.dly.ms)} BPM so you can set the amp's tap tempo to it`}
                          >
                            → set the click
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {editTone && <ToneEditor tone={song.tone} onPatch={patchTone} />}
              </>
            )}
          </div>

          {/* anything written for this song's solo */}
          <SoloLinks song={song} sec={sec} go={go} />

          {/* borrowed chords — the parallel minor, in THIS song's key */}
          <BorrowedPanel song={song} muted={muted} extras={extras} toggleExtra={toggleExtra} />

          {/* vocabulary panel */}
          <div style={{ marginTop: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Grow your vocabulary · toggle in-between notes to add to the {sec ? SCALES[sec.scaleId].name : ""}{sec && !sec.virtual ? ` (${sec.name})` : ""}
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
          <div className="card" style={{ marginTop: 14, background: "rgba(62,155,214,.10)" }}>
            <div className="eyebrow" style={{ marginBottom: 6, color: C.blue }}>How to use this page</div>
            <div className="mono" style={{ fontSize: 13, lineHeight: 1.6 }}>
              <b>1.</b> Pick a song (or 🔍 filter). <b>2.</b> Copy the amp panel onto your Blackstar (voice, gain, ISF, effects) and set your pickup switch.{" "}
              <b>3.</b> The neck shows the safe notes for the current <b>section</b>; the home <span style={{ color: C.sun }}>box</span> glows orange.{" "}
              <b>4.</b> Tap any lit note to hear it. Dashed <span style={{ color: C.violet }}>violet</span> notes are optional colour: passing tones, not landing tones.{" "}
              Toggle <b>▤ stack</b> to compare all sections at once, or <b>🌈</b> to colour the scale degrees.
            </div>
          </div>
        </>
      )}

      {/* Backing tracks and songs for any key. Outside the `song &&` block on
          purpose: it is useful with nothing selected, and it is the one part
          of the page that does not need a song at all. */}
      <PracticeLinks song={song} />
    </div>
  );
}


/* ==================== the chords the song is built from ==================== */

/**
 * WHAT TO PLAY, ABOVE THE NECK.
 *
 * The fretboard says which notes are safe over a section. It never said which
 * CHORDS the song is actually made of, which is the first thing anyone wants
 * when they sit down with a record. So: the chart, one solved grip per chord,
 * the number each chord holds in the key, and the capo the original used.
 *
 * Charts are stored as SOUNDING chords, the key the record is in. The grip
 * under your fingers is that chart transposed down by the capo (and by
 * however far the whole guitar is detuned on the record), which is why a song
 * in F# minor can hand you an Em box: capo 2, Em shape, F#m sound. Working
 * that out here rather than storing both spellings means the chart stays true
 * when the capo moves.
 *
 * Shapes come from the same solver the Chord Builder uses, so a box here
 * cannot drift out of step with the chord it says it is.
 */
function ChordsPanel({ song, sec, muted, patchSong, patchSection }) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState("");

  // A section only overrides the song's chart when it was given one; the solo
  // vamp of a song is often not the song's own progression.
  const secChart = sec && !sec.virtual && sec.chords?.length ? sec : null;
  const source = secChart || song;
  const written = source.chords || [];

  const capo = song.capo || 0;
  const tuning = song.tuning || 0;
  // sounding = grip + capo + tuning, so the grip is the sounding chord moved
  // back down by both.
  const shift = -(capo + tuning);

  const tonicName = secChart ? sec.root : song.root;
  const tonicPc = noteNameToPc(tonicName);
  const tonicMinor = secChart ? MINORISH.has(sec.scaleId) : !!song.minor;
  const keyLabel = tonicName + (tonicMinor ? " minor" : " major");
  const gripKey = ROOTS[((tonicPc + shift) % 12 + 12) % 12];
  const gripNames = useMemo(() => buildNoteNames(gripKey), [gripKey]);

  const inKey = useMemo(() => {
    const ints = tonicMinor ? SCALES.aeolian.ints : SCALES.major.ints;
    return new Set(ints.map((i) => (tonicPc + i) % 12));
  }, [tonicPc, tonicMinor]);

  const text = written.join(" ");
  const chords = useMemo(() => written.map((raw, i) => {
    const heard = parseChord(raw);
    if (!heard) return { key: i + raw, raw, bad: true };
    const grip = transposeChord(heard, shift);
    // A slash chord asks for one specific note in the bass. Some of them are
    // not chord tones at all (the G under an A is really an A7), and the
    // solver cannot invent a string for it, so fall back to the plain grip
    // rather than showing nothing.
    let found = findVoicings(grip.rootPc, grip.quality, {
      bass: grip.bassPc == null ? "root" : grip.bassPc,
    });
    let bassKept = true;
    if (!found.length && grip.bassPc != null) {
      bassKept = false;
      found = findVoicings(grip.rootPc, grip.quality);
    }
    // findVoicings hands back one shape per position, lowest first. A chart
    // wants the first-position grip, the one a guitarist would reach for
    // without thinking, not whichever shape scored cheapest up at fret 8.
    const best = found[0] || null;
    return {
      key: i + raw,
      raw,
      heard,
      best,
      gripText: chordSymbol(bassKept ? grip : { ...grip, bassPc: null }, gripKey),
      // A bass note the grip could not hold is still worth saying out loud:
      // it is a bass line, and it is why the chord was written that way.
      lostBass: bassKept || grip.bassPc == null ? null : gripNames[grip.bassPc],
      degree: chordDegree(heard, tonicPc),
      outside: chordTonePcs(heard).some((pc) => !inKey.has(pc)),
      quality: CHORDS[grip.quality],
    };
  }), [text, shift, tonicPc, gripKey, gripNames, inKey]);

  const openEditor = (seed) => {
    setDraft(seed != null ? seed : text);
    setEdit(true);
  };
  const save = () => {
    // An empty list is stored, not dropped: the seed back-fill in songs.js
    // treats a missing key as "never answered" and would hand the seeded
    // chart back on the next reload.
    const list = draft.trim().split(/[\s,|]+/).filter(Boolean);
    if (secChart) patchSection(sec.id, { chords: list });
    else patchSong({ chords: list });
    setEdit(false);
  };
  const keyChords = () =>
    diatonicChords(tonicPc, tonicMinor ? "minor" : "major", tonicName).map((c) => c.label).join(" ");

  const pill = (color, label) => (
    <span className="mono" key={label} style={{
      fontSize: 11, fontWeight: 700, letterSpacing: ".04em", padding: "3px 9px",
      border: "1.5px solid " + color, color, borderRadius: 3,
    }}>{label}</span>
  );

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <span className="eyebrow" style={{ margin: 0 }}>
          Chords{secChart ? " · " + sec.name : ""}
        </span>
        {capo > 0 && pill(C.sun, "CAPO " + capo)}
        {tuning !== 0 && pill(C.violet, "TUNED " + (tuning < 0 ? "DOWN " : "UP ") + Math.abs(tuning) + " SEMITONE" + (Math.abs(tuning) === 1 ? "" : "S"))}
        <div style={{ flex: 1 }} />
        <button className={"btn" + (edit ? " on" : "")} style={{ padding: "5px 9px", fontSize: 11 }} onClick={() => (edit ? setEdit(false) : openEditor())}>
          &#9998; chords
        </button>
      </div>

      {chords.length > 0 ? (
        <>
          <div className="song-chords">
            {chords.map((c) => {
              if (c.bad) {
                return (
                  <div key={c.key}>
                    <div className="mono" style={{ fontSize: 11.5, color: C.muted, border: "1.5px dashed " + C.line, borderRadius: 5, padding: "10px 12px" }}>
                      {c.raw}<br /><span style={{ fontSize: 10 }}>could not read this one</span>
                    </div>
                  </div>
                );
              }
              if (!c.best) {
                return (
                  <div key={c.key}>
                    <div className="mono" style={{ fontSize: 11.5, color: C.muted, border: "1.5px dashed " + C.line, borderRadius: 5, padding: "10px 12px" }}>
                      <b style={{ color: C.ink }}>{c.gripText}</b><br />
                      <span style={{ fontSize: 10 }}>no grip fits one hand</span>
                    </div>
                  </div>
                );
              }
              const sub = [
                shift === 0 ? c.degree : "sounds " + c.raw + " · " + c.degree,
                c.heard.exact ? null : c.quality.name + " grip",
                c.lostBass ? c.lostBass + " in the bass" : null,
              ].filter(Boolean).join(" · ");
              return (
                <div key={c.key}>
                  <ChordDiagram
                    voicing={c.best}
                    names={gripNames}
                    label={shift === 0 && !c.lostBass ? c.raw : c.gripText}
                    sub={sub}
                    onPlay={() => { if (!muted) strumMidis(c.best.midis.map((m) => m + capo + tuning), { stagger: 0.05 }); }}
                  />
                  {c.outside && (
                    <span className="mono" title={"Not in " + keyLabel + ": this is the borrowed one"} style={{
                      position: "absolute", top: 4, right: 6, fontSize: 9, color: C.violet, pointerEvents: "none",
                    }}>&#9670;</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mono" style={{ fontSize: 11.5, color: C.muted, marginTop: 8, lineHeight: 1.65 }}>
            {shift === 0 ? (
              <>Tap a box to strum it. Under each one is the chord's number in {keyLabel}, which is the version worth
                remembering: the same numbers work in every key.</>
            ) : (
              <>Boxes are the grips you actually hold{capo > 0 ? ", with the capo on fret " + capo : ""}
                {tuning !== 0 ? ", guitar tuned " + Math.abs(tuning) + " semitone" + (Math.abs(tuning) === 1 ? "" : "s") + (tuning < 0 ? " down" : " up") : ""}.
                Under each one is the chord it sounds like on the record, and its number in {keyLabel}. Tap to strum it at
                sounding pitch.</>
            )}
            {chords.some((c) => c.outside) && (
              <> A <span style={{ color: C.violet }}>&#9670;</span> marks a chord from outside the key, which is usually the
                one that makes the song sound like itself.</>
            )}
          </div>
        </>
      ) : (
        <div className="mono" style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.8 }}>
          No chart written for this song yet. Type the chords and they are saved with it, shapes and numbers included.{" "}
          <button className="btn" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => openEditor("")}>&#9998; add chords</button>{" "}
          <button className="btn" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => openEditor(keyChords())}>
            start from the seven chords of {keyLabel}
          </button>
        </div>
      )}

      {edit && (
        <div className="card" style={{ marginTop: 10 }}>
          <div className="mono" style={{ fontSize: 11.5, color: C.muted, marginBottom: 8, lineHeight: 1.6 }}>
            Write them the way you would on paper, separated by spaces: <b style={{ color: C.ink }}>Am C D Fmaj7</b>.
            Sevenths, sus, add9 and slash chords (D/F#) all read. Write the chords the record SOUNDS, not the shapes you
            hold: the capo below turns one into the other.
            {secChart && <> You are editing the chart for <b style={{ color: C.sun }}>{sec.name}</b>, not the whole song.</>}
          </div>
          <input className="inp" style={{ width: "100%" }} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Am C D Fmaj7" />
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
            <label className="mono" style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 5 }}>
              capo fret
              <input type="number" className="inp" style={{ width: 60 }} min="0" max="12" value={capo}
                onChange={(e) => patchSong({ capo: Number(e.target.value) || 0 })} />
            </label>
            <label className="mono" style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 5 }}>
              tuned (semitones)
              <input type="number" className="inp" style={{ width: 60 }} min="-4" max="2" value={tuning}
                onChange={(e) => patchSong({ tuning: Number(e.target.value) || 0 })} />
            </label>
            <button className="btn on" onClick={save}>save chords</button>
            <button className="btn" onClick={() => setEdit(false)}>cancel</button>
            <button className="btn" style={{ padding: "5px 9px", fontSize: 11 }} onClick={() => setDraft(keyChords())}>
              fill with {keyLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================== borrowed chords, per song ==================== */

/**
 * MODAL INTERCHANGE, WIRED TO THE ACTUAL SONG.
 *
 * The Chord Builder teaches borrowing in the abstract. Here it is aimed at the
 * song in front of you: the six chords worth borrowing, resolved into this
 * song's key, each one saying which diatonic chord it replaces and — the part
 * that matters — which single note it drags in from the parallel minor.
 *
 * "＋ add to the neck" writes that note into the song's own `extras`, so the
 * borrowed colour shows up as a dashed violet note on the fretboard and stays
 * there next time you open the song. The vocabulary mechanism was already
 * built for exactly this; it just had no theory pointing at it.
 *
 * A minor-key song gets the move that actually matters there instead: the
 * harmonic-minor V7, which is where the raised 7th comes from.
 */
function BorrowedPanel({ song, muted, extras, toggleExtra }) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(0);

  const rootPc = noteNameToPc(song.root);
  const names = useMemo(() => buildNoteNames(song.root), [song.root]);

  const list = useMemo(
    () => (song.minor ? [] : borrowedChords(rootPc, { key: song.root })),
    [rootPc, song.minor, song.root]
  );
  const minorV = useMemo(
    () => (song.minor ? dominantOf(rootPc, "minor", song.root) : null),
    [rootPc, song.minor, song.root]
  );

  const hear = (pc, quality, at = 0) => {
    if (muted) return;
    rootPosition(pc, quality, 48).forEach((m, i) => playMidi(m, at + i * 0.03, 1.6));
  };

  const b = list[pick];

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div className="eyebrow" style={{ margin: 0 }}>
          {song.minor
            ? `Raise the 7: the chord that makes ${song.root} minor pull home`
            : `Borrow from ${song.root} minor: the chord that changes the colour`}
        </div>
        <button className="btn" style={{ padding: "3px 9px" }} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? "− hide" : "+ show"}
        </button>
      </div>

      {open && song.minor && minorV && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
            <button className="btn" onClick={() => hear(rootPc, "min")}>▶ i · {song.root}m</button>
            <button className="btn" onClick={() => hear((rootPc + 7) % 12, "min")}>▶ v · {names[(rootPc + 7) % 12]}m</button>
            <button className="btn" style={{ borderColor: C.sun, color: C.sun }} onClick={() => { hear(minorV.rootPc, "dom7"); hear(rootPc, "min", 1.0); }}>
              ▶ {minorV.label} → {song.root}m
            </button>
            <button
              className={"btn" + (extras.has(11) ? " on" : "")}
              onClick={() => toggleExtra(11)}
              title="Put the raised 7th on the neck as a colour note"
            >
              {extras.has(11) ? "✓ 7 on the neck" : "＋ add the 7 to the neck"}
            </button>
          </div>
          <div className="mono" style={{ fontSize: 12.5, color: C.ink, marginTop: 10, lineHeight: 1.65 }}>
            Natural minor's v is MINOR, with no leading tone, so it slides home instead of pulling. Raise the 7
            ({names[(rootPc + 11) % 12]}) and v becomes {minorV.label}: that one note is the difference between
            a progression that drifts and one that lands, and it is what almost every minor-key song actually
            plays. Added to the neck it shows as a dashed violet note: a target over the V, not a resting
            place over the i.
          </div>
        </>
      )}

      {open && !song.minor && b && (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            {list.map((x, i) => (
              <button key={x.rn} className={"btn" + (pick === i ? " on" : "")} style={{ padding: "4px 9px" }} onClick={() => setPick(i)}>
                {x.rn} <span style={{ opacity: 0.6, fontSize: 10 }}>{x.label}</span>
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
            <button className="btn" onClick={() => hear((rootPc + [0, 2, 4, 5, 7, 9, 11][b.replaces]) % 12, ["maj", "min", "min", "maj", "maj", "min", "dim"][b.replaces])}>
              ▶ {b.replacesRn} · {b.replacesLabel}
            </button>
            <span className="mono" style={{ color: C.muted, fontSize: 12 }}>↔</span>
            <button className="btn" style={{ borderColor: C.violet, color: C.violet }} onClick={() => hear(b.rootPc, b.quality)}>
              ▶ {b.rn} · {b.label}
            </button>
            <button className="btn" onClick={() => { hear(b.rootPc, b.quality); hear(rootPc, "maj", 1.0); }}>
              ▶ {b.rn} → I
            </button>
            {b.newNotes.map((pc) => {
              const semis = ((pc - rootPc) % 12 + 12) % 12;
              return (
                <button
                  key={pc}
                  className={"btn" + (extras.has(semis) ? " on" : "")}
                  onClick={() => toggleExtra(semis)}
                  title="Add this note to the fretboard for this song"
                >
                  {extras.has(semis) ? "✓ " : "＋ "}{pcName(pc, song.root, "flat")} ({DEG[semis]})
                </button>
              );
            })}
          </div>

          <div className="mono" style={{ fontSize: 12.5, color: C.ink, marginTop: 10, lineHeight: 1.65 }}>
            {b.why} Swap <b>{b.replacesLabel}</b> for <b style={{ color: C.violet }}>{b.label}</b> and the note that
            arrives is <b style={{ color: C.violet }}>{b.newNotes.map((pc) => pcName(pc, song.root, "flat")).join(" and ")}</b>.
            Add it to the neck and you will see it sitting a fret below a note you already know. That single
            semitone is what makes the chorus sound like that.
          </div>
        </>
      )}
    </div>
  );
}


/* ==================== solos written for this song ==================== */

/**
 * THE BRIDGE TO THE SOLO PLAYER.
 *
 * A solo attached to a song is the real one, entered note for note from a
 * published tab. It is the one thing in this app that CLAIMS to be the record,
 * so it says so on the button and the player flies an unverified banner over
 * everything the tab did not actually state.
 */
function SoloLinks({ song, sec, go }) {
  const tabs = useMemo(() => tabsForSong(song.id), [song.id]);
  if (!tabs.length) return null;

  const open = (id) => {
    try { localStorage.setItem("solo.req", id); } catch {}
    if (go) go("solo");
  };

  const isSoloSection = sec && /solo/i.test(sec.name || "");

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        {isSoloSection ? "For this solo section" : "Written for this song"}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            className="btn"
            style={{ borderColor: C.sun, color: C.sun }}
            onClick={() => open(t.id)}
            title={t.meta.note}
          >
            ▶ {t.meta.title}{" "}
            <span style={{ opacity: 0.6, fontSize: 10 }}>
              the real solo · {t.meta.key} {SCALES[t.meta.scaleId].name}
            </span>
          </button>
        ))}
      </div>
      <div className="mono" style={{ fontSize: 11.5, color: C.muted, marginTop: 8, lineHeight: 1.6 }}>
        The solo{tabs.length > 1 ? "s are" : " is"} entered from a tab: the frets are the record's,
        the rhythm is an inference, and the player says which is which.
      </div>
    </div>
  );
}


/* ==================== practice links, any key ==================== */

/**
 * The foot of the page: pick a key, get backing tracks and songs commonly in
 * it. Everything is an outbound YouTube / Ultimate-Guitar search, so there is
 * no account to connect and nothing that can stop working.
 *
 * It starts on the selected song's key and re-syncs whenever you switch songs,
 * which is what you want nine times in ten; the picker is there for the tenth,
 * and a manual choice sticks until the next song change.
 */
function PracticeLinks({ song }) {
  const [root, setRoot] = useState(song ? song.root : "A");
  const [minor, setMinor] = useState(song ? !!song.minor : true);

  const songId = song ? song.id : null;
  useEffect(() => {
    if (!song) return;
    setRoot(song.root);
    setMinor(!!song.minor);
    // Keyed on the song, not the whole object: editing a tone must not yank
    // the key picker back from underneath you.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId]);

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className="eyebrow">Practice links for any key:</span>
        <select className="inp" value={root} onChange={(e) => setRoot(e.target.value)} aria-label="Key">
          {ROOTS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button className={"btn" + (!minor ? " on" : "")} onClick={() => setMinor(false)}>major</button>
        <button className={"btn" + (minor ? " on" : "")} onClick={() => setMinor(true)}>minor</button>
      </div>
      <PracticePanel
        keyLabel={root}
        tonality={minor ? "minor" : "major"}
        keyId={root + (minor ? "min" : "maj")}
      />
    </div>
  );
}
