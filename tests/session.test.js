import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createGameServer } from '../apps/server/index.js';
import { TestPeer } from '../tools/ws-client.js';
import { Room } from '../apps/server/room.js';

// Legacy-mode regressions stay explicit now that ranking is the default.
function legacyRoom(...args) { const room=new Room(...args); room.settings.mode='combined'; return room; }

test('authoritative deadline boundary, duplicate handling and lock', () => {
  const r = legacyRoom('012345', 0), p = r.add('동명이인');
  const op = (who,type,id,at,extra) => r.dispatch(who,{ type, commandId:id, runId:r.runId,...extra },at);
  op(r.teacher,'start','a',0);
  const q = p.questions[0], fields = { questionId:q.id, attemptId:q.attemptId, answerId:q.correctAnswer.id };
  assert.equal(op(p,'answer','b',119999,fields).correct,true);
  assert.equal(op(p,'answer','b',120000,fields).correct,true);
  assert.equal(p.correct,1); assert.throws(() => op(p,'answer','c',120000,fields));
  r.tick(120000); assert.equal(p.build.tickets,12);
  const before = op(p,'enhance','d',120001);
  assert.deepEqual(op(p,'enhance','d',120002),before); assert.equal(p.build.tickets,11);
  op(p,'buyShield','e',120003); op(p,'buyShield','e',120004); assert.equal(p.build.shields,1);
  op(r.teacher,'pause','f',120005); r.tick(999999);
  assert.equal(r.phase,'FORGE'); assert.throws(() => op(p,'enhance','g',120006));
  op(r.teacher,'resumeGame','h',1000000); assert.equal(r.deadline,1119995);
  op(p,'ackForge','confirm',1000009,{resultId:before.resultId}); op(p,'lock','i',1000010); assert.throws(() => op(p,'enhance','j',1000011));
  r.tick(r.deadline); assert.equal(p.build.level,before.level); assert.equal(r.phase,'LOCKED');
});
test('real sockets restore roles, deny replay, protect teacher data, and keep the bank for three rematches', async t => {
  const app = createGameServer({ password:'test-secret', production:false, origins:[] });
  app.server.listen(0,'127.0.0.1'); await once(app.server,'listening');
  const url = 'ws://127.0.0.1:' + app.server.address().port + '/ws';
  t.after(() => app.close());
  let teacher = await TestPeer.connect(url), student = await TestPeer.connect(url);
  await assert.rejects(teacher.send('create',{ password:'bad' }), /비밀번호/);
  const host = await teacher.send('create',{ password:'test-secret' });
  await teacher.until(c => c.state);
  const identity = await student.send('join',{ code:host.code,name:'민준' });
  await student.until(c => c.state);
  const other = await TestPeer.connect(url);
  await other.send('join',{ code:host.code,name:'민준' });
  await other.until(c => c.state);
  assert.notEqual(identity.playerId,other.state.me.id);
  await assert.rejects(student.send('advance'),/교사/);
  await teacher.send('remove',{ playerId:other.state.me.id });
  await teacher.send('settings',{mode:'combined'});
  await teacher.send('bank',{filename:'우리반.txt',text:'고르기|사과|배|귤|감'});
  await assert.rejects(teacher.send('start'),/부족/);
  await teacher.send('settings',{questionCount:1,mode:'combined'});
  const runs = new Set();
  for (let n=0; n<4; n++) {
    await teacher.send('start');
    await student.until(c => c.state?.room.phase === 'QUIZ');
    const run = student.state.room.runId; runs.add(run);
    assert.equal(student.state.room.bank,undefined);
    assert.equal(student.state.room.players[0].correct,undefined);
    const q = student.state.me.question;
    assert.equal(q.correctAnswer,undefined);
    const answer = {questionId:q.id,attemptId:q.attemptId,answerId:q.answers.find(a=>a.text==='사과').id};
    await student.send('answer',answer,'retry');
    await student.send('answer',answer,'retry');
    await assert.rejects(student.send('answer',answer),/첫 제출/);
    await teacher.send('advance'); await student.until(c=>c.state.room.phase==='FORGE');
    assert.equal(student.state.me.tickets,12);
    await student.send('enhance',{},'hammer');
    if (n===0) {
      const old = student.ws;
      const replaced = once(old,'close');
      student = await TestPeer.connect(url); await student.send('resume',identity);
      await student.until(c=>c.state?.me.pendingForge?.commandId==='hammer');
      assert.equal((await replaced)[0],4001);
      teacher.disconnect();
      await student.send('enhance',{},'hammer');
      assert.equal(student.state.me.tickets,11);
      teacher = await TestPeer.connect(url);
      await teacher.send('resume',host); await teacher.until(c=>c.state?.me.role==='teacher');
      assert.equal(teacher.state.room.bank.filename,'우리반.txt');
      await assert.rejects(student.send('enhance',{connectionEpoch:1}),/이전 연결/);
    }
    await new Promise(resolve=>setTimeout(resolve,310));
    await student.send('ackForge',{resultId:student.state.me.pendingForge.resultId});
    await student.send('lock'); await assert.rejects(student.send('enhance'),/변경/);
    await teacher.send('advance'); await teacher.send('advance');
    await student.until(c=>c.state.room.phase==='RESULTS');
    assert.equal(student.state.room.results.rumble[0].id, identity.playerId);
    if (n < 3) {
      await teacher.send('rematch');
      await student.until(c=>c.state.room.phase==='LOBBY');
      assert.equal(student.state.me.tickets,0); assert.equal(student.state.me.level,0);
      await assert.rejects(student.send('enhance',{runId:run}),/이전 경기/);
    }
  }
  assert.equal(runs.size,4);
  const closed = once(student.ws,'close'); await teacher.send('close'); assert.equal((await closed)[0],4002);
  assert.equal(app.rooms.size,0);
});
test('production configuration requires teacher secret and a concrete HTTPS origin', () => {
  assert.throws(()=>createGameServer({production:true,password:'forge',origins:['https://school.test']}));
  assert.throws(()=>createGameServer({production:true,password:'long-test-only-secret',origins:[]}));
  assert.throws(()=>createGameServer({production:true,password:'long-test-only-secret',origins:['*']}));
});
test('late students wait for the next run and cannot change an ongoing battle', () => {
  const r = legacyRoom('012345',1000), first = r.add('먼저 참가');
  r.startQuiz(1000);
  const late = r.add('다음 판 참가');
  assert.equal(late.waiting,true);
  assert.deepEqual(r.active().map(p => p.id),[first.id]);
  r.advance(1100); assert.throws(() => r.dispatch(late,{type:'enhance',commandId:'a',runId:r.runId},1200));
  r.advance(1300); r.advance(1400); r.reset(1500);
  assert.deepEqual(r.active().map(p => p.id),[first.id,late.id]);
});
test('lineup publishes the seeded pairs and bye before the same unchanged competition starts', () => {
  const room = legacyRoom('123456',0);
  const students = ['가람','보라','초롱'].map(name => room.add(name));
  room.startQuiz(0);
  room.advance(100);
  room.advance(200);
  const { battle } = room.state(students[0],200).room;
  assert.equal(room.phase,'LOCKED');
  const opening = battle.bracket.filter(m => m.round === 1);
  assert.equal(opening.length,2);
  assert.equal(opening.filter(m => m.bye).length,1);
  assert.deepEqual(new Set(opening.flatMap(m => m.ids)),new Set(students.map(p => p.id)));
  room.tick(5199);
  assert.equal(room.competition.tick,0);
  assert.ok(room.competition.active.every(a => a.tick === 0));
  room.tick(5200);
  assert.equal(room.phase,'BATTLE');
  assert.equal(room.competition.battleId,battle.battleId);
  assert.deepEqual(room.state(students[0],5200).room.battle.bracket,battle.bracket);
  room.tick(5300);
  assert.equal(room.competition.tick,6);
});
test('real HTTP and WebSocket entry points serve QR and public content and enforce the configured origin', async t => {
  const app=createGameServer({production:true,password:'test-only-private',origins:['https://school.test']});
  app.server.listen(0,'127.0.0.1'); await once(app.server,'listening'); t.after(()=>app.close());
  const base='http://127.0.0.1:'+app.server.address().port;
  const qr=await fetch(base+'/api/qr?url='+encodeURIComponent('https://school.test/?code=012345'));
  assert.equal(qr.headers.get('content-type'),'image/png');
  assert.deepEqual([...new Uint8Array(await qr.arrayBuffer()).slice(0,4)],[137,80,78,71]);
  for (const file of ['/packages/content/economy.js','/packages/content/balls.js','/packages/content/forge.js','/packages/sim/random.js']) assert.equal((await fetch(base+file)).status,200);
  for (const file of ['/.env','/apps/server/quiz.js']) assert.equal((await fetch(base+file)).status,404);
  const url=base.replace('http','ws')+'/ws';
  const allowed=new WebSocket(url,{ origin:'https://school.test' }); await once(allowed,'open'); allowed.terminate();
  const other=new WebSocket(url,{ origin:'https://other.test' }); const [error]=await once(other,'error'); assert.match(error.message,/403/);
});

