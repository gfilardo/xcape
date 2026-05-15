'use strict';
const esbuild = require('esbuild');
const fs      = require('fs');
const path    = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC  = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

async function build() {
  fs.mkdirSync(DIST, { recursive: true });

  await esbuild.build({
    entryPoints: [
      { in: path.join(SRC, 'main.js'),   out: 'bundle' },
      { in: path.join(SRC, 'style.css'), out: 'style'  },
    ],
    bundle:   true,
    minify:   true,
    outdir:   DIST,
    platform: 'browser',
    logLevel: 'info',
  });

  fs.copyFileSync(path.join(SRC, 'index.html'), path.join(DIST, 'index.html'));
  console.log('Build complete → dist/');
}

build().catch(err => { console.error(err); process.exit(1); });
