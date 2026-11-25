import test from 'node:test';
import assert from 'node:assert/strict';
import {BALL_CATALOG,getBall} from '../packages/content/balls.js';
import {CLASSES} from '../packages/content/classes.js';
import {AWAKENINGS,AWAKENING_PROFILE_IDS,awakeningFor,validateAwakenings} from '../packages/content/awakening.js';
import {createArena,stepArena,arenaSnapshot,primeEvolutionDemo} from '../packages/sim/arena.js';
import {createDemoArena,DEMO_PROFILES,NORMAL_DEMO_PROFILES,AWAKENING_DEMO_PROFILES} from '../packages/sim/demo.js';
import {awakeningAction,awakeningTick,awakeningHit,awakeningDamageBudget,awakeningRemainingDamage,awakeningAfterHit,awakeningSignal} from '../packages/sim/awakening.js';
import {flushHealing} from '../packages/sim/mechanics.js';

function runDemo(id,awakening=true){
  const arena=createDemoArena(id,{awakening}),events=[...arena.events],frames=[];
  for(let i=0;i<360&&!arena.done;i++){
    const seq=arena.seq;stepArena(arena);events.push(...arena.events.filter(e=>e.seq>seq));
    frames.push({snapshot:arenaSnapshot(arena),objects:arena.objects.map(o=>({...o,ownerId:o.owner.id})),mass:arena.balls[0].cl.mass});
  }
  return {arena,ball:arena.balls[0],events:events.filter(e=>e.sourceId==='demo'),frames};
}
const objectEvidence={
  cannon:o=>o.kind==='wave'&&o.r>CLASSES.cannon.shotR,
  crystal:o=>o.kind==='shard'&&o.reflected===1&&o.r>CLASSES.crystal.shotR,
  seed:o=>o.kind==='seed'&&o.mythicRange>CLASSES.seed.range,
  prism:o=>o.kind==='prism'&&o.refractAt!=null&&Math.abs(o.refractAngle)>0,
  gravity:o=>o.kind==='gravity'&&o.mythicPull>1&&o.mythicRange>CLASSES.gravity.coreRange,
  blade:o=>o.kind==='crescent'&&o.r>CLASSES.blade.shotR,
  summoner:o=>o.kind==='familiar'&&o.greaterUntil>0&&o.r===10,
  star:o=>o.kind==='starcounter'&&o.reflected===1&&o.push===85,
  returner:o=>o.kind==='returnshield'&&o.returnSpeed===380,
  reactor:o=>o.kind==='missile'&&o.mythicOneTarget===true,
  captor:o=>o.kind==='captured'&&o.reflected===1&&o.push===95,
  mason:o=>o.kind==='wallsegment'&&o.y2-o.y>70&&o.y>=18&&o.y2<=200,
  morph:o=>o.kind==='morphshot'&&o.push===65,
  phoenix:o=>o.kind==='phoenixfire'&&o.r>48&&o.r<=60,
  cards:o=>o.kind==='cardshot'&&o.maxTargets===2,
  sniper:o=>o.kind==='snipe'&&o.maxTargets===3&&Math.hypot(o.vx,o.vy)>CLASSES.sniper.shotSpeed,
  trail:o=>o.kind==='lighttrail'&&o.expires-o.born>70&&o.expires-o.born<=90,
  storm:o=>o.kind==='cloudmark'&&o.mythicFinal===true&&o.r>28,
  current:o=>o.kind==='watercurrent'&&o.currentPower===1.5,
  decoy:o=>o.kind==='decoy'&&o.maxHp>24&&o.maxHp<=42,
};
function actualEffect(id,trace){
  const {events,frames,ball}=trace,hit=events.some(e=>e.type==='awakening-hit'&&e.damage>0);
  if(objectEvidence[id])return frames.some(f=>f.objects.some(o=>o.ownerId==='demo'&&o.awakeningId===AWAKENINGS[id].id&&objectEvidence[id](o)));
  if(['bolt','ninja'].includes(id))return events.some(e=>e.type==='awakening-dash')&&frames.some(f=>f.snapshot.balls[0].dash);
  if(id==='pendulum')return events.some(e=>e.kind==='swing-release')&&frames.some(f=>f.snapshot.balls[0].awakeningState.status==='active'&&f.snapshot.balls[0].dash&&Math.hypot(f.snapshot.balls[0].vx,f.snapshot.balls[0].vy)>330);
  if(id==='ring')return frames.some(f=>{const b=f.snapshot.balls[0];return b.awakeningState.status==='active'&&f.snapshot.objects.some(o=>o.ownerId==='demo'&&o.kind==='blade'&&Math.hypot(o.x-b.x,o.y-b.y)>CLASSES.ring.orbit*1.15);});
  if(id==='saw')return frames.some(f=>f.snapshot.objects.some(o=>o.ownerId==='demo'&&o.kind==='saw'&&o.r>CLASSES.saw.weaponR))&&ball.state.overheatUntil>0;
  if(id==='trinity')return frames.some(f=>f.objects.filter(o=>o.ownerId==='demo'&&o.kind==='mythic-triad').length===3);
  if(id==='titan')return frames.some(f=>f.snapshot.balls[0].r>19&&f.mass>1.7)&&frames.every(f=>f.mass<=2);
  if(id==='rewind')return events.filter(e=>e.type==='heal'&&e.kind==='rewind'&&e.healing>0).length===1&&events.some(e=>e.kind==='rewind'&&e.fromX!=null&&Math.hypot(e.x-e.fromX,e.y-e.fromY)>5);
  if(id==='mycelium')return events.some(e=>e.type==='awakening-hit'&&e.action==='mythic-web-bloom'&&e.damage>0);
  if(id==='frost')return events.some(e=>e.type==='awakening-hit'&&e.action==='mythic-frost-shatter'&&e.damage>0);
  if(id==='portal')return events.some(e=>e.type==='awakening-hit'&&e.action==='mythic-exit-cross'&&e.damage>0);
  if(id==='idol')return events.filter(e=>e.type==='awakening-beat').length===2&&events.some(e=>e.type==='awakening-hit'&&e.action==='mythic-beat'&&e.damage>0);
  if(id==='vampire')return hit&&events.some(e=>e.type==='heal'&&e.kind==='mythic-lifesteal'&&e.healing>0)&&ball.awakeningState.healing<=ball.maxHp*.025;
  if(id==='berserk')return events.some(e=>e.type==='awakening-hit'&&['body','ragebody'].includes(e.action)&&e.impulse===190);
  return hit;
}
function assertRun(id,trace){
  const {arena,ball,events,frames}=trace;
  assert.equal(getBall(ball.ballId).tier,1,id);
  assert.equal(events.filter(e=>e.type==='awakening-start').length,1,id+' starts exactly once');
  assert.ok(actualEffect(id,trace),id+' changes actual attack, defense, movement, geometry or bounded recovery');
  assert.ok(ball.awakeningState.used,id);
  assert.equal(ball.awakeningState.actionCount,1,id);
  for(const {snapshot,objects} of frames){
    assert.ok(snapshot.balls.every(b=>[b.x,b.y,b.vx,b.vy,b.hp,b.r].every(Number.isFinite)),id);
    assert.ok(objects.filter(o=>o.field).length<=30&&objects.filter(o=>!o.field).length<=120,id);
    assert.ok(objects.filter(o=>o.ownerId==='demo'&&o.field).length<=3,id);
    assert.ok(objects.filter(o=>o.ownerId==='demo'&&!o.field).length<=6,id);
  }
  assert.ok(arena.events.length<=128,id);
}

