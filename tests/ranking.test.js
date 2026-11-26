import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {Room} from '../apps/server/room.js';
import {createGameServer} from '../apps/server/index.js';
import {TestPeer} from '../tools/ws-client.js';
import {eloDelta,RANKING_RULES} from '../apps/server/ranking.js';
import {finalizeBuild} from '../packages/content/forge.js';
import {parseBank} from '../apps/server/quiz.js';
import {getBallChoices} from '../packages/content/balls.js';
import {PACK_LIST,validatePack} from '../packages/content/packs.js';
import {BALL_CATALOG} from '../packages/content/balls.js';
import {HIDDEN_CLASSES} from '../packages/content/economy.js';

function setup(count=2,bank) {
  const room=new Room('210021',0);if(bank)room.bank=parseBank(bank);
  const students=Array.from({length:count},(_,i)=>room.add(`학생${i}`));room.startQuiz(0);
  let serial=0;
  const op=(p,type,fields={},at=room.ranking.lastAt,id='op'+(++serial))=>{room.tick(at);return room.dispatch(p,{type,commandId:id,runId:room.runId,...fields},at);};
  return {room,students,op};
}
function answer(f,p,at,id) {const q=p.rankingQuestion;return f.op(p,'answer',{questionId:q.id,attemptId:q.attemptId,answerId:q.correctAnswer.id},at,id);}
function finish(f) {for(let i=0;i<500&&f.room.ranking.active.size;i++)f.room.tick(f.room.ranking.lastAt+100);assert.equal(f.room.ranking.active.size,0);}

