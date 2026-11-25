import { BALL_CATALOG, PATHS, getBall, levelOf, tierOf } from './packages/content/balls.js';
import { initialBuild, fundBuild, enhance, buyShield, toggleShield, choosePath, chooseBall, chooseTrait, resolveHidden, lockBuild, buildReady } from './packages/content/forge.js';
import {createBall,deleteBall,resetInventoryBall,setStorageLock,selectBall,inventoryBuild,freezeBattleBuild,releaseBattleBuild} from './packages/content/inventory.js';
import {createPracticeLesson,practiceEligibility,practiceQuestion,practiceAnswer,practiceReceipt,acknowledgePracticeForge,practiceForge,practiceForgeView,finishPracticeLesson} from './packages/content/practice-loop.js';
import {compatibleTraits} from './packages/content/traits.js';
import {createArena,stepArena,arenaSnapshot} from './packages/sim/arena.js';
import {summarizeEvents} from './packages/sim/replay.js';
import { createCompetition, stepCompetition, competitionSnapshot } from './packages/sim/index.js';
import { drawEmblem, unlockAudio } from './arena.js';
import { Broadcast } from './session-battle.js';
import { forge, button, esc } from './session-screens.js';
import { ballOf, ballCard, portrait, eliminationText } from './ball-ui.js';
import {renderForge} from './forge-view.js';
import {openDemo,openReplay,openComparison,closeLab} from './replay-lab.js';

const QUESTIONS = [
  ['한 주는 며칠인가요?', ['7일','5일','8일','10일'], 0, '한 주는 월요일부터 일요일까지 7일입니다.'],
  ['삼각형의 변은 몇 개인가요?', ['4개','3개','2개','5개'], 1, '삼각형은 세 개의 선분으로 둘러싸인 도형입니다.'],
  ['10분은 몇 초인가요?', ['100초','60초','600초','1000초'], 2, '1분은 60초이므로 10 × 60 = 600초입니다.'],
  ['24를 6으로 나누면 얼마인가요?', ['3','5','6','4'], 3, '6 × 4 = 24이므로 24 ÷ 6 = 4입니다.'],
  ['식물이 빛을 이용해 양분을 만드는 과정은?', ['광합성','증발','응결','마찰'], 0, '광합성은 빛을 이용해 양분을 만드는 과정입니다.'],
  ['지구가 스스로 한 바퀴 도는 운동은?', ['공전','자전','진동','회절'], 1, '지구가 스스로 도는 운동은 자전입니다.'],
  ['3/4과 같은 값은 무엇인가요?', ['0.25','0.5','0.75','1.25'], 2, '3 ÷ 4 = 0.75입니다.'],
  ['직각은 몇 도인가요?', ['45도','60도','180도','90도'], 3, '직각의 크기는 90도입니다.'],
  ['물의 기체 상태를 무엇이라고 하나요?', ['수증기','얼음','안개','이슬'], 0, '기체 상태의 물은 수증기입니다. 안개와 이슬은 작은 물방울입니다.'],
  ['8 × 7의 값은 얼마인가요?', ['54','56','64','49'], 1, '8을 일곱 번 더하면 56입니다.'],
];
const clock = ms => Math.floor(Math.max(0,Math.ceil(ms / 1000)) / 60) + ':' + String(Math.max(0,Math.ceil(ms / 1000)) % 60).padStart(2,'0');

