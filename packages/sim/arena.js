import { CLASSES, COMBAT as rules, advantage } from '../content/classes.js';
import { getBall } from '../content/balls.js';
import { randomStream, shuffled } from './random.js';
import {configureTactic,tacticBeforeHit,tacticAfterHit,tacticWall,tacticBlock,tacticResource} from './tactics.js';
import {newTimer,newMove,newContact,newDefend,newAfterHit,newField,newProjectile,newLethal,newResource,flushHealing} from './mechanics.js';
import {configureEvolution,evolutionCharge,evolutionSignal,evolutionTick,evolutionAction,evolutionScale,evolutionEffect,evolutionHit,evolutionAfterHit,evolutionObject,evolutionSnapshot} from './evolution.js';
import {configureAwakening,awakeningSignal,awakeningTick,awakeningAction,awakeningScale,awakeningHit,awakeningObject,awakeningAfterHit,awakeningRemainingDamage,awakeningDamageBudget,awakeningSnapshot} from './awakening.js';

const TAU = Math.PI * 2;
const ENGAGEMENT_TURN=Object.freeze({mace:.020,trinity:.008,saw:.028,pendulum:.018,mason:.023,current:.023,decoy:.023,mimic:.021,captor:.018});
const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const round = (v) => Math.round(v * 10) / 10;
const unit = (x, y) => {
  const length = Math.hypot(x, y);
  return length > 1e-8 ? [x / length, y / length] : [1, 0];
};

// Relative swept-circle test. The target moves between its previous and current positions too.
function swept(x0, y0, x1, y1, target, radius) {
  const x = x0 - target.px, y = y0 - target.py;
  const dx = x1 - target.x - x, dy = y1 - target.y - y;
  const length2 = dx * dx + dy * dy;
  const t = length2 ? clamp(-(x * dx + y * dy) / length2, 0, 1) : 0;
  return (x + dx * t) ** 2 + (y + dy * t) ** 2 <= radius ** 2;
}

export function createArena(builds, options = {}) {
  if (!builds.length || builds.length > 30 || new Set(builds.map(b => b.id)).size !== builds.length)
    throw new RangeError('경기에는 서로 다른 참가자 1~30명이 필요합니다.');
  const { id = 'arena', mode = 'duel', seed = 1, final = false } = options;
  const rumble = mode === 'rumble';
  const columns = Math.ceil(Math.sqrt(builds.length * 1.32));
  const rows = Math.ceil(builds.length / columns);
  const width = rumble ? Math.max(304, columns * 89) : 290;
  const height = rumble ? Math.max(226, rows * 85) : 218;
  const random = randomStream(seed);
  const positions = shuffled(Array.from({ length: rows * columns }, (_, i) => i), random);
  const balls = builds.map((build, i) => {
    const profile = CLASSES[build.classId] ?? CLASSES.basic;
    const variant = build.ballId ? getBall(build.ballId) : null;
    const modifiers = variant?.classId === profile.id ? variant.modifiers ?? {} : {};
    const cl = { ...profile, speed: profile.speed * (modifiers.speed ?? 1) };
    const level = clamp(Math.trunc(Number(build.level) || 0), 0, 19);
    const cell = positions[i];
    const x = ((cell % columns) + .35 + random() * .3) * width / columns;
    const y = (Math.floor(cell / columns) + .35 + random() * .3) * height / rows;
    const theta = random() * TAU;
    const maxHp = (rules.hpBase + level * rules.hpPerLevel) * cl.hpScale * (modifiers.hp ?? 1);
    const ball = {
      id: build.id, name: build.name, classId: cl.id, level, element: build.element ?? cl.element, cl, traitId: build.traitId??null,
      ballId: build.ballId ?? null, path: build.path ?? null, ballName: variant?.name ?? cl.name,
      portraitKey: variant?.portraitKey ?? cl.id, glyph: variant?.glyph ?? cl.icon,
      x, y, px: x, py: y, r: rules.radius, vx: Math.cos(theta) * cl.speed, vy: Math.sin(theta) * cl.speed,
      heading: theta, angle: random() * TAU, hp: maxHp, maxHp, atk: (rules.attackBase + level * rules.attackPerLevel) * (modifiers.attack ?? 1),
      alive: true, rank: 0, kills: 0, damage: 0, effective: 0, blocked: 0, tie: 0,
      charge: 0, next: 30 + Math.floor(random() * 36), blockedAt: -999, rushAt: -999, dashUntil: -1,
      immunity: new Map(), dots: new Map(), delayed: null, wallHit: null, lastHit: -999, elimTick: null,
      slowUntil: -1, slowFactor: 1, teleportedAt: -1, combo: 0, beat: 0, rage: 0, rageUntil: -1,
      tether: null, killedById: null, killedByName: null, cause: null, kx:0,ky:0, state:{}, awakeningUsed:false, awakeningUntil:-1,
    };
    configureTactic(ball);ball.baseCombat={...ball.cl};configureEvolution(ball);configureAwakening(ball);return ball;
  });
  shuffled(balls, random).forEach((b, i) => { b.tie = i; });
  const a = {
    id, mode, width, height, inset: 0, tick: 0, balls, index: new Map(balls.map(b => [b.id, b])), outcomePolicy:options.outcomePolicy??'tournament',
    random, objects: [], events: [], seq: 0, serial: 0, pending: [], done: false, reason: '', results: [],
    limitTicks: rules.hz * (rumble ? rules.rumbleSeconds : final ? rules.finalSeconds : rules.duelSeconds),
    pressureTick: rules.hz * (rumble ? rules.rumblePressure : final ? rules.finalPressure : rules.duelPressure),
  };
  if(options.limitTicks)a.limitTicks=Math.min(a.limitTicks,Math.max(1,Math.trunc(options.limitTicks)));
  if (balls.length === 1) finish(a, '단독 출전');
  return a;
}

function emit(a, type, kind, owner, target, x, y, extra = {}) {
  const seq=++a.seq;
  const event={ seq,matchId:a.id,eventId:`${a.id}:${seq}`,rootAttackId:extra.rootAttackId??extra.attackId??`${a.id}:event:${seq}`,tick:a.tick,type,kind,
    sourceId:owner?.id??null,targetId:target?.id??null,source:owner?.id??null,target:target?.id??null,
    x:round(x),y:round(y),damage:0,blocked:0,impulse:0,element:owner?.element??'neutral',reasonTags:[],procDepth:0,...extra };
  a.events.push(event);
  if (a.events.length > rules.eventBuffer) a.events.shift();
  if(owner&&['hit','wall','block','skill','heal'].includes(type))evolutionSignal(a,owner,'event',event,mechanics);
  if(owner&&(type==='evo-ready'||type==='evo-activate'||type==='heal'&&kind==='mythic-lifesteal'))awakeningSignal(a,owner,'event',event,mechanics);
  if(type==='hit'&&target)evolutionSignal(a,target,'taken',event,mechanics);
}
function combatScale(b,key){return awakeningScale(b,key)??evolutionScale(b,key);}
function action(a,b,kind,detail={}){
  if(!b.evolution.ready&&!b.awakeningState?.ready&&!['phoenix','rewind'].includes(b.classId))return false;
  const activated=evolutionAction(a,b,kind,mechanics,detail);
  awakeningAction(a,b,kind,mechanics,detail);
  if(activated&&b.classId==='trinity'){
    const shared=new Set();for(let i=0;i<3;i++)shoot(a,b,'triad-crescent',b.angle+i*TAU/3,{power:.35,shotSpeed:270,shotLife:35,shotR:6,maxTargets:1,rootAttackId:b.evolution.root,projectile:{hit:shared,derived:true}});
  }
  return activated;
}

