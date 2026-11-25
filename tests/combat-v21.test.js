import test from 'node:test';
import assert from 'node:assert/strict';
import {createArena,stepArena,arenaSnapshot,createDemoArena,RULESET_VERSION} from '../packages/sim/index.js';
import {CLASSES,COMBAT,AWAKENING_PROFILES} from '../packages/content/classes.js';
import {NEW_PROFILES} from '../packages/content/new-profiles.js';
import {TRAITS,compatibleTraits,traitCompatible} from '../packages/content/traits.js';
import {BALL_CATALOG,PATHS} from '../packages/content/balls.js';
import {summarizeEvents} from '../packages/sim/replay.js';

const make=(id,other='basic',traitId=null)=>createArena([{id:'a',name:'A',classId:id,level:15,traitId},{id:'b',name:'B',classId:other,level:15}],{seed:21});
const pose=(b,x,y,vx=0,vy=172)=>Object.assign(b,{x,y,px:x,py:y,vx,vy,kx:0,ky:0});
const step=(a,n=1)=>{for(let i=0;i<n&&!a.done;i++)stepArena(a);};
const shot=(a,owner,x,y,kind='test')=>{const o={id:'manual-'+a.serial++,kind,owner,field:false,x,y,vx:200,vy:0,r:5,power:1,born:-1,expires:a.tick+200,maxTargets:1,hit:new Set(),reflected:0};a.objects.push(o);return o;};

test('v2.1 catalog has 24 new behavioral profiles, 508 forms and three valid fixed traits per profile',()=>{
  assert.equal(RULESET_VERSION,'2.1.0');assert.equal(NEW_PROFILES.length,24);assert.equal(Object.keys(CLASSES).length,50);assert.equal(BALL_CATALOG.length,508);
  assert.equal(Object.keys(TRAITS).length,10);
  for(const p of Object.values(CLASSES)){
    const ts=compatibleTraits(p.id);assert.equal(ts.length,3);assert.equal(new Set(ts.map(t=>t.id)).size,3);
    for(const t of ts){assert.ok(t.name&&t.description&&t.tradeoff&&traitCompatible(p.id,t.id));
      if(t.id==='long_reach')assert.ok(p.orbit&&p.spin);
      if(t.id==='quick_return')assert.equal(p.id,'returner');
      if(t.id==='squad_focus')assert.ok(['summoner','decoy'].includes(p.id));
      if(t.id==='frost_fracture')assert.equal(p.id,'frost');
      if(t.id==='pulse_focus')assert.ok(p.windup);
    }
  }
  for(const path of Object.keys(PATHS))for(let tier=1;tier<=10;tier++)assert.ok(BALL_CATALOG.filter(b=>b.path===path&&b.tier===tier).length>=3);
});

test('ranking simultaneous KO is a draw while tournament retains a seeded advancer',()=>{
  const builds=[{id:'a',classId:'basic',level:0},{id:'b',classId:'basic',level:0}];
  for(const policy of ['ranking','tournament']){
    const a=createArena(builds,{seed:2,outcomePolicy:policy});pose(a.balls[0],90,90,172,0);pose(a.balls[1],116,90,-172,0);a.balls.forEach(b=>{b.hp=1;});step(a);
    assert.equal(a.outcome.draw,policy==='ranking');assert.equal(a.results[0].rank,1);if(policy==='ranking'){assert.equal(a.outcome.winnerId,null);assert.equal(a.results[1].rank,1);}
    assert.equal(a.limitTicks,40*60);assert.equal(a.pressureTick,30*60);
  }
});

test('separate impulse survives base velocity normalization and stability reduces it',()=>{
  const a=make('elastic'),b=make('elastic','basic');
  b.balls[1].traitId='stability'; // Recreate to apply configuration through the public API.
  const stable=createArena([{id:'a',classId:'elastic',level:15},{id:'b',classId:'basic',level:15,traitId:'stability'}],{seed:21});
  for(const arena of [a,stable]){pose(arena.balls[0],90,100);pose(arena.balls[1],155,100);arena.balls[0].next=0;step(arena);}
  assert.ok(a.balls[1].kx>100);assert.ok(stable.balls[1].kx<a.balls[1].kx*.7);
  const initial=a.balls[1].kx;step(a,3);assert.ok(Math.abs(a.balls[1].kx)>initial*.8);
});

