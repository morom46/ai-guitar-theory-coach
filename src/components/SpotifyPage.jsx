import React, { useState } from "react";
import SpotifyRecent from "./SpotifyRecent.jsx";
import PracticePanel from "./PracticePanel.jsx";
import { ROOTS, noteNameToPc } from "../theory/engine.js";
import { C } from "../ui/theme.js";
import { loadSongs, saveSongs, defaultTone } from "../data/songs.js";

/**
 * SPOTIFY PAGE — your listening in one dedicated place.
 * Recently-played tracks (+ auto key via the key-proxy) with three "send to"
 * actions per track: ▸ decode (load key onto the Fretboard Decoder),
 * + songs (add to Songs & Tones), + live (add to the Live Player).
 * Below: pick any key and get backing tracks / curated songs (PracticePanel).
 */

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
      tone: defaultTone(),
    };
    saveSongs([...loadSongs(), song]);
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
        <button className="link sm" style={{ cursor: "pointer", borderColor: C.sun, color: C.sun }}
          onClick={() => sendToDecoder(keyStr)} title="Load this key onto the Fretboard Decoder">▸ decode</button>
      )}
      {keyStr && (
        <button className="link sm" style={{ cursor: "pointer" }}
          onClick={() => sendToSongs(track, keyStr)} title="Add to Songs & Tones with this key">＋ songs</button>
      )}
      <button className="link sm" style={{ cursor: "pointer" }}
        onClick={() => sendToLive(track, keyStr)} title="Add to the Live Player (edit sections there)">＋ live</button>
    </>
  );

  return (
    <div className="page">
      <div className="eyebrow">Guitar Theory Coach · Listening</div>
      <h1 className="page-title">SPOTIFY</h1>
      <p className="page-sub">
        Your recently played tracks with their keys — send any song to the Decoder (▸ decode),
        Songs & Tones (＋ songs) or the Live Player (＋ live).
      </p>

      <div style={{ marginTop: 16 }}>
        <SpotifyRecent actions={actions} />
      </div>

      {/* pick-a-key practice links (backing tracks + curated songs) */}
      <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className="eyebrow">Practice links for any key:</span>
        <select className="inp" value={pickRoot} onChange={(e) => setPickRoot(e.target.value)}>
          {ROOTS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button className={"btn" + (!pickMinor ? " on" : "")} onClick={() => setPickMinor(false)}>major</button>
        <button className={"btn" + (pickMinor ? " on" : "")} onClick={() => setPickMinor(true)}>minor</button>
      </div>
      <PracticePanel keyLabel={pickRoot} tonality={pickMinor ? "minor" : "major"} keyId={pickRoot + (pickMinor ? "min" : "maj")} spotify={false} />
    </div>
  );
}
