/**
 * 마인크래프트 스킨 → Typing Pet 이미지(800×500 투명 PNG) 렌더러.
 * 스킨의 각 부위를 상자(머리·몸·팔)로 만들고, 상자의 면마다 스킨 텍스처를 평행사변형으로 붙여 그린다(직교 투영).
 * 3배 크기로 그린 뒤 줄여서 가장자리를 부드럽게 한다.
 * 세 모습은 같은 카메라·같은 맞춤(fit)을 써서 Typing Pet에서 바뀔 때 위치가 흔들리지 않는다.
 */
(() => {
const W = 800, H = 500, SS = 3, DEG = Math.PI / 180;
const POSES = ['idle', 'left', 'right'];
/** 현재 그리는 스킨 { canvas, k, slim } */
let skin = null;

/** 64×32 예전 스킨 → 64×64 (빠진 왼팔·왼다리는 오른쪽을 좌우로 뒤집어 채운다) */
function normalizeSkin(img) {
  const w = img.naturalWidth, h = img.naturalHeight;
  if (w < 64 || w % 64 !== 0 || !(h === w || h === w / 2)) throw new Error('스킨은 64×64 또는 64×32 PNG여야 해요.');
  const k = w / 64;
  const c = document.createElement('canvas'); c.width = w; c.height = w;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const legacy = h === w / 2;
  if (legacy) {
    const flip = (sx, sy, ww, hh, dx, dy) => {
      for (let i = 0; i < ww * k; i++)
        ctx.drawImage(img, sx * k + i, sy * k, 1, hh * k, dx * k + (ww * k - 1 - i), dy * k, 1, hh * k);
    };
    const mirrorLimb = (su, sv, du, dv) => {
      const lw = 4, lh = 12, d = 4;
      flip(su + d, sv, lw, d, du + d, dv);                            // top
      flip(su + d + lw, sv, lw, d, du + d + lw, dv);                  // bottom
      flip(su, sv + d, d, lh, du + d + lw, dv + d);                   // right -> left
      flip(su + d + lw, sv + d, d, lh, du, dv + d);                   // left -> right
      flip(su + d, sv + d, lw, lh, du + d, dv + d);                   // front
      flip(su + 2 * d + lw, sv + d, lw, lh, du + 2 * d + lw, dv + d); // back
    };
    mirrorLimb(0, 16, 16, 48);  // leg
    mirrorLimb(40, 16, 32, 48); // arm
    // 예전 스킨은 모자 층을 검은색 등으로 꽉 채운 경우가 많다 — 게임처럼 전부 불투명하면 모자가 없는 것으로 본다
    const hat = ctx.getImageData(32 * k, 0, 32 * k, 16 * k).data;
    let full = true;
    for (let i = 3; i < hat.length; i += 4) if (hat[i] < 128) { full = false; break; }
    if (full) ctx.clearRect(32 * k, 0, 32 * k, 16 * k);
  }
  // 얇은 팔 판별: 굵은 팔은 x 54~55, y 20~31을 쓰고 얇은 팔은 비워 둔다
  let slim = !legacy;
  if (slim) {
    const d = ctx.getImageData(54 * k, 20 * k, 2 * k, 12 * k).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) { slim = false; break; }
  }
  return { canvas: c, k, slim, legacy };
}

/* ---------- 3D math ---------- */
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function rotX(p, a) { const c = Math.cos(a), s = Math.sin(a); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; }
function rotY(p, a) { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; }
function rotZ(p, a) { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]; }
const IDENT = p => p;
function makeXf(pivot, rx = 0, ry = 0, rz = 0) {
  return p => add(pivot, rotZ(rotY(rotX(sub(p, pivot), rx), ry), rz));
}

