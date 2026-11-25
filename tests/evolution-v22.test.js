import test from 'node:test';
import assert from 'node:assert/strict';
import {createArena,stepArena,arenaSnapshot,primeEvolutionDemo} from '../packages/sim/arena.js';
import {EVOLUTIONS,VAMPIRE_MATCH_HEAL_CAP} from '../packages/content/evolution.js';
import {BALL_CATALOG} from '../packages/content/balls.js';
import {evolutionSignal,evolutionAction,evolutionTick,evolutionObject,evolutionHit} from '../packages/sim/evolution.js';
import {flushHealing} from '../packages/sim/mechanics.js';
import {createDemoArena} from '../packages/sim/demo.js';

const build=id=>{const f=BALL_CATALOG.find(f=>f.classId===id&&f.tier===(id==='basic'?19:5));return {...f,id:'a',ballId:f.id,classId:id};};
const pose=(b,x,y)=>Object.assign(b,{x,y,px:x,py:y,vx:0,vy:0,kx:0,ky:0});
function arena(id){const a=createArena([build(id),{...build('basic'),id:'b'}],{seed:22});for(const b of a.balls){b.cl.speed=0;b.next=9999;b.hp=b.maxHp=10000;}pose(a.balls[0],100,100);pose(a.balls[1],160,100);return a;}
function steps(a,n=1){for(let i=0;i<n;i++)stepArena(a);}
function projectile(a,owner,target,extra={}){const o={id:'fixture-'+a.serial++,owner,kind:'fixture',field:false,x:target.x-15,y:target.y,vx:300,vy:0,r:5,power:1,born:-1,expires:a.tick+20,maxTargets:1,hit:new Set(),rootAttackId:'fixture-root-'+a.serial,reflected:0,...extra};a.objects.push(o);return o;}
function weaponHit(a){const [b,q]=a.balls;pose(b,100,100);b.angle=-b.cl.spin;b.immunity.clear();pose(q,100+b.cl.orbit,100);steps(a);}
const ownEvents=(a,id,type)=>a.events.filter(e=>e.sourceId==='a'&&(!id||e.kind===id)&&(!type||e.type===type));

