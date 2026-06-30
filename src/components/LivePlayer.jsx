import React, { useEffect, useMemo, useRef, useState } from "react";
import { DEG, SCALES, OPEN_MIDI, midiToFreq, noteNameToPc, buildNoteNames, ROOTS } from "../theory/engine.js";

/**
 * LIVE PLAYER (Phase 1) — play a song and watch the fretboard follow along.
 * A clock (your own MP3, or a YouTube video) drives a requestAnimationFrame
 * loop; the song is divided into sections (intro / verse / solo …) and the
 * neck shows each section's scale + box as the playhead moves. Loop a section
 * and slow it down to drill it. All section data is local (offline-editable).
 */

const C = {
  paper: "#000000", ink: "#DCE6EC", blue: "#3E9BD6", cyan: "#36C7E0", sun: "#FF7A2E",
  sunDeep: "#E0601B", line: "#3A4853", red: "#E0533F", green: "#3FB68B", violet: "#B58CFF",
  muted: "#7C8A95", grid: "rgba(120,150,170,0.10)",
};
const FRETS = 24;
const SOLO_SCALES = ["majorPent", "minorPent", "major", "aeolian", "dorian", "mixolydian"];

const SEED = [
  {
    id: "yl", title: "Yellow Ledbetter", artist: "Pearl Jam", youtubeId: "",
    sections: [
      { id: "a", name: "Intro riff", start: 0, end: 33, root: "E", scaleId: "majorPent", pos: 0 },
      { id: "b", name: "Verse 1", start: 33, end: 78, root: "E", scaleId: "majorPent", pos: 0 },
      { id: "c", name: "Chorus", start: 78, end: 108, root: "A", scaleId: "majorPent", pos: 5 },
      { id: "d", name: "Verse 2", start: 108, end: 150, root: "E", scaleId: "majorPent", pos: 0 },
      { id: "e", name: "Solo", start: 150, end: 230, root: "E", scaleId: "majorPent", pos: 7 },
      { id: "f", name: "Outro", start: 230, end: 300, root: "E", scaleId: "majorPent", pos: 0 },
    ],
  },
];