/* ---------- textures for props ---------- */
const solidCache = {};
function solid(color) {
  if (!solidCache[color]) {
    const c = document.createElement('canvas'); c.width = c.height = 1;
    const x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, 1, 1);
    solidCache[color] = c;
  }
  return solidCache[color];
}
const KB_THEMES = {
  white: { frame: '#cfd2d8', key: '#fbfbfc', keyEdge: '#dfe1e6' },
  black: { frame: '#24262b', key: '#45484f', keyEdge: '#33363c' },
  pink:  { frame: '#f2b6c8', key: '#fff1f5', keyEdge: '#f6d3de' },
  mint:  { frame: '#9fd8c4', key: '#effaf6', keyEdge: '#cdeee2' },
};
const kbCache = {};
function kbTexture(theme) {
  if (kbCache[theme]) return kbCache[theme];
  const t = KB_THEMES[theme], c = document.createElement('canvas');
  c.width = 66; c.height = 24;
  const x = c.getContext('2d');
  x.fillStyle = t.frame; x.fillRect(0, 0, 66, 24);
  const key = (kx, ky, kw) => { x.fillStyle = t.key; x.fillRect(kx, ky, kw, 4); x.fillStyle = t.keyEdge; x.fillRect(kx, ky + 3, kw, 1); };
  for (let r = 0; r < 3; r++) for (let i = 0; i < 12; i++) key(2 + i * 5 + (r % 2 ? 2 : 0), 2 + r * 5, 4);
  key(2, 17, 6); key(9, 17, 6); key(16, 17, 34); key(51, 17, 6); key(58, 17, 6);
  return (kbCache[theme] = c);
}

/* 책상: 마인크래프트 판자·책장 텍스처를 1단위 = 1텍셀(스킨과 같은 밀도, 블록 = 16텍셀)로 만든다 */
const WOODS = {
  oak:      { shades: ['#b8945f', '#af8c58', '#a5834f', '#c29d62'], seam: '#7d6239', split: '#94764a' },
  spruce:   { shades: ['#7a5a34', '#72532f', '#684b2a', '#82603a'], seam: '#3f2c17', split: '#5a4126' },
  birch:    { shades: ['#d7c185', '#cbb67a', '#c4ae72', '#dfca8e'], seam: '#9a8654', split: '#b39f68' },
  dark_oak: { shades: ['#4f3218', '#4a2f16', '#432a13', '#55371b'], seam: '#26170a', split: '#3a2510' },
};
const BOOKS = ['#7b2e24', '#2f4c7d', '#3e6c30', '#8c6a28', '#5c2f6e', '#a4462f', '#2e6b67', '#6e6e72'];
const hash = (x, y, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};
function plankPixel(pal, x, y) {
  const yy = ((y % 16) + 16) % 16, xx = ((x % 16) + 16) % 16, row = yy >> 2;
  const block = Math.floor(x / 16) + Math.floor(y / 16) * 7;
  if ((yy & 3) === 3) return pal.seam;                                   // 판자 사이 가로 줄
  if (xx === (([5, 12, 2, 9][row] + block * 5) % 16)) return pal.split;  // 판자 이음매
  return pal.shades[hash(x, y, block) % pal.shades.length];
}
const woodCache = {};
function woodCanvas(kind, face, tw, th) {
  const key = [kind, face, tw, th].join();
  if (woodCache[key]) return woodCache[key];
  const c = document.createElement('canvas'); c.width = tw; c.height = th;
  const x = c.getContext('2d');
  const shelf = kind === 'bookshelf';
  const pal = WOODS[shelf ? 'oak' : kind];
  const put = (px, py, color) => { x.fillStyle = color; x.fillRect(px, py, 1, 1); };
  for (let py = 0; py < th; py++) for (let px = 0; px < tw; px++) put(px, py, plankPixel(pal, px, py));
  if (shelf && face === 'side') {
    // 위아래 한 줄은 판자 선반, 사이에 책을 꽂는다
    const top = 1, bottom = th - 1;
    for (let py = top; py < bottom; py++) for (let px = 0; px < tw; px++) put(px, py, '#3b2a17');
    let px = 0, n = 0;
    while (px < tw) {
      const bw = 1 + (hash(n, 1, 9) % 2), color = BOOKS[hash(n, 2, 9) % BOOKS.length];
      const short = hash(n, 3, 9) % 3 === 0 ? 1 : 0;
      for (let i = 0; i < bw && px + i < tw; i++) for (let py = top + short; py < bottom; py++) {
        const band = hash(n, 5, 9) % 3 === 0 && py === top + short + Math.floor((bottom - top - short) * 0.4);
        put(px + i, py, band ? '#e8d9a8' : color);
      }
      px += bw + (hash(n, 4, 9) % 5 === 0 ? 1 : 0);
      n++;
    }
  }
  return (woodCache[key] = c);
}
function deskFaceTex(kind, w, h, d) {
  const dims = { top: [w, d], bottom: [w, d], front: [w, h], back: [w, h], right: [d, h], left: [d, h] };
  const out = {};
  for (const [f, [a, b]] of Object.entries(dims)) {
    const tw = Math.max(1, Math.round(a)), th = Math.max(1, Math.round(b));
    out[f] = { img: woodCanvas(kind, f === 'top' || f === 'bottom' ? 'top' : 'side', tw, th), r: [0, 0, tw, th] };
  }
  return out;
}