test('representative gate: mace charges only after real wall-backed weapon hits and grows an actual head',()=>{
  const a=arena('mace'),[b]=a.balls;
  b.state.wallCharge=0;weaponHit(a);assert.equal(b.evolution.value,0);
  for(let i=0;i<2;i++){b.state.wallCharge=1;weaponHit(a);}assert.equal(b.evolution.ready,true);
  b.state.wallCharge=3;weaponHit(a);const event=ownEvents(a,'mace','hit').at(-1);
  assert.equal(b.evolution.activations,1);assert.ok(event.impulse>b.baseCombat.push*1.25);assert.equal(event.evolutionId,'evo-mace');
  assert.ok(arenaSnapshot(a).objects.find(o=>o.ownerId==='a'&&o.kind==='mace').r>b.baseCombat.weaponR);assert.ok(b.evolution.recoveryUntil>a.tick);
});
test('representative gate: trinity charges from three distinct actual strikes and sends a bounded three-way wave',()=>{
  const a=arena('trinity'),[b]=a.balls;for(let i=0;i<3;i++)weaponHit(a);assert.equal(b.evolution.ready,true);steps(a);
  const shots=a.objects.filter(o=>o.kind==='triad-crescent');assert.equal(shots.length,3);assert.equal(new Set(shots.map(o=>o.rootAttackId)).size,1);assert.equal(shots[0].hit,shots[1].hit);
  assert.ok(b.evolution.effects.spin>1);assert.equal(b.evolution.activations,1);
});
test('representative gate: tide requires real front blocks and its consumed wave has larger physical reach',()=>{
  const a=arena('tide'),[b,q]=a.balls;b.heading=Math.PI;b.vx=-1;
  for(let i=0;i<2;i++){b.blockedAt=-999;projectile(a,q,b);steps(a);}assert.equal(b.evolution.ready,true);assert.equal(b.charge,2);
  pose(q,b.x+b.cl.range*1.1,b.y);b.next=0;steps(a);assert.equal(b.evolution.activations,1);assert.ok(ownEvents(a,'surge','hit').at(-1)?.damage>0);assert.equal(b.evolution.ready,false);
  const rear=arena('tide');rear.balls[0].heading=0;projectile(rear,rear.balls[1],rear.balls[0]);steps(rear);assert.equal(rear.balls[0].evolution.value,0);
});
test('representative gate: beam needs two actual line hits, then widens its fixed line and recoils',()=>{
  const a=arena('beam'),[b,q]=a.balls;
  for(let i=0;i<2;i++){b.charge=1;b.aim=0;b.next=0;pose(b,70,100);pose(q,150,100);steps(a);}assert.equal(b.evolution.ready,true);
  pose(b,70,100);pose(q,150,100+q.r+(b.cl.beamR??9)*1.1);b.charge=1;b.aim=0;b.next=0;steps(a);
  assert.ok(ownEvents(a,'beam','hit').at(-1)?.evolutionId);assert.ok(b.kx<0);assert.ok(Math.abs(ownEvents(a,'beam','skill').at(-1).r-(b.cl.beamR??9)*1.2)<1e-8);
});
test('representative gate: bolt needs effective dashes and extends a real fixed-direction dash',()=>{
  const a=arena('bolt'),[b,q]=a.balls;
  for(let i=0;i<2;i++){pose(b,100,100);pose(q,120,100);b.dashUntil=a.tick+5;b.immunity.clear();steps(a);}assert.equal(b.evolution.ready,true);
  pose(q,220,100);b.charge=1;b.next=0;b.aim=0;steps(a);assert.ok(b.dashUntil-a.tick>b.cl.dashTicks);assert.ok(b.vx>0);assert.equal(b.evolution.activations,1);
});
test('representative gate: frost converts its third wave into a delayed real shatter without another charge',()=>{
  const a=arena('frost'),[b,q]=a.balls;
  for(let i=0;i<3;i++){pose(b,100,100);pose(q,145,100);b.next=0;steps(a);}assert.equal(b.evolution.activations,1);const count=b.evolution.consumed;
  steps(a,18);const e=ownEvents(a,'ice-fracture','hit').at(-1);assert.ok(e?.damage>0);assert.ok(e.reasonTags.includes('derived'));assert.equal(b.evolution.consumed,count);assert.ok(q.slowUntil>a.tick);
});
test('representative gate: summoner charges only effective familiar damage and upgrades one existing familiar',()=>{
  const a=arena('summoner'),[b,q]=a.balls;
  for(let i=0;i<3;i++){projectile(a,b,q,{summon:true,kind:'shadow'});steps(a);a.tick+=12;}assert.equal(b.evolution.ready,true);
  a.objects.push({id:'familiar-existing',owner:b,field:true,kind:'familiar',x:b.x,y:b.y,r:7,angle:0,born:-1,next:9999,expires:1000});b.next=0;steps(a);
  const familiars=a.objects.filter(o=>o.kind==='familiar');assert.equal(familiars.length,1);assert.equal(familiars[0].id,'familiar-existing');assert.ok(familiars[0].r>7);assert.ok(familiars[0].fireIntervalScale<1);
});
test('representative gate: star requires two absorbable projectiles; reflection and idle time cannot fill it',()=>{
  const a=arena('star'),[b,q]=a.balls;projectile(a,q,b,{reflected:1});steps(a);assert.equal(b.evolution.value,0);
  for(let i=0;i<2;i++){b.blockedAt=-999;projectile(a,q,b);steps(a);}assert.equal(b.evolution.ready,true);
  b.next=0;steps(a);const shot=a.objects.find(o=>o.kind==='starcounter');assert.ok(shot?.reflected);assert.ok(shot.r>8);assert.equal(shot.evolutionId,'evo-star');assert.equal(b.charge,0);
});

