import React, { useState } from "react";
import FretboardDecoder from "./components/FretboardDecoder.jsx";
import EarTrainer from "./components/EarTrainer.jsx";
import ChordBuilder from "./components/ChordBuilder.jsx";
import NumberSystem from "./components/NumberSystem.jsx";
import SongPractice from "./components/SongPractice.jsx";
import LivePlayer from "./components/LivePlayer.jsx";
import SpotifyPage from "./components/SpotifyPage.jsx";

// The three numbered "lessons". Ear Trainer is a practice drill, set apart as
// an icon below. Every feature reads from the one engine (src/theory/engine.js).
const LESSONS = [
  { num: "01", id: "decoder", label: "Fretboard Decoder" },
  { num: "02", id: "chord", label: "Chord Builder" },
  { num: "03", id: "numbers", label: "Number System" },
];

export default function App() {
  // If we're returning from the Spotify OAuth redirect (?code=...), open the
  // Spotify page so SpotifyRecent can finish the token exchange.
  const [active, setActive] = useState(() => {
    try { if (new URL(window.location.href).searchParams.get("code")) return "spotify"; } catch {}
    return "decoder";
  });

  const render = () => {
    if (active === "ear") return <EarTrainer />;
    if (active === "live") return <LivePlayer />;
    if (active === "songs") return <SongPractice />;
    if (active === "spotify") return <SpotifyPage go={setActive} />;
    if (active === "chord") return <ChordBuilder />;
    if (active === "numbers") return <NumberSystem />;
    return <FretboardDecoder />;
  };

  return (
    <div className="shell">
      <header className="shell-bar">
        <div className="shell-brand">
          <span className="shell-sun" aria-hidden="true" />
          <div>
            <div className="shell-title">GUITAR THEORY COACH</div>
            <div className="shell-sub">decode the machine · six levels of pitch</div>
          </div>
        </div>
        <nav className="shell-nav" aria-label="Sections">
          {LESSONS.map((f) => (
            <button
              key={f.id}
              className={"shell-tab" + (active === f.id ? " on" : "")}
              onClick={() => setActive(f.id)}
              aria-current={active === f.id ? "page" : undefined}
            >
              <span className="shell-num">{f.num}</span> {f.label}
            </button>
          ))}
          <button
            className={"shell-live" + (active === "live" ? " on" : "")}
            onClick={() => setActive("live")}
            title="Live Player — play a song, follow the fretboard"
            aria-current={active === "live" ? "page" : undefined}
          >
            ▶ LIVE
          </button>
          <span className="shell-div" aria-hidden="true" />
          <button
            className={"shell-icon" + (active === "songs" ? " on" : "")}
            onClick={() => setActive("songs")}
            title="Song Practice — your songs on the fretboard"
            aria-label="Song Practice"
            aria-current={active === "songs" ? "page" : undefined}
          >
            🎵
          </button>
          <button
            className={"shell-icon" + (active === "spotify" ? " on" : "")}
            onClick={() => setActive("spotify")}
            title="Spotify — recently played, keys, send to practice"
            aria-label="Spotify"
            aria-current={active === "spotify" ? "page" : undefined}
            style={{ color: "#1DB954" }}
          >
            ♫
          </button>
          <button
            className={"shell-icon" + (active === "ear" ? " on" : "")}
            onClick={() => setActive("ear")}
            title="Ear Trainer — listen & identify"
            aria-label="Ear Trainer"
            aria-current={active === "ear" ? "page" : undefined}
          >
            🎧
          </button>
        </nav>
      </header>

      <main className="shell-main">{render()}</main>

      <footer className="shell-foot">
        One theory engine drives everything — every section consumes the same
        primitives from src/theory/engine.js.
      </footer>
    </div>
  );
}