test('returning shield really leaves guard, bounces, catches and quick-return changes only its next wait',()=>{
  for(const trait of [null,'quick_return']){
    const a=make('returner','basic',trait),[b,q]=a.balls;pose(b,100,100,172,0);pose(q,220,100);b.next=0;step(a);
    const shield=a.objects.find(o=>o.returnShield);assert.ok(shield&&b.state.away);
    shield.x=a.width-1;shield.vx=270;step(a);assert.ok(shield.returning);
    shield.x=b.x;shield.y=b.y;step(a);assert.equal(b.state.away,false);assert.ok(a.events.some(e=>e.kind==='shield-return'));
    assert.equal(b.next-a.tick,Math.ceil(70*(trait?TRAITS.quick_return.params.cooldown:1)));
  }
});

test('pendulum follows a wall-anchored arc then releases real momentum',()=>{
  const a=make('pendulum'),b=a.balls[0];pose(b,80,100);b.next=0;step(a);const anchor={...b.state.swing},positions=[];
  for(let i=0;i<25;i++){step(a);positions.push([b.x,b.y]);assert.ok(Math.abs(Math.hypot(b.x-anchor.x,b.y-anchor.y)-anchor.r)<1);}
  assert.ok(new Set(positions.map(([x])=>x.toFixed(1))).size>10);step(a,25);assert.equal(b.state.swing,null);assert.ok(b.dashUntil>=a.tick);
});

test('reactor salvos have a finite overheat interval and captor cannot recapture reflected attacks',()=>{
  const a=make('reactor'),b=a.balls[0];b.next=0;step(a,300);assert.ok(a.events.some(e=>e.kind==='overheat'));assert.ok(b.state.coolUntil>0);
  const cap=make('captor'),[c,q]=cap.balls;pose(c,100,100);pose(q,240,160);shot(cap,q,100,100);const reflected=shot(cap,q,100,100);reflected.reflected=1;step(cap);
  assert.equal(c.state.held.length,1);assert.ok(cap.objects.includes(reflected)||cap.events.some(e=>e.kind==='test'));
  c.state.releaseAt=cap.tick+1;step(cap);assert.equal(c.state.held.length,0);assert.ok(cap.objects.some(o=>o.kind==='captured'&&o.reflected===1));
});

test('rewind only restores bounded self health/location and phoenix reforms exactly once',()=>{
  const a=createDemoArena('rewind'),b=a.balls[0],otherHp=a.balls[1].hp;step(a);assert.ok(b.state.used);assert.ok(b.hp<=b.maxHp*.87+1e-6);assert.equal(a.balls[1].hp,otherHp);assert.equal(a.tick,1);
  const p=make('phoenix'),[bird,q]=p.balls;pose(bird,100,100,172,0);pose(q,126,100,-172,0);bird.hp=1;step(p);assert.ok(bird.state.revived&&bird.hp>0);assert.ok(p.objects.some(o=>o.kind==='phoenixfire'));
  bird.hp=1;bird.immunity.clear();q.immunity.clear();pose(bird,100,100,172,0);pose(q,126,100,-172,0);step(p);assert.equal(bird.hp,0);assert.equal(p.events.filter(e=>e.kind==='reform').length,1);
});

test('temporary wall has a telegraph, reflects physical movement, and expires',()=>{
  const a=make('mason'),[b,q]=a.balls;pose(b,80,100,172,0);pose(q,245,170);b.next=0;step(a);const wall=a.objects.find(o=>o.kind==='wallsegment');assert.ok(wall?.warning);
  step(a,20);pose(q,wall.x-14,100,172,0);step(a);assert.ok(q.vx<0);assert.ok(q.x<wall.x);
  a.tick=wall.expires-1;step(a);assert.ok(!a.objects.includes(wall));
});

test('three forms/cards are fixed cycles, titan size/mass is physical and wall safe',()=>{
  for(const id of ['morph','cards']){
    const a=make(id),b=a.balls[0],seen=[];for(let i=0;i<4;i++){b.next=a.tick;step(a);seen.push(b.state[id==='morph'?'form':'card']);}
    assert.deepEqual(seen,[0,1,2,0]);
  }
  const a=make('titan'),b=a.balls[0];pose(b,14,14,-150,-150);b.next=0;step(a);assert.equal(b.r,19);assert.ok(b.cl.mass>1&&b.x>=b.r&&b.y>=b.r);b.next=a.tick;step(a);assert.equal(b.r,9);assert.ok(b.cl.speed>200);
});

