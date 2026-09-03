import React, { useEffect, useRef, useState } from "react";
import { C } from "../ui/theme.js";
import { useMetronome, useMetronomeBeat } from "../audio/useMetronome.jsx";
import { SUBDIVISIONS, BPM_MIN, BPM_MAX } from "../audio/clock.js";
import { subscribe, setMuted, setVolume, setClickVolume, setDroneVolume, setVoice, resume } from "../audio/engine.js";
import { useDrone } from "../audio/useDrone.js";
import { ROOTS } from "../theory/engine.js";

/**
 * THE TRANSPORT — a metronome docked to the bottom of every page.
 *
 * It lives in the shell rather than on a "metronome page" on purpose: the
 * click is not a topic you visit, it's the thing that has to be running
 * underneath whatever else you're doing. Start it on the Decoder, walk to
 * Songs & Tones, it's still going at the same tempo.
 *
 * Collapsed it's a single pill showing tempo and beat. Expanded it holds the
 * full kit: subdivisions, time signature, count-in, tap tempo, a speed-trainer
 * ramp, the DRONE, and the app's global sound settings (voice, volume, mute).
 *
 * The drone lives here for the same reason the click does: it is not a topic
 * you visit, it is the thing that has to be sounding underneath whatever page
 * you happen to be on.
 *
 * Keyboard (ignored while you're typing in a field):
 *   M  start/stop   [ / ]  tempo down/up   T  tap tempo   D  drone on/off
 */

const OPEN_KEY = "met.open";

