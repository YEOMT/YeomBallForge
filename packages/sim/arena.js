import { CLASSES, COMBAT as rules, advantage } from '../content/classes.js';
import { randomStream, shuffled } from './random.js';

const TAU = Math.PI * 2;
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
    const cl = CLASSES[build.classId] ?? CLASSES.basic;
    const level = clamp(Math.trunc(Number(build.level) || 0), 0, 20);
    const cell = positions[i];
    const x = ((cell % columns) + .35 + random() * .3) * width / columns;
    const y = (Math.floor(cell / columns) + .35 + random() * .3) * height / rows;
    const theta = random() * TAU;
    const maxHp = (rules.hpBase + level * rules.hpPerLevel) * cl.hpScale;
    return {
      id: build.id, name: build.name, classId: cl.id, level, element: build.element ?? cl.element, cl,
      x, y, px: x, py: y, r: rules.radius, vx: Math.cos(theta) * cl.speed, vy: Math.sin(theta) * cl.speed,
      heading: theta, angle: random() * TAU, hp: maxHp, maxHp, atk: rules.attackBase + level * rules.attackPerLevel,
      alive: true, rank: 0, kills: 0, damage: 0, effective: 0, blocked: 0, tie: 0,
      charge: 0, next: 30 + Math.floor(random() * 36), blockedAt: -999, rushAt: -999, dashUntil: -1,
      immunity: new Map(), dots: new Map(), delayed: null, wallHit: null, lastHit: -999, elimTick: null,
    };
  });
  shuffled(balls, random).forEach((b, i) => { b.tie = i; });
  const a = {
    id, mode, width, height, inset: 0, tick: 0, balls, index: new Map(balls.map(b => [b.id, b])),
    random, objects: [], events: [], seq: 0, serial: 0, pending: [], done: false, reason: '', results: [],
    limitTicks: rules.hz * (rumble ? rules.rumbleSeconds : final ? rules.finalSeconds : rules.duelSeconds),
    pressureTick: rules.hz * (rumble ? rules.rumblePressure : final ? rules.finalPressure : rules.duelPressure),
  };
  if (balls.length === 1) finish(a, '단독 출전');
  return a;
}

function emit(a, type, kind, owner, target, x, y, extra = {}) {
  a.events.push({ seq: ++a.seq, tick: a.tick, type, kind, sourceId: owner?.id ?? null,
    targetId: target?.id ?? null, x: round(x), y: round(y), ...extra });
  if (a.events.length > rules.eventBuffer) a.events.shift();
}

function nearby(a, center, range, owner, cap, exclude) {
  const max = range * range;
  return a.balls.filter(b => b.alive && b !== owner && !exclude?.has(b.id) && dist2(b, center) <= max)
    .sort((p, q) => dist2(p, center) - dist2(q, center) || p.tie - q.tie).slice(0, cap);
}

function hit(a, source, target, kind, power, origin = source, options = {}) {
  const [nx, ny] = unit(target.x - origin.x, target.y - origin.y);
  a.pending.push({ source, target, kind, power, nx, ny, attackId: 'a' + (++a.serial), x: target.x - nx * target.r,
    y: target.y - ny * target.r, ...options });
}

function ready(owner, key, tick, interval) {
  if ((owner.immunity.get(key) ?? 0) > tick) return false;
  owner.immunity.set(key, tick + interval);
  return true;
}

function spawn(a, owner, kind, props, field = false) {
  if (a.objects.filter(o => o.field === field).length >= (field ? rules.fieldLimit : rules.projectileLimit)) return;
  const mine = a.objects.filter(o => o.field === field && o.owner === owner);
  if (mine.length >= (field ? rules.fieldsPerOwner : rules.projectilesPerOwner)) {
    a.objects.splice(a.objects.indexOf(mine[0]), 1);
  }
  a.objects.push({ id: 'o' + (++a.serial), owner, kind, field, x: owner.x, y: owner.y, born: a.tick, ...props });
}