const load = () => { try { const v = JSON.parse(localStorage.getItem("player.v1")); if (Array.isArray(v) && v.length) { const ids = new Set(v.map((s) => s.id)); return [...v, ...SEED.filter((s) => !ids.has(s.id))]; } } catch {} return SEED; };
const save = (l) => { try { localStorage.setItem("player.v1", JSON.stringify(l)); } catch {} };
const mmss = (t) => { if (!t && t !== 0) return "0:00"; const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, "0")}`; };
const newId = () => Math.random().toString(36).slice(2, 7);

export default function LivePlayer() {
  const [songs, setSongs] = useState(load);
  const [selId, setSelId] = useState(songs[0]?.id || null);
  const [srcType, setSrcType] = useState("audio"); // "audio" | "youtube"
  const [audioUrl, setAudioUrl] = useState("");
  const [ytId, setYtId] = useState("");
  const [ytReady, setYtReady] = useState(false);
  const [now, setNow] = useState(0);
  const [dur, setDur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loopSec, setLoopSec] = useState(false);
  const [loopId, setLoopId] = useState(null);
  const [speed, setSpeed] = useState(1);
  const [edit, setEdit] = useState(false);
  const [showData, setShowData] = useState(false);
  const [dataText, setDataText] = useState("");

  const audioRef = useRef(null);
  const ytRef = useRef(null);
  const ytElRef = useRef(null);
  const lastNow = useRef(0);
  const toneRef = useRef(null);

  const song = songs.find((s) => s.id === selId) || null;
  const sections = song?.sections || [];
  const persist = (list) => { setSongs(list); save(list); };
  const updateSong = (patch) => persist(songs.map((s) => (s.id === song.id ? { ...s, ...patch } : s)));

  const curSection = useMemo(() => sections.find((s) => now >= s.start && now < s.end) || null, [sections, now]);
  const loopTarget = sections.find((s) => s.id === loopId) || null;

  /* ---------- clock controls ---------- */
  const getTime = () => {
    if (srcType === "audio") return audioRef.current ? audioRef.current.currentTime : null;
    if (srcType === "youtube" && ytRef.current?.getCurrentTime) return ytRef.current.getCurrentTime();
    return null;
  };
  const seek = (t) => {
    if (srcType === "audio" && audioRef.current) audioRef.current.currentTime = t;
    if (srcType === "youtube" && ytRef.current?.seekTo) ytRef.current.seekTo(t, true);
    setNow(t);
  };
  const playPause = () => {
    if (srcType === "audio" && audioRef.current) { playing ? audioRef.current.pause() : audioRef.current.play(); }
    if (srcType === "youtube" && ytRef.current) { playing ? ytRef.current.pauseVideo() : ytRef.current.playVideo(); }
    setPlaying((p) => !p);
  };
  const setRate = (r) => {
    setSpeed(r);
    if (srcType === "audio" && audioRef.current) audioRef.current.playbackRate = r;
    if (srcType === "youtube" && ytRef.current?.setPlaybackRate) ytRef.current.setPlaybackRate(r);
  };

  /* ---------- the rAF highlight loop ---------- */
  useEffect(() => {
    let raf;
    const tick = () => {
      const t = getTime();
      if (t != null) {
        if (Math.abs(t - lastNow.current) > 0.05) { lastNow.current = t; setNow(t); }
        if (loopSec && loopTarget && t >= loopTarget.end - 0.05) seek(loopTarget.start);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcType, loopSec, loopId, sections]);

  /* ---------- audio element wiring ---------- */
  const onFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const url = URL.createObjectURL(f); // local in-browser link, nothing uploaded
    setAudioUrl(url); setSrcType("audio"); setPlaying(false); setNow(0);
  };

  /* ---------- youtube player ---------- */
  const buildYT = (videoId) => {
    const make = () => {
      if (ytRef.current?.destroy) ytRef.current.destroy();
      ytRef.current = new window.YT.Player(ytElRef.current, {
        videoId, playerVars: { playsinline: 1 },
        events: {
          onReady: (ev) => { setYtReady(true); setDur(ev.target.getDuration() || 0); ev.target.setPlaybackRate(speed); },
          onStateChange: (ev) => { setPlaying(ev.data === 1); if (ev.data === 1) setDur(ev.target.getDuration() || 0); },
        },
      });
    };
    if (window.YT && window.YT.Player) make();
    else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev && prev(); make(); };
      if (!document.getElementById("yt-iframe-api")) {
        const tag = document.createElement("script"); tag.id = "yt-iframe-api"; tag.src = "https://www.youtube.com/iframe_api"; document.body.appendChild(tag);
      }
    }
  };
  const loadYouTube = () => {
    const id = ytId.trim().match(/(?:v=|youtu\.be\/|embed\/)?([\w-]{11})/)?.[1] || ytId.trim();
    if (!id) return;
    setSrcType("youtube"); setYtReady(false); setNow(0);
    if (song) updateSong({ youtubeId: id });
    buildYT(id);
  };

  // keep audio duration fresh
  const onAudioMeta = () => { if (audioRef.current) setDur(audioRef.current.duration || 0); };

  /* ---------- preview a section's scale by ear (pluck the root) ---------- */
  const ping = (root) => {
    try {
      if (!toneRef.current) toneRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = toneRef.current; if (ctx.state === "suspended") ctx.resume();
      const f = midiToFreq(48 + noteNameToPc(root)); const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "triangle"; o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      o.start(t); o.stop(t + 0.85);
    } catch {}
  };

  /* ---------- section editing ---------- */
  const setBoundary = (id, field) => { const t = getTime() ?? now; updateSong({ sections: sections.map((s) => (s.id === id ? { ...s, [field]: Math.round(t * 10) / 10 } : s)) }); };
  const patchSection = (id, patch) => updateSong({ sections: sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const addSection = () => { const last = sections[sections.length - 1]; const start = last ? last.end : 0; updateSong({ sections: [...sections, { id: newId(), name: "Section", start, end: start + 20, root: "E", scaleId: "majorPent", pos: 0 }] }); };
  const delSection = (id) => updateSong({ sections: sections.filter((s) => s.id !== id) });
  const addSong = () => { const s = { id: newId(), title: "New song", artist: "", youtubeId: "", sections: [{ id: newId(), name: "Section", start: 0, end: 30, root: "E", scaleId: "majorPent", pos: 0 }] }; persist([...songs, s]); setSelId(s.id); };
  const delSong = (id) => { const l = songs.filter((s) => s.id !== id); persist(l); if (selId === id) setSelId(l[0]?.id || null); };
  const doExport = () => { setShowData(true); setDataText(JSON.stringify(songs, null, 2)); };
  const doImport = () => { try { const v = JSON.parse(dataText); if (Array.isArray(v)) { persist(v); setSelId(v[0]?.id || null); setShowData(false); } } catch { alert("Invalid JSON"); } };

  /* ---------- fretboard for the current section ---------- */
  const sec = curSection || sections[0] || null;
  const names = useMemo(() => buildNoteNames(sec ? sec.root : "C"), [sec]);
  const rootPc = sec ? noteNameToPc(sec.root) : 0;
  const baseSet = new Set(sec ? SCALES[sec.scaleId].ints : []);
  const rows = [...OPEN_MIDI].reverse();
  const openW = 38, fretW = 40, rowH = 28, neckW = openW + FRETS * fretW, neckH = 6 * rowH;
  const noteX = (f) => (f === 0 ? openW / 2 : openW + (f - 0.5) * fretW);
  const noteY = (r) => (r + 0.5) * rowH;
  const inlays = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
  const pos = sec ? sec.pos : 0;

  return (
    <div className="lp-root">
      <style>{`
        .lp-root{ --ink:${C.ink};--muted:${C.muted};--line:${C.line};
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--ink);
          background: linear-gradient(${C.grid} 1px, transparent 1px), linear-gradient(90deg, ${C.grid} 1px, transparent 1px), ${C.paper};
          background-size: 24px 24px, 24px 24px; padding: 22px; border-radius: 8px; box-shadow: inset 0 0 0 1.5px rgba(220,230,236,0.16); }
        .lp-mono{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, "Courier New", monospace; }
        .lp-title{ font-family: ui-monospace, monospace; font-size: 26px; font-weight: 700; letter-spacing: 1px; margin: 0; }
        .lp-sub{ font-family: ui-monospace, monospace; font-size: 12.5px; color: var(--muted); margin: 4px 0 0; }
        .lp-eyebrow{ font-family: ui-monospace, monospace; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: var(--muted); }
        .lp-btn{ font-family: ui-monospace, monospace; font-size: 12px; padding: 7px 11px; border-radius: 3px; cursor: pointer;
          border:1.5px solid var(--line); background: rgba(255,255,255,.05); color: var(--ink); transition: all .12s; }
        .lp-btn:hover{ border-color: var(--ink); }
        .lp-btn.on{ background: var(--ink); color: ${C.paper}; border-color: var(--ink); }
        .lp-chip{ font-family: ui-monospace, monospace; font-size: 12px; padding: 7px 10px; border-radius:4px; cursor:pointer;
          border:1.5px solid var(--line); background: rgba(255,255,255,.04); color: var(--ink); }
        .lp-chip.on{ background: ${C.sun}; border-color:${C.sunDeep}; color:#fff; }
        .lp-in{ font-family: ui-monospace, monospace; font-size:12px; padding:6px 8px; border-radius:3px; border:1.5px solid var(--line); background:#0b0b0b; color:var(--ink); }
        .lp-card{ border:1.5px solid var(--ink); background: rgba(255,255,255,.04); border-radius:4px; padding:12px 14px; }
        .lp-seg{ position:relative; height:34px; border-radius:4px; border:1.5px solid var(--line); overflow:hidden; cursor:pointer; display:flex; align-items:center; justify-content:center; transition: all .12s; }
        .lp-seg.on{ border-color:${C.sun}; box-shadow: inset 0 0 0 1px ${C.sun}; }
        .lp-node{ display:flex; align-items:center; justify-content:center; font-family: ui-monospace, monospace; font-weight:700; border-radius:999px; user-select:none; }
      `}</style>

      <div className="lp-eyebrow">Guitar Theory Coach · Live</div>
      <h1 className="lp-title">LIVE PLAYER</h1>
      <p className="lp-sub">Play a song; the fretboard follows the sections. Loop the solo, slow it down, drill it. Sections are local & editable.</p>

      {/* song picker */}
      <div style={{ marginTop: 14, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {songs.map((s) => (
          <button key={s.id} className={"lp-chip" + (s.id === selId ? " on" : "")} onClick={() => { setSelId(s.id); setNow(0); }}>{s.title}</button>
        ))}
        <button className="lp-btn" onClick={addSong}>+ song</button>
        <button className="lp-btn" onClick={doExport}>⤓ data</button>
        {song && <button className="lp-btn" onClick={() => delSong(song.id)} style={{ borderColor: C.red, color: C.red }}>✕ song</button>}
      </div>

      {!song ? <div className="lp-card" style={{ marginTop: 14, color: C.muted }}>No song — add one.</div> : (
        <>
          {/* source toggle */}
          <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span className="lp-eyebrow">Source</span>
            <button className={"lp-btn" + (srcType === "audio" ? " on" : "")} onClick={() => setSrcType("audio")}>♪ my MP3</button>
            <button className={"lp-btn" + (srcType === "youtube" ? " on" : "")} onClick={() => setSrcType("youtube")}>▶ YouTube</button>
            {srcType === "audio" ? (
              <label className="lp-btn" style={{ cursor: "pointer" }}>load mp3<input type="file" accept="audio/*" onChange={onFile} style={{ display: "none" }} /></label>
            ) : (
              <>
                <input className="lp-in" style={{ minWidth: 220 }} placeholder="YouTube URL or video ID" value={ytId} onChange={(e) => setYtId(e.target.value)} />
                <button className="lp-btn" onClick={loadYouTube}>load</button>
              </>
            )}
          </div>

          {/* the players */}
          {srcType === "audio" && audioUrl && (
            <audio ref={audioRef} src={audioUrl} onLoadedMetadata={onAudioMeta} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} style={{ display: "none" }} />
          )}
          {srcType === "youtube" && (
            <div style={{ marginTop: 10, maxWidth: 480 }}>
              <div ref={ytElRef} />
              {!ytReady && <div className="lp-mono" style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Paste a link and press load. (YouTube mode needs internet.)</div>}
            </div>
          )}

          {/* transport */}
          <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button className="lp-btn on" onClick={playPause} style={{ minWidth: 70 }}>{playing ? "❚❚ pause" : "▶ play"}</button>
            <span className="lp-mono" style={{ fontSize: 12, color: C.muted, minWidth: 90 }}>{mmss(now)} / {mmss(dur)}</span>
            <input type="range" min="0" max={dur || 0} step="0.1" value={now} onChange={(e) => seek(Number(e.target.value))} style={{ flex: "1 1 200px" }} />
            <span className="lp-mono" style={{ fontSize: 11, color: C.muted }}>speed</span>
            {[0.5, 0.75, 1].map((r) => (
              <button key={r} className={"lp-btn" + (speed === r ? " on" : "")} onClick={() => setRate(r)} style={{ padding: "5px 8px" }}>{r}×</button>
            ))}
            <button className={"lp-btn" + (loopSec ? " on" : "")} onClick={() => { setLoopSec((v) => !v); if (!loopId && curSection) setLoopId(curSection.id); }} title="Loop the chosen section">⟳ loop</button>
          </div>

          {/* sections timeline */}
          <div style={{ marginTop: 14 }}>
            <div className="lp-eyebrow" style={{ marginBottom: 6 }}>
              Sections {curSection && <span style={{ color: C.sun }}> · now: {curSection.name} ({curSection.root} {SCALES[curSection.scaleId].name})</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${sections.length || 1}, 1fr)`, gap: 4 }}>
              {sections.map((s) => {
                const isNow = curSection?.id === s.id;
                const isLoop = loopSec && loopId === s.id;
                const prog = isNow && s.end > s.start ? Math.min(1, Math.max(0, (now - s.start) / (s.end - s.start))) : 0;
                return (
                  <div key={s.id} className={"lp-seg" + (isNow ? " on" : "")} onClick={() => { seek(s.start); setLoopId(s.id); }} title={`${mmss(s.start)}–${mmss(s.end)} · jump`}>
                    {isNow && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${prog * 100}%`, background: "rgba(255,122,46,.22)" }} />}
                    {isLoop && <div style={{ position: "absolute", inset: 0, border: `1.5px dashed ${C.violet}`, borderRadius: 3, pointerEvents: "none" }} />}
                    <span className="lp-mono" style={{ fontSize: 11, fontWeight: 700, zIndex: 1, color: isNow ? C.sun : C.ink }}>{s.name}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* fretboard for current section */}
          <div style={{ marginTop: 14, overflowX: "auto", paddingBottom: 6 }}>
            <div style={{ minWidth: neckW + 48 }}>
              <div style={{ position: "relative", height: 15, marginLeft: 44 }}>
                {Array.from({ length: FRETS + 1 }, (_, f) => (<div key={f} className="lp-mono" style={{ position: "absolute", left: noteX(f) - 7, width: 14, textAlign: "center", fontSize: 9, color: f !== 0 && f % 12 === 0 ? C.sun : C.muted }}>{f}</div>))}
              </div>
              <div style={{ display: "flex" }}>
                <div style={{ width: 44, position: "relative", height: neckH }}>
                  {rows.map((m, r) => (<div key={r} className="lp-mono" style={{ position: "absolute", top: noteY(r) - 7, right: 6, fontSize: 11, fontWeight: 700 }}>{names[m % 12]}</div>))}
                </div>
                <div style={{ position: "relative", width: neckW, height: neckH, background: "linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.012))", border: `1.5px solid ${C.ink}`, borderLeft: "none" }}>
                  <div style={{ position: "absolute", left: openW, top: 0, width: 3, height: neckH, background: C.ink }} />
                  {Array.from({ length: FRETS }, (_, i) => i + 1).map((f) => (<div key={f} style={{ position: "absolute", left: openW + f * fretW, top: 0, width: f % 12 === 0 ? 2 : 1, height: neckH, background: f % 12 === 0 ? C.cyan : C.line }} />))}
                  {rows.map((_, r) => (<div key={r} style={{ position: "absolute", left: openW, right: 0, top: noteY(r), height: 1, background: C.line, opacity: 0.7 }} />))}
                  {inlays.filter((d) => d <= FRETS).map((d) => (<div key={d} style={{ position: "absolute", left: noteX(d) - 4, top: neckH / 2 - 4, width: 8, height: 8, borderRadius: 999, border: `1.5px solid ${d % 12 === 0 ? C.cyan : C.line}`, opacity: 0.6 }} />))}
                  <div style={{ position: "absolute", top: 0, height: neckH, zIndex: 1, pointerEvents: "none",
                    left: pos === 0 ? 0 : openW + (pos - 1) * fretW, width: (openW + (pos + 4) * fretW) - (pos === 0 ? 0 : openW + (pos - 1) * fretW),
                    background: "rgba(255,122,46,0.07)", border: `1px dashed ${C.sun}`, borderRadius: 4 }} />
                  {rows.map((open, r) =>
                    Array.from({ length: FRETS + 1 }, (_, f) => {
                      const pc = (open + f) % 12; const semis = (pc - rootPc + 12) % 12;
                      if (!baseSet.has(semis)) return null;
                      const label = DEG[semis]; const isRoot = semis === 0; const inPos = f >= pos && f <= pos + 4;
                      const role = isRoot ? { bg: C.sun, br: C.sunDeep, tx: "#fff" } : (semis === 3 || semis === 4 ? { bg: C.cyan, br: "#1F7E96", tx: "#06222B" } : { bg: C.blue, br: "#123F62", tx: "#EAF2F7" });
                      const size = isRoot ? 21 : 19;
                      return (
                        <div key={r + "-" + f} className="lp-node" title={`${names[pc]} · ${label}`}
                          style={{ position: "absolute", left: noteX(f) - size / 2, top: noteY(r) - size / 2, width: size, height: size, fontSize: 9,
                            background: role.bg, color: role.tx, border: `2px solid ${role.br}`, opacity: inPos ? 1 : 0.28, zIndex: 2,
                            boxShadow: isRoot && inPos ? `0 0 0 3px rgba(255,122,46,.3)` : "none" }}>{label}</div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* section editor toggle */}
          <div style={{ marginTop: 12 }}>
            <button className={"lp-btn" + (edit ? " on" : "")} onClick={() => setEdit((v) => !v)}>✎ edit sections</button>
            {edit && (
              <div className="lp-card" style={{ marginTop: 10 }}>
                <div className="lp-mono" style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>Play your track, then use "⌖ start/end" to capture the playhead time into a section. Set each section's key, scale, and box position.</div>
                {sections.map((s) => (
                  <div key={s.id} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", padding: "6px 0", borderTop: `1px dashed ${C.grid}` }}>
                    <input className="lp-in" style={{ width: 110 }} value={s.name} onChange={(e) => patchSection(s.id, { name: e.target.value })} />
                    <button className="lp-btn" onClick={() => setBoundary(s.id, "start")} style={{ padding: "5px 7px" }}>⌖ start {mmss(s.start)}</button>
                    <button className="lp-btn" onClick={() => setBoundary(s.id, "end")} style={{ padding: "5px 7px" }}>⌖ end {mmss(s.end)}</button>
                    <select className="lp-in" value={s.root} onChange={(e) => patchSection(s.id, { root: e.target.value })}>{ROOTS.map((r) => <option key={r} value={r}>{r}</option>)}</select>
                    <select className="lp-in" value={s.scaleId} onChange={(e) => patchSection(s.id, { scaleId: e.target.value })}>{SOLO_SCALES.map((id) => <option key={id} value={id}>{SCALES[id].name}</option>)}</select>
                    <label className="lp-mono" style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 4 }}>box<input type="number" min="0" max={FRETS - 4} className="lp-in" style={{ width: 52 }} value={s.pos} onChange={(e) => patchSection(s.id, { pos: Number(e.target.value) })} /></label>
                    <button className="lp-btn" onClick={() => ping(s.root)} style={{ padding: "5px 7px" }}>♪</button>
                    <button className="lp-btn" onClick={() => delSection(s.id)} style={{ padding: "5px 7px", borderColor: C.red, color: C.red }}>✕</button>
                  </div>
                ))}
                <button className="lp-btn" onClick={addSection} style={{ marginTop: 8 }}>+ section</button>
              </div>
            )}
          </div>

          {showData && (
            <div className="lp-card" style={{ marginTop: 12 }}>
              <div className="lp-eyebrow" style={{ marginBottom: 6 }}>Data (JSON) — back up or paste AI-generated songs, then Import</div>
              <textarea className="lp-in" style={{ width: "100%", minHeight: 120, whiteSpace: "pre" }} value={dataText} onChange={(e) => setDataText(e.target.value)} />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="lp-btn on" onClick={doImport}>Import (replace all)</button>
                <button className="lp-btn" onClick={() => setShowData(false)}>close</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
