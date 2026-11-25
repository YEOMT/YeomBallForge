import {createArena} from './arena.js';
import {CLASSES} from '../content/classes.js';
export const DEMO_PROFILES=Object.freeze(['mace','trinity','tide','beam','bolt','frost','summoner','star']);
export function createDemoArena(buildOrClassId,{seed=2101}={}){
  const build=typeof buildOrClassId==='string'?{classId:buildOrClassId,level:15}:structuredClone(buildOrClassId);
  const id=build.classId;if(!CLASSES[id])throw new Error('시연할 공을 찾을 수 없습니다.');
  const ranged=['star','captor','decoy'].includes(id);
  const arena=createArena([{...build,id:'demo',name:CLASSES[id].name},{id:'dummy',name:'시연 상대',level:build.level??15,classId:id==='mimic'?'ring':ranged?'blade':'basic'}],{id:'demo-'+id,seed,limitTicks:360});
  const [b,q]=arena.balls;Object.assign(b,{x:95,y:108,px:95,py:108,vx:80,vy:10,next:1,heading:0});
  Object.assign(q,{x:185,y:108,px:185,py:108,vx:-80,vy:8,next:1,heading:Math.PI});
  const setup=[];
  if(['ring','trinity','mace','thorn','saw'].includes(id)){q.x=q.px=b.x+b.cl.orbit+9;b.angle=-b.cl.spin;setup.push('무기 사거리 안의 상대');}
  if(id==='mace'){b.x=b.px=230;q.x=q.px=268;b.state.wallCharge=3;setup.push('벽 반사 충전 3회');}
  if(id==='tide'){b.charge=1;q.x=q.px=121;setup.push('전면 방어 1회 누적');}
  if(['crystal','hourglass','crimson','vampire'].includes(id)){q.x=q.px=121;setup.push('정면의 근접 상대');}
  if(id==='crimson'){b.charge=1;setup.push('벽 반사 충전 1회');}
  if(id==='vampire'){b.hp=b.maxHp*.7;setup.push('회복을 볼 수 있는 체력 70%');}
  if(id==='mimic'){q.x=q.px=145;setup.push('복사 가능한 회전 날 상대');}
  if(id==='frost'||id==='fracture'){q.x=q.px=145;setup.push('냉기 범위 안의 상대');}
  if(id==='rewind'){b.state.history=Array.from({length:8},()=>({x:50,y:60,hp:b.maxHp}));b.hp=b.maxHp*.75;setup.push('최근 피해 25%와 위치 기록');}
  if(id==='phoenix'){b.hp=8;q.x=q.px=b.x+26;setup.push('재형성 직전의 낮은 체력');}
  if(id==='greatsword'){b.state.travel=70;setup.push('이동 축력 완료');}
  if(id==='berserk'){b.rage=35;setup.push('직접 피격 투지 35');}
  if(id==='cannon'){b.charge=1;b.x=b.px=14;b.vx=-160;setup.push('벽 반사 1회 누적');}
  if(ranged){arena.objects.push({id:'demo-shot',kind:'crescent',owner:q,field:false,x:b.x+60,y:b.y,vx:-240,vy:0,r:6,power:.8,born:-1,expires:80,hit:new Set(),maxTargets:1,reflected:0});setup.push('다가오는 일반 투사체 1개');}
  if(['curse','fracture','combo'].includes(id)){q.x=q.px=145;b.state.targetId=q.id;b.state.marks=id==='combo'?3:2;b.state.markAt=0;b.state.stored=b.atk;setup.push(`직접타 표식 ${b.state.marks}개 누적`);}
  if(id==='trail'){b.state.point={x:180,y:108};q.x=q.px=145;setup.push('이전 이동점과 현재 위치 사이를 지나는 상대');}
  arena.demo={kind:'assigned-scenario',durationSeconds:6,setup:setup.length?setup:['가까운 상대와 빠른 최초 준비'],notice:'상황을 배치한 능력 시연 · 실제 발동 시간과 승률 예측이 아닙니다.'};
  return arena;
}