function nearby(a, center, range, owner, cap, exclude) {
  const max = range * range;
  return a.balls.filter(b => b.alive && b !== owner && !exclude?.has(b.id) && dist2(b, center) <= max)
    .sort((p, q) => dist2(p, center) - dist2(q, center) || p.tie - q.tie).slice(0, cap);
}

function aimTarget(a,b,range=Infinity,origin=b){
  const candidates=[...nearby(a,origin,range,b,1),...a.objects.filter(o=>o.kind==='decoy'&&o.owner!==b&&o.hp>0&&o.expires>a.tick&&dist2(o,origin)<=range*range)];
  return candidates.sort((x,y)=>dist2(x,origin)-dist2(y,origin))[0];
}

function hit(a, source, target, kind, power, origin = source, options = {}) {
  if(!target.alive||target.hp<=0)return;
  const [nx, ny] = unit(target.x - origin.x, target.y - origin.y);
  const h={ source, target, kind, power, nx, ny, x: target.x - nx * target.r,
    y: target.y - ny * target.r, ...options,attackId:options.attackId??`${a.id}:${source?.id??'world'}:${a.tick}:${kind}` };
  if(source){action(a,source,kind,{target,rootAttackId:h.attackId});h._basePush=h.push;evolutionHit(a,h,mechanics);awakeningHit(a,h,mechanics);}
  if(!h.cancelled)a.pending.push(h);
}

function ready(owner, key, tick, interval) {
  if ((owner.immunity.get(key) ?? 0) > tick) return false;
  owner.immunity.set(key, tick + interval);
  return true;
}

function spawn(a, owner, kind, props, field = false) {
  props={...props,field,_baseAwakening:{...props}};evolutionObject(a,owner,kind,props,mechanics);awakeningObject(a,owner,kind,props,mechanics);if(props.skipSpawn)return;
  if (a.objects.filter(o => o.field === field).length >= (field ? rules.fieldLimit : rules.projectileLimit)) return;
  const mine = a.objects.filter(o => o.field === field && o.owner === owner);
  if (mine.length >= (field ? rules.fieldsPerOwner : rules.projectilesPerOwner)) {
    a.objects.splice(a.objects.indexOf(mine[0]), 1);
  }
  const object={ id: 'o' + (++a.serial), owner, kind, field, x: owner.x, y: owner.y, born: a.tick, ...props };a.objects.push(object);
  emit(a,field?'field':'shot',kind,owner,null,object.x,object.y,{objectId:object.id,rootAttackId:object.rootAttackId??object.id,r:object.r,angle:Math.atan2(object.vy??0,object.vx??1),expires:object.expires,summon:!!object.summon,evolutionId:object.evolutionId,awakeningId:object.awakeningId,reasonTags:[object.summon||kind==='familiar'||kind==='decoy'?'summon':field?'field':'projectile']});
}

function shoot(a, b, kind, angle, spec = b.cl) {
  const vx = Math.cos(angle), vy = Math.sin(angle);
  const origin = spec.origin ?? b;
  spawn(a, b, kind, {
    x: origin.x + vx * (origin.r ?? b.r), y: origin.y + vy * (origin.r ?? b.r),
    vx: vx * (spec.shotSpeed ?? 270), vy: vy * (spec.shotSpeed ?? 270),
    r: spec.shotR ?? 6, expires: a.tick + (spec.shotLife ?? 65), power: spec.power ?? 1, hit: new Set(),
    maxTargets: (spec.maxTargets ?? 1)+(b.trait?.id==='pulse_focus'?b.trait.params.pierce:0), push: spec.push || 0,rootAttackId:spec.rootAttackId??`${a.id}:${b.id}:${a.tick}:${kind}`,
    reflected: spec.reflected ?? (kind === 'shard' ? 1 : 0), homing: spec.homing ?? 0,
    summon:spec.summon??false,...spec.projectile,
  });
}

function pulse(a, b, kind, origin, range, power, maxTargets, push = 0, reactive = false) {
  emit(a, 'skill', kind, b, null, origin.x, origin.y, { r: range });
  for (const target of nearby(a, origin, range, b, maxTargets)) hit(a, b, target, kind, power, origin, { push, reactive,field:Boolean(origin.field),awakeningId:origin.awakeningId,awakeningRoot:origin.awakeningRoot,evolutionId:origin.evolutionId,attackId:origin.rootAttackId??origin.awakeningRoot??(origin.field?origin.id:null)??`${a.id}:${b.id}:${a.tick}:${kind}` });
}