function battleRoom(mode, count = 8) {
  const room = legacyRoom('345678', 0);
  room.settings.mode = mode;
  const students = Array.from({length: count}, (_, i) => room.add('학생' + (i + 1)));
  room.startQuiz(0); room.advance(100); room.advance(200); room.advance(300);
  return {room, students};
}

test('host broadcasts one selected tournament while each student follows their own active match', () => {
  const {room, students} = battleRoom('tournament');
  const active = room.competition.active;
  assert.equal(active.length, 4);
  const host = room.teacher;
  assert.deepEqual(room.frame(host).arenas.map(a => a.id), [active[0].id]);
  room.dispatch(host, {type:'watch', matchId:active[3].id, commandId:'select', runId:room.runId}, 301);
  assert.deepEqual(room.frame(host).arenas.map(a => a.id), [active[3].id]);
  for (const student of students) {
    const own = active.find(a => a.balls.some(b => b.id === student.id));
    student.focus = active.find(a => a.id !== own.id).id;
    const frame = room.frame(student);
    assert.equal(frame.arenas.length, 1);
    assert.equal(frame.arenas[0].id, own.id);
  }
});
test('legacy host keeps the chosen final arena across waves until choosing the next match',()=>{
  const {room}=battleRoom('tournament',8),host=room.teacher,first=room.competition.active[0].id;
  assert.equal(host.focus,first);
  for(let i=0;i<700&&room.competition.active.some(a=>a.id===first);i++)room.tick(room.lastTickAt+100);
  assert.ok(!room.competition.active.some(a=>a.id===first));
  const retained=room.frame(host);assert.equal(retained.arenas[0].id,first);assert.equal(retained.arenas[0].done,true);
  assert.ok(retained.selectedResult);const next=room.competition.active[0].id;
  room.dispatch(host,{type:'watch',matchId:next,commandId:'next-cast',runId:room.runId},room.lastTickAt);
  assert.equal(room.frame(host).arenas[0].id,next);
});