function shoot(a, b, kind, angle, spec = b.cl) {
  const vx = Math.cos(angle), vy = Math.sin(angle);
  spawn(a, b, kind, {
    x: b.x + vx * b.r, y: b.y + vy * b.r, vx: vx * spec.shotSpeed, vy: vy * spec.shotSpeed,
    r: spec.shotR, expires: a.tick + spec.shotLife, power: spec.power, hit: new Set(),
    maxTargets: spec.maxTargets, push: spec.push || 0, reflected: kind === 'shard' ? 1 : 0,
  });
}

function pulse(a, b, kind, origin, range, power, maxTargets, push = 0, reactive = false) {
  emit(a, 'skill', kind, b, null, origin.x, origin.y, { r: range });
  for (const target of nearby(a, origin, range, b, maxTargets)) hit(a, b, target, kind, power, origin, { push, reactive });
}

function onTimer(a, b) {
  const { cl } = b, t = a.tick;
  for (const [key, dot] of b.dots) {
    if (t > dot.end) { b.dots.delete(key); continue; }
    if (t >= dot.next) {
      hit(a, dot.owner, b, dot.kind, dot.power * dot.stacks, dot.owner, { reactive: true, attackId: dot.attackId });
      dot.next += 30;
    }
  }
  if (b.delayed && b.delayed.at <= t) {
    const { target } = b.delayed;
    if (target.alive) hit(a, b, target, 'echo', cl.power, b, { reactive: true });
    b.delayed = null;
  }
  if (b.classId === 'tide' && b.charge >= 2) {
    pulse(a, b, 'surge', b, cl.range, cl.power, cl.maxTargets, cl.push, true);
    b.charge = 0;
  }
  if (t < b.next) return;
  switch (b.classId) {
    case 'bolt': {
      if (!b.charge) {
        const target = nearby(a, b, Infinity, b, 1)[0];
        if (!target) break;
        b.aim = Math.atan2(target.y - b.y, target.x - b.x);
        b.charge = 1; b.next = t + cl.windup;
        emit(a, 'skill', 'charge', b, null, b.x, b.y, { angle: b.aim });
      } else {
        b.vx = Math.cos(b.aim) * cl.dashSpeed; b.vy = Math.sin(b.aim) * cl.dashSpeed;
        b.dashUntil = t + cl.dashTicks; b.charge = 0; b.next = t + cl.cooldown;
        emit(a, 'skill', 'dash', b, null, b.x, b.y);
      }
      break;
    }
    case 'magnet': {
      let source = b;
      const seen = new Set();
      for (let jump = 0; jump < cl.maxTargets; jump++) {
        const target = nearby(a, source, jump ? cl.chainRange : cl.range, b, 1, seen)[0];
        if (!target) break;
        hit(a, b, target, 'arc', cl.power * cl.falloff ** jump, source, { fromX: round(source.x), fromY: round(source.y) });
        seen.add(target.id); source = target;
      }
      b.next = t + (seen.size ? cl.cooldown : 6);
      break;
    }
    case 'seed':
      spawn(a, b, 'seed', { r: cl.triggerRange, expires: t + cl.life }, true);
      b.next = t + cl.cooldown;
      break;
    case 'gravity':
      spawn(a, b, 'gravity', { r: cl.range, expires: t + cl.life }, true);
      b.next = t + cl.cooldown;
      break;
    case 'prism': {
      const target = nearby(a, b, Infinity, b, 1)[0];
      if (target) {
        const angle = Math.atan2(target.y - b.y, target.x - b.x);
        for (const delta of [-.17, 0, .17]) shoot(a, b, 'prism', angle + delta);
      }
      b.next = t + cl.cooldown;
      break;
    }
  }
}

