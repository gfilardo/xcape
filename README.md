# xcape

File transfer via QR codes — no network, no cloud, no cables.

Open xcape on two devices. The sender cycles through QR codes; the receiver scans them with its camera. When the last chunk lands, the file downloads automatically.

## How it works

1. The sender splits the file into raw binary chunks and encodes each one as a QR code.
2. QR codes cycle automatically at a configurable speed (0.3 s – 3 s per frame).
3. The receiver scans each QR code with its camera and tracks which chunks it has.
4. Once all chunks are collected the file is reassembled in the browser and offered for download.

No data leaves the local network. No server sees the file contents — the server only serves the static page.

## Wire format

Each QR code carries a compact binary packet using QR byte mode directly — no base64, no JSON:

```
[1 byte]  version (currently 1)
[2 bytes] chunk index (uint16 big-endian)
[2 bytes] total chunks (uint16 big-endian)
[1 byte]  filename length in bytes (non-zero only on chunk 0)
[N bytes] filename, UTF-8 (chunk 0 only)
[rest]    raw file bytes
```

The fixed header is 6 bytes. The filename (up to 255 bytes, covering the max length on all major filesystems) is only transmitted once on chunk 0. All other chunks carry just the 6-byte header followed by file data.

Compared to a JSON+base64 approach, this cuts per-chunk overhead from ~39% down to ~1%.


## CLI

xcape is also available as a command-line tool. No install needed:

```sh
npx xcape <file>
```

Or install globally:

```sh
npm install -g xcape
xcape <file>
```

Options:

```
-d, --density <level>   low|medium|high|ultra|max  (default: low)
-s, --speed <ms>        Cycle interval in ms        (default: 1000)
    --scroll            Print QR codes sequentially instead of replacing
-h, --help              Show help
```

Controls while running: `+`/`-` adjust speed, `l`/`→` and `h`/`←` navigate chunks, `p` pause, `q` quit.

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

## DTMF pacing

xcape can pace the transfer using audio instead of a fixed timer, keeping sender and receiver in lockstep even at long distances or with difficult lighting.

**How it works:** when both devices have DTMF enabled, the receiver plays two simultaneous tones (1400 Hz + 2800 Hz, ~100 ms) after each successfully scanned chunk. The sender listens via microphone and only advances to the next QR code when it hears that pair — no tone, no advance.

If the sender misses a tone, the receiver re-emits it (at most once per 400 ms) as long as the sender stays on the same chunk, so a missed beep causes a brief pause rather than a stall.

**To enable:**
- **Sender**: toggle **DTMF** in the top bar. Auto-advance and the speed slider are disabled.
- **Receiver**: toggle **DTMF** in the receive panel. The microphone on the sender and the speaker on the receiver must be audible to each other.

The two-tone detection (both frequencies must be simultaneously above the noise floor by ≥ 18 dB, sustained for ≥ 3 consecutive frames) makes it resilient to typical room noise.

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
