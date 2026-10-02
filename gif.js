/**
 * GIF89a 인코더. 외부 라이브러리 없이 직접 구현: 색 양자화(미디언 컷) + LZW.
 * jumping 프로젝트의 src/share/gif.ts를 옮기고 두 가지를 더했다.
 *   - 투명 배경: 팔레트 0번을 투명색으로 예약하고, 알파 128 미만 픽셀을 0번으로 쓴다
 *   - 프레임마다 다른 지연 시간
 *
 * 사용: sample(rgba)로 모든 프레임의 색을 모은 뒤 addFrame(rgba, delayCs)를 차례로, 마지막에 finish().
 */
(() => {
const key15 = (r, g, b) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);

class GifEncoder {
  /** @param {{width:number, height:number, transparent:boolean}} opts */
  constructor(opts) {
    this.opts = opts;
    this.maxColors = opts.transparent ? 255 : 256;
    this.histogram = new Map();
    this.exact = new Map(); // 정확한 색 — maxColors 이하면 양자화 없이 그대로 쓴다
    this.palette = null;
    this.lookup = new Map();
    this.out = new ByteWriter();
    this.frames = 0;
  }

  sample(rgba) {
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i + 3] < 128) continue;
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      const k = key15(r, g, b);
      this.histogram.set(k, (this.histogram.get(k) || 0) + 1);
      if (this.exact.size <= this.maxColors) {
        const e = (r << 16) | (g << 8) | b;
        this.exact.set(e, (this.exact.get(e) || 0) + 1);
      }
    }
  }

  buildPalette() {
    if (this.palette) return;
    let colors = this.exact.size > 0 && this.exact.size <= this.maxColors
      ? [...this.exact.keys()].map(c => [(c >> 16) & 255, (c >> 8) & 255, c & 255])
      : medianCut(this.histogram, this.maxColors);
    if (colors.length === 0) colors = [[0, 0, 0]];
    // 투명이면 0번 자리를 비워 둔다
    this.first = this.opts.transparent ? 1 : 0;
    this.palette = this.opts.transparent ? [[0, 0, 0], ...colors] : colors;
    this.writeHeader();
  }

  addFrame(rgba, delayCs) {
    const { width, height, transparent } = this.opts;
    if (rgba.length !== width * height * 4) throw new Error('프레임 크기가 맞지 않습니다');
    this.buildPalette();
    const n = width * height, indices = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const j = i * 4;
      indices[i] = transparent && rgba[j + 3] < 128 ? 0 : this.nearest(rgba[j], rgba[j + 1], rgba[j + 2]);
    }
    const w = this.out;
    // 그래픽 제어 확장: 다음 프레임 전에 지우기(2), 투명색 0번
    w.bytes(0x21, 0xf9, 0x04, (2 << 2) | (transparent ? 1 : 0));
    w.u16(delayCs);
    w.bytes(0x00, 0x00);
    // 이미지 설명자 (전체 화면, 지역 팔레트 없음)
    w.bytes(0x2c); w.u16(0); w.u16(0); w.u16(width); w.u16(height); w.bytes(0x00);
    const minCodeSize = Math.max(2, Math.ceil(Math.log2(this.paletteSize())));
    w.bytes(minCodeSize);
    const data = lzwEncode(indices, minCodeSize);
    for (let i = 0; i < data.length; i += 255) {
      const chunk = data.subarray(i, i + 255);
      w.bytes(chunk.length);
      w.append(chunk);
    }
    w.bytes(0x00);
    this.frames++;
  }

  finish() {
    if (this.frames === 0) throw new Error('프레임이 없습니다');
    this.out.bytes(0x3b);
    return this.out.result();
  }

  paletteSize() {
    let n = 2;
    while (n < this.palette.length) n *= 2;
    return n;
  }

  writeHeader() {
    const { width, height } = this.opts, w = this.out, size = this.paletteSize();
    w.ascii('GIF89a'); w.u16(width); w.u16(height);
    w.bytes(0x80 | (7 << 4) | (Math.log2(size) - 1), 0, 0);
    for (let i = 0; i < size; i++) { const c = this.palette[i] || [0, 0, 0]; w.bytes(c[0], c[1], c[2]); }
    // 무한 반복 (NETSCAPE2.0)
    w.bytes(0x21, 0xff, 0x0b); w.ascii('NETSCAPE2.0'); w.bytes(0x03, 0x01, 0x00, 0x00, 0x00);
  }

  nearest(r, g, b) {
    const k = (r << 16) | (g << 8) | b;
    const hit = this.lookup.get(k);
    if (hit !== undefined) return hit;
    const pal = this.palette;
    let best = this.first, bestD = Infinity;
    for (let i = this.first; i < pal.length; i++) {
      const p = pal[i];
      const d = 2 * (p[0] - r) ** 2 + 4 * (p[1] - g) ** 2 + 3 * (p[2] - b) ** 2; // 초록에 민감한 눈에 맞춘 가중치
      if (d < bestD) { bestD = d; best = i; if (d === 0) break; }
    }
    if (this.lookup.size < 200000) this.lookup.set(k, best);
    return best;
  }
}

