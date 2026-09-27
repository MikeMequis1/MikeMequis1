// shrpOS monitor engine.
//
// Small, zero-dependency terminal-monitor renderer. Owns the low-level
// concerns shared by every shrpOS display fragment:
//
//   - indexed-palette canvases (one byte per pixel)
//   - 5x7 bitmap text drawing and block cursor drawing
//   - a frame sequencer (push / hold / blink) with explicit per-frame delays
//   - delta/transparent-frame model: a frame is a fresh transparent canvas and
//     only the regions that changed are painted
//   - GIF89a encoding with LZW compression and palette handling
//
// Content and animation timelines live in monitor definitions
// (see scripts/generate-monitors.mjs), never here. The engine has no knowledge
// of boot lines, labels or any specific display.
//
// Determinism: given the same dimensions, palette, font, frames and delays the
// encoder produces byte-identical output. No network, clock, randomness or
// environment access.
//
// Dependencies: node:fs, node:path and the local font module only.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { FONT as DEFAULT_FONT, glyphFor } from './monitor-font.mjs';

export { DEFAULT_FONT };

// ---------------------------------------------------------------- GIF output

const u16 = (v) => [v & 0xff, (v >> 8) & 0xff];

// GIF LZW. Builds the code table for the whole input and emits variable-width
// codes. This mirrors the reference compressor: an entry is looked up and
// inserted for every (previous-code, next-byte) pair, and the code width grows
// once the next free code no longer fits the current width. Returns the LZW
// byte stream without sub-block framing.
export function lzwEncode(pixels, minCodeSize) {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  const bytes = [];
  let codeSize = minCodeSize + 1;
  let nextCode = endCode + 1;
  let bitBuffer = 0;
  let bitCount = 0;
  const dict = new Map();

  const emit = (code) => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      bytes.push(bitBuffer & 0xff);
      bitBuffer >>>= 8;
      bitCount -= 8;
    }
  };

  emit(clearCode);
  let prefix = pixels[0];

  for (let i = 1; i < pixels.length; i++) {
    const k = pixels[i];
    const key = (prefix << 8) | k;
    const found = dict.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix);
    if (nextCode === 4096) {
      // Table full: reset so decoding stays in lockstep.
      emit(clearCode);
      dict.clear();
      codeSize = minCodeSize + 1;
      nextCode = endCode + 1;
    } else {
      if (nextCode >= 1 << codeSize) codeSize++;
      dict.set(key, nextCode++);
    }
    prefix = k;
  }

  emit(prefix);
  emit(endCode);
  if (bitCount > 0) bytes.push(bitBuffer & 0xff);
  return bytes;
}

// Encodes a frame sequence as a GIF89a buffer.
//
//   width, height  canvas size in pixels
//   palette        array of [r,g,b] entries; length defines the global table
//   background     palette index used as the GIF background colour
//   transparent    palette index treated as transparent (delta frames)
//   loop           null to omit the NETSCAPE loop extension, or a loop count
//                  (0 = infinite)
//   frames         [{ px: Uint8Array, delayCs: number }]
//
// Transparent pixels combined with disposal method 1 mean each frame only
// repaints what changed and reveals the previous frame everywhere else.
export function encodeGif({
  width,
  height,
  palette,
  background = 0,
  transparent = 0,
  loop = null,
  frames,
}) {
  const bits = Math.max(1, Math.ceil(Math.log2(palette.length)));
  const tableSize = 1 << bits;
  const minCodeSize = Math.max(2, bits);
  const out = [];

  for (const ch of 'GIF89a') out.push(ch.charCodeAt(0));
  out.push(...u16(width), ...u16(height));
  out.push(0x80 | (7 << 4) | (bits - 1)); // global table, size = bits-1
  out.push(background & 0xff, 0);
  for (let i = 0; i < tableSize; i++) {
    const c = palette[i] || [0, 0, 0];
    out.push(c[0], c[1], c[2]);
  }

  if (loop !== null) {
    out.push(0x21, 0xff, 0x0b);
    for (const ch of 'NETSCAPE2.0') out.push(ch.charCodeAt(0));
    out.push(0x03, 0x01, ...u16(loop), 0x00);
  }

  for (const frame of frames) {
    out.push(0x21, 0xf9, 0x04, 0x05, ...u16(frame.delayCs), transparent, 0x00);
    out.push(0x2c, ...u16(0), ...u16(0), ...u16(width), ...u16(height), 0x00);
    out.push(minCodeSize);
    const data = lzwEncode(frame.px, minCodeSize);
    for (let i = 0; i < data.length; i += 255) {
      const chunk = data.slice(i, i + 255);
      out.push(chunk.length, ...chunk);
    }
    out.push(0x00);
  }

  out.push(0x3b);
  return Buffer.from(out);
}