function move(a, b) {
  const { cl } = b;
  const speed = Math.hypot(b.vx, b.vy);
  const desired = b.dashUntil >= a.tick ? cl.dashSpeed : cl.speed;
  const nextSpeed = clamp(speed + (desired - speed) * .075, cl.speed * .75, rules.speedCap);
  const [nx, ny] = unit(b.vx, b.vy);
  b.vx = nx * nextSpeed; b.vy = ny * nextSpeed;
  b.heading = Math.atan2(b.vy, b.vx); b.px = b.x; b.py = b.y;
  b.x += b.vx / rules.hz; b.y += b.vy / rules.hz;
  const lo = a.inset + b.r, right = a.width - lo, bottom = a.height - lo;
  let wall = false;
  if ((b.x < lo && b.vx < 0) || (b.x > right && b.vx > 0)) { b.vx *= -1; wall = true; }
  if ((b.y < lo && b.vy < 0) || (b.y > bottom && b.vy > 0)) { b.vy *= -1; wall = true; }
  b.x = clamp(b.x, lo, right); b.y = clamp(b.y, lo, bottom);
  b.angle = (b.angle + (cl.spin || .032)) % TAU;
  if (!wall) return;
  b.heading = Math.atan2(b.vy, b.vx);
  const impact = b.wallHit;
  if (impact && impact.until >= a.tick) {
    hit(a, impact.source, b, 'wallslam', impact.source.cl.wallPower, impact.source, { reactive: true, attackId: impact.attackId });
  }
  b.wallHit = null;
  emit(a, 'wall', 'bounce', b, null, b.x, b.y, { vx: round(b.vx), vy: round(b.vy) });
  if (b.classId === 'crimson') b.charge = 1;
  if (b.classId === 'cannon') {
    b.charge = Math.min(2, b.charge + 1);
    if (b.charge === 2 && b.next <= a.tick) {
      shoot(a, b, 'wave', b.heading);
      b.charge = 0; b.next = a.tick + cl.cooldown;
    }
  }
}

function contact(a, b, other) {
  const { cl } = b;
  const from = { x: b.px, y: b.py };
  if (b.classId === 'crimson' && b.charge) {
    hit(a, b, other, 'blaze', cl.power, from, { push: cl.push, status: 'burn' });
    b.charge = 0;
  } else if (b.classId === 'bolt' && b.dashUntil >= a.tick) {
    hit(a, b, other, 'dash', cl.power, from);
  } else hit(a, b, other, 'body', cl.bodyPower, from);
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
  const approach = (b.vx - c.vx) * nx + (b.vy - c.vy) * ny;
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
  const kind = { ring: 'blade', mace: 'mace', thorn: 'thorn', magnet: 'electrode' }[b.classId];
  const count = (kind === 'blade' || kind === 'electrode') ? 2 : 1;
  return Array.from({ length: count }, (_, i) => {
    const angle = b.angle + Math.PI * i;
    return { id: b.id + '/w' + i, kind, ownerId: b.id, angle, r: cl.weaponR,
      x: b.x + Math.cos(angle) * cl.orbit, y: b.y + Math.sin(angle) * cl.orbit,
      px: b.px + Math.cos(angle - cl.spin) * cl.orbit, py: b.py + Math.sin(angle - cl.spin) * cl.orbit };
  });
}

function orbitHits(a, b, live) {
  if (!b.cl.orbit || b.classId === 'magnet') return;
  for (const w of weapons(b)) {
    for (const target of live) {
      if (target === b || !swept(w.px, w.py, w.x, w.y, target, w.r + target.r)) continue;
      if (!ready(b, w.id + '/' + target.id, a.tick, b.cl.cooldown)) continue;
      hit(a, b, target, w.kind, b.cl.power, w, { push: b.cl.push || 0, wall: w.kind === 'mace', status: w.kind === 'thorn' ? 'poison' : null });
    }
  }
}

