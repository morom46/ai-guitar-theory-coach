import React, { useMemo } from "react";
import { C } from "../ui/theme.js";
import { findSongTone } from "../data/songs.js";

/**
 * TONE STRIP — one compact line of amp settings, shown next to a song in
 * the Live Player when the song library has a matching tone.
 * "→ tone" opens the full amp panel on the Songs & Tones page.
 */
export default function ToneStrip({ title, go }) {
  const hit = useMemo(() => findSongTone(title), [title]);
  if (!hit) return null;
  const tone = hit.tone;
  const fxOn = ["mod", "dly", "rev"].filter((k) => tone.fx?.[k]?.on);
  const fxTxt = fxOn.length
    ? fxOn.map((k) => `${k} ${tone.fx[k].type.toLowerCase()} ${tone.fx[k].level}`).join(" · ")
    : "no fx";
  const open = () => {
    try { localStorage.setItem("songs.sel", hit.songId); } catch {}
    go && go("songs");
  };
  return (
    <div className="mono" style={{
      display: "inline-flex", gap: 10, alignItems: "center", flexWrap: "wrap",
      fontSize: 11.5, padding: "5px 10px", borderRadius: 3,
      border: `1px dashed ${C.sunDeep}`, background: "rgba(255,122,46,.08)",
    }}>
      <span style={{ color: C.sun, fontWeight: 700 }}>🎛 {tone.voice}</span>
      <span>gain {tone.gain} · ISF {tone.isf}</span>
      <span style={{ color: C.muted }}>{fxTxt}</span>
      <span style={{ color: C.muted }}>pickup {tone.pickup}</span>
      {go && (
        <button className="link sm" style={{ cursor: "pointer", borderColor: C.sun, color: C.sun }} onClick={open} title="Open the full amp panel on the Songs & Tones page">→ tone</button>
      )}    </div>
  );
}

