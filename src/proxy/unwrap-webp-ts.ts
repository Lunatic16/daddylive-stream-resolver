import { gunzipSync, inflateSync } from "node:zlib";

const TPIX = Buffer.from([84, 73, 75, 84, 73, 75, 80, 88]);
const TRAW = Buffer.from([84, 73, 75, 84, 73, 75, 82, 65, 87]);
const TSGZ = Buffer.from([84, 73, 75, 84, 73, 75, 84, 83, 71, 90]);

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function webpExifTs(buf: Buffer): Buffer | null {
  if (buf.byteLength < 20) return null;
  if (buf.subarray(0, 4).toString("ascii") !== "RIFF") return null;
  if (buf.subarray(8, 12).toString("ascii") !== "WEBP") return null;
  let pos = 12;
  while (pos + 8 <= buf.byteLength) {
    const fourcc = buf.subarray(pos, pos + 4).toString("ascii");
    const size = buf.readUInt32LE(pos + 4);
    const dataStart = pos + 8;
    const dataEnd = Math.min(dataStart + size, buf.byteLength);
    if (fourcc === "EXIF") {
      const payload = buf.subarray(dataStart, dataEnd);
      return payload.byteLength > 188 && payload[0] === 0x47 ? payload : null;
    }
    pos = dataEnd + (size & 1);
  }
  return null;
}

function pngIendTs(buf: Buffer): Buffer | null {
  if (buf.byteLength < 16 || buf[0] !== 0x89 || buf[1] !== 0x50) return null;
  let off = 8;
  while (off + 8 <= buf.byteLength) {
    const len = buf.readUInt32BE(off);
    if (len > buf.byteLength - off - 12) return null;
    const type = buf.subarray(off + 4, off + 8).toString("ascii");
    off += 8 + len + 4;
    if (type === "IEND") {
      if (off < buf.byteLength && buf[off] === 0x47 && off + 188 < buf.byteLength && buf[off + 188] === 0x47) {
        return buf.subarray(off);
      }
      return null;
    }
  }
  return null;
}

function pngRgb(buf: Buffer): Buffer | null {
  if (buf.byteLength < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) return null;
  let off = 8;
  let w = 0;
  let h = 0;
  let depth = 0;
  let ctype = 0;
  let interlace = 0;
  const idats: Buffer[] = [];
  while (off + 8 <= buf.byteLength) {
    const len = buf.readUInt32BE(off);
    if (len > buf.byteLength - off - 12) return null;
    const type = buf.subarray(off + 4, off + 8).toString("ascii");
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      ctype = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idats.push(data);
    } else if (type === "IEND") {
      break;
    }
    off += 12 + len;
  }
  if (!w || !h || depth !== 8 || interlace || (ctype !== 2 && ctype !== 6)) return null;
  let zlen = 0;
  for (const p of idats) zlen += p.length;
  const zbuf = Buffer.allocUnsafe(zlen);
  let zoff = 0;
  for (const p of idats) {
    p.copy(zbuf, zoff);
    zoff += p.length;
  }
  let raw: Buffer;
  try {
    raw = inflateSync(zbuf);
  } catch {
    return null;
  }
  const bpp = ctype === 6 ? 4 : 3;
  const stride = w * bpp;
  const rgb = Buffer.allocUnsafe(w * h * 3);
  let src = 0;
  let dst = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    if (src + 1 + stride > raw.length) return null;
    const filter = raw[src++];
    const row = raw.subarray(src, src + stride);
    src += stride;
    const recon = Buffer.allocUnsafe(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? recon[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = row[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      else if (filter !== 0) return null;
      recon[i] = v & 255;
    }
    if (ctype === 2) {
      recon.copy(rgb, dst);
      dst += stride;
    } else {
      for (let i = 0; i < stride; i += 4) {
        rgb[dst++] = recon[i];
        rgb[dst++] = recon[i + 1];
        rgb[dst++] = recon[i + 2];
      }
    }
    prev = recon;
  }
  return rgb;
}

function unwrapPixels(buf: Buffer): Buffer | null {
  const rgb = pngRgb(buf);
  if (!rgb || rgb.length < 12) return null;
  if (!rgb.subarray(0, 8).equals(TPIX)) return null;
  const n = rgb.readUInt32BE(8);
  if (n <= 0 || 12 + n > rgb.length) return null;
  const gz = rgb.subarray(12, 12 + n);
  if (gz.length < 2 || gz[0] !== 0x1f || gz[1] !== 0x8b) return null;
  let ts: Buffer;
  try {
    ts = gunzipSync(gz);
  } catch {
    return null;
  }
  return ts.length && ts[0] === 0x47 ? ts : null;
}

function markerPayload(buf: Buffer, marker: Buffer): Buffer | null {
  for (let i = 0; i + marker.length < buf.length; i++) {
    if (!buf.subarray(i, i + marker.length).equals(marker)) continue;
    if (marker === TSGZ) {
      try {
        const ts = gunzipSync(buf.subarray(i + marker.length));
        return ts.length && ts[0] === 0x47 ? ts : null;
      } catch {
        return null;
      }
    }
    const ts = buf.subarray(i + marker.length);
    return ts.length && ts[0] === 0x47 ? ts : null;
  }
  return null;
}

function scanTs(buf: Buffer): Buffer | null {
  for (let i = 0; i + 188 < buf.length; i++) {
    if (buf[i] === 0x47 && buf[i + 188] === 0x47) return buf.subarray(i);
  }
  return null;
}

export function unwrapWebpMpegTs(buf: Buffer): Buffer | null {
  return (
    webpExifTs(buf) ??
    pngIendTs(buf) ??
    unwrapPixels(buf) ??
    markerPayload(buf, TRAW) ??
    markerPayload(buf, TSGZ) ??
    (buf[0] === 0x89 && buf[1] === 0x50 ? null : scanTs(buf))
  );
}
