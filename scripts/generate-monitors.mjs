// shrpOS monitor generation.
//
// Regenerate the committed monitor GIFs:
//
//   node scripts/generate-monitors.mjs
//
// Each monitor is a self-contained display fragment with its own dimensions,
// palette and timeline. This file defines content and timing only; all
// rendering and encoding lives in scripts/monitor.mjs.
//
// Content vocabulary is limited to the local 5x7 font. That font has uppercase
// A-Z, digits, a few punctuation marks, and only the lowercase glyphs
// s h r p v. Nonbrand values are therefore written uppercase; the shrpOS brand
// keeps its lowercase "shrp" prefix. See docs/shrpos-monitors.md.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Monitor, Terminal } from './monitor.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const monitorsDir = join(root, 'assets', 'monitors');

// ------------------------------------------------------------------ palette

// 8-entry RGB palette shared by every monitor. Index 0 is transparent so
// frames that only add text leave the panel background untouched.
const PALETTE = [
  [5, 8, 5], // 0 TRANSPARENT (never painted)
  [5, 8, 5], // 1 BG
  [12, 46, 26], // 2 BAR
  [31, 143, 63], // 3 DIM
  [0, 255, 65], // 4 GREEN
  [170, 255, 192], // 5 BRIGHT
  [255, 176, 0], // 6 ACCENT (amber; external-link call to action only)
  [5, 8, 5],
];
const TRANSPARENT = 0;
const BG = 1;
const BAR = 2;
const DIM = 3;
const GREEN = 4;
const BRIGHT = 5;
const ACCENT = 6; // interactive accent: used only by mikes-stash
const CYAN = 6; // interactive accent, used only by mikes-stash

// ------------------------------------------------------- shared timing/grid

const CHARS_PER_FRAME = 4;
const TYPE_DELAY = 6; // centiseconds
const PAUSE_DELAY = 22;
const BLINK_DELAY = 30;
const HOLD_DELAY = 200;
const CLEAR_DELAY = 3; // one row erased per frame during the clean phase
const RESET_DELAY = 16; // brief empty terminal before the loop restarts

const ROW_TOP = 22; // first content row
const ROW_PITCH = 12;

// Header bar geometry shared by every panel: 13px bar, label left, tag right.
function panelBase(m, label, tag) {
  const px = m.newCanvas();
  m.strokeRect(px, 1, 1, m.width - 2, m.height - 2, 1, DIM);
  m.fillRect(px, 1, 1, m.width - 2, 13, BAR);
  m.drawText(px, label, 6, 4, GREEN);
  m.drawText(px, tag, m.width - 6 - m.textWidth(tag), 4, DIM);
  m.fillRect(px, 1, 14, m.width - 2, 1, DIM);
  m.strokeRect(px, 1, 1, m.width - 2, m.height - 2, 1, DIM);
  return px;
}

// Draws the shared panel chrome and returns a Terminal bound to its row grid.
// The chrome is the first frame; every later frame is a delta emitted by the
// Terminal.
function createPanel(m, label, tag) {
  m.push(panelBase(m, label, tag), TYPE_DELAY);
  return new Terminal(m, {
    x: 6,
    top: ROW_TOP,
    pitch: ROW_PITCH,
    rowHeight: 8,
    cursorOffset: 3,
    bg: BG,
    cursorColor: GREEN,
  });
}

// Types a prompt and command on `rowIndex` (e.g. "> WHOAMI"), character by
// character, then holds the completed command so it reads as received input.
function command(t, cmd, rowIndex = 0) {
  t.type(rowIndex, ' ' + cmd, GREEN, {
    startX: 6 + 6,
    prefix: [{ text: '>', x: 6, color: DIM }],
    charsPerFrame: 1,
    delayCs: TYPE_DELAY,
    endDelayCs: PAUSE_DELAY,
  });
  t.hold(PAUSE_DELAY);
}

// Clears the terminal bottom-up, one row per short frame, then shows a brief
// empty state. This is the clean -> reset tail shared by the looping monitors.
function cleanAndReset(t, lastRow) {
  const rows = [];
  for (let i = lastRow; i >= 0; i--) rows.push(i);
  t.clear(rows, { delayCs: CLEAR_DELAY });
  t.reset(RESET_DELAY);
}

