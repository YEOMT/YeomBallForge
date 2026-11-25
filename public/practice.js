import { BALL_CATALOG, PATHS, getBall, levelOf, tierOf } from './packages/content/balls.js';
import { initialBuild, fundBuild, enhance, buyShield, toggleShield, choosePath, chooseBall, resolveHidden, lockBuild } from './packages/content/forge.js';
import { createCompetition, stepCompetition, competitionSnapshot } from './packages/sim/index.js';
import { drawEmblem, unlockAudio } from './arena.js';
import { Broadcast } from './session-battle.js';
import { forge, button, esc } from './session-screens.js';
import { ballOf, ballCard, portrait, eliminationText } from './ball-ui.js';

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
  let state, frame = 0, broadcast, competition, fxTimer, destroyed = false;
  let speed = 1, last = 0, debt = 0, lastSnapshot = -10;
  let options = {sound:false,shake:!matchMedia('(prefers-reduced-motion: reduce)').matches,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,...preferences()};
  root.classList.add('sf-session','practice-app');

  function reset() {
    stopBattle(); clearTimeout(fxTimer);
    state = {phase:'intro',mode:'tournament',count:8,correct:0,index:0,answer:null,build:initialBuild(),notice:'',lab:false,labTier:10,left:'blade-10-blade',right:'common-10-elastic'};
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
    else if (state.phase === 'quiz') renderQuiz();
    else if (state.phase === 'forge') {
      const session = {teacher:false,me:{...state.build,correct:state.correct},room:{paused:false},busy:false,forgeFx:state.fx};
      root.innerHTML = header() + forge(session) + '<p class="practice-notice" role="status">' + esc(state.notice) + '</p>';
      const canvas = root.querySelector('[data-emblem]');
      if(canvas)drawEmblem(canvas,state.build);
    } else if (state.phase === 'lab') renderLab();
    else if (state.phase === 'results') renderResults();
  }
  function renderIntro() {
    root.innerHTML = header() + '<section class="practice-intro"><span class="sf-kicker">MAKE. EVOLVE. BATTLE.</span><h3>나만의 공을 완성해 보세요.</h3><p>퀴즈 정답으로 강화권을 모으고, 티어마다 공을 선택해 CPU와 대결합니다.</p><div class="practice-steps"><span>01 퀴즈</span><i>→</i><span>02 강화·선택</span><i>→</i><span>03 자동 전투</span></div><div class="practice-config"><label>경기 방식<select data-practice-setting="mode"><option value="tournament"' + (state.mode === 'tournament' ? ' selected' : '') + '>토너먼트</option><option value="rumble"' + (state.mode === 'rumble' ? ' selected' : '') + '>전원 럼블</option></select></label><label>나를 포함한 참가 공<select data-practice-setting="count">' + [4,8,16,30].map(n => '<option value="' + n + '"' + (state.count === n ? ' selected' : '') + '>' + n + '개</option>').join('') + '</select></label></div>' +
      button('beginQuiz','퀴즈부터 시작','sf-primary') + '<p class="sf-note">샘플 10문항 · 퀴즈 2분 · 강화 90초 · 기본 10장 + 정답당 2장</p></section><section class="practice-lab-teaser"><div><h4>볼 실험실</h4><p>궁금한 티어와 공을 직접 골라 능력을 비교하세요.</p></div>' + button('openLab','원하는 공으로 대결') + '</section>';
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
  function buildFrom(ball,id,name) { return {id,name,ballId:ball.id,level:levelOf(ball.tier),tier:ball.tier,classId:ball.classId,element:ball.element,path:ball.path}; }
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
      if(action === 'beginQuiz') { state.phase = 'quiz'; state.deadline = Date.now()+120000; render(); }
      else if(action === 'practiceAnswer' && state.phase === 'quiz' && state.answer == null) { state.answer=Number(value); if(state.answer === QUESTIONS[state.index][2])state.correct++; render(); }
      else if(action === 'nextQuestion' && state.answer != null) { if(state.index === QUESTIONS.length - 1)beginForge(); else {state.index++;state.answer=null;render();} }
      else if(action === 'beginForge' && state.phase === 'quiz')beginForge();
      else if(action === 'restartPractice')reset();
      else if(action === 'openLab') { stopBattle(); state.phase='lab';state.deadline=null;render(); }
      else if(action === 'labBattle')startBattle(true);
      else if(action === 'rematchPractice')startBattle(state.lab);
      else if(state.phase === 'forge') {
        if(action === 'enhance' && !state.fx) {
          const result = enhance(state.build,Math.random);
          state.fx = {style:result.success ? 'sf-success' : 'sf-fail',label:result.success ? 'T' + result.tier + ' 강화 성공!' : result.protected ? '유지권 발동 · 티어 유지' : '강화 실패 · 현재 T' + result.tier};
          state.notice = result.success ? '새로운 티어의 공을 확인하세요.' : result.protected ? '유지권이 공을 지켰습니다.' : '다음 강화를 시도하거나 현재 공으로 출전하세요.';
          fxTimer = setTimeout(()=>{state.fx=null;if(state.phase === 'forge')render();},600);
        } else if(action === 'buyShield') {buyShield(state.build);state.notice='유지권 1개 구매 · 적용을 켜면 T9부터 하락을 막습니다.';}
        else if(action === 'shield')toggleShield(state.build,!state.build.useShield);
        else if(action === 'choosePath') {choosePath(state.build,value);state.notice=PATHS[value].name+' 경로 선택 · 이번 티어의 공을 골라주세요.';}
        else if(action === 'chooseBall') {chooseBall(state.build,value);state.notice=getBall(value).name+' 선택 완료';}
        else if(action === 'hidden') {resolveHidden(state.build,value === 'yes');state.notice=value === 'yes' ? '히든 공 해금! 다음 티어에서도 선택할 수 있습니다.' : '현재 공을 유지합니다.';}
        else if(action === 'lock') {startBattle();return;}
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
    if(remaining <= 0) {
      if(state.phase === 'quiz')beginForge();
      else if(state.phase === 'forge')startBattle();
    }
  },250);
  root.addEventListener('click',onClick);root.addEventListener('change',onChange);
  reset();
  return ()=>{destroyed=true;stopBattle();clearInterval(timer);clearTimeout(fxTimer);root.removeEventListener('click',onClick);root.removeEventListener('change',onChange);};
}
