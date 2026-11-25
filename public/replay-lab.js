import {createArena,stepArena,arenaSnapshot} from './packages/sim/arena.js';
import {createDemoArena} from './packages/sim/demo.js';
import {getBall} from './packages/content/balls.js';
import {compatibleTraits} from './packages/content/traits.js';
import {CLASSES} from './packages/content/classes.js';
import {AWAKENINGS} from './packages/content/awakening.js';
import {ArenaView} from './arena.js';
import {htmlEsc as esc} from './ball-ui.js';

const active=new WeakMap();
const generations=new WeakMap();
const reservations=new WeakMap();
const begin=dialog=>{reservations.get(dialog)?.dispose();const token=(generations.get(dialog)||0)+1;generations.set(dialog,token);return token;};
// Reserve before the network wait: an older reply must not replace a newer
// demo, comparison, replay request, or a dialog the user has closed.
export function reserveLab(dialog){
  const token=begin(dialog);let disposed=false;
  const current=()=>!disposed&&generations.get(dialog)===token;
  const onClose=()=>{if(!dialog.open&&current())begin(dialog);};
  const request={current,dispose(){if(disposed)return;disposed=true;dialog.removeEventListener('close',onClose);if(reservations.get(dialog)===request)reservations.delete(dialog);}};
  reservations.set(dialog,request);dialog.addEventListener('close',onClose);return request;
}
function prepare(dialog,title,intro,extra=''){
  active.get(dialog)?.();
  dialog.classList.add('sf-dialog','sf-replay-dialog');
  dialog.innerHTML=`<section class="sf-modal sf-replay"><header><div><span class="sf-kicker">BALL FORGE · LAB</span><h2>${esc(title)}</h2></div><form method="dialog"><button class="sf-button" value="close">닫기</button></form></header><p class="sf-note">${esc(intro)}</p>${extra}<canvas width="960" height="640" aria-label="기록 또는 연습 경기"></canvas><div class="replay-controls"><button type="button" class="sf-button" data-replay-toggle>일시정지</button><label>속도 <select data-replay-speed><option value="0.5">0.5배</option><option value="1" selected>1배</option><option value="2">2배</option></select></label><input type="range" data-replay-seek min="0" max="1" value="0" step="1" aria-label="재생 위치"><time data-replay-time></time><button type="button" class="sf-button" data-replay-last>마지막 4초</button></div><p role="status" data-replay-status></p><details><summary>실제 판정 기록</summary><div class="replay-event-list" data-replay-events></div></details></section>`;
  // Reuse an open dialog: close() queues an event that could otherwise dispose
  // the replacement player after it has already opened.
  if(!dialog.open)dialog.showModal();
  return dialog.querySelector('.sf-replay');
}
function playback(dialog,root,record,options={}){
  const frames=record.frames;
  if(!Array.isArray(frames)||!frames.length)throw new Error('보존된 전장 상태가 없어 원본을 재생할 수 없습니다.');
  const canvas=root.querySelector('canvas'),range=root.querySelector('[data-replay-seek]'),toggle=root.querySelector('[data-replay-toggle]'),clock=root.querySelector('[data-replay-time]');
  if(options.clip)root.querySelector('[data-replay-speed]').value='0.5';
  const first=frames[0].tick,lastTick=frames.at(-1).tick,start=Math.max(first,options.clip?.fromTick??first),end=Math.min(lastTick,options.clip?.toTick??lastTick);if(end<=start)throw new Error('기록의 재생 구간을 확인하세요.');let tick=start,last=performance.now(),speed=Number(root.querySelector('[data-replay-speed]').value)||1,paused=false,index=-1,raf,view;
  const events=record.events||[];
  function resetView(){view?.destroy();view=new ArenaView(canvas,{...options,replay:true,playbackRate:speed});index=-1;}
  resetView();range.max=end;range.min=start;
  function show(){
    let i=frames.findLastIndex(f=>f.tick<=tick);i=Math.max(0,i);
    if(i!==index){
      const from=index>=0?frames[index].tick:frames[i].tick;
      const current={...frames[i],events:events.filter(e=>e.tick>from&&e.tick<=frames[i].tick)};
      view.update(current);index=i;
    }
    range.value=tick;clock.textContent=`${(tick/60).toFixed(1)} / ${(end/60).toFixed(1)}초`;
  }
  function loop(now){const delta=Math.min(100,now-last);last=now;if(!paused)tick=Math.min(end,tick+delta*.06*speed);show();if(tick>=end){paused=true;toggle.textContent='다시 재생';}raf=requestAnimationFrame(loop);}
  toggle.onclick=()=>{if(tick>=end){tick=start;resetView();}paused=!paused;toggle.textContent=paused?'재생':'일시정지';};
  root.querySelector('[data-replay-speed]').onchange=e=>{speed=Number(e.target.value);view.setOptions({playbackRate:speed});};
  range.oninput=()=>{tick=Number(range.value);resetView();show();};
  root.querySelector('[data-replay-last]').onclick=()=>{tick=Math.max(start,end-240);paused=false;toggle.textContent='일시정지';resetView();show();};
  const detail=root.querySelector('[data-replay-events]');
  detail.textContent=events.filter(e=>e.type==='hit'||e.type==='block'||e.type==='ko').slice(-160).map(e=>`${(e.tick/60).toFixed(2)}초 · ${e.kind} · ${e.sourceId||e.source||'전장'} → ${e.targetId||e.target||''} · 피해 ${(e.damage||0).toFixed(1)} / 방어 ${(e.blocked||0).toFixed(1)} · ${e.eventId||e.seq}`).join('\n')||'피해·방어 사건 없음';
  let disposed=false;
  const onClose=()=>{if(!dialog.open)cleanup();};
  const cleanup=()=>{if(disposed)return;disposed=true;cancelAnimationFrame(raf);view.destroy();dialog.removeEventListener('close',onClose);if(active.get(dialog)===cleanup)active.delete(dialog);};
  active.set(dialog,cleanup);dialog.addEventListener('close',onClose);show();raf=requestAnimationFrame(loop);
  return cleanup;
}
export async function openReplay(dialog,record,options={}){
  const token=begin(dialog),current=()=>generations.get(dialog)===token;
  const canceled=()=>{if(!dialog.open&&current())begin(dialog);};
  dialog.addEventListener('close',canceled);
  try{
    if(record.unavailableReason)throw new Error(record.unavailableReason);
    if(record.finalHash&&crypto.subtle){
      const data=JSON.stringify({frame:record.frames.at(-1),events:record.events,outcome:record.frames.at(-1).outcome??undefined});
      const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data)))].map(n=>n.toString(16).padStart(2,'0')).join('');
      if(hash!==record.finalHash)throw new Error('경기 기록 무결성 검사에 실패했습니다. 다른 시뮬레이션을 원본으로 표시하지 않습니다.');
    }
    if(!current())return;
    const clip=options.highlightId?record.summary?.highlights?.find(h=>h.id===options.highlightId):null;
    if(options.highlightId&&!clip)throw new Error('보존된 원본 하이라이트 구간이 없습니다.');
    const root=prepare(dialog,clip?'원본 하이라이트 · '+clip.label:record.practice?'CPU 연습 기록 · 이 기기에서 판정':'최근 경기 · 원본 기록 재생',record.practice?'이 기기에서 기록한 연습 상태와 사건입니다. 실제 학생 랭킹전이 아니며 재화·Elo를 지급하지 않습니다.':'서버가 보존한 상태와 사건을 재생합니다. 재추첨·승점·강화권 지급은 없습니다.');
    root.querySelector('[data-replay-status]').textContent=`규칙 ${record.snapshot?.rulesetVersion||'기록 버전'} · ${record.summary?.draw?'무승부':record.summary?.reason||'확정 결과'} · 기록 시드 ${record.snapshot?.seed??'—'}`;
    playback(dialog,root,record,{...options,clip});
  }catch(e){if(!current())return;const root=prepare(dialog,'원본 재생 불가',e.message);root.querySelector('canvas').hidden=true;root.querySelector('.replay-controls').hidden=true;}
  finally{dialog.removeEventListener('close',canceled);}
}
export function simulateRecord(builds,{seed=261126,ticks=2400,prepareState}={}){
  const arena=createArena(structuredClone(builds),{mode:'duel',seed,id:`lab-${seed}`,outcomePolicy:'ranking'});
  prepareState?.(arena);
  const frames=[arenaSnapshot(arena)],events=[];let seq=0;
  while(!arena.done&&arena.tick<ticks){stepArena(arena);for(const e of arena.events)if(e.seq>seq){events.push(structuredClone(e));seq=e.seq;}if(arena.tick%3===0)frames.push(arenaSnapshot(arena));}
  if(frames.at(-1).tick!==arena.tick)frames.push(arenaSnapshot(arena));
  for(const f of frames)f.events=[];
  return {frames,events,snapshot:{frozenBuilds:structuredClone(builds),seed},summary:{reason:arena.reason,results:arena.results},practice:true};
}
export async function openDemo(dialog,ballId,options={}){
  const ball=getBall(ballId);if(!ball)return;
  begin(dialog);
  const b={id:'demo',name:ball.name,ballId:ball.id,classId:ball.classId,level:20-ball.tier,element:ball.element,path:ball.path,traitId:null};
  const arena=createDemoArena(b,{awakening:Boolean(options.awakening)}),frames=[arenaSnapshot(arena)],events=[];let seq=0;
  while(!arena.done&&arena.tick<360){stepArena(arena);for(const e of arena.events)if(e.seq>seq){events.push(structuredClone(e));seq=e.seq;}if(arena.tick%3===0)frames.push(arenaSnapshot(arena));}
  if(frames.at(-1).tick!==arena.tick)frames.push(arenaSnapshot(arena));
  for(const f of frames)f.events=[];
  const record={frames,events,practice:true};
  const root=prepare(dialog,(options.awakening?'6초 고유 각성 시연 · ':'6초 능력 시연 · ')+ball.name,'같은 전투 규칙으로 상대와 시작 위치·첫 준비시간을 배치한 시연입니다. 평소 발동 시간이나 승률을 보장하지 않습니다.');
  const profile=options.awakening?AWAKENINGS[b.classId]:CLASSES[b.classId];
  root.querySelector('[data-replay-status]').textContent=(profile?.trigger||'')+' · 준비한 상황: '+arena.demo.setup.join(', ')+' · 대응법: '+(profile?.weakness||'');
  playback(dialog,root,record,options);
}
export function openComparison(dialog,record,build,playerId,options={}){
  const opponent=record.snapshot?.frozenBuilds?.find(p=>p.id!==playerId);
  if(!opponent)throw new Error('마지막 상대의 출전 스냅샷이 없습니다.');
  begin(dialog);
  const original=structuredClone(build),choices=original.level>=10?compatibleTraits(original):[];
  const root=prepare(dialog,'비경쟁 · 마지막 상대 비교 연습','상대는 지난 경기의 저장 빌드입니다. 같은 시드라도 빌드 변경은 전투를 바꾸며 다음 경기 승률을 예측하지 않습니다.',`<div class="lab-config"><label>연습 전용 특성<select data-lab-trait><option value="">특성 없음</option>${choices.map(t=>`<option value="${esc(t.id)}" ${t.id===original.traitId?'selected':''}>${esc(t.name)}</option>`).join('')}</select></label><label>재현 시드<input type="number" data-lab-seed min="0" max="4294967295" value="${record.snapshot.seed}" step="1"></label><button type="button" class="sf-button sf-primary" data-lab-run>이 조합으로 연습</button></div>`);
  let stop;
  function run(){
    const seed=Number(root.querySelector('[data-lab-seed]').value);if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)return;
    stop?.();const copy={...structuredClone(original),id:playerId,traitId:root.querySelector('[data-lab-trait]').value||null};
    const trial=simulateRecord([copy,structuredClone(opponent)],{seed});
    stop=playback(dialog,root,trial,options);
    root.querySelector('[data-replay-status]').textContent='연습 결과 · '+(trial.summary.results?.map(x=>`${x.name||x.id} ${x.rank}위`).join(' / ')||trial.summary.reason||'종료')+' · 실제 보관 공과 레이팅은 변경되지 않았습니다.';
  }
  root.querySelector('[data-lab-run]').onclick=run;run();
}
export function closeLab(dialog){begin(dialog);active.get(dialog)?.();if(dialog.open)dialog.close();}
