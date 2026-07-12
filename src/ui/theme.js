/**
 * THEME — the one shared palette + colour helpers.
 *
 * Every colour is a CSS variable reference, so the whole app re-skins when
 * the theme flips (dark ↔ warm light). The actual values live in index.css:
 *   :root { --ink: … }                 dark (default)
 *   [data-theme="light"] { --ink: … }  warm light
 * The toggle in App.jsx sets document.documentElement.dataset.theme.
 */

export const C = {
  paper: "var(--paper)",
  ink: "var(--ink)",
  blue: "var(--blue)",
  cyan: "var(--cyan)",
  sun: "var(--sun)",
  sunDeep: "var(--sun-deep)",
  line: "var(--line)",
  red: "var(--red)",
  green: "var(--green)",
  violet: "var(--violet)",
  muted: "var(--muted)",
  grid: "var(--grid)",
  gridBold: "var(--grid-bold)",
  surface: "var(--surface)",       // subtle raised background (buttons, chips)
  surfaceLo: "var(--surface-lo)",  // even subtler (cards, idle segments)
  spotify: "#1DB954",
};

// Roy G Biv — one colour per scale degree (1-7); the root (1) is red.
// Fixed hexes: these read fine on both themes.
export const RAINBOW = {
  1: { bg: "#E0533F", tx: "#fff",    br: "#8E2A1D" }, // red  — root
  2: { bg: "#FF7A2E", tx: "#2A1300", br: "#C85A18" }, // orange
  3: { bg: "#E8C84A", tx: "#2A2300", br: "#B59A1E" }, // yellow
  4: { bg: "#46B36B", tx: "#04220F", br: "#2C7E48" }, // green
  5: { bg: "#3E9BD6", tx: "#04202E", br: "#1F6FA0" }, // blue
  6: { bg: "#6C7BE0", tx: "#0A0E2A", br: "#3F4DB0" }, // indigo
  7: { bg: "#B58CFF", tx: "#1A1030", br: "#7A52C7" }, // violet
};

export const degBase = (label) => {
  const m = String(label).match(/[1-7]/);
  return m ? Number(m[0]) : null;
};

// Node colours by semitones-from-root: root = sun, 3rd = cyan, rest = blue.
export const keyToneStyle = (semis) =>
  semis === 0
    ? { bg: C.sun, br: C.sunDeep, tx: "#fff" }
    : semis === 3 || semis === 4
    ? { bg: C.cyan, br: "#1F7E96", tx: "#06222B" }
    : { bg: C.blue, br: "#123F62", tx: "#EAF2F7" };

// Same, but 7ths get violet (chord contexts).
export const chordToneStyle = (semis) =>
  semis === 10 || semis === 11
    ? { bg: C.violet, br: "#7A52C7", tx: "#1A1030" }
    : keyToneStyle(semis);
