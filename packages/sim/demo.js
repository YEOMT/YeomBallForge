import {createArena,primeEvolutionDemo} from './arena.js';
import {CLASSES} from '../content/classes.js';
import {BALL_CATALOG,getBall} from '../content/balls.js';
import {AWAKENING_PROFILE_IDS} from '../content/awakening.js';
export const DEMO_PROFILES=Object.freeze(['mace','trinity','tide','beam','bolt','frost','summoner','star']);
export const NORMAL_DEMO_PROFILES=Object.freeze(Object.keys(CLASSES));
export const AWAKENING_DEMO_PROFILES=AWAKENING_PROFILE_IDS;
function catalogBuild(classId,tier){const form=BALL_CATALOG.find(b=>b.classId===classId&&b.tier===tier);if(!form)throw new Error('합법적인 시연 폼을 찾을 수 없습니다.');return {classId,ballId:form.id,level:form.level,element:form.element,path:form.path};}
export function createDemoArena(buildOrClassId,{seed=2101,awakening=false}={}){
  const given=typeof buildOrClassId==='string'?{classId:buildOrClassId}:structuredClone(buildOrClassId);
  const id=given.classId;if(!CLASSES[id])throw new Error('시연할 공을 찾을 수 없습니다.');
  if(awakening&&!AWAKENING_PROFILE_IDS.includes(id))throw new Error('이 프로필에는 합법 T1 각성이 없습니다.');
  const form=getBall(given.ballId),valid=form?.classId===id&&form.level===given.level;
  const build=awakening?catalogBuild(id,1):valid?given:catalogBuild(id,id==='basic'?19:5);
  const ranged=['star','captor','decoy'].includes(id);
  const enemyClass=id==='mimic'?'ring':ranged?'blade':id==='basic'?'basic':'elastic';
  const enemy=catalogBuild(enemyClass,enemyClass==='basic'?19:5);
  const arena=createArena([{...build,id:'demo',name:CLASSES[id].name},{...enemy,id:'dummy',name:'시연 상대'}],{id:'demo-'+id+(awakening?'-awakening':''),seed,limitTicks:360});
  const [b,q]=arena.balls;Object.assign(b,{x:95,y:108,px:95,py:108,vx:80,vy:10,next:1,heading:0});
  Object.assign(q,{x:185,y:108,px:185,py:108,vx:-80,vy:8,next:360,heading:Math.PI});
  const setup=['상대의 첫 준비 기술은 시연 후로 지연'];
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
  if(awakening){
    primeEvolutionDemo(arena,b);b.next=24;
    setup.push('합법 T1 폼과 고유 진화 준비 조건을 배치함');
    if(['tide','crystal','berserk'].includes(id)){q.next=1;setup.push('방어·격투 확인을 위해 상대의 첫 기술 허용');}
    if(['tide','crystal'].includes(id)){
      b.vx=q.vx=80;b.vy=q.vy=0;q.x=q.px=b.x+55;q.next=360;
      arena.objects.push({id:'demo-guard-shot',kind:'crescent',owner:q,field:false,x:b.x+170,y:b.y,vx:-220,vy:0,r:6,power:.8,born:0,expires:100,hit:new Set(),maxTargets:1,reflected:0});
      setup.push('예고가 끝난 뒤 전면에 도달하는 실제 일반 탄환');
    }
    if(id==='elastic'){b.vx=q.vx=80;b.vy=q.vy=0;q.x=q.px=b.x+50;setup.push('고정 조준의 전면 주먹 사거리');}
    if(['frost','thermal','sniper','greatsword','mimic','gravity'].includes(id)){b.vx=q.vx=80;b.vy=q.vy=0;q.x=q.px=b.x+45;setup.push('조준·범위 변화 확인을 위한 나란한 이동');}
    if(id==='frost'){q.x=q.px=b.x-45;setup.push('고정된 파쇄 고리 안으로 이동하는 상대');}
    if(['portal','idol'].includes(id)){q.slowUntil=100;q.slowFactor=.4;setup.push('첫 100틱 동안 기존 감속 상태인 상대');}
    if(id==='portal'){b.x=b.px=45;b.vx=-80;b.vy=0;q.x=q.px=220;q.vx=q.vy=0;q.cl.speed=0;q.next=360;setup.push('고정 출구의 실제 절단을 보여 주는 정지 훈련 표적');}
    if(id==='rewind'){b.kx=-80;b.ky=30;setup.push('되감기로 제거할 직전 피격 관성');}
    if(id==='star'){b.charge=2;setup.push('앞서 일반 탄환 두 개를 흡수한 저장 상태');}
    if(id==='captor'){b.state.held=[{power:.8,kind:'crescent',rootAttackId:'demo-capture-1'},{power:.8,kind:'crescent',rootAttackId:'demo-capture-2'}];b.state.releaseAt=24;setup.push('일반 탄환 두 개를 포획한 저장 상태');}
    if(id==='berserk'){b.rage=65;b.hp=b.maxHp*.38;setup.push('유효 직접 피해로 투지 65, 체력 38%');}
    if(id==='thorn'){b.angle=-Math.PI/2;b.vx=q.vx=80;b.vy=q.vy=0;q.dots.set('demo-poison',{owner:b,kind:'poison',power:.13,stacks:2,next:90,end:240,attackId:'demo-poison-root'});setup.push('상대에게 기존 독 2중첩, 예고 후 가시가 닿는 회전 방향');}
    if(id==='morph'){b.state.form=0;setup.push('다음 예정 형태는 사격형');}
    if(id==='cards'){b.state.card=0;setup.push('다음 예정 카드는 공격 카드');}
    if(id==='titan'){b.state.large=false;setup.push('다음 예정 형태는 거대형');}
    if(id==='reactor'){b.state.heat=2;setup.push('살보 직전 열 2단계');}
    if(id==='mycelium'){arena.objects.push({id:'demo-node',kind:'mycelium',owner:b,field:true,x:215,y:112,r:5,born:-1,expires:220});setup.push('이미 설치한 균사 노드 1개');}
    if(['curse','fracture','combo'].includes(id)){q.vx=q.vy=0;b.vx=b.vy=0;q.x=q.px=b.x+35;setup.push('표식 소비 직접타 사거리 배치');}
  }
  arena.demo={kind:awakening?'prepared-awakening':'assigned-scenario',awakening,durationSeconds:6,profileId:id,ballId:build.ballId,setup:setup.length?setup:['가까운 상대와 빠른 최초 준비'],notice:'상황을 배치한 '+(awakening?'각성':'능력')+' 시연 · 실제 발동 시간과 승률 예측이 아닙니다.'};
  return arena;
}