test('representative eight first gate executes actual T1 actions through normal simulation',()=>{
  for(const id of DEMO_PROFILES)assertRun(id,runDemo(id));
});

test('catalog derives exactly 49 legal awakenings and all 50 normal / 49 mythic demos',()=>{
  assert.deepEqual(validateAwakenings(),{profiles:49,basic:true});
  assert.equal(NORMAL_DEMO_PROFILES.length,50);assert.equal(AWAKENING_DEMO_PROFILES.length,49);
  assert.deepEqual(new Set(AWAKENING_PROFILE_IDS),new Set(BALL_CATALOG.filter(b=>b.tier===1).map(b=>b.classId)));
  assert.throws(()=>createDemoArena('basic',{awakening:true}),/T1/);
  for(const id of NORMAL_DEMO_PROFILES){const t=runDemo(id,false);assert.equal(getBall(t.ball.ballId).level,t.ball.level);assert.equal(t.arena.demo.awakening,false);assert.ok(t.events.some(e=>['skill','hit','block','field'].includes(e.type))||t.frames.some(f=>f.snapshot.objects.some(o=>o.ownerId==='demo')),id+' normal mechanic');}
});

for(const id of AWAKENING_PROFILE_IDS)test('actual unique awakening: '+id,()=>assertRun(id,runDemo(id)));