function onTimer(a, b) {
  const { cl } = b, t = a.tick;
  evolutionTick(a,b,mechanics);awakeningTick(a,b,mechanics);
  if(['ring','trinity','saw'].includes(b.classId))action(a,b,'orbit');
  if (t > b.slowUntil) b.slowFactor = 1;
  if (b.tether) {
    const { target, until } = b.tether;
    if (!target.alive || t > until) b.tether = null;
    else {
      const [nx, ny] = unit(b.x - target.x, b.y - target.y);
      target.vx += nx * (cl.pull ?? 140) / 12;
      target.vy += ny * (cl.pull ?? 140) / 12;
    }
  }
  for (const [key, dot] of b.dots) {
    if (t > dot.end) { b.dots.delete(key); continue; }
    if (t >= dot.next) {
      hit(a, dot.owner, b, dot.kind, dot.power * dot.stacks, dot.owner, { reactive: true, attackId: dot.attackId });
      dot.next += 30;
    }
  }
  if (b.delayed && b.delayed.at <= t) {
    const { target } = b.delayed;
    if (target.alive) hit(a, b, target, 'echo', cl.power, b, { reactive: true,attackId:b.delayed.rootAttackId });
    b.delayed = null;
  }
  if (b.classId === 'tide' && b.charge >= 2 && !(b.awakeningState?.ready&&t-b.awakeningState.readyAt<18)) {
    action(a,b,'surge');pulse(a, b, 'surge', b, cl.range*combatScale(b,'range'), cl.power, cl.maxTargets, cl.push, true);
    b.charge = 0;
  }
  if(newTimer(a,b,mechanics))return;
  if (t < b.next) return;
  switch (b.classId) {
    case 'bolt':
    case 'ninja': {
      if (!b.charge) {
        const target = nearby(a, b, Infinity, b, 1)[0];
        if (!target) break;
        b.aim = Math.atan2(target.y - b.y, target.x - b.x);
        b.charge = 1; b.next = t + cl.windup;
        emit(a, 'skill', 'charge', b, null, b.x, b.y, { angle: b.aim });
      } else {
        action(a,b,b.classId==='ninja'?'shadowdash':'dash');
        b.vx = Math.cos(b.aim) * cl.dashSpeed*combatScale(b,'dashSpeed'); b.vy = Math.sin(b.aim) * cl.dashSpeed*combatScale(b,'dashSpeed');
        b.dashUntil = t + Math.round(cl.dashTicks*combatScale(b,'dashTicks')); b.charge = 0; b.next = t + cl.cooldown;
        if (b.classId === 'ninja') {
          spawn(a, b, 'afterimage', { r: 34, expires: t + 35, power: (cl.power ?? 1.7) * .35 }, true);
        }
        emit(a, 'skill', b.classId === 'ninja' ? 'shadowdash' : 'dash', b, null, b.x, b.y, { angle: b.aim });
      }
      break;
    }
    case 'magnet': {
      action(a,b,'arc');
      let source = b;
      const seen = new Set();
      for (let jump = 0; jump < cl.maxTargets; jump++) {
        const target = nearby(a, source, jump ? cl.chainRange*combatScale(b,'chainRange') : cl.range*combatScale(b,'range'), b, 1, seen)[0];
        if (!target) break;
        hit(a, b, target, 'arc', cl.power * cl.falloff ** jump, source, { fromX: round(source.x), fromY: round(source.y) });
        seen.add(target.id); source = target;
      }
      b.next = t + (seen.size ? cl.cooldown : 6);
      break;
    }
    case 'seed':
      action(a,b,'seed');
      spawn(a, b, 'seed', { r: cl.triggerRange, expires: t + cl.life }, true);
      b.next = t + cl.cooldown;
      break;
    case 'gravity':
      action(a,b,'gravity');
      spawn(a, b, 'gravity', { r: cl.range, expires: t + cl.life }, true);
      b.next = t + cl.cooldown;
      break;
    case 'prism': {
      const target = aimTarget(a,b);
      if (target) {
        action(a,b,'prism');
        const angle = Math.atan2(target.y - b.y, target.x - b.x);
        for (const delta of [-.17, 0, .17]) shoot(a, b, 'prism', angle + delta*combatScale(b,'spread'));
      }
      b.next = t + cl.cooldown;
      break;
    }
    case 'blade': {
      const target = aimTarget(a,b);
      if (target){action(a,b,'crescent');shoot(a, b, 'crescent', Math.atan2(target.y - b.y, target.x - b.x), { ...cl, maxTargets: 2 });}
      b.next = t + (cl.cooldown ?? 90);
      break;
    }
    case 'elastic': {
      if(!b.state.punchAim){const target=nearby(a,b,cl.range??90,b,1)[0];if(!target){b.next=t+8;break;}b.state.punchAim={angle:Math.atan2(target.y-b.y,target.x-b.x)};b.next=t+12;emit(a,'skill','punchcharge',b,target,b.x,b.y,{angle:b.state.punchAim.angle,r:cl.range??90,duration:12});break;}
      const aim=b.state.punchAim.angle;b.state.punchAim=null;action(a,b,'punch');
      const target=nearby(a,b,(cl.range??90)*combatScale(b,'range'),b,4).find(q=>Math.abs(Math.atan2(Math.sin(Math.atan2(q.y-b.y,q.x-b.x)-aim),Math.cos(Math.atan2(q.y-b.y,q.x-b.x)-aim)))<=.42);
      if (target) {
        hit(a, b, target, 'punch', cl.power ?? 1.1, b,
          { push: cl.push ?? 145, fromX: round(b.x), fromY: round(b.y) });
        emit(a, 'skill', 'stretch', b, target, target.x, target.y, { fromX: round(b.x), fromY: round(b.y) });
        const recoil=evolutionEffect(b,'recoil');b.kx-=Math.cos(aim)*recoil;b.ky-=Math.sin(aim)*recoil;
      }
      emit(a,'skill','punch-release',b,target,b.x,b.y,{angle:aim,r:(cl.range??90)*combatScale(b,'range'),halfAngle:.42,miss:!target});b.next=t+(cl.cooldown??75);
      break;
    }
    case 'beam': {
      if (!b.charge) {
        const target = nearby(a, b, Infinity, b, 1)[0];
        if (!target) break;
        b.aim = Math.atan2(target.y - b.y, target.x - b.x);
        b.charge = 1; b.next = t + (cl.windup ?? 36);
        emit(a, 'skill', 'beamcharge', b, null, b.x, b.y, { angle: b.aim, r: cl.range ?? 310 });
      } else {
        action(a,b,'beam');
        const range = cl.range ?? 310, dx = Math.cos(b.aim), dy = Math.sin(b.aim);
        const candidates = a.balls.filter(target => {
          if (!target.alive || target === b) return false;
          const x = target.x - b.x, y = target.y - b.y, along = x * dx + y * dy;
          return along >= 0 && along <= range && Math.abs(x * dy - y * dx) <= target.r + (cl.beamR ?? 9)*combatScale(b,'beamR')*(b.trait?.id==='pulse_focus'?b.trait.params.width:1);
        }).sort((p, q) => dist2(p, b) - dist2(q, b) || p.tie - q.tie).slice(0, cl.maxTargets ?? 4);
        candidates.forEach((target, i) => hit(a, b, target, 'beam', (cl.power ?? 1.45) * .88 ** i, b,
          { fromX: round(b.x), fromY: round(b.y), push: 75 }));
        emit(a, 'skill', 'beam', b, null, b.x, b.y,
          { endX: round(b.x + dx * range), endY: round(b.y + dy * range), angle: b.aim,r:(cl.beamR??9)*combatScale(b,'beamR')*(b.trait?.id==='pulse_focus'?b.trait.params.width:1) });
        const recoil=evolutionEffect(b,'recoil',25);b.kx-=dx*recoil;b.ky-=dy*recoil;
        b.charge = 0; b.next = t + (cl.cooldown ?? 150);
      }
      break;
    }
    case 'frost': {
      action(a,b,'icewave');const range = (cl.range ?? 80)*combatScale(b,'range');
      emit(a, 'skill', 'icewave', b, null, b.x, b.y, { r: range });
      for (const target of nearby(a, b, range, b, cl.maxTargets ?? 4)) {
        hit(a, b, target, 'icewave', cl.power ?? .65, b,
          { slowTicks: cl.slowTicks ?? 90, slowFactor: cl.slowFactor ?? .62 });
      }
      b.next = t + (cl.cooldown ?? 135);
      break;
    }
    case 'portal': {
      if(!b.state.portalExit){const target=nearby(a,b,Infinity,b,1)[0];if(!target){b.next=t+8;break;}const [nx,ny]=unit(target.vx,target.vy),gap=b.r+target.r+7;b.state.portalExit={x:clamp(target.x+target.vx*.12-nx*gap,a.inset+b.r,a.width-a.inset-b.r),y:clamp(target.y+target.vy*.12-ny*gap,a.inset+b.r,a.height-a.inset-b.r),targetId:target.id};b.next=t+12;emit(a,'skill','portal-warning',b,target,b.state.portalExit.x,b.state.portalExit.y,{fromX:b.x,fromY:b.y,r:38,duration:12});break;}
      const exit=b.state.portalExit;b.state.portalExit=null;const target=a.index.get(exit.targetId);
      if (target?.alive) {
        action(a,b,'portalstrike');
        const fromX = b.x, fromY = b.y;
        const edge = a.inset + b.r;
        b.x = clamp(exit.x, edge, a.width - edge);
        b.y = clamp(exit.y, edge, a.height - edge);
        // Reset the sweep origin: teleportation must not damage every crossed ball.
        b.px = b.x; b.py = b.y; b.teleportedAt = t;
        const [vx, vy] = unit(target.x - b.x, target.y - b.y);
        b.vx = vx * cl.speed; b.vy = vy * cl.speed;
        if(dist2(b,target)<=(38+target.r)**2)hit(a, b, target, 'portalstrike', cl.power ?? 1.05, b, { push: 65 });
        emit(a, 'skill', 'portal', b, target, b.x, b.y, { fromX: round(fromX), fromY: round(fromY) });
      }
      b.next = t + (cl.cooldown ?? 145) + 30;
      break;
    }
    case 'summoner': {
      action(a,b,'familiar');
      const companions = a.objects.filter(o => o.owner === b && o.kind === 'familiar');
      const firstUpgrade=evolutionEffect(b,'familiarRadius')&&!b.evolution.familiarApplied;
      if (!firstUpgrade&&companions.length >= (b.trait?.id==='squad_focus'?b.trait.params.count:2)) a.objects.splice(a.objects.indexOf(companions.find(o=>!o.upgraded)??companions[0]), 1);
      spawn(a, b, 'familiar', { r: 7, angle: b.angle, expires: t + 225, next: t + 8 }, true);
      emit(a, 'skill', 'summon', b, null, b.x, b.y, { r: 35 });
      b.next = t + (cl.cooldown ?? 90);
      break;
    }
    case 'chain': {
      action(a,b,'chain');
      const target = nearby(a, b, cl.range ?? 110, b, 1)[0];
      if (target) {
        hit(a, b, target, 'chain', cl.power ?? .6, b,
          { push: -(cl.pull ?? 140)*combatScale(b,'pull'), fromX: round(b.x), fromY: round(b.y) });
        b.tether = { target, until: t + Math.round(27*combatScale(b,'tetherTicks')) };
      }
      b.next = t + (target ? cl.cooldown ?? 110 : 8);
      break;
    }
    case 'idol': {
      action(a,b,'sonic');
      b.beat = (b.beat + 1) % 3;
      const crescendo = b.beat === 0;
      pulse(a, b, 'sonic', b, (cl.range ?? 95) * (crescendo ? 1.22 : 1)*combatScale(b,'range'),
        (cl.power ?? .65) * (crescendo ? 1.8 : 1), cl.maxTargets ?? 4, crescendo ? 145 : 38);
      emit(a, 'skill', 'beat', b, null, b.x, b.y, { beat: crescendo ? 3 : b.beat });
      b.next = t + (cl.cooldown ?? 105);
      break;
    }
    case 'star': {
      const target = aimTarget(a,b);
      if (target) {
        action(a,b,'starcounter');
        const charged = b.charge > 0, angle = Math.atan2(target.y - b.y, target.x - b.x);
        shoot(a, b, 'starcounter', angle, { ...cl, power: (cl.power ?? .9) * (charged ? 1.65 : .60),
          shotSpeed: 310, shotR: charged ? 8 : 5, shotLife: 70, maxTargets: 1, reflected: charged ? 1 : 0,rootAttackId:charged?b.state.absorbedRoot:undefined });
        if (charged) emit(a, 'skill', 'starburst', b, target, b.x, b.y, { r: 30 });
      }
      b.charge = 0; b.next = t + (cl.cooldown ?? 115);
      break;
    }
    case 'berserk': {
      if (b.rage < 30) { b.next = t + 6; break; }
      pulse(a, b, 'ragewave', b, cl.range ?? 65, (cl.power ?? 1.3) * (1 + b.rage / 100), 3, 155);
      b.rage = Math.max(0, b.rage - 30); b.rageUntil = t + 80;
      b.next = t + (cl.cooldown ?? 120);
      break;
    }
  }
}

