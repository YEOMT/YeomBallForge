import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter,once} from 'node:events';
import {deflateSync} from 'node:zlib';
import {output,createGameServer,REPLAY_OUTPUT_LIMITS} from '../apps/server/index.js';
import {RANKING_RULES} from '../apps/server/ranking.js';
import {TestPeer} from '../tools/ws-client.js';
import {createArena,stepArena,arenaSnapshot} from '../packages/sim/arena.js';
import {BALL_CATALOG} from '../packages/content/balls.js';

class PendingSocket extends EventEmitter {
  readyState=1;bufferedAmount=0;sent=[];closed=null;
  send(text,callback){const bytes=Buffer.byteLength(text);this.bufferedAmount+=bytes;this.sent.push({text,bytes,callback});}
  close(code,reason){this.closed={code,reason};this.readyState=3;this.emit('close');}
  finish(index=0){const item=this.sent[index];this.bufferedAmount=Math.max(0,this.bufferedAmount-item.bytes);item.callback?.();}
}
const replay=()=>({type:'ack',commandId:'replay-1',ok:true,data:{matchId:'match-1',frames:[],events:[],summary:{notes:'x'.repeat(1_133_000)}}});

test('one legitimate replay awaiting compression does not close the following command ACK',()=>{
  const ws=new PendingSocket();
  output(ws,replay(),false,true);
  assert.ok(ws.bufferedAmount>1024*1024);
  output(ws,{type:'ack',commandId:'forge-ack',ok:true,data:{}});
  assert.equal(ws.closed,null);
  assert.equal(ws.sent.length,2);
  ws.finish(0);ws.finish(1);
});

test('live frames still drop at 256 KiB while a bounded replay is pending',()=>{
  const ws=new PendingSocket();output(ws,replay(),false,true);
  assert.equal(output(ws,{type:'battle'},true),false);assert.equal(ws.sent.length,1);assert.equal(ws.closed,null);ws.finish();
  const ordinary=new PendingSocket();ordinary.bufferedAmount=256*1024+1;
  assert.equal(output(ordinary,{type:'battle'},true),false);assert.equal(ordinary.sent.length,0);
});

test('replay allowance never hides 1 MiB of unrelated queued output',()=>{
  const ws=new PendingSocket();output(ws,replay(),false,true);
  ws.bufferedAmount+=1024*1024+1;
  output(ws,{type:'state'});assert.equal(ws.closed?.code,1013);
  const compressed=new PendingSocket();output(compressed,replay(),false,true);
  // Compression can shrink bufferedAmount before the replay callback fires.
  // Count other pending writes independently of the unused replay allowance.
  compressed.bufferedAmount=0;output(compressed,'x'.repeat(600*1024));
  compressed.bufferedAmount=0;output(compressed,'y'.repeat(600*1024));
  assert.equal(compressed.closed?.code,1013);assert.equal(compressed.sent.length,2);
  const ordinary=new PendingSocket();ordinary.bufferedAmount=1024*1024+1;
  output(ordinary,{type:'ack'});assert.equal(ordinary.closed?.code,1013);
});

test('only one replay can be pending and its byte and archive shape limits are enforced',()=>{
  const ws=new PendingSocket();output(ws,replay(),false,true);
  assert.throws(()=>output(ws,replay(),false,true),/전송 중/);assert.equal(ws.sent.length,1);
  ws.finish();assert.equal(output(ws,replay(),false,true),true);ws.finish(1);
  const large=replay();large.data.summary.notes='x'.repeat(REPLAY_OUTPUT_LIMITS.maxBytes);
  assert.throws(()=>output(ws,large,false,true),/상한/);
  const excessive=replay();excessive.data.frames=Array(403).fill({});
  assert.throws(()=>output(ws,excessive,false,true),/상한/);
  assert.throws(()=>output(ws,{type:'state',data:{}},false,true),/상한/);
  assert.equal(ws.sent.length,2);assert.equal(ws.closed,null);
});

test('stalled replay allowance expires and closing the socket clears its timer',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const ws=new PendingSocket();output(ws,replay(),false,true);
  t.mock.timers.tick(REPLAY_OUTPUT_LIMITS.timeoutMs-1);assert.equal(ws.closed,null);
  t.mock.timers.tick(1);assert.deepEqual(ws.closed,{code:1013,reason:'replay send timeout'});
  const closed=new PendingSocket();output(closed,replay(),false,true);closed.close(1000,'finished');
  t.mock.timers.tick(REPLAY_OUTPUT_LIMITS.timeoutMs);assert.deepEqual(closed.closed,{code:1000,reason:'finished'});
});

