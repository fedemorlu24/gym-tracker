// Offline raster decoding shared by chat and backup restore. No URL fetches.
(function () {
  'use strict';
  const fail = () => { throw new Error('Invalid inline raster image'); };
  function dimensions(b, mime) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const str = (p, n) => String.fromCharCode(...b.subarray(p, p + n));
    if (mime === 'image/png') {
      if (b.length < 33 || str(0, 8) !== '\x89PNG\r\n\x1a\n' || v.getUint32(8) !== 13 || str(12, 4) !== 'IHDR') fail();
      return [v.getUint32(16), v.getUint32(20)];
    }
    if (mime === 'image/jpeg') {
      if (b.length < 12 || b[0] !== 255 || b[1] !== 216 || b[b.length - 2] !== 255 || b[b.length - 1] !== 217) fail();
      let p = 2, sizeFound = null, inScan = false;
      while (p < b.length) {
        if (inScan) { while (p < b.length && b[p] !== 255) p++; }
        if (p >= b.length || b[p++] !== 255) fail();
        while (p < b.length && b[p] === 255) p++;
        const marker = b[p++];
        if (inScan && (marker === 0 || marker >= 208 && marker <= 215)) continue;
        if (marker === 217) { if (p !== b.length || !sizeFound) fail(); return sizeFound; }
        if (p + 2 > b.length) fail();
        const size = v.getUint16(p);
        if (size < 2 || p + size > b.length) fail();
        if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
          // Browser raster JPEG uses baseline/extended/progressive DCT. Reject a
          // second frame header so an early small header cannot conceal a huge one.
          if (![192, 193, 194].includes(marker) || sizeFound || size < 8) fail();
          sizeFound = [v.getUint16(p + 5), v.getUint16(p + 3)];
        }
        if (marker === 218) { if (!sizeFound) fail(); inScan = true; }
        p += size;
      }
      fail();
    }
    if (mime === 'image/webp') {
      if (b.length < 25 || str(0, 4) !== 'RIFF' || str(8, 4) !== 'WEBP' || v.getUint32(4, true) + 8 !== b.length) fail();
      let p = 12, canvas = null, frame = null;
      const u24 = i => b[i] | b[i + 1] << 8 | b[i + 2] << 16;
      while (p + 8 <= b.length) {
        const kind = str(p, 4), size = v.getUint32(p + 4, true), start = p + 8;
        if (start + size > b.length) fail();
        if (kind === 'ANIM' || kind === 'ANMF') fail();
        if (kind === 'VP8X') {
          if (canvas || size !== 10 || b[start] & 2) fail();
          canvas = [1 + u24(start + 4), 1 + u24(start + 7)];
        }
        if (kind === 'VP8 ' || kind === 'VP8L') {
          if (frame) fail();
          if (kind === 'VP8 ') {
            if (size < 10 || str(start + 3, 3) !== '\x9d\x01\x2a') fail();
            frame = [v.getUint16(start + 6, true) & 16383, v.getUint16(start + 8, true) & 16383];
          } else {
            if (size < 5 || b[start] !== 47) fail();
            frame = [1 + ((b[start + 2] & 63) << 8 | b[start + 1]), 1 + ((b[start + 4] & 15) << 10 | b[start + 3] << 2 | b[start + 2] >> 6)];
          }
        }
        p = start + size + (size % 2);
      }
      if (p !== b.length || !frame || canvas && (canvas[0] !== frame[0] || canvas[1] !== frame[1])) fail();
      return frame;
    }
    fail();
  }
  async function decodeInlineImage(data, options = {}) {
    const {maxBytes = 12 * 1024 * 1024, maxWidth = 8192, maxHeight = 8192, maxPixels = 32 * 1024 * 1024,
      types = ['image/jpeg', 'image/png', 'image/webp']} = options;
    if (typeof data !== 'string' || data.length > Math.ceil(maxBytes / 3) * 4 + 32) fail();
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
    if (!m || !types.includes(m[1]) || m[2].length % 4) fail();
    const raw = atob(m[2]);
    if (!raw.length || raw.length > maxBytes || btoa(raw) !== m[2]) fail();
    const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
    const [width, height] = dimensions(bytes, m[1]);
    const validSize = (w, h) => Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0 && w <= maxWidth && h <= maxHeight && w * h <= maxPixels;
    if (!validSize(width, height)) fail();
    const blob = new Blob([bytes], {type: m[1]}), url = URL.createObjectURL(blob);
    try {
      await new Promise((resolve, reject) => {
        const img = new Image();
        const finish = error => { clearTimeout(timer); img.onload = img.onerror = null; img.src = ''; error ? reject(error) : resolve(); };
        const timer = setTimeout(() => finish(new Error('Image decode timed out')), 10000);
        img.onload = () => finish(validSize(img.naturalWidth, img.naturalHeight) ? null : new Error('Image dimensions exceed limit'));
        img.onerror = () => finish(new Error('Image decode failed'));
        img.src = url;
      });
    } finally { URL.revokeObjectURL(url); }
    return {data, blob, width, height, bytes: bytes.length, mime: m[1]};
  }
  window.GymMedia = Object.freeze({decodeInlineImage});
})();
