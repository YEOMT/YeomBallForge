import {createInventory,fundInventory,inventoryBuild,mutateBall} from './inventory.js';
import {enhance,buyShield,choosePath,chooseBall,chooseTrait,resolveHidden,finalizeBuild} from './forge.js';
import {ensure} from '../protocol/index.js';

// Explicitly noncompetitive, in-memory practice. Answer keys are deliberately
// local here; this module never submits wins, rewards or Elo to the real room.
export function createPracticeLesson(questions,prefix='practice') {
  ensure(Array.isArray(questions)&&questions.length>0,'연습 문항이 필요합니다.');
  const inventory=createInventory(prefix);fundInventory(inventory);
  return {phase:'ACTIVE',inventory,questions,correct:0,answered:0,serial:0,forgeSerial:0,
    current:null,answers:{},history:[],ledger:questions.map(()=>({lastAt:null,lastOrdinal:-1})),receipts:{}};
}
export function practiceEligibility(lesson,index,now) {
  const entry=lesson.ledger[index];if(entry.lastAt===null)return {eligible:true,at:now,otherRequired:0,otherAnswered:0};
  const required=Math.min(4,lesson.questions.length-1);
  const others=new Set(lesson.history.slice(entry.lastOrdinal+1).filter(id=>id!==index)).size;
  return {eligible:now>=entry.lastAt+90000&&others>=required,at:entry.lastAt+90000,otherRequired:required,otherAnswered:others};
}
export function practiceQuestion(lesson,now,advance=false) {
  if(lesson.current&&!advance)return lesson.current;
  if(lesson.current&&!lesson.current.result)return lesson.current;
  if(lesson.phase!=='ACTIVE')return null;
  lesson.current=null;
  let index=lesson.ledger.findIndex(x=>x.lastAt===null);
  if(index<0)index=lesson.ledger.findIndex((_,i)=>practiceEligibility(lesson,i,now).eligible);
  if(index<0)return null;
  const [text,answers]=lesson.questions[index];
  lesson.current={index,attemptId:`practice-question-${++lesson.serial}`,text,answers:[...answers],result:null};
  return lesson.current;
}
export function practiceAnswer(lesson,attemptId,answer,now) {
  if(lesson.answers[attemptId])return lesson.answers[attemptId];
  ensure(lesson.phase==='ACTIVE','연습 수업이 종료 정리 중입니다.');
  const current=lesson.current;
  ensure(current&&current.attemptId===attemptId&&!current.result,'현재 연습 문항을 확인하세요.');
  ensure(Number.isInteger(answer)&&answer>=0&&answer<current.answers.length,'답안을 선택하세요.');
  const q=lesson.questions[current.index],correct=answer===q[2];
  const result={attemptId,correct,answer,correctAnswer:q[2],explanation:q[3],ticketsAwarded:correct?2:0};
  lesson.history.push(current.index);lesson.ledger[current.index]={lastAt:now,lastOrdinal:lesson.history.length-1};
  lesson.answered++;if(correct){lesson.correct++;lesson.inventory.tickets+=2;}
  current.result=result;lesson.answers[attemptId]=result;return result;
}
export function practiceReceipt(lesson,slotId=lesson.inventory.selectedSlotId) {return lesson.receipts[slotId]||null;}
export function acknowledgePracticeForge(lesson,slotId,resultId,now) {
  const receipt=practiceReceipt(lesson,slotId);
  ensure(receipt&&receipt.resultId===resultId,'강화 결과를 확인하세요.');
  ensure(receipt.acknowledged||now>=receipt.readyAt,'강화 결과가 표시된 뒤 확인하세요.');
  receipt.acknowledged=true;return receipt;
}
export function practiceForge(lesson,slotId,action,value,now,draw=Math.random) {
  const previous=practiceReceipt(lesson,slotId);
  const selection=['choosePath','chooseBall','hidden','chooseTrait'].includes(action);
  ensure(lesson.phase==='ACTIVE'||(lesson.phase==='DRAINING'&&selection&&previous),'지금은 신규 강화를 할 수 없습니다.');
  if(action!=='buyShield')ensure(!previous||previous.acknowledged,'강화 결과부터 확인하세요.');
  let result;
  result=mutateBall(lesson.inventory,slotId,b=>{
    if(action==='enhance'||action==='protectedEnhance')return enhance(b,draw,draw,{protect:action==='protectedEnhance',buyMissing:action==='protectedEnhance'});
    if(action==='buyShield')return buyShield(b);
    if(action==='choosePath')return choosePath(b,value);
    if(action==='chooseBall')return chooseBall(b,value);
    if(action==='chooseTrait')return chooseTrait(b,value);
    if(action==='hidden')return resolveHidden(b,value===true||value==='yes');
    throw new Error('지원하지 않는 연습 강화 명령입니다.');
  });
  if(action==='enhance'||action==='protectedEnhance'){
    const receipt={...result,resultId:`practice-forge-${++lesson.forgeSerial}`,acknowledged:false,readyAt:now+300};
    lesson.receipts[slotId]=receipt;return receipt;
  }
  return result;
}
export function practiceForgeView(lesson,slotId=lesson.inventory.selectedSlotId) {
  return {...inventoryBuild(lesson.inventory,slotId),correct:lesson.correct,pendingForge:practiceReceipt(lesson,slotId)};
}
export function finishPracticeLesson(lesson) {
  for(let slotId=0;slotId<3;slotId++){
    if(lesson.inventory.slots[slotId]&&!lesson.inventory.slots[slotId].locked)mutateBall(lesson.inventory,slotId,finalizeBuild);
    if(lesson.receipts[slotId])Object.assign(lesson.receipts[slotId],{acknowledged:true,automatic:true});
  }
  lesson.phase='RESULTS';
}