test('fake T1, mismatched form, T2 and downgraded T1 cannot awaken',()=>{
  for(const id of AWAKENING_PROFILE_IDS){
    const form=BALL_CATALOG.find(b=>b.classId===id&&b.tier===1),tier2=BALL_CATALOG.find(b=>b.classId===id&&b.tier===2);
    for(const build of [{classId:id,level:19},{classId:id,level:19,ballId:tier2.id},{classId:id,level:18,ballId:form.id},{classId:id,level:19,ballId:'core-20'}]){
      assert.equal(awakeningFor(build),null);
      const a=createArena([{...build,id:'a',name:'a'},{id:'b',name:'b',classId:'basic',level:0,ballId:'core-20'}]);
      primeEvolutionDemo(a,a.balls[0]);assert.equal(a.balls[0].awakeningState.status,'locked');
    }
  }
});

test('ready is not activation; death before designated action cancels and match reset clears state',()=>{
  const a=createDemoArena('beam',{awakening:true}),b=a.balls[0],events=[];
  const context={emit:(...args)=>events.push(args),nearby:()=>[],shoot:()=>{throw Error('no attack after death');}};
  assert.equal(b.awakeningState.status,'ready');assert.equal(b.awakeningState.used,false);
  b.hp=0;b.alive=false;awakeningTick(a,b,context);
  a.tick=30;assert.equal(awakeningAction(a,b,'beam',context),false);
  assert.equal(b.awakeningState.status,'cancelled');assert.equal(b.awakeningState.used,false);
  const reset=createArena([{id:'a',name:'a',classId:'beam',level:19,ballId:b.ballId},{id:'b',name:'b',classId:'basic',level:0,ballId:'core-20'}]).balls[0];
  assert.equal(reset.awakeningState.status,'charging');assert.equal(reset.awakeningState.actionCount,0);assert.deepEqual(reset.awakeningState.queue,[]);
});

test('spent state, per-target root budget and projectile group reject repetition',()=>{
  const {arena:a,ball:b}=runDemo('prism');
  assert.equal(b.awakeningState.status,'spent');
  const context={emit:()=>{},nearby:()=>[]},target=a.balls[1];
  awakeningSignal(a,b,'evo-ready',{},context);assert.equal(awakeningAction(a,b,'prism',context),false);
  b.awakeningState.budgetDamage={};
  const h={source:b,target,kind:'prism',awakeningId:AWAKENINGS.prism.id};
  let total=0;for(let i=0;i<40;i++)total+=awakeningDamageBudget(a,h,10);
  assert.ok(total<=Math.min(b.atk*2.75,target.maxHp*.30)+1e-9);
  const p={awakeningId:AWAKENINGS.prism.id,awakeningRoot:b.awakeningState.root,mythicOneTarget:true};
  b.awakeningState.seen=[];
  const h1={...h,projectile:p,power:1},h2={...h,projectile:p,power:1};target.alive=true;
  awakeningHit(a,h1,context);awakeningHit(a,h2,context);assert.equal(h2.cancelled,true);
});

