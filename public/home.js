import {fillIcons} from './icons.js';
import {CLASSES, ELEMENTS} from './packages/content/classes.js';
import {drawEmblem, ArenaView, unlockAudio} from './arena.js';
const home = document.querySelector('#home'), mount = document.querySelector('#session');
const dialog = document.querySelector('#overlay'), body = document.querySelector('#dialog-content');
const queryCode = new URLSearchParams(location.search).get('code') || '';
const previewOnly = window.BALLFORGE_CONFIG?.requiresBackend && !window.BALLFORGE_CONFIG?.wsUrl;
let practiceFrame = 0, practiceView;
function preferences() {
  try {return JSON.parse(localStorage.getItem('ballforge-prefs')) || {};} catch { return {}; }
}
function clearPractice() {
  cancelAnimationFrame(practiceFrame); practiceView?.destroy(); practiceView = null;
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
    overlay(student?'수업에 참가하려면':'수업 방을 열려면','<div class="guide"><p>'+(student?'선생님이 공유한 교실 서버의 QR 또는 주소를 열어 주세요.':'교실 PC에서 게임 서버를 실행한 뒤 그 주소에서 방을 열어 주세요.')+' 공개 아레나에서는 지금 연습 경기를 관전할 수 있습니다.</p><button id="try-practice" class="primary">연습 경기 관전</button><a href="https://github.com/YEOMT/YeomBallForge/pulls" target="_blank" rel="noreferrer">GitHub에서 게임 소스 보기</a></div>');
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
  overlay('플레이 가이드','<div class="guide"><ol><li><b>방에 모이기</b><p>교사는 방을 열고 문제은행과 모드를 고릅니다. 학생은 QR을 스캔하거나 방 코드를 입력합니다.</p></li><li><b>퀴즈로 강화권 획득</b><p>모두 기본 8장으로 시작하며, 정답 1개마다 1장을 더 받습니다. 각 문항에는 한 번만 응답할 수 있습니다.</p></li><li><b>공 강화와 전직</b><p>강화 1회에 1장, 유지권 구매에는 2장이 듭니다. +10에서 속성과 클래스를 선택하고, 원하는 단계에서 출전을 확정하세요.</p></li><li><b>경기 관전</b><p>확정한 공은 자동으로 싸웁니다. 내 공을 따라가거나 다른 경기를 선택해 관전하세요.</p></li></ol><button id="practice" class="secondary">연습 경기 관전</button></div>');
  document.querySelector('#practice').onclick=()=>practice();
}
async function practice() {
  overlay('연습 경기 관전','<p class="muted">이 기기에서 진행하는 홍련돌격구와 거암철퇴구의 연습 경기입니다.</p><canvas class="practice-arena" aria-label="화염과 대지의 자동 결투"></canvas><p class="practice-status" role="status"></p><button id="practice-restart" class="secondary">다시 대결</button>',true);
  const canvas=body.querySelector('canvas'), status=body.querySelector('.practice-status');
  try{
    const {createArena,stepArena,arenaSnapshot}=await import('./packages/sim/arena.js');
    if(!dialog.open || !canvas.isConnected)return;
    const a=createArena([{id:'fire',name:'홍련',level:15,element:'fire',classId:'crimson'},{id:'earth',name:'거암',level:15,element:'earth',classId:'mace'}],{seed:Math.floor(Math.random()*2**31)});
    const opts=preferences(); if(opts.sound) unlockAudio();
    practiceView=new ArenaView(canvas,opts);
    let last=performance.now(), debt=0, lastSnapshot=-20;
    const loop=now=>{
      debt+=Math.min(100,now-last);last=now;
      while(debt>=1000/60 && !a.done){stepArena(a);debt-=1000/60;}
      if(a.tick-lastSnapshot>=4 || a.done){practiceView.update(arenaSnapshot(a));lastSnapshot=a.tick;}
      if(a.done){status.textContent=a.results.filter(row=>row.rank===1).map(row=>row.name).join(' · ')+' 승리 · '+a.reason;}
      else practiceFrame=requestAnimationFrame(loop);
    };
    practiceFrame=requestAnimationFrame(loop);
  }catch(error){status.textContent='연습 경기를 열 수 없습니다. '+error.message;}
  const restart=body.querySelector('#practice-restart'); if(restart)restart.onclick=practice;
}
function codex() {
  overlay('볼 도감','<p class="muted">+10에서 일반 전직을 선택합니다. 첫 +10에서 1% 확률로 히든 클래스 한 종을 제안받습니다.</p><div class="filters" aria-label="속성 필터"></div><div class="class-list"></div>',true);
  const filters=body.querySelector('.filters'), grid=body.querySelector('.class-list');
  const tabs={all:'전체',fire:'화염',water:'물결',lightning:'번개',earth:'대지',nature:'자연',hidden:'히든'};
  for(const [key,name] of Object.entries(tabs)){
    const b=document.createElement('button');b.textContent=name;b.dataset.key=key;filters.append(b);b.onclick=()=>select(key);
  }
  function select(key){
    for(const b of filters.children)b.setAttribute('aria-pressed',String(b.dataset.key===key));
    grid.innerHTML='';
    for(const cl of Object.values(CLASSES).filter(cl=>key==='all'||(key==='hidden'?cl.hidden:cl.element===key))){
      const el=ELEMENTS[cl.element], details=document.createElement('details');
      details.className='class-item';details.style.setProperty('--accent',cl.color);
      details.innerHTML='<summary><span>'+cl.icon+'</span>'+cl.name+'</summary><canvas aria-hidden="true"></canvas><p>'+cl.description+'</p><p><b>발동</b> '+cl.trigger+'<br><b>약점</b> '+cl.weakness+'</p>'+(el.strong?'<p>강점 '+ELEMENTS[el.strong].name+' ×1.20 · 약점 '+ELEMENTS[el.weak].name+' ×0.85</p>':cl.hidden?'<p>선택한 일반 전직의 속성을 계승합니다.</p>':'');
      grid.append(details);details.ontoggle=()=>{if(details.open)drawEmblem(details.querySelector('canvas'),{classId:cl.id,element:cl.element,level:cl.id==='basic'?0:15});};
    }
  }
  select('all');
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
window.openForgeCodex=codex; window.openForgeSettings=settings;
fillIcons(); const actions={join:()=>entry('join'),create:()=>entry('create'),guide,codex,settings};
if(previewOnly){
  const meta=document.querySelector('.hero-meta');
  const demo=document.createElement('button');demo.className='practice-launch';demo.textContent='▷ 연습 경기 관전';demo.onclick=practice;meta.after(demo);
}
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
