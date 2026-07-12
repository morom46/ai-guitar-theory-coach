import React, { useEffect, useMemo, useRef, useState } from "react";
import { DEG, SCALES, CHORDS, midiToFreq, noteNameToPc, ROOTS } from "../theory/engine.js";
import { C, keyToneStyle, chordToneStyle } from "../ui/theme.js";
import Neck from "./Neck.jsx";
import ToneStrip from "./ToneStrip.jsx";

/**
 * LIVE PLAYER (Phase 1.5) — play a song and watch the fretboard follow along.
 * A clock (your own MP3, or a YouTube video) drives a requestAnimationFrame
 * loop; the song is divided into sections (intro / verse / solo …) and the
 * neck shows each section's scale + box as the playhead moves.
 *
 * CHORD FOLLOW: each section can hold a chord progression (tap-captured
 * from the playhead, with an optional repeat cycle). As the chords change, the
 * solo notes transform: chord tones glow (or the neck shows only the chord's
 * arpeggio), and labels can re-number relative to the CURRENT chord so you
 * always see your target tones. All data is local (offline-editable).
 */

const FRETS = 24;
const SOLO_SCALES = ["majorPent", "minorPent", "major", "aeolian", "dorian", "mixolydian"];
const CHORD_QS = Object.keys(CHORDS); // maj, min, dim, aug, maj7, dom7, min7, m7b5

const SEED = [
  {
    id: "yl", title: "Yellow Ledbetter", artist: "Pearl Jam", youtubeId: "",
    sections: [
      { id: "a", name: "Intro riff", start: 0, end: 33, root: "E", scaleId: "majorPent", pos: 0, cycle: 13.5,
        chords: [{ id: "a1", root: "E", q: "maj", start: 0 }, { id: "a2", root: "B", q: "maj", start: 4.5 }, { id: "a3", root: "A", q: "maj", start: 9 }] },
      { id: "b", name: "Verse 1", start: 33, end: 78, root: "E", scaleId: "majorPent", pos: 0, cycle: 13.5,
        chords: [{ id: "b1", root: "E", q: "maj", start: 33 }, { id: "b2", root: "B", q: "maj", start: 37.5 }, { id: "b3", root: "A", q: "maj", start: 42 }] },
      { id: "c", name: "Chorus", start: 78, end: 108, root: "A", scaleId: "majorPent", pos: 5, chords: [] },
      { id: "d", name: "Verse 2", start: 108, end: 150, root: "E", scaleId: "majorPent", pos: 0, chords: [] },
      { id: "e", name: "Solo", start: 150, end: 230, root: "E", scaleId: "majorPent", pos: 7, cycle: 13.5,
        chords: [{ id: "e1", root: "E", q: "maj", start: 150 }, { id: "e2", root: "B", q: "maj", start: 154.5 }, { id: "e3", root: "A", q: "maj", start: 159 }] },
      { id: "f", name: "Outro", start: 230, end: 300, root: "E", scaleId: "majorPent", pos: 0, chords: [] },
    ],
  },
];

