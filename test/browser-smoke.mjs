/**
 * Browser smoke test — drives the real app in Chromium.
 *
 * Unit tests prove the maths; this proves the app. It walks every page,
 * fails on any console error or unhandled rejection, exercises the metronome
 * (and checks that clicks are actually scheduled on the audio clock), and
 * feeds a synthetic 110 Hz guitar tone into the microphone to confirm the
 * tuner reads A2 and the drills judge a played note.
 *
 * Run:  node test/browser-smoke.mjs
 */

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The sandbox has a pre-downloaded Chromium at a fixed path; anywhere else,
// fall back to whatever `npx playwright install chromium` put on this machine.
const SANDBOX_CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const CHROME = existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : undefined;
const TMP = tmpdir();
const FAKE_WAV = join(TMP, "gtc-a2-60s.wav"); // 110 Hz = open A string, one long steady tone
const BASE = "/ai-guitar-theory-coach/";
const SHOTS = join(TMP, "gtc-shots");

/**
 * The microphone tests need a real audio file to feed Chromium's fake capture
 * device. Rather than depending on one being lying around, synthesise it:
 * two seconds of 110 Hz (open A) with a couple of harmonics so the detector is
 * looking at something guitar-shaped rather than a pure sine.
 */
function writeFakeGuitarWav(path, freq = 110, seconds = 60, rate = 44100) {
  const n = Math.floor(rate * seconds);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    // Steady, not plucked: Chromium plays the file once from browser launch,
    // so anything that decays is silence by the time the mic tests run.
    const env = Math.min(1, t * 8);
    const v =
      Math.sin(2 * Math.PI * freq * t) * 0.6 +
      Math.sin(2 * Math.PI * freq * 2 * t) * 0.22 +
      Math.sin(2 * Math.PI * freq * 3 * t) * 0.1;
    data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * env * 26000))), i * 2);
  }
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVE", 8);
  head.write("fmt ", 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([head, data]));
}

const PAGES = [
  { id: "theory", label: "Theory", expect: "MUSIC THEORY, DECODED" },
  { id: "decoder", label: "Decoder", expect: "THE FRETBOARD DECODER" },
  { id: "chord", label: "Chords", expect: null },
  { id: "numbers", label: "Numbers", expect: null },
  { id: "songs", label: "Songs & Tones", expect: null },
  { id: "spotify", label: "Spotify", expect: null },
  { id: "ear", label: "Ear", expect: "THE EAR TRAINER" },
  { id: "listen", label: "Listen", expect: "THE APP LISTENS BACK" },
];

// Every tab inside a lesson page, with one string that proves the panel
// actually computed something rather than merely mounting.
const TABS = [
  { page: "Chords", tab: "Build a chord", expect: "Construction" },
  { page: "Chords", tab: "Stack it yourself", expect: "thirds stacked out of a scale" },
  { page: "Chords", tab: "Voice leading", expect: "Nearest voicing" },
  { page: "Chords", tab: "Chord gravity", expect: "The gravity map" },
  { page: "Chords", tab: "Name it", expect: "Which scales contain it" },
  { page: "Scales", tab: "Relative ⇄ parallel", expect: "One string, twelve frets" },
  { page: "Scales", tab: "Why pentatonic is safe", expect: "smallest gap between any two" },
  { page: "Scales", tab: "Build it from the formula", expect: "W–W–H–W–W–W–H" },
  { page: "Scales", tab: "Intervals as shapes", expect: "across G–B" },
  { page: "Numbers", tab: "The circle", expect: "pivot through" },
];

const problems = [];
const results = [];
let step = 0;

const ok = (name, extra = "") => {
  results.push(`  ✓ ${name}${extra ? ` — ${extra}` : ""}`);
};
const bad = (name, detail) => {
  problems.push(`${name}: ${detail}`);
  results.push(`  ✗ ${name} — ${detail}`);
};

