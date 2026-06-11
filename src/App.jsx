import React from "react";
import FretboardDecoder from "./components/FretboardDecoder.jsx";

// Product roadmap — every feature consumes the same theory engine
// (src/theory/engine.js). Only the Decoder ships in this baseline.
const FEATURES = [
  { num: "01", label: "Fretboard Decoder", ready: true },
  { num: "02", label: "Ear Trainer", ready: false },
  { num: "03", label: "Chord Builder", ready: false },
  { num: "04", label: "Number System", ready: false },
];

export default function App() {
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
              className={"shell-tab" + (f.ready ? " on" : "")}
              disabled={!f.ready}
              title={f.ready ? undefined : "Coming soon"}
            >
              <span className="shell-num">{f.num}</span> {f.label}
              {!f.ready && <span className="shell-soon">soon</span>}
            </button>
          ))}
        </nav>
      </header>

      <main className="shell-main">
        <FretboardDecoder />
      </main>

      <footer className="shell-foot">
        One theory engine drives everything — ear training, chord building and the
        number system will consume the same primitives as the Decoder.
      </footer>
    </div>
  );
}
