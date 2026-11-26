import {ArenaView,drawEmblem} from './arena.js';
import {featuredMarkup,highlightButtons} from './broadcast-ui.js';
import {renderForge,forgeNeedsChoice} from './forge-view.js';
import {ballOf,portrait,pathLabel,htmlEsc as esc} from './ball-ui.js';
import {getBall,PATHS} from './packages/content/balls.js';
import {ELEMENTS} from './packages/content/classes.js';
import {tierOf} from './packages/content/economy.js';
import {compatibleTraits} from './packages/content/traits.js';
import {openReplay,openComparison,openDemo,reserveLab} from './replay-lab.js';

const btn=(action,label,value='',off=false,style='')=>`<button type="button" class="sf-button ${style}" data-action="${action}" data-value="${esc(value)}" ${off?'disabled':''}>${label}</button>`;
function patch(node,html){if(node._html!==html){node.innerHTML=html;node._html=html;}}
const snapshotBuild=slot=>({...slot,id:slot?.instanceId||'practice',name:'내 보관 공'});
export class RankingView{
  constructor(root,session){
    this.root=root;this.s=session;this.tab=session.teacher?'live':'quiz';this.answer=null;this.receiptTimes=new Map();this.filters={name:'',path:'all',element:'all',action:''};
    root.innerHTML='<section class="ranking-app"><div class="rank-overview" data-rank-overview></div><nav class="rank-tabs" aria-label="수업 활동" data-rank-tabs></nav><div class="rank-layout"><aside class="rank-inventory" data-rank-inventory></aside><main class="rank-main" data-rank-main></main><aside class="rank-standings" data-rank-standings></aside></div></section>';
    this.nodes=Object.fromEntries(['overview','tabs','inventory','main','standings'].map(k=>[k,root.querySelector(`[data-rank-${k}]`)]));
    this.filterInput=e=>{const key=e.target.dataset.slotFilter;if(!key)return;this.filters[key]=e.target.value;this.renderInventory(this.selected(),this.s.room.phase==='ACTIVE'&&!this.s.room.paused);};
    root.addEventListener('input',this.filterInput);root.addEventListener('change',this.filterInput);
  }
  selected(){const inv=this.s.me.inventory;const id=inv?.selectedSlotId??0;const b=inv?.slots?.[id];return b?{...b,tickets:inv.tickets,shields:inv.shields,slotId:id,pendingForge:b.lastForge}:null;}
  update(){
    const s=this.s,m=s.me,r=s.room,inv=m.inventory,own=this.selected(),active=r.phase==='ACTIVE'&&!r.paused,rank=r.ranking||{};
    patch(this.nodes.overview,`<div><span class="sf-kicker">RANKING CHALLENGE</span><h2>${r.phase==='DRAINING'?'진행 경기와 선택을 정리하고 있습니다':r.phase==='RESULTS'?'수업 결과':'풀고, 키우고, 다시 도전하세요'}</h2></div>${s.teacher?`<div class="rank-wallet"><strong>${r.players.length}/30명</strong><span>대기 ${rank.queued??0}명 · 경기 ${(rank.matches||[]).filter(x=>!x.done).length}개</span></div>`:`<div class="rank-wallet"><strong>강화권 ${inv?.tickets??0}</strong><span>유지권 ${inv?.shields??0} · 내 순위 ${m.rank||'—'}위 · ${m.rating??1000}점 (${m.ratingDelta>0?'+':''}${m.ratingDelta||0})</span></div>`}`);
    const tabs=s.teacher?[['live','선택 경기 중계'],['roster','참가 현황']]:[['quiz','문제 풀기'],['forge','강화 · 보관'],['live',m.currentMatch?'내 경기 진행 중':'대기 · 내 경기'],['history','최근 3경기']];
    patch(this.nodes.tabs,tabs.map(([id,label])=>btn('rankTab',label,id,false,this.tab===id?'sf-selected':'')).join(''));
    this.renderInventory(own,active);
    this.renderStandings(rank,m);
    if(!s.teacher&&r.phase==='RESULTS'&&(m.autoFinalized||[]).length){
      if(!this.nodes.final){this.nodes.final=document.createElement('section');this.nodes.final.className='sf-panel rank-final';this.nodes.tabs.after(this.nodes.final);}
      patch(this.nodes.final,`<h3>종료 시 자동 확정한 공</h3><p>남은 선택을 현재 규칙의 기본 후보로 완료했습니다. 미응답 히든은 거절했습니다.</p><ul>${m.autoFinalized.map(x=>`<li>슬롯 ${x.slotId+1} · ${esc(getBall(x.ballId)?.name||x.ballId)} · ${esc(pathLabel(x.path))} · ${esc(compatibleTraits(getBall(x.ballId)?.classId).find(t=>t.id===x.traitId)?.name||'특성 없음')}</li>`).join('')}</ul>`);
    }else if(this.nodes.final){this.nodes.final.remove();this.nodes.final=null;}
    if(this.tab==='live'){this.renderLive();return;}
    this.view?.destroy();this.view=null;this.liveId=null;
    if(this.tab==='quiz')this.renderQuiz(active);
    if(this.tab==='forge'){
      if(!own){patch(this.nodes.main,'<section class="sf-panel sf-wait"><h3>빈 보관 슬롯입니다</h3><p>왼쪽에서 T20 공을 무료로 생성하세요. 강화권은 재지급되지 않습니다.</p></section>');return;}
      const receipt=own.lastForge;
      if(receipt&&!receipt.acknowledged&&!this.receiptTimes.has(receipt.resultId)){
        this.receiptTimes.set(receipt.resultId,performance.now());clearTimeout(this.receiptTimer);this.receiptTimer=setTimeout(()=>this.update(),320);
      }
      const model={...s,me:own,editTrait:this.editTrait,receiptReady:!receipt||performance.now()-(this.receiptTimes.get(receipt.resultId)||0)>=300};
      patch(this.nodes.main,renderForge(model,{ranking:true}));
      const canvas=this.nodes.main.querySelector('[data-emblem]');if(canvas&&!canvas.dataset.drawn){canvas.dataset.drawn='true';drawEmblem(canvas,own);}
    }
    if(this.tab==='history')this.renderHistory();
    if(this.tab==='roster')patch(this.nodes.main,`<section class="sf-panel"><h3>참가·연결 상태</h3><ul class="sf-roster">${r.players.map(p=>`<li><strong>${esc(p.name)}</strong><span>${p.connected?'연결됨':'재접속 대기'} · ${p.waiting?'다음 판 대기':p.currentMatch?'경기 중':p.queued?'대기열':'수업 중'}</span></li>`).join('')}</ul></section>`);
  }
  renderInventory(own,active){
    const s=this.s,m=s.me,inv=m.inventory;
    if(s.teacher){patch(this.nodes.inventory,`<section class="sf-panel"><span class="sf-kicker">CLASS CONTROL</span><h3>호스트 송출</h3><p>진행 경기 한 개만 표시합니다. 경기 종료 후에도 선택한 결과가 유지됩니다.</p><p class="sf-note">${s.room.paused?'일시정지 중':'수업 진행 시간은 모든 학생에게 같습니다.'}</p>${btn('endRanking','수업 종료 · 정리', '',s.busy||s.room.phase!=='ACTIVE','sf-danger')}</section>`);return;}
    if(!inv)return;
    const disabled=s.busy||s.room.paused;
    if(!this.nodes.inventory.querySelector('[data-slot-list]')){
      this.nodes.inventory.innerHTML=`<section class="sf-panel"><header class="sf-section-heading"><h3>나의 공 3칸</h3><span>공통 지갑</span></header><details class="rank-filters"><summary>보관 공 검색·필터</summary><label>이름<input type="search" data-slot-filter="name" placeholder="공 이름"></label><label>계열<select data-slot-filter="path"><option value="all">모든 계열</option><option value="common">공용 경로</option>${Object.values(PATHS).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label><label>출전 속성<select data-slot-filter="element"><option value="all">모든 속성</option>${Object.entries(ELEMENTS).map(([id,e])=>`<option value="${id}">${esc(e.name)}</option>`).join('')}</select></label><label>행동<input type="search" data-slot-filter="action" placeholder="방어, 돌진, 소환…"></label>${btn('clearSlotFilters','필터 초기화')}</details><p class="sf-note" data-slot-count></p><div class="rank-slots" data-slot-list></div><div data-slot-ready></div></section>`;
      for(const input of this.nodes.inventory.querySelectorAll('[data-slot-filter]'))input.value=this.filters[input.dataset.slotFilter];
    }
    const f=this.filters,contains=(text,q)=>String(text||'').toLocaleLowerCase().includes(q.trim().toLocaleLowerCase());
    const visible=inv.slots.map(b=>!b||(contains(ballOf(b).name,f.name)&&(f.path==='all'||(b.path||'common')===f.path)&&(f.element==='all'||b.element===f.element)&&contains(`${ballOf(b).trigger} ${ballOf(b).description}`,f.action)));
    patch(this.nodes.inventory.querySelector('[data-slot-count]'),`보관 공 ${inv.slots.filter((b,i)=>b&&visible[i]).length}/${inv.slots.filter(Boolean).length}개 · 빈 슬롯은 유지됩니다.`);
    patch(this.nodes.inventory.querySelector('[data-slot-list]'),inv.slots.map((b,i)=>b?`<article class="rank-slot ${own?.slotId===i?'selected':''}" ${visible[i]?'':'hidden'}>${btn('selectSlot',`${portrait(ballOf(b),'ball-portrait-small')}<span><small>슬롯 ${i+1} · T${tierOf(b.level)}</small><strong>${esc(ballOf(b).name)}</strong></span>`,i,disabled)}<small>${b.locked?'출전 확정 · 수정 불가':b.storageLocked?'보관 잠금':'육성 가능'}</small><div class="sf-actions">${btn('storageLock',b.storageLocked?'잠금 해제':'보관 잠금',i,disabled||b.locked||!active)}${btn('resetBall','초기화',i,disabled||b.locked||b.storageLocked||!active)}</div></article>`:`<article class="rank-slot rank-empty"><span>빈 슬롯 ${i+1}</span>${btn('createBall','무료 T20 생성',i,disabled||!active)}</article>`).join(''));
    patch(this.nodes.inventory.querySelector('[data-slot-ready]'),own?`<div class="rank-ready"><p>출전 · T${tierOf(own.level)} ${esc(ballOf(own).name)}${own.traitId?' · '+esc(compatibleTraits(own).find(t=>t.id===own.traitId)?.name||''):''}</p>${m.queue?btn('cancelQueue','대기열 취소','',disabled):m.currentMatch?btn('rankTab','내 경기 바로가기','live'):btn('queue','이 공으로 랭킹전 준비',own.slotId,disabled||!active||forgeNeedsChoice(own)||(own.lastForge&&!own.lastForge.acknowledged),'sf-primary')}<p class="sf-note">${esc(s.room.ranking?.queueNotice||'대기·경기 중에도 퀴즈와 다른 공은 사용할 수 있습니다.')}</p></div>`:'');
  }
  renderStandings(rank,m){
    const rows=rank.top10||[];
    patch(this.nodes.standings,`<section class="sf-panel"><header class="sf-section-heading"><h3>학급 TOP 10</h3><span>Elo</span></header><ol class="rank-board">${rows.map((p,i)=>`<li class="${p.id===m.id?'mine':''}"><span>${p.rank||i+1}</span><strong>${esc(p.name)}</strong><b>${p.rating??1000}</b></li>`).join('')||'<li class="rank-board-empty">첫 경기를 기다립니다.</li>'}</ol>${!this.s.teacher?`<p class="rank-own">내 순위 ${m.rank||'—'}위 · ${m.rating??1000}점</p><p class="sf-note">정식 학생 대전만 반영됩니다.</p>`:''}</section>${!this.s.teacher?`<section class="sf-panel rank-goals"><h3>이번 수업의 나</h3><p>개인 최고 ${m.bestRating??m.rating??1000}점</p>${(m.goals||[]).slice(0,3).map(g=>`<p>${g.complete?'✓':'○'} ${esc(g.name||g.label)}</p>`).join('')}</section>`:''}`);
  }
  renderQuiz(active){
    const m=this.s.me,feed=this.answer,q=feed?.question||m.question;
    if(!q){patch(this.nodes.main,`<section class="sf-panel sf-wait"><span class="sf-kicker">REVIEW BREAK</span><h3>복습하거나 공을 키워보세요</h3><p>${m.quizWaitMs>0?`다음 보상 문항까지 약 ${Math.ceil(m.quizWaitMs/1000)}초`:'새 문항을 확인할 수 있습니다.'}</p>${btn('nextQuestion','다음 문항 확인','',!active||this.s.busy||m.quizWaitMs>0)}${btn('rankTab','강화실로','forge')}<p class="sf-note">같은 문항은 90초와 다른 문항 학습 조건을 모두 만족해야 다시 보상받습니다.</p></section>`);return;}
    patch(this.nodes.main,`<section class="sf-panel sf-quiz"><div class="sf-quiz-meta"><b>문제 ${m.answered+(!feed?1:0)}</b><span>정답 ${m.correct}개 · 정답마다 +2장</span></div><h3>${esc(q.text)}</h3><div class="sf-answers">${q.answers.map((a,i)=>btn('rankAnswer',`<span>${'ABCD'[i]}</span>${esc(a.text)}`,a.id,!active||this.s.busy||!!feed,'sf-answer'+(feed?.correctText===a.text?' sf-correct':feed?.choice===a.id?' sf-wrong':''))).join('')}</div>${feed?`<div class="sf-feedback" role="status"><b>${feed.correct?'정답 · 강화권 +2장':`정답은 ${esc(feed.correctText)}`}</b><p>${esc(feed.explanation||'정답과 보기를 다시 비교해 보세요.')}</p>${btn('rankNext','이해했어요 · 다음 문항','',!active)}</div>`:'<p class="sf-note">랭킹이 갱신되어도 이 문제와 화면 위치는 유지됩니다.</p>'}</section>`);
  }
  renderLive(){
    const s=this.s,m=s.me,matches=s.room.ranking?.matches||[],focus=s.teacher?m.focus:m.currentMatch;
    let b=this.frame||s.lastFrame||s.room.battle;
    if((b?.arenas?.[0]?.id||b?.selectedResult?.matchId||null)!==(focus||null))b=s.room.battle;
    const arena=b?.arenas?.[0];
    if(!this.nodes.main.querySelector('[data-rank-live]')){
      this.nodes.main.innerHTML='<section class="sf-panel rank-live" data-rank-live><div data-live-featured></div><div data-live-selector></div><div class="rank-live-title" data-live-title></div><canvas class="rank-canvas" width="960" height="640" aria-label="선택한 실시간 경기"></canvas><div data-live-status></div></section>';this.nodes.main._html=null;
      this.view=new ArenaView(this.nodes.main.querySelector('canvas'),{...s.options,playerId:s.teacher?null:m.id});
    }
    const root=this.nodes.main;
    patch(root.querySelector('[data-live-featured]'),s.teacher?featuredMarkup(s.room.ranking?.featured):'');
    patch(root.querySelector('[data-live-selector]'),s.teacher?`<div class="sf-match-tabs">${matches.map(x=>btn('rankWatch',esc((x.names||[]).join(' vs ')+(x.done?' · 종료':'')),x.id,false,x.id===arena?.id?'sf-selected':'')).join('')}</div>`:'');
    patch(root.querySelector('[data-live-title]'),`<span class="sf-kicker">LIVE · ${arena?'실시간 경기':'출전 대기'}</span><h3>${arena?esc(arena.balls.map(p=>p.name).join(' vs ')):b?.selectedResult?'선택 경기 종료':m.queue?'준비한 학생과 연결하고 있습니다':'준비한 공으로 대기열에 참가하세요'}</h3>`);
    patch(root.querySelector('[data-live-status]'),b?.selectedResult?`<p>확정 결과 · ${esc(b.selectedResult.status==='void'?'무효 경기':b.selectedResult.draw?'무승부':(b.selectedResult.participants?.find(p=>p.id===b.selectedResult.winnerId)?.name||'승자')+' 승리')}</p>${b.selectedResult.status==='void'?`<p>${esc(b.selectedResult.reason||'승점 변동이 없는 경기입니다.')}</p>`:''}<div class="sf-actions">${btn('replay','이 경기 원본 재생',b.selectedResult.matchId)}${highlightButtons(b.selectedResult.matchId,b.selectedResult.highlights)}</div>`:arena?.done?'<p>경기 종료 · 최근 경기에서 결과와 원본 재생을 볼 수 있습니다.</p>':`<p class="sf-note">${esc(s.room.ranking?.queueNotice||(s.teacher?'원하는 경기를 선택해 송출하세요.':m.currentMatch?'문제 풀기 탭으로 이동해도 경기는 계속됩니다.':'준비된 상대가 없으면 기다리거나 퀴즈를 풀 수 있습니다.'))}</p>`);
    root.querySelector('canvas').hidden=!arena;
    this.view?.setOptions(s.options);if(arena)this.view?.update(arena);
  }
  updateFrame(frame){this.frame=frame;if(this.tab==='live')this.renderLive();}
  renderHistory(){
    const list=this.s.me.recentMatches||[];
    patch(this.nodes.main,`<section class="sf-panel"><span class="sf-kicker">LAST THREE · RECORDED</span><h3>최근 경기에서 다음 선택을 찾으세요</h3><p>현재 수업의 서버 기록입니다. 리플레이와 연습은 점수·강화권을 지급하지 않습니다.</p>${list.map(x=>`<article class="rank-history"><header><h4>${esc(typeof x.opponent==='string'?x.opponent:x.opponent?.name||'최근 상대')} · ${esc(({win:'승리',loss:'패배',draw:'무승부',void:'무효'})[x.result]||'경기 종료')}</h4><strong>${x.ratingDelta>0?'+':''}${x.ratingDelta??0}점</strong></header>${summaryLines(x.summary).slice(0,3).map(line=>`<p>${esc(line)}</p>`).join('')}<div class="sf-actions">${btn('retryMatch','같은 공 재도전',x.matchId,this.s.busy||this.s.room.paused||this.s.room.phase!=='ACTIVE'||!!this.s.me.queue||!!this.s.me.currentMatch,'sf-primary')}${btn('replay','원본 재생',x.matchId)}${highlightButtons(x.matchId,x.highlights)}${btn('compare','마지막 빌드와 비교 연습',x.matchId)}${btn('rankTab','보관 공 선택','forge')}${btn('rankTab','문제 풀기','quiz')}</div></article>`).join('')||'<div class="sf-empty">완료한 정식 경기 기록이 여기에 남습니다.</div>'}</section>`);
  }
  async action(action,value){
    const s=this.s,m=s.me,b=this.selected(),slotId=b?.slotId??0,resultId=b?.lastForge?.resultId;
    if(action==='rankTab'){this.tab=value;this.update();return true;}
    if(action==='clearSlotFilters'){
      this.filters={name:'',path:'all',element:'all',action:''};for(const input of this.nodes.inventory.querySelectorAll('[data-slot-filter]'))input.value=this.filters[input.dataset.slotFilter];this.renderInventory(b,s.room.phase==='ACTIVE'&&!s.room.paused);return true;
    }
    if(action==='recoverForge'){
      if(b?.lastForge&&!b.lastForge.acknowledged)await s.cmd('ackForge',{slotId,resultId});
      this.tab=value==='quiz'?'quiz':'forge';this.update();if(value==='store'){await this.action('clearSlotFilters');this.nodes.inventory.scrollIntoView({block:'center'});}return true;
    }
    if(action==='retryMatch'){
      if(this.retrying)return true;this.retrying=true;
      try{
        const runId=s.room.runId;
        const data=await s.connection.request('replay',{matchId:value}),record=data.record||data;
        if(s.destroyed||s.room.runId!==runId)return true;
        const previous=record.snapshot?.frozenBuilds?.find(x=>x.id===m.id),index=s.me.inventory.slots.findIndex(x=>x&&x.instanceId===previous?.instanceId);
        if(index<0){s.notify('이 경기에 출전했던 공은 현재 보관되어 있지 않습니다. 현재 보관 공을 선택하세요.');return true;}
        const current=s.me.inventory.slots[index];
        if(forgeNeedsChoice(current)||(current.lastForge&&!current.lastForge.acknowledged)){await s.cmd('selectSlot',{slotId:index});this.tab='forge';this.update();s.notify('이 공의 결과 확인과 선택을 마친 뒤 출전할 수 있습니다.');return true;}
        await s.cmd('queue',{slotId:index});this.tab='live';this.update();
      }catch(e){s.notify(e.message);}finally{this.retrying=false;}return true;
    }
    if(action==='selectSlot'){this.editTrait=false;await s.cmd('selectSlot',{slotId:Number(value)});this.tab='forge';this.update();return true;}
    if(action==='createBall'){await s.cmd(action,{slotId:Number(value)});return true;}
    if(action==='storageLock'){const x=m.inventory.slots[Number(value)];await s.cmd(action,{slotId:Number(value),enabled:!x.storageLocked});return true;}
    if(action==='resetBall'){if(await s.modal('이 공을 T20으로 초기화할까요?','<p>이 공의 폼·경로·특성은 사라집니다. 다른 슬롯과 지갑·레이팅은 유지됩니다. 히든 추첨은 다시 받을 수 없습니다.</p>','초기화'))await s.cmd(action,{slotId:Number(value)});return true;}
    if(action==='queue'||action==='cancelQueue'){await s.cmd(action,action==='queue'?{slotId}:{});return true;}
    if(action==='rankAnswer'){if(this.answer||!m.question)return true;const question=m.question;await s.cmd('answer',{questionId:question.id,attemptId:question.attemptId,answerId:value},data=>{this.answer={...data,question,choice:value};});return true;}
    if(action==='rankNext'){this.answer=null;this.update();if(!s.me.question)await s.cmd('nextQuestion');return true;}
    if(action==='nextQuestion'){await s.cmd(action);return true;}
    if(action==='rankWatch'){await s.cmd('watch',{matchId:value});return true;}
    if(action==='endRanking'){if(await s.modal('수업을 마칠까요?','<p>새 보상·강화·매칭을 마감하고 진행 경기와 이미 승인한 선택을 정리합니다.</p>','종료 정리'))await s.cmd('endSession');return true;}
    if(action==='editTrait'){this.editTrait=!this.editTrait;this.update();return true;}
    if(action==='demo'||action==='awakeningDemo'){await openDemo(s.root.querySelector('dialog'),value,{...s.options,awakening:action==='awakeningDemo'});return true;}
    if(['highlight','replay','compare'].includes(action)){
      const [matchId,highlightId]=action==='highlight'?JSON.parse(value):[value,null],runId=s.room.runId,currentMatch=s.me.currentMatch;
      const dialog=s.root.querySelector('dialog'),request=reserveLab(dialog);
      try{const data=await s.connection.request('replay',{matchId});if(!request.current()||s.destroyed||s.room.runId!==runId||s.me.currentMatch!==currentMatch)return true;const record=data.record||data;
        if(action!=='compare')await openReplay(dialog,record,{...s.options,highlightId});else if(b)openComparison(dialog,record,snapshotBuild(b),m.id,s.options);else s.notify('비교할 공을 먼저 생성하세요.');
      }catch(e){if(request.current()&&!s.destroyed)s.notify(e.message);}finally{request.dispose();}return true;
    }
    if(['enhance','protectedEnhance','buyShield','shield','ackForge','choosePath','chooseBall','hidden','chooseTrait'].includes(action)){
      const fields={slotId,resultId};
      if(action==='choosePath')fields.pathId=value;
      if(action==='chooseBall')fields.ballId=value;
      if(action==='chooseTrait')fields.traitId=value;
      if(action==='hidden')fields.accept=value==='yes';
      if(action==='ackForge')fields.resultId=value;
      if(action==='enhance'||action==='protectedEnhance'){fields.protect=action==='protectedEnhance';fields.buyMissing=fields.protect;}
      if(action==='shield')fields.enabled=!b.useShield;
      await s.cmd(action==='protectedEnhance'?'enhance':action,fields,()=>{if(action==='chooseTrait')this.editTrait=false;});return true;
    }
    return false;
  }
  destroy(){clearTimeout(this.receiptTimer);this.view?.destroy();this.root.removeEventListener('input',this.filterInput);this.root.removeEventListener('change',this.filterInput);}
}
export function summaryLines(summary){
  if(!summary)return [];
  if(Array.isArray(summary))return summary.map(x=>typeof x==='string'?x:x.text||x.label||eventSummary(x));
  if(summary.highlights)return summaryLines(summary.highlights);
  if(summary.lines)return summaryLines(summary.lines);
  return Object.entries(summary).filter(([,v])=>typeof v==='number').map(([k,v])=>`${({damage:'유효 피해',blocked:'방어량',hits:'유효 타격',wallDamage:'벽 충돌 피해',blocks:'방어 횟수'}[k]||k)} ${Math.round(v*10)/10}`);
}

function eventSummary(x){const names={mace:'철퇴 강타',wallslam:'벽 충돌',blade:'검격',trinity:'회전 검격',body:'몸체 충돌',beam:'차지 포격',dash:'돌진',icewave:'서리 파동','ice-shatter':'빙결 파쇄',familiar:'소환 공격',absorb:'흡수',block:'유효 방어','largest-hit':'가장 큰 피격',burn:'화상',poison:'독'};return (names[x.kind]||'기술 적중')+(x.count!=null?' '+x.count+'회':'')+(x.damage!=null?' · 피해 '+Math.round(x.damage*10)/10:'')+(x.blocked!=null?' · 방어량 '+Math.round(x.blocked*10)/10:'');}