test('thermal sweeps a sequence after its windup and sniper fixes lead aim until launch',()=>{
  const a=make('thermal'),b=a.balls[0];b.next=0;step(a);const start=a.tick;assert.ok(a.events.some(e=>e.kind==='thermalcharge'));assert.equal(a.events.filter(e=>e.kind==='thermal').length,0);
  step(a,b.cl.windup+52);const angles=a.events.filter(e=>e.kind==='thermal'&&e.type==='skill').map(e=>e.angle);assert.ok(new Set(angles).size>=4);assert.ok(a.tick-start>b.cl.windup);
  const s=make('sniper'),[sn,q]=s.balls;sn.next=0;step(s);const aim=sn.aim;pose(q,15,15);step(s,sn.cl.windup);const bullet=s.objects.find(o=>o.kind==='snipe');assert.ok(bullet);assert.ok(Math.abs(Math.atan2(bullet.vy,bullet.vx)-aim)<1e-8);
});

test('curse/fracture/combo consume bounded direct-hit marks and saw heats only on actual contact',()=>{
  for(const id of ['curse','fracture','combo']){
    const a=make(id),[b,q]=a.balls;b.next=99999;q.next=99999;
    for(let i=0;i<(id==='combo'?4:3);i++){a.tick=i*40;pose(b,90,90,172,0);pose(q,116,90,-172,0);step(a);}
    assert.equal(b.state.marks,0);assert.equal(b.state.queued.length,1);step(a,31);assert.ok(a.events.some(e=>e.kind===({curse:'curse-release',fracture:'ice-shatter',combo:'combo-finish'}[id])));
    assert.ok(a.events.filter(e=>e.kind==='marks-release').length<=1);
  }
  const a=make('saw'),[b,q]=a.balls;
  for(let i=0;i<6;i++){a.tick=i*21;pose(b,80,90);pose(q,112,90);b.angle=-b.cl.spin;step(a);}
  assert.ok(b.state.overheatUntil>a.tick);assert.equal(b.state.heat,0);
});

test('trail and mycelium use real displayed segments, clouds hit old positions, currents bend projectiles',()=>{
  const a=make('trail'),[b,q]=a.balls;b.state.point={x:70,y:100};pose(b,130,100);pose(q,240,150);b.next=0;step(a);const line=a.objects.find(o=>o.kind==='lighttrail');assert.ok(line.x2&&line.y2);pose(q,100,100);step(a);assert.ok(a.events.some(e=>e.kind==='trail-cross'));
  const web=make('mycelium'),[w,t]=web.balls;pose(w,60,100);w.next=0;step(web);pose(w,140,100);w.next=web.tick;step(web);pose(t,100,100);step(web);assert.ok(web.events.some(e=>e.kind==='web-cross'));
  const storm=make('storm'),s=storm.balls[0];s.next=0;step(storm);const mark=storm.objects.find(o=>o.kind==='cloudmark'),old={x:mark.x,y:mark.y};pose(storm.balls[1],10,10);step(storm,30);const lightning=storm.events.find(e=>e.kind==='lightningstrike'&&e.type==='skill');assert.equal(lightning.x,Math.round(old.x*10)/10);assert.equal(lightning.y,Math.round(old.y*10)/10);
  const current=make('current'),[cur,target]=current.balls;pose(cur,100,100,172,0);pose(target,245,180);cur.next=0;step(current);const p=shot(current,target,100,100);step(current);assert.notEqual(p.vy,0);
});

test('mimic copies three actual attack shapes, greatsword releases after charging, decoys intercept without extra survivors',()=>{
  for(const [enemy,expected] of [['ring','copy-cleave'],['frost','copy-cold'],['cannon','copybolt']]){
    const a=make('mimic',enemy),[b,q]=a.balls;pose(b,100,100);pose(q,140,100);b.next=0;step(a);assert.ok(a.events.some(e=>e.kind===expected)||a.objects.some(o=>o.kind===expected));
  }
  const great=createDemoArena('greatsword');step(great,30);assert.ok(great.events.some(e=>e.kind==='greatslash'));
  const a=make('decoy'),[b,q]=a.balls;pose(b,80,100);pose(q,250,150);b.next=0;step(a);const decoy=a.objects.find(o=>o.kind==='decoy');shot(a,q,decoy.x,decoy.y);step(a);assert.ok(decoy.hp<decoy.maxHp);assert.equal(a.balls.length,2);
});

