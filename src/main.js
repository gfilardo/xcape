import QRCode from 'qrcode';
import jsQR from 'jsqr';

// ── constants ──────────────────────────────────────────────────
const DENSITY = {
  low:    { bytes: 200, ec: 'M' },
  medium: { bytes: 500, ec: 'M' },
  high:   { bytes: 900, ec: 'L' },
};
let densityKey = 'low';

// ── wake lock ──────────────────────────────────────────────────
let wakeLock = null;

async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch { /* denied or unsupported */ }
}

function releaseWakeLock() {
  if (wakeLock) { wakeLock.release(); wakeLock = null; }
}

// re-acquire when tab becomes visible again (OS releases lock on background)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (sendTimer !== null || recvStream !== null)) {
    acquireWakeLock();
  }
});

// ── mode toggle ────────────────────────────────────────────────
function setMode(mode) {
  document.getElementById('panel-send').classList.toggle('active', mode === 'send');
  document.getElementById('panel-recv').classList.toggle('active', mode === 'recv');
  document.getElementById('btn-send').classList.toggle('active', mode === 'send');
  document.getElementById('btn-recv').classList.toggle('active', mode === 'recv');
  if (mode === 'send') stopCamera();
}

// ── SEND ───────────────────────────────────────────────────────
let chunks = [];
let rawBytes = null;
let chunkIndex = 0;
let loopCount = 1;
let sendTimer = null;
let intervalMs = 1000;
let currentFileName = '';
let currentSizeStr  = '';

const dropZone   = document.getElementById('drop-zone');
const fileInput  = document.getElementById('file-input');
const sendUI     = document.getElementById('send-ui');
const qrCanvas   = document.getElementById('qr-canvas');
const fileInfoEl = document.getElementById('file-info');

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) loadFile(file);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) loadFile(fileInput.files[0]);
});

document.getElementById('send-progress').parentElement.addEventListener('click', e => {
  if (!chunks.length) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const idx  = Math.min(chunks.length - 1, Math.floor((e.clientX - rect.left) / rect.width * chunks.length));
  chunkIndex = idx;
  showChunk(idx);
  restartTimer();
});

const speedRange = document.getElementById('speed-range');
speedRange.addEventListener('input', () => {
  intervalMs = parseInt(speedRange.value);
  document.getElementById('speed-val').textContent = (intervalMs / 1000).toFixed(1) + 's';
  if (sendTimer) restartTimer();
});

function buildChunks() {
  const chunkBytes = DENSITY[densityKey].bytes;
  chunks = [];
  for (let i = 0; i < rawBytes.length; i += chunkBytes) {
    chunks.push(rawBytes.slice(i, i + chunkBytes));
  }
  if (chunks.length === 0) chunks.push(new Uint8Array(0));
}

function setDensity(key) {
  densityKey = key;
  ['low', 'medium', 'high'].forEach(k =>
    document.getElementById('den-' + k).classList.toggle('active', k === key));
  if (!rawBytes) return;
  buildChunks();
  chunkIndex = 0;
  fileInfoEl.innerHTML = `<strong>${escHtml(currentFileName)}</strong> &nbsp;·&nbsp; ${currentSizeStr} &nbsp;·&nbsp; ${chunks.length} chunks`;
  document.getElementById('chunk-total').textContent = chunks.length;
  showChunk(0);
  restartTimer();
}

async function loadFile(file) {
  currentFileName = file.name;
  const buffer = await file.arrayBuffer();
  rawBytes = new Uint8Array(buffer);

  currentSizeStr = file.size < 1024
    ? file.size + ' B'
    : file.size < 1048576
      ? (file.size / 1024).toFixed(1) + ' KB'
      : (file.size / 1048576).toFixed(2) + ' MB';

  buildChunks();

  fileInfoEl.innerHTML = `<strong>${escHtml(file.name)}</strong> &nbsp;·&nbsp; ${currentSizeStr} &nbsp;·&nbsp; ${chunks.length} chunks`;
  document.getElementById('chunk-total').textContent = chunks.length;

  chunkIndex = 0;
  loopCount  = 1;
  dropZone.style.display = 'none';
  sendUI.style.display   = 'block';

  showChunk(0);
  restartTimer();
  acquireWakeLock();
}

