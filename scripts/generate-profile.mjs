// shrpOS profile asset generator.
//
// Produces the static SVG assets used by the profile README. No dependencies:
// node scripts/generate-profile.mjs
//
// The generated SVGs are committed to assets/ so GitHub can serve them directly.
// Re-run this script after editing colours, text or timing below.
//
// Animation model: CSS keyframes inside the SVG. This keeps everything
// JavaScript-free and works when the file is referenced through <img> (GitHub
// serves repo SVGs as images). If animation is unsupported or disabled, the
// final frame is still the complete message.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'assets');
mkdirSync(outDir, { recursive: true });

const T = {
  bg: '#050805',
  panel: '#0b120b',
  green: '#00ff41',
  bright: '#aaffc0',
  text: '#8bf0a4',
  dim: '#1f8f3f',
  faint: '#0c2e1a',
};

const FONT =
  "'Cascadia Mono','JetBrains Mono','Fira Code',Consolas,'Courier New',monospace";

const CW = 0.6; // monospace advance-width factor (0.6em per glyph)
const BODY_FS = 15;

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const textWidth = (s, size = BODY_FS) =>
  Math.round(s.length * size * CW * 100) / 100;

// Shared CRT backdrop: dark panel, faint grid, scanlines and clipped title bar
// drawn before the text so the texture never dims the content. The rounded
// border is painted last so it stays crisp over the title bar.
function backdrop(w, h, bar) {
  return `  <rect width="${w}" height="${h}" fill="${T.bg}"/>
  <rect width="${w}" height="${h}" fill="url(#grid)"/>
  <rect width="${w}" height="${h}" fill="url(#scan)"/>
  <g clip-path="url(#panel)">
${bar}
  </g>
  <rect x="0.5" y="0.5" width="${w - 1}" height="${
    h - 1
  }" rx="8" fill="none" stroke="${T.dim}" stroke-opacity="0.55"/>`;
}

function defs(w, h) {
  return `  <defs>
    <pattern id="grid" width="26" height="26" patternUnits="userSpaceOnUse">
      <path d="M26 0H0V26" fill="none" stroke="${T.green}" stroke-opacity="0.05"/>
    </pattern>
    <pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse">
      <rect width="4" height="1" fill="#000000" fill-opacity="0.22"/>
    </pattern>
    <clipPath id="panel">
      <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="8"/>
    </clipPath>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="1.6" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>`;
}

function titleBar(w, label, version) {
  return `  <rect x="0" y="0" width="${w}" height="38" fill="${T.faint}"/>
  <line x1="0" y1="38" x2="${w}" y2="38" stroke="${T.dim}" stroke-opacity="0.6"/>
  <text x="24" y="25" font-family=${JSON.stringify(
    FONT
  )} font-size="13" fill="${T.green}" letter-spacing="1.2">${esc(
    label
  )}</text>
  <text x="${
    w - 24
  }" y="25" text-anchor="end" font-family=${JSON.stringify(
    FONT
  )} font-size="13" fill="${T.dim}" letter-spacing="1.2">${esc(
    version
  )}</text>`;
}

// Disables the decorative animations for visitors who prefer reduced motion.
// With animation off, nothing is clipped, so every line stays visible.
function reducedMotion() {
  return `    @media (prefers-reduced-motion: reduce) {
      .type, .cursor, .pulse { animation: none !important; }
      .type { clip-path: none; }
      .cursor { opacity: 1; transform: none; }
    }`;
}

function writeAsset(name, svg) {
  const file = join(outDir, name);
  writeFileSync(file, svg.trimEnd() + '\n', 'utf8');
  return file;
}

// ---------------------------------------------------------------- boot asset

// Pads a label with dots up to a fixed column so the OK markers line up.
function bootLine(label, width = 40) {
  const tail = ' OK';
  const dots = Math.max(2, width - label.length - tail.length);
  return `${label} ${'.'.repeat(dots)}${tail}`;
}

// Staged boot sequence. The whole reveal lands around 4.5s, then holds on the
// final frame; only the cursor keeps blinking.
const BOOT_LINES = [
  '> Power on',
  '> POST',
  '> Initializing kernel',
  '> Loading user profile',
  '> Connecting to GitHub',
  '> Loading project registry',
];

