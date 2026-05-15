# xcape

File transfer via QR codes — no network, no cloud, no cables.

Open xcape on two devices on the same local network (or just point one screen at another). The sender cycles through QR codes; the receiver scans them with its camera. When the last chunk lands, the file downloads automatically.

## How it works

1. The sender splits the file into 200-byte base64 chunks and encodes each one as a QR code.
2. QR codes cycle automatically at a configurable speed (0.3 s – 3 s per frame).
3. The receiver scans each QR code with its camera and tracks which chunks it has.
4. Once all chunks are collected the file is reassembled in the browser and offered for download.

No data leaves the local network. No server sees the file contents — the server only serves the static page.

## Requirements

- Node.js 18+

## Setup

For local development/testing.

```sh
npm install
npm start
```

The server starts on `https://0.0.0.0:8443`. On first run it generates a self-signed TLS certificate in `.certs/` (camera access requires HTTPS).

The terminal prints the LAN address and a QR code you can scan to open xcape directly on your phone:

```
xcape running at:

  https://localhost:8443
  https://192.168.1.42:8443  ← open this on your phone

  Browser will warn about the self-signed cert — click Advanced → Proceed.

  Scan to open on your phone (https://192.168.1.42:8443):

  [QR code]
```

## Usage

For local development/testing.

**Sender** (laptop / tablet)
1. Open `https://<your-ip>:8443` and accept the cert warning.
2. Switch to the **Send** tab.
3. Drop a file onto the drop zone (or click to browse).
4. xcape starts cycling QR codes. Adjust the speed slider if needed.

**Receiver** (phone / second device)
1. Open the same URL and switch to the **Receive** tab.
2. Tap **Start Camera** and point it at the sender's screen.
3. Green dots fill in as chunks arrive. When all dots are green, tap **Download file**.

## Limitations

- Practical for small-to-medium files (a few hundred KB). Larger files mean more QR codes and longer transfer times.
- Chunk size (200 bytes) and QR error-correction level (`M`) are tuned for reliability over speed. Reducing either makes QR codes denser and harder to scan.
- Both devices must trust the self-signed cert (accept the browser warning once).

## Configuration

| Environment variable | Default | Description |
|---|---|---|
| `PORT` | `8443` | HTTPS port |

To use your own certificate, place `cert.pem` and `key.pem` in `.certs/` before starting the server.

## Project structure

```
xcape/
├── server.js      # HTTPS static server + cert generation + LAN QR helper
├── index.html     # Single-page app (send + receive UI, all client-side)
├── .certs/        # Auto-generated self-signed certificate (git-ignored)
└── package.json
```
