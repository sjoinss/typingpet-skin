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

/* ---------- 장면 ---------- */
const T = window.PetTextures;
const scale = (p, k) => [p[0] * k, p[1] * k, p[2] * k];
// 상자: { min, max, uv(스킨 위치) | faceTex(면별 텍스처), src(기본 텍스처), xf(점 변환), overlay, head }

function skinBoxes(min, max, uvBase, uvOv, inf, xf, o, extra = {}) {
  const out = [{ min, max, uv: uvBase, src: skin.canvas, k: skin.k, xf, ...extra }];
  if (o.overlay) out.push({
    min: min.map(v => v - inf), max: max.map(v => v + inf), uv: [uvOv[0], uvOv[1], ...uvBase.slice(2)],
    src: skin.canvas, k: skin.k, xf, overlay: true, ...extra,
  });
  return out;
}

/** 이번 모습에서 움직이는 손: 'L'(화면 왼쪽) · 'R' · null. 왼손↔오른손 바꾸기 반영 */
function activeSide(which, o) {
  let side = which === 'left' ? 'L' : which === 'right' ? 'R' : null;
  if (side && o.swap) side = side === 'L' ? 'R' : 'L';
  return side;
}
function headFor(side, o) {
  const tilt = o.headTilt ? 6 * DEG : 0;
  return { rx: o.headPitch * DEG, rz: side === 'L' ? tilt : side === 'R' ? -tilt : 0 };
}

/**
 * 캐릭터 상자들. 화면 왼쪽 팔(L) = 캐릭터의 오른팔.
 * arms: { L: {rx, rz}, R: {rx, rz} } (라디안, 팔을 내린 상태가 0), head: { rx, ry, rz }
 */
function character(o, { arms, head, legs = true }) {
  const slim = o.model === 'slim' || (o.model === 'auto' && skin.slim);
  const aw = slim ? 3 : 4;
  const boxes = [];
  if (legs) {
    boxes.push(...skinBoxes([-4, 0, -2], [0, 12, 2], [0, 16, 4, 12, 4], [0, 32], .25, IDENT, o));
    boxes.push(...skinBoxes([0, 0, -2], [4, 12, 2], [16, 48, 4, 12, 4], [0, 48], .25, IDENT, o));
  }
  boxes.push(...skinBoxes([-4, 12, -2], [4, 24, 2], [16, 16, 8, 12, 4], [16, 32], .25, IDENT, o));
  boxes.push(...skinBoxes([-4, 24, -4], [4, 32, 4], [0, 0, 8, 8, 8], [32, 0], .5,
    makeXf([0, 24, 0], head.rx || 0, head.ry || 0, head.rz || 0), o, { head: true }));
  const armXf = {
    L: makeXf([-5, 22, 0], arms.L.rx, 0, arms.L.rz),
    R: makeXf([5, 22, 0], arms.R.rx, 0, arms.R.rz),
  };
  boxes.push(...skinBoxes([-4 - aw, 12, -2], [-4, 24, 2], [40, 16, aw, 12, 4], [40, 32], .25, armXf.L, o));
  boxes.push(...skinBoxes([4, 12, -2], [4 + aw, 24, 2], [32, 48, aw, 12, 4], [48, 48], .25, armXf.R, o));
  return { boxes, armXf, armX: { L: -4 - aw / 2, R: 4 + aw / 2 } };
}