test('all 50 evolution contracts reject zero damage, consume once, expire and reset per arena',()=>{
  assert.equal(Object.keys(EVOLUTIONS).length,50);
  for(const [id,d] of Object.entries(EVOLUTIONS)){
    const a=arena(id),b=a.balls[0],emitted=[],c={emit:(_a,type,kind)=>emitted.push({type,kind})};
    assert.ok(d.weakness&&d.actions.length&&Object.keys(d.effects).length,id);
    evolutionSignal(a,b,'event',{type:'hit',kind:'body',damage:0,targetId:'b',rootAttackId:'zero',reasonTags:['direct']},c);assert.equal(b.evolution.value,0,id);
    assert.equal(b.evolution.activations,0);assert.equal(b.awakeningState.status,'locked');
    primeEvolutionDemo(a,b);assert.equal(b.evolution.ready,true,id);assert.ok(a.events.some(e=>e.type==='evo-ready'&&e.sourceId==='a'),id);
    if(id==='mace')b.state.wallCharge=3;if(id==='fracture')a.balls[1].slowUntil=60;
    if(id==='thorn')a.balls[1].dots.set('a/poison',{owner:b,kind:'poison',stacks:2});if(id==='morph')b.state.form=0;
    const activated=evolutionAction(a,b,d.actions[0],c,{target:a.balls[1],rootAttackId:'action'});assert.ok(activated,id);assert.equal(b.evolution.consumed,1,id);
    assert.equal(evolutionAction(a,b,d.actions[0],c),false,id);
    a.tick=b.evolution.activeUntil+1;evolutionTick(a,b,{...c,hit:()=>{}});assert.deepEqual(b.evolution.effects,{},id);assert.equal(arena(id).balls[0].evolution.value,0,id);
  }
});

test('fixed fist and portal telegraphs allow real movement to evade and never track the new position',()=>{
  const a=arena('elastic'),[b,q]=a.balls;b.next=0;steps(a);assert.ok(ownEvents(a,'punchcharge').length);const hp=q.hp;pose(q,100,170);steps(a,12);assert.equal(q.hp,hp);assert.equal(ownEvents(a,'punch','hit').length,0);assert.ok(ownEvents(a,'punch-release').at(-1).miss);
  const p=arena('portal'),[owner,target]=p.balls;pose(target,280,100);target.vx=-1;owner.next=0;steps(p);const exit={...owner.state.portalExit};assert.ok(exit.x<=p.width-owner.r);pose(target,25,190);steps(p,12);assert.equal(owner.teleportedAt,13);assert.equal(ownEvents(p,'portalstrike','hit').length,0);assert.ok(Math.hypot(owner.x-exit.x,owner.y-exit.y)<8);
});
test('mason transfers only a first reflected projectile while current leaves its caster body untouched',()=>{
  const a=arena('mason'),[b,q]=a.balls;b.next=0;steps(a);const wall=a.objects.find(o=>o.kind==='wallsegment');a.tick=wall.armAt;const shot=projectile(a,q,b,{x:wall.x-2,y:(wall.y+wall.y2)/2,vx:180,vy:0});const root=shot.rootAttackId;steps(a);assert.equal(shot.owner,b);assert.equal(shot.reflected,1);assert.equal(shot.rootAttackId,root);assert.ok(shot.vx<0);
  const c=arena('current'),[cur,enemy]=c.balls;cur.next=0;steps(c);const flow=c.objects.find(o=>o.kind==='watercurrent');pose(cur,flow.x,flow.y-25);pose(enemy,flow.x+20,flow.y);cur.next=9999;steps(c);assert.equal(cur.kx,0);assert.equal(cur.ky,0);assert.ok(Math.hypot(enemy.kx,enemy.ky)>0);
});