test('lifesteal uses actual damage and cannot heal from overkill or above maximum',()=>{
  const a=make('vampire'),[b,q]=a.balls;pose(b,90,90,172,0);pose(q,116,90,-172,0);b.hp=100;q.hp=2;step(a);
  const healing=a.events.find(e=>e.type==='heal'&&e.kind==='lifesteal');assert.ok(healing);assert.ok(healing.healing<=.6+1e-8);assert.ok(b.hp<=b.maxHp);
});

test('every profile and all its supported traits run deterministically with finite capped simulation',()=>{
  for(const p of Object.values(CLASSES))for(const trait of compatibleTraits(p.id)){
    const a=make(p.id,'basic',trait.id),b=make(p.id,'basic',trait.id);
    step(a,200);step(b,200);assert.deepEqual(arenaSnapshot(a),arenaSnapshot(b),p.id+'/'+trait.id);
    for(const ball of a.balls)assert.ok([ball.x,ball.y,ball.hp,ball.kx,ball.ky].every(Number.isFinite));
    assert.ok(a.objects.filter(o=>o.field).length<=COMBAT.fieldLimit);assert.ok(a.objects.filter(o=>!o.field).length<=COMBAT.projectileLimit);
  }
});

test('causal summary references true events and presentation reads never mutate the fight',()=>{
  const a=createDemoArena('mace'),history=[],seen=new Set();
  for(let i=0;i<360&&!a.done;i++){step(a);for(const e of a.events)if(!seen.has(e.seq)){seen.add(e.seq);history.push(e);}arenaSnapshot(a);}
  const summary=summarizeEvents(history,'demo');assert.ok(summary.highlights.length<=3);assert.equal(summary.damage,Math.round(history.filter(e=>e.type==='hit'&&e.sourceId==='demo').reduce((n,e)=>n+e.damage,0)*10)/10);
  for(const e of history){assert.ok(e.eventId&&e.rootAttackId&&Number.isInteger(e.tick));assert.ok(e.procDepth>=0&&e.procDepth<=1);}
  for(const h of summary.highlights)for(const id of h.eventIds)assert.ok(history.some(e=>e.eventId===id));
});

test('long-reach hitboxes match rendered weapon coordinates and charge/guard traits have real triggers',()=>{
  const a=make('mace','basic','long_reach'),b=a.balls[0],weapon=arenaSnapshot(a).objects.find(o=>o.kind==='mace');
  assert.equal(b.cl.orbit,CLASSES.mace.orbit*TRAITS.long_reach.params.reach);assert.ok(Math.abs(Math.hypot(weapon.x-b.x,weapon.y-b.y)-b.cl.orbit)<.15);
  const wall=make('basic','basic','wall_charge'),w=wall.balls[0];
  for(let i=0;i<3;i++){wall.tick=i*13;pose(w,13,100,-172,0);step(wall);}
  assert.ok(w.tactic.readyUntil>=wall.tick);pose(w,90,90,172,0);pose(wall.balls[1],116,90,-172,0);step(wall);
  assert.equal(w.tactic.readyUntil,-1);assert.ok(wall.events.some(e=>e.type==='trait'&&e.kind==='wall_charge'));
  const guard=make('tide','basic','guard_riposte'),[g,q]=guard.balls;pose(g,90,90,172,0);pose(q,116,90,-172,0);step(guard);assert.ok(g.tactic.readyUntil>=guard.tick||guard.events.some(e=>e.kind==='guard_riposte'));assert.ok(guard.events.some(e=>e.kind==='riposte-ready'));
});

test('AOE roots count once for rhythm, derived attacks never charge it, and wall wedging does not farm charges',()=>{
  const a=createArena([{id:'a',classId:'magnet',level:15,traitId:'impact_rhythm'},...Array.from({length:3},(_,i)=>({id:'t'+i,classId:'basic',level:15}))],{mode:'rumble'});
  a.balls.forEach((b,i)=>pose(b,50+i*42,100));a.balls[0].next=0;step(a);assert.equal(a.balls[0].tactic.count,1);
  const owner=a.balls[0];const o=shot(a,owner,a.balls[1].x,a.balls[1].y);o.reflected=1;step(a);assert.equal(owner.tactic.count,1);
  const w=make('basic','basic','wall_charge');for(let i=0;i<10;i++){pose(w.balls[0],13,13,-172,-172);step(w);}assert.equal(w.balls[0].tactic.count,1);
});