const load = () => {
  try {
    const v = JSON.parse(localStorage.getItem("player.v1"));
    if (Array.isArray(v) && v.length) {
      // enrich saved seed songs with newly-seeded chords (only if the user has none anywhere)
      const enriched = v.map((s) => {
        const seed = SEED.find((x) => x.id === s.id);
        if (!seed || (s.sections || []).some((x) => x.chords?.length)) return s;
        return { ...s, sections: (s.sections || []).map((x) => { const ss = seed.sections.find((y) => y.id === x.id); return ss ? { ...x, chords: ss.chords || [], cycle: ss.cycle } : x; }) };
      });
      const ids = new Set(enriched.map((s) => s.id));
      return [...enriched, ...SEED.filter((s) => !ids.has(s.id))];
    }
  } catch {}
  return SEED;
};
const save = (l) => { try { localStorage.setItem("player.v1", JSON.stringify(l)); } catch {} };
const mmss = (t) => { if (!t && t !== 0) return "0:00"; const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, "0")}`; };
const newId = () => Math.random().toString(36).slice(2, 7);
const chordName = (ch) => ch.root + CHORDS[ch.q].sym;

export default function LivePlayer({ go }) {
  const [songs, setSongs] = useState(load);
  const [selId, setSelId] = useState(() => {
    try { const req = localStorage.getItem("player.sel"); if (req) { localStorage.removeItem("player.sel"); return req; } } catch {}
    return null;
  });
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
  const [chordView, setChordView] = useState("glow"); // "off" | "glow" | "only"
  const [relabel, setRelabel] = useState(false); // number the neck from the CURRENT chord's root

  const audioRef = useRef(null);
  const ytRef = useRef(null);
  const ytElRef = useRef(null);
  const lastNow = useRef(0);
  const toneRef = useRef(null);

  const song = songs.find((s) => s.id === selId) || songs[0] || null;
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
  const addSection = () => { const last = sections[sections.length - 1]; const start = last ? last.end : 0; updateSong({ sections: [...sections, { id: newId(), name: "Section", start, end: start + 20, root: "E", scaleId: "majorPent", pos: 0, chords: [] }] }); };
  const delSection = (id) => updateSong({ sections: sections.filter((s) => s.id !== id) });
  const addSong = () => { const s = { id: newId(), title: "New song", artist: "", youtubeId: "", sections: [{ id: newId(), name: "Section", start: 0, end: 30, root: "E", scaleId: "majorPent", pos: 0, chords: [] }] }; persist([...songs, s]); setSelId(s.id); };
  const delSong = (id) => { const l = songs.filter((s) => s.id !== id); persist(l); if ((song?.id) === id) setSelId(l[0]?.id || null); };
  const doExport = () => { setShowData(true); setDataText(JSON.stringify(songs, null, 2)); };
  const doImport = () => { try { const v = JSON.parse(dataText); if (Array.isArray(v)) { persist(v); setSelId(v[0]?.id || null); setShowData(false); } } catch { alert("Invalid JSON"); } };

  /* ---------- chord editing (tap-to-capture) ---------- */
  const sortChords = (list) => [...list].sort((a, b) => a.start - b.start);
  const patchChord = (secId2, chId, patch) =>
    updateSong({ sections: sections.map((s) => (s.id === secId2 ? { ...s, chords: sortChords((s.chords || []).map((c) => (c.id === chId ? { ...c, ...patch } : c))) } : s)) });
  const delChord = (secId2, chId) =>
    updateSong({ sections: sections.map((s) => (s.id === secId2 ? { ...s, chords: (s.chords || []).filter((c) => c.id !== chId) } : s)) });
  const captureChord = (s) => {
    const t = Math.round((getTime() ?? now) * 10) / 10;
    const start = Math.min(Math.max(t, s.start), s.end);
    const prev = (s.chords || []).filter((c) => c.start <= start).pop();
    const ch = { id: newId(), root: prev?.root || s.root, q: prev?.q || (SCALES[s.scaleId].ints.includes(4) ? "maj" : "min"), start };
    updateSong({ sections: sections.map((x) => (x.id === s.id ? { ...x, chords: sortChords([...(x.chords || []), ch]) } : x)) });
  };

  /* ---------- fretboard for the current section + chord ---------- */
  const sec = curSection || sections[0] || null;
  const baseSet = new Set(sec ? SCALES[sec.scaleId].ints : []);

  // effective time inside the section's chord cycle (a captured pass repeats)
  const effNow = sec && sec.cycle > 0 && now >= sec.start ? sec.start + ((now - sec.start) % sec.cycle) : now;
  const secChords = sortChords(sec?.chords || []);
  const curChord = useMemo(() => {
    if (!sec || !secChords.length) return null;
    let best = null;
    for (const c of secChords) if (c.start <= effNow + 0.02) best = c; else break;
    return best || secChords[0];
  }, [sec, secChords, effNow]);

  const chordOn = chordView !== "off" && !!curChord;
  const chordPc = curChord ? noteNameToPc(curChord.root) : 0;
  const chordInts = curChord ? new Set(CHORDS[curChord.q].ints) : new Set();
  const pos = sec ? sec.pos : 0;

  // chord lane geometry: the window is one cycle (if set) or the whole section
  const laneStart = sec ? sec.start : 0;
  const laneEnd = sec ? (sec.cycle > 0 ? sec.start + sec.cycle : sec.end) : 0;

  return (
    <div className="page">
      <style>{`
        .lp-seg{ position:relative; height:34px; border-radius:4px; border:1.5px solid var(--line); overflow:hidden; cursor:pointer; display:flex; align-items:center; justify-content:center; transition: all .12s; }
        .lp-seg.on{ border-color:var(--sun); box-shadow: inset 0 0 0 1px var(--sun); }
        .lp-chseg{ position:relative; height:26px; border-radius:3px; border:1.5px solid var(--line); overflow:hidden; cursor:pointer; display:flex; align-items:center; justify-content:center; transition: all .12s; }
        .lp-chseg.on{ border-color:var(--cyan); background: rgba(54,199,224,.16); box-shadow: inset 0 0 0 1px var(--cyan); }
      `}</style>

      <div className="eyebrow">Guitar Theory Coach · Live</div>
      <h1 className="page-title">LIVE PLAYER</h1>
      <p className="page-sub">Play a song; the fretboard follows the sections — and inside a section, the chords. Loop the solo, slow it down, chase the chord tones.</p>

      {/* song picker */}
      <div style={{ marginTop: 14, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {songs.map((s) => (
          <button key={s.id} className={"chip" + (s.id === (song?.id) ? " on" : "")} onClick={() => { setSelId(s.id); setNow(0); }}>{s.title}</button>
        ))}
        <button className="btn" onClick={addSong}>+ song</button>
        <button className="btn" onClick={doExport}>⤓ data</button>
        {song && <button className="btn" onClick={() => delSong(song.id)} style={{ borderColor: C.red, color: C.red }}>✕ song</button>}
      </div>

      {!song ? <div className="card" style={{ marginTop: 14, color: C.muted }}>No song — add one.</div> : (
        <>
          {/* amp settings for this song (Tone Match) */}
          <div style={{ marginTop: 10 }}>
            <ToneStrip title={song.title} go={go} />
          </div>

          {/* source toggle */}
          <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span className="eyebrow">Source</span>
            <button className={"btn" + (srcType === "audio" ? " on" : "")} onClick={() => setSrcType("audio")}>♪ my MP3</button>
            <button className={"btn" + (srcType === "youtube" ? " on" : "")} onClick={() => setSrcType("youtube")}>▶ YouTube</button>
            {srcType === "audio" ? (
              <label className="btn" style={{ cursor: "pointer" }}>load mp3<input type="file" accept="audio/*" onChange={onFile} style={{ display: "none" }} /></label>
            ) : (
              <>
                <input className="inp" style={{ minWidth: 220 }} placeholder="YouTube URL or video ID" value={ytId} onChange={(e) => setYtId(e.target.value)} />
                <button className="btn" onClick={loadYouTube}>load</button>
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
              {!ytReady && <div className="mono" style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Paste a link and press load. (YouTube mode needs internet.)</div>}
            </div>
          )}

          {/* transport */}
          <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn on" onClick={playPause} style={{ minWidth: 70 }}>{playing ? "❚❚ pause" : "▶ play"}</button>
            <span className="mono" style={{ fontSize: 12, color: C.muted, minWidth: 90 }}>{mmss(now)} / {mmss(dur)}</span>
            <input type="range" min="0" max={dur || 0} step="0.1" value={now} onChange={(e) => seek(Number(e.target.value))} style={{ flex: "1 1 200px" }} />
            <span className="mono" style={{ fontSize: 11, color: C.muted }}>speed</span>
            {[0.5, 0.75, 1].map((r) => (
              <button key={r} className={"btn" + (speed === r ? " on" : "")} onClick={() => setRate(r)} style={{ padding: "5px 8px" }}>{r}×</button>
            ))}
            <button className={"btn" + (loopSec ? " on" : "")} onClick={() => { setLoopSec((v) => !v); if (!loopId && curSection) setLoopId(curSection.id); }} title="Loop the chosen section">⟳ loop</button>
          </div>

          {/* sections timeline */}
          <div style={{ marginTop: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              Sections {curSection && <span style={{ color: C.sun }}> · now: {curSection.name} ({curSection.root} {SCALES[curSection.scaleId].name})</span>}
              {chordOn && <span style={{ color: C.cyan }}> · chord: {chordName(curChord)}</span>}
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
                    <span className="mono" style={{ fontSize: 11, fontWeight: 700, zIndex: 1, color: isNow ? C.sun : C.ink }}>{s.name}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* chord lane (current section's progression) */}
          {sec && secChords.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>
                Chords — {sec.name}{sec.cycle > 0 ? ` (repeats every ${sec.cycle}s)` : ""}
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {secChords.map((c, i) => {
                  const cEnd = secChords[i + 1]?.start ?? laneEnd;
                  const w = Math.max(1, cEnd - c.start);
                  const isNow = curChord?.id === c.id;
                  const prog = isNow && cEnd > c.start ? Math.min(1, Math.max(0, (effNow - c.start) / (cEnd - c.start))) : 0;
                  return (
                    <div key={c.id} className={"lp-chseg" + (isNow ? " on" : "")} style={{ flex: `${w} 1 0` }} onClick={() => seek(c.start)} title={`${chordName(c)} @ ${mmss(c.start)}`}>
                      {isNow && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${prog * 100}%`, background: "rgba(54,199,224,.15)" }} />}
                      <span className="mono" style={{ fontSize: 11, fontWeight: 700, zIndex: 1, color: isNow ? C.cyan : C.ink }}>{chordName(c)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* chord-follow controls */}
          <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="eyebrow">Chord follow</span>
            {["off", "glow", "only"].map((m) => (
              <button key={m} className={"btn" + (chordView === m ? " on" : "")} onClick={() => setChordView(m)} style={{ padding: "5px 9px" }}
                title={m === "off" ? "Ignore chords — show the section scale" : m === "glow" ? "Scale stays lit; the current chord's tones glow" : "Show only the current chord's arpeggio"}>
                {m}
              </button>
            ))}
            <span className="eyebrow" style={{ marginLeft: 8 }}>numbers from</span>
            <button className={"btn" + (!relabel ? " on" : "")} onClick={() => setRelabel(false)} style={{ padding: "5px 9px" }} title="Label degrees from the section's key">key</button>
            <button className={"btn" + (relabel ? " on" : "")} onClick={() => setRelabel(true)} style={{ padding: "5px 9px" }} title="Re-number from the CURRENT chord's root — its root reads 1, its 3rd reads 3…">chord</button>
            {chordOn && relabel && <span className="mono" style={{ fontSize: 11, color: C.cyan }}>1 = {curChord.root} ({chordName(curChord)})</span>}
            {sec && !secChords.length && <span className="mono" style={{ fontSize: 11, color: C.muted }}>no chords in this section yet — add them in ✎ edit</span>}
          </div>

          {/* fretboard for current section + chord */}
          <div style={{ marginTop: 10 }}>
            <Neck
              root={sec ? sec.root : "C"}
              frets={FRETS}
              boxes={[{ start: pos, color: C.sun, bg: "rgba(255,122,46,0.07)" }]}
              resolve={(pc, semis, { f, names }) => {
                const chSemis = (pc - chordPc + 12) % 12;         // degree from the current chord root
                const inScale = baseSet.has(semis);               // degree from the section key
                const isChordTone = chordOn && chordInts.has(chSemis);
                if (chordOn && chordView === "only") { if (!isChordTone) return null; }
                else if (!inScale && !isChordTone) return null;   // glow mode also lights out-of-scale chord tones
                const inPos = f >= pos && f <= pos + 4;
                const label = chordOn && relabel ? DEG[chSemis] : DEG[semis];
                const isRoot = semis === 0;
                let role, size, opacity, ring = "none";
                if (isChordTone) {
                  role = chordToneStyle(chSemis);
                  size = chSemis === 0 ? 25 : 23;   // chord tones glow slightly larger
                  opacity = inPos ? 1 : 0.55;
                  ring = chSemis === 0 ? "0 0 0 4px rgba(255,122,46,.35)" : "0 0 0 3px rgba(54,199,224,.28)";
                } else {
                  role = keyToneStyle(semis);
                  size = isRoot ? 23 : 21;          // standard NODE.md sizes
                  opacity = chordOn ? (inPos ? 0.35 : 0.15) : (inPos ? 1 : 0.28);
                  if (!chordOn && isRoot && inPos) ring = "0 0 0 3px rgba(255,122,46,.3)";
                }
                return {
                  label, ...role, size, opacity, boxShadow: ring,
                  zIndex: isChordTone ? 3 : 2,
                  title: `${names[pc]} · ${label}${isChordTone ? ` · ${chordName(curChord)} tone` : ""}`,
                };
              }}
            />
          </div>

          {/* section editor toggle */}
          <div style={{ marginTop: 12 }}>
            <button className={"btn" + (edit ? " on" : "")} onClick={() => setEdit((v) => !v)}>✎ edit sections</button>
            {edit && (
              <div className="card" style={{ marginTop: 10 }}>
                <div className="mono" style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>
                  Play your track, then "⌖ start/end" captures the playhead into a section. For chords: play the section and tap <b>⌖ chord</b> on every change — set "cycle" (seconds) if the progression repeats, so one captured pass follows the whole section.
                </div>
                {sections.map((s) => (
                  <div key={s.id} style={{ padding: "8px 0", borderTop: `1px dashed ${C.grid}` }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <input className="inp" style={{ width: 110 }} value={s.name} onChange={(e) => patchSection(s.id, { name: e.target.value })} />
                      <button className="btn" onClick={() => setBoundary(s.id, "start")} style={{ padding: "5px 7px" }}>⌖ start {mmss(s.start)}</button>
                      <button className="btn" onClick={() => setBoundary(s.id, "end")} style={{ padding: "5px 7px" }}>⌖ end {mmss(s.end)}</button>
                      <select className="inp" value={s.root} onChange={(e) => patchSection(s.id, { root: e.target.value })}>{ROOTS.map((r) => <option key={r} value={r}>{r}</option>)}</select>
                      <select className="inp" value={s.scaleId} onChange={(e) => patchSection(s.id, { scaleId: e.target.value })}>{SOLO_SCALES.map((id) => <option key={id} value={id}>{SCALES[id].name}</option>)}</select>
                      <label className="mono" style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 4 }}>box<input type="number" min="0" max={FRETS - 4} className="inp" style={{ width: 52 }} value={s.pos} onChange={(e) => patchSection(s.id, { pos: Number(e.target.value) })} /></label>
                      <button className="btn" onClick={() => ping(s.root)} style={{ padding: "5px 7px" }}>♪</button>
                      <button className="btn" onClick={() => delSection(s.id)} style={{ padding: "5px 7px", borderColor: C.red, color: C.red }}>✕</button>
                    </div>
                    {/* chords row */}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6, paddingLeft: 8 }}>
                      <span className="eyebrow" style={{ color: C.cyan }}>chords</span>
                      {sortChords(s.chords || []).map((c) => (
                        <span key={c.id} style={{ display: "inline-flex", gap: 3, alignItems: "center", border: `1px dashed ${C.line}`, borderRadius: 4, padding: "3px 5px" }}>
                          <select className="inp" style={{ padding: "3px 4px" }} value={c.root} onChange={(e) => patchChord(s.id, c.id, { root: e.target.value })}>{ROOTS.map((r) => <option key={r} value={r}>{r}</option>)}</select>
                          <select className="inp" style={{ padding: "3px 4px" }} value={c.q} onChange={(e) => patchChord(s.id, c.id, { q: e.target.value })}>{CHORD_QS.map((q) => <option key={q} value={q}>{CHORDS[q].sym || "maj"}</option>)}</select>
                          <input type="number" step="0.1" className="inp" style={{ width: 64, padding: "3px 4px" }} value={c.start} onChange={(e) => patchChord(s.id, c.id, { start: Number(e.target.value) })} title="start time (s)" />
                          <button className="btn" style={{ padding: "3px 5px", fontSize: 10 }} onClick={() => patchChord(s.id, c.id, { start: Math.round((getTime() ?? now) * 10) / 10 })} title="re-capture from playhead">⌖</button>
                          <button className="btn" style={{ padding: "3px 5px", fontSize: 10, borderColor: C.red, color: C.red }} onClick={() => delChord(s.id, c.id)}>✕</button>
                        </span>
                      ))}
                      <button className="btn" style={{ padding: "4px 8px", borderColor: C.cyan, color: C.cyan }} onClick={() => captureChord(s)} title="Add a chord change at the playhead">＋ ⌖ chord</button>
                      <label className="mono" style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 4 }}>
                        cycle<input type="number" step="0.1" min="0" className="inp" style={{ width: 60, padding: "3px 4px" }} value={s.cycle ?? 0}
                          onChange={(e) => { const v = Number(e.target.value); patchSection(s.id, { cycle: v > 0 ? v : undefined }); }} title="progression repeats every N seconds (0 = no repeat)" />s
                      </label>
                    </div>
                  </div>
                ))}
                <button className="btn" onClick={addSection} style={{ marginTop: 8 }}>+ section</button>
              </div>
            )}
          </div>

          {showData && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Data (JSON) — back up or paste AI-generated songs, then Import</div>
              <textarea className="inp" style={{ width: "100%", minHeight: 120, whiteSpace: "pre" }} value={dataText} onChange={(e) => setDataText(e.target.value)} />
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <button className="btn on" onClick={doImport}>Import (replace all)</button>
                <button className="btn" onClick={() => setShowData(false)}>close</button>
                <span className="mono" style={{ fontSize: 10.5, color: C.muted, alignSelf: "center" }}>
                  section: {'{'} name, start, end, root, scaleId, pos, cycle?, chords:[{'{'} root:"E", q:"maj", start {'}'}] {'}'}
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