/** 미디언 컷: 색 상자를 가장 넓은 채널 기준으로 반씩 나눠 maxColors개 대표색을 만든다 */
function medianCut(histogram, maxColors) {
  const entries = [...histogram.keys()];
  if (entries.length === 0) return [];
  const ch = (c, k) => ((c >> (10 - k * 5)) & 31) << 3;
  const boxes = [{ colors: entries }];
  const range = (b, k) => {
    let lo = 255, hi = 0;
    for (const c of b.colors) { const v = ch(c, k); if (v < lo) lo = v; if (v > hi) hi = v; }
    return hi - lo;
  };
  while (boxes.length < maxColors) {
    let target = -1, targetK = 0, widest = 0;
    boxes.forEach((b, i) => {
      if (b.colors.length < 2) return;
      for (let k = 0; k < 3; k++) { const r = range(b, k); if (r > widest) { widest = r; target = i; targetK = k; } }
    });
    if (target < 0) break;
    const box = boxes[target];
    box.colors.sort((a, b) => ch(a, targetK) - ch(b, targetK));
    const total = box.colors.reduce((s, c) => s + (histogram.get(c) || 0), 0);
    let acc = 0, cut = 1;
    for (let i = 0; i < box.colors.length - 1; i++) {
      acc += histogram.get(box.colors[i]) || 0;
      cut = i + 1;
      if (acc >= total / 2) break;
    }
    boxes.splice(target, 1, { colors: box.colors.slice(0, cut) }, { colors: box.colors.slice(cut) });
  }
  return boxes.map(b => {
    let r = 0, g = 0, bl = 0, n = 0;
    for (const c of b.colors) {
      const w = histogram.get(c) || 1;
      r += (ch(c, 0) + 4) * w; g += (ch(c, 1) + 4) * w; bl += (ch(c, 2) + 4) * w; n += w;
    }
    return [Math.min(255, Math.round(r / n)), Math.min(255, Math.round(g / n)), Math.min(255, Math.round(bl / n))];
  });
}

/** GIF LZW 압축 (가변 길이 코드, 최대 12비트) */
function lzwEncode(indices, minCodeSize) {
  const clear = 1 << minCodeSize, eoi = clear + 1, bits = new BitWriter();
  let codeSize = minCodeSize + 1, next = eoi + 1, dict = new Map();
  bits.write(clear, codeSize);
  if (indices.length === 0) { bits.write(eoi, codeSize); return bits.result(); }
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i], key = (prefix << 8) | k, found = dict.get(key);
    if (found !== undefined) { prefix = found; continue; }
    bits.write(prefix, codeSize);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > 1 << codeSize && codeSize < 12) codeSize++;
    } else {
      bits.write(clear, codeSize); // 사전이 가득 차면 처음부터
      dict = new Map(); codeSize = minCodeSize + 1; next = eoi + 1;
    }
    prefix = k;
  }
  bits.write(prefix, codeSize);
  bits.write(eoi, codeSize);
  return bits.result();
}

class BitWriter {
  constructor() { this.buf = new Uint8Array(4096); this.len = 0; this.cur = 0; this.curBits = 0; }
  write(code, size) {
    this.cur |= code << this.curBits;
    this.curBits += size;
    while (this.curBits >= 8) { this.push(this.cur & 255); this.cur >>>= 8; this.curBits -= 8; }
  }
  result() {
    if (this.curBits > 0) { this.push(this.cur & 255); this.cur = 0; this.curBits = 0; }
    return this.buf.slice(0, this.len);
  }
  push(b) {
    if (this.len === this.buf.length) { const bigger = new Uint8Array(this.buf.length * 2); bigger.set(this.buf); this.buf = bigger; }
    this.buf[this.len++] = b;
  }
}

class ByteWriter {
  constructor() { this.buf = new Uint8Array(1 << 16); this.len = 0; }
  bytes(...values) { this.ensure(values.length); for (const v of values) this.buf[this.len++] = v & 255; }
  u16(v) { this.bytes(v & 255, (v >> 8) & 255); }
  ascii(s) { this.bytes(...[...s].map(c => c.charCodeAt(0))); }
  append(data) { this.ensure(data.length); this.buf.set(data, this.len); this.len += data.length; }
  result() { return this.buf.slice(0, this.len); }
  ensure(n) {
    if (this.len + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.len + n) size *= 2;
    const bigger = new Uint8Array(size);
    bigger.set(this.buf.subarray(0, this.len));
    this.buf = bigger;
  }
}

window.GifEncoder = GifEncoder;
})();