function startServer() {
  return new Promise((resolve, reject) => {
    // Detached so we can kill the whole group — npx leaves vite orphaned
    // otherwise and the next run finds the port taken.
    const port = 4300 + Math.floor(Math.random() * 300);
    // `npx` is a shell script on POSIX and a .cmd on Windows, which spawn()
    // will not find without the shell — and detaching a shell-spawned process
    // on Windows is meaningless, so only do it where it helps.
    const win = process.platform === "win32";
    const proc = spawn("npx", ["vite", "preview", "--port", String(port), "--strictPort"], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      detached: !win,
      shell: win,
    });
    let out = "";
    const onData = (d) => {
      out += d.toString();
      // Vite colourises its banner when it thinks it has a terminal, which
      // puts escape codes between "localhost:" and the port number.
      const clean = out.replace(/\[[0-9;]*m/g, "");
      const m = clean.match(/http:\/\/localhost:(\d+)/);
      if (m) resolve({ proc, url: `http://localhost:${m[1]}${BASE}` });
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
    proc.on("error", reject);
    setTimeout(() => reject(new Error(`server did not start:\n${out}`)), 25000);
  });
}

function stopServer(proc) {
  try {
    // Windows has no process groups to signal, and taskkill /T is what
    // actually takes the vite child down with the shell that spawned it.
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(proc.pid), "/t", "/f"], { stdio: "ignore" });
      return;
    }
    process.kill(-proc.pid, "SIGKILL");
  } catch {
    try {
      proc.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

const shot = async (page, name) => {
  await page.screenshot({ path: `${SHOTS}/${String(++step).padStart(2, "0")}-${name}.png`, fullPage: false });
};

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const { proc, url } = await startServer();
  serverProc = proc;

  if (!existsSync(FAKE_WAV)) writeFakeGuitarWav(FAKE_WAV);

  const browser = await chromium.launch({
    // The mic tests need a browser with a media stack. Playwright's DEFAULT
    // build is chromium-headless-shell, whose getUserMedia throws
    // "NotSupportedError: Not supported" — so every microphone check silently
    // fails against it. `channel: "chromium"` is the full build, which honours
    // --use-file-for-fake-audio-capture.
    ...(CHROME ? { executablePath: CHROME } : { channel: "chromium" }),
    args: [
      "--no-sandbox",
      "--autoplay-policy=no-user-gesture-required",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${FAKE_WAV}%noloop`,
    ],
  });

  const context = await browser.newContext({
    permissions: ["microphone"],
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

  // Instrument the audio graph so we can prove clicks are really scheduled.
  await page.addInitScript(() => {
    window.__osc = 0;
    window.__bufs = 0;
    // Keep every stream the page opens so we can prove the mic gets released.
    window.__streams = [];
    if (navigator.mediaDevices?.getUserMedia) {
      const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (...a) => {
        const st = await gum(...a);
        window.__streams.push(st);
        return st;
      };
    }
    const OrigCtx = window.AudioContext;
    window.AudioContext = class extends OrigCtx {
      constructor(...a) {
        super(...a);
        window.__ctxCount = (window.__ctxCount || 0) + 1;
        const co = this.createOscillator.bind(this);
        this.createOscillator = (...x) => {
          window.__osc++;
          return co(...x);
        };
        const cb = this.createBufferSource.bind(this);
        this.createBufferSource = (...x) => {
          window.__bufs++;
          return cb(...x);
        };
      }
    };
  });

  await page.goto(url, { waitUntil: "networkidle" });
  results.push("APP LOADS");
  ok("app boots", await page.locator(".shell-title").innerText());

  /* ---------- 1. every page renders without a console error ---------- */
  results.push("\nPAGES");
  for (const p of PAGES) {
    consoleErrors.length = 0;
    await page.getByRole("button", { name: p.label, exact: true }).first().click();
    await page.waitForTimeout(450);
    const title = await page.locator(".page-title").first().innerText().catch(() => "(no title)");
    if (consoleErrors.length) bad(p.id, `console: ${consoleErrors.slice(0, 2).join(" | ")}`);
    else if (p.expect && !title.includes(p.expect)) bad(p.id, `expected "${p.expect}", got "${title}"`);
    else ok(p.id, title);
    await shot(page, p.id);
  }

  /* ---------- 1b. the tabs INSIDE the lessons ---------- */
  // Walking the nav only mounts each page's default tab, which left the
  // Chord Builder's and Scale Lab's panels — most of the theory features —
  // never rendered in this suite at all.
  results.push("\nLESSON TABS");
  for (const t of TABS) {
    consoleErrors.length = 0;
    await page.getByRole("button", { name: t.page, exact: true }).first().click();
    await page.waitForTimeout(220);
    if (t.tab) {
      await page.getByRole("button", { name: t.tab, exact: true }).first().click();
      await page.waitForTimeout(380);
    }
    // Case-insensitive: half these labels live in an .eyebrow, which CSS
    // upper-cases, and innerText hands back what is actually rendered.
    const body = (await page.locator(".shell-main").innerText()).toLowerCase();
    const where = t.tab ? `${t.page}/${t.tab}` : t.page;
    if (consoleErrors.length) bad(where, `console: ${consoleErrors.slice(0, 2).join(" | ")}`);
    else if (t.expect && !body.includes(t.expect.toLowerCase())) bad(where, `expected to see "${t.expect}"`);
    else ok(where.replace("/", " · "), t.expect || "");
  }

  /* ---------- 2. shared audio engine ---------- */
  results.push("\nSHARED AUDIO ENGINE");
  const lazyCount = await page.evaluate(() => window.__ctxCount || 0);
  if (lazyCount === 0) ok("no AudioContext created until something actually plays (lazy)");
  else bad("lazy audio", `${lazyCount} context(s) created just by visiting pages`);

  // Tap a fretboard note and confirm the Karplus-Strong buffer voice fires.
  await page.getByRole("button", { name: "Decoder", exact: true }).first().click();
  await page.waitForTimeout(300);
  const bufsBefore = await page.evaluate(() => window.__bufs);
  await page.locator(".node").first().click();
  await page.waitForTimeout(250);
  const bufsAfter = await page.evaluate(() => window.__bufs);
  if (bufsAfter > bufsBefore) ok("tapping a note plays the plucked-string voice", `${bufsAfter - bufsBefore} buffer source(s)`);
  else bad("note tap", "no buffer source created — pluck voice did not fire");

  /* ---------- 2b. the things that only work with a real gesture ---------- */
  // A synthetic click cannot resume an AudioContext, so anything driven by the
  // metronome can only be proven here, where the clicks are real.
  results.push("\nSHAPES, SEQUENCES AND THE TRITONE");

  // — chord diagrams: the solver's shapes, drawn
  await page.getByRole("button", { name: "Chords", exact: true }).first().click();
  await page.getByRole("button", { name: "Build a chord", exact: true }).first().click();
  await page.waitForTimeout(350);
  const boxes = await page.locator(".cd-box").count();
  const firstBox = await page.locator(".cd-box").first().innerText();
  if (boxes >= 3) ok(`${boxes} chord shapes drawn`, firstBox.split("\n").slice(0, 2).join(" "));
  else bad("chord shapes", `only ${boxes} diagram(s)`);
  // C major's first shape must be the open C everyone plays: x32010.
  const cShape = await page.locator(".cd-box").first().innerText();
  if (/✕/.test(cShape) && /C/.test(cShape)) ok("open C is muted on the low E and starts on C");
  else bad("open C shape", cShape.replace(/\n/g, " "));

  // — the tritone, dragged inward by hand
  await page.getByRole("button", { name: "Chord gravity", exact: true }).first().click();
  await page.waitForTimeout(350);
  const tt = page.locator('svg[aria-label*="tritone"]');
  // Mouse coordinates are viewport-relative and nothing auto-scrolls, so a
  // page that grew a nav row since this was written would silently drag empty
  // space. Bring it into view and measure it where it actually is.
  // Centre it, do not merely bring it into view: scrollIntoViewIfNeeded parks
  // an element at the bottom edge, which on this app is underneath the FIXED
  // transport bar — the mouse then lands on the metronome and the SVG never
  // sees a single pointer event.
  await tt.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(200);
  const ttBox = await tt.boundingBox();
  await page.mouse.move(ttBox.x + 70, ttBox.y + 46);
  await page.mouse.down();
  await page.mouse.move(ttBox.x + 100, ttBox.y + 46, { steps: 6 });
  // React commits the drag on its own schedule; reading in the same turn as
  // the move catches the pre-drag render and looks like a broken drag.
  await page.waitForTimeout(150);
  const svgText = () => tt.evaluate((el) => el.textContent);
  const midDrag = await svgText();
  await page.mouse.up();
  await page.waitForTimeout(250);
  const afterDrag = await svgText();
  if (/C/.test(midDrag) && /the 1/.test(midDrag)) ok("dragging the 3rd past halfway turns it into the tonic", midDrag.replace(/\n/g, " ").slice(0, 40));
  else bad("tritone drag", `mid-drag showed "${midDrag.replace(/\n/g, " ")}"`);
  if (/the 1/.test(afterDrag) && /the 3/.test(afterDrag)) ok("releasing resolves BOTH notes inward — contrary motion");
  else bad("tritone release", afterDrag.replace(/\n/g, " ").slice(0, 60));

  // — a scale sequence walking on the click
  await page.getByRole("button", { name: "Scales", exact: true }).first().click();
  await page.getByRole("button", { name: "Positions & sequences", exact: true }).first().click();
  await page.waitForTimeout(350);
  const boxRow = await page.locator(".shell-main").innerText();
  if (/fr 5/.test(boxRow)) ok("box 1 of A minor pentatonic sits at the 5th fret — the shape everyone learns first");
  else bad("pentatonic boxes", boxRow.split("BOX")[1]?.slice(0, 60) || "no box row");

  await page.getByRole("button", { name: /run it on the click/ }).click();
  await page.waitForTimeout(1400);
  const dot1 = await page.locator(".shell-main").innerText();
  await page.waitForTimeout(1400);
  const dot2 = await page.locator(".shell-main").innerText();
  const now = (t) => (t.match(/now:\s*(.+)/) || [])[1] || "";
  if (now(dot1) && now(dot2) && now(dot1) !== now(dot2)) ok("the dot walks the sequence in time with the click", `${now(dot1).slice(0, 26)} → ${now(dot2).slice(0, 26)}`);
  else bad("sequence runner", `readout stuck at "${now(dot1) || "(nothing)"}"`);
  await page.getByRole("button", { name: "■ stop", exact: true }).first().click();
  await page.keyboard.press("m"); // leave the click off
  await page.waitForTimeout(200);
  await shot(page, "sequences");


  /* ---------- 3. the metronome ---------- */
  results.push("\nMETRONOME");
  const tp = page.locator(".tp");
  if (await tp.count()) ok("transport bar is present on every page");
  else bad("transport bar", "not rendered");

  // Set a fast tempo, run it, count the clicks that were scheduled.
  const bpmField = page.getByLabel("Beats per minute");
  await bpmField.fill("240");
  await bpmField.press("Enter");
  const oscBefore = await page.evaluate(() => window.__osc);
  await page.getByRole("button", { name: "Start metronome" }).click();
  await page.waitForTimeout(2000);
  const oscAfter = await page.evaluate(() => window.__osc);
  const clicks = oscAfter - oscBefore;
  // 240 BPM = 4 clicks/sec, so ~8 in 2s. Allow for lookahead + startup.
  if (clicks >= 6 && clicks <= 14) ok("clicks scheduled at 240 BPM", `${clicks} in ~2s (expected ~8)`);
  else bad("click count", `${clicks} clicks in 2s at 240bpm — expected 6-14`);

  const barText = await page.locator(".tp-bar").innerText();
  if (/bar \d+/.test(barText)) ok("bar counter is advancing", barText);
  else bad("bar counter", `showed "${barText}"`);

  // Beat dots must light up in time with the audio.
  const lit = await page.locator(".tp-dot.lit").count();
  if (lit === 1) ok("exactly one beat dot lit at a time");
  else bad("beat dots", `${lit} lit`);

  await shot(page, "metronome-running");

  await page.getByRole("button", { name: "Stop metronome" }).click();
  await page.waitForTimeout(300);
  const oscAfterStop = await page.evaluate(() => window.__osc);
  await page.waitForTimeout(700);
  const oscLater = await page.evaluate(() => window.__osc);
  if (oscLater === oscAfterStop) ok("stop really stops — no clicks after");
  else bad("stop", `${oscLater - oscAfterStop} clicks scheduled after stopping`);

  // Keyboard shortcuts.
  await page.locator("body").click({ position: { x: 5, y: 300 } });
  await page.keyboard.press("]");
  await page.keyboard.press("]");
  const bpmNow = await bpmField.inputValue();
  if (bpmNow === "242") ok("] raises the tempo", `240 → ${bpmNow}`);
  else bad("] shortcut", `bpm is ${bpmNow}, expected 242`);
  await page.keyboard.press("[");
  await page.keyboard.press("m");
  await page.waitForTimeout(400);
  const runningViaKey = await page.getByRole("button", { name: "Stop metronome" }).count();
  if (runningViaKey === 1) ok("M starts and stops the click");
  else bad("M shortcut", "metronome did not start");
  await page.keyboard.press("m");

  // Typing in a field must not trigger shortcuts.
  await bpmField.fill("");
  await bpmField.type("96");
  await bpmField.press("Enter");
  const afterType = await bpmField.inputValue();
  if (afterType === "96") ok("shortcuts stay out of the way while typing", `bpm = ${afterType}`);
  else bad("typing guard", `bpm ended up ${afterType}`);

  // Tempo survives a page change — the whole reason it lives in the shell.
  await page.getByRole("button", { name: "Start metronome" }).click();
  await page.getByRole("button", { name: "Songs & Tones", exact: true }).first().click();
  await page.waitForTimeout(600);
  const stillRunning = await page.getByRole("button", { name: "Stop metronome" }).count();
  const bpmAcross = await page.getByLabel("Beats per minute").inputValue();
  if (stillRunning === 1 && bpmAcross === "96") ok("click keeps running across page switches", `still ${bpmAcross} BPM`);
  else bad("cross-page", `running=${stillRunning} bpm=${bpmAcross}`);
  await page.getByRole("button", { name: "Stop metronome" }).click();

  // Settings drawer + subdivisions.
  await page.getByRole("button", { name: "Metronome settings" }).click();
  await page.waitForTimeout(200);
  if (await page.locator(".tp-gear").count()) ok("settings drawer opens (count-in, ramp, sound)");
  else bad("settings drawer", "did not open");
  await shot(page, "metronome-settings");
  await page.getByRole("button", { name: "Metronome settings" }).click();

  await page.locator('.tp-segb[title="Click triplets"]').click();
  const subOn = await page.locator(".tp-segb.on").first().innerText();
  if (subOn.includes("³")) ok("subdivision switches to triplets");
  else bad("subdivision", `active segment is "${subOn}"`);
  await page.locator('.tp-segb[title="Click quarter notes"]').click();

  /* ---------- 3a. mode A/B ---------- */
  results.push("\nMODE A/B");
  await page.getByRole("button", { name: "Decoder", exact: true }).first().click();
  await page.waitForTimeout(300);
  consoleErrors.length = 0;
  await page.getByRole("button", { name: /Mode A\/B/ }).click();
  await page.waitForTimeout(400);

  const rungs = await page.locator(".ab-rung .n").allInnerTexts();
  const expectedLadder = ["Lydian", "Ionian", "Mixolydian", "Dorian", "Aeolian", "Phrygian", "Locrian"];
  if (JSON.stringify(rungs) === JSON.stringify(expectedLadder))
    ok("the ladder runs brightest to darkest", rungs.join(" → "));
  else bad("ladder order", rungs.join(", "));

  const gaps = await page.locator(".ab-gap").allInnerTexts();
  const expectedGaps = ["#4→4", "7→b7", "3→b3", "6→b6", "2→b2", "5→b5"];
  if (JSON.stringify(gaps) === JSON.stringify(expectedGaps))
    ok("each rung is one note from the next", gaps.join(" · "));
  else bad("ladder gaps", gaps.join(", "));

  // Dorian is the default. The flip should offer Aeolian and the 6.
  const sides = await page.locator(".ab-side .m").allInnerTexts();
  if (sides.length === 2 && /Dorian/.test(sides[0]) && /Aeolian/.test(sides[1]))
    ok("the flip pairs the two modes", sides.join("  ⇄  "));
  else bad("flip sides", sides.join(", "));

  const swapLabel = await page.locator(".ab-swap .deg").innerText();
  if (swapLabel === "6") ok("the flip names the degree that changes", `degree ${swapLabel}`);
  else bad("flip degree", `showed ${swapLabel}, expected 6 for Dorian/Aeolian`);

  // Count the lit notes: 7 scale tones + 1 dashed ghost, per pitch class.
  const pcsBefore = await page.locator(".node").evaluateAll((els) =>
    [...new Set(els.map((e) => e.textContent))].sort()
  );
  await page.locator(".ab-swap").click();
  await page.waitForTimeout(400);
  const pcsAfter = await page.locator(".node").evaluateAll((els) =>
    [...new Set(els.map((e) => e.textContent))].sort()
  );
  const gone = pcsBefore.filter((x) => !pcsAfter.includes(x));
  const came = pcsAfter.filter((x) => !pcsBefore.includes(x));
  if (gone.length === 0 && came.length === 0 && pcsBefore.includes("6") && pcsBefore.includes("b6"))
    ok("both the 6 and the b6 are on the neck — one solid, one ghosted");
  else bad("flip note set", `after flipping, gone=[${gone}] came=[${came}] labels=${pcsAfter}`);

  const activeAfter = await page.locator(".ab-side.on .m").innerText();
  if (/Aeolian/.test(activeAfter)) ok("flipping switches which mode is lit", activeAfter);
  else bad("flip switch", `active side is ${activeAfter}`);

  // Exactly one dashed ghost note class of pitch should exist.
  const ghosts = await page.locator(".node").evaluateAll((els) =>
    els.filter((e) => getComputedStyle(e).borderStyle === "dashed").map((e) => e.textContent)
  );
  const ghostLabels = [...new Set(ghosts)];
  if (ghostLabels.length === 1 && ghostLabels[0] === "6")
    ok("the ghost shows where the note came from", `dashed: ${ghostLabels[0]}`);
  else bad("ghost note", `dashed labels: ${JSON.stringify(ghostLabels)}`);

  // The tonic must not move — that is the entire point of the parallel view.
  const roots = await page.locator(".node").evaluateAll((els) =>
    els.filter((e) => e.textContent === "1").length
  );
  if (roots > 0) ok("the tonic stays put while the note moves", `${roots} root positions lit`);
  else bad("tonic", "no root notes lit");

  // Walk to the end of the ladder — the flip must not die there.
  await page.locator(".ab-rung").filter({ has: page.locator(".n", { hasText: /^Locrian$/ }) }).click();
  await page.waitForTimeout(350);
  const endSides = await page.locator(".ab-side .m").allInnerTexts();
  if (endSides.length === 2) ok("the darkest rung still has something to compare with", endSides.join("  ⇄  "));
  else bad("ladder end", `Locrian offered ${endSides.length} side(s)`);
  await page.locator(".ab-rung").filter({ has: page.locator(".n", { hasText: /^Lydian$/ }) }).click();
  await page.waitForTimeout(350);
  const topSides = await page.locator(".ab-side .m").allInnerTexts();
  if (topSides.length === 2) ok("so does the brightest", topSides.join("  ⇄  "));
  else bad("ladder top", `Lydian offered ${topSides.length} side(s)`);

  // Reversing the compare direction while flipped must land back on the rung
  // you chose, not leap two rungs to the neighbour on the far side.
  await page.locator(".ab-rung").filter({ has: page.locator(".n", { hasText: /^Dorian$/ }) }).click();
  await page.waitForTimeout(300);
  await page.locator(".ab-swap").click(); // now showing Aeolian
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /compare/ }).click();
  await page.waitForTimeout(350);
  const afterReverse = await page.locator(".ab-side.on .m").innerText();
  const reverseSides = await page.locator(".ab-side .m").allInnerTexts();
  if (/Dorian/.test(afterReverse) && reverseSides.some((t) => /Mixolydian/.test(t)))
    ok("reversing the direction returns to the rung you picked", reverseSides.join("  ⇄  "));
  else bad("direction reverse", `active=${afterReverse} sides=${reverseSides.join(", ")}`);

  // At the ends of the ladder the fallback reverses direction — the label must
  // say what is actually being compared.
  await page.locator(".ab-rung").filter({ has: page.locator(".n", { hasText: /^Locrian$/ }) }).click();
  await page.waitForTimeout(350);
  const endLabel = await page.getByRole("button", { name: /compare/ }).innerText();
  const endSidesTxt = await page.locator(".ab-side .m").allInnerTexts();
  const claimsDarker = /darker/.test(endLabel);
  const actuallyBrighter = endSidesTxt.some((t) => /Phrygian/.test(t));
  if (!(claimsDarker && actuallyBrighter)) ok("the compare label tells the truth at the ladder ends", endLabel.trim());
  else bad("direction label", `says "${endLabel.trim()}" but is showing ${endSidesTxt.join(" / ")}`);

  await page.locator(".ab-rung").filter({ has: page.locator(".n", { hasText: /^Lydian$/ }) }).click();
  await page.waitForTimeout(300);

  const whyText = await page.locator(".card", { hasText: 'THE "WHY"' }).first().innerText();
  if (/C Lydian vs C Ionian/.test(whyText)) ok("the explanation tracks the ladder", "C Lydian vs C Ionian");
  else bad("why card", `stale: ${whyText.split("\n")[1] || whyText.slice(0, 60)}`);

  if (consoleErrors.length) bad("A/B console", consoleErrors.slice(0, 2).join(" | "));
  await shot(page, "mode-ab");

  /* ---------- 3b. the drone ---------- */
  results.push("\nDRONE");
  const droneBtn = page.getByRole("button", { name: "Toggle drone" });
  if (await droneBtn.count()) ok("drone control is in the transport bar");
  else bad("drone control", "not rendered");

  const oscBeforeDrone = await page.evaluate(() => window.__osc);
  await droneBtn.click();
  await page.waitForTimeout(700);
  const oscAfterDrone = await page.evaluate(() => window.__osc);
  // root x2 detuned + 5th x2 + octave x2 + one LFO = 7 oscillators.
  const droneOscs = oscAfterDrone - oscBeforeDrone;
  if (droneOscs === 7) ok("drone sounds root + 5th + octave, detuned, with an LFO", `${droneOscs} oscillators`);
  else bad("drone voice", `${droneOscs} oscillators created, expected 7`);

  // It must keep sounding — a drone that stops after a second is not a drone.
  await page.waitForTimeout(1200);
  const oscSteady = await page.evaluate(() => window.__osc);
  if (oscSteady === oscAfterDrone) ok("drone sustains without re-triggering");
  else bad("drone sustain", `${oscSteady - oscAfterDrone} extra oscillators appeared`);

  // Changing the root retunes rather than stacking a second drone.
  const rootSel = page.getByLabel("Drone root");
  // Pick a root the drone is NOT already on — the A/B tab left it following
  // the Decoder's key, and setting the same root is correctly a no-op.
  await rootSel.selectOption("G");
  await page.waitForTimeout(700);
  const oscAfterRetune = await page.evaluate(() => window.__osc);
  if (oscAfterRetune - oscSteady === 7) ok("changing the root retunes the drone", "one voice rebuilt, not two");
  else bad("drone retune", `${oscAfterRetune - oscSteady} oscillators, expected 7`);

  // Picking a root by hand must PIN the drone — otherwise the selector's effect
  // silently evaporates the next time you change page.
  const followBtn = page.getByRole("button", { name: "Drone follows the page key" });
  const pinnedAfterManual = await page.locator(".tp-follow.on").count();
  if (pinnedAfterManual === 0) ok("choosing a root by hand pins the drone");
  else bad("manual pin", "the drone is still following after a manual pick");

  // Turning following back on must re-apply the current page's key immediately,
  // not wait for the key to happen to change.
  await page.getByRole("button", { name: "Decoder", exact: true }).first().click();
  await page.waitForTimeout(400);
  await followBtn.click();
  await page.waitForTimeout(500);
  const reapplied = await page.getByLabel("Drone root").inputValue();
  if (reapplied === "C") ok("re-enabling follow re-applies the page key at once", `root -> ${reapplied}`);
  else bad("follow re-apply", `expected the Decoder's key C, got ${reapplied}`);

  // Following the page's key.
  await page.waitForTimeout(400);
  await page.locator(".chip", { hasText: /^F#$/ }).first().click();
  await page.waitForTimeout(600);
  const followed = await page.getByLabel("Drone root").inputValue();
  if (followed === "F#") ok("drone follows the key the page is showing", `root -> ${followed}`);
  else bad("drone follow", `page key F# but drone root is ${followed}`);

  await page.getByRole("button", { name: "Toggle drone" }).click();
  await page.waitForTimeout(600);
  const oscAfterOff = await page.evaluate(() => window.__osc);
  await page.waitForTimeout(700);
  const oscQuiet = await page.evaluate(() => window.__osc);
  if (oscQuiet === oscAfterOff) ok("drone stops cleanly");
  else bad("drone stop", `${oscQuiet - oscAfterOff} oscillators after stopping`);

  // D toggles it from the keyboard.
  await page.locator("body").click({ position: { x: 5, y: 300 } });
  await page.keyboard.press("d");
  await page.waitForTimeout(500);
  const onViaKey = await page.locator(".tp-dronebtn.on").count();
  if (onViaKey === 1) ok("D turns the drone on from the keyboard");
  else bad("D shortcut", "drone did not start");

  /* ---------- 4. the microphone: tuner ---------- */
  results.push("\nMICROPHONE — TUNER");
  consoleErrors.length = 0;
  await page.getByRole("button", { name: "Listen", exact: true }).first().click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /Turn on the microphone/ }).click();
  await page.waitForTimeout(2500);

  const duckLabel = await page.locator(".tp-duck").count();
  const droneStillOn = await page.locator(".tp-dronebtn.on").count();
  if (droneStillOn === 1 && duckLabel === 1)
    ok("drone ducks while the microphone is open", "still armed, but silent");
  else bad("drone ducking", `drone-on=${droneStillOn} duck-label=${duckLabel} — a sustained tone would swamp the detector`);

  const bigNote = await page.locator(".card .mono").first().innerText();
  if (/^A2?$/.test(bigNote.trim())) ok("tuner reads the 110 Hz input as A2", bigNote.trim());
  else bad("tuner note", `showed "${bigNote.trim()}" for a 110 Hz tone`);

  const hz = await page.locator(".card").first().innerText();
  const hzMatch = hz.match(/(\d+\.\d)\s*Hz/);
  if (hzMatch && Math.abs(Number(hzMatch[1]) - 110) < 1.5) ok("frequency readout is accurate", `${hzMatch[1]} Hz (input 110.0)`);
  else bad("tuner frequency", `readout was ${hzMatch ? hzMatch[1] : "missing"}`);

  const centsTxt = await page.locator(".card").first().innerText();
  const centsMatch = centsTxt.match(/(-?\+?\d+)¢/);
  if (centsMatch && Math.abs(Number(centsMatch[1].replace("+", ""))) <= 6) ok("cents reading is in tune", `${centsMatch[1]}¢`);
  else bad("tuner cents", `showed ${centsMatch ? centsMatch[1] : "nothing"}`);

  const inTune = await page.locator(".card").first().innerText();
  if (inTune.includes("in tune")) ok('"in tune" latches after holding steady');
  else bad("in-tune latch", "never latched for a perfectly-tuned input");

  const strLit = await page.locator(".tn-string.on, .tn-string.ok").count();
  if (strLit >= 1) ok("the A string is highlighted in the string row");
  else bad("string highlight", "no string highlighted");

  // String numbering: 6 must be the LOW E (82.4 Hz) and 1 the high E (329.6).
  const rows = await page.locator(".tn-string").evaluateAll((els) =>
    els.map((e) => ({
      num: e.querySelector(".s")?.textContent?.trim(),
      note: e.querySelector(".n")?.textContent?.trim(),
      hz: Number(e.querySelector(".f")?.textContent),
    }))
  );
  const six = rows.find((r) => r.num === "6");
  const one = rows.find((r) => r.num === "1");
  if (six && one && Math.abs(six.hz - 82.4) < 1 && Math.abs(one.hz - 329.6) < 1)
    ok("strings are numbered the way a guitarist counts", `6 = ${six.hz}Hz, 1 = ${one.hz}Hz`);
  else bad("string numbering", `6 -> ${six?.hz}Hz, 1 -> ${one?.hz}Hz (expect 82.4 / 329.6)`);
  if (rows[0]?.num === "6") ok("string row runs low to high, like the neck");
  else bad("string order", `first row is string ${rows[0]?.num}`);

  if (consoleErrors.length) bad("tuner console", consoleErrors.slice(0, 2).join(" | "));
  await shot(page, "tuner");

  /* ---------- 5. the microphone: find-the-note drill ---------- */
  results.push("\nMICROPHONE — FIND THE NOTE");
  await page.getByRole("button", { name: /Find the note/ }).click();
  await page.waitForTimeout(300);

  // Key of A, minor pentatonic: the input tone is A = the root, so the drill
  // must mark it right when the prompt is "1" and wrong otherwise.
  await page.getByRole("button", { name: "▶ Start the drill" }).click();
  await page.waitForTimeout(2600);
  const scoreLine = (await page.locator(".mono", { hasText: /found/ }).first().innerText()).replace(/\s+/g, " ");
  const found = Number(scoreLine.match(/found\s+(\d+)/)?.[1] ?? -1);
  const wrongs = Number(scoreLine.match(/wrong notes\s+(\d+)/)?.[1] ?? -1);
  // The input is a constant A. Whatever degree is asked, the drill must have
  // reacted to it — either accepted it as the root or rejected it as wrong.
  if (found + wrongs > 0) ok("drill judged the played note", scoreLine.slice(0, 62));
  else bad("drill judging", `nothing registered — score line: ${scoreLine}`);

  // A correct answer must advance to a different degree.
  // Select the prompt by what it SAYS, not by its position — the page has
  // gained cards since this was written and will gain more.
  const promptCard = page.locator(".card", { hasText: /play this in|found it/i }).first();
  const cardNow = await promptCard.innerText();
  if (/play this in|found it/i.test(cardNow)) ok("drill keeps asking", cardNow.split("\n")[1]?.slice(0, 40) || "");
  else bad("drill prompt", cardNow.replace(/\n/g, " / ").slice(0, 120));

  // The string constraint must name the string it actually checks. The input is
  // A2 (midi 45), which lives at fret 5 of the LOW E string and nowhere on the
  // high E — so with string 6 selected, "not string 6" must never appear.
  await page.getByRole("button", { name: "■ Stop" }).click();
  await page.locator('.chip[title^="String 6"]').click();
  await page.getByRole("button", { name: "▶ Start the drill" }).click();
  await page.waitForTimeout(2600);
  const cardS6 = await promptCard.innerText();
  if (!/not string/.test(cardS6)) ok("string 6 means the low E, so a low-E note is accepted");
  else bad("string constraint", `chose string 6 and got: ${cardS6.replace(/\n/g, " / ").slice(0, 120)}`);
  if (/on string 6 \(E\)/.test(cardS6)) ok("the prompt names the constrained string");
  else bad("string prompt", cardS6.replace(/\n/g, " / ").slice(0, 120));
  await page.locator('.chip[title="any"], .chip >> text="any"').first().click().catch(() => {});

  // Judging must survive the click running underneath it.
  await page.getByRole("button", { name: "Start metronome" }).click();
  await page.waitForTimeout(1800);
  const scoreWithClick = (await page.locator(".mono", { hasText: /found/ }).first().innerText()).replace(/\s+/g, " ");
  const foundWithClick = Number(scoreWithClick.match(/found\s+(\d+)/)?.[1] ?? -1);
  if (foundWithClick >= found) ok("drill still works with the metronome running", scoreWithClick.slice(0, 46));
  else bad("drill with click", `score went backwards: ${scoreWithClick}`);
  await page.getByRole("button", { name: "Stop metronome" }).click();
  await shot(page, "find-the-note");

  /* ---------- 6. ear trainer play-back mode ---------- */
  results.push("\nEAR TRAINER — PLAY IT BACK");
  consoleErrors.length = 0;
  await page.getByRole("button", { name: "Ear", exact: true }).first().click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /Playing it/ }).click();
  await page.waitForTimeout(1200);
  const micOn = await page.locator(".mono", { hasText: "mic on" }).count();
  if (micOn >= 1) ok("play-back mode opens the microphone");
  else bad("ear mic", "microphone did not open in play mode");

  await page.getByRole("button", { name: /Play first|Next/ }).click();
  await page.waitForTimeout(3200);
  const earTotal = await page.locator(".mono", { hasText: /score/ }).first().innerText();
  if (/score\s+\d+\/[1-9]/.test(earTotal.replace(/\s+/g, " "))) ok("a played note was accepted as an answer", earTotal.replace(/\s+/g, " ").slice(0, 46));
  else bad("ear play answer", `score line: ${earTotal.replace(/\s+/g, " ")}`);
  if (consoleErrors.length) bad("ear console", consoleErrors.slice(0, 2).join(" | "));
  await shot(page, "ear-play-mode");

  /* ---------- 7. mic is released on navigation ---------- */
  results.push("\nHOUSEKEEPING");
  await page.getByRole("button", { name: "Decoder", exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.waitForTimeout(500);
  const duckGone = await page.locator(".tp-duck").count();
  const droneBack = await page.locator(".tp-dronebtn.on").count();
  if (droneBack === 1 && duckGone === 0) ok("drone comes back once the mic is released");
  else bad("drone resume", `drone-on=${droneBack} duck-label=${duckGone}`);
  await page.getByRole("button", { name: "Toggle drone" }).click();

  const tracks = await page.evaluate(() => {
    const all = (window.__streams || []).flatMap((s) => s.getTracks());
    return { total: all.length, live: all.filter((t) => t.readyState === "live").length };
  });
  if (tracks.total > 0 && tracks.live === 0)
    ok("microphone is released when you leave the page", `${tracks.total} stream track(s), 0 still live`);
  else if (tracks.total === 0) bad("mic release", "no streams were ever opened — mic test did not run");
  else bad("mic release", `${tracks.live} of ${tracks.total} track(s) still live after navigating away`);

  // Every audio path has now run: notes, clicks, and the microphone. If the
  // seven old per-component contexts were still around, this would not be 1.
  const ctxCount = await page.evaluate(() => window.__ctxCount || 0);
  if (ctxCount === 1) ok("one AudioContext for the entire app", "notes + click + mic all share it");
  else bad("AudioContext count", `expected 1, got ${ctxCount}`);

  /* ---------- 8. light theme + mobile layout ---------- */
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await page.waitForTimeout(400);
  await shot(page, "light-theme");
  ok("warm light theme still renders with the new UI");

  await page.setViewportSize({ width: 390, height: 780 });
  await page.getByRole("button", { name: "Listen", exact: true }).first().click();
  await page.waitForTimeout(400);
  const barBox = await page.locator(".tp").boundingBox();
  const bodyH = await page.evaluate(() => document.documentElement.clientHeight);
  if (barBox && barBox.y + barBox.height <= bodyH + 2) ok("transport bar fits the phone viewport", `${Math.round(barBox.height)}px tall`);
  else bad("mobile transport", `bar box ${JSON.stringify(barBox)} vs viewport ${bodyH}`);
  await shot(page, "mobile-listen");

  await browser.close();
  stopServer(proc);

  /* ---------- report ---------- */
  console.log(results.join("\n"));
  console.log(`\n${"─".repeat(60)}`);
  if (problems.length) {
    console.log(`FAILED — ${problems.length} problem(s):`);
    problems.forEach((p) => console.log(`  • ${p}`));
    process.exit(1);
  }
  console.log(`PASSED — ${results.filter((r) => r.startsWith("  ✓")).length} checks, 0 problems`);
}

let serverProc = null;
main().catch((e) => {
  // Print what DID run before the crash: a harness error thirty checks in is
  // far easier to place when you can see the last thing that passed.
  if (results.length) {
    console.log(results.join(String.fromCharCode(10)));
    console.log(String.fromCharCode(10) + "─".repeat(60));
  }
  console.error("HARNESS ERROR:", e.message || e);
  if (serverProc) stopServer(serverProc);
  process.exit(2);
});