test('reflection ownership keeps the six-shot cap and a destroyed decoy cannot keep blocking',()=>{
  const a=arena('mason'),[b,q]=a.balls;b.next=0;steps(a);const wall=a.objects.find(o=>o.kind==='wallsegment');a.tick=wall.armAt;
  for(let i=0;i<6;i++)projectile(a,b,q,{x:5+i*8,y:5,vx:0,vy:0});
  const extra=projectile(a,q,b,{x:wall.x-2,y:(wall.y+wall.y2)/2,vx:180,vy:0});steps(a);assert.equal(a.objects.filter(o=>!o.field&&o.owner===b).length,6);assert.ok(extra.cancelled);assert.ok(!a.objects.includes(extra));
  const d=arena('decoy'),[owner,enemy]=d.balls;owner.next=0;steps(d);const clone=d.objects.find(o=>o.kind==='decoy');
  for(let i=0;i<2;i++)projectile(d,enemy,owner,{x:clone.x,y:clone.y,vx:0,vy:0,power:4});steps(d);assert.equal(d.events.filter(e=>e.type==='block'&&e.kind==='decoy').length,1);assert.ok(!d.objects.includes(clone));
});
test('an absorbed returning shield enters bounded recovery instead of leaving permanent away state',()=>{
  const a=createArena([{...build('returner'),id:'a'},{...build('star'),id:'b'}],{seed:22}),[b,q]=a.balls;
  for(const p of a.balls){p.cl.speed=0;p.next=9999;}pose(b,80,100);pose(q,180,100);b.state.away=true;b.next=5;
  const shield=projectile(a,b,q,{kind:'returnshield',returnShield:true,returning:false,turnAt:999,rootAttackId:'lost-shield'});steps(a);assert.ok(a.events.some(e=>e.kind==='absorb'));assert.ok(!a.objects.includes(shield));steps(a);assert.equal(b.state.away,false);assert.equal(b.next-a.tick,60);assert.ok(a.events.some(e=>e.kind==='shield-lost'));
});