/* ---------- scene ---------- */
// box: { min, max, uv:[u,v,w,h,d] | null, src, faceTex:{face:{img,r}}, xf, overlay }
function skinBoxes(min, max, uvBase, uvOv, inf, xf, o) {
  const out = [{ min, max, uv: uvBase, src: skin.canvas, k: skin.k, xf }];
  if (o.overlay) out.push({
    min: min.map(v => v - inf), max: max.map(v => v + inf), uv: [uvOv[0], uvOv[1], ...uvBase.slice(2)],
    src: skin.canvas, k: skin.k, xf, overlay: true,
  });
  return out;
}

function poseParams(which, o) {
  const down = -70 * DEG, up = -o.raise * DEG;
  const p = { vl: down, vr: down, rzl: 0, rzr: 0, roll: 0 };
  let side = which === 'left' ? 'L' : which === 'right' ? 'R' : null;
  if (side && o.swap) side = side === 'L' ? 'R' : 'L';
  if (side === 'L') { p.vl = up; p.rzl = o.spread * DEG; p.roll = o.headTilt ? 6 * DEG : 0; }
  if (side === 'R') { p.vr = up; p.rzr = -o.spread * DEG; p.roll = o.headTilt ? -6 * DEG : 0; }
  return p;
}

// 장면의 상자 목록 (앞뒤 가림은 깊이 버퍼가 처리하므로 순서는 상관없다)
function buildScene(which, o) {
  const p = poseParams(which, o);
  const slim = o.model === 'slim' || (o.model === 'auto' && skin.slim);
  const aw = slim ? 3 : 4;
  const parts = [];

  if (!o.desk) {
    parts.push(...skinBoxes([-4, 0, -2], [0, 12, 2], [0, 16, 4, 12, 4], [0, 32], .25, IDENT, o));
    parts.push(...skinBoxes([0, 0, -2], [4, 12, 2], [16, 48, 4, 12, 4], [0, 48], .25, IDENT, o));
  }
  parts.push(...skinBoxes([-4, 12, -2], [4, 24, 2], [16, 16, 8, 12, 4], [16, 32], .25, IDENT, o));
  parts.push(...skinBoxes([-4, 24, -4], [4, 32, 4], [0, 0, 8, 8, 8], [32, 0], .5,
    makeXf([0, 24, 0], o.headPitch * DEG, 0, p.roll), o));

  if (o.desk) {
    const min = [-16, 8.5, 3], max = [16, 14.5, 16];
    parts.push({ min, max, xf: IDENT, faceTex: deskFaceTex(o.deskWood, max[0] - min[0], max[1] - min[1], max[2] - min[2]) });
  }
  if (o.kb) {
    const t = KB_THEMES[o.kbTheme];
    parts.push({ min: [-11, 14.5, 5.5], max: [11, 16, 13.5], src: solid(t.frame), xf: IDENT,
      faceTex: { top: { img: kbTexture(o.kbTheme), r: [0, 0, 66, 24] } } });
  }

  // arms: viewer-left = character's right arm
  const armL = skinBoxes([-4 - aw, 12, -2], [-4, 24, 2], [40, 16, aw, 12, 4], [40, 32], .25,
    makeXf([-5, 22, 0], p.vl, 0, p.rzl), o);
  const armR = skinBoxes([4, 12, -2], [4 + aw, 24, 2], [32, 48, aw, 12, 4], [48, 48], .25,
    makeXf([5, 22, 0], p.vr, 0, p.rzr), o);
  return [...parts, ...armL, ...armR];
}