// ------------------------------------------------------------------ Monitor

export class Monitor {
  constructor({
    width,
    height,
    palette,
    background = 0,
    transparent = 0,
    scale = 1,
    font = DEFAULT_FONT,
    fps = 20,
    loop = null,
  }) {
    this.width = width;
    this.height = height;
    this.palette = palette;
    this.background = background;
    this.transparent = transparent;
    this.scale = scale;
    this.font = font;
    this.fps = fps;
    this.loop = loop;
    this.frames = [];
  }

  // ------------------------------------------------------------ pixel canvas

  newCanvas() {
    return new Uint8Array(this.width * this.height).fill(this.transparent);
  }

  fillRect(px, x, y, w, h, color) {
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(this.width, x + w);
    const y1 = Math.min(this.height, y + h);
    for (let yy = y0; yy < y1; yy++) {
      const row = yy * this.width;
      for (let xx = x0; xx < x1; xx++) px[row + xx] = color;
    }
  }

  strokeRect(px, x, y, w, h, thickness, color) {
    this.fillRect(px, x, y, w, thickness, color);
    this.fillRect(px, x, y + h - thickness, w, thickness, color);
    this.fillRect(px, x, y, thickness, h, color);
    this.fillRect(px, x + w - thickness, y, thickness, h, color);
  }

  drawCursor(px, x, y, { color, w = 4, h = 7 } = {}) {
    this.fillRect(px, x, y, w * this.scale, h * this.scale, color);
  }

  // -------------------------------------------------------------- bitmap text

  drawGlyph(px, ch, x, y, color) {
    const rows = glyphFor(ch);
    const s = this.scale;
    for (let r = 0; r < 7; r++) {
      const bits = rows[r];
      for (let b = 0; b < 5; b++) {
        if (bits & (1 << (4 - b))) {
          this.fillRect(px, x + b * s, y + r * s, s, s, color);
        }
      }
    }
  }

  drawText(px, text, x, y, color) {
    let cx = x;
    for (const ch of text) {
      this.drawGlyph(px, ch, cx, y, color);
      cx += 6 * this.scale;
    }
  }

  textWidth(text) {
    return text.length * 6 * this.scale;
  }

  // ------------------------------------------------------------ frame seq

  push(px, delayCs) {
    this.frames.push({ px, delayCs });
  }

  // Repeats the most recent frame (or a supplied canvas) to create a hold.
  hold(delayCs, px) {
    const canvas = px ?? this.frames.at(-1)?.px;
    if (!canvas) throw new Error('hold() requires a previous frame or canvas');
    this.frames.push({ px: canvas, delayCs });
  }

  // Pushes `cycles` frames that alternate cursor visibility. `renderFrame`
  // receives the visibility for each frame and returns its canvas.
  blink(renderFrame, { cycles = 4, delayCs, firstVisible = false } = {}) {
    let visible = !firstVisible;
    for (let n = 0; n < cycles; n++) {
      visible = !visible;
      this.push(renderFrame(visible), delayCs);
    }
  }

  // Delay in centiseconds that approximates `count` frames at this monitor's
  // FPS. Frames always carry explicit delays; this is a convenience helper.
  delayForFrames(count = 1) {
    return Math.max(1, Math.round((100 * count) / this.fps));
  }

  // ------------------------------------------------------------------ output

  encode() {
    return encodeGif({
      width: this.width,
      height: this.height,
      palette: this.palette,
      background: this.background,
      transparent: this.transparent,
      loop: this.loop,
      frames: this.frames,
    });
  }

  get frameCount() {
    return this.frames.length;
  }

  get durationSeconds() {
    return this.frames.reduce((t, f) => t + f.delayCs, 0) / 100;
  }

  writeGif(outputPath) {
    const gif = this.encode();
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, gif);
    return { file: outputPath, gif, frames: this.frameCount, seconds: this.durationSeconds };
  }
}

// ---------------------------------------------------------------- Terminal

