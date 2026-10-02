/**
 * 화면 동작: 스킨 불러오기 → 옵션 읽기 → PetRenderer로 세 모습 렌더 → 미리보기·내려받기.
 * 그리는 일은 render.js(PetRenderer)가 한다.
 */
(() => {
const { W, H, normalizeSkin, renderPoses } = window.PetRenderer;
const $ = id => document.getElementById(id);

const POSES = [
  { id: 'idle',  label: '기본',   file: 'default.png',    note: '두 손 모두 키보드 위' },
  { id: 'left',  label: '왼손',   file: 'left_hand.png',  note: '왼손을 든 모습' },
  { id: 'right', label: '오른손', file: 'right_hand.png', note: '오른손을 든 모습' },
];
const poseLabel = id => POSES.find(p => p.id === id).label;

/* ---------- 상태 메시지 (기호 + 글자, 색만으로 전달하지 않는다) ---------- */
const TONE_MARK = { success: '✓ ', error: '✕ ', loading: '' };
function setStatus(msg, tone = 'loading') {
  const el = $('status');
  el.dataset.tone = tone;
  el.textContent = msg ? TONE_MARK[tone] + msg : '';
}
function setNameError(msg) {
  const el = $('name-error'), input = $('name-input');
  el.hidden = !msg;
  el.textContent = msg ? '⚠ ' + msg : '';
  if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
}

/* ---------- 스킨 받아오기 ----------
 * 공식 API(api.mojang.com)는 브라우저 요청(CORS)을 막아서, 스킨을 이미지로 내주는 공개 서비스를 쓴다:
 *   1) minotar.net — 없는 아이디가 404면 "찾을 수 없어요"를 알려줄 수 있다
 *   2) mc-heads.net — minotar에 닿지 못할 때만
 * 보내는 것은 아이디뿐이다. 받은 PNG는 파일 불러오기와 같은 검사·변환을 거친다.
 */
const isValidMcName = name => /^[A-Za-z0-9_]{3,16}$/.test(name);
const SKIN_SOURCES = [
  { url: name => `https://minotar.net/skin/${encodeURIComponent(name)}`, notFoundIs404: true },
  { url: name => `https://mc-heads.net/skin/${encodeURIComponent(name)}`, notFoundIs404: false },
];
const MAX_BYTES = 256 * 1024; // 스킨 PNG는 아주 작다. 이보다 크면 이상한 응답으로 본다

async function fetchSkinByName(name) {
  for (const source of SKIN_SOURCES) {
    let res;
    try {
      res = await fetch(source.url(name), { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
    } catch {
      continue; // 이 서비스에 닿지 못함 → 다음 서비스
    }
    if (res.status === 404 && source.notFoundIs404) return { ok: false, message: `"${name}" 아이디를 찾을 수 없어요. 철자를 확인해 주세요.` };
    if (!res.ok) continue;
    const blob = await res.blob();
    if (blob.size === 0 || blob.size > MAX_BYTES) continue;
    return { ok: true, blob };
  }
  return { ok: false, message: '스킨을 받아오지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요.' };
}

function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 읽을 수 없어요. PNG 파일인지 확인해 주세요.')); };
    img.src = url;
  });
}

/* ---------- 스킨 적용 ---------- */
let skin = null;     // { canvas, k, slim, legacy, name }
let rendered = null; // { idle, left, right } → canvas

async function useSkinBlob(blob, name) {
  const img = await blobToImage(blob);
  const s = normalizeSkin(img); // 크기가 틀리면 여기서 throw
  skin = { ...s, name };

  const thumb = $('skin-thumb').getContext('2d');
  thumb.clearRect(0, 0, 64, 64);
  thumb.imageSmoothingEnabled = false;
  thumb.drawImage(s.canvas, 0, 0, 64, 64);
  $('skin-name').textContent = name;
  $('skin-model').textContent = `감지된 팔 두께: ${s.slim ? '슬림 (Alex)' : '클래식 (Steve)'}${s.legacy ? ' · 예전 64×32 스킨' : ''}`;
  $('skin-info').hidden = false;
  $('empty-state').hidden = true;
  $('zip-btn').disabled = false;
  $('zip-help').textContent = 'default.png · left_hand.png · right_hand.png';
  for (const b of document.querySelectorAll('[data-download]')) b.disabled = false;
  renderNow();
}

async function loadByName(raw) {
  const name = raw.trim();
  if (!isValidMcName(name)) {
    setNameError('아이디는 영문·숫자·밑줄(_)로 3~16자예요.');
    $('name-input').focus();
    return;
  }
  setNameError('');
  const btn = $('load-btn');
  btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.textContent = '불러오는 중';
  setStatus(`"${name}" 스킨을 불러오는 중…`, 'loading');
  try {
    const r = await fetchSkinByName(name);
    if (!r.ok) { setNameError(r.message); setStatus(''); return; }
    await useSkinBlob(r.blob, name);
    setStatus(`"${name}" 스킨을 불러왔어요.`, 'success');
  } catch (e) {
    setStatus(e.message, 'error');
  } finally {
    btn.disabled = false; btn.removeAttribute('aria-busy'); btn.textContent = '불러오기';
  }
}

async function loadFile(file) {
  if (!file) return;
  if (file.type && file.type !== 'image/png') { setStatus('PNG 파일만 쓸 수 있어요.', 'error'); return; }
  if (file.size > MAX_BYTES) { setStatus('파일이 너무 커요. 마인크래프트 스킨 PNG(64×64)를 올려 주세요.', 'error'); return; }
  setNameError('');
  try {
    const name = file.name.replace(/\.png$/i, '') || '업로드한 스킨';
    await useSkinBlob(file, name);
    setStatus(`"${name}" 파일을 불러왔어요.`, 'success');
  } catch (e) {
    setStatus(e.message, 'error');
  }
}

/* ---------- 옵션 ---------- */
const RANGE_UNITS = { raise: '°', spread: '°', headPitch: '°', yaw: '°', pitch: '°', outline: 'px', scale: '%' };
const CHECKS = ['overlay', 'headTilt', 'swap', 'shade', 'desk', 'kb'];
const VALUES = ['model', 'kbTheme', 'valign', 'deskColor', 'outlineColor'];

function readOptions() {
  const o = {};
  for (const [id, unit] of Object.entries(RANGE_UNITS)) {
    o[id] = Number($(id).value);
    $(id + '-out').textContent = $(id).value + unit;
  }
  for (const id of CHECKS) o[id] = $(id).checked;
  for (const id of VALUES) o[id] = $(id).value;
  $('kbTheme').disabled = !o.kb;
  $('deskColor').disabled = !o.desk;
  return o;
}

/* ---------- 결과 목록 (DOM으로 만든다, innerHTML 안 씀) ---------- */
const resultCanvases = {};
function buildResults() {
  const list = $('results');
  for (const p of POSES) {
    const li = document.createElement('li');
    li.className = 'result';

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `${p.label} 이미지: ${p.note}`);
    resultCanvases[p.id] = canvas;

    const name = document.createElement('p');
    name.className = 'result-name';
    name.append(p.label + ' ');
    const note = document.createElement('span');
    note.textContent = p.note;
    name.append(note);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-secondary';
    btn.dataset.download = p.id;
    btn.disabled = true;
    btn.textContent = `${p.label} 받기`;
    btn.setAttribute('aria-label', `${p.label} 이미지 ${p.file} 내려받기`);

    li.append(canvas, name, btn);
    list.append(li);
  }
}

