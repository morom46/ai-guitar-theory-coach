/**
 * METRONOME — React wiring.
 *
 * One Metronome instance lives in a provider at the app root so the transport
 * bar, the Decoder's progression player and anything else all share the same
 * tempo and the same beat. Settings persist to localStorage "met.v1".
 *
 * The scheduling maths and the Metronome class itself are in ./clock.js,
 * deliberately free of React so they can be unit tested.
 */

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Metronome, clampBpm } from "./clock.js";

const PREF_KEY = "met.v1";

// TWO contexts, deliberately. The beat position changes several times a
// second; the control surface almost never does. Putting both in one value
// meant every page holding `useMetronome()` re-rendered at the click rate —
// on the Decoder that is 150 fretboard nodes recomputed per subdivision — and
// it also re-ran every effect keyed on the context object.
const MetronomeCtx = createContext(null);
const BeatCtx = createContext({ bar: 0, beat: 0, subIndex: 0, isCountIn: false });

const loadSettings = () => {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return {};
    const v = JSON.parse(raw);
    const out = {};
    if (Number.isFinite(v.bpm)) out.bpm = clampBpm(v.bpm);
    if ([1, 2, 3, 4].includes(v.sub)) out.sub = v.sub;
    if (Number.isFinite(v.beatsPerBar) && v.beatsPerBar >= 1 && v.beatsPerBar <= 12) out.beatsPerBar = v.beatsPerBar;
    if (typeof v.accent === "boolean") out.accent = v.accent;
    if (Number.isFinite(v.countInBars)) out.countInBars = Math.max(0, Math.min(4, v.countInBars));
    if (typeof v.rampOn === "boolean") out.rampOn = v.rampOn;
    if (Number.isFinite(v.rampEveryBars)) out.rampEveryBars = Math.max(1, Math.min(32, v.rampEveryBars));
    if (Number.isFinite(v.rampBy)) out.rampBy = Math.max(1, Math.min(20, v.rampBy));
    if (Number.isFinite(v.rampMax)) out.rampMax = clampBpm(v.rampMax);
    return out;
  } catch {
    return {};
  }
};

export function MetronomeProvider({ children }) {
  const metRef = useRef(null);
  if (!metRef.current) metRef.current = new Metronome(loadSettings());
  const met = metRef.current;

  const [settings, setSettings] = useState(met.settings);
  const [running, setRunning] = useState(false);
  const [pos, setPos] = useState({ bar: 0, beat: 0, subIndex: 0, isCountIn: false });
  const [tapped, setTapped] = useState(null);

  useEffect(() => {
    const off = met.onTick((ev) => {
      setPos({ bar: ev.bar, beat: ev.beat, subIndex: ev.subIndex, isCountIn: !!ev.isCountIn });
      // The ramp mutates bpm from inside the scheduler; mirror it into React.
      if (ev.bpm !== undefined) {
        setSettings((s) => (s.bpm === ev.bpm ? s : { ...s, bpm: ev.bpm }));
      }
    });
    return off;
  }, [met]);

  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings]);

  useEffect(() => () => met.dispose(), [met]);

  const api = useMemo(
    () => ({
      ...settings,
      settings,
      running,
      tapped,
      patch(p) {
        setSettings(met.patch(p));
      },
      setBpm(n) {
        setSettings(met.patch({ bpm: clampBpm(n) }));
      },
      nudgeBpm(d) {
        setSettings(met.patch({ bpm: clampBpm(met.settings.bpm + d) }));
      },
      start() {
        met.start();
        setRunning(met.running); // start() refuses when there's no audio device
      },
      stop() {
        met.stop();
        setRunning(false);
      },
      toggle() {
        const r = met.toggle();
        setRunning(r);
        return r;
      },
      tap() {
        const bpm = met.tap();
        if (bpm) {
          setSettings({ ...met.settings });
          setTapped(bpm);
        }
        return bpm;
      },
      /** Used by Songs & Tones ("→ click") and the Decoder's progression. */
      setFromBpm(bpm, { start = false } = {}) {
        if (!Number.isFinite(bpm) || bpm <= 0) return;
        setSettings(met.patch({ bpm: clampBpm(bpm) }));
        if (start && !met.running) {
          met.start();
          // Mirror what actually happened: with no AudioContext the metronome
          // stays stopped, and the bar must not show a phantom ■.
          setRunning(met.running);
        }
      },
      /** Seconds per bar at the current tempo — handy for looping UIs. */
      barSeconds() {
        return (60 / met.settings.bpm) * met.settings.beatsPerBar;
      },
      onTick: (fn) => met.onTick(fn),
    }),
    [settings, running, tapped, met]
  );

  return (
    <MetronomeCtx.Provider value={api}>
      <BeatCtx.Provider value={pos}>{children}</BeatCtx.Provider>
    </MetronomeCtx.Provider>
  );
}

/**
 * Read the shared metronome's controls and settings. Stable across ticks —
 * safe to depend on in an effect. Returns null outside the provider, so a
 * component can degrade instead of crashing if it's rendered standalone.
 */
export function useMetronome() {
  return useContext(MetronomeCtx);
}

/**
 * Read the live beat position. Re-renders on every subdivision, so only call
 * this from something that actually draws the beat (the transport bar).
 */
export function useMetronomeBeat() {
  return useContext(BeatCtx);
}
