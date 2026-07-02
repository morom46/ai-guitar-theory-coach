import React, { useState } from "react";
import SpotifyRecent from "./SpotifyRecent.jsx";
import PracticePanel from "./PracticePanel.jsx";
import { ROOTS, noteNameToPc } from "../theory/engine.js";

/**
 * SPOTIFY PAGE — your listening in one dedicated place.
 * Recently-played tracks (+ auto key via the key-proxy) with three "send to"
 * actions per track: ▸ decode (load key onto the Fretboard Decoder),
 * + songs (add to Song Practice), + live (add to the Live Player).
 * Below: pick any key and get backing tracks / curated songs (PracticePanel).
 */

const C = {
  paper: "#000000", ink: "#DCE6EC", line: "#3A4853", sun: "#FF7A2E", sunDeep: "#E0601B",
  green: "#1DB954", muted: "#7C8A95", grid: "rgba(120,150,170,0.10)",
};

// "Em" / "F#m" / "C" → { root, minor } using the engine's preferred spellings.
const parseKey = (keyStr) => {
  if (!keyStr) return null;
  const minor = /m$/.test(keyStr) && !/maj$/i.test(keyStr);
  const token = keyStr.replace(/m$/, "").trim();
  if (!/^[A-Ga-g]/.test(token)) return null;
  const pc = noteNameToPc(token);
  const root = ROOTS.find((r) => noteNameToPc(r) === pc) || "C";
  return { root, minor };
};

const lsGetArr = (k) => { try { const v = JSON.parse(localStorage.getItem(k)); return Array.isArray(v) ? v : []; } catch { return []; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)); } catch {} };
const newId = () => "sp" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

export default function SpotifyPage({ go }) {
  const [pickRoot, setPickRoot] = useState("A");
  const [pickMinor, setPickMinor] = useState(true);

  /* ---------- send-to actions ---------- */
  const sendToDecoder = (keyStr) => { lsSet("decode.req", keyStr); go && go("decoder"); };

  const sendToSongs = (track, keyStr) => {
    const k = parseKey(keyStr); if (!k) return;
    const song = {
      id: newId(), title: track.name, artist: track.artist,
      root: k.root, minor: k.minor, scaleId: k.minor ? "minorPent" : "majorPent", extras: [],
    };
    lsSet("songs.v1", [...lsGetArr("songs.v1"), song]);
    lsSet("songs.sel", song.id);
    go && go("songs");
  };

  const sendToLive = (track, keyStr) => {
    const k = parseKey(keyStr) || { root: "E", minor: false };
    const song = {
      id: newId(), title: track.name, artist: track.artist, youtubeId: "",
      sections: [{ id: newId(), name: "Whole song", start: 0, end: 240, root: k.root, scaleId: k.minor ? "minorPent" : "majorPent", pos: 0, chords: [] }],
    };
    lsSet("player.v1", [...lsGetArr("player.v1"), song]);
    lsSet("player.sel", song.id);
    go && go("live");
  };

  const actions = (track, keyStr) => (
    <>
      {keyStr && (
        <button className="sp-link" style={{ cursor: "pointer", borderColor: C.sun, color: C.sun }}
          onClick={() => sendToDecoder(keyStr)} title="Load this key onto the Fretboard Decoder">▸ decode</button>
      )}
      {keyStr && (
        <button className="sp-link" style={{ cursor: "pointer" }}
          onClick={() => sendToSongs(track, keyStr)} title="Add to Song Practice with this key">＋ songs</button>
      )}
      <button className="sp-link" style={{ cursor: "pointer" }}
        onClick={() => sendToLive(track, keyStr)} title="Add to the Live Player (edit sections there)">＋ live</button>
    </>
  );

  return (
    <div className="spf-root">
      <style>{`
        .spf-root{ --ink:${C.ink};--muted:${C.muted};--line:${C.line};
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--ink);
          background: linear-gradient(${C.grid} 1px, transparent 1px), linear-gradient(90deg, ${C.grid} 1px, transparent 1px), ${C.paper};
          background-size: 24px 24px, 24px 24px; padding: 22px; border-radius: 8px; box-shadow: inset 0 0 0 1.5px rgba(220,230,236,0.16); }
        .spf-title{ font-family: ui-monospace, monospace; font-size: 26px; font-weight: 700; letter-spacing: 1px; margin: 0; }
        .spf-sub{ font-family: ui-monospace, monospace; font-size: 12.5px; color: var(--muted); margin: 4px 0 0; }
        .spf-eyebrow{ font-family: ui-monospace, monospace; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: var(--muted); }
        .spf-in{ font-family: ui-monospace, monospace; font-size:12px; padding:6px 8px; border-radius:3px; border:1.5px solid var(--line); background:#0b0b0b; color:var(--ink); }
        .spf-btn{ font-family: ui-monospace, monospace; font-size: 12px; padding: 6px 10px; border-radius: 3px; cursor: pointer;
          border:1.5px solid var(--line); background: rgba(255,255,255,.05); color: var(--ink); }
        .spf-btn.on{ background: var(--ink); color: ${C.paper}; border-color: var(--ink); }
      `}</style>

      <div className="spf-eyebrow">Guitar Theory Coach · Listening</div>
      <h1 className="spf-title">SPOTIFY</h1>
      <p className="spf-sub">
        Your recently played tracks with their keys — send any song to the Decoder (▸ decode),
        Song Practice (＋ songs) or the Live Player (＋ live).
      </p>

      <div style={{ marginTop: 16 }}>
        <SpotifyRecent actions={actions} />
      </div>

      {/* pick-a-key practice links (backing tracks + curated songs) */}
      <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className="spf-eyebrow">Practice links for any key:</span>
        <select className="spf-in" value={pickRoot} onChange={(e) => setPickRoot(e.target.value)}>
          {ROOTS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button className={"spf-btn" + (!pickMinor ? " on" : "")} onClick={() => setPickMinor(false)}>major</button>
        <button className={"spf-btn" + (pickMinor ? " on" : "")} onClick={() => setPickMinor(true)}>minor</button>
      </div>
      <PracticePanel keyLabel={pickRoot} tonality={pickMinor ? "minor" : "major"} keyId={pickRoot + (pickMinor ? "min" : "maj")} spotify={false} />
    </div>
  );
}