// The shared shrpOS signature: the terminal character looks at the visitor,
// holds for a beat, winks one eye, then looks again briefly before the panel
// cleans itself. Drawn only from glyphs the 5x7 font already has. Not
// information, just personality. `0` renders with a diagonal and `O` without,
// so the closed eye reads. Boot uses the same characters and delays inline.
const FACE_LOOK = '0_0';
const FACE_WINK = '0_<';
const WINK_LOOK_DELAY = 40; // 0_0 before the wink: a noticeable beat
const WINK_CLOSED_DELAY = 12; // 0_< the wink itself is brief
const WINK_FINAL_DELAY = 45; // 0_0 after the wink, held before clearing
function wink(t, rowIndex) {
  t.write(rowIndex, [{ text: FACE_LOOK, x: 6, color: GREEN }], { delayCs: WINK_LOOK_DELAY });
  t.write(rowIndex, [{ text: FACE_WINK, x: 6, color: GREEN }], { delayCs: WINK_CLOSED_DELAY });
  t.write(rowIndex, [{ text: FACE_LOOK, x: 6, color: GREEN }], { delayCs: WINK_FINAL_DELAY });
}

// ------------------------------------------------------------ boot definition

const BOOT_W = 360;
const BOOT_H = 170; // all four monitors share this height for row alignment

const LINES = [
  '> INITIALIZING KERNEL...',
  '> STARTING SESSION...',
];
const READY = 'SYSTEM READY';
const WELCOME = 'WELCOME, MARCELO.';
const BOOT_FACE_Y = 136; // below WELCOME (y = 118)

function buildBoot() {
  const W = BOOT_W;
  const H = BOOT_H;
  const m = new Monitor({
    width: W,
    height: H,
    palette: PALETTE,
    background: BG,
    transparent: TRANSPARENT,
    loop: 0,
  });

  const rowY = (i) =>
    i === LINES.length ? 100 : i === LINES.length + 1 ? 118 : 22 + i * 12;
  const rowColor = (i) =>
    i === LINES.length ? GREEN : i === LINES.length + 1 ? BRIGHT : GREEN;

  // Static chrome, drawn before the text on the first frame.
  const renderBase = (px) => {
    m.strokeRect(px, 1, 1, W - 2, H - 2, 1, DIM);
    m.fillRect(px, 1, 1, W - 2, 13, BAR);
    m.drawText(px, 'shrpOS BIOS v1.0', 6, 4, GREEN);
    m.drawText(px, 'POST', W - 6 - m.textWidth('POST'), 4, DIM);
    m.fillRect(px, 1, 14, W - 2, 1, DIM);
  };

  // Repaints one row from scratch: clear it, then draw the text and optional
  // cursor. Repainting whole rows means no glyph or cursor from the previous
  // frame can be left behind.
  const paintRow = (px, i, text, cursor) => {
    const y = rowY(i);
    m.fillRect(px, 6, y, W - 12, 8, BG);
    if (text) m.drawText(px, text, 6, y, rowColor(i));
    if (cursor) m.drawCursor(px, 6 + m.textWidth(text) + 3, y, { color: GREEN });
  };

  // A frame paints only the rows that changed; every other pixel stays
  // transparent so the previous frame shows through. The cursor is drawn on at
  // most one row, and the row it just left is repainted so no stale cursor
  // block survives (disposal keeps the previous frame).
  const state = {
    lines: LINES.map(() => ''),
    typed: new Set(),
    cursorRow: 0,
    prevCursorRow: null,
    cursorOn: true,
  };

  const renderFrame = () => {
    const px = m.newCanvas();
    const rows = new Set(state.typed);
    rows.add(state.cursorRow);
    if (state.prevCursorRow !== null) rows.add(state.prevCursorRow);
    for (const i of rows) {
      paintRow(
        px,
        i,
        state.lines[i] || '',
        state.cursorOn && i === state.cursorRow
      );
    }
    state.prevCursorRow = state.cursorRow;
    return px;
  };

  const fullFrame = () => {
    const px = m.newCanvas();
    renderBase(px);
    m.strokeRect(px, 1, 1, W - 2, H - 2, 1, DIM);
    state.lines.forEach((line, i) => {
      if (line) m.drawText(px, line, 6, rowY(i), rowColor(i));
    });
    return px;
  };

  m.push(fullFrame(), TYPE_DELAY);

  const typeLine = (text, i) => {
    state.cursorRow = i;
    for (let end = CHARS_PER_FRAME; end < text.length; end += CHARS_PER_FRAME) {
      state.lines[i] = text.slice(0, end);
      state.typed = new Set([i]);
      m.push(renderFrame(), TYPE_DELAY);
    }
    state.lines[i] = text;
    state.typed = new Set([i]);
    m.push(renderFrame(), PAUSE_DELAY);
  };

  LINES.forEach((line, i) => typeLine(line, i));
  typeLine(READY, LINES.length);
  typeLine(WELCOME, LINES.length + 1);

  // Boot finished: park the cursor after SYSTEM READY and blink it there.
  state.cursorRow = LINES.length;
  m.blink(
    (visible) => {
      state.cursorOn = visible;
      state.typed = new Set();
      return renderFrame();
    },
    { cycles: 4, delayCs: BLINK_DELAY, firstVisible: false }
  );
  state.cursorOn = true;
  m.push(renderFrame(), HOLD_DELAY);

  // Shared character signature, on its own row. The row is erased to background
  // each frame so the wink does not smear under disposal-keep.
  const face = (text, delayCs) => {
    const px = m.newCanvas();
    m.fillRect(px, 6, BOOT_FACE_Y, W - 12, 8, BG);
    m.drawText(px, text, 6, BOOT_FACE_Y, GREEN);
    m.push(px, delayCs);
  };
  face(FACE_LOOK, WINK_LOOK_DELAY);
  face(FACE_WINK, WINK_CLOSED_DELAY);
  face(FACE_LOOK, WINK_FINAL_DELAY);

  // Boot now loops: wipe every content row bottom-up, show a brief empty state,
  // then restart from the chrome-only base frame.
  const contentRows = [BOOT_FACE_Y];
  for (let i = LINES.length + 1; i >= 0; i--) contentRows.push(rowY(i));
  contentRows.sort((a, b) => b - a);
  for (const y of contentRows) {
    const px = m.newCanvas();
    m.fillRect(px, 6, y, W - 12, 8, BG);
    m.push(px, CLEAR_DELAY);
  }
  m.push(m.newCanvas(), RESET_DELAY);

  return m;
}

