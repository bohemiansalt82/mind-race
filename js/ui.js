"use strict";
// ============================================================
//  TRACK STORAGE (localStorage)
// ============================================================
function loadTracks(){ try{ return JSON.parse(localStorage.getItem('rcTracks')||'[]'); }catch(e){ return []; } }
function saveTracks(a){ try{ localStorage.setItem('rcTracks', JSON.stringify(a)); }catch(e){} }
function escHtml(s){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function renderSavedTracks(){
  const wrap=el('savedTracks'); if(!wrap) return; const arr=loadTracks();
  if(!arr.length){ wrap.innerHTML='<span style="color:#5f7a98;font-size:12px">저장한 트랙이 없습니다 — 에디터에서 만들어 저장하세요</span>'; return; }
  wrap.innerHTML='';
  arr.forEach((t,i)=>{ const row=document.createElement('div'); row.className='savedRow';
    row.innerHTML='<span class="sName">'+escHtml(t.name)+'</span>'+
      '<button class="sRace" data-i="'+i+'">레이스</button>'+
      '<button class="sEdit" data-i="'+i+'">편집</button>'+
      '<button class="sDel" data-i="'+i+'">✕</button>';
    wrap.appendChild(row); });
  wrap.querySelectorAll('.sRace').forEach(b=>b.onclick=()=>{ const t=loadTracks()[+b.dataset.i]; if(!t)return; customLayout=JSON.parse(JSON.stringify(t.layout)); trackName='custom'; startGame(); });
  wrap.querySelectorAll('.sEdit').forEach(b=>b.onclick=()=>{ const t=loadTracks()[+b.dataset.i]; if(!t)return; openEditor(t.layout, t.name); });
  wrap.querySelectorAll('.sDel').forEach(b=>b.onclick=()=>{ const a=loadTracks(); a.splice(+b.dataset.i,1); saveTracks(a); renderSavedTracks(); });
}

// ============================================================
//  UI WIRING
// ============================================================
function wireUI(){
  // start cards
  document.querySelectorAll('.tcard').forEach(c=>{
    c.addEventListener('click', ()=>{
      trackName = c.dataset.track;
      startGame();
    });
  });
  // setup toggle
  el('setupBtn').addEventListener('click', ()=>{
    const s=el('setup'); s.style.display = s.style.display==='block'?'none':'block';
  });
  // home — back to the main menu
  el('homeBtn').addEventListener('click', goHome);
  // sliders
  el('sSteer').addEventListener('input', e=>{
    setup.maxSteer = +e.target.value*Math.PI/180; el('vSteer').textContent=e.target.value+'°'; });
  el('sGrip').addEventListener('input', e=>{
    setup.rearGrip = +e.target.value/100; el('vGrip').textContent=e.target.value+'%'; });
  el('sPow').addEventListener('input', e=>{
    setup.power = +e.target.value/100; el('vPow').textContent=e.target.value+'%'; });
  el('sLaunch').addEventListener('input', e=>{
    setup.launchSmooth = +e.target.value/100; el('vLaunch').textContent=e.target.value+'%'; });
  el('sCamH').addEventListener('input', e=>{
    setup.camHeight = +e.target.value/100; el('vCamH').textContent=e.target.value+'%'; });
  el('sSus').addEventListener('input', e=>{
    setup.susStiff = +e.target.value/100; el('vSus').textContent=e.target.value+'%'; });
  // drive segment buttons
  el('drive').querySelectorAll('button').forEach(b=>{
    b.addEventListener('click', ()=>{
      setup.drive=b.dataset.d;
      el('drive').querySelectorAll('button').forEach(x=>x.classList.remove('on'));
      b.classList.add('on');
    });
  });
  el('camseg').querySelectorAll('button').forEach(b=>{
    b.addEventListener('click', ()=>{ setup.camera=b.dataset.c; syncCamSeg(); });
  });
}

function syncCamSeg(){
  el('camseg').querySelectorAll('button').forEach(x=>{
    x.classList.toggle('on', x.dataset.c===setup.camera);
  });
}

function goHome(){
  started=false; raceLock=false;
  el('cd').style.display='none';
  el('setup').style.display='none';
  el('intro').style.display='flex';
  renderSavedTracks();
}

function startGame(){
  buildTrack(trackName);
  freeLook.on=false; freeLook.drag=false;
  el('intro').style.display='none';
  const cd=el('cd'); cd.style.display='flex';
  const span=cd.querySelector('span');
  let n=3;
  span.textContent=n; span.style.color='#ff6a6a';
  started=true;
  raceLock=true;
  const iv=setInterval(()=>{
    n--;
    if (n<=0){
      span.textContent='GO!'; span.style.color='#5cff8f';
      raceLock=false;
      timing.reset();
      setTimeout(()=>{cd.style.display='none';},650);
      clearInterval(iv);
    } else {
      span.textContent=n; span.style.color = n===1 ? '#ffd13b' : '#ff6a6a';
    }
  },1000);
}
