# xcape

File transfer via QR codes — no network, no cloud, no cables.

Open xcape on two devices. The sender cycles through QR codes; the receiver scans them with its camera. When the last chunk lands, the file downloads automatically.

## How it works

1. The sender splits the file into base64 chunks and encodes each one as a QR code.
2. QR codes cycle automatically at a configurable speed (0.3 s – 3 s per frame).
3. The receiver scans each QR code with its camera and tracks which chunks it has.
4. Once all chunks are collected the file is reassembled in the browser and offered for download.

No data leaves the local network. No server sees the file contents — the server only serves the static page.

## Requirements

- Node.js 18+

## Setup

```sh
npm install
npm run build   # bundle src/ → index.html
npm start
```

The server starts on `https://0.0.0.0:8443`. On first run it generates a self-signed TLS certificate in `.certs/` (camera access requires HTTPS).

The terminal prints the LAN address and a QR code you can scan to open xcape directly on your phone:

```
xcape running at:

  https://localhost:8443
  https://192.168.1.42:8443  ← open this on your phone

  Browser will warn about the self-signed cert — click Advanced → Proceed.

  Scan to open on your phone:

  [QR code]
```

For development with live rebuild:

```sh
npm run dev
```

## Usage

**Sender** (laptop / tablet)
1. Open `https://<your-ip>:8443` and accept the cert warning.
2. Switch to the **Send** tab.
3. Drop a file onto the drop zone (or click to browse).
4. xcape starts cycling QR codes. Adjust speed and density as needed.
5. Click the progress bar to jump to any chunk.

**Receiver** (phone / second device)
1. Open the same URL and switch to the **Receive** tab.
2. Tap **Start Camera** and point it at the sender's screen.
3. Green dots fill in as chunks arrive. When all dots are green, tap **Download file**.

## Density

The density selector controls chunk size and QR error-correction level:

| Setting | Chunk size | Error correction |
|---|---|---|
| Low | 200 B | M |
| Med | 500 B | M |
| High | 900 B | L |

Lower density = smaller, more reliable QR codes. Higher density = fewer codes, faster transfer, but harder to scan at a distance or in poor light.

## Limitations

- Practical for small-to-medium files (a few hundred KB). Larger files mean more QR codes and longer transfer times.
- Both devices must trust the self-signed cert (accept the browser warning once).

## Configuration

| Environment variable | Default | Description |
|---|---|---|
| `PORT` | `8443` | HTTPS port |

To use your own certificate, place `cert.pem` and `key.pem` in `.certs/` before starting the server.

## Project structure

```
xcape/
├── src/
│   ├── index.html   # App shell
│   ├── main.js      # Send + receive logic (bundled by esbuild)
│   └── style.css    # Styles
├── scripts/
│   ├── build.js     # Production bundle → index.html
│   └── dev.js       # Watch mode
├── server.js        # HTTPS static server + cert generation + LAN QR helper
├── index.html       # Built output (committed)
└── .certs/          # Auto-generated self-signed certificate (git-ignored)
```