test('rumble student frames contain only personal status and death attribution, including reconnect state', () => {
  const {room, students:[first, second]} = battleRoom('rumble', 2);
  const victim = room.competition.active[0].balls.find(b => b.id === first.id);
  Object.assign(victim, {hp:0, alive:false, rank:2, killedById:second.id, killedByName:second.name, cause:'beam'});
  const frame = room.frame(first);
  assert.deepEqual(frame.arenas, []);
  assert.deepEqual(frame.matches, []);
  assert.equal(frame.personal.id, first.id);
  assert.equal(frame.personal.rank, 2);
  assert.equal(frame.personal.killedByName, second.name);
  assert.equal(frame.personal.cause, 'beam');
  assert.equal(frame.personal.tier, 20);
  assert.equal(frame.personal.x, undefined);
  assert.equal(frame.personal.projectiles, undefined);
  assert.equal(room.frame(second).personal.id, second.id);
  assert.equal(room.frame(second).personal.killedById, null);
  assert.deepEqual(room.state(first, 400).room.battle, frame);
  assert.equal(room.frame(room.teacher).arenas.length, 1);
  assert.throws(() => room.dispatch(first, {type:'watch', matchId:null, commandId:'no-arena', runId:room.runId}, 401), /호스트/);
  room.competition.results.rumble = [
    {id:second.id, rank:1}, {id:first.id, rank:2, killedById:second.id, killedByName:second.name, cause:'beam'},
  ];
  assert.deepEqual(room.state(first, 500).room.results.rumble.map(r => r.id), [first.id]);
  assert.equal(room.state(room.teacher, 500).room.results.rumble.length, 2);
});

test('real rumble sockets never cross-cache personal identities or stream arena frames to students', async t => {
  const app = createGameServer({password:'classroom-test', production:false, origins:[]});
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  t.after(() => app.close());
  const url = 'ws://127.0.0.1:' + app.server.address().port + '/ws';
  const teacher = await TestPeer.connect(url);
  const identity = await teacher.send('create', {password:'classroom-test'});
  await teacher.until(p => p.state);
  const students = await Promise.all([TestPeer.connect(url), TestPeer.connect(url)]);
  const received = students.map(() => []);
  for (const [i, student] of students.entries()) {
    student.ws.on('message', raw => {
      const packet = JSON.parse(raw);
      if (packet.type === 'battle') received[i].push(packet.battle);
    });
    await student.send('join', {code:identity.code, name:'접속' + i});
    await student.until(p => p.state);
  }
  await teacher.send('settings', {mode:'rumble'});
  await teacher.send('start'); await teacher.send('advance');
  await teacher.send('advance'); await teacher.send('advance');
  await teacher.until(p => p.frames >= 8);
  for (const [i, student] of students.entries()) {
    await student.until(p => p.frames >= 2);
    assert.equal(student.maxArenas, 0);
    assert.ok(received[i].every(frame => frame.personal.id === student.state.me.id && frame.arenas.length === 0));
    assert.ok(student.frames < teacher.frames);
  }
  assert.equal(teacher.maxArenas, 1);
});