function showChunk(idx) {
  const nameBytes = idx === 0 ? new TextEncoder().encode(currentFileName) : new Uint8Array(0);
  const fileBytes = chunks[idx];

  const packet = new Uint8Array(6 + nameBytes.length + fileBytes.length);
  const view = new DataView(packet.buffer);
  view.setUint8(0, 1);                     // version
  view.setUint16(1, idx, false);           // chunk index
  view.setUint16(3, chunks.length, false); // total chunks
  view.setUint8(5, nameBytes.length);      // filename length
  packet.set(nameBytes, 6);
  packet.set(fileBytes, 6 + nameBytes.length);

  const latin1 = Array.from(packet, b => String.fromCharCode(b)).join('');
  QRCode.toCanvas(qrCanvas, [{ data: latin1, mode: 'byte' }], { width: 360, margin: 2, errorCorrectionLevel: DENSITY[densityKey].ec }, err => {
    if (err) console.error('QR error', err);
  });
  document.getElementById('chunk-current').textContent = idx + 1;
  const pct = ((idx + 1) / chunks.length * 100).toFixed(0);
  document.getElementById('send-progress').style.width = pct + '%';
}

function restartTimer() {
  if (sendTimer) clearInterval(sendTimer);
  sendTimer = setInterval(advanceChunk, intervalMs);
}

function advanceChunk() {
  chunkIndex = (chunkIndex + 1) % chunks.length;
  if (chunkIndex === 0) {
    loopCount++;
    document.getElementById('loop-count').textContent = loopCount;
  }
  showChunk(chunkIndex);
}

function resetSend() {
  clearInterval(sendTimer);
  sendTimer = null;
  releaseWakeLock();
  chunks = [];
  rawBytes = null;
  chunkIndex = 0;
  loopCount = 1;
  fileInput.value = '';
  dropZone.style.display = '';
  sendUI.style.display = 'none';
  document.getElementById('loop-count').textContent = '1';
}

// ── RECEIVE ────────────────────────────────────────────────────
let recvStream = null;
let scanRAF = null;
let recvChunks = {};
let recvTotal = null;
let recvName  = '';
let recvBlob  = null;

const video      = document.getElementById('recv-video');
const recvCanvas = document.getElementById('recv-canvas');
const recvCtx    = recvCanvas.getContext('2d', { willReadFrequently: true });

async function startCamera() {
  const errEl = document.getElementById('recv-error');
  errEl.textContent = '';

  if (!window.isSecureContext || !navigator.mediaDevices) {
    errEl.innerHTML = 'Camera requires HTTPS. Serve with:<br><code>npx http-server . -S -p 8443</code><br>then open <b>https://&lt;your-ip&gt;:8443</b>';
    return;
  }

  try {
    recvStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }
    });
    video.srcObject = recvStream;
    await video.play();
    document.getElementById('start-camera-btn').style.display = 'none';
    document.getElementById('video-wrap').style.display = '';
    document.getElementById('recv-status').style.display = '';
    acquireWakeLock();
    scanLoop();
  } catch (e) {
    errEl.textContent = 'Camera error: ' + e.message;
  }
}

let lastScanTime = 0;

function scanLoop() {
  scanRAF = requestAnimationFrame((now) => {
    // throttle to ~10fps — jsQR is slow on large images, no need for 60fps
    if (now - lastScanTime >= 100 && video.readyState >= 2) {
      lastScanTime = now;
      if (recvCanvas.width !== video.videoWidth)   recvCanvas.width  = video.videoWidth;
      if (recvCanvas.height !== video.videoHeight)  recvCanvas.height = video.videoHeight;
      recvCtx.drawImage(video, 0, 0);
      const img  = recvCtx.getImageData(0, 0, recvCanvas.width, recvCanvas.height);
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
      if (code) handleCode(code.binaryData);
    }
    if (recvTotal === null || Object.keys(recvChunks).length < recvTotal) {
      scanLoop();
    }
  });
}

let flashTimer = null;

function flashScanBox() {
  const box = document.querySelector('.scan-box');
  if (!box) return;
  box.classList.add('flash');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => box.classList.remove('flash'), 200);
}