export function startPractice(root, {preferences = () => ({})} = {}) {
  let state, frame = 0, broadcast, competition, fxTimer, destroyed = false, practiceArena;
  const labDialog=document.createElement('dialog');document.body.append(labDialog);
  let speed = 1, last = 0, debt = 0, lastSnapshot = -10;
  let options = {sound:false,shake:!matchMedia('(prefers-reduced-motion: reduce)').matches,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,...preferences()};
  root.classList.add('sf-session','practice-app');

  function reset() {
    stopBattle(); closeLab(labDialog); clearTimeout(fxTimer);practiceArena=null;
    state = {phase:'intro',mode:'tournament',count:8,correct:0,index:0,answer:null,build:initialBuild(),notice:'',lab:false,labTier:10,left:'blade-10-blade',right:'common-10-elastic',receipt:null,editTrait:false};
    render();
  }
  function stopBattle() {
    cancelAnimationFrame(frame); broadcast?.destroy(); broadcast = null;
  }
  function header() {
    return '<div class="practice-label"><span>LOCAL PRACTICE</span><b>이 기기에서만 진행하는 연습</b>' + (state.deadline ? '<time data-practice-clock>' + clock(state.deadline - Date.now()) + '</time>' : '') + '</div>';
  }
  function render() {
    if (destroyed) return;
    if (state.phase === 'intro') renderIntro();
    else if(state.phase==='growth')renderGrowth();
    else if (state.phase === 'quiz') renderQuiz();
    else if (state.phase === 'forge') {
      const session = {teacher:false,me:{...state.build,correct:state.correct,pendingForge:state.receipt},room:{paused:false},busy:false,forgeFx:state.fx,receiptReady:!state.receipt||Date.now()>=state.receipt.readyAt,editTrait:state.editTrait};
      root.innerHTML = header() + forge(session) + '<p class="practice-notice" role="status">' + esc(state.notice) + '</p>';
      const canvas = root.querySelector('[data-emblem]');
      if(canvas)drawEmblem(canvas,state.build);
    } else if (state.phase === 'lab') renderLab();
    else if (state.phase === 'results') renderResults();
  }
  function renderIntro() {
    root.innerHTML = header() + '<section class="practice-intro"><span class="sf-kicker">MAKE. EVOLVE. BATTLE.</span><h3>나만의 공을 완성해 보세요.</h3><p>퀴즈 정답으로 강화권을 모으고, 티어마다 공을 선택해 CPU와 대결합니다.</p><div class="practice-steps"><span>01 퀴즈</span><i>→</i><span>02 강화·선택</span><i>→</i><span>03 자동 전투</span></div><div class="practice-config"><label>경기 방식<select data-practice-setting="mode"><option value="tournament"' + (state.mode === 'tournament' ? ' selected' : '') + '>토너먼트</option><option value="rumble"' + (state.mode === 'rumble' ? ' selected' : '') + '>전원 럼블</option></select></label><label>나를 포함한 참가 공<select data-practice-setting="count">' + [4,8,16,30].map(n => '<option value="' + n + '"' + (state.count === n ? ' selected' : '') + '>' + n + '개</option>').join('') + '</select></label></div>' +
      '<div class="sf-actions">'+button('beginGrowth','반복 육성 · 3슬롯 연습','sf-primary')+button('beginQuiz','단회 퀴즈·토너먼트 연습')+'</div><p class="sf-note">반복 육성은 15분 · 기본 10장 + 정답당 2장 · CPU 상대이며 실제 학생 순위/Elo에 반영되지 않습니다.</p><p class="sf-note">단회 연습은 샘플 10문항 · 퀴즈 2분 · 강화 90초입니다.</p></section><section class="practice-lab-teaser"><div><h4>볼 실험실</h4><p>궁금한 티어와 공을 직접 골라 능력을 비교하세요.</p></div>' + button('openLab','원하는 공으로 대결') + '</section>';
  }
  function beginGrowth(){
    stopBattle();state.phase='growth';state.growthTab='quiz';state.lesson=createPracticeLesson(QUESTIONS,'local-'+Date.now());
    state.deadline=Date.now()+900000;state.history=[];state.notice='기본 강화권 10장 지급 · 이 연습에서는 실제 레이팅을 지급하지 않습니다.';state.editTrait=false;render();
  }
  function growthStatus(){return practiceArena&&!practiceArena.done?'CPU와 내 경기가 진행 중입니다. 다른 공 육성과 퀴즈를 계속할 수 있습니다.':state.lesson.phase==='RESULTS'?'연습 수업 종료 · 남은 선택을 합법적 기본값으로 확정했습니다.':state.lesson.phase==='DRAINING'?'종료 정리 · 이미 승인한 선택과 진행 중 경기만 마칩니다.':state.history.length?'최근 CPU 연습 결과가 있습니다. 다시 출전하거나 다른 공을 시험해 보세요.':'준비된 공으로 CPU 대전에 참가해 보세요.';}
  function growthQuiz(){
    const lesson=state.lesson,q=practiceQuestion(lesson,Date.now());
    if(!q){
      const at=Math.min(...lesson.ledger.map((_,i)=>practiceEligibility(lesson,i,Date.now())).filter(x=>x.otherAnswered>=x.otherRequired).map(x=>x.at));
      state.reviewAt=Number.isFinite(at)?at:null;
      return '<section class="sf-panel sf-quiz"><h3>복습하거나 공을 육성하세요</h3><p>같은 문항은 마지막 응답 후 90초와 다른 문항 '+Math.min(4,QUESTIONS.length-1)+'개 응답을 모두 만족하면 다시 보상을 받을 수 있습니다.</p><p data-practice-review-clock>'+reviewClock()+'</p>'+button('growthQuestion','보상 가능한 문항 확인','sf-primary',lesson.phase!=='ACTIVE')+'<details><summary>최근 문항 복습 · 보상 없음</summary>'+lesson.history.slice(-3).map(i=>'<p>'+esc(QUESTIONS[i][0])+'<br>'+esc(QUESTIONS[i][3])+'</p>').join('')+'</details></section>';
    }
    const result=q.result;
    return '<section class="sf-panel sf-quiz"><span class="sf-kicker">CONTINUOUS QUIZ · LOCAL</span><div class="sf-quiz-meta"><b>응답 '+lesson.answered+'개 · 정답 '+lesson.correct+'개</b><span>강화권 '+lesson.inventory.tickets+'장</span></div><h3>'+esc(q.text)+'</h3><div class="sf-answers">'+q.answers.map((answer,i)=>button('growthAnswer','<span>'+'ABCD'[i]+'</span>'+esc(answer),'sf-answer'+(result&&i===result.correctAnswer?' sf-correct':result?.answer===i?' sf-wrong':''),Boolean(result)||lesson.phase!=='ACTIVE',i)).join('')+'</div>'+(result?'<p class="sf-feedback" role="status"><b>'+(result.correct?'정답 · 강화권 +2장':'정답은 '+esc(q.answers[result.correctAnswer]))+'</b><br>'+esc(result.explanation)+'</p>'+button('growthQuestion','다음 문항','sf-primary',lesson.phase!=='ACTIVE'):'<p class="sf-note">같은 시도의 답안을 다시 눌러도 재지급하지 않습니다.</p>')+'</section>';
  }
  function reviewClock(){return state.lesson.phase!=='ACTIVE'?'신규 보상 지급이 종료됐습니다.':state.reviewAt?'다음 보상 문항까지 '+Math.max(0,Math.ceil((state.reviewAt-Date.now())/1000))+'초':'다른 문항 응답 조건을 먼저 완료하세요.';}
  function growthInventory(){
    const inv=state.lesson.inventory,active=state.lesson.phase==='ACTIVE';
    return '<div class="sf-grid">'+inv.slots.map((b,i)=>'<section class="sf-panel"><h3>슬롯 '+(i+1)+(inv.selectedSlotId===i?' · 선택됨':'')+'</h3>'+(b?ballCard(ballOf(b))+'<p>'+esc(b.locked?'CPU 경기 출전 중':b.storageLocked?'보관 잠금 중':'육성 가능')+'</p><div class="sf-actions">'+button('growthSlot','이 공 선택','sf-primary',false,i)+button('growthStore',b.storageLocked?'보관 잠금 해제':'주력 공 보관','',b.locked||!active||!buildReady(b),i)+button('growthReset','이 공 T20 초기화','',b.locked||b.storageLocked||!active,i)+button('growthDelete','슬롯 비우기','',b.locked||b.storageLocked||!active,i)+'</div>': '<p>무료 T20 공을 만들 수 있습니다. 티켓을 추가 지급하지 않습니다.</p>'+button('growthCreate','T20 공 만들기','sf-primary',!active,i))+'</section>').join('')+'</div>';
  }
  function growthResults(){
    const record=state.history[0];if(!record)return '<section class="sf-panel"><h3>아직 CPU 연습 기록이 없습니다.</h3><p>강화 화면에서 준비된 공을 출전시키세요.</p></section>';
    const summary=record.summary,own=record.frames.at(-1).balls.find(b=>b.id==='practice-me');
    const detail=(summary.events?.highlights||[]).map(h=>'<p>'+esc(h.kind==='block'?'유효 방어':h.kind==='largest-hit'?'가장 큰 피격':h.kind==='wallslam'?'벽 충돌 추가타':'기술 적중')+' · '+(h.count?h.count+'회 · ':'')+(h.blocked!=null?'막은 피해 '+h.blocked:'실제 피해 '+h.damage)+'</p>').join('');
    return '<section class="sf-panel"><span class="sf-kicker">CPU PRACTICE RESULT</span><h3>'+esc(summary.reason||'경기 종료')+'</h3><p>내 공 '+(own?.rank||'—')+'위 · 실제 학생 경기/승점/강화 보상 없음</p>'+detail+'<div class="sf-actions">'+button('growthBattle','선택한 공으로 재도전','sf-primary',state.lesson.phase!=='ACTIVE')+button('growthTab','보관 공 선택','',false,'inventory')+button('growthTab','문제 풀기','',false,'quiz')+button('growthCompare','마지막 상대와 비교 연습')+'</div></section><section class="sf-panel"><h3>최근 CPU 연습 3경기</h3>'+state.history.map((r,i)=>'<div class="sf-actions"><span>'+esc(r.matchId)+' · '+esc(r.summary.reason||'종료')+'</span>'+button('growthReplay','기록 재생','',false,i)+'</div>').join('')+'</section>';
  }
  function renderGrowth(){
    broadcast?.destroy();broadcast=null;
    const lesson=state.lesson,inv=lesson.inventory,selected=inv.slots[inv.selectedSlotId];
    let body='';
    if(state.growthTab==='quiz')body=growthQuiz();
    else if(state.growthTab==='inventory')body=growthInventory();
    else if(state.growthTab==='battle')body=practiceArena&&!practiceArena.done?'<div class="practice-broadcast"></div>':growthResults();
    else if(selected){
      const me=practiceForgeView(lesson),receipt=me.pendingForge;
      body=renderForge({me,room:{paused:false,phase:lesson.phase},busy:false,receiptReady:!receipt||Date.now()>=receipt.readyAt,editTrait:state.editTrait},{ranking:true})+'<section class="sf-panel"><div class="sf-actions">'+button('growthBattle','슬롯 '+(inv.selectedSlotId+1)+' · T'+tierOf(me.level)+' 공으로 CPU 대전','sf-primary',!buildReady(me)||me.locked||Boolean(practiceArena&&!practiceArena.done)||Boolean(receipt&&!receipt.acknowledged)||lesson.phase!=='ACTIVE')+button('growthTab','다른 보관 공','',false,'inventory')+button('growthTab','문제 풀기','',false,'quiz')+'</div><p>공유 시뮬레이터를 쓰는 비경쟁 연습입니다. 패배해도 공은 사라지지 않습니다.</p></section>';
    }else body=growthInventory();
    root.innerHTML=header()+'<section class="sf-panel"><div class="sf-actions">'+[['quiz','문제 풀기'],['forge','강화'],['inventory','공 3슬롯'],['battle','내 경기·최근 기록']].map(([id,name])=>button('growthTab',name,state.growthTab===id?'sf-primary':'',false,id)).join('')+'</div><p>공유 강화권 <b>'+inv.tickets+'</b>장 · 유지권 <b>'+inv.shields+'</b>개 · Elo 없음</p><p data-growth-status role="status">'+esc(growthStatus())+'</p></section>'+body+'<p class="practice-notice" role="status">'+esc(state.notice)+'</p><div class="sf-actions">'+button('restartPractice','새 연습 수업')+'</div>';
    if(state.growthTab==='forge'&&selected){const canvas=root.querySelector('[data-emblem]');if(canvas)drawEmblem(canvas,selected);}
    if(state.growthTab==='battle'&&practiceArena&&!practiceArena.done){broadcast=new Broadcast(root.querySelector('.practice-broadcast'),state.session);updateGrowthBattle();}
  }
  function updateGrowthBattle(){
    if(!broadcast||!practiceArena)return;
    broadcast.update({battleId:practiceArena.id,mode:'tournament',stage:'tournament',round:1,roundSize:2,tick:practiceArena.tick,done:practiceArena.done,waitTicks:0,arenas:[arenaSnapshot(practiceArena)],matches:[{id:practiceArena.id,ids:state.builds.map(b=>b.id),done:practiceArena.done}],bracket:[],results:{tournament:practiceArena.results}});
    broadcast.round.textContent='CPU 연습 경기';
    broadcast.upnext.textContent='실제 학생 랭킹전이 아닙니다. 다른 화면에서도 판정은 계속되며 추가 보상은 없습니다.';
  }
  function startGrowthBattle(){
    const lesson=state.lesson,inv=lesson.inventory,id=inv.selectedSlotId,receipt=practiceReceipt(lesson);
    if(lesson.phase!=='ACTIVE'||practiceArena&&!practiceArena.done)throw Error('현재 새 CPU 경기를 시작할 수 없습니다.');
    if(receipt&&!receipt.acknowledged)throw Error('강화 결과부터 확인하세요.');
    const own={...freezeBattleBuild(inv,id),id:'practice-me',name:'나의 공'};
    const pool=candidates(tierOf(own.level)).filter(b=>!b.hidden),ball=pool[Math.floor(Math.random()*pool.length)];
    const opponent=buildFrom(ball,'practice-cpu-1','CPU 연습 상대');
    const seed=Math.floor(Math.random()*0xffffffff),builds=[own,opponent];
    practiceArena=createArena(builds,{id:'cpu-'+(++lesson.serial),seed,outcomePolicy:'ranking',limitTicks:2400});
    state.builds=builds;state.battleSlot=id;state.battleInstance=own.instanceId;
    state.session={teacher:true,me:own,options,room:{players:builds,paused:false,cheers:[]},serverOffset:0};
    state.record={matchId:practiceArena.id,practice:true,frames:[arenaSnapshot(practiceArena)],events:[],snapshot:{seed,rulesetVersion:'2.1.0',contentVersion:'2.1.0',frozenBuilds:structuredClone(builds)}};
    state.recordSeq=0;state.growthTab='battle';state.notice='CPU 연습 경기 · 다른 화면에서도 판정은 계속됩니다.';closeLab(labDialog);
    last=performance.now();debt=0;render();frame=requestAnimationFrame(growthLoop);
  }
  function growthLoop(now){
    if(destroyed||state.phase!=='growth'||!practiceArena||practiceArena.done)return;
    debt+=Math.min(100,now-last);last=now;
    while(debt>=1000/60&&!practiceArena.done){
      stepArena(practiceArena);debt-=1000/60;
      for(const e of practiceArena.events)if(e.seq>state.recordSeq){state.record.events.push(structuredClone(e));state.recordSeq=e.seq;}
      if(practiceArena.tick%3===0||practiceArena.done){const f=arenaSnapshot(practiceArena);f.events=[];state.record.frames.push(f);}
    }
    updateGrowthBattle();
    if(practiceArena.done){
      state.record.summary={reason:practiceArena.reason,results:structuredClone(practiceArena.results),events:summarizeEvents(state.record.events,'practice-me')};
      state.history.unshift(state.record);state.history.length=Math.min(3,state.history.length);
      releaseBattleBuild(state.lesson.inventory,state.battleSlot,state.battleInstance);
      if(state.growthTab==='battle')render();else{const node=root.querySelector('[data-growth-status]');if(node)node.textContent=growthStatus();}
    }else frame=requestAnimationFrame(growthLoop);
  }
  function renderQuiz() {
    const [question, answers, correct, explanation] = QUESTIONS[state.index];
    root.innerHTML = header() + '<section class="sf-panel sf-quiz"><span class="sf-kicker">01 · QUIZ</span><div class="sf-quiz-meta"><b>문항 ' + (state.index + 1) + ' / ' + QUESTIONS.length + '</b><span>정답 ' + state.correct + ' · 강화권 ' + (10 + state.correct * 2) + '장</span></div><progress value="' + state.index + '" max="' + QUESTIONS.length + '" aria-label="퀴즈 진행"></progress><h3>' + esc(question) + '</h3><div class="sf-answers">' + answers.map((answer,index) => button('practiceAnswer','<span>' + 'ABCD'[index] + '</span>' + esc(answer),'sf-answer' + (state.answer != null && index === correct ? ' sf-correct' : state.answer === index ? ' sf-wrong' : ''),state.answer != null,index)).join('') + '</div>' +
      (state.answer != null ? '<p class="sf-feedback" role="status"><b>' + (state.answer === correct ? '정답! 강화권 +2장' : '정답은 ' + esc(answers[correct])) + '</b><br>' + esc(explanation) + '</p><div class="sf-actions">' + button('nextQuestion',state.index === QUESTIONS.length - 1 ? '강화 시작' : '다음 문제','sf-primary') + '</div>' : '<p class="sf-note">문항마다 한 번만 제출할 수 있습니다.</p>') + '</section><div class="practice-quiz-skip">' + button('beginForge','현재 정답 수로 강화 시작','sf-link') + '</div>';
  }
  function beginForge() {
    state.phase = 'forge'; state.deadline = Date.now() + 90000;
    fundBuild(state.build,state.correct); state.notice = '기본 10장 + 정답 ' + state.correct + '개 × 2장 = ' + state.build.tickets + '장 지급';
    render();
  }
  function candidates(tier) { return BALL_CATALOG.filter(ball => ball.tier === tier); }
  function labOptions(selected) {
    return candidates(state.labTier).map(ball => '<option value="' + ball.id + '"' + (ball.id === selected ? ' selected' : '') + '>' + (ball.hidden ? '히든' : ball.common ? '공용' : PATHS[ball.path].name) + ' · ' + esc(ball.name) + '</option>').join('');
  }
  function renderLab() {
    const list = candidates(state.labTier);
    if (!list.some(ball=>ball.id === state.left)) state.left = list[0].id;
    if (!list.some(ball=>ball.id === state.right)) state.right = list[1]?.id || list[0].id;
    root.innerHTML = header() + '<section class="practice-lab"><span class="sf-kicker">BALL LAB</span><h3>어떤 기믹이 이길까요?</h3><p>이 실험실에서는 잠금 없이 모든 볼을 선택할 수 있습니다.</p><label class="practice-tier-select">비교할 티어<select data-practice-setting="labTier">' + Array.from({length:20},(_,i)=>20-i).map(tier=>'<option value="'+tier+'"'+(tier===state.labTier?' selected':'')+'>T'+tier+'</option>').join('') + '</select></label><div class="practice-lab-grid"><div><label>나의 공<select data-practice-setting="left">' + labOptions(state.left) + '</select></label>' + ballCard(getBall(state.left)) + '</div><div><label>상대 공<select data-practice-setting="right">' + labOptions(state.right) + '</select></label>' + ballCard(getBall(state.right)) + '</div></div><div class="sf-actions">' + button('labBattle','이 공들로 대결','sf-primary') + button('restartPractice','퀴즈 연습으로') + '</div></section>';
  }
  function buildFrom(ball,id,name) { return {id,name,ballId:ball.id,level:levelOf(ball.tier),tier:ball.tier,classId:ball.classId,element:ball.element,path:ball.path,traitId:ball.tier<=10?compatibleTraits(ball.classId)[0].id:null}; }
  function startBattle(lab = false) {
    stopBattle(); clearTimeout(fxTimer); state.deadline = null; state.fx = null;
    state.lab = lab;
    let builds;
    if (lab) {
      builds = [buildFrom(getBall(state.left),'practice-me','내 공'),buildFrom(getBall(state.right),'practice-cpu-1','상대 공')];
    } else {
      lockBuild(state.build);
      const own = {...state.build,id:'practice-me',name:'나의 공'};
      builds = [own];
      for(let i = 1;i < state.count;i++) {
        const tier = Math.max(1,Math.min(20,tierOf(own.level) + Math.floor(Math.random()*3) - 1));
        const pool = candidates(tier).filter(ball=>!ball.hidden);
        const ball = pool[Math.floor(Math.random()*pool.length)];
        builds.push(buildFrom(ball,'practice-cpu-' + i,'CPU ' + String(i).padStart(2,'0')));
      }
    }
    state.builds = builds; state.phase = 'battle';
    const seed = Math.floor(Math.random()*0x7fffffff);
    competition = createCompetition(builds,lab ? 'tournament' : state.mode,seed,'practice-' + seed);
    state.session = {teacher:true,me:builds[0],options,room:{players:builds,paused:false,cheers:[]},serverOffset:0};
    root.innerHTML = header() + '<div class="practice-live-toolbar"><p>연습 중계 · 교사 화면 체험<br><small>실제 수업의 럼블 전장은 교사 화면에서만 보입니다.</small></p><label>재생 속도<select data-practice-setting="speed"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label></div><div class="practice-broadcast"></div><div class="sf-actions practice-battle-actions">' + button('restartPractice','연습 처음으로') + '</div>';
    speed = 1;
    broadcast = new Broadcast(root.querySelector('.practice-broadcast'),state.session);
    if(options.sound)unlockAudio();
    last = performance.now(); debt = 0; lastSnapshot = -10;
    updateBattle(); frame = requestAnimationFrame(loop);
  }
  function updateBattle() {
    const snapshot = competitionSnapshot(competition);
    const own = snapshot.arenas.find(arena=>arena.balls.some(ball=>ball.id === 'practice-me'));
    if(own && !snapshot.arenas.some(arena=>arena.id === broadcast.focusId))broadcast.focusId = own.id;
    broadcast.update(snapshot);
  }
  function loop(now) {
    if (destroyed || state.phase !== 'battle') return;
    debt += Math.min(100,now-last) * speed; last = now;
    while(debt >= 1000/60 && !competition.done) { stepCompetition(competition); debt -= 1000/60; }
    if(competition.tick - lastSnapshot >= 6 || competition.done) { updateBattle(); lastSnapshot = competition.tick; }
    if(competition.done) {
      state.scores = competition.results; state.phase = 'results'; stopBattle(); render();
    } else frame = requestAnimationFrame(loop);
  }
  function renderResults() {
    const rows = state.scores[state.lab ? 'tournament' : state.mode] || [];
    const own = rows.find(row=>row.id === 'practice-me'), myBall = ballOf(state.builds[0]);
    const winner = rows.find(row=>row.rank === 1);
    root.innerHTML = header() + '<section class="practice-result"><span class="sf-kicker">PRACTICE COMPLETE</span>' + portrait(myBall,'ball-portrait-hero') + '<h3>나의 공, ' + (own?.rank || '—') + '위!</h3><p>T' + myBall.tier + ' ' + esc(myBall.name) + '</p><p class="sf-personal-verdict">' + esc(eliminationText(own,{players:state.builds})) + '</p><p>' + esc(winner?.name || '') + ' 우승 · ' + esc(winner?.reason || '') + '</p><div class="sf-actions">' + button('rematchPractice','같은 공으로 다시 대결','sf-primary') + button('restartPractice','새로 강화하기') + button('openLab','볼 실험실') + '</div></section><section class="sf-panel"><h3>연습 순위표</h3><div class="sf-table-wrap"><table><thead><tr><th>순위</th><th>공</th><th>유효 피해</th><th>처치</th><th>탈락 기록</th></tr></thead><tbody>' + rows.map(row=>'<tr' + (row.id === 'practice-me' ? ' class="sf-own"' : '') + '><td>' + row.rank + '위</td><td>' + esc(row.name) + '</td><td>' + Math.round(row.damage || 0) + '</td><td>' + (row.kills || 0) + '</td><td>' + esc(eliminationText(row,{players:state.builds})) + '</td></tr>').join('') + '</tbody></table></div></section>';
  }
  async function onClick(event) {
    const control = event.target.closest('[data-action]');
    if(!control || control.disabled || !root.contains(control)) return;
    const action = control.dataset.action, value = control.dataset.value;
    try {
      if(action==='demo'||action==='awakeningDemo'){await openDemo(labDialog,value,{...options,awakening:action==='awakeningDemo'});return;}
      if(action === 'beginGrowth')beginGrowth();
      else if(action === 'beginQuiz') { state.phase = 'quiz'; state.deadline = Date.now()+120000; render(); }
      else if(action === 'practiceAnswer' && state.phase === 'quiz' && state.answer == null) { state.answer=Number(value); if(state.answer === QUESTIONS[state.index][2])state.correct++; render(); }
      else if(action === 'nextQuestion' && state.answer != null) { if(state.index === QUESTIONS.length - 1)beginForge(); else {state.index++;state.answer=null;render();} }
      else if(action === 'beginForge' && state.phase === 'quiz')beginForge();
      else if(action === 'restartPractice')reset();
      else if(action === 'openLab') { stopBattle(); state.phase='lab';state.deadline=null;render(); }
      else if(action === 'labBattle')startBattle(true);
      else if(action === 'rematchPractice')startBattle(state.lab);
      else if(state.phase==='growth'){
        const lesson=state.lesson,inv=lesson.inventory,slotId=inv.selectedSlotId;
        if(action==='growthTab'){state.growthTab=value;state.editTrait=false;}
        else if(action==='growthAnswer'){practiceAnswer(lesson,lesson.current?.attemptId,Number(value),Date.now());}
        else if(action==='growthQuestion'){practiceQuestion(lesson,Date.now(),true);state.growthTab='quiz';}
        else if(action==='growthSlot'){selectBall(inv,Number(value));state.growthTab='forge';state.editTrait=false;}
        else if(action==='growthCreate'){
          if(lesson.phase!=='ACTIVE')throw Error('연습 수업이 종료 정리 중입니다.');
          createBall(inv,Number(value));selectBall(inv,Number(value));state.growthTab='forge';
        }else if(action==='growthStore'){
          if(lesson.phase!=='ACTIVE')throw Error('연습 수업이 종료 정리 중입니다.');
          setStorageLock(inv,Number(value),!inv.slots[Number(value)].storageLocked);
        }else if(action==='growthReset'||action==='growthDelete'){
          if(lesson.phase!=='ACTIVE')throw Error('연습 수업이 종료 정리 중입니다.');
          if(practiceReceipt(lesson,Number(value))&&!practiceReceipt(lesson,Number(value)).acknowledged)throw Error('강화 결과부터 확인하세요.');
          if(!confirm(action==='growthReset'?'이 공만 T20으로 초기화할까요? 지갑과 다른 공은 유지됩니다.':'이 슬롯의 공을 삭제할까요? 다시 만들어도 히든 판정은 초기화되지 않습니다.'))return;
          if(action==='growthReset')resetInventoryBall(inv,Number(value));else deleteBall(inv,Number(value));
          delete lesson.receipts[Number(value)];
        }else if(action==='growthBattle'){startGrowthBattle();return;}
        else if(action==='growthReplay'){await openReplay(labDialog,state.history[Number(value)],options);return;}
        else if(action==='growthCompare'){
          if(!state.history[0]||!inv.slots[slotId])throw Error('보관 공과 최근 CPU 경기 기록이 필요합니다.');
          openComparison(labDialog,state.history[0],inventoryBuild(inv,slotId),'practice-me',options);return;
        }else if(action==='ackForge'){acknowledgePracticeForge(lesson,slotId,value,Date.now());}
        else if(action==='editTrait'){state.editTrait=true;state.growthTab='forge';}
        else if(['enhance','protectedEnhance','buyShield','choosePath','chooseBall','chooseTrait','hidden'].includes(action)){
          const result=practiceForge(lesson,slotId,action,value,Date.now());
          if(action==='enhance'||action==='protectedEnhance'){
            state.notice=result.success?'강화 성공을 확인하고 다음 선택으로 이동하세요.':result.protected?'유지권으로 현재 공을 지켰습니다.':'실패 결과를 확인하고 보관 공이나 퀴즈로 이동할 수 있습니다.';
            clearTimeout(fxTimer);fxTimer=setTimeout(()=>{if(!destroyed&&state.phase==='growth'&&state.growthTab==='forge')render();},310);
          }
          if(action==='chooseTrait')state.editTrait=false;
        }else if(action==='fullscreen'){await root.querySelector('[data-stages]')?.requestFullscreen();return;}
        else if(action==='fullscreenExit'&&document.fullscreenElement){await document.exitFullscreen();return;}
        else if(action==='audio'){options.sound=!options.sound;if(options.sound)await unlockAudio();}
        else if(action==='shake')options.shake=!options.shake;
        else if(action==='effects')options.reduced=!options.reduced;
        else if(action==='cheer'&&state.session)state.session.room.cheers=[{name:'나',emoji:value,at:Date.now()}];
        render();
      }
      else if(state.phase === 'forge') {
        if(action==='ackForge'){
          if(!state.receipt||state.receipt.resultId!==value||Date.now()<state.receipt.readyAt)throw Error('강화 결과가 표시된 뒤 확인하세요.');
          state.receipt.acknowledged=true;state.fx=null;
        }else if(action==='editTrait')state.editTrait=true;
        else if(state.receipt&&!state.receipt.acknowledged&&action!=='buyShield')throw Error('강화 결과부터 확인하세요.');
        else if((action === 'enhance'||action==='protectedEnhance') && !state.fx) {
          const result = enhance(state.build,Math.random,Math.random,{protect:action==='protectedEnhance',buyMissing:action==='protectedEnhance'});
          state.receipt={...result,resultId:'local-forge-'+Date.now(),acknowledged:false,readyAt:Date.now()+300};
          state.fx = {style:result.success ? 'sf-success' : 'sf-fail',label:result.success ? 'T' + result.tier + ' 강화 성공!' : result.protected ? '유지권 발동 · 티어 유지' : '강화 실패 · 현재 T' + result.tier};
          state.notice = result.success ? '새로운 티어의 공을 확인하세요.' : result.protected ? '유지권이 공을 지켰습니다.' : '다음 강화를 시도하거나 현재 공으로 출전하세요.';
          fxTimer = setTimeout(()=>{state.fx=null;if(state.phase === 'forge')render();},310);
        } else if(action === 'buyShield') {buyShield(state.build);state.notice='유지권 1개 구매 · 실제 하락이나 초기화를 막은 실패에만 필요한 수만큼 소비합니다.';}
        else if(action === 'shield')toggleShield(state.build,!state.build.useShield);
        else if(action === 'choosePath') {choosePath(state.build,value);state.notice=PATHS[value].name+' 경로 선택 · 이번 티어의 공을 골라주세요.';}
        else if(action === 'chooseBall') {chooseBall(state.build,value);state.notice=getBall(value).name+' 선택 완료';}
        else if(action === 'chooseTrait') {chooseTrait(state.build,value);state.editTrait=false;state.notice='호환 전술 특성 선택 완료';}
        else if(action === 'hidden') {resolveHidden(state.build,value === 'yes');state.notice=value === 'yes' ? '히든 공 해금! 다음 티어에서도 선택할 수 있습니다.' : '현재 공을 유지합니다.';}
        else if(action === 'lock') {if(!buildReady(state.build))throw Error('경로·공·특성 선택을 마친 뒤 출전하세요.');startBattle();return;}
        render();
      } else if(state.phase === 'battle') {
        if(action === 'watch')broadcast.focus(value);
        else if(action === 'fullscreen')await root.querySelector('[data-stages]')?.requestFullscreen();
        else if(action === 'fullscreenExit' && document.fullscreenElement)await document.exitFullscreen();
        else if(action === 'audio') {options.sound=!options.sound;if(options.sound)await unlockAudio();updateBattle();}
        else if(action === 'shake') {options.shake=!options.shake;updateBattle();}
        else if(action === 'effects') {options.reduced=!options.reduced;updateBattle();}
        else if(action === 'cheer') {state.session.room.cheers=[{name:'나',emoji:value,at:Date.now()}];updateBattle();}
      }
    } catch(error) {state.notice=error.message;if(state.phase !== 'battle')render();}
  }
  function onChange(event) {
    const key=event.target.dataset.practiceSetting;
    if(!key)return;
    if(key === 'speed') {speed=Number(event.target.value);return;}
    state[key]=['count','labTier'].includes(key) ? Number(event.target.value) : event.target.value;
    if(key === 'mode')state.count=state.mode === 'rumble' ? 30 : 8;
    render();
  }
  const timer=setInterval(()=>{
    if(!state?.deadline || destroyed)return;
    const remaining=state.deadline-Date.now(), node=root.querySelector('[data-practice-clock]');
    if(node)node.textContent=clock(remaining);
    const review=root.querySelector('[data-practice-review-clock]');if(review)review.textContent=reviewClock();
    if(remaining <= 0) {
      if(state.phase==='growth'){
        if(state.lesson.phase==='ACTIVE'){state.lesson.phase='DRAINING';state.deadline=Date.now()+45000;state.notice='신규 강화·보상·CPU 출전을 닫고 기존 경기와 선택을 정리합니다.';}
        else {
          if(practiceArena&&!practiceArena.done){cancelAnimationFrame(frame);releaseBattleBuild(state.lesson.inventory,state.battleSlot,state.battleInstance);practiceArena=null;state.notice='시간 내 끝나지 않은 CPU 경기는 무효 처리했습니다.';}
          finishPracticeLesson(state.lesson);state.deadline=null;
        }
        render();
      }else if(state.phase === 'quiz')beginForge();
      else if(state.phase === 'forge')startBattle();
    }
  },250);
  root.addEventListener('click',onClick);root.addEventListener('change',onChange);
  reset();
  return ()=>{destroyed=true;stopBattle();closeLab(labDialog);labDialog.remove();clearInterval(timer);clearTimeout(fxTimer);root.removeEventListener('click',onClick);root.removeEventListener('change',onChange);};
}
