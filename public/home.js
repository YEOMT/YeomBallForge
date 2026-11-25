import {fillIcons} from './icons.js';
import {unlockAudio} from './arena.js';
import {BALL_CATALOG, PATHS, getBall} from './packages/content/balls.js';
import {ballCard, portrait, htmlEsc} from './ball-ui.js';
const home = document.querySelector('#home'), mount = document.querySelector('#session');
const dialog = document.querySelector('#overlay'), body = document.querySelector('#dialog-content');
const queryCode = new URLSearchParams(location.search).get('code') || '';
const previewOnly = window.BALLFORGE_CONFIG?.requiresBackend && !window.BALLFORGE_CONFIG?.wsUrl;
let practiceCleanup, practiceEpoch = 0;
function preferences() {
  try {return JSON.parse(localStorage.getItem('ballforge-prefs')) || {};} catch { return {}; }
}
function clearPractice() {
  practiceEpoch++; practiceCleanup?.(); practiceCleanup = null;
}
function overlay(title, content, wide=false) {
  clearPractice();
  document.querySelector('#dialog-title').textContent=title;
  body.innerHTML=content;
  dialog.classList.toggle('wide',wide);
  if(!dialog.open) dialog.showModal();
}
function returnHome() {
  mount.hidden=true; home.hidden=false; mount.replaceChildren(); window.scrollTo(0,0);
  refreshSaved();
}
async function connect(args) {
  const settings=window.BALLFORGE_CONFIG || {};
  if(settings.requiresBackend && !settings.wsUrl) throw new Error('공개 수업 서버 연결을 기다리고 있습니다. 선생님이 실행한 교실 서버 주소로 접속해 주세요.');
  const {startSession}=await import('./session.js');
  await startSession({...args,mount,onExit:returnHome,wsUrl:settings.wsUrl});
  dialog.close(); home.hidden=true; mount.hidden=false; window.scrollTo(0,0);
}
function entry(mode) {
  const student=mode==='join';
  if(previewOnly){
    overlay(student?'수업에 참가하려면':'수업 방을 열려면','<div class="guide"><p>이 페이지의 실시간 수업 서버 연결이 아직 설정되지 않았습니다. '+(student?'선생님이 공유한 수업 서버의 QR 또는 주소를 열어 주세요.':'수업 서버를 연결하면 방 코드로 최대 30명이 함께 참가할 수 있습니다.')+'</p><p>지금은 이 기기에서 퀴즈, 강화, 공 선택과 CPU 대전을 모두 연습할 수 있습니다.</p><button id="try-practice" class="primary">혼자 연습하기</button><a href="https://github.com/YEOMT/YeomBallForge" target="_blank" rel="noreferrer">GitHub에서 게임 소스 보기</a></div>');
    document.querySelector('#try-practice').onclick=practice;return;
  }
  overlay(student?'학생으로 참가':'교사 방 만들기','<form class="entry-form">'+(student?
    '<label>방 코드<input name="code" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="off" placeholder="000000" required></label><label>닉네임<input name="name" maxlength="16" autocomplete="off" placeholder="아레나에서 사용할 이름" required></label>':
    '<label>교사 비밀번호<input name="password" type="password" autocomplete="current-password" placeholder="교사 비밀번호 입력" required></label><p>방을 만든 뒤 학생에게 QR 또는 6자리 방 코드를 공유하세요.</p>')+
    '<p class="error" role="alert"></p><button class="primary" type="submit">'+(student?'아레나 참가':'새 방 만들기')+'</button></form>');
  const form=body.querySelector('form');
  if(student && /^\d{6}$/.test(queryCode)) {form.elements.code.value=queryCode; form.elements.name.focus();}
  form.onsubmit=async event=>{
    event.preventDefault(); const submit=form.querySelector('[type=submit]'); submit.disabled=true;
    body.querySelector('.error').textContent='';
    try {await connect({mode,...Object.fromEntries(new FormData(form))});}
    catch(error){form.querySelector('.error').textContent=error.message;}
    finally{submit.disabled=false;}
  };
}
function guide() {
  overlay('플레이 가이드','<div class="guide"><ol><li><b>방에 모이기</b><p>교사는 문제은행과 경기 모드를 고르고 방을 엽니다. 학생은 QR 또는 6자리 코드로 참가합니다.</p></li><li><b>기본 10장 + 정답마다 2장</b><p>각 문항에는 한 번만 응답합니다. 정답이 많을수록 강화와 유지권에 쓸 수 있는 강화권이 늘어납니다.</p></li><li><b>T20에서 T1까지 강화</b><p>시도당 1장, 유지권은 2장입니다. T18부터 승급할 때마다 서로 다른 공을 고릅니다. T10부터 성공률이 낮아집니다.</p></li><li><b>T10에서 성장 경로 선택</b><p>화염·물결·번개·대지·자연·검술·공간·소환 중 하나를 선택합니다. 다음 티어마다 해당 경로 또는 공용 공을 선택하며, 공용 공을 골라도 경로는 유지됩니다. 첫 T10에 1% 확률로 히든 공을 발견합니다.</p></li><li><b>내 공으로 자동 전투</b><p>토너먼트에서는 학생 기기에 자신의 경기가 우선 표시되고, 교사는 진행 중인 경기 하나를 골라 중계합니다. 럼블 전장은 교사 화면에 표시되며, 학생은 자신의 HP·생존 여부·최종 등수·탈락 상대를 확인합니다.</p></li></ol><button id="practice" class="primary">혼자 연습하기</button></div>');
  document.querySelector('#practice').onclick=()=>practice();
}
async function practice() {
  overlay('혼자 연습하기','<div class="practice-mount"><p class="muted">연습실을 열고 있습니다.</p></div>',true);
  const epoch = practiceEpoch, target = body.querySelector('.practice-mount');
  try{
    const {startPractice}=await import('./practice.js');
    if(!dialog.open || !target.isConnected || epoch !== practiceEpoch)return;
    practiceCleanup=startPractice(target,{preferences});
  }catch(error){if(target.isConnected)target.innerHTML='<p class="error">연습실을 열 수 없습니다. '+htmlEsc(error.message)+'</p>';}
}
function codex() {
  overlay('볼 도감','<p class="muted">T20 → T1 · ' + BALL_CATALOG.length + '종의 티어별 볼 · 8가지 성장 경로. 같은 기믹도 티어와 전투 수치가 달라집니다.</p><div class="codex-controls"><label>이름·능력 검색<input type="search" data-codex-search placeholder="검기, 빙결, 그림자…"></label><label>티어<select data-codex-tier><option value="all">모든 티어</option>'+Array.from({length:20},(_,i)=>'<option value="'+(20-i)+'">T'+(20-i)+'</option>').join('')+'</select></label><label>성장 경로<select data-codex-path><option value="all">모든 경로</option><option value="common">공용</option>'+Object.values(PATHS).map(path=>'<option value="'+path.id+'">'+path.name+'</option>').join('')+'<option value="hidden">히든</option></select></label></div><p class="codex-count muted" role="status"></p><div class="ball-catalog-grid"></div><button class="secondary codex-more" hidden>더 보기</button>',true);
  const grid=body.querySelector('.ball-catalog-grid'), search=body.querySelector('[data-codex-search]'), tier=body.querySelector('[data-codex-tier]'), path=body.querySelector('[data-codex-path]'), more=body.querySelector('.codex-more');
  let limit=24;
  function render(reset=false){
    if(reset)limit=24;
    const query=search.value.trim().toLocaleLowerCase();
    const found=BALL_CATALOG.filter(ball=>(tier.value==='all'||ball.tier===Number(tier.value))&&(path.value==='all'||(path.value==='common'?ball.common:path.value==='hidden'?ball.hidden:ball.path===path.value))&&(!query||[ball.name,ball.description,ball.trigger,PATHS[ball.path]?.name,ball.motif].join(' ').toLocaleLowerCase().includes(query)));
    grid.innerHTML=found.slice(0,limit).map(ball=>ballCard(ball)).join('')||'<p class="muted">검색 조건에 맞는 공이 없습니다.</p>';
    body.querySelector('.codex-count').textContent=found.length+'종 중 '+Math.min(found.length,limit)+'종 표시';
    more.hidden=found.length<=limit;
  }
  search.oninput=()=>render(true);tier.onchange=()=>render(true);path.onchange=()=>render(true);more.onclick=()=>{limit+=24;render();};
  render();
}
function settings(){
  const p={sound:false,shake:true,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,...preferences()};
  overlay('환경 설정','<div class="prefs"></div>');
  const wrapper=body.querySelector('.prefs');
  for(const [key,label] of Object.entries({sound:'효과음 재생',shake:'강한 타격 시 화면 흔들림',reduced:'장식 효과 줄이기'})){
    const item=document.createElement('label'), input=document.createElement('input');input.type='checkbox';input.checked=p[key];item.append(input,label);wrapper.append(item);
    input.onchange=()=>{p[key]=input.checked;if(key==='sound'&&input.checked)unlockAudio();try{localStorage.setItem('ballforge-prefs',JSON.stringify(p));}catch{}window.dispatchEvent(new Event('forge-settings'));};
  }
}
window.openForgeCodex=codex; window.openForgeSettings=settings; window.openForgePractice=practice;
fillIcons(); const actions={join:()=>entry('join'),create:()=>entry('create'),guide,codex,settings,practice};
const connectionStatus=document.querySelector('[data-connection-status]');
if(connectionStatus)connectionStatus.textContent=previewOnly?'혼자 연습은 바로 플레이 · 실시간 수업은 수업 서버 연결 후 이용':'교사 방 만들기 → 방 코드로 함께 참가';
const rosterPreview=document.querySelector('[data-roster-preview]');
if(rosterPreview)rosterPreview.innerHTML=['fire-10-crimson','blade-10-blade','space-10-portal','summon-10-summoner'].map(id=>getBall(id)).filter(Boolean).map(ball=>'<button class="home-ball" data-open="codex">'+portrait(ball)+'<span>'+htmlEsc(ball.name)+'</span><small>'+htmlEsc(PATHS[ball.path].name)+'</small></button>').join('');
for(const b of document.querySelectorAll('[data-open]')) b.onclick=()=>actions[b.dataset.open]();
document.querySelector('#dismiss').onclick=()=>dialog.close();
document.querySelector('#nav-lobby').onclick=()=>window.scrollTo(0,0);
dialog.addEventListener('close',clearPractice);
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
async function refreshSaved(auto=false) {
  const saved=(await import('./session-network.js')).getSavedSession();
  const box=document.querySelector('#restore'), btn=document.querySelector('#resume'), msg=document.querySelector('#restore-msg');
  box.hidden=!saved; if(!saved)return false;
  btn.textContent='방 '+saved.code+' 다시 연결';btn.onclick=async()=>{btn.disabled=true;try{await connect({mode:'resume'});}catch(e){msg.textContent=e.message;}finally{btn.disabled=false;}};
  if(auto && (!queryCode||queryCode===saved.code))await btn.onclick();
  return !mount.hidden;
}
refreshSaved(true).then(resumed=>{if(!resumed&&/^\d{6}$/.test(queryCode))entry('join');}).catch(()=>{if(/^\d{6}$/.test(queryCode))entry('join');});
