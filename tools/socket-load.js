// Real clients and server share one Node process on loopback. Measure live frames first.
// After each window, advance the real runner's clock to exercise cleanup without waiting
// minutes between cycles. The accelerated tail is excluded from timings and throughput.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { createGameServer } from '../apps/server/index.js';
import { TestPeer } from './ws-client.js';
import { NORMAL_ELEMENTS } from '../packages/content/economy.js';

const app = createGameServer({ password: 'load-test-only', production: false, origins: [] });
app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
const url = 'ws://127.0.0.1:' + app.server.address().port + '/ws';
const teacher = await TestPeer.connect(url);
const peers = [];
const names = [], records = [], runs = new Set();
const round = n => Math.round(n * 100) / 100;
const pct = (values, f) => [...values].sort((a,b)=>a-b)[Math.ceil(values.length * f) - 1];
const heapMiB = () => { global.gc?.(); return round(process.memoryUsage().heapUsed / 1048576); };
async function allPhase(phase) {
  await Promise.all([teacher,...peers].map(p => p.until(c => c.state?.room.phase === phase)));
}
try {
  const host = await teacher.send('create', { password: 'load-test-only' });
  const room = app.rooms.get(host.code);
  await Promise.all(Array.from({ length: 30 }, async (_, i) => {
    const peer = await TestPeer.connect(url);
    const identity = await peer.send('join', { code:host.code,name:'참가자 ' + (i+1) });
    peers[i] = peer; names[i] = identity;
  }));
  const overflow = await TestPeer.connect(url);
  await assert.rejects(overflow.send('join',{code:host.code,name:'추가 학생'}), /30명/);
  overflow.disconnect();
  await teacher.send('bank',{filename:'부하검증.txt', text:Array.from({length:8},(_,n)=> (n+1) + ' 더하기 1은?|' + (n+2) + '|백|천|만').join('\n')});
  const modes = ['tournament','rumble','combined','rumble'];
  const classes = Object.keys(NORMAL_ELEMENTS);
  for (let cycle=0; cycle<modes.length; cycle++) {
    const mode = modes[cycle];
    await teacher.send('settings',{mode,questionCount:8,quizSeconds:120,forgeSeconds:120});
    await teacher.send('start'); await allPhase('QUIZ');
    runs.add(room.runId);
    await Promise.all(peers.map(async p => {
      for(let i=0;i<8;i++){
        const q=p.state.me.question;
        const a=q.answers.find(a=>/^\d+$/.test(a.text));
        await p.send('answer',{questionId:q.id,attemptId:q.attemptId,answerId:a.id});
        await p.until(v=>v.state.me.answered===i+1);
      }
    }));
    await teacher.send('advance'); await allPhase('FORGE');
    await Promise.all(peers.map(async(p,i)=>{
      assert.equal(p.state.me.tickets,16);
      for(let n=0; n<16; n++){
        const result=await p.send('enhance');
        if(result.level>=10){ await p.send('chooseClass',{classId:classes[i%classes.length]}); break; }
      }
      await p.send('lock');
    }));
    await teacher.send('advance'); await teacher.send('advance'); await allPhase('BATTLE');
    if (cycle===0) {
      const start=performance.now();
      peers[0].disconnect();
      peers[0]=await TestPeer.connect(url); await peers[0].send('resume',names[0]);
      await peers[0].until(peer=>peer.state?.room.phase==='BATTLE' && peer.lastFrame);
      assert.equal(peers[0].state.me.locked,true);
      records.push({ reconnectAndFrameMs: round(performance.now()-start) });
    }
    const group=[teacher,...peers];
    for(const p of group){ p.frames=0; p.bytes=0; p.maxArenas=0; }
    const receivedBefore=group.map(p=>p.ws._socket.bytesRead);
    const times=[], rtt=[], original=room.tick;
    room.tick=function(now) {
      const start=performance.now(), before=this.competition.tick;
      const changed=original.call(this,now);
      if(this.competition.tick!==before) times.push(performance.now()-start);
      return changed;
    };
    const begin=performance.now();
    const intervals = cycle < 2 ? 12 : 4;
    for(let n=0;n<intervals;n++){
      await delay(360);
      const at=performance.now();
      await peers[n].send('watch',{matchId:room.competition.active[0].id});
      rtt.push(performance.now()-at);
    }
    room.tick=original;
    const seconds=(performance.now()-begin)/1000;
    assert.ok(times.length>0 && teacher.frames>0 && peers.every(p=>p.frames>0));
    assert.ok(peers.every(p=>p.maxArenas<=1));
    assert.equal(teacher.maxArenas,mode==='rumble'?1:4);
    records.push({ mode, elapsedSeconds:round(seconds), serverTickBatchMs:{ samples:times.length,p95:round(pct(times,.95)),
      p99:round(pct(times,.99)),max:round(Math.max(...times)) }, commandRttP95Ms:round(pct(rtt,.95)),
      teacherFramesPerSecond:round(teacher.frames/seconds),
      teacherWireKiBPerSecond:round((teacher.ws._socket.bytesRead-receivedBefore[0])/seconds/1024),
      meanStudentWireKiBPerSecond:round(peers.reduce((n,p,i)=>n+p.ws._socket.bytesRead-receivedBefore[i+1],0)/30/seconds/1024),
      activeConnections:app.wss.clients.size });
    // The integration result uses exactly the same competition and 60 Hz tick as the real server.
    while(room.phase==='BATTLE') room.tick(room.lastTickAt + 250);
    await teacher.send('rematch'); await allPhase('LOBBY');
    assert.equal(room.students.size,30);
    assert.equal(room.competition,null);
    assert.ok([...room.students.values()].every(p=>!p.build.locked && !p.questions.length && !p.seen.size && p.build.tickets===0));
    records.at(-1).postRematchHeapMiB=heapMiB();
  }
  assert.equal(runs.size,4);
  await teacher.send('close');
  assert.equal(app.rooms.size,0);
  console.log(JSON.stringify({transport:'loopback WebSocket; server and test clients share one process',
    liveWindow:'normal wall clock', completion:'accelerated server clock after each measurement', records},null,2));
} finally { await app.close(); }
