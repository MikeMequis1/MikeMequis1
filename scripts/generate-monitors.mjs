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
  [5, 8, 5],
  [5, 8, 5],
];
const TRANSPARENT = 0;
const BG = 1;
const BAR = 2;
const DIM = 3;
const GREEN = 4;
const BRIGHT = 5;

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
const VALUE_X = 54; // label/value column for two-column rows

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

// Reveals one label/value row with the cursor parked after the value.
function fieldRow(t, rowIndex, label, value, labelColor, valueColor, delayCs = PAUSE_DELAY) {
  const parts = [];
  if (label) parts.push({ text: label, x: 6, color: labelColor });
  parts.push({ text: value, x: VALUE_X, color: valueColor });
  t.write(rowIndex, parts, { cursor: t.cursorAfter(rowIndex, value, VALUE_X), delayCs });
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
// winks one eye, then returns to normal before the panel cleans itself. Drawn
// only from glyphs the 5x7 font already has. Not information, just personality.
const WINK_FRAMES = ['O_O', '0_<', 'O_O'];
const WINK_DELAY = 18;
function wink(t, rowIndex, delayCs = WINK_DELAY) {
  for (const text of WINK_FRAMES) {
    t.write(rowIndex, [{ text, x: 6, color: GREEN }], { delayCs });
  }
}

// ------------------------------------------------------------ boot definition

const BOOT_W = 360;
const BOOT_H = 160;

const LINES = [
  '> INITIALIZING KERNEL...',
  '> LOADING USER PROFILE...',
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

  // Boot is one-shot, so it ends on the wink rather than clearing. The face row
  // is erased to background each frame before drawing, so the wink does not
  // smear the previous glyphs together under disposal-keep.
  for (const text of WINK_FRAMES) {
    const px = m.newCanvas();
    m.fillRect(px, 6, BOOT_FACE_Y, W - 12, 8, BG);
    m.drawText(px, text, 6, BOOT_FACE_Y, GREEN);
    m.push(px, WINK_DELAY);
  }

  return m;
}

// --------------------------------------------------------- profile definition

// Identity panel. Values come from the repository only; only what identifies
// the operator is kept.
const PROFILE_ROWS = [
  ['USER', 'MARCELO', DIM, BRIGHT],
  ['ROLE', 'SOFTWARE DEVELOPER', DIM, BRIGHT],
  ['SHELL', '/BIN/shrp', DIM, GREEN],
  ['NODE', 'GITHUB.COM/MIKEMEQUIS1', DIM, GREEN],
];
const PROFILE_WELCOME_ROW = 7;
const PROFILE_WINK_ROW = 9;
const PROFILE_LAST_ROW = PROFILE_WINK_ROW;

function buildProfile() {
  const m = new Monitor({
    width: 420,
    height: 150,
    palette: PALETTE,
    background: BG,
    transparent: TRANSPARENT,
    loop: 0,
  });
  const t = createPanel(m, 'shrpOS :: OPERATOR', 'v1.1');

  // Identity query: prompt is typed, then the terminal resolves and reveals.
  command(t, 'WHOAMI');
  t.type(1, '> RESOLVING IDENTITY...', GREEN, {
    charsPerFrame: 4,
    delayCs: TYPE_DELAY,
    endDelayCs: PAUSE_DELAY,
  });
  t.hold(PAUSE_DELAY);

  PROFILE_ROWS.forEach(([label, value, lc, vc], i) => {
    fieldRow(t, i + 2, label, value, lc, vc);
  });

  // The terminal recognises its operator on the way out, then winks.
  t.write(PROFILE_WELCOME_ROW, [{ text: 'WELCOME BACK', x: 6, color: BRIGHT }], {
    delayCs: PAUSE_DELAY,
  });
  t.hold(HOLD_DELAY);
  wink(t, PROFILE_WINK_ROW);

  cleanAndReset(t, PROFILE_LAST_ROW);

  return m;
}

// -------------------------------------------------------- projects definition

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

  // Search, find, answer. One process line, one result block.
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
  t.write(7, [{ text: 'CSHARP .NET HARMONY MONO', x: 6, color: GREEN }], {
    delayCs: PAUSE_DELAY,
  });
  t.write(8, [{ text: 'FNA LINUX WINDOWS', x: 6, color: GREEN }], {
    delayCs: PAUSE_DELAY,
  });

  t.hold(HOLD_DELAY);
  wink(t, PROJECT_WINK_ROW);

  cleanAndReset(t, PROJECT_LAST_ROW);

  return m;
}

// ----------------------------------------------------------- stack definition

