'use strict';
const esbuild = require('esbuild');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const qrterm  = require('qrcode-terminal');

const PORT      = process.env.PORT || 8443;
const ROOT      = path.resolve(__dirname, '..');
const SRC       = path.join(ROOT, 'src');
const DIST      = path.join(ROOT, 'dist');
const CERT_DIR  = path.join(ROOT, '.certs');
const CERT_FILE = path.join(CERT_DIR, 'cert.pem');
const KEY_FILE  = path.join(CERT_DIR, 'key.pem');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript',
  '.css':  'text/css',
  '.ico':  'image/x-icon',
};

// ── live reload via SSE ────────────────────────────────────────
let sseClients = [];

function notifyReload() {
  const alive = [];
  for (const res of sseClients) {
    try { res.write('data: reload\n\n'); alive.push(res); } catch {}
  }
  sseClients = alive;
}

const liveReloadPlugin = {
  name: 'live-reload',
  setup(build) {
    build.onEnd(result => { if (result.errors.length === 0) notifyReload(); });
  },
};

// ── cert ───────────────────────────────────────────────────────
async function getCert() {
  if (fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE)) {
    return { cert: fs.readFileSync(CERT_FILE), key: fs.readFileSync(KEY_FILE) };
  }
  const selfsigned = require('selfsigned');
  const pems = await selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
    days: 397, algorithm: 'sha256', keySize: 2048,
  });
  fs.mkdirSync(CERT_DIR, { recursive: true });
  fs.writeFileSync(CERT_FILE, pems.cert,    { mode: 0o600 });
  fs.writeFileSync(KEY_FILE,  pems.private, { mode: 0o600 });
  console.log('Generated self-signed certificate in .certs/');
  return { cert: pems.cert, key: pems.private };
}

// ── HTML copy + watch ──────────────────────────────────────────
function copyHtml() {
  fs.copyFileSync(path.join(SRC, 'index.html'), path.join(DIST, 'index.html'));
}

async function start() {
  fs.mkdirSync(DIST, { recursive: true });
  copyHtml();
  fs.watch(path.join(SRC, 'index.html'), () => { copyHtml(); notifyReload(); });

  // esbuild watch — rebuilds JS + CSS on change, triggers live reload when done
  const ctx = await esbuild.context({
    entryPoints: [
      { in: path.join(SRC, 'main.js'),   out: 'bundle' },
      { in: path.join(SRC, 'style.css'), out: 'style'  },
    ],
    bundle:    true,
    sourcemap: true,
    outdir:    DIST,
    platform:  'browser',
    plugins:   [liveReloadPlugin],
    logLevel:  'info',
  });
  await ctx.watch();

  const { cert, key } = await getCert();

  const server = https.createServer({ cert, key }, (req, res) => {
    // SSE endpoint for live reload
    if (req.url === '/~reload') {
      res.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
      });
      res.write(':\n\n'); // initial ping keeps connection open
      sseClients.push(res);
      req.on('close', () => { sseClients = sseClients.filter(r => r !== res); });
      return;
    }

    const url    = req.url === '/' ? '/index.html' : req.url;
    const rel    = path.normalize(url).replace(/^(\.\.[/\\])+/, '');
    const target = path.join(DIST, rel);

    if (!target.startsWith(DIST + path.sep) && target !== DIST) {
      res.writeHead(403); res.end('Forbidden'); return;
    }

    const ext = path.extname(target);
    fs.readFile(target, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }

      let body = data;
      if (ext === '.html') {
        // inject live reload client — only present in dev, never written to disk
        body = Buffer.from(data.toString().replace(
          '</body>',
          '<script>new EventSource("/~reload").onmessage=()=>location.reload()</script></body>'
        ));
      }

      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(body);
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    const lines = ['', 'xcape dev server:', ''];
    lines.push('  https://localhost:' + PORT);
    const lanURLs = [];
    for (const iface of Object.values(os.networkInterfaces()).flat()) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const url = `https://${iface.address}:${PORT}`;
        lines.push(`  ${url}  ← open this on your phone`);
        lanURLs.push(url);
      }
    }
    lines.push('');
    lines.push('  Browser will warn about the self-signed cert — click Advanced → Proceed.');
    lines.push('');
    console.log(lines.join('\n'));
    for (const url of lanURLs) {
      console.log(`  Scan to open on your phone (${url}):\n`);
      qrterm.generate(url, { small: true }, qr => console.log(qr));
    }
  });
}

start().catch(err => { console.error(err); process.exit(1); });
