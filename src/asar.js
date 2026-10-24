// Minimal read-only .asar reader. Enough to (a) read package.json out of an
// installed app and (b) hash the archive for drift detection. No extraction.
//
// Layout (verified against a real VS Code asar): a Chromium Pickle is
// [header_size:uint32][payload_size:uint32][payload], and the payload holds one
// string element: [element_size:uint32][string_length:uint32][json][pad to 4].
// File data begins at 8 + payload_size, and each entry's offset is relative to
// that base.

import { openSync, readSync, closeSync, createReadStream, fstatSync } from 'node:fs';
import { createHash } from 'node:crypto';

const OUTER_PICKLE_BYTES = 8;
const MAX_HEADER_BYTES = 256 * 1024 * 1024;

export function readHeader(archive) {
  const fd = openSync(archive, 'r');
  try {
    const outer = Buffer.alloc(OUTER_PICKLE_BYTES);
    const archiveSize = fstatSync(fd).size;
    if (readSync(fd, outer, 0, OUTER_PICKLE_BYTES, 0) !== OUTER_PICKLE_BYTES) throw new Error('truncated asar header');
    const payloadSize = outer.readUInt32LE(4);
    if (payloadSize < 8 || payloadSize > MAX_HEADER_BYTES || payloadSize > archiveSize - 8) {
      throw new Error(`asar header size out of range: ${payloadSize}`);
    }
    const picklePayload = Buffer.alloc(payloadSize);
    if (readSync(fd, picklePayload, 0, payloadSize, OUTER_PICKLE_BYTES) !== payloadSize)
      throw new Error('truncated asar header');
    const strLen = picklePayload.readUInt32LE(4);
    if (8 + strLen > payloadSize) throw new Error('asar header string overruns pickle');
    return {
      header: JSON.parse(picklePayload.subarray(8, 8 + strLen).toString('utf8')),
      dataOffset: OUTER_PICKLE_BYTES + payloadSize
    };
  } finally {
    closeSync(fd);
  }
}

export function findEntry(header, path) {
  const parts = String(path).split('/').filter(Boolean);
  let node = header;
  for (const part of parts) {
    node = node?.files?.[part];
    if (!node) return null;
  }
  return node && node.offset !== undefined ? node : null;
}

export function readEntryBuffer(archive, path, maxBytes = 8 * 1024 * 1024) {
  const { header, dataOffset } = readHeader(archive);
  const entry = findEntry(header, path);
  if (!entry) return null;
  const size = Number(entry.size);
  if (!Number.isSafeInteger(size) || size < 0 || size > maxBytes) {
    throw new Error(`asar entry size out of range: ${path} (${entry.size})`);
  }
  if (entry.unpacked) throw new Error(`asar entry is unpacked: ${path}`);
  const relativeOffset = Number(entry.offset),
    offset = dataOffset + relativeOffset;
  if (!Number.isSafeInteger(relativeOffset) || relativeOffset < 0 || !Number.isSafeInteger(offset))
    throw new Error('asar entry offset out of range');
  const fd = openSync(archive, 'r');
  try {
    if (offset + size > fstatSync(fd).size) throw new Error('asar entry exceeds archive bounds');
    const buf = Buffer.alloc(size);
    if (readSync(fd, buf, 0, size, offset) !== size) throw new Error('truncated asar entry');
    return buf;
  } finally {
    closeSync(fd);
  }
}

export function readEntryJson(archive, path) {
  const buf = readEntryBuffer(archive, path);
  return buf === null ? null : JSON.parse(buf.toString('utf8'));
}

export function sha256File(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