function move(a, b) {
  const { cl } = b;
  // Close-range identities need a reachable contact window against autonomous
  // ranged fire. This is bounded turning, never a positional snap or a hit.
  const approach=ENGAGEMENT_TURN[b.classId];
  if(approach&&b.dashUntil<a.tick&&!b.state.swing){const target=nearby(a,b,165,b,1)[0];if(target){const distance=Math.hypot(target.x-b.x,target.y-b.y),stop=cl.orbit?cl.orbit+target.r*.45:b.r+target.r+4;if(distance>stop){const facing=Math.atan2(b.vy,b.vx),wanted=Math.atan2(target.y-b.y,target.x-b.x),delta=Math.atan2(Math.sin(wanted-facing),Math.cos(wanted-facing)),angle=facing+clamp(delta,-approach,approach),speed=Math.hypot(b.vx,b.vy);b.vx=Math.cos(angle)*speed;b.vy=Math.sin(angle)*speed;}}}
  const speed = Math.hypot(b.vx, b.vy);
  const factor = (b.slowUntil >= a.tick ? b.slowFactor : 1) * (b.rageUntil >= a.tick ? 1.18 : 1);
  const desired = (b.dashUntil >= a.tick ? cl.dashSpeed*combatScale(b,'dashSpeed') : cl.speed) * factor;
  const nextSpeed = clamp(speed + (desired - speed) * .075, cl.speed * .75 * factor, rules.speedCap * Math.min(1, factor));
  const [nx, ny] = unit(b.vx, b.vy);
  b.vx = nx * nextSpeed; b.vy = ny * nextSpeed;
  b.heading = Math.atan2(b.vy, b.vx); b.px = b.x; b.py = b.y;
  const impulseSpeed=Math.hypot(b.kx,b.ky),impulseCap=rules.speedCap*.8;
  if(impulseSpeed>impulseCap){b.kx*=impulseCap/impulseSpeed;b.ky*=impulseCap/impulseSpeed;}
  const totalSpeed=Math.hypot(b.vx+b.kx,b.vy+b.ky),motionScale=Math.min(1,rules.speedCap/Math.max(1,totalSpeed));
  if(!newMove(a,b,mechanics)){b.x+=(b.vx+b.kx)*motionScale/rules.hz;b.y+=(b.vy+b.ky)*motionScale/rules.hz;}
  b.kx*=b.trait?.id==='stability'?b.trait.params.decay:.955;b.ky*=b.trait?.id==='stability'?b.trait.params.decay:.955;
  const lo = a.inset + b.r, right = a.width - lo, bottom = a.height - lo;
  let wall = false;
  if ((b.x < lo && b.vx+b.kx < 0) || (b.x > right && b.vx+b.kx > 0)) { b.vx *= -1; b.kx*=-.5;wall = true; }
  if ((b.y < lo && b.vy+b.ky < 0) || (b.y > bottom && b.vy+b.ky > 0)) { b.vy *= -1; b.ky*=-.5;wall = true; }
  b.x = clamp(b.x, lo, right); b.y = clamp(b.y, lo, bottom);
  b.previousAngle=b.angle;
  if(!(b.classId==='saw'&&(b.state.overheatUntil??-1)>=a.tick))b.angle = (b.angle + (cl.spin || .032)*combatScale(b,'spin')) % TAU;
  if (!wall) return;
  b.heading = Math.atan2(b.vy, b.vx);
  const impact = b.wallHit;
  if (impact && impact.until >= a.tick) {
    hit(a, impact.source, b, 'wallslam', impact.power??impact.source.cl.wallPower, impact.source, { reactive: true, attackId: impact.attackId,awakeningId:impact.awakeningId,evolutionId:impact.evolutionId });
  }
  b.wallHit = null;
  emit(a, 'wall', 'bounce', b, null, b.x, b.y, { vx: round(b.vx), vy: round(b.vy) });
  tacticWall(a,b,emit);
  if(b.classId==='mace')b.state.wallCharge=Math.min(3,(b.state.wallCharge??0)+1);
  if (b.classId === 'crimson') b.charge = 1;
  if (b.classId === 'cannon') {
    b.charge = Math.min(2, b.charge + 1);
    if (b.charge === 2 && b.next <= a.tick) {
      action(a,b,'wave');
      shoot(a, b, 'wave', b.heading);
      const recoil=evolutionEffect(b,'recoil');b.kx-=Math.cos(b.heading)*recoil;b.ky-=Math.sin(b.heading)*recoil;
      b.charge = 0; b.next = a.tick + cl.cooldown;
    }
  }
}

