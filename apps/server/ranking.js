import { randomInt, randomUUID, createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { ensure } from '../../packages/protocol/index.js';
import { tierOf, TICKETS_PER_CORRECT, ECONOMY_VERSION } from '../../packages/content/economy.js';
import { createInventory, fundInventory, inventoryBuild, createBall, resetInventoryBall, deleteBall, setStorageLock, mutateBall } from '../../packages/content/inventory.js';
import { buildReady, finalizeBuild } from '../../packages/content/forge.js';
import { createArena, stepArena, arenaSnapshot, RULESET_VERSION } from '../../packages/sim/index.js';
import {summarizeEvents} from '../../packages/sim/replay.js';
import {buildHighlights} from '../../packages/sim/highlights.js';
import {CONTENT_VERSION} from '../../packages/content/balls.js';
import {FeaturedMatches} from './broadcast.js';
import { assignQuestions, publicQuestion, shuffle } from './quiz.js';
import { forgeAction, FORGE_COMMANDS, CHOICE_COMMANDS, publicBuild } from './forge-actions.js';

export const RANKING_RULES=Object.freeze({version:'2.1.0',initialRating:1000,k:32,quizRepeatMs:90000,drainMs:45000,
  maxMatches:15,frameEveryTicks:6,recentMatches:3,recordMaxTicks:2400,recordMaxEvents:40000,
  maxRecordBytes:2*1024*1024,maxArchiveBytes:64*1024*1024,maxCommands:8192});
const clone=v=>structuredClone(v);
const validSlot=id=>Number.isInteger(id)&&id>=0&&id<3;
const round=v=>Math.round(v*100)/100;
export function eloDelta(a,b,score){return Math.round(RANKING_RULES.k*(score-1/(1+10**((b-a)/400))));}

export class RankingSession {
  constructor(room,now) {
    this.room=room;this.clockMs=0;this.lastAt=now;this.endAt=room.settings.sessionMinutes*60000;this.drainAt=null;
    this.accumulator=0;this.active=new Map();this.records=new Map();this.completed=new Set();this.version=0;this.recordBytes=0;
    this.metrics={ticks:0,tickMs:[],maxActive:0,maxEvents:0,maxFrameBytes:0};
    this.featured=new FeaturedMatches();
    this.bankOrder=shuffle(room.bank.items);
    for(const p of room.active())this.join(p);
  }
  join(p) {
    if(p.inventory)return;
    p.waiting=false;p.inventory=createInventory(p.id);fundInventory(p.inventory);p.rating=1000;p.ratingDelta=0;p.bestRating=1000;
    p.inventory.packId=this.room.settings.packId;p.inventory.slots[0].packId=this.room.settings.packId;
    p.queue=null;p.currentMatch=null;p.recentMatches=[];p.recentOpponents=[];p.quizLedger=new Map();p.answerHistory=[];p.rankingQuestion=null;
    p.quizCursor=randomInt(this.bankOrder.length);p.correct=0;p.answered=0;p.lastAnswer=null;
    p.achievements={profiles:[],discovered:['basic'],guardRiposte:false,matches:0};this.nextQuestion(p);
  }
  advanceClock(now) {
    const delta=Math.max(0,now-this.lastAt);this.lastAt=now;
    if(!this.room.paused)this.clockMs+=delta;
    return delta;
  }
  nextQuestion(p) {
    if(p.rankingQuestion||this.room.phase!=='ACTIVE')return p.rankingQuestion;
    const count=this.bankOrder.length,others=Math.min(4,count-1);
    const ordered=Array.from({length:count},(_,i)=>this.bankOrder[(p.quizCursor+i)%count]);
    const unseen=ordered.find(q=>!p.quizLedger.has(q.id));
    const eligible=unseen||ordered.find(q=>{const last=p.quizLedger.get(q.id);return this.clockMs-last.at>=90000&&this.intervening(p,q.id,last.serial)>=others;});
    if(eligible) {
      p.rankingQuestion=assignQuestions([eligible])[0];p.quizCursor=(this.bankOrder.indexOf(eligible)+1)%count;
    }
    return p.rankingQuestion;
  }
  waitMs(p) {
    if(p.rankingQuestion)return 0;
    const others=Math.min(4,this.bankOrder.length-1),waits=this.bankOrder.filter(q=>{const x=p.quizLedger.get(q.id);return x&&this.intervening(p,q.id,x.serial)>=others;}).map(q=>Math.max(0,90000-(this.clockMs-p.quizLedger.get(q.id).at)));
    return waits.length?Math.min(...waits):null;
  }
  intervening(p,id,serial) {
    const distinct=new Set();
    for(let i=serial;i<p.answerHistory.length&&distinct.size<4;i++)if(p.answerHistory[i]!==id)distinct.add(p.answerHistory[i]);
    return distinct.size;
  }
  answer(p,msg) {
    const q=p.rankingQuestion;
    ensure(q&&msg.questionId===q.id&&msg.attemptId===q.attemptId,'현재 문항의 첫 제출만 인정됩니다.');
    ensure(q.answers.some(a=>a.id===msg.answerId),'보기 중 하나를 선택하세요.');
    const correct=q.correctAnswer.id===msg.answerId;
    p.answered++;p.answerHistory.push(q.id);if(correct){p.correct++;p.inventory.tickets+=TICKETS_PER_CORRECT;}
    p.quizLedger.set(q.id,{at:this.clockMs,serial:p.answered});p.rankingQuestion=null;
    p.lastAnswer={questionId:q.id,attemptId:q.attemptId,correct,correctText:q.correctAnswer.text,
      explanation:q.explanation||`정답은 ${q.correctAnswer.text}입니다. 문제와 보기를 다시 비교해 보세요.`,awarded:correct?TICKETS_PER_CORRECT:0};
    this.nextQuestion(p);return clone(p.lastAnswer);
  }
  selected(p,slotId=p.inventory.selectedSlotId) {
    ensure(validSlot(slotId)&&p.inventory.slots[slotId],'선택한 공 슬롯을 확인하세요.');return slotId;
  }
  snapshotBuild(p,slotId) {
    const b=inventoryBuild(p.inventory,slotId);
    return {id:p.id,name:p.name,instanceId:b.instanceId,slotId,level:b.level,tier:tierOf(b.level),classId:b.classId,
      ballId:b.ballId,profileId:b.profileId??b.classId,path:b.path,element:b.element,traitId:b.traitId??null,buildVersion:b.buildVersion??'2.1.0'};
  }
  queue(p,slotId) {
    this.selected(p,slotId);ensure(!p.queue&&!p.currentMatch,'이미 대기하거나 경기 중입니다.');
    const b=p.inventory.slots[slotId];ensure(buildReady(b)&&(!b.lastForge||b.lastForge.acknowledged),'공·히든·특성 선택과 결과 확인을 마치세요.');
    ensure(!b.locked,'이미 출전이 확정된 공입니다.');
    p.queue={slotId,queuedAt:this.clockMs,build:this.snapshotBuild(p,slotId)};b.locked=true;
    p.inventory.selectedSlotId=slotId;
  }
  cancel(p) {
    ensure(!p.currentMatch,'이미 경기가 배정되어 대기를 취소할 수 없습니다.');
    if(p.queue){p.inventory.slots[p.queue.slotId].locked=false;p.queue=null;}
  }
  action(p,msg,now) {
    ensure(p.inventory&&!p.waiting,'수업에 참가한 뒤 사용하세요.');
    ensure(!this.room.paused,'경기가 일시정지 상태입니다.');
    if(msg.type==='replay')return this.replay(p,msg.matchId);
    if(msg.type==='selectSlot') {this.selected(p,msg.slotId);p.inventory.selectedSlotId=msg.slotId;return {};}
    const active=this.room.phase==='ACTIVE'&&this.clockMs<this.endAt;
    const drain=this.room.phase==='DRAINING';
    ensure(active||(drain&&CHOICE_COMMANDS.has(msg.type)),'접수 시간이 종료되었습니다.');
    if(msg.type==='answer')return this.answer(p,msg);
    if(msg.type==='nextQuestion'){this.nextQuestion(p);return {question:publicQuestion(p.rankingQuestion),quizWaitMs:this.waitMs(p)};}
    if(msg.type==='queue'){this.queue(p,msg.slotId??p.inventory.selectedSlotId);this.matchWaiting();return {};}
    if(msg.type==='cancelQueue'){this.cancel(p);return {};}
    const slotId=msg.slotId??p.inventory.selectedSlotId;
    if(msg.type==='createBall'){ensure(validSlot(slotId),'슬롯 번호를 확인하세요.');createBall(p.inventory,slotId).packId=this.room.settings.packId;p.inventory.selectedSlotId=slotId;return {};}
    this.selected(p,slotId);
    if(msg.type==='resetBall'){resetInventoryBall(p.inventory,slotId);return {};}
    if(msg.type==='deleteBall'){deleteBall(p.inventory,slotId);return {};}
    if(msg.type==='storageLock'){ensure(!msg.enabled||!p.inventory.slots[slotId].lastForge||p.inventory.slots[slotId].lastForge.acknowledged,'강화 결과를 먼저 확인하세요.');setStorageLock(p.inventory,slotId,msg.enabled);return {};}
    ensure(FORGE_COMMANDS.has(msg.type)&&msg.type!=='lock','알 수 없는 학생 명령입니다.');
    let result;
    mutateBall(p.inventory,slotId,b=>{result=forgeAction(b,msg,this.clockMs,{allowNew:active});});
    if(['chooseBall','hidden','chooseClass'].includes(msg.type))p.achievements.discovered=[...new Set([...p.achievements.discovered,p.inventory.slots[slotId].classId])];
    return result;
  }
  matchWaiting() {
    if(this.room.phase!=='ACTIVE'||this.room.paused||this.clockMs>=this.endAt)return;
    let waiting=this.room.active().filter(p=>p.queue&&!p.currentMatch).sort((a,b)=>a.queue.queuedAt-b.queue.queuedAt||a.id.localeCompare(b.id));
    while(waiting.length>=2&&this.active.size<RANKING_RULES.maxMatches&&this.recordBytes+(this.active.size+1)*RANKING_RULES.maxRecordBytes<=RANKING_RULES.maxArchiveBytes) {
      const a=waiting.shift(),relaxed=this.clockMs-a.queue.queuedAt>=15000;
      let pool=waiting;
      const fresh=pool.filter(b=>!a.recentOpponents.slice(-1).includes(b.id));
      if(fresh.length)pool=fresh;
      const weights=pool.map(b=>1/(1+Math.abs(a.rating-b.rating)/(relaxed?1600:400)+Math.abs(a.queue.build.level-b.queue.build.level)/(relaxed?40:10)));
      let draw=randomInt(0x100000000)/0x100000000*weights.reduce((x,y)=>x+y,0),b=pool.at(-1);
      for(let i=0;i<pool.length;i++)if((draw-=weights[i])<0){b=pool[i];break;}
      waiting=waiting.filter(p=>p!==b);this.startMatch(a,b);
    }
  }
  startMatch(a,b) {
    const id=randomUUID(),seed=randomInt(0x100000000),builds=[clone(a.queue.build),clone(b.queue.build)];
    const arena=createArena(builds,{id,seed,mode:'duel',outcomePolicy:'ranking',limitTicks:2400});
    const match={id,seed,arena,builds,ratings:[a.rating,b.rating],slotIds:[a.queue.slotId,b.queue.slotId],startedAt:this.clockMs,
      frames:[],events:[],lastSeq:0,status:'playing',summary:null,rawBytes:8192,recordLimited:false};
    this.active.set(id,match);a.currentMatch=b.currentMatch=id;a.queue=b.queue=null;
    this.recordFrame(match);this.metrics.maxActive=Math.max(this.metrics.maxActive,this.active.size);
    if(!this.room.teacher.focus)this.room.teacher.focus=id;
  }
  recordFrame(m) {
    const frame=arenaSnapshot(m.arena);frame.events=[];
    const bytes=Buffer.byteLength(JSON.stringify(frame));
    if(m.frames.at(-1)?.tick===frame.tick)return;
    if(m.rawBytes+bytes>RANKING_RULES.maxRecordBytes){m.recordLimited=true;return;}
    m.frames.push(frame);m.rawBytes+=bytes;
    this.metrics.maxFrameBytes=Math.max(this.metrics.maxFrameBytes,bytes);
  }
  recordEvents(m) {
    for(const e of m.arena.events)if(e.seq>m.lastSeq){
      const bytes=Buffer.byteLength(JSON.stringify(e));
      if(m.rawBytes+bytes>RANKING_RULES.maxRecordBytes){m.recordLimited=true;break;}
      m.events.push(clone(e));m.lastSeq=e.seq;m.rawBytes+=bytes;
    }
    this.metrics.maxEvents=Math.max(this.metrics.maxEvents,m.events.length);
    // The simulator bounds rate, lifetime and duration. A broken future ruleset
    // is voided rather than storing unbounded data or fabricating a replay.
    if(m.events.length>RANKING_RULES.recordMaxEvents||m.recordLimited) this.settle(m,true,'경기 기록 상한 초과: 무효 경기');
  }
  settle(m,voided=false,reason='') {
    if(this.completed.has(m.id))return;
    const players=m.builds.map(b=>this.room.students.get(b.id));
    ensure(players.every(Boolean),'경기 참가자를 찾을 수 없습니다.');
    const outcome=m.arena.outcome;
    const draw=Boolean(outcome?.draw||m.arena.draw||(!outcome&&m.arena.results.length>1&&m.arena.results[0].rank===m.arena.results[1].rank));
    const winnerId=draw?null:(outcome?.winnerId??m.arena.results[0]?.id);
    if(!voided)ensure(m.arena.done&&(draw||players.some(p=>p.id===winnerId)),'완료된 서버 경기만 정산할 수 있습니다.');
    const score=draw ? 0.5 : winnerId===players[0].id?1:0;
    const delta=voided?0:eloDelta(m.ratings[0],m.ratings[1],score);
    this.completed.add(m.id);this.version++;
    this.recordFrame(m);m.status=voided?'void':'complete';
    const finalHash=createHash('sha256').update(JSON.stringify({frame:m.frames.at(-1),events:m.events,outcome})).digest('hex');
    m.summary={matchId:m.id,status:m.status,winnerId:voided?null:winnerId,draw:!voided&&draw,reason:reason||m.arena.reason,
      durationTicks:m.arena.tick,participants:m.builds.map(b=>({id:b.id,name:b.name})),finalHash,
      highlights:voided?[]:buildHighlights(m.id,m.frames,m.events),
      players:players.map((p,i)=>({id:p.id,ratingBefore:m.ratings[i],ratingAfter:p.rating+(i===0?delta:-delta),delta:i===0?delta:-delta,...summarizeEvents(m.events,p.id)}))};
    const record={matchId:m.id,snapshot:{matchId:m.id,participants:m.builds.map(b=>b.id),frozenBuilds:m.builds,seed:m.seed,
      rulesetVersion:RULESET_VERSION,contentVersion:CONTENT_VERSION,economyVersion:ECONOMY_VERSION,packId:this.room.settings.packId,status:m.status,startTick:0,outcomePolicy:'ranking'},
      frames:m.frames,events:m.events,finalHash,summary:m.summary,retention:{scope:'current-session',recentPerStudent:3},
      ...(m.recordLimited?{unavailableReason:'기록 상한을 넘겨 무효 처리된 경기입니다. 완전한 원본 재생을 지원하지 않습니다.'}:{})};
    const bytes=deflateSync(JSON.stringify(record),{level:1});
    this.records.set(m.id,{bytes,summary:m.summary,endedAt:this.clockMs});this.recordBytes+=bytes.length;
    for(const [i,p] of players.entries()) {
      p.rating+=i===0?delta:-delta;p.ratingDelta=i===0?delta:-delta;p.bestRating=Math.max(p.bestRating,p.rating);
      p.currentMatch=null;p.inventory.slots[m.slotIds[i]].locked=false;
      p.recentOpponents=[...p.recentOpponents,players[1-i].id].slice(-3);
      p.recentMatches=[m.id,...p.recentMatches].slice(0,3);
      if(!voided){p.achievements.matches++;p.achievements.profiles=[...new Set([...p.achievements.profiles,m.builds[i].classId])];
        p.achievements.guardRiposte ||= m.events.some(e=>e.sourceId===p.id&&e.type==='trait'&&e.kind==='guard_riposte'&&
          m.events.some(hit=>hit.type==='hit'&&hit.sourceId===p.id&&hit.rootAttackId===e.rootAttackId&&hit.damage>0));}
    }
    this.active.delete(m.id);this.pruneRecords();
  }
  pruneRecords() {
    const retained=new Set(this.room.active().flatMap(p=>p.recentMatches));
    if(this.room.teacher.focus)retained.add(this.room.teacher.focus);
    for(const [id,r] of this.records)if(!retained.has(id)){this.recordBytes-=r.bytes.length;this.records.delete(id);}
  }
  replay(p,id) {
    ensure(p.role==='teacher'||p.recentMatches?.includes(id),'내 최근 경기만 재생할 수 있습니다.');
    const r=this.records.get(id);ensure(r,'현재 세션의 보존된 경기 기록이 없습니다.');
    return JSON.parse(inflateSync(r.bytes).toString());
  }
  end() {
    if(this.room.phase!=='ACTIVE')return;
    this.room.phase='DRAINING';this.drainAt=this.clockMs+45000;
    this.room.deadline=this.lastAt+45000;
    for(const p of this.room.active())if(p.queue)this.cancel(p);
  }
  finish() {
    for(const m of [...this.active.values()])this.settle(m,true,'종료 정리 시간 초과: 무효 경기');
    for(const p of this.room.active()) {
      p.autoFinalized=[];
      for(const [slotId,b] of p.inventory.slots.entries())if(b) {
        if(b.lastForge&&!b.lastForge.acknowledged)b.lastForge.acknowledged=true;
        if(!buildReady(b)) {
          const before=clone(b);finalizeBuild(b);b.locked=false;
          p.autoFinalized.push({slotId,resultId:before.lastForge?.resultId??null,ballId:b.ballId,path:b.path,traitId:b.traitId??null,hiddenAccepted:false});
        }
      }
    }
    this.room.phase='RESULTS';this.room.deadline=null;this.pruneRecords();
  }
  tick(now) {
    const delta=this.advanceClock(now);if(this.room.paused)return false;
    const previous=this.room.phase;
    if(this.room.phase==='ACTIVE'&&this.clockMs>=this.endAt)this.end();
    if(!['ACTIVE','DRAINING'].includes(this.room.phase))return false;
    this.accumulator+=Math.min(250,delta)*60;
    const started=performance.now();
    while(this.accumulator>=1000) {
      for(const m of [...this.active.values()]) {
        stepArena(m.arena);this.recordEvents(m);
        if(!this.active.has(m.id))continue;
        if(m.arena.tick%6===0)this.recordFrame(m);
        if(m.recordLimited)this.settle(m,true,'경기 기록 상한 초과: 무효 경기');
        else if(m.arena.done)this.settle(m);
        else if(m.arena.tick>=RANKING_RULES.recordMaxTicks)this.settle(m,true,'경기 시간 상한 초과: 무효 경기');
      }
      this.metrics.ticks++;this.accumulator-=1000;
    }
    this.metrics.tickMs.push(performance.now()-started);if(this.metrics.tickMs.length>10000)this.metrics.tickMs.shift();
    if(this.room.phase==='ACTIVE'){for(const p of this.room.active())this.nextQuestion(p);this.matchWaiting();}
    if(this.room.phase==='DRAINING') {
      const pending=this.room.active().some(p=>p.inventory.slots.some(b=>b&&(!buildReady(b)||b.lastForge&&!b.lastForge.acknowledged)));
      if(this.clockMs>=this.drainAt||(!this.active.size&&!pending))this.finish();
    }
    return previous!==this.room.phase;
  }
  focus(p) {return p.role==='teacher'?p.focus:p.currentMatch;}
  frame(p) {
    const selected=this.active.get(this.focus(p));
    return {battleId:this.room.runId,mode:'ranking',stage:'ranking',round:0,roundSize:2,tick:Math.floor(this.clockMs*60/1000),
      waitTicks:0,done:this.room.phase==='RESULTS',matches:p.role==='teacher'?this.matchList():selected?[this.matchInfo(selected)]:[],
      arenas:selected?[arenaSnapshot(selected.arena)]:[],bracket:[],results:{tournament:[],rumble:[]},
      selectedResult:p.role==='teacher'?this.records.get(p.focus)?.summary??null:null};
  }
  matchInfo(m){return {id:m.id,ids:m.builds.map(b=>b.id),names:m.builds.map(b=>b.name),done:false};}
  matchList(){return [...this.active.values()].map(m=>this.matchInfo(m));}
  standings() {return this.room.active().slice().sort((a,b)=>b.rating-a.rating||a.id.localeCompare(b.id)).map((p,i)=>({id:p.id,name:p.name,rank:i+1,rating:p.rating,delta:p.ratingDelta,connected:Boolean(p.socket)}));}
  state(p) {
    const standings=this.standings(),ranking={version:this.version,top10:standings.slice(0,10),matches:p.role==='teacher'?this.matchList():[],
      queued:this.room.active().filter(p=>p.queue).length,clockMs:this.clockMs,draining:this.room.phase==='DRAINING',
      remainingMs:this.room.phase==='RESULTS'?0:Math.max(0,(this.room.phase==='DRAINING'?this.drainAt:this.endAt)-this.clockMs),
      economyVersion:ECONOMY_VERSION,rulesetVersion:RULESET_VERSION,packId:this.room.settings.packId,
      queueNotice:this.recordBytes+(this.active.size+1)*RANKING_RULES.maxRecordBytes>RANKING_RULES.maxArchiveBytes?'경기 기록 메모리 상한으로 새 매칭을 기다리고 있습니다.':null};
    if(p.role==='teacher'){ranking.featured=this.featured.update([...this.active.values()],this.clockMs,standings);return {ranking,me:{focus:p.focus}};}
    const inv=p.inventory;
    if(!inv)return {ranking,me:{waiting:true}};
    const slots=inv.slots.map(publicBuild),selected=slots[inv.selectedSlotId];
    return {ranking,me:{inventory:{slots,selectedSlotId:inv.selectedSlotId,tickets:inv.tickets,shields:inv.shields,funded:inv.funded},
      pendingForge:selected?.lastForge??null,question:this.room.phase==='ACTIVE'?publicQuestion(p.rankingQuestion):null,
      quizWaitMs:this.waitMs(p),lastAnswer:p.lastAnswer,correct:p.correct,answered:p.answered,
      queue:p.queue?{slotId:p.queue.slotId,queuedAt:p.queue.queuedAt}:null,currentMatch:p.currentMatch,
      rating:p.rating,rank:standings.find(r=>r.id===p.id)?.rank??null,ratingDelta:p.ratingDelta,bestRating:p.bestRating,
      recentMatches:p.recentMatches.map(id=>{const r=this.records.get(id)?.summary;if(!r)return null;return {...r,
        opponent:r.participants.find(x=>x.id!==p.id),result:r.status==='void'?'void':r.draw?'draw':r.winnerId===p.id?'win':'loss',
        ratingDelta:r.players.find(x=>x.id===p.id)?.delta??0,summary:r.players.find(x=>x.id===p.id)};}).filter(Boolean),
      autoFinalized:p.autoFinalized??[],achievements:clone(p.achievements),goals:[
        {id:'two-profiles',name:'서로 다른 공 2종 출전',current:Math.min(2,p.achievements.profiles.length),target:2,complete:p.achievements.profiles.length>=2},
        {id:'guard-riposte',name:'유효 방어 뒤 반격 성공',current:Number(p.achievements.guardRiposte),target:1,complete:p.achievements.guardRiposte},
        {id:'personal-best',name:'시작 점수보다 높은 개인 최고점',current:p.bestRating,target:1001,complete:p.bestRating>1000}
      ]}};
  }
}