test('normal familiar evolution upgrades one object and expires at its activation deadline without renewal',()=>{
  for(const existing of [false,true]){
    const a=arena('summoner'),b=a.balls[0];if(existing)a.objects.push({id:'old-familiar',kind:'familiar',owner:b,field:true,x:b.x,y:b.y,r:7,angle:0,born:-1,next:9999,expires:1000});primeEvolutionDemo(a,b);b.next=0;steps(a);
    const upgraded=a.objects.find(o=>o.upgraded);assert.ok(upgraded);const deadline=b.evolution.activeUntil;assert.equal(upgraded.upgradeUntil,deadline);const id=upgraded.id;
    b.next=0;steps(a);assert.equal(a.objects.filter(o=>o.upgraded).length,1);assert.equal(upgraded.id,id);assert.equal(upgraded.upgradeUntil,deadline);assert.ok(a.objects.filter(o=>o.kind==='familiar').length<=2);
    b.next=9999;steps(a,deadline-a.tick+1);assert.equal(upgraded.upgraded,false);assert.equal(upgraded.r,7);assert.equal(upgraded.fireIntervalScale,1);
  }
});
test('decoy melee interception records only positive absorbed HP and charges the same defense ledger',()=>{
  const a=arena('decoy'),[b,q]=a.balls;b.next=0;steps(a);const clone=a.objects.find(o=>o.kind==='decoy');pose(q,clone.x+20,clone.y);const ownHp=b.hp,oldHp=clone.hp;steps(a);
  const e=a.events.find(e=>e.type==='block'&&e.kind==='decoy'&&e.interceptedKind==='body');assert.ok(e?.blocked>0);assert.ok(Math.abs(e.blocked-(oldHp-clone.hp))<1e-9);assert.equal(b.hp,ownHp);assert.equal(b.evolution.value,e.blocked);const value=b.evolution.value;steps(a);assert.equal(b.evolution.value,value);
});
test('collinear current acceleration never charges direction change; genuine turns do',()=>{
  const a=arena('current'),[b,q]=a.balls;pose(q,130,100);q.vx=20;a.objects.push({id:'flow-fixture',kind:'watercurrent',field:true,owner:b,x:130,y:100,r:65,angle:0,born:-1,expires:200});
  const shot=projectile(a,q,b,{x:120,y:100,vx:20,vy:0});steps(a);assert.equal(b.evolution.value,0);assert.equal(ownEvents(a,'current-bend').length,0);
  q.vx=0;q.vy=20;q.kx=q.ky=0;shot.vx=0;shot.vy=20;steps(a);assert.equal(b.evolution.ready,true);assert.ok(ownEvents(a,'current-bend').every(e=>e.turnAngle>=.0035));
});
test('berserk evolution ignores rage waves and spends exactly one direct collision before fatigue',()=>{
  const a=arena('berserk'),[b,q]=a.balls;primeEvolutionDemo(a,b);b.rage=60;b.next=0;pose(q,150,100);steps(a);assert.equal(b.evolution.ready,true);assert.equal(b.evolution.activations,0);assert.ok(ownEvents(a,'ragewave','hit').length);
  pose(b,100,100);pose(q,120,100);b.immunity.clear();steps(a);const strike=ownEvents(a,'ragebody','hit').at(-1);assert.equal(strike.impulse,100);assert.equal(b.evolution.activations,1);assert.ok(b.rage<30);assert.equal(b.next,b.evolution.recoveryUntil);assert.ok(b.state.fatigueUntil>a.tick);
  pose(b,100,100);pose(q,120,100);b.immunity.clear();steps(a);assert.equal(ownEvents(a,'body','hit').at(-1).impulse,0);assert.equal(b.evolution.activations,1);
});
test('vampire match budget counts actual normal and mythic healing together and never over-heal or resurrect',()=>{
  const a=arena('vampire'),b=a.balls[0],events=[],c={emit:(_a,type,kind,_b,_t,_x,_y,e)=>events.push({type,kind,...e})},cap=b.maxHp*VAMPIRE_MATCH_HEAL_CAP;
  b.hp=b.maxHp;a.healing=[{ball:b,amount:500,kind:'lifesteal'}];flushHealing(a,c);assert.equal(b.state.lifestealTotal??0,0);
  b.hp=b.maxHp*.1;a.healing=[{ball:b,amount:cap-5,kind:'lifesteal'},{ball:b,amount:50,kind:'mythic-lifesteal'}];flushHealing(a,c);assert.equal(b.state.lifestealTotal,cap);assert.equal(events.at(-1).healing,5);
  b.hp=b.maxHp*.1;a.healing=[{ball:b,amount:50,kind:'lifesteal'}];const count=events.length;flushHealing(a,c);assert.equal(events.length,count);assert.equal(b.hp,b.maxHp*.1);
  b.hp=0;a.healing=[{ball:b,amount:50,kind:'mythic-lifesteal'}];flushHealing(a,c);assert.equal(b.hp,0);assert.equal(arena('vampire').balls[0].state.lifestealTotal??0,0);
});

