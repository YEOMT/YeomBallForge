import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, COMBAT, advantage } from '../packages/content/classes.js';
import { createArena, stepArena, arenaSnapshot, createCompetition, stepCompetition, competitionSnapshot } from '../packages/sim/index.js';

const ids = Object.keys(CLASSES);
const builds = n => Array.from({ length: n }, (_, i) => ({
  id: 'p' + i, name: '참가자' + i, level: 14, classId: ids[i % ids.length], element: CLASSES[ids[i % ids.length]].element,
}));
const finish = (c, step) => { while (!c.done) step(c); return c; };
const makeDuel = (a, b) => createArena([{ ...builds(1)[0], classId: a, id: 'a' }, { ...builds(1)[0], classId: b, id: 'b' }], { seed: 30 });
function pose(b, x, y, vx, vy) { Object.assign(b, { x, y, px: x, py: y, vx, vy }); }

test('class metadata matches active rules and elemental modifiers', () => {
  assert.equal(ids.length, 14);
  assert.equal(Object.values(CLASSES).filter(c => c.hidden).length, 3);
  for (const c of Object.values(CLASSES)) assert.ok(c.description && c.trigger && c.weakness && c.speed && c.mass);
  assert.equal(advantage('fire', 'nature'), 1.2);
  assert.equal(advantage('nature', 'fire'), .85);
  assert.equal(advantage('neutral', 'fire'), 1);
  assert.equal(advantage('lightning', 'fire'), 1);
});

test('a replay produces identical snapshots regardless of presentation sampling', () => {
  const a = createArena(builds(30), { mode: 'rumble', seed: '교실' }), b = createArena(builds(30), { mode: 'rumble', seed: '교실' });
  for (let i = 0; !a.done; i++) {
    stepArena(a); stepArena(b);
    if (i % 2 === 0) arenaSnapshot(b);
    assert.ok(a.objects.filter(o => !o.field).length <= COMBAT.projectileLimit);
    assert.ok(a.objects.filter(o => o.field).length <= COMBAT.fieldLimit);
    assert.ok(a.events.length <= COMBAT.eventBuffer);
  }
  assert.deepEqual(arenaSnapshot(a), arenaSnapshot(b));
  assert.deepEqual(a.results, b.results);
  assert.equal(a.results.length, 30);
});

test('head-on contacts resolve reciprocal hits and simultaneous duel KOs via seed', () => {
  const a = makeDuel('basic', 'basic');
  pose(a.balls[0], 90, 90, 170, 0); pose(a.balls[1], 116, 90, -170, 0);
  for (const b of a.balls) b.hp = 2;
  stepArena(a);
  assert.ok(a.done);
  assert.equal(a.results[0].id, a.balls.find(b => b.tie === 0).id);
  assert.match(a.reason, /시드/);
  assert.deepEqual(a.results.map(r => r.damage), [2, 2]);
  assert.equal(a.events.filter(e => e.type === 'ko').length, 2);
});

test('per-pair body cooldown survives sustained contacts, walls and overlap', () => {
  const a = makeDuel('basic', 'basic'), [p, q] = a.balls;
  for (let i = 0; i < 20; i++) {
    pose(p, 13, 13, -160, -160); pose(q, 13, 13, -100, -100);
    stepArena(a);
    for (const b of a.balls) assert.ok(b.x >= b.r && b.y >= b.r && Number.isFinite(b.vx));
  }
  assert.equal(a.events.filter(e => e.type === 'hit').length, 2);
  assert.equal(a.events.filter(e => e.kind === 'wallslam').length, 0);
});

test('mace sweep tags one subsequent wall impact and expires the attribution', () => {
  const a = makeDuel('mace', 'basic'), [m, t] = a.balls;
  pose(m, 230, 90, 0, 160); pose(t, 268, 90, 150, 0);
  m.angle = 0;
  stepArena(a);
  assert.ok(t.wallHit && t.wallHit.source === m);
  for (let i = 0; i < 10; i++) stepArena(a);
  assert.equal(a.events.filter(e => e.kind === 'wallslam').length, 1);
});

test('directional guard and shard ownership stop recursive reflections', () => {
  const a = makeDuel('crystal', 'crystal'), [p, q] = a.balls;
  pose(p, 120, 100, 170, 0); pose(q, 146, 100, -170, 0); stepArena(a);
  assert.equal(a.events.filter(e => e.type === 'block').length, 2);
  assert.equal(a.objects.filter(o => o.kind === 'shard' && o.reflected === 1).length, 2);
  for (let i = 0; i < 20; i++) stepArena(a);
  assert.equal(a.events.filter(e => e.type === 'block').length, 2);
});

test('a fast projectile intersects a target between endpoint samples', () => {
  const a = makeDuel('cannon', 'basic'), [owner, target] = a.balls;
  pose(owner, 30, 110, 0, -170); pose(target, 155, 100, 0, 170);
  a.objects.push({ id:'test', kind:'wave', owner, field:false, x:90,y:100,vx:7800,vy:0,
    born:0,expires:10,r:2,power:1,hit:new Set(),maxTargets:1,push:0,reflected:0 });
  stepArena(a);
  assert.equal(a.events.filter(e => e.kind === 'wave' && e.type === 'hit').length, 1);
});

test('rumble ties share elimination positions including a final simultaneous wipe', () => {
  for (const all of [true, false]) {
    const a = createArena(builds(3), { mode: 'rumble' });
    a.tick = a.pressureTick - 1;
    a.balls.forEach((b, i) => { b.hp = all || i < 2 ? .1 : b.hp; });
    stepArena(a);
    assert.ok(a.done);
    assert.deepEqual(a.results.map(p => p.rank), all ? [1,1,1] : [1,2,2]);
  }
});