test('phoenix and rewind retain exactly one original recovery and no extra life',()=>{
  for(const id of ['phoenix','rewind']){
    const t=runDemo(id),kind=id==='phoenix'?'phoenix':'rewind';
    const heals=t.events.filter(e=>e.type==='heal'&&e.kind===kind);
    assert.equal(heals.length,1,id);assert.ok(heals[0].healing<=t.ball.maxHp*(id==='phoenix'?.16:.138)+1e-8);
    assert.equal(t.ball.awakeningState.actionCount,1);assert.equal(id==='phoenix'?t.ball.state.revived:t.ball.state.used,true);
    const context={emit:()=>{}};t.arena.tick+=10;assert.equal(awakeningAction(t.arena,t.ball,id==='phoenix'?'reform':'rewind',context),false);
  }
});

test('all completed awakenings clear temporary modifiers and independent replay snapshots retain status',()=>{
  for(const id of AWAKENING_PROFILE_IDS){
    const t=runDemo(id),b=t.ball,a=t.arena;
    a.tick=Math.max(a.tick,b.awakeningState.activeUntil+1);awakeningTick(a,b,{emit:()=>{}});
    assert.deepEqual(b.awakeningState.modifiers,{},id);assert.deepEqual(b.awakeningState.queue,[],id);
    const s=arenaSnapshot(a).balls[0].awakeningState;assert.equal(s.used,true,id);assert.equal(s.actionCount,1,id);assert.ok(['spent','cancelled'].includes(s.status),id);
  }
});

test('all 49 awakenings change actual geometry, movement, effective outcome or the original recovery compared with evolution alone',()=>{
  function physical(a){const s=arenaSnapshot(a);return JSON.stringify({balls:s.balls.map(b=>[b.x,b.y,b.r,b.hp,b.kx,b.ky,b.angle]),objects:s.objects.map(o=>[o.kind,o.x,o.y,o.r,o.x2,o.y2,o.hp]),geometry:s.events.filter(e=>e.type==='skill'&&e.r!=null).map(e=>[e.kind,e.r,e.endX,e.endY])});}
  for(const id of AWAKENING_PROFILE_IDS){
    const a=createDemoArena(id,{awakening:true}),baseline=createDemoArena(id,{awakening:true});
    Object.assign(baseline.balls[0].awakeningState,{status:'locked',ready:false});let different=false;
    for(let tick=0;tick<360&&!a.done&&!baseline.done;tick++){stepArena(a);stepArena(baseline);if(physical(a)!==physical(baseline))different=true;}
    assert.ok(different,id+' produces more than a name/status/VFX change');
  }
});

test('early evolution readiness cannot expire phoenix, rewind or the later berserk condition',()=>{
  const context={emit:()=>{},nearby:()=>[]};
  for(const id of ['phoenix','rewind','berserk']){
    const form=BALL_CATALOG.find(f=>f.classId===id&&f.tier===1);
    const a=createArena([{id:'a',name:'a',classId:id,ballId:form.id,level:19},{id:'b',name:'b',classId:'basic',ballId:'core-20',level:0}]),b=a.balls[0];
    primeEvolutionDemo(a,b);assert.equal(b.awakeningState.status,'charging',id);
    a.tick=900;awakeningTick(a,b,context);assert.equal(b.awakeningState.status,'charging',id);
    if(id==='berserk'){b.hp=b.maxHp*.38;awakeningTick(a,b,context);assert.equal(b.awakeningState.status,'ready');a.tick+=18;assert.equal(awakeningAction(a,b,'body',context),true);}
    else{if(id==='phoenix')b.hp=0;assert.equal(awakeningAction(a,b,id==='phoenix'?'reform':'rewind',context),true);}
    assert.equal(b.awakeningState.actionCount,1,id);
  }
});

