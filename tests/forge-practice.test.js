import test from 'node:test';
import assert from 'node:assert/strict';
import {createPracticeLesson,practiceQuestion,practiceAnswer,practiceEligibility,practiceForge,acknowledgePracticeForge,practiceForgeView,finishPracticeLesson} from '../packages/content/practice-loop.js';
import {createBall,freezeBattleBuild,releaseBattleBuild} from '../packages/content/inventory.js';

const bank=Array.from({length:5},(_,i)=>['문항'+i,['답','오답'],0,'해설'+i]);
test('practice uses once-only starting funds and unbounded valid quiz attempts with 90s/distinct repeat gates',()=>{
  const lesson=createPracticeLesson(bank);assert.equal(lesson.inventory.tickets,10);
  for(let i=0;i<5;i++){
    const q=practiceQuestion(lesson,i*1000,true);assert.equal(q.index,i);
    const r=practiceAnswer(lesson,q.attemptId,0,i*1000);
    assert.equal(practiceAnswer(lesson,q.attemptId,1,i*1000),r);
  }
  assert.equal(lesson.inventory.tickets,20);assert.equal(lesson.correct,5);
  assert.equal(practiceQuestion(lesson,89999,true),null);
  assert.equal(practiceQuestion(lesson,90000,true).index,0);
  assert.equal(practiceEligibility(lesson,0,90000).otherAnswered,4);
  let now=90000;
  for(let i=0;i<23;i++){
    const q=practiceQuestion(lesson,now,true);assert.ok(q);practiceAnswer(lesson,q.attemptId,0,now);
    now+=90000;
  }
  assert.equal(lesson.correct,28);assert.equal(lesson.inventory.tickets,66);
});
test('a one-question bank permits review waiting and a reward only after 90 seconds',()=>{
  const lesson=createPracticeLesson(bank.slice(0,1)),q=practiceQuestion(lesson,0);
  practiceAnswer(lesson,q.attemptId,1,0);assert.equal(lesson.inventory.tickets,10);
  assert.equal(practiceQuestion(lesson,89999,true),null);assert.ok(practiceQuestion(lesson,90000,true));
});
test('local success acknowledgement precedes candidate choice and never redraws or pays twice',()=>{
  const lesson=createPracticeLesson(bank);
  const first=practiceForge(lesson,0,'enhance',null,0,()=>0);
  assert.equal(first.success,true);assert.equal(lesson.inventory.tickets,9);
  assert.throws(()=>practiceForge(lesson,0,'enhance',null,301,()=>0));
  assert.throws(()=>acknowledgePracticeForge(lesson,0,first.resultId,299));
  acknowledgePracticeForge(lesson,0,first.resultId,300);
  acknowledgePracticeForge(lesson,0,first.resultId,300);
  const second=practiceForge(lesson,0,'enhance',null,301,()=>0);
  assert.equal(practiceForgeView(lesson).pendingChoice,true);
  assert.throws(()=>practiceForge(lesson,0,'chooseBall',second.immutableCandidates.balls[0],601,()=>{throw Error('RNG');}));
  acknowledgePracticeForge(lesson,0,second.resultId,601);
  practiceForge(lesson,0,'chooseBall',second.immutableCandidates.balls[0],602,()=>{throw Error('selection must not redraw');});
  assert.equal(lesson.inventory.tickets,8);assert.equal(practiceForgeView(lesson).pendingChoice,false);
});
test('CPU snapshot stays fixed while another slot and quiz remain usable; finishing gives no awards',()=>{
  const lesson=createPracticeLesson(bank);createBall(lesson.inventory,1);
  const frozen=freezeBattleBuild(lesson.inventory,0),before=structuredClone(frozen);
  const q=practiceQuestion(lesson,0);practiceAnswer(lesson,q.attemptId,0,1);
  practiceForge(lesson,1,'enhance',null,2,()=>0);assert.deepEqual(frozen,before);
  assert.throws(()=>practiceForge(lesson,0,'enhance',null,3,()=>0));
  releaseBattleBuild(lesson.inventory,0,frozen.instanceId);
  const wallet=lesson.inventory.tickets;lesson.phase='DRAINING';
  assert.throws(()=>practiceForge(lesson,0,'enhance',null,4,()=>0));
  finishPracticeLesson(lesson);assert.equal(lesson.phase,'RESULTS');assert.equal(lesson.inventory.tickets,wallet);
  assert.equal(lesson.receipts[1].automatic,true);
});
