import { performance } from 'node:perf_hooks';
import { CLASSES, advantage } from '../packages/content/classes.js';
import { createArena, stepArena } from '../packages/sim/index.js';

// Use each seed twice with classes exchanged between the same two starting slots.
// A fixed level and a sampled set of seeds estimate balance rather than predicting a class's win rate.
const seeds = Number(process.argv[2] || 8);
if (!Number.isInteger(seeds) || seeds < 1 || seeds > 1000) throw Error('시드 수는 1~1000입니다.');
const classes = Object.values(CLASSES).filter(c => c.id !== 'basic');
const elements = ['fire', 'water', 'earth', 'nature', 'lightning'];
const build = (cl, id, i) => ({ id, name: cl.name, classId: cl.id, level: 15, element: cl.hidden ? elements[i % 5] : cl.element });
const row = () => ({ wins: 0, games: 0 });
const results = Object.fromEntries(classes.map(cl => [cl.id, { neutral: row(), strong: row(), weak: row() }]));
const matchups = [];
let timeouts = 0, games = 0, totalTicks = 0;
for (let i = 0; i < classes.length; i++) {
  for (let j = i + 1; j < classes.length; j++) {
    const pair = { a: classes[i].id, b: classes[j].id, winsA: 0, games: 0 };
    for (let n = 0; n < seeds; n++) {
      for (const swap of [false, true]) {
        const a = build(classes[i], 'A', i + n), b = build(classes[j], 'B', j + n);
        const arena = createArena(swap ? [b, a] : [a, b], { seed: n + '-' + i + '-' + j });
        while (!arena.done) stepArena(arena);
        const winner = arena.results[0].id;
        for (const [p, opponent] of [[a, b], [b, a]]) {
          const factor = advantage(p.element, opponent.element);
          const group = results[p.classId][factor > 1 ? 'strong' : factor < 1 ? 'weak' : 'neutral'];
          group.games++; if (p.id === winner) group.wins++;
        }
        games++; pair.games++; totalTicks += arena.tick;
        if (winner === a.id) pair.winsA++;
        if (arena.tick >= arena.limitTicks) timeouts++;
      }
    }
    matchups.push(pair);
  }
}
function profile(n, instances) {
  const samples = [];
  const entries = Array.from({ length: n }, (_, i) => build(classes[i % classes.length], String(i), i));
  const arenas = Array.from({ length: instances }, (_, i) => createArena(entries, { seed: i, mode: n === 2 ? 'duel' : 'rumble' }));
  for (let i = 0; i < 5400; i++) {
    for (let j = 0; j < arenas.length; j++) if (arenas[j].done)
      arenas[j] = createArena(entries, { seed: j + i, mode: n === 2 ? 'duel' : 'rumble' });
    const start = performance.now();
    for (const a of arenas) stepArena(a);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const pct = p => +samples[Math.floor((samples.length - 1) * p)].toFixed(4);
  return { ticks: samples.length, p95ms: pct(.95), p99ms: pct(.99), maxMs: pct(1) };
}
console.log(JSON.stringify({ seeds, level: 15, games, timeouts, meanSeconds: +(totalTicks / games / 60).toFixed(2),
  winRates: results, matchups, performance: { fourDuels: profile(2, 4), thirtyRumble: profile(30, 1) } }, null, 2));
