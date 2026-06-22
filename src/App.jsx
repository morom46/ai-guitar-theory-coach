import React, { useState } from "react";
import FretboardDecoder from "./components/FretboardDecoder.jsx";
import EarTrainer from "./components/EarTrainer.jsx";
import ChordBuilder from "./components/ChordBuilder.jsx";
import NumberSystem from "./components/NumberSystem.jsx";

// Product roadmap — every feature consumes the same theory engine
// (src/theory/engine.js). `id` maps to the component rendered below.
const FEATURES = [
  { num: "01", id: "decoder", label: "Fretboard Decoder", ready: true },
  { num: "02", id: "ear", label: "Ear Trainer", ready: true },
  { num: "03", id: "chord", label: "Chord Builder", ready: true },
  { num: "04", id: "numbers", label: "Number System", ready: true },
];

export default function App() {
  const [active, setActive] = useState("decoder");

  const render = () => {
    if (active === "ear") return <EarTrainer />;
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
            <div className="shell-title">AI GUITAR THEORY COACH</div>
            <div className="shell-sub">decode the machine · six levels of pitch</div>
          </div>
        </div>
        <nav className="shell-nav" aria-label="Features">
          {FEATURES.map((f) => (
            <button
              key={f.num}
              className={"shell-tab" + (active === f.id ? " on" : "")}
              disabled={!f.ready}
              onClick={() => f.ready && setActive(f.id)}
              title={f.ready ? undefined : "Coming soon"}
            >
              <span className="shell-num">{f.num}</span> {f.label}
              {!f.ready && <span className="shell-soon">soon</span>}
            </button>
          ))}
        </nav>
      </header>

      <main className="shell-main">{render()}</main>

      <footer className="shell-foot">
        One theory engine drives everything — every feature consumes the same
        primitives from src/theory/engine.js.
      </footer>
    </div>
  );
}