const size = (min, max) => [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
const prop = (min, max, faceTex, src = T.clear()) => ({ min, max, faceTex, src, xf: IDENT });

const DOWN = -70 * DEG; // 손이 키보드·제작대 위에 닿는 각도

/** 손을 번갈아 드는 기본 자세 (책상·제작대·나무) */
function typingArms(which, o) {
  const side = activeSide(which, o), up = -o.raise * DEG, sp = o.spread * DEG;
  const arm = s => side === s ? { rx: up, rz: (s === 'L' ? 1 : -1) * sp } : { rx: DOWN, rz: 0 };
  return { side, arms: { L: arm('L'), R: arm('R') } };
}

const SCENES = {
  desk(which, o) {
    const { side, arms } = typingArms(which, o);
    const out = character(o, { arms, head: headFor(side, o), legs: !o.desk }).boxes;
    if (o.desk) {
      const min = [-16, 6.5, 3], max = [16, 14.5, 16]; // 반 블록 높이
      out.push(prop(min, max, T.deskFaces(o.deskWood, ...size(min, max))));
    }
    if (o.kb) out.push({
      min: [-11, 14.5, 5.5], max: [11, 16, 13.5], src: T.solid(T.KB_THEMES[o.kbTheme].frame), xf: IDENT,
      faceTex: { top: { img: T.keyboardTop(o.kbTheme), r: [0, 0, 66, 24] } },
    });
    return out;
  },

  crafting(which, o) {
    const { side, arms } = typingArms(which, o);
    const out = character(o, { arms, head: headFor(side, o) }).boxes;
    out.push(prop([-8, 0, 3], [8, 16, 19], T.craftingFaces(16, 16, 16)));
    return out;
  },

  button(which, o) {
    // 책상 높이의 반 블록 위 버튼. 평소엔 두 손이 버튼 위에 떠 있고, 누르는 손만 내려간다
    const side = activeSide(which, o), HOVER = -86 * DEG, PRESS = -74 * DEG;
    const arm = s => ({ rx: side === s ? PRESS : HOVER, rz: 0 });
    const head = headFor(side, o);
    head.rx += 6 * DEG;
    const ch = character(o, { arms: { L: arm('L'), R: arm('R') }, head, legs: false });
    const out = ch.boxes;
    const min = [-16, 8, 3], max = [16, 16, 16];
    out.push(prop(min, max, T.blockFaces(o.blockKind, ...size(min, max))));
    for (const s of ['L', 'R']) {
      const cx = ch.armX[s], h = side === s ? 1 : 2;
      out.push(prop([cx - 3, 16, 6.5], [cx + 3, 16 + h, 10.5], T.buttonFaces(o.buttonKind, 6, h, 4)));
    }
    return out;
  },

  tree(which, o) {
    // 앞에 눕힌 원목을 키보드 치듯 손으로 번갈아 내리친다
    const { side, arms } = typingArms(which, o);
    const ch = character(o, { arms, head: headFor(side, o) });
    const out = ch.boxes;
    out.push(prop([-16, 0, 3], [16, 16, 19], T.logFaces(o.logKind, 32, 16, 16)));
    if (side) {
      // 내려친 손 옆으로 튀는 나무 조각
      const down = side === 'L' ? 'R' : 'L', cx = ch.armX[down], dir = down === 'L' ? -1 : 1;
      const chip = T.solid(T.logChipColor(o.logKind));
      for (const [dx, dy, dz] of [[3, 2, 1], [4.5, 4, -1.5], [-2.5, 3, 2.5], [1.5, 5.5, 4]]) {
        const c = [cx + dir * dx, 16 + dy, 9 + dz];
        out.push({ min: c.map(v => v - .6), max: c.map(v => v + .6), src: chip, xf: IDENT });
      }
    }
    return out;
  },
};

/** 장면의 상자 목록 (앞뒤 가림은 깊이 버퍼가 처리하므로 순서는 상관없다) */
function buildScene(which, o) {
  const boxes = (SCENES[o.scene] || SCENES.desk)(which, o);
  // 머리·몸 크기: 몸(과 소품)은 발밑 기준으로, 머리는 목 기준으로 키우고 줄인다 → 손은 계속 소품에 닿는다
  const kb = o.bodyScale / 100, kh = o.headScale / 100;
  if (kb === 1 && kh === 1) return boxes;
  const neck = [0, 24, 0], neckScaled = [0, 24 * kb, 0];
  return boxes.map(b => {
    const xf = b.xf;
    return { ...b, xf: b.head ? p => add(neckScaled, scale(sub(xf(p), neck), kh)) : p => scale(xf(p), kb) };
  });
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
    // 아랫면: 스킨의 아랫면 칸은 위쪽 줄(v=0)이 뒤쪽에 붙는다 (마인크래프트 ModelPart.Cube와 같은 배치).
    // 아래에서 보면 좌우가 거울처럼 뒤집힌 배치라, 바깥 방향(법선)을 반대로 계산하도록 표시한다
    ['bottom', [x0, y0, z0], [w, 0, 0], [0, 0, d], true],
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
  for (const [name, tl, U, V, mirrored] of FACE_DEF(...b.min, ...b.max)) {
    const P0 = camP(b.xf(tl), o), PU = camP(b.xf(add(tl, U)), o), PV = camP(b.xf(add(tl, V)), o);
    const u = sub(PU, P0), v = sub(PV, P0), n = mirrored ? cross(u, v) : cross(v, u);
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