// --------------------------------------------------------- profile definition

// Identity and environment. This absorbs what used to be spread across the
// separate profile, stack and github monitors: who the operator is, the
// environment they work in, and the account. It is deliberately not a full
// technology list and repeats no Asher-specific stack.
const PROFILE_WINK_ROW = 9;
const PROFILE_LAST_ROW = PROFILE_WINK_ROW;

function buildProfile() {
  const m = new Monitor({
    width: 420,
    height: 170, // all four monitors share this height for row alignment
    palette: PALETTE,
    background: BG,
    transparent: TRANSPARENT,
    loop: 0,
  });
  const t = createPanel(m, 'shrpOS :: OPERATOR', 'v1.1');

  command(t, 'WHOAMI');
  t.write(2, [{ text: 'MARCELO', x: 6, color: BRIGHT }], {
    cursor: t.cursorAfter(2, 'MARCELO'),
    delayCs: PAUSE_DELAY,
  });
  t.write(3, [{ text: 'SOFTWARE DEVELOPER', x: 6, color: GREEN }], {
    delayCs: PAUSE_DELAY,
  });
  t.write(5, [{ text: 'CSHARP .NET FNA', x: 6, color: GREEN }], {
    delayCs: PAUSE_DELAY,
  });
  t.write(6, [{ text: 'LINUX / WINDOWS', x: 6, color: GREEN }], {
    delayCs: PAUSE_DELAY,
  });
  t.write(7, [{ text: 'GITHUB ONLINE', x: 6, color: GREEN }], {
    delayCs: PAUSE_DELAY,
  });

  t.hold(HOLD_DELAY);
  wink(t, PROFILE_WINK_ROW);

  cleanAndReset(t, PROFILE_LAST_ROW);

  return m;
}

// -------------------------------------------------------- projects definition

// Projects only: Asher first. The technology list lives in profile, so the
// project panel answers "what am I building", not "what do I use".
const PROJECT_WINK_ROW = 10;
const PROJECT_LAST_ROW = PROJECT_WINK_ROW;

