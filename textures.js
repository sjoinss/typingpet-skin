/**
 * 소품 텍스처를 코드로 그린다 (외부 이미지 없음).
 * 1단위 = 1텍셀로 스킨과 같은 밀도다. 블록 한 칸은 16텍셀.
 * 모든 함수는 캔버스를 돌려주고, 같은 인자면 캐시를 쓴다.
 */
(() => {
const cache = new Map();

/** fn(x, y) → '#rrggbb' | null(투명) 로 tw×th 캔버스를 만든다 */
function makeTex(key, tw, th, fn) {
  const k = `${key}|${tw}|${th}`;
  if (cache.has(k)) return cache.get(k);
  const c = document.createElement('canvas');
  c.width = tw; c.height = th;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(tw, th);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const col = fn(x, y);
    if (!col) continue;
    const i = (y * tw + x) * 4, n = parseInt(col.slice(1), 16);
    img.data[i] = n >> 16; img.data[i + 1] = (n >> 8) & 255; img.data[i + 2] = n & 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  cache.set(k, c);
  return c;
}

const hash = (x, y, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};
const mod16 = v => ((v % 16) + 16) % 16;
const pick = (arr, x, y, s) => arr[hash(x, y, s) % arr.length];
/** 색을 어둡게 (0~1) */
function darken(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = v => Math.round(v * f).toString(16).padStart(2, '0');
  return '#' + c(n >> 16) + c((n >> 8) & 255) + c(n & 255);
}

/* ---------- 판자 ---------- */
const PLANKS = {
  oak:      { shades: ['#b8945f', '#af8c58', '#a5834f', '#c29d62'], seam: '#7d6239', split: '#94764a' },
  spruce:   { shades: ['#7a5a34', '#72532f', '#684b2a', '#82603a'], seam: '#3f2c17', split: '#5a4126' },
  birch:    { shades: ['#d7c185', '#cbb67a', '#c4ae72', '#dfca8e'], seam: '#9a8654', split: '#b39f68' },
  dark_oak: { shades: ['#4f3218', '#4a2f16', '#432a13', '#55371b'], seam: '#26170a', split: '#3a2510' },
};
function plankPixel(kind, x, y) {
  const pal = PLANKS[kind];
  const yy = mod16(y), xx = mod16(x), row = yy >> 2;
  const block = Math.floor(x / 16) + Math.floor(y / 16) * 7;
  if ((yy & 3) === 3) return pal.seam;                                   // 판자 사이 가로 줄
  if (xx === (([5, 12, 2, 9][row] + block * 5) % 16)) return pal.split;  // 판자 이음매
  return pick(pal.shades, x, y, block);
}
const planks = (kind, tw, th) => makeTex('planks-' + kind, tw, th, (x, y) => plankPixel(kind, x, y));

/* ---------- 책장 (책상 재질) ---------- */
const BOOKS = ['#7b2e24', '#2f4c7d', '#3e6c30', '#8c6a28', '#5c2f6e', '#a4462f', '#2e6b67', '#6e6e72'];
function bookshelfSide(tw, th) {
  // 책 n번의 시작 x를 미리 정한다
  const books = [];
  for (let px = 0, n = 0; px < tw; n++) {
    const bw = 1 + (hash(n, 1, 9) % 2);
    books.push({ x0: px, x1: px + bw, n });
    px += bw + (hash(n, 4, 9) % 5 === 0 ? 1 : 0);
  }
  const top = 1, bottom = th - 1;
  return makeTex('bookshelf', tw, th, (x, y) => {
    if (y < top || y >= bottom) return plankPixel('oak', x, y);
    const b = books.find(b => x >= b.x0 && x < b.x1);
    if (!b) return '#3b2a17';
    const short = hash(b.n, 3, 9) % 3 === 0 ? 1 : 0;
    if (y < top + short) return '#3b2a17';
    const band = hash(b.n, 5, 9) % 3 === 0 && y === top + short + Math.floor((bottom - top - short) * 0.4);
    return band ? '#e8d9a8' : BOOKS[hash(b.n, 2, 9) % BOOKS.length];
  });
}

/** 책상 상자의 면별 텍스처 { face: {img, r} } */
function deskFaces(kind, w, h, d) {
  return boxFaces(w, h, d, (face, tw, th) => {
    const top = face === 'top' || face === 'bottom';
    if (kind === 'bookshelf') return top ? planks('oak', tw, th) : bookshelfSide(tw, th);
    return planks(kind, tw, th);
  });
}

/** 상자 크기에 맞춰 면마다 make(face, tw, th)로 텍스처를 붙인다 */
function boxFaces(w, h, d, make) {
  const dims = { top: [w, d], bottom: [w, d], front: [w, h], back: [w, h], right: [d, h], left: [d, h] };
  const out = {};
  for (const [f, [a, b]] of Object.entries(dims)) {
    const tw = Math.max(1, Math.round(a)), th = Math.max(1, Math.round(b));
    out[f] = { img: make(f, tw, th), r: [0, 0, tw, th] };
  }
  return out;
}

/* ---------- 원목 (나무 캐기) ---------- */
const LOGS = {
  oak:      { bark: ['#6d5434', '#5f482b', '#7a5f3b', '#4e3b22'], ring: ['#b8945f', '#a5834f'], core: '#8f7045' },
  birch:    { bark: ['#d8d5cc', '#cfcbc0', '#e3e0d8', '#d8d5cc'], mark: '#2d2a26', ring: ['#d7c185', '#c4ae72'], core: '#b39f68' },
  spruce:   { bark: ['#3d2a17', '#33230f', '#4a3420', '#2c1d0e'], ring: ['#7a5a34', '#684b2a'], core: '#5a4126' },
  dark_oak: { bark: ['#3b2b1a', '#2c1f12', '#4a3622', '#33251a'], ring: ['#4f3218', '#432a13'], core: '#3a2510' },
};
function barkPixel(kind, x, y) {
  const p = LOGS[kind];
  if (p.mark && hash(Math.floor(x / 3), Math.floor(y / 2), 77) % 9 === 0 && hash(x, 0, 78) % 3) return p.mark;
  // 세로 결: 같은 열에서 비슷한 색이 길게 이어진다
  return p.bark[hash(x, Math.floor((y + hash(x, 0, 5) % 7) / 5), 3) % p.bark.length];
}
/** 금 간 자국 (블록 부수기 단계처럼): 가운데에서 뻗는 어두운 선 */
function crackAt(x, y, tw, th) {
  const cx = Math.floor(tw / 2), cy = Math.floor(th * 0.5);
  const dx = x - cx, dy = y - cy;
  if (Math.abs(dx) > 6 || Math.abs(dy) > 7) return false;
  const lines = [[1, 1], [-1, 1], [1, -1], [-1, -2], [2, -1], [0, 1]];
  return lines.some(([lx, ly]) => {
    for (let t = 0; t <= 6; t++) {
      const px = Math.round(lx * t * 0.9 + (hash(t, lx, 41) % 3 === 0 ? 1 : 0)), py = Math.round(ly * t * 0.9);
      if (px === dx && py === dy) return true;
    }
    return false;
  });
}
function logFaces(kind, w, h, d, cracked) {
  return boxFaces(w, h, d, (face, tw, th) => {
    if (face === 'top' || face === 'bottom') {
      const p = LOGS[kind];
      return makeTex('logtop-' + kind, tw, th, (x, y) => {
        const r = Math.max(Math.abs(mod16(x) - 7.5), Math.abs(mod16(y) - 7.5));
        if (r > 6.5) return barkPixel(kind, x, y);
        if (r < 1.5) return p.core;
        return p.ring[Math.floor(r) % 2];
      });
    }
    return makeTex(`bark-${kind}-${cracked ? 1 : 0}-${face}`, tw, th, (x, y) => {
      const c = barkPixel(kind, x, y);
      return cracked && (face === 'left' || face === 'right' || face === 'front') && crackAt(x, y, tw, th) ? darken(c, 0.35) : c;
    });
  });
}
const logChipColor = kind => LOGS[kind].bark[0];

/* ---------- 제작대 ---------- */
function craftingFaces(w, h, d) {
  const metal = ['#9a9a9a', '#c6c6c6', '#6e6e6e'];
  return boxFaces(w, h, d, (face, tw, th) => {
    if (face === 'top') return makeTex('craft-top', tw, th, (x, y) => {
      const xx = mod16(x), yy = mod16(y);
      if (xx === 0 || xx === 15 || yy === 0 || yy === 15) return '#4d3720';
      if ((xx === 5 || xx === 10 || yy === 5 || yy === 10) && xx > 1 && xx < 14 && yy > 1 && yy < 14) return '#6b4f2c';
      return plankPixel('oak', x, y);
    });
    if (face === 'bottom') return planks('oak', tw, th);
    const front = face === 'front' || face === 'back';
    return makeTex('craft-' + (front ? 'front' : 'side'), tw, th, (x, y) => {
      const xx = mod16(x), yy = mod16(y);
      if (yy < 3) return yy === 2 ? '#4d3720' : plankPixel('spruce', x, y); // 위쪽 테두리
      if (front) {
        if (yy >= 4 && yy <= 7 && xx >= 2 && xx <= 8) return yy === 7 && xx % 2 ? '#5c5c5c' : metal[(xx + yy) % 2]; // 톱날
        if (xx === 12 && yy >= 4 && yy <= 13) return '#6b4a2b';                                                         // 망치 자루
        if (yy >= 4 && yy <= 5 && xx >= 10 && xx <= 14) return metal[2];                                                // 망치 머리
      } else {
        if (yy === 4 && xx >= 3 && xx <= 11) return metal[1];                    // 곡괭이 머리
        if ((yy === 5 && (xx === 3 || xx === 11)) || (yy === 5 && xx >= 5 && xx <= 9)) return metal[0];
        if (xx === 7 && yy >= 5 && yy <= 13) return '#6b4a2b';                   // 곡괭이 자루
      }
      return plankPixel('oak', x, y);
    });
  });
}

/* ---------- 돌 블록 · 버튼 ---------- */
const STONE = ['#7f7f7f', '#747474', '#8a8a8a', '#7a7a7a', '#6b6b6b'];
const stonePixel = (x, y) => pick(STONE, Math.floor(x / (hash(y, 1, 2) % 2 + 1)), y, 11);
function stoneBrickPixel(x, y) {
  const xx = mod16(x + (mod16(y) >= 8 ? 8 : 0)), yy = mod16(y);
  if (yy === 7 || yy === 15 || xx === 15) return '#555555';
  if (yy === 0 || yy === 8 || xx === 0) return '#9a9a9a';
  return pick(['#7b7b7b', '#757575', '#818181'], x, y, 13);
}
function blockFaces(kind, w, h, d) {
  if (kind === 'stone') return boxFaces(w, h, d, (f, tw, th) => makeTex('stone', tw, th, stonePixel));
  if (kind === 'stone_bricks') return boxFaces(w, h, d, (f, tw, th) => makeTex('stonebricks', tw, th, stoneBrickPixel));
  return boxFaces(w, h, d, (f, tw, th) => planks(kind, tw, th));
}
function buttonFaces(kind, w, h, d) {
  return boxFaces(w, h, d, (f, tw, th) => kind === 'stone'
    ? makeTex('button-stone', tw, th, (x, y) => pick(['#8f8f8f', '#868686', '#999999'], x, y, 17))
    : planks(kind, tw, th));
}

/* ---------- 도끼 (16×16 아이템 그림) ---------- */
const AXE_MAP = [
  '................',
  '........ooo.....',
  '.......ohhHo....',
  '......ohhHHHo...',
  '......ohHHHHHo..',
  '.......oSHHHHo..',
  '......sS.oHHHo..',
  '.....sS...oHo...',
  '....sS.....o....',
  '...sS...........',
  '..sS............',
  '.sS.............',
  'sS..............',
  '................',
  '................',
  '................',
];
/** 손잡이 쥐는 곳 (텍셀 좌표) */
const AXE_GRIP = [3.5, 9.5];
const AXES = {
  wood:    { h: '#b38a52', H: '#8f6a3a', o: '#4a3418' },
  stone:   { h: '#a8a8a8', H: '#8a8a8a', o: '#4a4a4a' },
  iron:    { h: '#ffffff', H: '#d8d8d8', o: '#6b6b6b' },
  gold:    { h: '#fff3a0', H: '#f2d04a', o: '#8a6410' },
  diamond: { h: '#a8fff4', H: '#4ee6d4', o: '#1f6e66' },
};
function axeSprite(kind, mirrored) {
  const pal = { ...AXES[kind], s: '#8a6a3c', S: '#5c4325' };
  return makeTex(`axe-${kind}-${mirrored ? 1 : 0}`, 16, 16, (x, y) => {
    const ch = AXE_MAP[y][mirrored ? 15 - x : x];
    return ch === '.' ? null : pal[ch];
  });
}

/* ---------- 키보드 ---------- */
const KB_THEMES = {
  white: { frame: '#cfd2d8', key: '#fbfbfc', keyEdge: '#dfe1e6' },
  black: { frame: '#24262b', key: '#45484f', keyEdge: '#33363c' },
  pink:  { frame: '#f2b6c8', key: '#fff1f5', keyEdge: '#f6d3de' },
  mint:  { frame: '#9fd8c4', key: '#effaf6', keyEdge: '#cdeee2' },
};
function keyboardTop(theme) {
  const t = KB_THEMES[theme];
  const keyAt = (x, y) => {
    for (let r = 0; r < 3; r++) for (let i = 0; i < 12; i++) {
      const kx = 2 + i * 5 + (r % 2 ? 2 : 0), ky = 2 + r * 5;
      if (x >= kx && x < kx + 4 && y >= ky && y < ky + 4) return y === ky + 3 ? 'edge' : 'key';
    }
    for (const [kx, kw] of [[2, 6], [9, 6], [16, 34], [51, 6], [58, 6]])
      if (x >= kx && x < kx + kw && y >= 17 && y < 21) return y === 20 ? 'edge' : 'key';
    return null;
  };
  return makeTex('kb-' + theme, 66, 24, (x, y) => {
    const k = keyAt(x, y);
    return k === 'key' ? t.key : k === 'edge' ? t.keyEdge : t.frame;
  });
}
const solid = color => makeTex('solid-' + color, 1, 1, () => color);
const clear = () => makeTex('clear', 1, 1, () => null);

window.PetTextures = {
  boxFaces, deskFaces, logFaces, logChipColor, craftingFaces, blockFaces, buttonFaces,
  axeSprite, AXE_GRIP, KB_THEMES, keyboardTop, solid, clear,
};
})();