function camP(p, o) { return rotX(rotY(p, o.yaw * DEG), o.pitch * DEG); }

function boxCorners(b) {
  const out = [];
  for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) out.push([x, y, z]);
  return out;
}

function computeFit(o) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const id of POSES) for (const b of buildScene(id, o)) for (const c of boxCorners(b)) {
    const q = camP(b.xf(c), o);
    x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, -q[1]); y1 = Math.max(y1, -q[1]);
  }
  const pad = 14 + o.outline;
  const s = Math.min((W - 2 * pad) / (x1 - x0), (H - 2 * pad) / (y1 - y0)) * o.scale / 100;
  const ox = W / 2 - (x0 + x1) / 2 * s;
  const oy = o.valign === 'bottom' ? H - pad - y1 * s : H / 2 - (y0 + y1) / 2 * s;
  return { s, ox, oy };
}

/* ---------- rasterizer ---------- */
const L = (() => { const v = [-0.45, 0.75, 0.55], n = Math.hypot(...v); return v.map(x => x / n); })();
const FACE_DEF = (x0, y0, z0, x1, y1, z1) => {
  const w = x1 - x0, h = y1 - y0, d = z1 - z0;
  return [
    ['front',  [x0, y1, z1], [w, 0, 0], [0, -h, 0]],
    ['back',   [x1, y1, z0], [-w, 0, 0], [0, -h, 0]],
    ['right',  [x0, y1, z0], [0, 0, d], [0, -h, 0]],
    ['left',   [x1, y1, z1], [0, 0, -d], [0, -h, 0]],
    ['top',    [x0, y1, z0], [w, 0, 0], [0, 0, d]],
    ['bottom', [x0, y0, z1], [w, 0, 0], [0, 0, -d]],
  ];
};
function texRect(b, face) {
  if (b.faceTex && b.faceTex[face]) return b.faceTex[face];
  if (!b.uv) return { img: b.src, r: [0, 0, 1, 1] };
  const [u, v, w, h, d] = b.uv, k = b.k;
  const r = {
    front: [u + d, v + d, w, h], back: [u + 2 * d + w, v + d, w, h],
    right: [u, v + d, d, h], left: [u + d + w, v + d, d, h],
    top: [u + d, v, w, d], bottom: [u + d + w, v, w, d],
  }[face];
  return { img: b.src, r: r.map(x => x * k) };
}

/* 깊이 버퍼: 픽셀마다 카메라에 더 가까운 면만 남긴다.
 * 상자를 통째로 덧그리면 각도를 틀었을 때 뒤쪽 팔이 몸통 위로 올라오므로 픽셀 단위로 가린다. */
const BW = W * SS, BH = H * SS;
const color32 = new Uint32Array(BW * BH);
const depth = new Float32Array(BW * BH);
const big = document.createElement('canvas'); big.width = BW; big.height = BH;
const bigCtx = big.getContext('2d');
const ALPHA_CUT = 128; // 겉옷 층처럼 반투명한 텍셀은 이 값 이상만 칠한다

const texCache = new WeakMap();
function texData(img) {
  let t = texCache.get(img);
  if (!t) {
    t = { data: img.getContext('2d').getImageData(0, 0, img.width, img.height).data, w: img.width };
    texCache.set(img, t);
  }
  return t;
}