function contact(a, b, other) {
  const { cl } = b;
  const from = { x: b.px, y: b.py };
  if(newContact(a,b,other,mechanics))return;
  if (b.classId === 'crimson' && b.charge) {
    hit(a, b, other, 'blaze', cl.power, from, { push: cl.push, status: 'burn' });
    b.charge = 0;
  } else if (['bolt', 'ninja'].includes(b.classId) && b.dashUntil >= a.tick) {
    hit(a, b, other, b.classId === 'ninja' ? 'shadowdash' : 'dash', cl.power, from);
  } else hit(a, b, other, b.rageUntil >= a.tick ? 'ragebody' : 'body', cl.bodyPower * (b.rageUntil >= a.tick ? 1.35 : 1), from);
}

function collide(a, b, c) {
  const min = b.r + c.r;
  const dx = c.x - b.x, dy = c.y - b.y;
  // Under the velocity cap each ball travels at most 7.1 units/tick (diameter 26).
  if (Math.abs(dx) > min + 15 || Math.abs(dy) > min + 15) return;
  if (!swept(b.px, b.py, b.x, b.y, c, min)) return;
  const length = Math.hypot(dx, dy);
  const [nx, ny] = length ? [dx / length, dy / length] : unit(c.px - b.px, c.py - b.py);
  const overlap = Math.max(0, min - length);
  const totalInverse = 1 / b.cl.mass + 1 / c.cl.mass;
  b.x -= nx * overlap / (b.cl.mass * totalInverse); b.y -= ny * overlap / (b.cl.mass * totalInverse);
  c.x += nx * overlap / (c.cl.mass * totalInverse); c.y += ny * overlap / (c.cl.mass * totalInverse);
  const approach = (b.vx+b.kx-c.vx-c.kx)*nx+(b.vy+b.ky-c.vy-c.ky)*ny;
  if (approach > 0) {
    const impulse = 2 * approach / totalInverse;
    b.vx -= impulse * nx / b.cl.mass; b.vy -= impulse * ny / b.cl.mass;
    c.vx += impulse * nx / c.cl.mass; c.vy += impulse * ny / c.cl.mass;
  }
  if (ready(b, 'body/' + c.id, a.tick, rules.bodyCooldown)) {
    contact(a, b, c); contact(a, c, b);
  }
}

function weapons(b) {
  const { cl } = b;
  if (!cl.orbit) return [];
  const kind = { ring: 'blade', mace: 'mace', thorn: 'thorn', magnet: 'electrode', trinity: 'trinity',saw:'saw' }[b.classId];
  const count = kind === 'trinity' ? 3 : (kind === 'blade' || kind === 'electrode') ? 2 : 1;
  return Array.from({ length: count }, (_, i) => {
    const angle = b.angle + TAU * i / count;
    const orbit=cl.orbit*combatScale(b,'orbit'),previous=(b.previousAngle??b.angle-cl.spin)+TAU*i/count;
    return { id: b.id + '/w' + i, kind, ownerId: b.id, angle, r: cl.weaponR*combatScale(b,'weaponR'),
      x: b.x + Math.cos(angle) * orbit, y: b.y + Math.sin(angle) * orbit,
      px: b.px + Math.cos(previous) * orbit, py: b.py + Math.sin(previous) * orbit };
  });
}

function orbitHits(a, b, live) {
  if (!b.cl.orbit || b.classId === 'magnet') return;
  if(b.classId==='mace'&&b.awakeningState?.ready&&a.tick-b.awakeningState.readyAt<18)return;
  if(['mace','saw'].includes(b.classId)&&a.tick<(b.awakeningState?.recoveryUntil??-1))return;
  if(b.classId==='mace'&&b.evolution.recoveryFrom<=a.tick&&a.tick<b.evolution.recoveryUntil)return;
  if(b.classId==='saw'&&(b.state.overheatUntil??-1)>=a.tick)return;
  for (const w of weapons(b)) {
    for (const target of live) {
      if (target === b || !swept(w.px, w.py, w.x, w.y, target, w.r + target.r)) continue;
      const trinity = b.classId === 'trinity';
      if (!ready(b, (trinity ? 'triad' : w.id) + '/' + target.id, a.tick, b.cl.cooldown)) continue;
      action(a,b,'orbit',{target});
      if (trinity) b.combo = (b.combo + 1) % 3;
      const finisher = trinity && b.combo === 0;
      const charged=b.classId==='mace'&&(b.state.wallCharge??0)>=3;
      const sawPower=b.classId==='saw'?1+(b.state.heat??0)*.12:1;
      hit(a, b, target, w.kind, b.cl.power * (finisher ? 1.8 : charged?1.25:sawPower), w,
        { push: finisher ? 150 : (b.cl.push || 0)*(charged?1.25:1), wall: w.kind === 'mace', wallCharged:(b.state.wallCharge??0)>0,status: w.kind === 'thorn' ? 'poison' : null });
      if(charged){b.state.wallCharge=0;emit(a,'skill','mace-charge',b,target,w.x,w.y);}
      if (finisher) emit(a, 'skill', 'triad', b, target, target.x, target.y, { r: 28 });
    }
  }
}