test('send failure clears replay allowance instead of retaining a pending payload',()=>{
  const ws=new PendingSocket();output(ws,replay(),false,true);ws.sent[0].callback(new Error('failed'));
  assert.deepEqual(ws.closed,{code:1011,reason:'send failed'});
});

test('real compressed replay and following forge ACK arrive, parallel replay is rejected before archive inflation',async t=>{
  const app=createGameServer({password:'replay-test-secret',production:false,origins:[]});
  t.after(()=>app.close());app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
  const url='ws://127.0.0.1:'+app.server.address().port+'/ws';
  const teacher=await TestPeer.connect(url),student=await TestPeer.connect(url);
  const host=await teacher.send('create',{password:'replay-test-secret'});await teacher.until(p=>p.state);
  const identity=await student.send('join',{code:host.code,name:'리플레이 검증'});await student.until(p=>p.state);
  await teacher.send('start');await student.until(p=>p.state.room.phase==='ACTIVE');
  const room=app.rooms.get(host.code),member=room.students.get(identity.playerId),ranking=room.ranking;
  // Bounded archive fixture using the real two-fighter snapshot schema. This
  // tests transport/authorization, not a claim about simulated match outcomes.
  const builds=['morph','cards'].map((classId,i)=>{const form=BALL_CATALOG.find(x=>x.classId===classId&&x.tier===1);return {id:i? 'opponent':member.id,name:'검증 '+i,classId,ballId:form.id,level:form.level};});
  const arena=createArena(builds,{id:'large-replay',seed:2210}),frame=arenaSnapshot(arena);frame.events=[];
  while(!arena.events.some(e=>e.type==='hit')&&!arena.done)stepArena(arena);
  const example=arena.events.find(e=>e.type==='hit');assert.ok(example);
  const record={matchId:'large-replay',snapshot:{participants:builds.map(b=>b.id),frozenBuilds:builds,rulesetVersion:'2.2.0'},
    frames:Array.from({length:401},(_,i)=>({...frame,tick:i*6})),
    events:Array.from({length:1200},(_,i)=>({...example,seq:i+1,eventId:'fixture:'+i,rootAttackId:'fixture:'+i,tick:i*2})),
    finalHash:'transport-fixture',summary:{matchId:'large-replay',status:'complete'}};
  const text=JSON.stringify(record),bytes=Buffer.byteLength(text);
  assert.ok(bytes>1024*1024&&bytes<RANKING_RULES.maxRecordBytes,'bounded archive fixture spans the old stale threshold: '+bytes);
  t.diagnostic('Archive fixture: '+bytes+' bytes; compressed replay delivery and subsequent forge ACK verified.');
  ranking.records.set(record.matchId,{bytes:deflateSync(text),summary:record.summary});member.recentMatches=[record.matchId];
  const forge=await student.send('enhance');await new Promise(resolve=>setTimeout(resolve,310));
  let inflated=0,finishReplay;
  const originalReplay=ranking.replay.bind(ranking);ranking.replay=(...args)=>{inflated++;return originalReplay(...args);};
  const socket=member.socket,send=socket.send.bind(socket);
  socket.send=(payload,callback)=>{
    const parsed=JSON.parse(payload);
    if(parsed.type==='ack'&&parsed.ok&&parsed.data?.matchId===record.matchId)send(payload,error=>{assert.ifError(error);finishReplay=()=>callback();});
    else send(payload,callback);
  };
  const received=await student.send('replay',{matchId:record.matchId},'replay-transport-a');
  assert.equal(received.frames.length,401);assert.equal(received.finalHash,record.finalHash);
  await student.send('ackForge',{resultId:forge.resultId});
  await assert.rejects(student.send('replay',{matchId:record.matchId}),/전송 중/);
  assert.equal(inflated,1,'second archive is not inflated or retained');assert.equal(student.ws.readyState,1);
  assert.equal(member.seen.has('replay-transport-a'),false,'large read-only response is not retained in the command journal');
  finishReplay();await student.send('replay',{matchId:record.matchId});assert.equal(inflated,2);finishReplay();
  assert.ok(student.ws.extensions.includes('permessage-deflate'));
});
