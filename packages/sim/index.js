import { COMBAT } from '../content/classes.js';
import { createArena, stepArena, arenaSnapshot } from './arena.js';
import { randomStream, shuffled } from './random.js';

export { createArena, stepArena, arenaSnapshot };
export const RULESET_VERSION = 2;

function prepareBracket(c) {
  const players = shuffled(c.builds, c.random);
  const size = 2 ** Math.ceil(Math.log2(players.length));
  const byes = size - players.length;
  c.roundSize = size;
  // Spread empty slots among distinct first-round pairs. No pair contains two byes.
  const byePairs = new Set(Array.from({ length: byes }, (_, i) => Math.floor((i + .5) * (size / 2) / byes)));
  let cursor = 0;
  for (let round = 1, slots = size; slots >= 2; round++, slots /= 2) {
    for (let pair = 0; pair < slots / 2; pair++) {
      const ids = [];
      if (round === 1) {
        ids.push(players[cursor++].id);
        if (!byePairs.has(pair)) ids.push(players[cursor++].id);
      }
      const bye = round === 1 && ids.length === 1;
      c.bracket.push({ id: c.baseId + '/r' + round + 'm' + (pair + 1), round, roundSize: slots, pair, ids,
        done: bye, bye, winnerId: bye ? ids[0] : null, state: bye ? 'bye' : 'waiting', reason: bye ? '부전승' : '' });
    }
  }
}

function sumMatch(c, a, match) {
  const winner = a.results[0];
  match.done = true; match.state = 'done'; match.winnerId = winner.id; match.reason = a.reason;
  for (const row of a.results) {
    const total = c.totals.get(row.id);
    total.damage += row.damage; total.kills += row.kills; total.blocked += row.blocked;
    total.survived += row.survived;
    if (row.id === winner.id) { total.wins++; total.rank = 1; }
    else {
      total.rank = match.roundSize / 2 + 1; total.eliminatedBy = winner.id;
      total.killedById = row.killedById; total.killedByName = row.killedByName; total.cause = row.cause;
    }
  }
}

function startRumble(c) {
  c.stage = 'rumble'; c.battleId = c.baseId + '/rumble';
  c.roundSize = c.builds.length; c.round = 1;
  const a = createArena(c.builds, { id: c.battleId, mode: 'rumble', seed: c.random() });
  c.active = [a];
  if (a.done) { c.results.rumble = a.results; c.done = true; }
}

function advanceWave(c) {
  const round = c.bracket.filter(m => m.round === c.round);
  const waiting = round.filter(m => !m.done && m.state === 'waiting');
  if (waiting.length) {
    c.active = waiting.slice(0, COMBAT.concurrentDuels).map(m => {
      m.state = 'playing';
      return createArena(m.ids.map(id => c.byId.get(id)), {
        id: m.id, seed: c.random(), final: m.roundSize === 2,
      });
    });
    return;
  }
  if (c.roundSize > 2) {
    const nextRound = c.bracket.filter(m => m.round === c.round + 1);
    for (const m of nextRound) m.ids = [round[m.pair * 2].winnerId, round[m.pair * 2 + 1].winnerId];
    c.round++; c.roundSize /= 2;
    advanceWave(c);
  } else if (c.mode === 'combined') startRumble(c);
  else c.done = true;
}

export function createCompetition(builds, mode = 'tournament', seed = 1, battleId = 'battle-' + seed) {
  if (!builds.length || builds.length > 30 || new Set(builds.map(b => b.id)).size !== builds.length)
    throw new RangeError('서로 다른 참가자 1~30명이 필요합니다.');
  if (!['tournament', 'rumble', 'combined'].includes(mode)) throw new RangeError('알 수 없는 경기 모드입니다.');
  const frozen = builds.map(b => ({ id: b.id, name: b.name, level: b.level, classId: b.classId, element: b.element,
    ballId: b.ballId ?? null, path: b.path ?? null, tier: 20 - Math.max(0, Math.min(19, Number(b.level) || 0)) }));
  const c = {
    baseId: battleId, battleId: battleId + '/tournament', mode, stage: 'tournament', builds: frozen,
    byId: new Map(frozen.map(b => [b.id, b])), round: 1, roundSize: 1, active: [], bracket: [],
    totals: new Map(frozen.map(b => [b.id, { ...b, damage: 0, kills: 0, blocked: 0, survived: 0, wins: 0, rank: 1,
      killedById: null, killedByName: null, cause: null }])),
    results: { tournament: [], rumble: [] }, random: randomStream(seed), waitTicks: 0, tick: 0, done: false,
  };
  if (mode === 'rumble') startRumble(c);
  else if (frozen.length === 1) {
    c.results.tournament = [{ ...c.totals.get(frozen[0].id), reason: '단독 출전' }];
    if (mode === 'combined') startRumble(c); else c.done = true;
  } else {
    prepareBracket(c);
    advanceWave(c);
  }
  return c;
}

export function stepCompetition(c) {
  if (c.done) return;
  c.tick++;
  if (c.waitTicks > 0) {
    if (--c.waitTicks === 0) advanceWave(c);
    return;
  }
  for (const a of c.active) {
    if (a.done) continue;
    stepArena(a);
    if (a.done && c.stage === 'tournament') sumMatch(c, a, c.bracket.find(m => m.id === a.id));
  }
  if (c.active.some(a => !a.done)) return;
  if (c.stage === 'rumble') {
    c.results.rumble = c.active[0].results; c.done = true;
  } else {
    if (c.roundSize === 2) {
      const final = c.active[0];
      c.results.tournament = [...c.totals.values()].map(r => ({ ...r, damage: Math.round(r.damage * 10) / 10,
        reason: r.rank === 1 ? final.reason : '' })).sort((a, b) => a.rank - b.rank);
      if (c.mode !== 'combined') { c.done = true; return; }
    }
    c.waitTicks = COMBAT.intermissionSeconds * COMBAT.hz;
  }
}

export function competitionSnapshot(c, focus) {
  const selected = focus === undefined ? c.active : c.active.filter(a => a.id === focus);
  return { battleId: c.battleId, mode: c.mode, stage: c.stage, round: c.round, roundSize: c.roundSize,
    tick: c.tick, waitTicks: c.waitTicks, done: c.done,
    matches: c.active.map(a => ({ id: a.id, ids: a.balls.map(b => b.id), done: a.done })),
    bracket: c.bracket.map(m => ({ ...m, ids: [...m.ids] })), results: c.results, arenas: selected.map(arenaSnapshot) };
}