function advanceObjects(a, live) {
  const expired = new Set();
  for (const o of a.objects) {
    if (o.born === a.tick||o.cancelled||expired.has(o)) continue;
    const b = o.owner, cl = b.cl;
    if(newField(a,o,live,expired,mechanics))continue;
    if (o.field) {
      if (o.kind === 'familiar') {
        if (!b.alive || a.tick >= o.expires) { expired.add(o); continue; }
        o.angle += .055;
        const edge = a.inset + o.r;
        o.x = clamp(b.x + Math.cos(o.angle) * 35, edge, a.width - edge);
        o.y = clamp(b.y + Math.sin(o.angle) * 35, edge, a.height - edge);
        if(o.upgradeUntil&&a.tick>o.upgradeUntil){o.upgraded=false;o.r=7;o.fireIntervalScale=1;o.upgradeUntil=null;}
        if (a.tick >= o.next) {
          const target = aimTarget(a,b,185,o);
          if (target) {
            shoot(a, b, 'shadow', Math.atan2(target.y - o.y, target.x - o.x),
              { ...cl, origin: o, maxTargets: 1, homing: .035,summon:true,...(o.greaterUntil>=a.tick?{shotR:(cl.shotR??5)*1.2,push:55,projectile:{awakeningId:o.awakeningId}}:{}) });
            o.next = a.tick + Math.ceil(72*(o.fireIntervalScale??1)*(b.trait?.id==='squad_focus'?b.trait.params.interval:1));
          } else o.next = a.tick + 6;
        }
      } else if (o.kind === 'afterimage') {
        if (a.tick >= o.expires || (a.tick > o.born + 5 && nearby(a, o, o.r, b, 1).length)) {
          pulse(a, b, 'afterimage', o, o.r, o.power, 2, 55);
          expired.add(o);
        }
      } else if (o.kind === 'seed') {
        const armed = a.tick >= o.born + cl.armTicks;
        if (a.tick >= o.expires || (armed && nearby(a, o, cl.triggerRange, b, 1).length)) {
          pulse(a, b, 'bloom', o, o.mythicRange??cl.range*(o.evoRange??1), cl.power, cl.maxTargets);
          expired.add(o);
        }
      } else if (o.kind === 'gravity' && a.tick >= o.expires) {
        pulse(a, b, 'collapse', o, o.mythicRange??cl.coreRange*(o.coreScale??1), cl.power, cl.maxTargets);
        expired.add(o);
      } else if (o.kind === 'gravity') {
        for (const target of nearby(a, o, o.r, b, cl.maxTargets)) {
          const [nx, ny] = unit(o.x - target.x, o.y - target.y);
          target.vx += nx * cl.pull*(o.mythicPull??o.pullScale??1); target.vy += ny * cl.pull*(o.mythicPull??o.pullScale??1);
        }
      }
      continue;
    }
    if(newProjectile(a,o,live,expired,mechanics))continue;
    if(o.refractAt&&a.tick>=o.refractAt){const angle=Math.atan2(o.vy,o.vx)+o.refractAngle,speed=Math.hypot(o.vx,o.vy);o.vx=Math.cos(angle)*speed;o.vy=Math.sin(angle)*speed;o.refractAt=null;}
    if (o.homing) {
      const target = nearby(a, o, 220, b, 1)[0];
      if (target) {
        const speed = Math.hypot(o.vx, o.vy), [nx, ny] = unit(target.x - o.x, target.y - o.y);
        const [vx, vy] = unit(o.vx * (1 - o.homing) + nx * speed * o.homing,
          o.vy * (1 - o.homing) + ny * speed * o.homing);
        o.vx = vx * speed; o.vy = vy * speed;
      }
    }
    const x = o.x + o.vx / rules.hz, y = o.y + o.vy / rules.hz;
    for (const target of live) {
      if (target === b || o.hit.has(target.id) || !swept(o.x, o.y, x, y, target, o.r + target.r)) continue;
      o.hit.add(target.id);
      hit(a, b, target, o.kind, o.power, o, { projectile: o, push: o.push, reactive: o.reflected > 0, attackId: o.rootAttackId??o.id });
      // Reflection is resolved with this hit; a reflected hit cancels later pierces.
      if (o.hit.size >= o.maxTargets) { expired.add(o); break; }
    }
    o.x = x; o.y = y;
    if (a.tick >= o.expires || x < a.inset || x > a.width - a.inset || y < a.inset || y > a.height - a.inset) expired.add(o);
  }
  if (expired.size) a.objects = a.objects.filter(o => !expired.has(o));
}

function dot(target, owner, kind, tick, attackId) {
  const poison = kind === 'poison', key = owner.id + '/' + kind, old = target.dots.get(key);
  target.dots.set(key, { owner, kind, attackId, next: old?.next ?? tick + 30,
    end: tick + Math.round(poison ? owner.cl.poisonTicks : owner.cl.burnTicks*combatScale(owner,'burnTicks')),
    stacks: poison ? Math.min(owner.cl.stacks, (old?.stacks ?? 0) + 1) : 1,
    power: poison ? owner.cl.poisonPower : owner.cl.burnPower });
}

function defend(a, h, damage) {
  if(damage<=0)return 0;
  const b = h.target, cl = b.cl;
  const custom=newDefend(a,h,damage,mechanics);if(custom!==null)return custom;
  if (b.classId === 'star' && h.projectile && !h.reactive && a.tick - b.blockedAt >= (cl.cooldown ?? 115)) {
    h.projectile.cancelled = true;
    a.objects = a.objects.filter(o => o !== h.projectile);
    b.blockedAt = a.tick; b.blocked += damage; b.charge = 1;
    b.state.absorbedRoot=h.attackId;
    b.next = a.tick + 12;
    emit(a, 'block', 'absorb', b, h.source, h.x, h.y,{blocked:damage,rootAttackId:h.attackId});
    tacticBlock(a,b,h,damage,emit);
    return 0;
  }
  if (b.classId === 'ninja' && b.dashUntil >= a.tick && h.kind === 'body' && !h.reactive) {
    b.blocked += damage * .5;
    emit(a, 'block', 'evade', b, h.source, h.x, h.y,{blocked:damage*.5,rootAttackId:h.attackId});
    return damage * .5;
  }
  if (!cl.block || h.reactive || a.tick - b.blockedAt < cl.blockCooldown) return damage;
  const front = -(Math.cos(b.heading) * h.nx + Math.sin(b.heading) * h.ny);
  if (b.classId !== 'hourglass' && front < .18) return damage;
  b.blockedAt = a.tick;
  const reduction = damage * Math.min(.55,cl.block*combatScale(b,'guard'));
  b.blocked += reduction;
  emit(a, 'block', b.classId, b, h.source, h.x, h.y,{blocked:reduction,rootAttackId:h.attackId});
  tacticBlock(a,b,h,reduction,emit);
  if (b.classId === 'tide') b.charge++;
  if (b.classId === 'hourglass') b.delayed = { at: a.tick + cl.delay, target: h.source,rootAttackId:h.attackId };
  if (b.classId === 'crystal') {
    action(a,b,'shard');
    const shot = h.projectile;
    if (shot && !shot.reflected) {
      shot.cancelled = true;
      a.objects = a.objects.filter(o => o !== shot);
      const angle = Math.atan2(-shot.vy, -shot.vx);
      shoot(a, b, 'shard', angle, { ...cl, power: shot.power, shotSpeed: Math.hypot(shot.vx, shot.vy),rootAttackId:h.attackId });
    } else shoot(a, b, 'shard', Math.atan2(-h.ny, -h.nx),{...cl,rootAttackId:h.attackId});
  }
  return damage - reduction;
}