test('thorn qualifies repeated direct hits on the same poisoned target, never adds different targets or DoT',()=>{
  const a=createArena([build('thorn'),{...build('basic'),id:'b'},{...build('basic'),id:'c'}],{seed:22}),[b,q,r]=a.balls,c={emit:()=>{}};
  for(const p of [q,r])p.dots.set('a/poison',{owner:b,kind:'poison',stacks:2,end:300});
  const signal=(target,root,extra={})=>evolutionSignal(a,b,'event',{type:'hit',kind:'thorn',damage:8,targetId:target.id,rootAttackId:root,reasonTags:['direct'],...extra},c);
  signal(q,'first-b');assert.equal(b.evolution.value,1);signal(r,'first-c');assert.equal(b.evolution.value,1);assert.equal(b.evolution.ready,false);
  signal(q,'first-b');signal(q,'poison-tick',{kind:'poison',reasonTags:['status']});assert.equal(b.evolution.ready,false);
  signal(q,'second-b');assert.equal(b.evolution.ready,true);assert.equal(b.evolution.chargeTargetId,q.id);assert.equal(b.evolution.targetHits.length,2);
  assert.equal(evolutionAction(a,b,'thorn',c,{target:r}),false,'ready poison burst cannot transfer to another target');
  assert.equal(evolutionAction(a,b,'thorn',c,{target:q}),true);
  const wrong={source:b,target:r,kind:'thorn',power:.4,status:'poison'};evolutionHit(a,wrong,c);assert.equal(wrong.power,.4);assert.equal(r.dots.get('a/poison').stacks,2);
  const right={source:b,target:q,kind:'thorn',power:.4,status:'poison'};evolutionHit(a,right,c);assert.ok(Math.abs(right.power-.82)<1e-9);assert.equal(right.status,null);assert.equal(q.dots.has('a/poison'),false);
  q.dots.set('a/poison',{owner:b,kind:'poison',stacks:2});const repeat={source:b,target:q,kind:'thorn',power:.4,status:'poison'};evolutionHit(a,repeat,c);assert.equal(repeat.power,.4,'one designated poison burst per activation');
});

test('thorn target progress expires individually and its actual next qualified weapon hit consumes poison',()=>{
  const a=arena('thorn'),[b,q]=a.balls,c={emit:()=>{}};q.dots.set('a/poison',{owner:b,kind:'poison',stacks:2,end:1000,next:1000,power:.2});
  const event=root=>({type:'hit',kind:'thorn',damage:4,targetId:q.id,rootAttackId:root,reasonTags:['direct']});
  evolutionSignal(a,b,'event',event('old'),c);a.tick=361;evolutionSignal(a,b,'event',event('fresh'),c);assert.equal(b.evolution.ready,false);assert.equal(b.evolution.value,1);
  evolutionSignal(a,b,'event',event('fresh-2'),c);weaponHit(a);const strike=ownEvents(a,'thorn','hit').at(-1);assert.ok(strike?.damage>0);assert.equal(strike.evolutionId,'evo-thorn');assert.equal(b.evolution.activations,1);assert.equal(q.dots.has('a/poison'),false);
});

test('morph readiness requires one effective action in each distinct scheduled form',()=>{
  const a=arena('morph'),b=a.balls[0],c={emit:()=>{}};
  const signal=(kind,root,type='hit')=>evolutionSignal(a,b,'event',{type,kind,damage:8,blocked:8,targetId:'b',rootAttackId:root,reasonTags:['direct']},c);
  b.state.form=0;signal('body','run-1');signal('body','run-2');assert.equal(b.evolution.value,1);assert.equal(b.evolution.ready,false);
  b.state.form=1;signal('body','wrong-form');assert.equal(b.evolution.value,1);signal('morphshot','shot-1');signal('morphshot','shot-2');assert.equal(b.evolution.value,2);
  b.state.form=2;signal('body','guard-body');assert.equal(b.evolution.value,2);signal('morph','guard-1','block');assert.equal(b.evolution.ready,true);assert.equal(b.evolution.formMask,7);
  const stale=arena('morph'),p=stale.balls[0];p.state.form=0;evolutionSignal(stale,p,'event',{type:'hit',kind:'body',damage:4,targetId:'b',rootAttackId:'old-form',reasonTags:['direct']},c);stale.tick=361;p.state.form=1;evolutionSignal(stale,p,'event',{type:'hit',kind:'morphshot',damage:4,targetId:'b',rootAttackId:'new-form',reasonTags:['direct']},c);assert.equal(p.evolution.value,1);assert.equal(p.evolution.formMask,2);
});