// Reusable terminal-cycle model on top of a Monitor.
//
// A Terminal owns a fixed row grid (row index -> y position) and a single
// cursor. Every emitted frame is a fresh transparent canvas; only the rows
// that changed are painted, plus the row the cursor just left, so unchanged
// pixels stay transparent and the previous frame shows through (disposal keep).
//
// The primitives are intentionally generic: `type` reveals text character by
// character with the cursor following, `write` prints a row in one step, `hold`
// freezes the current state, `blink` toggles the cursor, `clear` erases rows
// one by one and `reset` repaints every known row empty. A monitor definition
// composes these into its own timeline (type -> process -> result -> hold ->
// clean -> reset) without re-implementing frame bookkeeping.
//
// The Terminal has no knowledge of any specific display or of shrpOS chrome.
export class Terminal {
  constructor(
    monitor,
    { x = 6, top = 22, pitch = 12, rowHeight = 8, cursorOffset = 3, bg, cursorColor } = {}
  ) {
    this.m = monitor;
    this.x = x;
    this.top = top;
    this.pitch = pitch;
    this.rowHeight = rowHeight;
    this.cursorOffset = cursorOffset;
    this.bg = bg;
    this.cursorColor = cursorColor;
    this.rowContent = new Map();
    this.cursor = null;
    this.cursorRow = null;
  }

  rowY(rowIndex) {
    return this.top + rowIndex * this.pitch;
  }

  // Cursor position that sits just after `text` typed from `startX`.
  cursorAfter(rowIndex, text, startX = this.x) {
    return { y: this.rowY(rowIndex), x: startX + this.m.textWidth(text) + this.cursorOffset };
  }

  // Paints a row: erase it to background, draw its parts, remember them.
  paint(px, y, parts) {
    this.m.fillRect(px, this.x, y, this.m.width - 2 * this.x, this.rowHeight, this.bg);
    for (const p of parts) this.m.drawText(px, p.text, p.x ?? this.x, y, p.color);
    this.rowContent.set(y, parts);
  }

  render(px, updates, cursor) {
    for (const u of updates) this.paint(px, u.y, u.parts);
    if (this.cursorRow !== null && (!cursor || cursor.y !== this.cursorRow)) {
      this.paint(px, this.cursorRow, this.rowContent.get(this.cursorRow) || []);
    }
    if (cursor) this.m.drawCursor(px, cursor.x, cursor.y, { color: this.cursorColor });
    this.cursorRow = cursor ? cursor.y : null;
  }

  emit(updates, cursor, delayCs) {
    const px = this.m.newCanvas();
    this.render(px, updates, cursor);
    this.m.push(px, delayCs);
    return px;
  }

  // Prints one row in a single step.
  write(rowIndex, parts, { cursor = null, delayCs = 1 } = {}) {
    this.emit([{ y: this.rowY(rowIndex), parts }], cursor, delayCs);
    this.cursor = cursor;
  }

  // Reveals `text` on a row, `charsPerFrame` characters at a time, with the
  // cursor following the visible text. The final frame uses `endDelayCs` so a
  // completed command can settle before the next phase.
  type(
    rowIndex,
    text,
    color,
    {
      charsPerFrame = 1,
      delayCs = 1,
      endDelayCs = delayCs,
      startX = this.x,
      cursor = true,
      prefix = [],
    } = {}
  ) {
    const step = Math.max(1, charsPerFrame);
    const partsFor = (shown) => [...prefix, { text: shown, x: startX, color }];
    for (let end = step; end < text.length; end += step) {
      const shown = text.slice(0, end);
      const c = cursor ? this.cursorAfter(rowIndex, shown, startX) : null;
      this.write(rowIndex, partsFor(shown), { cursor: c, delayCs });
    }
    const c = cursor ? this.cursorAfter(rowIndex, text, startX) : null;
    this.write(rowIndex, partsFor(text), { cursor: c, delayCs: endDelayCs });
  }

  // Freezes the whole terminal for `delayCs`, cursor included.
  hold(delayCs) {
    const updates = [...this.rowContent.entries()].map(([y, parts]) => ({ y, parts }));
    this.emit(updates, this.cursor, delayCs);
  }

  // Alternates cursor visibility over the current state. `firstVisible`
  // controls whether the first blink frame shows the cursor.
  blink(cycles, delayCs, { firstVisible = true } = {}) {
    const updates = [...this.rowContent.entries()].map(([y, parts]) => ({ y, parts }));
    for (let n = 0; n < cycles; n++) {
      const visible = n % 2 === 0 ? firstVisible : !firstVisible;
      this.emit(updates, visible ? this.cursor : null, delayCs);
    }
  }

  // Erases the given rows in the order supplied (callers pass them bottom-up),
  // one frame per row, leaving the terminal clean but still on screen.
  clear(rowIndexes, { delayCs = 1 } = {}) {
    for (const i of rowIndexes) this.write(i, [], { delayCs });
    this.cursor = null;
  }

  // Repaints every known row empty for `delayCs`: the short empty state shown
  // before the monitor loops back to its first frame.
  reset(delayCs) {
    const updates = [];
    for (const y of this.rowContent.keys()) {
      updates.push({ y, parts: [] });
      this.rowContent.set(y, []);
    }
    this.emit(updates, null, delayCs);
    this.cursor = null;
  }
}