test('ranking is the default; active late join funds once and shared wallet has independent three slots',()=>{
  const f=setup(),[p]=f.students;assert.equal(f.room.phase,'ACTIVE');assert.equal(f.room.settings.sessionMinutes,15);
  assert.equal(p.inventory.tickets,10);assert.deepEqual(p.inventory.slots.map(Boolean),[true,false,false]);
  f.op(p,'createBall',{slotId:1});f.op(p,'createBall',{slotId:2});assert.equal(p.inventory.tickets,10);
  const late=f.room.add('늦게');assert.equal(late.waiting,false);assert.equal(late.inventory.tickets,10);
  f.room.ranking.join(late);assert.equal(late.inventory.tickets,10);
  const one=structuredClone(p.inventory.slots[1]);f.op(p,'resetBall',{slotId:0});assert.deepEqual(p.inventory.slots[1],one);
  assert.equal(p.rating,1000);assert.equal(p.inventory.tickets,10);
});
test('continuous quiz gives +2 once, unseen first, 90 seconds AND distinct-intervening rule beyond 20 answers',()=>{
  const f=setup(1),[p]=f.students;
  const first=p.rankingQuestion,fields={questionId:first.id,attemptId:first.attemptId,answerId:first.correctAnswer.id};
  assert.equal(f.op(p,'answer',fields,0,'answer-one').awarded,2);
  assert.equal(f.op(p,'answer',fields,0,'answer-one').awarded,2);assert.equal(p.inventory.tickets,12);
  assert.throws(()=>f.op(p,'answer',fields),/첫 제출/);
  const seen=new Set([first.id]);
  for(let i=1;i<20;i++){assert.ok(!seen.has(p.rankingQuestion.id));seen.add(p.rankingQuestion.id);answer(f,p,0);}
  assert.equal(p.correct,20);assert.equal(p.inventory.tickets,50);assert.equal(p.rankingQuestion,null);
  assert.equal(f.room.state(p,0).me.quizWaitMs,90000);
  f.room.tick(89999);assert.equal(p.rankingQuestion,null);f.room.tick(90000);assert.ok(p.rankingQuestion);
  answer(f,p,90000);assert.equal(p.correct,21);assert.equal(p.inventory.tickets,52);
  const publicState=JSON.stringify(f.room.state(p,90000));assert.ok(!publicState.includes('correctAnswer'));assert.ok(!publicState.includes('quizLedger'));assert.ok(!publicState.includes(p.token));
});
test('one-question bank offers timed review and pause freezes quiz cooldown and session clock',()=>{
  const f=setup(1,'하나|정답|오답1|오답2|오답3'),[p]=f.students;
  answer(f,p,0);assert.equal(p.rankingQuestion,null);f.op(f.room.teacher,'pause',{},1000);
  f.room.tick(100000);assert.equal(f.room.ranking.clockMs,1000);
  f.op(f.room.teacher,'resumeGame',{},100000);f.room.tick(188999);assert.equal(p.rankingQuestion,null);
  f.room.tick(189000);assert.ok(p.rankingQuestion);assert.equal(p.inventory.tickets,12);
});
test('forge receipt is immutable across duplicate clicks, choices require result acknowledgement and 300ms',()=>{
  const f=setup(),[p]=f.students;
  const receipt=f.op(p,'enhance',{slotId:0,protect:false},0,'hammer');
  assert.equal(p.inventory.tickets,9);assert.equal(receipt.acknowledged,false);
  assert.deepEqual(f.op(p,'enhance',{slotId:1,protect:false},0,'hammer'),receipt);assert.equal(p.inventory.tickets,9);
  assert.throws(()=>f.op(p,'enhance',{slotId:0},10),/확인/);
  assert.throws(()=>f.op(p,'ackForge',{slotId:0,resultId:receipt.resultId},299),/확인/);
  f.op(p,'ackForge',{slotId:0,resultId:receipt.resultId},300);
  assert.equal(p.inventory.slots[0].lastForge.acknowledged,true);
  assert.deepEqual(f.op(p,'enhance',{slotId:0},300,'hammer'),receipt);
  assert.equal(f.room.state(p,300).me.pendingForge.resultId,receipt.resultId);
});
test('protected insufficient request is atomic and cannot borrow another concurrent slot wallet',()=>{
  const f=setup(),[p]=f.students;f.op(p,'createBall',{slotId:1});
  p.inventory.slots[0].level=18;finalizeBuild(p.inventory.slots[0]);p.inventory.tickets=6;
  const before=structuredClone(p.inventory);
  assert.throws(()=>f.op(p,'enhance',{slotId:0,protect:true,buyMissing:true}),/부족/);assert.deepEqual(p.inventory,before);
  p.inventory.tickets=1;f.op(p,'enhance',{slotId:1,protect:false});
  assert.equal(p.inventory.tickets,0);assert.throws(()=>f.op(p,'enhance',{slotId:0,protect:false}),/부족/);
});
test('queue snapshot locks one slot, allows quiz and another slot, cancel loses to assigned match, Elo settles once',()=>{
  const f=setup(),[a,b]=f.students;f.op(a,'createBall',{slotId:1});
  f.op(a,'storageLock',{slotId:0,enabled:true});f.op(a,'queue',{slotId:0});
  assert.equal(a.inventory.slots[0].locked,true);assert.throws(()=>f.op(a,'resetBall',{slotId:0}));
  f.op(a,'enhance',{slotId:1,protect:false});answer(f,a,0);
  f.op(b,'queue',{slotId:0});const match=[...f.room.ranking.active.values()][0],frozen=structuredClone(match.builds[0]);
  assert.equal(a.currentMatch,b.currentMatch);assert.throws(()=>f.op(a,'cancelQueue'),/배정/);
  assert.throws(()=>f.op(a,'matchResult',{winnerId:a.id,damage:999999}));assert.equal(a.rating,1000);
  assert.deepEqual(match.builds[0],frozen);finish(f);
  assert.equal(a.rating+b.rating,2000);assert.ok(Math.abs(a.ratingDelta)<=16);const rating=a.rating;
  f.room.ranking.settle(match);assert.equal(a.rating,rating);assert.equal(a.inventory.slots[0].level,0);
  assert.equal(a.inventory.slots[0].locked,false);assert.equal(a.inventory.slots[0].storageLocked,true);
  assert.equal(eloDelta(1000,1000,1),16);assert.equal(eloDelta(1000,1000,0),-16);assert.equal(eloDelta(1000,1000,.5),0);
  assert.equal(f.room.teacher.focus,match.id);assert.ok(f.room.frame(f.room.teacher).selectedResult);
});
test('15 simultaneous duels are private, Top10 exposes no wallets and each student retains own rank',()=>{
  const f=setup(30);
  for(const p of f.students)f.op(p,'queue',{slotId:0});assert.equal(f.room.ranking.active.size,15);
  assert.equal(f.room.frame(f.room.teacher).arenas.length,1);
  const target=[...f.room.ranking.active.keys()][14];f.op(f.room.teacher,'watch',{matchId:target});
  assert.equal(f.room.frame(f.room.teacher).arenas[0].id,target);
  for(const p of f.students){const state=f.room.state(p,0),frame=f.room.frame(p);assert.equal(frame.arenas.length,1);assert.equal(frame.arenas[0].id,p.currentMatch);
    assert.equal(frame.matches.length,1);assert.equal(state.room.ranking.top10.length,10);assert.ok(state.me.rank>=1&&state.me.rank<=30);
    assert.ok(state.room.players.every(row=>!('tickets'in row)&&!('inventory'in row)&&!('correct'in row)));}
  assert.throws(()=>f.op(f.students[0],'watch',{matchId:target}),/자신/);
});
test('DRAINING rejects new rewards/matching/forge, permits only approved choices and finishes within logical 45s',()=>{
  const f=setup(2),[a,b]=f.students;
  a.inventory.slots[0].level=2;a.inventory.slots[0].pendingChoice=true;
  a.inventory.slots[0].lastForge={resultId:'approved',commandId:'already',createdAt:0,acknowledged:false};
  f.op(f.room.teacher,'endSession',{},500);
  assert.equal(f.room.phase,'DRAINING');assert.throws(()=>f.op(b,'queue',{slotId:0},501));
  assert.throws(()=>f.op(b,'answer',{},502));assert.throws(()=>f.op(b,'enhance',{slotId:0},503));
  f.op(a,'ackForge',{slotId:0,resultId:'approved'},510);
  assert.throws(()=>f.op(a,'chooseBall',{slotId:0,resultId:'other',ballId:'no'},511));
  f.op(f.room.teacher,'pause',{},1000);f.room.tick(80000);assert.equal(f.room.phase,'DRAINING');
  f.op(f.room.teacher,'resumeGame',{},80000);f.room.tick(124500);assert.equal(f.room.phase,'RESULTS');
  assert.equal(a.inventory.slots[0].level,2);assert.equal(a.inventory.slots[0].pendingChoice,false);assert.equal(a.autoFinalized.length,1);
  assert.equal(b.inventory.tickets,10);assert.equal(a.rating,1000);
});
test('recorded replay preserves authoritative final frame and recent three shared records, never grants rewards',()=>{
  const f=setup(3),[a,b,c]=f.students;const matchIds=[];
  for(let n=0;n<4;n++) {f.op(a,'queue',{slotId:0});f.op(b,'queue',{slotId:0});const id=a.currentMatch;matchIds.push(id);finish(f);}
  assert.equal(a.recentMatches.length,3);assert.equal(b.recentMatches.length,3);
  const replay=f.op(a,'replay',{matchId:a.recentMatches[0]}),wallet=a.inventory.tickets,rating=a.rating;
  assert.equal(replay.frames.at(-1).done,true);assert.equal(replay.finalHash,replay.summary.finalHash);
  assert.equal(replay.snapshot.rulesetVersion,'2.2.0');assert.ok(replay.frames.length>2);assert.ok(replay.events.length>0);
  assert.throws(()=>f.op(c,'replay',{matchId:a.recentMatches[0]}),/최근/);
  assert.throws(()=>f.op(a,'replay',{matchId:matchIds[0]}),/최근/);
  f.op(a,'replay',{matchId:a.recentMatches[0]});assert.equal(a.rating,rating);assert.equal(a.inventory.tickets,wallet);
  // Teacher's original selected result is the sole additional retained reference.
  assert.ok(f.room.ranking.records.size<=4);assert.ok(f.room.ranking.recordBytes>0);
});