test('morph empowers only its next scheduled dash or shot while preserving the 18-tick gap',()=>{
  function scheduled(form,enabled){const a=arena('morph'),[b,q]=a.balls;pose(b,70,60);pose(q,290,170);b.vx=100;b.state.form=(form+2)%3;if(enabled)primeEvolutionDemo(a,b);b.next=0;steps(a);return a;}
  const fast=scheduled(0,true),normal=scheduled(0,false),b=fast.balls[0];assert.equal(b.state.form,0);assert.equal(b.state.gapUntil-fast.tick,18);assert.equal(b.cl.speed,218*1.12);assert.ok(b.x>normal.balls[0].x);assert.equal(b.evolution.effects.guard,undefined);assert.equal(b.evolution.effects.formShotR,undefined);
  fast.tick=20;pose(b,100,100);pose(fast.balls[1],120,100);b.immunity.clear();steps(fast);assert.ok(ownEvents(fast,'body','hit').some(e=>e.damage>0));assert.equal(b.cl.speed,218);assert.equal(b.evolution.effects.formSpeed,undefined,'first effective running contact consumes its movement boost');
  const shot=scheduled(1,true),ordinary=scheduled(1,false),o=shot.objects.find(o=>o.kind==='morphshot'),base=ordinary.objects.find(o=>o.kind==='morphshot');assert.equal(shot.balls[0].state.form,1);assert.equal(shot.balls[0].state.gapUntil-shot.tick,18);assert.equal(o.r,base.r*1.2);assert.equal(shot.objects.filter(o=>o.kind==='morphshot').length,1);assert.equal(shot.balls[0].evolution.effects.guard,undefined);assert.equal(shot.balls[0].cl.speed,160);
});

test('morph next defensive form strengthens one real block and then returns to normal defense',()=>{
  function trial(enabled){const a=arena('morph'),[b,q]=a.balls;pose(b,70,60);pose(q,290,170);b.state.form=1;if(enabled)primeEvolutionDemo(a,b);b.next=0;steps(a);assert.equal(b.state.form,2);assert.equal(b.state.gapUntil-a.tick,18);a.tick=20;
    const amounts=[];for(let i=0;i<2;i++){const root='guard-'+i;b.blockedAt=-999;a.pending.push({source:q,target:b,kind:'body',power:1,nx:-1,ny:0,x:b.x,y:b.y,attackId:root});steps(a);amounts.push(a.events.find(e=>e.type==='block'&&e.rootAttackId===root).blocked);}assert.equal(b.cl.speed,145);return amounts;}
  const enhanced=trial(true),ordinary=trial(false);assert.ok(enhanced[0]>ordinary[0]);assert.equal(enhanced[1],ordinary[1]);
});

// Prepared isolated A/B trials prove actual changed runtime geometry, movement,
// damage, healing or guard timing. They do not prove normal-match readiness;
// trigger-ledger tests below and the separate balance sweep cover that question.
function mechanismTrace(id,enabled){
  const a=createDemoArena(id,{awakening:id!=='basic'}),b=a.balls[0];b.awakeningState.status='locked';b.awakeningState.ready=false;
  if(id==='basic'){primeEvolutionDemo(a,b);pose(a.balls[1],b.x+24,b.y);}
  if(!enabled){b.evolution.ready=false;b.evolution.value=0;b.evolution.recoveryUntil=99999;}
  const trace=[];let lastSeq=0;
  while(!a.done){stepArena(a);trace.push({balls:a.balls.map(p=>[p.x,p.y,p.hp,p.r,p.cl.mass,p.dashUntil,p.state.gapUntil,p.state.guardUntil,p.slowUntil]),weapons:arenaSnapshot(a).objects.filter(o=>o.id.startsWith(b.id+'/w')).map(o=>[o.x,o.y,o.r,o.angle]),objects:a.objects.filter(o=>o.owner===b).map(o=>[o.kind,o.x,o.y,o.r,o.vx,o.vy,o.expires,o.x2,o.y2,o.hp,o.pullScale,o.coreScale,o.fireIntervalScale,o.returnSpeedScale,o.forceScale,o.webPulse]),events:a.events.filter(e=>e.seq>lastSeq&&e.sourceId===b.id&&['hit','heal','block','skill'].includes(e.type)).map(e=>[e.type,e.kind,e.damage,e.healing,e.blocked,e.impulse,e.r,e.halfAngle,e.endX,e.endY])});lastSeq=a.seq;}
  return {trace,activations:b.evolution.activations};
}
for(const id of Object.keys(EVOLUTIONS))test(`actual evolution runtime A/B: ${id}`,()=>{
  const changed=mechanismTrace(id,true),control=mechanismTrace(id,false);assert.ok(changed.activations>0,id+' must consume a real designated action');assert.notEqual(JSON.stringify(changed.trace)===JSON.stringify(control.trace),true,id+' must change geometry, motion, HP, field or timed defense');
});

