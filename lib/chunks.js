'use strict';

const DENSITY = {
  low:    { bytes: 200,  ec: 'M' },
  medium: { bytes: 500,  ec: 'M' },
  high:   { bytes: 900,  ec: 'L' },
  ultra:  { bytes: 2000, ec: 'L' },
  max:    { bytes: 2900, ec: 'L' },
};

function buildChunks(rawBytes, densityKey) {
  const chunkBytes = DENSITY[densityKey].bytes;
  const chunks = [];
  for (let i = 0; i < rawBytes.length; i += chunkBytes) {
    chunks.push(rawBytes.slice(i, i + chunkBytes));
  }
  if (chunks.length === 0) chunks.push(new Uint8Array(0));
  return chunks;
}

function buildPacket(fileName, chunks, idx) {
  const nameBytes = idx === 0 ? new TextEncoder().encode(fileName) : new Uint8Array(0);
  const fileBytes = chunks[idx];
  const packet = new Uint8Array(6 + nameBytes.length + fileBytes.length);
  const view = new DataView(packet.buffer);
  view.setUint8(0, 1);
  view.setUint16(1, idx, false);
  view.setUint16(3, chunks.length, false);
  view.setUint8(5, nameBytes.length);
  packet.set(nameBytes, 6);
  packet.set(fileBytes, 6 + nameBytes.length);
  return packet;
}

module.exports = { DENSITY, buildChunks, buildPacket };
