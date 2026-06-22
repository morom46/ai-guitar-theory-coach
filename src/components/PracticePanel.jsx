import React from "react";
import SpotifyRecent from "./SpotifyRecent.jsx";

/**
 * PRACTICE PANEL — shared by Chord Builder & Number System.
 * Two ways to take theory to the fretboard with real audio:
 *   1) Solo backing tracks — dynamic YouTube searches for the current key.
 *   2) Songs commonly in this key — curated titles, each linking out to a
 *      YouTube + Ultimate-Guitar search (search URLs never rot).
 * Static site, so everything is an outbound link (no API, no backend).
 */

const C = {
  ink: "#DCE6EC", muted: "#7C8A95", line: "#3A4853", sun: "#FF7A2E",
  sunDeep: "#E0601B", cyan: "#36C7E0", red: "#E0533F", grid: "rgba(120,150,170,0.10)",
};

const ytSearch = (q) => "https://www.youtube.com/results?search_query=" + encodeURIComponent(q);
const ugSearch = (q) => "https://www.ultimate-guitar.com/search.php?search_type=title&value=" + encodeURIComponent(q);

// Curated songs commonly in a given key. id = root + "maj" | "min".
// Keys vary with capo/tuning, so these are "commonly in" not "definitively".
// Sourced from FaChords, Adrian Curran Guitars, Guitar Lobby, Ultimate-Guitar.
export const SONGS = {
  Cmaj: [["Let It Be", "The Beatles"], ["Imagine", "John Lennon"], ["No Woman No Cry", "Bob Marley"]],
  Gmaj: [["Brown Eyed Girl", "Van Morrison"], ["Knockin' on Heaven's Door", "Bob Dylan"], ["You Shook Me All Night Long", "AC/DC"]],
  Dmaj: [["Proud Mary", "Creedence Clearwater Revival"], ["Free Fallin'", "Tom Petty"], ["Sweet Home Alabama", "Lynyrd Skynyrd"]],
  Amaj: [["Three Little Birds", "Bob Marley"], ["Stand By Me", "Ben E. King"], ["Wagon Wheel", "Old Crow Medicine Show"]],
  Emaj: [["Pride and Joy", "Stevie Ray Vaughan"], ["Johnny B. Goode", "Chuck Berry"]],
  Fmaj: [["Hey Jude", "The Beatles"], ["Yesterday", "The Beatles"]],
  Amin: [["Stairway to Heaven", "Led Zeppelin"], ["Californication", "Red Hot Chili Peppers"], ["House of the Rising Sun", "The Animals"]],
  Emin: [["Come As You Are", "Nirvana"], ["Mad World", "Gary Jules"], ["Nothing Else Matters", "Metallica"]],
  Dmin: [["The Sound of Silence", "Simon & Garfunkel"], ["Black Magic Woman", "Santana"]],
  Bmin: [["Hotel California", "Eagles"], ["Wicked Game", "Chris Isaak"]],
};

function LinkBtn({ href, children, primary }) {
  return (
    <a className={"pp-link" + (primary ? " primary" : "")} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export default function PracticePanel({ keyLabel, tonality, keyId }) {
  const penta = tonality === "major" ? "major pentatonic" : "minor pentatonic";
  const backing = [
    { label: `▶ ${keyLabel} ${tonality} jam`, url: ytSearch(`${keyLabel} ${tonality} guitar backing track`) },
    { label: `▶ ${keyLabel} blues`, url: ytSearch(`${keyLabel} blues backing track`) },
    { label: `▶ ${keyLabel} ${penta}`, url: ytSearch(`${keyLabel} ${penta} backing track`) },
  ];
  const songs = SONGS[keyId] || [];

  return (
    <div className="pp-wrap">
      <style>{`
        .pp-wrap{ margin-top: 18px; border-top: 1px dashed ${C.grid}; padding-top: 16px; }
        .pp-eyebrow{ font-family: ui-monospace, monospace; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: ${C.muted}; }
        .pp-mono{ font-family: ui-monospace, monospace; }
        .pp-link{ display: inline-flex; align-items: center; gap: 4px; font-family: ui-monospace, monospace; font-size: 12px;
          text-decoration: none; padding: 7px 11px; border: 1.5px solid ${C.line}; border-radius: 3px;
          background: rgba(255,255,255,.05); color: ${C.ink}; transition: all .12s; }
        .pp-link:hover{ border-color: ${C.ink}; }
        .pp-link.primary{ border-color: ${C.sunDeep}; background: rgba(255,122,46,.14); color: ${C.sun}; }
        .pp-song{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:8px 0; border-bottom:1px dashed ${C.grid}; }
        .pp-song .t{ font-family: ui-monospace, monospace; font-size: 13px; color: ${C.ink}; flex:1 1 200px; }
        .pp-tiny{ font-size: 11px; padding: 4px 8px; }
      `}</style>

      <SpotifyRecent />

      <div className="pp-eyebrow" style={{ marginBottom: 6 }}>🎧 Solo backing tracks — opens YouTube for {keyLabel} {tonality}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {backing.map((b, i) => (
          <LinkBtn key={i} href={b.url} primary>{b.label}</LinkBtn>
        ))}
      </div>

      <div className="pp-eyebrow" style={{ margin: "16px 0 6px" }}>🎸 Songs commonly in {keyLabel} {tonality}</div>
      {songs.length > 0 ? (
        <div>
          {songs.map(([title, artist], i) => (
            <div key={i} className="pp-song">
              <span className="t">{title} <span style={{ color: C.muted }}>— {artist}</span></span>
              <LinkBtn href={ytSearch(`${title} ${artist}`)}>▶ video</LinkBtn>
              <LinkBtn href={ugSearch(`${title} ${artist}`)}>tab</LinkBtn>
            </div>
          ))}
          <LinkBtn href={ytSearch(`songs in the key of ${keyLabel} ${tonality} guitar`)}>
            <span className="pp-tiny">find more in {keyLabel} {tonality} →</span>
          </LinkBtn>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className="pp-mono" style={{ fontSize: 12, color: C.muted }}>No curated list for this key yet —</span>
          <LinkBtn href={ytSearch(`songs in the key of ${keyLabel} ${tonality} guitar`)}>search YouTube</LinkBtn>
          <LinkBtn href={ugSearch(`${keyLabel} ${tonality}`)}>search tabs</LinkBtn>
        </div>
      )}
      <div className="pp-mono" style={{ fontSize: 10.5, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>
        Note: a song's key can shift with capo or tuning — treat these as "commonly in this key." Links open YouTube / Ultimate-Guitar searches in a new tab.
      </div>
    </div>
  );
}