function handleCode(bytes) {
  if (!bytes || bytes.length < 6) return;
  const buf  = new Uint8Array(bytes);
  const view = new DataView(buf.buffer);
  if (view.getUint8(0) !== 1) return;

  const idx     = view.getUint16(1, false);
  const total   = view.getUint16(3, false);
  const nameLen = view.getUint8(5);

  flashScanBox();

  if (recvTotal === null) {
    recvTotal = total;
    buildGrid(total);
    document.getElementById('recv-status').style.display = '';
  }

  if (total !== recvTotal) return;
  if (nameLen > 0) recvName = new TextDecoder().decode(buf.slice(6, 6 + nameLen));
  if (recvChunks[idx] !== undefined) return;

  recvChunks[idx] = buf.slice(6 + nameLen);
  const got = Object.keys(recvChunks).length;
  const prev = document.querySelector('.chunk-dot.last');
  if (prev) prev.classList.remove('last');
  const dot = document.querySelector(`.chunk-dot[data-i="${idx}"]`);
  if (dot) { dot.classList.add('got'); dot.classList.add('last'); }

  document.getElementById('recv-status-text').innerHTML =
    `<strong>${got}</strong> of <strong>${recvTotal}</strong> chunks received`;

  if (got === recvTotal) finishRecv();
}

function buildGrid(total) {
  const grid = document.getElementById('chunks-grid');
  grid.innerHTML = '';

  const size = total > 500 ? 3 : total > 200 ? 4 : total > 100 ? 6 : total > 50 ? 8 : 10;
  grid.style.setProperty('--dot-size', size + 'px');

  for (let i = 0; i < total; i++) {
    const d = document.createElement('div');
    d.className = 'chunk-dot';
    d.dataset.i = i;
    grid.appendChild(d);
  }
}

function finishRecv() {
  stopCamera();

  let totalSize = 0;
  for (let i = 0; i < recvTotal; i++) totalSize += recvChunks[i].length;
  const bytes = new Uint8Array(totalSize);
  let offset = 0;
  for (let i = 0; i < recvTotal; i++) {
    bytes.set(recvChunks[i], offset);
    offset += recvChunks[i].length;
  }

  recvBlob = new Blob([bytes]);
  const url = URL.createObjectURL(recvBlob);

  document.getElementById('video-wrap').style.display = 'none';
  document.getElementById('recv-status').style.display = 'none';
  document.getElementById('recv-done').style.display = 'block';
  document.getElementById('recv-done-text').textContent =
    `"${recvName}" received (${(bytes.length / 1024).toFixed(1)} KB)`;

  // set href/download directly on the <a> — works on desktop and mobile
  const btn = document.getElementById('download-btn');
  btn.href     = url;
  btn.download = recvName;
}

function stopCamera() {
  if (scanRAF) cancelAnimationFrame(scanRAF);
  if (recvStream) { recvStream.getTracks().forEach(t => t.stop()); recvStream = null; }
  releaseWakeLock();
}

function resetRecv() {
  recvChunks = {};
  recvTotal  = null;
  recvName   = '';
  recvBlob   = null;
  document.getElementById('recv-done').style.display = 'none';
  document.getElementById('recv-status').style.display = 'none';
  document.getElementById('video-wrap').style.display = 'none';
  document.getElementById('start-camera-btn').style.display = '';
  document.getElementById('recv-error').textContent = '';
}

// ── utils ──────────────────────────────────────────────────────
function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── event listeners ────────────────────────────────────────────
document.getElementById('btn-send').addEventListener('click', () => setMode('send'));
document.getElementById('btn-recv').addEventListener('click', () => setMode('recv'));
document.getElementById('den-low').addEventListener('click',    () => setDensity('low'));
document.getElementById('den-medium').addEventListener('click', () => setDensity('medium'));
document.getElementById('den-high').addEventListener('click',   () => setDensity('high'));
document.getElementById('reset-send-btn').addEventListener('click', resetSend);
document.getElementById('start-camera-btn').addEventListener('click', startCamera);
document.getElementById('reset-recv-btn').addEventListener('click', resetRecv);