test('residual heat, frost fracture, focused windup and squad limits are data-driven effects',()=>{
  const fire=make('ring','basic','residual_heat'),[f,q]=fire.balls;pose(f,80,100);pose(q,112,100);f.angle=-f.cl.spin;step(fire);assert.ok(q.dots.has('traitheat/a'));step(fire,31);assert.ok(fire.events.some(e=>e.kind==='residualheat'&&e.damage>0));
  const ice=make('frost','basic','frost_fracture'),[i,t]=ice.balls;
  for(let n=0;n<3;n++){ice.tick=n*50;pose(i,80,100);pose(t,130,100);i.next=ice.tick;step(ice);}assert.ok(ice.events.some(e=>e.kind==='frost-fracture'&&e.type==='trait'));
  const focused=make('beam','basic','pulse_focus');assert.equal(focused.balls[0].cl.windup,Math.ceil(CLASSES.beam.windup*TRAITS.pulse_focus.params.windup));
  const squad=make('summoner','basic','squad_focus'),s=squad.balls[0];for(let n=0;n<4;n++){s.next=squad.tick;step(squad);assert.ok(squad.objects.filter(o=>o.kind==='familiar').length<=TRAITS.squad_focus.params.count);}
});

test('decoy is selected as a projectile aim target and its destruction never counts as a player KO',()=>{
  const a=make('decoy','blade'),[b,q]=a.balls;pose(b,30,100);pose(q,170,100);b.next=0;q.next=999;step(a);
  const decoy=a.objects.find(o=>o.kind==='decoy');decoy.x=110;decoy.y=60;q.next=a.tick;step(a);const crescent=a.objects.find(o=>o.kind==='crescent');assert.ok(crescent.vy<0,'shooter aims at the closer raised decoy');
  decoy.hp=.1;shot(a,q,decoy.x,decoy.y);step(a);assert.ok(!a.objects.includes(decoy));assert.equal(a.balls.filter(b=>b.alive).length,2);assert.equal(a.events.filter(e=>e.type==='ko').length,0);
});

test('all 50 six-second demonstrations execute an actual profile mechanic with disclosed setups',()=>{
  for(const id of Object.keys(CLASSES)){
    const arena=createDemoArena(id),kinds=new Set();
    while(!arena.done){step(arena);for(const e of arena.events)if(e.sourceId==='demo'&&e.kind!=='bounce'&&(id==='basic'||!['body','ragebody'].includes(e.kind)))kinds.add(e.kind);}
    assert.ok(kinds.size>0,id);assert.equal(arena.tick,360);assert.ok(arena.demo.notice&&arena.demo.setup.length);
  }
});

test('T1 awakening is limited to verified profiles, once per battle, and fresh arenas clear all resources',()=>{
  for(const id of AWAKENING_PROFILES){
    const a=createArena([{id:'a',classId:id,level:19},{id:'b',classId:'basic',level:19}],{seed:3}),b=a.balls[0];b.hp=b.maxHp*.3;step(a);const until=b.awakeningUntil;
    assert.equal(until,1+COMBAT.awakeningTicks);assert.equal(b.awakeningUsed,true);assert.ok(a.events.some(e=>e.kind==='awakening'&&e.power===COMBAT.awakeningPower));
    a.tick=until+1;b.hp=b.maxHp*.3;step(a);assert.equal(b.awakeningUntil,until);
    const fresh=make(id);assert.equal(fresh.balls[0].awakeningUsed,false);assert.deepEqual(fresh.balls[0].state,{});assert.equal(fresh.balls[0].kx,0);assert.equal(fresh.balls[0].hp,fresh.balls[0].maxHp);
  }
  const unsupported=make('basic');unsupported.balls[0].level=19;unsupported.balls[0].hp=1;step(unsupported);assert.equal(unsupported.balls[0].awakeningUsed,false);
});

test('lifesteal cannot resurrect after a simultaneous lethal exchange',()=>{
  const a=make('basic','vampire'),[p,v]=a.balls;pose(p,90,90,172,0);pose(v,116,90,-172,0);p.hp=1;v.hp=1;step(a);
  assert.equal(v.hp,0);assert.equal(v.alive,false);assert.ok(!a.events.some(e=>e.type==='heal'&&e.sourceId===v.id));
});
