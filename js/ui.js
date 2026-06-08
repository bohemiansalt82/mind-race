"use strict";
// ============================================================
//  TRACK STORAGE — API with localStorage fallback
//  (API available when running the local server;
//   localStorage used as fallback for GitHub Pages / offline)
// ============================================================
async function loadTracksAPI() {
  try {
    const r = await fetch('/api/tracks', {signal: AbortSignal.timeout(2000)});
    if (!r.ok) throw new Error();
    return await r.json();
  } catch {
    try {
      const arr = JSON.parse(localStorage.getItem('rcTracks') || '[]');
      return arr.map((t, i) => ({ id: i, name: t.name, layout: t.layout ?? t }));
    } catch { return []; }
  }
}

async function saveTrackAPI(name, layout) {
  try {
    const r = await fetch('/api/tracks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, layout }),
      signal: AbortSignal.timeout(3000)
    });
    if (!r.ok) throw new Error();
    return await r.json();
  } catch {
    const arr = JSON.parse(localStorage.getItem('rcTracks') || '[]');
    const idx = arr.findIndex(t => t.name === name);
    const entry = { name, layout };
    if (idx >= 0) arr[idx] = entry; else arr.push(entry);
    localStorage.setItem('rcTracks', JSON.stringify(arr));
    return entry;
  }
}

async function deleteTrackAPI(id) {
  try {
    const r = await fetch(`/api/tracks/${id}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(2000)
    });
    if (!r.ok) throw new Error();
  } catch {
    const arr = JSON.parse(localStorage.getItem('rcTracks') || '[]');
    arr.splice(+id, 1);
    localStorage.setItem('rcTracks', JSON.stringify(arr));
  }
}

function escHtml(s){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

async function renderSavedTracks(){
  const wrap = el('savedTracks'); if (!wrap) return;
  const tracks = await loadTracksAPI();
  if (!tracks.length){
    wrap.innerHTML = '<span style="color:#5f7a98;font-size:12px">저장한 트랙이 없습니다 — 에디터에서 만들어 저장하세요</span>';
    return;
  }
  wrap.innerHTML = '';
  tracks.forEach(t => {
    const row = document.createElement('div'); row.className = 'savedRow';
    row.innerHTML =
      '<span class="sName">'+escHtml(t.name)+'</span>'+
      '<button class="sRace" data-id="'+t.id+'">레이스</button>'+
      '<button class="sEdit" data-id="'+t.id+'">편집</button>'+
      '<button class="sDel"  data-id="'+t.id+'">✕</button>';
    wrap.appendChild(row);
  });
  wrap.querySelectorAll('.sRace').forEach(b => b.onclick = () => {
    const t = tracks.find(x => String(x.id) === b.dataset.id);
    if (!t) return;
    customLayout = JSON.parse(JSON.stringify(t.layout));
    trackName = 'custom'; startGame();
  });
  wrap.querySelectorAll('.sEdit').forEach(b => b.onclick = () => {
    const t = tracks.find(x => String(x.id) === b.dataset.id);
    if (!t) return;
    openEditor(t.layout, t.name);
  });
  wrap.querySelectorAll('.sDel').forEach(b => b.onclick = async () => {
    await deleteTrackAPI(b.dataset.id);
    renderSavedTracks();
  });
}

// ============================================================
//  CALIBRATION STORAGE — API with localStorage fallback
// ============================================================
async function saveCalibrationAPI(data) {
  localStorage.setItem('vrcCalibration', JSON.stringify(data)); // always cache locally
  try {
    await fetch('/api/calibration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(3000)
    });
  } catch {}
}

// ============================================================
//  UI WIRING
// ============================================================
function wireUI(){
  document.querySelectorAll('.tcard').forEach(c => {
    c.addEventListener('click', () => { trackName = c.dataset.track; startGame(); });
  });
  el('setupBtn').addEventListener('click', () => {
    const s = el('setup'); s.style.display = s.style.display === 'block' ? 'none' : 'block';
  });
  el('homeBtn').addEventListener('click', goHome);
  el('sSteer').addEventListener('input', e => {
    setup.maxSteer = +e.target.value*Math.PI/180; el('vSteer').textContent = e.target.value+'°'; });
  el('sGrip').addEventListener('input', e => {
    setup.rearGrip = +e.target.value/100; el('vGrip').textContent = e.target.value+'%'; });
  el('sPow').addEventListener('input', e => {
    setup.power = +e.target.value/100; el('vPow').textContent = e.target.value+'%'; });
  el('sLaunch').addEventListener('input', e => {
    setup.launchSmooth = +e.target.value/100; el('vLaunch').textContent = e.target.value+'%'; });
  el('sCamH').addEventListener('input', e => {
    setup.camHeight = +e.target.value/100; el('vCamH').textContent = e.target.value+'%'; });
  el('sSus').addEventListener('input', e => {
    setup.susStiff = +e.target.value/100; el('vSus').textContent = e.target.value+'%'; });
  el('drive').querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      setup.drive = b.dataset.d;
      el('drive').querySelectorAll('button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
    });
  });
  el('camseg').querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => { setup.camera = b.dataset.c; syncCamSeg(); });
  });
}

function syncCamSeg(){
  el('camseg').querySelectorAll('button').forEach(x => {
    x.classList.toggle('on', x.dataset.c === setup.camera);
  });
}

function goHome(){
  started = false; raceLock = false;
  el('cd').style.display = 'none';
  el('setup').style.display = 'none';
  el('intro').style.display = 'flex';
  renderSavedTracks();
}

function startGame(){
  buildTrack(trackName);
  freeLook.on = false; freeLook.drag = false;
  el('intro').style.display = 'none';
  const cd = el('cd'); cd.style.display = 'flex';
  const span = cd.querySelector('span');
  let n = 3;
  span.textContent = n; span.style.color = '#ff6a6a';
  started = true; raceLock = true;
  const iv = setInterval(() => {
    n--;
    if (n <= 0){
      span.textContent = 'GO!'; span.style.color = '#5cff8f';
      raceLock = false; timing.reset();
      setTimeout(() => { cd.style.display = 'none'; }, 650);
      clearInterval(iv);
    } else {
      span.textContent = n; span.style.color = n === 1 ? '#ffd13b' : '#ff6a6a';
    }
  }, 1000);
}
