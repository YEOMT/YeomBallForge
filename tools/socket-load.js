// Real WebSocket clients and the server share one Node process on loopback.
// Live windows use the normal server clock. Completion accelerates only the
// real runner's tick input, outside measured windows, and waits for every client
// to receive RESULTS before rematching. This is not a school-network benchmark.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { platform, release, arch, cpus } from 'node:os';
import { createGameServer } from '../apps/server/index.js';
import { TestPeer } from './ws-client.js';
import { BASE_TICKETS, TICKETS_PER_CORRECT, MAX_LEVEL, AWAKENING_LEVEL } from '../packages/content/economy.js';
import { PATHS, getBallChoices } from '../packages/content/balls.js';
import { RULESET_VERSION } from '../packages/sim/index.js';

const app = createGameServer({ password: 'load-test-only', production: false, origins: [] });
app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
const url = 'ws://127.0.0.1:' + app.server.address().port + '/ws';
const peers = [], identities = [], records = [], runs = new Set();
const startedAt = new Date().toISOString(), wholeStart = performance.now();
const round = n => Math.round(n * 100) / 100;
const pct = (values, f) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * f) - 1];
const heapMiB = () => { global.gc?.(); return round(process.memoryUsage().heapUsed / 1048576); };
const emptyAudit = () => ({ issues: [], ownMatchFrames: 0, personalFrames: 0, privateStates: 0,
  personalLastAt: null, personalGaps: [] });
function instrument(peer, role) {
  peer.audit = emptyAudit();
  const original = peer.receive;
  peer.receive = function(raw) {
    const priorFrames = this.frames, priorState = this.state;
    original.call(this, raw);
    const check = (condition, message) => {
      if (!condition && this.audit.issues.length < 12) this.audit.issues.push(message);
    };
    const inspect = (frame, isState) => {
      if (!frame) return;
      check(frame.arenas.length <= 1, role + ' received multiple arenas');
      if (role !== 'student') return;
      if (frame.stage === 'rumble') {
        check(frame.arenas.length === 0 && frame.matches.length === 0 && frame.bracket.length === 0,
          'student rumble packet exposed arena or bracket data');
        check(frame.personal?.id === this.state?.me.id, 'student received another player personal summary');
        check(frame.results.rumble.every(row => row.id === this.state?.me.id), 'student received another rumble result');
        if (isState) this.audit.privateStates++;
        else {
          this.audit.personalFrames++;
          const now = performance.now();
          if (this.audit.personalLastAt !== null) this.audit.personalGaps.push(now - this.audit.personalLastAt);
          this.audit.personalLastAt = now;
        }
      } else if (!isState) {
        const own = frame.matches.find(match => match.ids.includes(this.state?.me.id));
        if (own) {
          check(frame.arenas.length === 1 && frame.arenas[0].id === own.id,
            'student with an active own match received another arena');
          this.audit.ownMatchFrames++;
        }
      }
    };
    if (this.frames !== priorFrames) inspect(this.lastFrame, false);
    if (this.state !== priorState) inspect(this.state.room.battle, true);
  };
  return peer;
}
const teacher = instrument(await TestPeer.connect(url), 'teacher');
async function allPhase(phase, timeout = 4000) {
  await Promise.all([teacher, ...peers].map(p => p.until(c => c.state?.room.phase === phase, timeout)));
}
function auditClean(group, context) {
  const issues = group.flatMap(p => p.audit.issues);
  assert.deepEqual(issues, [], context + ': packet routing');
}
function verifyResults(room, mode) {
  const expectedIds = [...room.students.keys()].sort();
  const results = teacher.state.room.results;
  const required = mode === 'combined' ? ['tournament', 'rumble'] : [mode];
  for (const kind of required) {
    assert.deepEqual(results[kind].map(row => row.id).sort(), expectedIds, kind + ': all 30 results');
    assert.ok(results[kind].every(row => Number.isInteger(row.rank) && row.rank >= 1 && row.rank <= 30));
    assert.ok(results[kind].some(row => row.rank === 1));
  }
  if (required.includes('rumble')) {
    for (const p of peers) {
      const ownRows = p.state.room.results.rumble;
      assert.equal(ownRows.length, 1, 'student receives one rumble result');
      const own = results.rumble.find(row => row.id === p.state.me.id);
      assert.equal(ownRows[0].id, own.id);
      const personal = p.state.room.battle.personal;
      for (const field of ['rank', 'killedById', 'killedByName', 'cause']) {
        assert.ok(Object.hasOwn(own, field), 'result includes ' + field);
        assert.equal(ownRows[0][field], own[field]);
        assert.equal(personal[field], own[field], 'personal summary matches final ' + field);
      }
      assert.ok(own.killedById === null || expectedIds.includes(own.killedById));
      assert.equal(p.state.room.battle.arenas.length, 0);
    }
  }
  return { tournamentRows: results.tournament.length, rumbleRows: results.rumble.length,
    studentsReceivingResults: peers.length, personalRankAndKillerVerified: required.includes('rumble') };
}
async function completeWithRealRunner(room) {
  const original = room.tick;
  const begin = performance.now(), firstTick = room.competition.tick;
  let calls = 0;
  room.tick = function(now) {
    let changed = false;
    // The production runner still owns dirty-state notification and broadcasts.
    // Only its clock input is advanced; combat rules and step size are unchanged.
    for (let i = 0; i < 32 && this.phase === 'BATTLE'; i++) {
      changed = original.call(this, Math.max(now, this.lastTickAt + 250)) || changed;
      calls++;
    }
    return changed;
  };
  try { await allPhase('RESULTS', 30000); }
  finally { room.tick = original; }
  assert.equal(room.phase, 'RESULTS');
  assert.equal(room.competition.done, true);
  return { acceleratedTailWallMs: round(performance.now() - begin),
    simulatedTicksAfterLiveWindow: room.competition.tick - firstTick, acceleratedTickCalls: calls };
}