// Runtime/project modules already established by the repository. Verified in
// sequence; OK is text because the font has no bracket glyphs.
const STACK_MODULES = [
  'CSHARP',
  '.NET',
  'HARMONY',
  'MONO',
  'FNA',
  'LINUX',
  'WINDOWS',
];
const STACK_COLS = 24; // char cells from column 0 to the OK marker

function buildStack() {
  const m = new Monitor({
    width: 360,
    height: 160,
    palette: PALETTE,
    background: BG,
    transparent: TRANSPARENT,
    loop: 0,
  });
  const t = createPanel(m, 'shrpOS :: SYSTEM MODULES', 'DIAG');

  // Capability check: each module is verified in sequence, not rated.
  command(t, 'CHECK STACK');

  STACK_MODULES.forEach((name, i) => {
    const row = i + 2;
    const dots = '.'.repeat(STACK_COLS - name.length - 3);
    const okX = 6 + (STACK_COLS - 2) * 6;
    const scanParts = [
      { text: name, x: 6, color: GREEN },
      { text: dots, x: 6 + (name.length + 1) * 6, color: DIM },
    ];

    t.write(row, scanParts, { cursor: { y: t.rowY(row), x: okX }, delayCs: TYPE_DELAY });
    t.write(row, [...scanParts, { text: 'OK', x: okX, color: GREEN }], {
      cursor: t.cursorAfter(row, 'OK', okX),
      delayCs: PAUSE_DELAY,
    });
  });

  // All clear, and the terminal is quietly pleased about it.
  t.write(9, [{ text: 'STACK READY', x: 6, color: BRIGHT }], {
    delayCs: PAUSE_DELAY,
  });

  t.hold(HOLD_DELAY);
  wink(t, 10);

  cleanAndReset(t, 10);

  return m;
}

// ---------------------------------------------------------- github definition

const GITHUB_ROWS = [
  ['REPOSITORIES', 'OK', GREEN],
  ['ACTIVITY', 'OK', GREEN],
  ['PROFILE', 'ONLINE', BRIGHT],
];
const GITHUB_COLS = 30; // char cells from column 0 to the marker

const GITHUB_WINK_ROW = 8;
const GITHUB_LAST_ROW = GITHUB_WINK_ROW;

function buildGithub() {
  const m = new Monitor({
    width: 420,
    height: 150,
    palette: PALETTE,
    background: BG,
    transparent: TRANSPARENT,
    loop: 0,
  });
  const t = createPanel(m, 'shrpOS :: GITHUB SUBSYSTEM', 'SYNC');

  // Synchronization: each subsystem settles, then the sync completes.
  command(t, 'SYNC');

  GITHUB_ROWS.forEach(([label, marker, mc], i) => {
    const row = i + 2;
    const dots = '.'.repeat(GITHUB_COLS - label.length - marker.length - 1);
    const markerX = 6 + (GITHUB_COLS - marker.length) * 6;
    const baseParts = [
      { text: label, x: 6, color: GREEN },
      { text: dots, x: 6 + (label.length + 1) * 6, color: DIM },
    ];

    t.write(row, baseParts, { cursor: { y: t.rowY(row), x: markerX }, delayCs: TYPE_DELAY });
    t.write(row, [...baseParts, { text: marker, x: markerX, color: mc }], {
      cursor: t.cursorAfter(row, marker, markerX),
      delayCs: PAUSE_DELAY,
    });
  });

  t.write(6, [{ text: 'SYNC COMPLETE', x: 6, color: BRIGHT }], {
    cursor: t.cursorAfter(6, 'SYNC COMPLETE'),
    delayCs: PAUSE_DELAY,
  });

  t.hold(HOLD_DELAY);
  wink(t, GITHUB_WINK_ROW);

  cleanAndReset(t, GITHUB_LAST_ROW);

  return m;
}

// ----------------------------------------------------- external link definition

// Not an internal shrpOS subsystem. This panel points outward: the terminal
// looks outside itself and names the exit to the real website. The README wraps
// it in an <a>; the GIF only presents the gateway. The destination is the final
// meaningful result, then the shared wink.
const STASH_NAME_ROW = 6;
const STASH_WINK_ROW = 8;
const STASH_LAST_ROW = STASH_WINK_ROW;

function buildStash() {
  const m = new Monitor({
    width: 520,
    height: 140,
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

  t.write(4, [{ text: 'CONNECTION ESTABLISHED', x: 6, color: GREEN }], {
    delayCs: PAUSE_DELAY,
  });
  t.write(STASH_NAME_ROW, [{ text: 'MIKES STASH', x: 6, color: BRIGHT }], {
    cursor: t.cursorAfter(STASH_NAME_ROW, 'MIKES STASH'),
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
  'stack.gif': buildStack(),
  'github.gif': buildGithub(),
  'mikes-stash.gif': buildStash(),
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