function applyDamage(a) {
  const batches = new Map();
  for (const h of a.pending) {
    if (h.projectile?.cancelled) continue;
    const { target, source } = h;
    tacticBeforeHit(a,h,emit);
    const raw = awakeningRemainingDamage(a,h,source ? source.atk * h.power * advantage(source.element, target.element) : h.power);
    h.value = source ? defend(a, h, raw) : raw;h.blocked=Math.max(0,raw-h.value);
    h.value=awakeningDamageBudget(a,h,h.value);
    if (h.status && h.value > 0) dot(target, source, h.status, a.tick, h.attackId);
    if (h.slowTicks && h.value > 0) {
      target.slowUntil = Math.max(target.slowUntil, a.tick + h.slowTicks);
      target.slowFactor = Math.min(target.slowFactor, h.slowFactor ?? .62);
    }
    if (h.push && h.value > 0) { const scale=target.trait?.id==='stability'?target.trait.params.impulse:1;target.kx += h.nx * h.push / target.cl.mass*scale; target.ky += h.ny * h.push / target.cl.mass*scale; }
    if (h.wall&&h.value>0) target.wallHit = { source, until: a.tick + source.cl.wallTicks, attackId: h.attackId,power:h.wallPower??source.cl.wallPower,awakeningId:h.awakeningId,evolutionId:h.evolutionId };
    if (!batches.has(target)) batches.set(target, []);
    batches.get(target).push(h);
  }
  for (const [target, hits] of batches) {
    const total = hits.reduce((sum, h) => sum + h.value, 0);
    const fraction = total > 0 ? Math.min(1, target.hp / total) : 0;
    const bySource = new Map();
    for (const h of hits) {
      const amount = h.value * fraction;
      if (h.source && amount > 0) {
        h.source.damage += amount;
        h.source.effective += amount / target.maxHp;
      }
      if (amount > 0) bySource.set(h.source ?? null, (bySource.get(h.source ?? null) ?? 0) + amount);
      tacticAfterHit(a,h,amount,emit);newAfterHit(a,h,amount,mechanics);evolutionAfterHit(a,h,amount);awakeningAfterHit(a,h,amount,mechanics);
      emit(a, 'hit', h.kind, h.source, target, h.x, h.y, {
        nx: round(h.nx), ny: round(h.ny), damage: round(amount),blocked:round(h.blocked??0), attackId: h.attackId,rootAttackId:h.attackId,
        impulse:amount>0?h.push??0:0,wallCharged:!!h.wallCharged,reasonTags:h.reasonTags,procDepth:h.procDepth,evolutionId:h.evolutionId??h.projectile?.evolutionId,awakeningId:h.awakeningId??h.projectile?.awakeningId,
        ...impactOf(h,amount,target),
        ...(h.fromX != null ? { fromX: h.fromX, fromY: h.fromY } : {}),
      });
    }
    if (total > 0) {
      target.hp = Math.max(0, target.hp - total); target.lastHit = a.tick;
      if (target.classId === 'berserk') target.rage = Math.min(100, target.rage + total * fraction / target.maxHp * 220);
    }
    if (target.hp === 0) {
      if(newLethal(a,target,mechanics))continue;
      // Credit effective damage in the lethal tick, including environmental pressure.
      const killer = [...bySource].sort((x, y) => y[1] - x[1] || (x[0]?.tie ?? Infinity) - (y[0]?.tie ?? Infinity))[0]?.[0] ?? null;
      const lethal = hits.filter(h => (h.source ?? null) === killer).sort((x, y) => y.value - x.value)[0];
      if (killer) killer.kills++;
      target.elimTick = a.tick;awakeningSignal(a,target,'death',{},mechanics);
      target.killedById = killer?.id ?? null;
      target.killedByName = killer?.name ?? null;
      target.cause = lethal?.projectile?.reflected ? 'reflected' :
        ['poison', 'burn'].includes(lethal?.kind) ? 'status' : lethal?.kind ?? 'pressure';
      emit(a, 'ko', 'ko', killer, target, target.x, target.y,
        { killedById: target.killedById, killedByName: target.killedByName, cause: target.cause });
    }
  }
  a.pending.length = 0;
  flushHealing(a,mechanics);
}

function compare(b, c) {
  const ratio = c.hp / c.maxHp - b.hp / b.maxHp;
  if (Math.abs(ratio) > 1e-10) return ratio;
  const damage = c.effective - b.effective;
  return Math.abs(damage) > 1e-10 ? damage : 0;
}

function finish(a, reason) {
  a.done = true;
  a.reason = reason;
  if (a.mode !== 'rumble') {
    const sorted = [...a.balls].sort((b, c) => compare(b, c) || b.tie - c.tie);
    sorted.forEach((b, i) => { b.rank = i + 1; });
    const draw=a.outcomePolicy==='ranking'&&sorted.length===2&&(sorted.every(b=>b.hp===0)||!compare(sorted[0],sorted[1]));
    if(draw)sorted.forEach(b=>{b.rank=1;});
    a.outcome={draw,winnerId:draw?null:sorted[0]?.id??null};
    if (sorted.length === 2 && (a.tick >= a.limitTicks || sorted.every(b => !b.alive))) {
      const [b, c] = sorted;
      const rule = draw?'무승부':Math.abs(b.hp / b.maxHp - c.hp / c.maxHp) > 1e-10 ? '잔여 체력 비율' :
        Math.abs(b.effective - c.effective) > 1e-10 ? '유효 피해 비율' : '경기 전 시드 추첨';
      a.reason += ' · ' + rule;
    }
  } else {
    const sorted = a.balls.filter(b => b.alive).sort(compare);
    sorted.forEach((b, i) => { b.rank = i && !compare(sorted[i - 1], b) ? sorted[i - 1].rank : i + 1; });
  }
  a.results = a.balls.map(b => ({ id: b.id, name: b.name, rank: b.rank, level: b.level, tier: 20 - b.level, classId: b.classId,
    ballId: b.ballId, path: b.path, ballName: b.ballName, portraitKey: b.portraitKey,traitId:b.traitId,
    killedById: b.killedById, killedByName: b.killedByName, cause: b.cause,
    element: b.element, damage: round(b.damage), kills: b.kills, blocked: round(b.blocked),
    hp: round(b.hp), maxHp: b.maxHp, survived: round((b.elimTick ?? a.tick) / rules.hz), reason: a.reason,
  })).sort((b, c) => b.rank - c.rank);
}

