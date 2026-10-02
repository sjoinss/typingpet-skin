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
/** 가로로 눕힌 원목(x축 방향): 양 끝(left·right)은 나이테, 나머지 면은 나무껍질 결이 가로로 흐른다 */
function logFaces(kind, w, h, d) {
  const p = LOGS[kind];
  return boxFaces(w, h, d, (face, tw, th) => {
    if (face === 'left' || face === 'right') return makeTex('logend-' + kind, tw, th, (x, y) => {
      const r = Math.max(Math.abs(mod16(x) - 7.5), Math.abs(mod16(y) - 7.5));
      if (r > 6.5) return barkPixel(kind, x, y);
      if (r < 1.5) return p.core;
      return p.ring[Math.floor(r) % 2];
    });
    return makeTex('bark-side-' + kind, tw, th, (x, y) => barkPixel(kind, y, x));
  });
}
const logChipColor = kind => LOGS[kind].bark[0];

/* ---------- 마인크래프트 원본 텍스처 ----------
 * 저장소에 원본 그림을 넣지 않고, 실행할 때 공개 에셋 미러에서 받아 온다 (CORS 허용).
 * 못 받으면 아래의 직접 그린 텍스처를 쓴다.
 */
const VANILLA_SOURCES = [
  name => `https://assets.mcasset.cloud/1.21.4/assets/minecraft/textures/block/${name}.png`,
  name => `https://cdn.jsdelivr.net/gh/InventivetalentDev/minecraft-assets@1.21.4/assets/minecraft/textures/block/${name}.png`,
];
const vanilla = new Map(); // 이름 → 16×16 캔버스
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
/** 블록 텍스처 여러 개를 받아 둔다. 하나라도 실패하면 false (그때는 직접 그린 텍스처를 쓴다) */
async function loadVanilla(names) {
  const missing = names.filter(n => !vanilla.has(n));
  if (missing.length === 0) return true;
  for (const source of VANILLA_SOURCES) {
    try {
      const imgs = await Promise.all(missing.map(n => loadImage(source(n))));
      imgs.forEach((img, i) => {
        // 애니메이션 텍스처처럼 세로로 긴 그림은 첫 칸만 쓴다
        const c = document.createElement('canvas'); c.width = 16; c.height = 16;
        c.getContext('2d').drawImage(img, 0, 0, img.width, img.width, 0, 0, 16, 16);
        vanilla.set(missing[i], c);
      });
      return true;
    } catch {
      // 다음 미러로
    }
  }
  return false;
}

/* ---------- 제작대 ---------- */
const CRAFTING_TEXTURES = ['crafting_table_top', 'crafting_table_front', 'crafting_table_side', 'oak_planks'];
function craftingFaces(w, h, d) {
  if (CRAFTING_TEXTURES.every(n => vanilla.has(n))) {
    const names = { top: 'crafting_table_top', bottom: 'oak_planks', front: 'crafting_table_front',
      back: 'crafting_table_front', left: 'crafting_table_side', right: 'crafting_table_side' };
    return boxFaces(w, h, d, face => vanilla.get(names[face]));
  }
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
  CRAFTING_TEXTURES, loadVanilla, KB_THEMES, keyboardTop, solid, clear,
};
})();
