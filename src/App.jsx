import React, { useEffect, useState } from "react";
import FretboardDecoder from "./components/FretboardDecoder.jsx";
import EarTrainer from "./components/EarTrainer.jsx";
import ChordBuilder from "./components/ChordBuilder.jsx";
import NumberSystem from "./components/NumberSystem.jsx";
import ScaleLab from "./components/ScaleLab.jsx";
import SongPractice from "./components/SongPractice.jsx";
import SoloPlayer from "./components/SoloPlayer.jsx";
import TheoryPage from "./components/TheoryPage.jsx";
import ListenPage from "./components/ListenPage.jsx";
import TransportBar from "./components/TransportBar.jsx";
import { MetronomeProvider } from "./audio/useMetronome.jsx";

// Nav — three named groups, every tab uniform: icon (or lesson number) + label.
// Labels collapse to icons on narrow screens; tooltips keep the full names.
const NAV = [
  {
    group: "Learn",
    items: [
      { id: "theory", ic: "📖", label: "Theory", title: "The Theory Manual — the whole map, explained & heard" },
      { id: "decoder", ic: "01", num: true, label: "Decoder", title: "01 · Fretboard Decoder — notes, intervals, scales, modes" },
      { id: "chord", ic: "02", num: true, label: "Chords", title: "02 · Chord Builder — thirds stacked out of a scale" },
      { id: "numbers", ic: "03", num: true, label: "Numbers", title: "03 · Number System — think in numbers, play in every key" },
      { id: "scales", ic: "04", num: true, label: "Scales", title: "04 · The Scale Lab — relative vs parallel, why pentatonic works, formulas, interval shapes" },
    ],
  },
  {
    group: "Play",
    items: [
      { id: "solo", ic: "✦", label: "Solo", title: "Solo Player — a solo played back on the neck, coloured by what each note does" },
      { id: "songs", ic: "🎵", label: "Songs & Tones", title: "Songs & Tones — what to play + your Blackstar settings, per song" },
    ],
  },
  {
    group: "Tools",
    items: [
      { id: "ear", ic: "🎧", label: "Ear", title: "Ear Trainer — listen & identify" },
      { id: "listen", ic: "🎤", label: "Listen", title: "Listen — tuner, and drills the app checks by ear (uses your microphone)" },
    ],
  },
];

const loadTheme = () => {
  try { return localStorage.getItem("ui.theme") || "dark"; } catch { return "dark"; }
};

export default function App() {
  const [active, setActive] = useState("decoder");

  // dark ↔ warm light — flips every CSS variable (see index.css / ui/theme.js)
  const [theme, setTheme] = useState(loadTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("ui.theme", theme); } catch {}
  }, [theme]);

  const render = () => {
    if (active === "theory") return <TheoryPage go={setActive} />;
    if (active === "ear") return <EarTrainer />;
    if (active === "listen") return <ListenPage />;
    if (active === "solo") return <SoloPlayer />;
    if (active === "songs") return <SongPractice go={setActive} />;
    if (active === "tones") return <SongPractice />; /* old Tones page now lives inside Songs */
    if (active === "chord") return <ChordBuilder />;
    if (active === "numbers") return <NumberSystem />;
    if (active === "scales") return <ScaleLab />;
    return <FretboardDecoder />;
  };

  return (
    // The metronome lives above the router so the click keeps running (and
    // keeps its tempo) while you move between pages.
    <MetronomeProvider>
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
            {NAV.map((g) => (
              <div key={g.group} className="shell-group" role="group" aria-label={g.group}>
                <span className="shell-group-label" aria-hidden="true">{g.group}</span>
                {g.items.map((it) => (
                  <button
                    key={it.id}
                    className={"shell-tab" + (active === it.id ? " on" : "")}
                    onClick={() => setActive(it.id)}
                    title={it.title}
                    aria-label={it.label}
                    aria-current={active === it.id ? "page" : undefined}
                  >
                    <span className={"ic" + (it.num ? " num" : "")} style={it.color && active !== it.id ? { color: it.color } : undefined} aria-hidden="true">{it.ic}</span>
                    <span className="lab">{it.label}</span>
                  </button>
                ))}
              </div>
            ))}
            <span className="shell-div" aria-hidden="true" />
            <button
              className="shell-icon"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              title={theme === "dark" ? "Switch to warm light theme" : "Switch to dark theme"}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? "☀" : "☾"}
            </button>
          </nav>
        </header>

        <main className="shell-main">{render()}</main>

        <footer className="shell-foot">
          One theory engine drives everything — every section consumes the same
          primitives from src/theory/engine.js.
        </footer>

        <TransportBar />
      </div>
    </MetronomeProvider>
  );
}
