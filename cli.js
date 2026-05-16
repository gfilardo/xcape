#!/usr/bin/env node
'use strict';

const fs       = require('fs');
const path     = require('path');
const QRCode   = require('qrcode');
const minimist = require('minimist');
const { DENSITY, buildChunks, buildPacket } = require('./lib/chunks.js');

const DENSITY_KEYS = Object.keys(DENSITY);

const argv = minimist(process.argv.slice(2), {
  default: { speed: 1000, density: 'low', scroll: false },
  alias:   { s: 'speed', d: 'density', h: 'help' },
  boolean: ['scroll', 'help'],
});

if (argv.help || argv._.length === 0) {
  console.log(`
Usage: xcape <file> [options]

Options:
  -d, --density <level>   Chunk size: ${DENSITY_KEYS.join('|')}
                          (default: low)
  -s, --speed <ms>        Cycle interval in milliseconds (default: 1000)
      --scroll            Print QR codes sequentially instead of replacing
  -h, --help              Show this help

Controls (while running):
  +/=   Speed up (−100 ms)      −   Slow down (+100 ms)
  l/→   Next chunk            h/←   Previous chunk
  p     Pause / resume          q   Quit
`);
  process.exit(0);
}

const filePath = argv._[0];
if (!fs.existsSync(filePath)) {
  console.error(`xcape: file not found: ${filePath}`);
  process.exit(1);
}

const densityKey = argv.density;
if (!DENSITY[densityKey]) {
  console.error(`xcape: unknown density "${densityKey}". Choose: ${DENSITY_KEYS.join('|')}`);
  process.exit(1);
}

const rawBytes   = new Uint8Array(fs.readFileSync(filePath));
const fileName   = path.basename(filePath);
const chunks     = buildChunks(rawBytes, densityKey);
const ec         = DENSITY[densityKey].ec;
const scroll     = argv.scroll;

let idx        = 0;
let intervalMs = Math.max(100, parseInt(argv.speed) || 1000);
let paused     = false;
let timer      = null;
let lastLines  = 0;

async function render() {
  const packet = buildPacket(fileName, chunks, idx);
  const qrStr  = await QRCode.toString([{ data: Buffer.from(packet), mode: 'byte' }], {
    type: 'utf8',
    errorCorrectionLevel: ec,
    margin: 2,
  });
  const status = `  Chunk ${idx + 1}/${chunks.length}  ·  ${densityKey}  ·  ${intervalMs}ms${paused ? '  ·  PAUSED' : ''}\n`;
  const output = qrStr + status;

  if (!scroll && lastLines > 0) {
    process.stdout.write(`\x1b[${lastLines}A\x1b[J`);
  }
  process.stdout.write(output);
  lastLines = (output.match(/\n/g) || []).length;
}

function restartTimer() {
  if (timer) clearInterval(timer);
  timer = setInterval(async () => {
    if (!paused) {
      idx = (idx + 1) % chunks.length;
      await render();
    }
  }, intervalMs);
}

function adjustSpeed(ms) {
  intervalMs = Math.max(100, Math.min(5000, ms));
  restartTimer();
}

async function main() {
  await render();
  restartTimer();

  if (!process.stdin.isTTY) return;

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', async key => {
    if (key === 'q' || key === '\x03') {
      if (timer) clearInterval(timer);
      process.stdout.write('\n');
      process.exit(0);
    } else if (key === 'p') {
      paused = !paused;
      await render();
    } else if (key === '+' || key === '=') {
      adjustSpeed(intervalMs - 100);
      await render();
    } else if (key === '-' || key === '_') {
      adjustSpeed(intervalMs + 100);
      await render();
    } else if (key === 'l' || key === '\x1b[C') {
      idx = (idx + 1) % chunks.length;
      await render();
      restartTimer();
    } else if (key === 'h' || key === '\x1b[D') {
      idx = (idx - 1 + chunks.length) % chunks.length;
      await render();
      restartTimer();
    }
  });
}

main().catch(err => { console.error(err); process.exit(1); });