test('timeout ranks use remaining HP ratio then effective damage and shared rumble ties', () => {
  const a = createArena(builds(3), { mode: 'rumble' });
  a.tick = a.limitTicks - 1;
  a.balls[0].effective = .4;
  stepArena(a);
  assert.match(a.reason, /제한 시간/);
  assert.deepEqual(a.results.map(p => p.rank), [1,2,2]);
});

test('magnet finds a duel target and never chains to an enemy twice', () => {
  const a = createArena(builds(5), { mode:'rumble' });
  const m = a.balls[0];
  m.cl = CLASSES.magnet; m.classId = 'magnet'; m.next = 0;
  a.balls.forEach((b, i) => pose(b, 50 + 43 * i, 100, 0, 160));
  stepArena(a);
  const hits = a.events.filter(e => e.kind === 'arc');
  assert.equal(hits.length, 3);
  assert.equal(new Set(hits.map(h => h.targetId)).size, 3);
  assert.ok(hits[0].damage > hits[1].damage && hits[1].damage > hits[2].damage);
});

test('staggered tournament bracket uses first-round byes and at most four real arenas', () => {
  for (const n of [2,3,16,29,30]) {
    const c = createCompetition(builds(n), 'tournament', 391, 'test' + n);
    const size = 2 ** Math.ceil(Math.log2(n));
    assert.equal(c.roundSize, size);
    assert.equal(c.bracket.filter(m => m.bye).length, size - n);
    assert.ok(c.bracket.filter(m => m.round === 1).every(m => m.ids.length > 0));
    const focus = c.active[0].id;
    assert.equal(competitionSnapshot(c, focus).arenas.length, 1);
    assert.equal(competitionSnapshot(c, null).arenas.length, 0);
    while (!c.done) { assert.ok(c.active.length <= 4); stepCompetition(c); }
    assert.equal(c.bracket.filter(m => m.done && !m.bye).length, n - 1);
    assert.equal(c.results.tournament.filter(p => p.rank === 1).length, 1);
    assert.equal(c.results.tournament.reduce((sum, p) => sum + p.wins, 0), n - 1);
  }
});

test('combined mode restores every locked build without carrying duel state', () => {
  const p = builds(7), c = createCompetition(p, 'combined', 99, 'run1');
  p[0].level = 20;
  while (c.stage !== 'rumble') stepCompetition(c);
  assert.ok(c.results.tournament.length);
  const a = c.active[0];
  assert.notEqual(a.id, c.bracket[0].id);
  assert.equal(a.balls[0].level, 14);
  assert.ok(a.balls.every(b => b.hp === b.maxHp && b.alive && !b.charge && !b.damage && !b.dots.size));
  assert.equal(a.objects.length, 0);
  finish(c, stepCompetition);
  assert.equal(c.results.rumble.length, 7);
  assert.ok(createCompetition(builds(1), 'combined').done);
});

test('every class produces its own authoritative hit in a duel and in a full rumble', () => {
  const skills = { crimson:'blaze', ring:'blade', tide:'surge', cannon:'wave', bolt:'dash',
    magnet:'arc', mace:'mace', crystal:'shard', thorn:'poison', seed:'bloom', prism:'prism',
    gravity:'collapse', hourglass:'echo' };
  function collect(a, expected, seen) {
    let seq = 0;
    while (!a.done) {
      stepArena(a);
      if (a.seq === seq) continue;
      for (let i = a.events.length - 1; i >= 0 && a.events[i].seq > seq; i--) {
        const e = a.events[i], b = a.index.get(e.sourceId);
        if (b && e.type === 'hit' && expected[b.classId] === e.kind) seen.add(b.classId);
      }
      seq = a.seq;
    }
  }
  for (const id of Object.keys(skills)) {
    const found = new Set();
    for (let seed = 0; seed < 12 && !found.has(id); seed++) {
      const players = builds(2);
      players[0].classId = id;
      collect(createArena(players,{seed}),skills,found);
    }
    assert.ok(found.has(id), id + ' duel');
  }
  const found = new Set();
  for (let seed = 0; seed < 12 && found.size < 13; seed++) {
    const arena = createArena(builds(30),{mode:'rumble',seed});
    for (const b of arena.balls) for (const c of arena.balls) {
      if (b !== c) assert.ok(Math.hypot(b.x-c.x,b.y-c.y) >= b.r + c.r);
    }
    collect(arena,skills,found);
  }
  assert.deepEqual([...found].sort(), Object.keys(skills).sort());
});

test('last poison tick and reciprocal burn can KO both owners with no reactive loop', () => {
  const a = makeDuel('crimson','thorn'), [p,q] = a.balls;
  pose(p, 30, 30, 140, 90); pose(q, 240, 180, -140, -90);
  p.hp = q.hp = 1;
  p.dots.set('poison',{owner:q, kind:'poison', next:1, end:1, power:.2, stacks:1, attackId:'tox'});
  q.dots.set('burn',{owner:p, kind:'burn', next:1, end:1, power:.2, stacks:1, attackId:'hot'});
  stepArena(a);
  assert.ok(a.done && !p.alive && !q.alive);
  assert.deepEqual(a.events.filter(e=>e.type==='hit').map(e=>e.attackId),['tox','hot']);
  assert.equal(a.events.filter(e=>e.type==='ko').length,2);
});