function advanceObjects(a, live) {
  const expired = new Set();
  for (const o of a.objects) {
    if (o.born === a.tick) continue;
    const b = o.owner, cl = b.cl;
    if (o.field) {
      if (o.kind === 'seed') {
        const armed = a.tick >= o.born + cl.armTicks;
        if (a.tick >= o.expires || (armed && nearby(a, o, cl.triggerRange, b, 1).length)) {
          pulse(a, b, 'bloom', o, cl.range, cl.power, cl.maxTargets);
          expired.add(o);
        }
      } else if (a.tick >= o.expires) {
        pulse(a, b, 'collapse', o, cl.coreRange, cl.power, cl.maxTargets);
        expired.add(o);
      } else {
        for (const target of nearby(a, o, o.r, b, cl.maxTargets)) {
          const [nx, ny] = unit(o.x - target.x, o.y - target.y);
          target.vx += nx * cl.pull; target.vy += ny * cl.pull;
        }
      }
      continue;
    }
    const x = o.x + o.vx / rules.hz, y = o.y + o.vy / rules.hz;
    for (const target of live) {
      if (target === b || o.hit.has(target.id) || !swept(o.x, o.y, x, y, target, o.r + target.r)) continue;
      o.hit.add(target.id);
      hit(a, b, target, o.kind, o.power, o, { projectile: o, push: o.push, reactive: o.reflected > 0, attackId: o.id });
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
    end: tick + (poison ? owner.cl.poisonTicks : owner.cl.burnTicks),
    stacks: poison ? Math.min(owner.cl.stacks, (old?.stacks ?? 0) + 1) : 1,
    power: poison ? owner.cl.poisonPower : owner.cl.burnPower });
}

function defend(a, h, damage) {
  const b = h.target, cl = b.cl;
  if (!cl.block || h.reactive || a.tick - b.blockedAt < cl.blockCooldown) return damage;
  const front = -(Math.cos(b.heading) * h.nx + Math.sin(b.heading) * h.ny);
  if (b.classId !== 'hourglass' && front < .18) return damage;
  b.blockedAt = a.tick;
  const reduction = damage * cl.block;
  b.blocked += reduction;
  emit(a, 'block', b.classId, b, h.source, h.x, h.y);
  if (b.classId === 'tide') b.charge++;
  if (b.classId === 'hourglass') b.delayed = { at: a.tick + cl.delay, target: h.source };
  if (b.classId === 'crystal') {
    const shot = h.projectile;
    if (shot && !shot.reflected) {
      shot.cancelled = true;
      a.objects = a.objects.filter(o => o !== shot);
      const angle = Math.atan2(-shot.vy, -shot.vx);
      shoot(a, b, 'shard', angle, { ...cl, power: shot.power, shotSpeed: Math.hypot(shot.vx, shot.vy) });
    } else shoot(a, b, 'shard', Math.atan2(-h.ny, -h.nx));
  }
  return damage - reduction;
}

