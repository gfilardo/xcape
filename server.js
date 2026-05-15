const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const qrterm = require('qrcode-terminal');

const PORT      = process.env.PORT || 8443;
const CERT_DIR  = path.join(__dirname, '.certs');
const CERT_FILE = path.join(CERT_DIR, 'cert.pem');
const KEY_FILE  = path.join(CERT_DIR, 'key.pem');

async function getCert() {
  if (fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE)) {
    return { cert: fs.readFileSync(CERT_FILE), key: fs.readFileSync(KEY_FILE) };
  }
  const selfsigned = require('selfsigned');
  const pems = await selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
    days: 397,
    algorithm: 'sha256',
    keySize: 2048,
  });
  fs.mkdirSync(CERT_DIR, { recursive: true });
  fs.writeFileSync(CERT_FILE, pems.cert,    { mode: 0o600 });
  fs.writeFileSync(KEY_FILE,  pems.private, { mode: 0o600 });
  console.log('Generated self-signed certificate in .certs/');
  return { cert: pems.cert, key: pems.private };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript',
  '.css':  'text/css',
  '.ico':  'image/x-icon',
};

async function start() {
  const { cert, key } = await getCert();

  const server = https.createServer({ cert, key }, (req, res) => {
    const url    = req.url === '/' ? '/index.html' : req.url;
    const rel    = path.normalize(url).replace(/^(\.\.[/\\])+/, '');
    const target = path.join(__dirname, rel);

    if (!target.startsWith(__dirname + path.sep) && target !== __dirname) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const ext = path.extname(target);
    fs.readFile(target, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    const lines = ['', 'xcape running at:', ''];
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