export default function TransportBar() {
  const met = useMetronome(); // stable: settings + controls
  const beat = useMetronomeBeat(); // ticks — only this component wants it
  const drone = useDrone();
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [gear, setGear] = useState(false);
  const [audio, setAudio] = useState({ muted: false, volume: 0.9, clickVolume: 0.7, droneVolume: 0.45, voice: "pluck" });

  const bpmFieldRef = useRef(null);
  // null = not editing (mirror the live tempo, which the ramp can change).
  // A plain "" sentinel would snap the field back to the current tempo the
  // moment you cleared it, making the value impossible to retype.
  const [bpmDraft, setBpmDraft] = useState(null);

  useEffect(() => subscribe(setAudio), []);

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_KEY, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [open]);

  // Tell the shell how much bottom padding to reserve. The bar is fixed, so
  // without this an open drawer would cover the bottom of the page.
  useEffect(() => {
    const mode = !open ? "mini" : gear ? "gear" : "open";
    document.body.dataset.tp = mode;
    return () => {
      delete document.body.dataset.tp;
    };
  }, [open, gear]);

  // Pulse on every beat so even a collapsed bar reads as "running". Driven
  // from the beat position rather than a timer: a timer set inside a tick
  // listener gets cleared by the effect's own cleanup on the next tick.
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!met?.running || beat.subIndex !== 0) return;
    setFlash(true);
    const id = setTimeout(() => setFlash(false), 90);
    return () => clearTimeout(id);
  }, [beat.beat, beat.bar, beat.subIndex, met?.running]);

  // The key handler is bound once; reach the live toggle through a ref.
  const toggleDroneRef = useRef(drone.toggle);
  toggleDroneRef.current = drone.toggle;

  /* ---- keyboard shortcuts ---- */
  useEffect(() => {
    if (!met) return;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Auto-repeat fires ~30x a second. On the drone that means rebuilding a
      // seven-oscillator voice each time, with every 350ms tail overlapping.
      if (e.repeat) return;
      const t = e.target;
      const tag = t && t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === "m") {
        e.preventDefault();
        resume();
        met.toggle();
      } else if (e.key === "[" || e.key === "{") {
        e.preventDefault();
        met.nudgeBpm(e.shiftKey ? -5 : -1);
      } else if (e.key === "]" || e.key === "}") {
        e.preventDefault();
        met.nudgeBpm(e.shiftKey ? 5 : 1);
      } else if (k === "t") {
        e.preventDefault();
        met.tap();
      } else if (k === "d") {
        e.preventDefault();
        resume();
        toggleDroneRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [met]);

  if (!met) return null;

  const commitBpm = () => {
    const n = Number(bpmDraft);
    if (bpmDraft !== null && bpmDraft !== "" && Number.isFinite(n) && n > 0) met.setBpm(n);
    setBpmDraft(null);
  };

  const dots = Array.from({ length: met.beatsPerBar }, (_, i) => i);
  const activeBeat = met.running ? beat.beat : -1;

  /* ---------- collapsed ---------- */
  if (!open) {
    return (
      <div className="tp tp-collapsed">
        <button
          className={"tp-play" + (met.running ? " on" : "")}
          onClick={() => {
            resume();
            met.toggle();
          }}
          title={met.running ? "Stop the click (M)" : "Start the click (M)"}
          aria-label={met.running ? "Stop metronome" : "Start metronome"}
        >
          {met.running ? "■" : "▶"}
        </button>
        <span className="mono tp-bpm-mini">{met.bpm}</span>
        <span className={"tp-pulse" + (flash && met.running ? " lit" : "")} aria-hidden="true" />
        {drone.on && (
          <span className="mono tp-drone-mini" title={`Drone on — ${drone.root}`}>
            ♁{drone.root}
          </span>
        )}
        <button className="tp-toggle" onClick={() => setOpen(true)} title="Show the metronome" aria-label="Expand transport">
          ⌃
        </button>
      </div>
    );
  }

  /* ---------- expanded ---------- */
  return (
    <div className="tp" role="region" aria-label="Metronome">
      <div className="tp-row">
        <button
          className={"tp-play" + (met.running ? " on" : "")}
          onClick={() => {
            resume();
            met.toggle();
          }}
          title={met.running ? "Stop (M)" : "Start (M)"}
          aria-label={met.running ? "Stop metronome" : "Start metronome"}
          aria-pressed={met.running}
        >
          {met.running ? "■" : "▶"}
        </button>

        {/* tempo */}
        <div className="tp-tempo">
          <button className="tp-step" onClick={() => met.nudgeBpm(-1)} title="Slower ([)" aria-label="Tempo down">
            −
          </button>
          <input
            ref={bpmFieldRef}
            className="inp tp-bpm"
            inputMode="numeric"
            value={bpmDraft ?? String(met.bpm)}
            onFocus={() => setBpmDraft(String(met.bpm))}
            onChange={(e) => setBpmDraft(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
            onBlur={commitBpm}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitBpm();
                e.currentTarget.blur();
              }
              if (e.key === "Escape") {
                setBpmDraft(null);
                e.currentTarget.blur();
              }
            }}
            aria-label="Beats per minute"
          />
          <button className="tp-step" onClick={() => met.nudgeBpm(1)} title="Faster (])" aria-label="Tempo up">
            +
          </button>
          <span className="mono tp-unit">BPM</span>
        </div>

        <input
          className="tp-slider"
          type="range"
          min={BPM_MIN}
          max={BPM_MAX}
          value={met.bpm}
          onChange={(e) => met.setBpm(Number(e.target.value))}
          aria-label="Tempo slider"
        />

        <button className="btn tp-tap" onClick={() => met.tap()} title="Tap four times to set the tempo (T)">
          TAP{met.tapped ? <span className="tp-tapped"> {met.tapped}</span> : null}
        </button>

        {/* subdivision */}
        <div className="tp-seg" role="group" aria-label="Subdivision">
          {SUBDIVISIONS.map((s) => (
            <button
              key={s.id}
              className={"tp-segb" + (met.sub === s.id ? " on" : "")}
              onClick={() => met.patch({ sub: s.id })}
              title={`Click ${s.name}`}
              aria-pressed={met.sub === s.id}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* time signature */}
        <label className="mono tp-sig">
          <select
            className="inp"
            value={met.beatsPerBar}
            onChange={(e) => met.patch({ beatsPerBar: Number(e.target.value) })}
            aria-label="Beats per bar"
          >
            {[2, 3, 4, 5, 6, 7, 8, 9, 12].map((n) => (
              <option key={n} value={n}>
                {n}/4
              </option>
            ))}
          </select>
        </label>

        {/* beat dots */}
        <div className="tp-dots" aria-hidden="true">
          {dots.map((i) => (
            <span
              key={i}
              className={
                "tp-dot" +
                (i === 0 ? " one" : "") +
                (i === activeBeat ? " lit" : "") +
                (beat.isCountIn ? " count" : "")
              }
            />
          ))}
          <span className="mono tp-bar">
            {met.running ? (beat.isCountIn ? "count-in" : `bar ${beat.bar + 1 - met.countInBars}`) : "—"}
          </span>
        </div>

        {/* the drone — a held tonic to practise against */}
        <div className="tp-drone">
          <button
            className={"tp-dronebtn" + (drone.on ? " on" : "")}
            onClick={() => {
              resume();
              drone.toggle();
            }}
            title={drone.on ? "Stop the drone (D)" : "Hold a tonic to play against (D)"}
            aria-label="Toggle drone"
            aria-pressed={drone.on}
          >
            ♁ <span className="lab">DRONE</span>
          </button>
          <select
            className="inp tp-droneroot"
            value={drone.root}
            onChange={(e) => drone.setRoot(e.target.value)}
            title="Which note the drone holds — picking one stops it following the page"
            aria-label="Drone root"
          >
            {ROOTS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            className={"tp-follow" + (drone.follow ? " on" : "")}
            onClick={() => drone.setFollow(!drone.follow)}
            title={
              drone.follow
                ? "Following the page's key — click to pin the drone where it is"
                : "Pinned. Click to follow the key each page is showing"
            }
            aria-label="Drone follows the page key"
            aria-pressed={drone.follow}
          >
            ⇄
          </button>
          {drone.on && drone.micHeld && (
            <span className="mono tp-duck" title="Paused so the microphone can hear your guitar">
              mic
            </span>
          )}
        </div>

        <div className="tp-spacer" />

        <button
          className={"tp-toggle" + (gear ? " on" : "")}
          onClick={() => setGear((g) => !g)}
          title="Count-in, speed trainer, sound"
          aria-label="Metronome settings"
          aria-expanded={gear}
        >
          ⚙
        </button>
        <button
          className={"tp-toggle" + (audio.muted ? " on" : "")}
          onClick={() => setMuted(!audio.muted)}
          title={audio.muted ? "Unmute all sound" : "Mute all sound"}
          aria-label="Mute all sound"
          aria-pressed={audio.muted}
        >
          {audio.muted ? "🔇" : "🔊"}
        </button>
        <button className="tp-toggle" onClick={() => setOpen(false)} title="Hide the metronome" aria-label="Collapse transport">
          ⌄
        </button>
      </div>

      {gear && (
        <div className="tp-gear">
          <div className="tp-gearcol">
            <span className="eyebrow">Count-in</span>
            <div className="tp-seg">
              {[0, 1, 2].map((n) => (
                <button
                  key={n}
                  className={"tp-segb" + (met.countInBars === n ? " on" : "")}
                  onClick={() => met.patch({ countInBars: n })}
                  title={n === 0 ? "Start immediately" : `${n} bar${n > 1 ? "s" : ""} of count-in`}
                >
                  {n === 0 ? "off" : `${n} bar${n > 1 ? "s" : ""}`}
                </button>
              ))}
            </div>
            <button
              className={"btn" + (met.accent ? " on" : "")}
              style={{ marginTop: 8 }}
              onClick={() => met.patch({ accent: !met.accent })}
              title="Louder click on beat 1"
            >
              accent beat 1 {met.accent ? "on" : "off"}
            </button>
          </div>

          <div className="tp-gearcol">
            <span className="eyebrow">Speed trainer</span>
            <button
              className={"btn" + (met.rampOn ? " on" : "")}
              onClick={() =>
                met.patch(
                  met.rampOn
                    ? { rampOn: false }
                    : // A ceiling below where you're already playing would mean
                      // "slow down", which is never what turning this on means.
                      { rampOn: true, rampMax: Math.max(met.rampMax, met.bpm + met.rampBy) }
                )
              }
              title="Creep the tempo up while you play"
            >
              ramp {met.rampOn ? "on" : "off"}
            </button>
            <div className="tp-ramp mono">
              +
              <input
                className="inp"
                type="number"
                min="1"
                max="20"
                value={met.rampBy}
                onChange={(e) => met.patch({ rampBy: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })}
                aria-label="BPM added each step"
              />
              BPM every
              <input
                className="inp"
                type="number"
                min="1"
                max="32"
                value={met.rampEveryBars}
                onChange={(e) => met.patch({ rampEveryBars: Math.max(1, Math.min(32, Number(e.target.value) || 1)) })}
                aria-label="Bars between steps"
              />
              bars, up to
              <input
                className="inp"
                type="number"
                min={BPM_MIN}
                max={BPM_MAX}
                value={met.rampMax}
                onChange={(e) => met.patch({ rampMax: Number(e.target.value) || met.rampMax })}
                aria-label="Maximum tempo"
              />
            </div>
          </div>

          <div className="tp-gearcol">
            <span className="eyebrow">Drone</span>
            <button
              className={"btn" + (drone.fifth ? " on" : "")}
              onClick={() => drone.setFifth(!drone.fifth)}
              title="Root + 5th states the key without deciding major or minor"
            >
              add the 5th {drone.fifth ? "on" : "off"}
            </button>
            <label className="mono tp-vol">
              level
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={audio.droneVolume}
                onChange={(e) => setDroneVolume(Number(e.target.value))}
                aria-label="Drone volume"
              />
            </label>
          </div>

          <div className="tp-gearcol">
            <span className="eyebrow">Sound</span>
            <div className="tp-seg" role="group" aria-label="Note voice">
              <button
                className={"tp-segb wide" + (audio.voice === "pluck" ? " on" : "")}
                onClick={() => setVoice("pluck")}
                title="Plucked string (Karplus-Strong)"
              >
                pluck
              </button>
              <button
                className={"tp-segb wide" + (audio.voice === "pure" ? " on" : "")}
                onClick={() => setVoice("pure")}
                title="Pure tone — clearer for interval ear-training"
              >
                pure
              </button>
            </div>
            <label className="mono tp-vol">
              notes
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={audio.volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                aria-label="Note volume"
              />
            </label>
            <label className="mono tp-vol">
              click
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={audio.clickVolume}
                onChange={(e) => setClickVolume(Number(e.target.value))}
                aria-label="Click volume"
              />
            </label>
          </div>

          <div className="tp-gearcol tp-keys mono">
            <span className="eyebrow">Keys</span>
            <div>
              <b style={{ color: C.ink }}>M</b> start / stop
            </div>
            <div>
              <b style={{ color: C.ink }}>[ ]</b> tempo ∓1
            </div>
            <div>
              <b style={{ color: C.ink }}>T</b> tap tempo
            </div>
            <div>
              <b style={{ color: C.ink }}>D</b> drone on / off
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
