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

// returns boxes in draw order (back to front)
function buildScene(which, o) {
  const p = poseParams(which, o);
  const slim = o.model === 'slim' || (o.model === 'auto' && skin.slim);
  const aw = slim ? 3 : 4;
  const back = [], front = [];

  if (!o.desk) {
    back.push(...skinBoxes([-4, 0, -2], [0, 12, 2], [0, 16, 4, 12, 4], [0, 32], .25, IDENT, o));
    back.push(...skinBoxes([0, 0, -2], [4, 12, 2], [16, 48, 4, 12, 4], [0, 48], .25, IDENT, o));
  }
  back.push(...skinBoxes([-4, 12, -2], [4, 24, 2], [16, 16, 8, 12, 4], [16, 32], .25, IDENT, o));
  back.push(...skinBoxes([-4, 24, -4], [4, 32, 4], [0, 0, 8, 8, 8], [32, 0], .5,
    makeXf([0, 24, 0], o.headPitch * DEG, 0, p.roll), o));

  if (o.desk) {
    const c = o.deskColor;
    back.push({ min: [-17, 9, 3], max: [17, 14.5, 16], src: solid(c), xf: IDENT });
  }
  if (o.kb) {
    const t = KB_THEMES[o.kbTheme];
    back.push({ min: [-11, 14.5, 5.5], max: [11, 16, 13.5], src: solid(t.frame), xf: IDENT,
      faceTex: { top: { img: kbTexture(o.kbTheme), r: [0, 0, 66, 24] } } });
  }

  // arms: viewer-left = character's right arm
  const armL = skinBoxes([-4 - aw, 12, -2], [-4, 24, 2], [40, 16, aw, 12, 4], [40, 32], .25,
    makeXf([-5, 22, 0], p.vl, 0, p.rzl), o);
  const armR = skinBoxes([4, 12, -2], [4 + aw, 24, 2], [32, 48, aw, 12, 4], [48, 48], .25,
    makeXf([5, 22, 0], p.vr, 0, p.rzr), o);
  const depth = boxes => camP(boxes[0].xf([boxes[0].min[0] + 2, 18, 0]), o)[2];
  const arms = [armL, armR].sort((a, b) => depth(a) - depth(b));
  front.push(...arms[0], ...arms[1]);
  return back.concat(front);
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
const tmp = document.createElement('canvas');
const tctx = tmp.getContext('2d');
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

function drawBox(ctx, b, o, fit) {
  const grow = b.overlay ? 0.35 * SS : 0.6 * SS;
  for (const [name, tl, U, V] of FACE_DEF(...b.min, ...b.max)) {
    const P0 = camP(b.xf(tl), o), PU = camP(b.xf(add(tl, U)), o), PV = camP(b.xf(add(tl, V)), o);
    const u = sub(PU, P0), v = sub(PV, P0), n = cross(v, u);
    if (n[2] <= 1e-7) continue;
    const { img, r } = texRect(b, name);
    const [sx, sy, sw, sh] = r;
    tmp.width = sw; tmp.height = sh;
    tctx.imageSmoothingEnabled = false;
    tctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    if (o.shade) {
      const nl = Math.hypot(...n), dot = Math.max(0, (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / nl);
      tctx.globalCompositeOperation = 'source-atop';
      tctx.fillStyle = `rgba(0,0,0,${(0.36 * (1 - dot)).toFixed(3)})`;
      tctx.fillRect(0, 0, sw, sh);
      tctx.globalCompositeOperation = 'source-over';
    }
    const s = fit.s * SS;
    let Us = [u[0] * s, -u[1] * s], Vs = [v[0] * s, -v[1] * s];
    let O = [(fit.ox + P0[0] * fit.s) * SS, (fit.oy - P0[1] * fit.s) * SS];
    const lu = Math.hypot(...Us) || 1, lv = Math.hypot(...Vs) || 1;
    const fu = (lu + grow) / lu, fv = (lv + grow) / lv;
    O = [O[0] - Us[0] * (fu - 1) / 2 - Vs[0] * (fv - 1) / 2, O[1] - Us[1] * (fu - 1) / 2 - Vs[1] * (fv - 1) / 2];
    Us = [Us[0] * fu, Us[1] * fu]; Vs = [Vs[0] * fv, Vs[1] * fv];
    ctx.setTransform(Us[0] / sw, Us[1] / sw, Vs[0] / sh, Vs[1] / sh, O[0], O[1]);
    ctx.drawImage(tmp, 0, 0);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function renderPose(which, o, fit) {
  const big = document.createElement('canvas'); big.width = W * SS; big.height = H * SS;
  const bctx = big.getContext('2d'); bctx.imageSmoothingEnabled = false;
  for (const b of buildScene(which, o)) drawBox(bctx, b, o, fit);

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