test('lifesteal accounting records only actual post-damage flush, including cap and simultaneous death',()=>{
  for(const dies of [false,true]){
    const a=createDemoArena('vampire',{awakening:true}),b=a.balls[0],target=a.balls[1];a.tick=18;
    const context={emit:(_a,type,kind,owner,_target,_x,_y,extra={})=>awakeningSignal(a,owner,'event',{type,kind,...extra},context),nearby:()=>[]};
    awakeningAction(a,b,'body',context);b.hp=b.maxHp-.1;
    awakeningAfterHit(a,{source:b,target,kind:'body',attackId:'flush-fixture',awakeningId:AWAKENINGS.vampire.id},20,context);
    assert.equal(b.awakeningState.healing,0,'queued is not yet actual');
    b.hp=dies?0:b.maxHp-.05;flushHealing(a,context);
    assert.ok(Math.abs(b.awakeningState.healing-(dies?0:.05))<1e-8);
    if(dies)assert.equal(b.hp,0,'flush does not revive');else assert.equal(b.hp,b.maxHp);
  }
});

test('last-tick death immediately cancels active queues and all visible active state',()=>{
  const a=createDemoArena('bolt',{awakening:true}),b=a.balls[0],events=[],context={emit:(_a,type,kind,_owner,_target,_x,_y,extra)=>events.push({type,kind,...extra}),nearby:()=>[]};
  a.tick=18;awakeningAction(a,b,'dash',context);assert.ok(b.awakeningState.queue.length>0);assert.ok(Object.keys(b.awakeningState.modifiers).length>0);
  b.hp=0;b.alive=false;a.done=true;awakeningSignal(a,b,'death',{},context);
  assert.equal(b.awakeningState.status,'cancelled');assert.deepEqual(b.awakeningState.queue,[]);assert.deepEqual(b.awakeningState.modifiers,{});
  const snapshot=arenaSnapshot(a).balls[0];assert.equal(snapshot.awakening,false);assert.equal(snapshot.awakeningState.status,'cancelled');assert.equal(events.filter(e=>e.type==='awakening-end').length,1);
});

test('exhausted awakening damage budget supplies no raw damage to the defense pipeline',()=>{
  const a=createDemoArena('prism',{awakening:true}),b=a.balls[0],target=a.balls[1];b.awakeningState.used=true;
  const h={source:b,target,awakeningId:AWAKENINGS.prism.id};awakeningDamageBudget(a,h,999);
  assert.equal(awakeningRemainingDamage(a,h,100),0);assert.equal(awakeningDamageBudget(a,h,100),0);
});

test('mythic wall replaces both evolved endpoints instead of stacking a displaced endpoint',()=>{
  const t=runDemo('mason'),wall=t.frames.flatMap(f=>f.objects).find(o=>o.kind==='wallsegment'&&o.awakeningId);
  assert.ok(wall);const base=wall._baseAwakening;
  assert.equal((wall.y+wall.y2)/2,(base.y+base.y2)/2);
  assert.ok(wall.y2-wall.y<=86&&wall.y>=18&&wall.y2<=t.arena.height-18);
});