function applyDamage(a) {
  const batches = new Map();
  for (const h of a.pending) {
    if (h.projectile?.cancelled) continue;
    const { target, source } = h;
    const raw = source ? source.atk * h.power * advantage(source.element, target.element) : h.power;
    h.value = source ? defend(a, h, raw) : raw;
    if (h.status) dot(target, source, h.status, a.tick, h.attackId);
    if (h.push) { target.vx += h.nx * h.push / target.cl.mass; target.vy += h.ny * h.push / target.cl.mass; }
    if (h.wall) target.wallHit = { source, until: a.tick + source.cl.wallTicks, attackId: h.attackId };
    if (!batches.has(target)) batches.set(target, []);
    batches.get(target).push(h);
  }
  for (const [target, hits] of batches) {
    const total = hits.reduce((sum, h) => sum + h.value, 0);
    const fraction = Math.min(1, target.hp / total);
    const bySource = new Map();
    for (const h of hits) {
      const amount = h.value * fraction;
      if (h.source) {
        h.source.damage += amount;
        h.source.effective += amount / target.maxHp;
        bySource.set(h.source, (bySource.get(h.source) ?? 0) + amount);
      }
      emit(a, 'hit', h.kind, h.source, target, h.x, h.y, {
        nx: round(h.nx), ny: round(h.ny), damage: round(amount), attackId: h.attackId,
        ...(h.fromX != null ? { fromX: h.fromX, fromY: h.fromY } : {}),
      });
    }
    target.hp = Math.max(0, target.hp - total); target.lastHit = a.tick;
    if (target.hp === 0) {
      const killer = [...bySource].sort((x, y) => y[1] - x[1] || x[0].tie - y[0].tie)[0]?.[0];
      if (killer) killer.kills++;
      target.elimTick = a.tick;
      emit(a, 'ko', 'ko', killer, target, target.x, target.y);
    }
  }
  a.pending.length = 0;
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
    if (sorted.length === 2 && (a.tick >= a.limitTicks || sorted.every(b => !b.alive))) {
      const [b, c] = sorted;
      const rule = Math.abs(b.hp / b.maxHp - c.hp / c.maxHp) > 1e-10 ? '잔여 체력 비율' :
        Math.abs(b.effective - c.effective) > 1e-10 ? '유효 피해 비율' : '경기 전 시드 추첨';
      a.reason += ' · ' + rule;
    }
  } else {
    const sorted = a.balls.filter(b => b.alive).sort(compare);
    sorted.forEach((b, i) => { b.rank = i && !compare(sorted[i - 1], b) ? sorted[i - 1].rank : i + 1; });
  }
  a.results = a.balls.map(b => ({ id: b.id, name: b.name, rank: b.rank, level: b.level, classId: b.classId,
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
  if (a.tick >= a.pressureTick && a.tick % 60 === 0) {
    const amount = 1 + (a.tick - a.pressureTick) / 70;
    for (const b of live) hit(a, null, b, 'pressure', amount, b, { reactive: true });
  }
  applyDamage(a);
  const left = live.filter(b => b.hp > 0).length;
  for (const b of live) if (b.hp === 0) { b.alive = false; b.rank = left + 1; }
  if (left <= 1) finish(a, left ? '마지막 생존' : '동시 탈락');
  else if (a.tick >= a.limitTicks) finish(a, '제한 시간 판정');
}

export function arenaSnapshot(a) {
  const objects = a.objects.map(o => ({ id: o.id, kind: o.kind, ownerId: o.owner.id, x: round(o.x), y: round(o.y), r: o.r }));
  const balls = a.balls.map(b => {
    if (b.alive) {
      for (const w of weapons(b)) objects.push({ id: w.id, kind: w.kind, ownerId: b.id, x: round(w.x), y: round(w.y), r: w.r });
      if (b.classId === 'tide' || b.classId === 'crystal') {
        objects.push({ id: b.id + '/shield', kind: b.classId === 'tide' ? 'shield' : 'crystal',
          ownerId: b.id, x: round(b.x), y: round(b.y), r: b.r + 4, angle: b.heading,
          ready: a.tick - b.blockedAt >= b.cl.blockCooldown });
      }
    }
    return { id: b.id, name: b.name, level: b.level, element: b.element, classId: b.classId,
      x: round(b.x), y: round(b.y), vx: round(b.vx), vy: round(b.vy), r: b.r, hp: round(b.hp), maxHp: b.maxHp,
      alive: b.alive, angle: round(b.angle), charge: b.charge, lastHit: b.lastHit,
      status: [...new Set([...b.dots.values()].map(d => d.kind))], dash: b.dashUntil >= a.tick,
    };
  });
  return { id: a.id, mode: a.mode, width: a.width, height: a.height, inset: round(a.inset), tick: a.tick,
    limitTicks: a.limitTicks, pressure: a.tick >= a.pressureTick, balls, objects, events: a.events.filter(e => e.tick >= a.tick - 12),
    done: a.done, reason: a.reason };
}