function buildProjects() {
  const m = new Monitor({
    width: 520,
    height: 170,
    palette: PALETTE,
    background: BG,
    transparent: TRANSPARENT,
    loop: 0,
  });
  const t = createPanel(m, 'shrpOS :: PROJECT REGISTRY', 'QUERY');

  command(t, 'QUERY ASHER');
  t.type(2, '> SEARCHING PROJECT INDEX...', GREEN, {
    charsPerFrame: 3,
    delayCs: TYPE_DELAY,
    endDelayCs: PAUSE_DELAY,
  });
  t.hold(PAUSE_DELAY);

  t.write(4, [{ text: 'ASHER', x: 6, color: BRIGHT }], {
    cursor: t.cursorAfter(4, 'ASHER'),
    delayCs: PAUSE_DELAY,
  });
  t.write(5, [{ text: 'ACTIVE DEVELOPMENT', x: 6, color: GREEN }], {
    delayCs: PAUSE_DELAY,
  });
  t.write(7, [{ text: 'MODDING PLATFORM', x: 6, color: GREEN }], {
    delayCs: PAUSE_DELAY,
  });
  t.write(8, [{ text: 'DUST: AN ELYSIAN TAIL', x: 6, color: GREEN }], {
    delayCs: PAUSE_DELAY,
  });

  t.hold(HOLD_DELAY);
  wink(t, PROJECT_WINK_ROW);

  cleanAndReset(t, PROJECT_LAST_ROW);

  return m;
}

// ----------------------------------------------------- external link definition

// Not an internal shrpOS subsystem. This panel points outward: the terminal
// looks outside itself, names the exit to the real website, and then explicitly
// invites a click. The ACCENT colour appears only on that call to action so it
// reads as interactive; the rest of the panel stays green. The README wraps the
// GIF in an <a>; the GIF only presents the gateway.
const STASH_NAME_ROW = 4;
const STASH_CTA_ROW = 7;
const STASH_WINK_ROW = 9;
const STASH_LAST_ROW = STASH_WINK_ROW;

function buildStash() {
  const m = new Monitor({
    width: 520,
    height: 170, // matches projects so the README row aligns edge to edge
    palette: PALETTE,
    background: BG,
    transparent: TRANSPARENT,
    loop: 0,
  });
  const t = createPanel(m, 'shrpOS :: EXTERNAL LINK', 'LINK');

  command(t, 'OPEN WEB_INTERFACE');
  t.type(2, 'LOOKING OUTSIDE...', DIM, {
    charsPerFrame: 3,
    delayCs: TYPE_DELAY,
    endDelayCs: PAUSE_DELAY,
  });
  t.hold(PAUSE_DELAY);

  t.write(STASH_NAME_ROW, [{ text: 'MIKES STASH', x: 6, color: BRIGHT }], {
    cursor: t.cursorAfter(STASH_NAME_ROW, 'MIKES STASH'),
    delayCs: PAUSE_DELAY,
  });
  t.write(5, [{ text: 'CONNECTION ESTABLISHED', x: 6, color: GREEN }], {
    delayCs: PAUSE_DELAY,
  });

  // The only accent-coloured line in any monitor: an explicit invitation.
  t.write(STASH_CTA_ROW, [{ text: '>> CLICK TO ACCESS CONNECTION <<', x: 6, color: ACCENT }], {
    delayCs: PAUSE_DELAY,
  });

  t.hold(HOLD_DELAY);
  wink(t, STASH_WINK_ROW);

  cleanAndReset(t, STASH_LAST_ROW);

  return m;
}

// -------------------------------------------------------------------- runner

const monitors = {
  'boot.gif': buildBoot(),
  'profile.gif': buildProfile(),
  'projects.gif': buildProjects(),
  // Renamed from mikes-stash.gif to bust GitHub's image-proxy cache after the
  // call-to-action was added.
  'mikesstash.gif': buildStash(),
};

for (const [name, monitor] of Object.entries(monitors)) {
  const out = join(monitorsDir, name);
  const result = monitor.writeGif(out);
  console.log(
    `generated ${result.file}\n` +
      `  ${result.frames} frames, ${result.seconds.toFixed(2)}s, ` +
      `${(result.gif.length / 1024).toFixed(1)} KB`
  );
}