test('earthbreak permits one wall impact but a derived wallslam cannot rearm another',()=>{
  const a=createDemoArena('mace',{awakening:true}),b=a.balls[0],target=a.balls[1],context={emit:()=>{}};
  a.tick=18;awakeningAction(a,b,'mace',context);
  const primary={source:b,target,kind:'mace',power:1,push:215};awakeningHit(a,primary,context);
  assert.equal(primary.wall,true);assert.ok(primary.push>215);
  Object.assign(b,{x:80,px:80,y:80,py:80,vx:0,vy:0,next:999});Object.assign(target,{x:a.width-target.r-.5,y:80,vx:100,vy:0,next:999});b.cl.speed=0;
  const derived={source:b,target,kind:'wallslam',power:.4,reactive:true,awakeningId:AWAKENINGS.mace.id,attackId:'one-earthbreak-wall',nx:1,ny:0,x:target.x,y:target.y};
  awakeningHit(a,derived,context);assert.equal(derived.wall,undefined);assert.equal(derived.push,undefined);
  a.pending.push(derived);stepArena(a);assert.equal(target.wallHit,null,'derived damage does not reinstall the wall collision marker');
  for(let i=0;i<3;i++){target.x=a.width-target.r-.1;target.vx=100;stepArena(a);}
  assert.equal(a.events.filter(e=>e.type==='hit'&&e.kind==='wallslam'&&e.rootAttackId===derived.attackId).length,1);
});

test('mythic familiar replaces an existing evolved familiar without stacking or resetting its shape',()=>{
  const a=createDemoArena('summoner',{awakening:true}),b=a.balls[0];
  a.objects.push({id:'existing-familiar',kind:'familiar',field:true,owner:b,x:b.x,y:b.y,r:7,angle:0,born:0,next:999,expires:260});
  while(a.tick<24)stepArena(a);
  const familiar=a.objects.find(o=>o.id==='existing-familiar');
  assert.ok(familiar);assert.equal(familiar.r,10);assert.equal(familiar.awakeningId,AWAKENINGS.summoner.id);
  assert.equal(familiar.greaterUntil,b.awakeningState.activeUntil);assert.equal(familiar.fireIntervalScale,1);
  assert.equal(a.objects.filter(o=>o.owner===b&&o.kind==='familiar').length,1);
  const boundedEnd=familiar.expires;
  assert.ok(boundedEnd<=b.awakeningState.activeUntil);
  for(let i=0;i<50;i++){stepArena(a);assert.equal(familiar.r,10);assert.equal(familiar.expires,boundedEnd);}
});

for(const id of ['morph','cards'])test(id+' defensive scheduled form actually blocks more damage than evolution alone',()=>{
  function guarded(awakening){
    const a=createDemoArena(id,{awakening:true}),b=a.balls[0],enemy=a.balls[1];
    if(!awakening){b.awakeningState.status='locked';b.awakeningState.ready=false;}
    if(id==='morph')b.state.form=1;else b.state.card=2;
    Object.assign(b,{x:70,px:70,y:60,py:60,vx:0,vy:0});
    Object.assign(enemy,{x:290,px:290,y:150,py:150,vx:0,vy:0,next:999});enemy.cl.speed=0;
    while(a.tick<60)stepArena(a);
    assert.equal(id==='morph'?b.state.form:b.state.card,id==='morph'?2:0,'scheduled defensive form is preserved');
    const before=b.hp,attackId='defensive-branch-'+id;
    a.pending.push({source:enemy,target:b,kind:'body',power:1,nx:-1,ny:0,x:b.x,y:b.y,attackId});
    stepArena(a);
    const block=a.events.find(e=>e.type==='block'&&e.rootAttackId===attackId),hit=a.events.find(e=>e.type==='hit'&&e.rootAttackId===attackId);
    assert.ok(block?.blocked>0&&hit?.damage>0,'actual defense and residual HP damage both occur');
    assert.ok(Math.abs(before-b.hp-hit.damage)<.051,'rounded hit event matches actual HP loss');
    assert.equal(b.awakeningState.actionCount,awakening?1:0);
    return {blocked:block.blocked,damage:before-b.hp};
  }
  const normal=guarded(false),mythic=guarded(true);
  assert.ok(mythic.blocked>normal.blocked);assert.ok(mythic.damage<normal.damage);
  assert.ok(Math.abs(mythic.blocked+mythic.damage-normal.blocked-normal.damage)<1e-8,'both branches receive identical raw attack damage');
});