test('all fifty trigger ledgers require their positive authoritative event and deduplicate its root',()=>{
  const hits={body:'body',blade:'blade',dash:'dash',arc:'arc','mace-wall':'mace','thorn-poison':'thorn',bloom:'bloom',prism:'prism',collapse:'collapse',crescent:'crescent',trinity:'trinity',shadowdash:'shadowdash',punch:'punch',beam:'beam',icewave:'icewave',portalstrike:'portalstrike','summon-hit':'shadow','chain-pull':'chain',sonic:'sonic','morph-success':'body','fire-hit':'body',thermal:'thermal','curse-touch':'curse-touch',saw:'saw',snipe:'snipe','trail-cross':'trail-cross','copy-hit':'copy-cleave',lightningstrike:'lightningstrike','web-cross':'web-cross','frost-touch':'frost-touch',jab:'jab'};
  const skills={return:'shield-return',swing:'swing-release',salvo:'salvo-fired','card-cycle':'card','wall-deflect':'wall-deflect','current-bend':'current-bend'};
  for(const [id,d] of Object.entries(EVOLUTIONS)){
    const a=arena(id),[b,q]=a.balls,c={emit:()=>{},hit:()=>{}};a.tick=30;b.teleportedAt=29;q.dots.set('a/poison',{owner:b,kind:'poison',stacks:2});if(id==='morph')b.state.form=0;
    const e={type:'hit',kind:hits[d.trigger],damage:10,blocked:10,healing:10,targetId:q.id,sourceId:b.id,rootAttackId:'valid-root',reasonTags:['direct'],wallCharged:true,reflected:true,captured:true,acted:true,impulse:4,turnAngle:.1};
    let signal='event';
    if(d.trigger==='taken'){signal='taken';e.sourceId=q.id;e.targetId=b.id;e.damage=b.maxHp*d.count;}
    else if(d.trigger==='wall'){e.type='wall';e.kind='bounce';}
    else if(['block','absorb','capture','decoy-block'].includes(d.trigger)){e.type='block';e.kind={block:id,absorb:'absorb',capture:'capture','decoy-block':'decoy'}[d.trigger];}
    else if(skills[d.trigger]){e.type='skill';e.kind=skills[d.trigger];}
    else if(d.trigger==='lifesteal'){e.type='heal';e.kind='lifesteal';}
    else if(d.trigger==='summon-hit')e.reasonTags=['summon'];
    if(['travel','small-travel'].includes(d.trigger)){b.evolution.lastX=b.x;b.evolution.lastY=b.y;b.x+=4;b.teleportedAt=-99;evolutionTick(a,b,c);assert.ok(b.evolution.value>0,id);continue;}
    evolutionSignal(a,b,signal,e,c);const before=b.evolution.value;assert.ok(before>0||b.evolution.ready,id+' valid event must progress');
    evolutionSignal(a,b,signal,e,c);assert.equal(b.evolution.value,before,id+' same root cannot progress again');
    const invalid=arena(id),p=invalid.balls[0];evolutionSignal(invalid,p,signal,{...e,damage:0,blocked:0,healing:0,impulse:0,captured:false,acted:false,reflected:false,rootAttackId:'invalid'},c);
    if(!['wall','swing','salvo','wall-deflect'].includes(d.trigger))assert.equal(p.evolution.value,0,id+' no effective result cannot progress');
  }
});