/* ---------- 렌더 ---------- */
let raf = 0;
function scheduleRender() {
  readOptions();
  if (!skin) return;
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(renderNow);
}
function renderNow() {
  const o = readOptions();
  if (!skin) return;
  rendered = renderPoses(skin, o);
  for (const p of POSES) {
    const ctx = resultCanvases[p.id].getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(rendered[p.id], 0, 0);
  }
  showPose(shownPose);
}

/* ---------- 미리보기 ---------- */
const preview = $('preview');
const pctx = preview.getContext('2d');
let shownPose = 'idle';
function showPose(id) {
  shownPose = id;
  pctx.clearRect(0, 0, W, H);
  if (rendered) pctx.drawImage(rendered[id], 0, 0);
  preview.setAttribute('aria-label', `Typing Pet 미리보기: ${poseLabel(id)}`);
}
function selectedPose() { return document.querySelector('input[name="pose"]:checked').value; }

// Typing Pet처럼: 키를 누를 때마다 왼손·오른손을 번갈아 들고, 잠시 멈추면 고른 모습으로 돌아온다
let nextHand = 'left', restTimer = 0, bounceTimer = 0;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
function tap() {
  if (!rendered) return;
  showPose(nextHand);
  nextHand = nextHand === 'left' ? 'right' : 'left';
  if ($('bounce').checked && !reduceMotion.matches) {
    preview.classList.add('is-bounce');
    clearTimeout(bounceTimer);
    bounceTimer = setTimeout(() => preview.classList.remove('is-bounce'), 70);
  }
  clearTimeout(restTimer);
  restTimer = setTimeout(() => showPose(selectedPose()), 350);
}
const IGNORED_KEYS = new Set(['Tab', 'Enter', ' ', 'Escape', 'Shift', 'Control', 'Alt', 'Meta',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);
document.addEventListener('keydown', e => {
  // 입력 중이거나 화면 조작용 키는 무시한다 (키보드 사용자의 탐색을 방해하지 않게)
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || IGNORED_KEYS.has(e.key)) return;
  if (e.target.closest('input, select, textarea')) return;
  tap();
});