export function stepArena(a) {
  if (a.done) return;
  a.tick++;
  if (a.mode === 'rumble' && a.tick >= rules.shrinkFrom * rules.hz) {
    const progress = (a.tick / rules.hz - rules.shrinkFrom) / (rules.rumbleSeconds - rules.shrinkFrom);
    a.inset = Math.min(a.width, a.height) * .30 * progress;
  }
  const live = a.balls.filter(b => b.alive);
  for (const b of live) onTimer(a, b);
  for (const b of live) move(a, b);
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) collide(a, live[i], live[j]);
  }
  for (const b of live) {
    const edge = a.inset + b.r;
    b.x = clamp(b.x, edge, a.width - edge); b.y = clamp(b.y, edge, a.height - edge);
    orbitHits(a, b, live);
  }
  advanceObjects(a, live);
  if (a.tick === a.pressureTick) emit(a, 'pressure', 'pressure', null, null, a.width / 2, a.height / 2);
  if (a.tick >= a.pressureTick && (a.mode!=='rumble'||a.tick % 60 === 0)) {
    const amount = a.mode==='rumble'?1+(a.tick-a.pressureTick)/70:
      (rules.duelPressureBase+rules.duelPressureGrowth*(a.tick-a.pressureTick)/rules.hz)/rules.hz;
    for (const b of live) hit(a, null, b, 'pressure', amount, b, { reactive: true });
  }
  applyDamage(a);
  const left = live.filter(b => b.hp > 0).length;
  for (const b of live) if (b.hp === 0) { b.alive = false; b.rank = left + 1; }
  if (left <= 1) finish(a, left ? '마지막 생존' : '동시 탈락');
  else if (a.tick >= a.limitTicks) finish(a, '제한 시간 판정');
}

export function arenaSnapshot(a) {
  const objects = a.objects.map(o => ({ id: o.id, kind: o.kind, ownerId: o.owner.id, x: round(o.x), y: round(o.y), r: o.r,lineR:o.kind==='mycelium'||o.kind==='lighttrail'?2:undefined,dangerR:o.kind==='gravity'?(o.mythicRange??o.owner.cl.coreRange*(o.coreScale??1)):o.kind==='seed'?(o.mythicRange??o.owner.cl.range*(o.evoRange??1)):undefined,
    angle: round(o.angle ?? Math.atan2(o.vy ?? 0, o.vx ?? 1)),x2:o.x2,y2:o.y2,ready:o.ready,hp:o.hp,maxHp:o.maxHp,returning:o.returning,warning:o.warning??false,upgraded:o.upgraded??false,greaterUntil:o.greaterUntil,currentPower:o.currentPower,mythicFinal:o.mythicFinal,evolutionId:o.evolutionId,awakeningId:o.awakeningId }));
  const balls = a.balls.map(b => {
    if (b.alive) {
      if(b.state.swing)objects.push({id:b.id+'/swing',kind:'swing-rope',ownerId:b.id,x:b.x,y:b.y,x2:b.state.swing.x,y2:b.state.swing.y,r:2});
      for(let i=0;i<(b.state.held?.length??0);i++){const angle=a.tick*.06+i*Math.PI;objects.push({id:b.id+'/held'+i,kind:'captured-orbit',ownerId:b.id,x:round(b.x+Math.cos(angle)*26),y:round(b.y+Math.sin(angle)*26),r:5});}
      for (const w of weapons(b)) objects.push({ id: w.id, kind: w.kind, ownerId: b.id, x: round(w.x), y: round(w.y), r: w.r,angle:w.angle });
      if (b.classId === 'tide' || b.classId === 'crystal') {
        objects.push({ id: b.id + '/shield', kind: b.classId === 'tide' ? 'shield' : 'crystal',
          ownerId: b.id, x: round(b.x), y: round(b.y), r: b.r + 4, angle: b.heading,
          ready: a.tick - b.blockedAt >= b.cl.blockCooldown });
      }
      if (b.tether?.target.alive) objects.push({ id: b.id + '/chain', kind: 'tether', ownerId: b.id,
        x: round(b.tether.target.x), y: round(b.tether.target.y), r: 2 });
    }
    return { id: b.id, name: b.name, level: b.level, tier: 20 - b.level, element: b.element, classId: b.classId,
      ballId: b.ballId, path: b.path, ballName: b.ballName, portraitKey: b.portraitKey, glyph: b.glyph,traitId:b.traitId,
      resource:newResource(a,b),tacticResource:tacticResource(a,b),evolution:evolutionSnapshot(a,b),awakeningState:awakeningSnapshot(a,b),renderMode:b.cl.renderMode??'hybrid',awakening:b.awakeningUntil>=a.tick,
      x: round(b.x), y: round(b.y), vx: round(b.vx), vy: round(b.vy),kx:round(b.kx),ky:round(b.ky),r: b.r, hp: round(b.hp), maxHp: b.maxHp,
      alive: b.alive, angle: round(b.angle), charge: b.charge, lastHit: b.lastHit,
      rank: b.rank, kills: b.kills, killedById: b.killedById, killedByName: b.killedByName, cause: b.cause,
      teleportedAt: b.teleportedAt, aim: b.aim, rage: round(b.rage),
      status: [...new Set([...b.dots.values()].map(d => d.kind)), ...(b.slowUntil >= a.tick ? ['frost'] : []),
        ...(b.rageUntil >= a.tick ? ['rage'] : [])], dash: b.dashUntil >= a.tick,
    };
  });
  return { id: a.id, mode: a.mode, width: a.width, height: a.height, inset: round(a.inset), tick: a.tick,
    limitTicks: a.limitTicks, pressure: a.tick >= a.pressureTick, balls, objects, events: a.events.filter(e => e.tick >= a.tick - 12),
    done: a.done, reason: a.reason,outcome:a.outcome??null };
}

function impactOf(h,damage,target){
  const impactKind=!h.source||['burn','poison','residualheat'].includes(h.kind)?'dot':h.kind==='wallslam'?'wall':['mace','punch','greatslash','combo-finish','swingdash'].includes(h.kind)?'heavy':['blade','trinity','saw','thorn','crescent','jab'].includes(h.kind)?'cut':['beam','thermal','arc','dash','snipe'].includes(h.kind)?'energy':h.projectile?.summon?'summon':'body';
  const impactGrade=damage<=0||impactKind==='dot'?0:Math.min(3,Math.max(1,Math.ceil(Math.max(damage/Math.max(1,target.maxHp)*12,Math.abs(h.push??0)/100))));
  return {impactKind,impactGrade};
}
const mechanics={hit,emit,spawn,shoot,pulse,nearby,clamp,unit,swept,tacticBlock,aimTarget,action,combatScale,evolutionEffect};

// Guide fixtures prime a disclosed prerequisite; actual actions use normal combat.
export function primeEvolutionDemo(a,b){b.demoPrerequisite=true;return evolutionCharge(a,b,b.evolution.max,`${a.id}:${b.id}:demo-prerequisite`,mechanics);}