try {
  const host = await teacher.send('create', { password: 'load-test-only' });
  const room = app.rooms.get(host.code);
  await Promise.all(Array.from({ length: 30 }, async (_, i) => {
    const peer = instrument(await TestPeer.connect(url), 'student');
    identities[i] = await peer.send('join', { code: host.code, name: '참가자 ' + (i + 1) });
    peers[i] = peer;
  }));
  const overflow = await TestPeer.connect(url);
  await assert.rejects(overflow.send('join', { code: host.code, name: '추가 학생' }), /30명/);
  const overflowClosed = once(overflow.ws, 'close');
  overflow.disconnect(); await overflowClosed;
  await teacher.until(() => app.wss.clients.size === 31);
  await teacher.send('bank', { filename: '부하검증.txt', text: Array.from({ length: 8 }, (_, n) =>
    (n + 1) + ' 더하기 1은?|' + (n + 2) + '|백|천|만').join('\n') });
  const modes = ['tournament', 'rumble', 'combined', 'rumble'];
  const paths = Object.keys(PATHS);
  let reconnect = null;
  for (let cycle = 0; cycle < modes.length; cycle++) {
    const mode = modes[cycle];
    for (const p of [teacher, ...peers]) p.audit = emptyAudit();
    await teacher.send('settings', { mode, questionCount: 8, quizSeconds: 120, forgeSeconds: 120 });
    await teacher.send('start'); await allPhase('QUIZ');
    runs.add(room.runId);
    await Promise.all(peers.map(async p => {
      for (let i = 0; i < 8; i++) {
        const q = p.state.me.question;
        const a = q.answers.find(a => /^\d+$/.test(a.text));
        await p.send('answer', { questionId: q.id, attemptId: q.attemptId, answerId: a.id });
        await p.until(v => v.state.me.answered === i + 1);
      }
    }));
    await teacher.send('advance'); await allPhase('FORGE');
    await Promise.all(peers.map(async (p, i) => {
      assert.equal(p.state.me.tickets, BASE_TICKETS + 8 * TICKETS_PER_CORRECT);
      while (p.state.me.tickets > 0 && p.state.me.level < MAX_LEVEL) {
        const remaining = p.state.me.tickets - 1;
        await p.send('enhance');
        await p.until(v => v.state.me.tickets === remaining);
        if (p.state.me.pendingChoice) {
          if (p.state.me.level >= AWAKENING_LEVEL && !p.state.me.path) {
            await p.send('choosePath', { pathId: paths[i % paths.length] });
            await p.until(v => Boolean(v.state.me.path));
          }
          const choices = getBallChoices(p.state.me);
          assert.ok(choices.length >= 2, 'every pending promotion has legal choices');
          await p.send('chooseBall', { ballId: choices[i % choices.length].id });
          await p.until(v => !v.state.me.pendingChoice);
        }
      }
      await p.send('lock');
    }));
    await teacher.send('advance'); await teacher.send('advance'); await allPhase('BATTLE');
    if (cycle === 0) {
      const before = peers[0].state.me;
      const start = performance.now();
      peers[0].disconnect();
      peers[0] = instrument(await TestPeer.connect(url), 'student');
      await peers[0].send('resume', identities[0]);
      await peers[0].until(p => p.state?.room.phase === 'BATTLE' && p.lastFrame);
      for (const field of ['id', 'ballId', 'path', 'level', 'locked']) assert.equal(peers[0].state.me[field], before[field]);
      assert.equal(peers[0].state.me.locked, true);
      await teacher.until(() => app.wss.clients.size === 31);
      reconnect = { disconnectToResumeAndFrameMs: round(performance.now() - start), identityAndBuildPreserved: true };
    }
    const group = [teacher, ...peers];
    for (const p of group) {
      p.frames = 0; p.bytes = 0; p.maxArenas = 0;
      p.audit.personalLastAt = null; p.audit.personalGaps = [];
    }
    const receivedBefore = group.map(p => p.ws._socket.bytesRead);
    const times = [], rtt = [], original = room.tick;
    room.tick = function(now) {
      const start = performance.now(), before = this.competition.tick;
      const changed = original.call(this, now);
      if (this.competition.tick !== before) times.push(performance.now() - start);
      return changed;
    };
    const begin = performance.now();
    let selectedMatchesVerified = 0;
    try {
      for (let n = 0; n < 12; n++) {
        await delay(360);
        const match = room.competition.active[n % room.competition.active.length];
        const at = performance.now();
        await teacher.send('watch', { matchId: match.id });
        rtt.push(performance.now() - at);
        await teacher.until(p => p.lastFrame?.arenas.length === 1 && p.lastFrame.arenas[0].id === match.id);
        selectedMatchesVerified++;
      }
    } finally { room.tick = original; }
    const end = performance.now(), seconds = (end - begin) / 1000;
    assert.ok(times.length > 0 && teacher.frames > 0 && peers.every(p => p.frames > 0), JSON.stringify({
      cycle, mode, tickSamples: times.length, hostFrames: teacher.frames, studentFrames: peers.map(p => p.frames),
      phase: room.phase, stage: room.competition.stage,
    }));
    assert.ok(peers.every(p => p.maxArenas <= (mode === 'rumble' ? 0 : 1)));
    assert.equal(teacher.maxArenas, 1);
    let personalSummaryMaxGapMs = null;
    if (mode === 'rumble') {
      assert.ok(peers.every(p => p.frames >= 2), 'each rumble student receives multiple periodic summaries');
      assert.ok(peers.every(p => p.lastFrame.personal.id === p.state.me.id));
      personalSummaryMaxGapMs = round(Math.max(...peers.flatMap(p => [
        ...p.audit.personalGaps, end - p.audit.personalLastAt,
      ])));
      assert.ok(personalSummaryMaxGapMs < 2000, 'rumble summary must not silently miss successive intervals');
    }
    assert.equal(app.wss.clients.size, 31);
    auditClean(group, mode);
    const record = { cycle: cycle + 1, mode, liveStage: room.competition.stage, elapsedSeconds: round(seconds),
      serverTickBatchMs: { samples: times.length, p95: round(pct(times, .95)), p99: round(pct(times, .99)), max: round(Math.max(...times)) },
      hostWatchCommandRttP95Ms: round(pct(rtt, .95)), hostWatchSelectionsVerified: selectedMatchesVerified,
      teacherFramesPerSecond: round(teacher.frames / seconds),
      studentFramesInWindow: { min: Math.min(...peers.map(p => p.frames)), max: Math.max(...peers.map(p => p.frames)) },
      personalSummaryMaxGapMs,
      teacherWireKiBPerSecond: round((teacher.ws._socket.bytesRead - receivedBefore[0]) / seconds / 1024),
      meanStudentWireKiBPerSecond: round(peers.reduce((n, p, i) => n + p.ws._socket.bytesRead - receivedBefore[i + 1], 0) / 30 / seconds / 1024),
      activeConnections: app.wss.clients.size, hostMaxArenas: teacher.maxArenas,
      studentMaxArenas: Math.max(...peers.map(p => p.maxArenas)) };
    Object.assign(record, await completeWithRealRunner(room), verifyResults(room, mode));
    auditClean(group, mode + ' completion');
    record.routingAudit = { ownMatchFramesVerified: peers.reduce((sum, p) => sum + p.audit.ownMatchFrames, 0),
      privateRumbleFramesVerified: peers.reduce((sum, p) => sum + p.audit.personalFrames, 0),
      privateRumbleStatePacketsVerified: peers.reduce((sum, p) => sum + p.audit.privateStates, 0) };
    await teacher.send('rematch'); await allPhase('LOBBY');
    assert.equal(room.students.size, 30);
    assert.equal(room.competition, null);
    assert.ok([...room.students.values()].every(p => !p.build.locked && !p.questions.length && !p.seen.size && p.build.tickets === 0));
    record.rematchResetVerified = true;
    record.postRematchHeapMiB = heapMiB();
    records.push(record);
  }
  assert.equal(runs.size, 4);
  await teacher.send('close');
  assert.equal(app.rooms.size, 0);
  console.log(JSON.stringify({ schemaVersion: 2, status: 'passed', measuredAt: startedAt,
    environment: { node: process.version, platform: platform(), release: release(), arch: arch(),
      logicalCpus: cpus().length, exposedGc: Boolean(global.gc), rulesetVersion: RULESET_VERSION },
    transport: 'loopback WebSocket; server and test clients share one process',
    liveWindow: 'normal wall clock, 12 host watch commands roughly 360 ms apart per cycle',
    completion: 'accelerated clock inputs through the real server runner, excluded from live metrics',
    checks: { students: 30, activeConnections: 31, thirtyFirstStudentRejected: true,
      completedCycles: records.length, uniqueRunIds: runs.size, roomRemovedOnClose: true },
    reconnect, records, totalWallSeconds: round((performance.now() - wholeStart) / 1000),
    limitations: [
      'One local process and loopback do not represent school Wi-Fi, mobile rendering, TLS, WAN latency, packet loss or many concurrent rooms.',
      'Tick timings include combat runner work, not JSON serialization or socket transmission.',
      'Frame counts include immediate replies to host watch commands; wire bytes include state, acknowledgement and battle packets.',
      'Short live windows and four GC heap samples do not establish long-running capacity or absence of memory leaks.',
      'Combat completion was accelerated after live measurements; it is a correctness check, not a real-time completion benchmark.',
      'Enhancement draws and competition seeds are random, so repeated runs need not produce identical results.',
    ] }, null, 2));
} finally { await app.close(); }