function bootSvg() {
  const W = 880;
  const H = 384;
  const x = 30;
  const f = JSON.stringify(FONT);

  const start = 0.45;
  const step = 0.42;
  const lines = BOOT_LINES.map((t, i) => ({
    t: bootLine(t),
    d: Math.round((start + i * step) * 100) / 100,
  }));

  const rowY = (i) => 112 + i * 28;
  const readyY = rowY(BOOT_LINES.length) + 24;
  const welcomeY = readyY + 40;
  const readyDelay = Math.round((lines[lines.length - 1].d + 0.55) * 100) / 100;
  const cursorDelay = Math.round((readyDelay + 0.45) * 100) / 100;

  const rows = lines
    .map(
      (l, i) =>
        `  <text x="${x}" y="${rowY(
          i
        )}" class="type l${i + 1}" font-family=${f} font-size="${BODY_FS}" fill="${
          T.text
        }">${esc(l.t)}</text>`
    )
    .join('\n');

  const rules = [
    `.bios{animation:type .5s steps(22,end) .1s both}`,
    ...lines.map((l, i) => `.l${i + 1}{animation-delay:${l.d}s}`),
    `.ready{animation:type .45s steps(12,end) ${readyDelay}s both}`,
    `.welcome{animation:type .8s steps(17,end) ${cursorDelay}s both}`,
  ].join('\n    ');

  const cursorX = x + textWidth('SYSTEM READY') + 12;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">
  <title>shrpOS boot sequence</title>
  <desc>shrpOS BIOS v1.0 boots: power on, POST, kernel, user profile, GitHub connection and project registry all report OK, then SYSTEM READY and WELCOME, MARCELO.</desc>
${defs(W, H)}
  <style>
    @keyframes type {
      from { clip-path: inset(-12% 100% -12% 0); }
      to   { clip-path: inset(-12% 0 -12% 0); }
    }
    @keyframes blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
    .type { transform-box: fill-box; animation-name: type; animation-duration: .4s; animation-timing-function: steps(40, end); animation-fill-mode: both; }
    ${rules}
    .cursor { animation: blink 1.06s step-end ${cursorDelay}s infinite; }
${reducedMotion()}
  </style>
${backdrop(W, H, titleBar(W, 'shrpOS BIOS v1.0', 'POST'))}
  <text x="${x}" y="74" class="type bios" font-family=${f} font-size="13" fill="${
    T.dim
  }" letter-spacing="1">shrpOS BIOS v1.0  ::  cold boot</text>
${rows}
  <text x="${x}" y="${readyY}" class="type ready" font-family=${f} font-size="${BODY_FS}" font-weight="bold" fill="${
    T.green
  }" filter="url(#glow)">SYSTEM READY</text>
  <rect class="cursor" x="${cursorX}" y="${
    readyY - 14
  }" width="9" height="17" fill="${T.green}"/>
  <text x="${x}" y="${welcomeY}" class="type welcome" font-family=${f} font-size="22" font-weight="bold" fill="${
    T.bright
  }" letter-spacing="2" filter="url(#glow)">WELCOME, MARCELO.</text>
</svg>`;

  return svg;
}

// -------------------------------------------------------------- header asset

function headerSvg() {
  const W = 880;
  const H = 214;
  const f = JSON.stringify(FONT);
  const left = 28;
  const right = W - 28;

  const row = (y, l, r, lc = T.text, rc = T.text) =>
    `  <text x="${left}" y="${y}" font-family=${f} font-size="${BODY_FS}" fill="${lc}">${esc(
      l
    )}</text>\n` +
    `  <text x="${right}" y="${y}" text-anchor="end" font-family=${f} font-size="${BODY_FS}" fill="${rc}">${esc(
      r
    )}</text>`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">
  <title>shrpOS :: Personal Development Terminal</title>
  <desc>Terminal header: user Marcelo, node github.com/MikeMequis1, shell /bin/shrp, build stable, status on-line.</desc>
${defs(W, H)}
  <style>
    @keyframes pulse { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
    @keyframes blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
    .pulse { animation: pulse 2.2s ease-in-out infinite; }
    .cursor { animation: blink 1.06s step-end infinite; }
${reducedMotion()}
  </style>
${backdrop(W, H, titleBar(W, 'shrpOS :: PERSONAL DEVELOPMENT TERMINAL', 'v1.1'))}
${row(82, 'USER: MARCELO', 'STATUS: ONLINE', T.bright, T.green)}
  <circle class="pulse" cx="${
    right - textWidth('STATUS: ONLINE') - 12
  }" cy="77" r="5" fill="${T.green}"/>
${row(116, 'NODE: github.com/MikeMequis1', 'SHELL: /bin/shrp')}
${row(150, 'ROLE: SOFTWARE DEVELOPER', 'BUILD: STABLE')}
  <text x="${left}" y="188" font-family=${f} font-size="${BODY_FS}" fill="${
    T.dim
  }">&gt; awaiting input</text>
  <rect class="cursor" x="${left + textWidth('> awaiting input') + 10}" y="174" width="9" height="17" fill="${
    T.green
  }"/>
</svg>`;

  return svg;
}

// -------------------------------------------------------------- footer asset

function footerSvg() {
  const W = 880;
  const H = 72;
  const f = JSON.stringify(FONT);
  const left = 28;
  const right = W - 28;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">
  <title>shrpOS status bar</title>
  <desc>shrpOS system status: session active, memory OK, network OK, end of file.</desc>
${defs(W, H)}
  <style>
    @keyframes blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
    .cursor { animation: blink 1.06s step-end infinite; }
${reducedMotion()}
  </style>
${backdrop(W, H, '')}
  <text x="${left}" y="44" font-family=${f} font-size="13" fill="${
    T.green
  }" letter-spacing="1">shrpOS v1.1</text>
  <text x="${W / 2}" y="44" text-anchor="middle" font-family=${f} font-size="13" fill="${
    T.dim
  }" letter-spacing="1">SESSION ACTIVE  ::  MEM OK  ::  NET OK</text>
  <text x="${right - 14}" y="44" text-anchor="end" font-family=${f} font-size="13" fill="${
    T.text
  }" letter-spacing="1">EOF</text>
  <rect class="cursor" x="${
    right - 8
  }" y="32" width="8" height="15" fill="${T.green}"/>
</svg>`;

  return svg;
}

const written = [
  writeAsset('shrpOS-boot.svg', bootSvg()),
  writeAsset('shrpOS-header.svg', headerSvg()),
  writeAsset('shrpOS-footer.svg', footerSvg()),
];

for (const file of written) console.log(`generated ${file}`);