/** 화면 위 평행사변형 O + a·U + b·V (a, b ∈ [0,1])를 텍스처 사각형으로 채운다. 깊이는 z0 + a·zu + b·zv */
function rasterFace(O, U, V, z0, zu, zv, tex, r, shade) {
  const det = U[0] * V[1] - U[1] * V[0];
  if (Math.abs(det) < 1e-6) return;
  const xs = [O[0], O[0] + U[0], O[0] + V[0], O[0] + U[0] + V[0]];
  const ys = [O[1], O[1] + U[1], O[1] + V[1], O[1] + U[1] + V[1]];
  const x0 = Math.max(0, Math.floor(Math.min(...xs)) - 1), x1 = Math.min(BW - 1, Math.ceil(Math.max(...xs)) + 1);
  const y0 = Math.max(0, Math.floor(Math.min(...ys)) - 1), y1 = Math.min(BH - 1, Math.ceil(Math.max(...ys)) + 1);
  const ia0 = V[1] / det, ia1 = -V[0] / det, ib0 = -U[1] / det, ib1 = U[0] / det;
  // 면 사이 틈이 생기지 않게 가장자리를 0.6픽셀씩 넓힌다 (겹치는 곳은 깊이가 정리한다)
  const ea = 0.6 / Math.hypot(U[0], U[1]), eb = 0.6 / Math.hypot(V[0], V[1]);
  const [sx, sy, sw, sh] = r, { data, w: tw } = tex;
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5 - O[1];
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5 - O[0];
      const a = ia0 * px + ia1 * py;
      if (a < -ea || a > 1 + ea) continue;
      const b = ib0 * px + ib1 * py;
      if (b < -eb || b > 1 + eb) continue;
      const z = z0 + a * zu + b * zv, idx = y * BW + x;
      if (z <= depth[idx]) continue;
      const tx = sx + Math.min(sw - 1, Math.max(0, Math.floor(a * sw)));
      const ty = sy + Math.min(sh - 1, Math.max(0, Math.floor(b * sh)));
      const ti = (ty * tw + tx) * 4;
      if (data[ti + 3] < ALPHA_CUT) continue;
      color32[idx] = 0xff000000 | ((data[ti + 2] * shade) << 16) | ((data[ti + 1] * shade) << 8) | (data[ti] * shade);
      depth[idx] = z;
    }
  }
}

function drawBox(b, o, fit) {
  const s = fit.s * SS;
  for (const [name, tl, U, V] of FACE_DEF(...b.min, ...b.max)) {
    const P0 = camP(b.xf(tl), o), PU = camP(b.xf(add(tl, U)), o), PV = camP(b.xf(add(tl, V)), o);
    const u = sub(PU, P0), v = sub(PV, P0), n = cross(v, u);
    // 겉옷 층은 게임처럼 양면으로 그린다 (모자 구멍 사이로 안쪽이 보이게)
    if (n[2] <= 1e-7 && !b.overlay) continue;
    const { img, r } = texRect(b, name);
    let shade = 1;
    if (o.shade) {
      const dot = Math.max(0, (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / (Math.hypot(...n) || 1));
      shade = 1 - 0.36 * (1 - dot);
    }
    rasterFace(
      [(fit.ox + P0[0] * fit.s) * SS, (fit.oy - P0[1] * fit.s) * SS],
      [u[0] * s, -u[1] * s], [v[0] * s, -v[1] * s],
      P0[2], u[2], v[2], texData(img), r, shade);
  }
}

function renderPose(which, o, fit) {
  color32.fill(0);
  depth.fill(-Infinity);
  for (const b of buildScene(which, o)) drawBox(b, o, fit);
  bigCtx.putImageData(new ImageData(new Uint8ClampedArray(color32.buffer), BW, BH), 0, 0);

  let out = document.createElement('canvas'); out.width = W; out.height = H;
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = 'high';
  octx.drawImage(big, 0, 0, W, H);

  if (o.outline > 0) {
    const ol = document.createElement('canvas'); ol.width = W; ol.height = H;
    const lctx = ol.getContext('2d');
    const steps = 24;
    for (let i = 0; i < steps; i++) {
      const a = i / steps * Math.PI * 2;
      lctx.drawImage(out, Math.cos(a) * o.outline, Math.sin(a) * o.outline);
    }
    lctx.globalCompositeOperation = 'source-in';
    lctx.fillStyle = o.outlineColor; lctx.fillRect(0, 0, W, H);
    lctx.globalCompositeOperation = 'source-over';
    lctx.drawImage(out, 0, 0);
    out = ol;
  }
  return out;
}

/** 세 모습을 렌더링해 { idle, left, right } 캔버스로 돌려준다 */
function renderPoses(skinData, o) {
  skin = skinData;
  const fit = computeFit(o);
  const out = {};
  for (const id of POSES) out[id] = renderPose(id, o, fit);
  return out;
}

window.PetRenderer = { W, H, normalizeSkin, renderPoses };
})();