test('DRAINING rejects completed trait edits but allows each pending approved selection exactly once',()=>{
  const f=setup(2),[a,b]=f.students;
  // A completed T10 may change a trait during ACTIVE, but an old receipt is
  // not permission to keep editing after the teacher closes admission.
  const ready=a.inventory.slots[0];ready.level=10;ready.pendingChoice=true;finalizeBuild(ready);
  ready.lastForge={resultId:'ready',commandId:'old-ready',createdAt:0,acknowledged:true};
  f.op(a,'chooseTrait',{slotId:0,resultId:'ready',traitId:'stability'},400);
  f.op(a,'createBall',{slotId:1},400);
  Object.assign(a.inventory.slots[1],{level:2,pendingChoice:true,lastForge:{resultId:'keep-draining',createdAt:0,acknowledged:false}});
  Object.assign(b.inventory.slots[0],{level:10,pendingChoice:true,awakeningRolled:true,hiddenOffer:HIDDEN_CLASSES[0],hiddenDecision:null,
    lastForge:{resultId:'pending-t10',commandId:'old-pending',createdAt:0,acknowledged:false}});
  f.op(f.room.teacher,'endSession',{},500);
  const before=structuredClone(a.inventory);
  assert.throws(()=>f.op(a,'chooseTrait',{slotId:0,resultId:'ready',traitId:'impact_rhythm'},501),/남은 선택/);
  assert.throws(()=>f.op(a,'ackForge',{slotId:0,resultId:'ready'},502),/남은 선택/);
  assert.throws(()=>f.op(a,'chooseBall',{slotId:0,resultId:'ready',ballId:ready.ballId},503),/남은 선택/);
  assert.deepEqual(a.inventory,before);
  const fields={slotId:0,resultId:'pending-t10'};
  f.op(b,'ackForge',fields,510);
  f.op(b,'choosePath',{...fields,pathId:'earth'},511);
  f.op(b,'chooseBall',{...fields,ballId:'earth-10-mace'},512);
  f.op(b,'hidden',{...fields,accept:false},513);
  assert.equal(b.inventory.slots[0].pendingTrait,true);
  f.op(b,'chooseTrait',{...fields,traitId:'stability'},514,'drain-trait');
  const completed=structuredClone(b.inventory);
  assert.deepEqual(f.op(b,'chooseTrait',{...fields,traitId:'stability'},515,'drain-trait'),{resultId:'pending-t10',ready:true,walletAfter:{tickets:10,shields:0}});
  assert.throws(()=>f.op(b,'chooseTrait',{...fields,traitId:'long_reach'},516),/남은 선택/);
  assert.deepEqual(b.inventory,completed);assert.equal(f.room.phase,'DRAINING');
});
test('every classroom pack has legal complete paths, is fixed after start and survives slot reset',()=>{
  for(const pack of PACK_LIST)assert.equal(validatePack(pack.id,BALL_CATALOG).ok,true);
  const room=new Room('222222',0);room.settings.packId='defense';const p=room.add('팩');room.startQuiz(0);
  assert.throws(()=>room.dispatch(room.teacher,{type:'settings',packId:'all',commandId:'pack-change',runId:room.runId},0),/로비/);
  const b=p.inventory.slots[0];b.level=10;b.pendingChoice=true;finalizeBuild(b);assert.equal(b.path,'water');
  assert.ok(getBallChoices({...b,pendingChoice:true}).every(x=>x.common||x.hidden||x.path==='water'));
  assert.ok(!getBallChoices({...b,pendingChoice:true,path:'water'}).some(x=>x.classId==='frost'));
  room.dispatch(p,{type:'resetBall',slotId:0,commandId:'reset',runId:room.runId},0);assert.equal(p.inventory.slots[0].packId,'defense');
  room.dispatch(p,{type:'createBall',slotId:1,commandId:'new',runId:room.runId},0);assert.equal(p.inventory.slots[1].packId,'defense');
  const goals=room.state(p,0).me.goals;assert.equal(goals.length,3);assert.ok(goals.every(g=>g.complete===false));
});
test('record capacity bounds memory without fake replay, extra Elo or dropping recent records',()=>{
  const f=setup(),[a,b]=f.students;
  f.room.ranking.recordBytes=RANKING_RULES.maxArchiveBytes;
  f.op(a,'queue',{slotId:0});f.op(b,'queue',{slotId:0});assert.equal(f.room.ranking.active.size,0);
  assert.match(f.room.state(a,0).room.ranking.queueNotice,/기록 메모리/);
  f.room.ranking.recordBytes=0;f.room.ranking.matchWaiting();const match=[...f.room.ranking.active.values()][0];
  match.rawBytes=RANKING_RULES.maxRecordBytes-1;f.room.tick(100);
  assert.equal(f.room.ranking.active.size,0);assert.equal(a.rating,1000);assert.equal(b.rating,1000);
  const replay=f.op(a,'replay',{matchId:a.recentMatches[0]},100);assert.equal(replay.summary.status,'void');assert.match(replay.unavailableReason,/기록 상한/);
  assert.equal(a.achievements.matches,0);
});
test('real ranking WebSockets restore teacher/student identity, receipt, wallet and their own selected game',async t=>{
  const app=createGameServer({password:'ranking-test',production:false,origins:[]});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');t.after(()=>app.close());
  const url='ws://127.0.0.1:'+app.server.address().port+'/ws';let host=await TestPeer.connect(url),a=await TestPeer.connect(url),b=await TestPeer.connect(url);
  const hostIdentity=await host.send('create',{password:'ranking-test'});await host.until(p=>p.state);
  const aIdentity=await a.send('join',{code:hostIdentity.code,name:'가'});await a.until(p=>p.state);await b.send('join',{code:hostIdentity.code,name:'나'});await b.until(p=>p.state);
  await host.send('start');await a.until(p=>p.state.room.phase==='ACTIVE');assert.equal(a.state.me.inventory.tickets,10);
  const result=await a.send('enhance',{slotId:0,protect:false},'same-hammer');
  const old=a.ws,closed=once(old,'close');a=await TestPeer.connect(url);await a.send('resume',aIdentity);await a.until(p=>p.state?.me.pendingForge?.resultId===result.resultId);assert.equal((await closed)[0],4001);
  assert.equal(a.state.me.inventory.tickets,9);await a.send('enhance',{slotId:0,protect:false},'same-hammer');
  await new Promise(r=>setTimeout(r,310));await a.send('ackForge',{slotId:0,resultId:result.resultId});await a.send('queue',{slotId:0});await b.send('queue',{slotId:0});
  await a.until(p=>p.lastFrame?.arenas?.length===1);await b.until(p=>p.lastFrame?.arenas?.length===1);
  assert.equal(a.lastFrame.arenas[0].id,b.lastFrame.arenas[0].id);assert.equal(a.lastFrame.matches.length,1);
  host.disconnect();host=await TestPeer.connect(url);await host.send('resume',hostIdentity);await host.until(p=>p.state?.me.role==='teacher');assert.equal(host.state.room.ranking.matches.length,1);
  assert.equal(a.state.me.inventory.tickets,9);assert.equal(a.state.room.bank,undefined);
  await host.send('endSession');await a.until(p=>p.state.room.phase==='DRAINING');
  assert.deepEqual(await a.send('enhance',{slotId:0,protect:false,phase:'ACTIVE'},'same-hammer'),result);
  assert.equal(a.state.me.inventory.tickets,9);
});