let autoTimer = 0;
$('autoplay').addEventListener('change', e => {
  clearInterval(autoTimer);
  if (e.target.checked) autoTimer = setInterval(() => { if (Math.random() < 0.8) tap(); }, 140);
});
for (const r of document.querySelectorAll('input[name="pose"]')) r.addEventListener('change', () => showPose(r.value));

/* ---------- 내려받기 ---------- */
const toPngBytes = canvas => new Promise(resolve =>
  canvas.toBlob(b => b.arrayBuffer().then(buf => resolve(new Uint8Array(buf))), 'image/png'));

function saveBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const safeName = () => (skin?.name || 'typingpet').replace(/[^\w-]/g, '_');

$('results').addEventListener('click', async e => {
  const btn = e.target.closest('[data-download]');
  if (!btn || !rendered) return;
  const p = POSES.find(x => x.id === btn.dataset.download);
  const bytes = await toPngBytes(rendered[p.id]);
  saveBlob(new Blob([bytes], { type: 'image/png' }), `${safeName()}_${p.file}`);
  setStatus(`${p.label} 이미지를 내려받았어요.`, 'success');
});

$('zip-btn').addEventListener('click', async () => {
  if (!rendered) return;
  const btn = $('zip-btn');
  btn.disabled = true; btn.setAttribute('aria-busy', 'true');
  try {
    const files = [];
    for (const p of POSES) files.push({ name: p.file, data: await toPngBytes(rendered[p.id]) });
    saveBlob(makeZip(files), `${safeName()}_typingpet.zip`);
    setStatus('3장을 ZIP으로 내려받았어요.', 'success');
  } finally {
    btn.disabled = false; btn.removeAttribute('aria-busy');
  }
});

/* 압축 없이 묶기만 하는 최소 ZIP (PNG는 이미 압축돼 있어서 충분하다) */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = ~0;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return ~c >>> 0;
}
function makeZip(files) {
  const enc = new TextEncoder();
  const local = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
    h.setUint16(12, 0x21, true); // 1980-01-01
    h.setUint32(14, crc, true); h.setUint32(18, size, true); h.setUint32(22, size, true);
    h.setUint16(26, name.length, true);
    local.push(h, name, f.data);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(14, 0x21, true);
    c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true);
    c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
    central.push(c, name);
    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((s, p) => s + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...local, ...central, end], { type: 'application/zip' });
}

/* ---------- 이벤트 연결 ---------- */
$('name-form').addEventListener('submit', e => { e.preventDefault(); loadByName($('name-input').value); });
$('name-input').addEventListener('input', () => setNameError(''));
$('example-btn').addEventListener('click', () => { $('name-input').value = 'MHF_Steve'; loadByName('MHF_Steve'); });
$('file-input').addEventListener('change', e => { loadFile(e.target.files[0]); e.target.value = ''; });

const dropzone = $('dropzone');
let dragDepth = 0;
document.addEventListener('dragenter', e => { e.preventDefault(); dragDepth++; dropzone.classList.add('is-over'); });
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; dropzone.classList.remove('is-over'); } });
document.addEventListener('drop', e => {
  e.preventDefault(); dragDepth = 0; dropzone.classList.remove('is-over');
  loadFile(e.dataTransfer.files[0]);
});

const optionsForm = $('options');
optionsForm.addEventListener('input', scheduleRender);
optionsForm.addEventListener('change', scheduleRender);
optionsForm.addEventListener('reset', () => setTimeout(scheduleRender)); // reset 후 값이 바뀐 다음 다시 그린다

/* ---------- 시작 ---------- */
buildResults();
readOptions();
const initialName = new URLSearchParams(location.search).get('name');
if (initialName) { $('name-input').value = initialName; loadByName(initialName); }
})();
