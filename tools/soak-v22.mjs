import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {monitorEventLoopDelay} from 'node:perf_hooks';
import os from 'node:os';
import {sourceFingerprint} from './source-fingerprint.mjs';
const target=path.resolve(process.env.V22_TARGET_ROOT||'.'),load=p=>import(pathToFileURL(path.join(target,p)).href);
const [{createGameServer},{TestPeer},{BALL_CATALOG},{getBallChoices},{finalizeBuild},{compatibleTraits}]=await Promise.all([load('apps/server/index.js'),load('tools/ws-client.js'),load('packages/content/balls.js'),load('packages/content/balls.js'),load('packages/content/forge.js'),load('packages/content/traits.js')]);
const duration=Number(process.env.SOAK_MS||900000),out=process.env.SOAK_OUT||'artifacts/v22-soak.json';
const app=createGameServer({password:'local-soak-fixture',production:false,origins:[]});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
const url='ws://127.0.0.1:'+app.server.address().port+'/ws',peers=[],latencies=[],samples=[],errors=[],audit={privacy:0,reconnects:0,replays:0,pauses:0,commands:0,maxPacket:0};
let host,room;const pct=(a,p)=>[...a].sort((a,b)=>a-b)[Math.floor((a.length-1)*p)]??0;
audit.closed=[];
const command=async(peer,type,fields={})=>{const t=performance.now();let r;try{r=await peer.send(type,fields);}catch(e){throw new Error(`${e.message}; socketState=${peer.ws.readyState}; lastClose=${JSON.stringify(peer.lastClose??null)}`,{cause:e});}latencies.push(performance.now()-t);audit.commands++;return r;};
const observe=peer=>{peer.ws.on('close',(code,reason)=>{peer.lastClose={code,reason:reason.toString(),expected:Boolean(peer.expectedClose)};if(audit.closed.length<128)audit.closed.push(peer.lastClose);});peer.ws.on('message',raw=>{audit.maxPacket=Math.max(audit.maxPacket,raw.length);const m=JSON.parse(raw);if(m.type==='state'){if(m.room.ranking?.featured)audit.privacy++;for(const p of m.room.players)if(['tickets','inventory','quizLedger','token'].some(k=>k in p))audit.privacy++;}if(m.type==='battle'&&m.battle.arenas.some(a=>!a.balls.some(b=>b.id===peer.state?.me.id)))audit.privacy++;});};
const report={scope:'Real wall-clock local 31 sockets with assigned legal combat builds, shared server/client process. Server and simulation source fingerprint excludes browser-only public files. Not natural classroom or AWS. Concurrent development checks may affect timing; use the separate quiet serial load comparison.',source:await sourceFingerprint(target,{includePublic:false}),durationRequestedMs:duration,environment:{node:process.version,cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,totalMemoryGiB:os.totalmem()/2**30},audit,samples,errors};
const lag=monitorEventLoopDelay({resolution:20});let began,cpuStart;
try{
  host=await TestPeer.connect(url);const identity=await command(host,'create',{password:'local-soak-fixture'});await host.until(p=>p.state);
  await command(host,'settings',{sessionMinutes:30});
  for(let i=0;i<30;i++){const p=await TestPeer.connect(url);peers.push(p);observe(p);await command(p,'join',{code:identity.code,name:'장기검사'+(i+1)});await p.until(x=>x.state);}
  room=app.rooms.get(identity.code);await command(host,'start');await peers[0].until(p=>p.state.room.phase==='ACTIVE');
  const roster=['mace','trinity','tide','beam','bolt','frost','summoner','star','reactor','returner','mason','thermal','decoy','mycelium','fracture'];
  for(let i=0;i<peers.length;i++){const p=room.students.get(peers[i].state.me.id),f=BALL_CATALOG.find(x=>x.classId===roster[i%roster.length]&&x.tier===(i%4===0?1:5));Object.assign(p.inventory.slots[0],{level:20-f.tier,ballId:f.id,classId:f.classId,path:f.path??'fire',element:f.element,pendingChoice:false});finalizeBuild(p.inventory.slots[0]);await command(peers[i],'createBall',{slotId:1});}
  began=performance.now();cpuStart=process.cpuUsage();lag.enable();let iteration=0,nextSample=0,nextReconnect=60000,pauseDone=false;
  while(performance.now()-began<duration){
    await Promise.all(peers.map(async peer=>{
      const p=room.students.get(peer.state.me.id),q=p.rankingQuestion;
      if(!p.currentMatch&&!p.queue)await command(peer,'queue',{slotId:0});
      if(q&&iteration%3===0)await command(peer,'answer',{questionId:q.id,attemptId:q.attemptId,answerId:q.correctAnswer.id});
      const b=p.inventory.slots[1],r=b.lastForge,fields={slotId:1,resultId:r?.resultId};
      if(r&&!r.acknowledged){if(room.ranking.clockMs-r.createdAt>=300)await command(peer,'ackForge',fields);}
      else if(b.pendingChoice){if(b.level>=10&&!b.path)await command(peer,'choosePath',{...fields,pathId:'fire'});else await command(peer,'chooseBall',{...fields,ballId:getBallChoices(b)[0].id});}
      else if(b.hiddenOffer&&b.hiddenDecision===null)await command(peer,'hidden',{...fields,accept:false});
      else if(b.pendingTrait)await command(peer,'chooseTrait',{...fields,traitId:compatibleTraits(b)[0].id});
      else if(iteration%4===0&&p.inventory.tickets>0&&b.level<19)await command(peer,'enhance',{slotId:1,protect:false});
    }));
    const elapsed=performance.now()-began;
    if(iteration%20===0){const p=room.students.get(peers[0].state.me.id);if(p.recentMatches.length){const r=await command(peers[0],'replay',{matchId:p.recentMatches[0]});assert.ok(r.frames.length&&r.finalHash&&!r.unavailableReason);audit.replays++;}}
    if(elapsed>=nextReconnect){const i=Math.floor(elapsed/60000)%30,p=room.students.get(peers[i].state.me.id),wallet=p.inventory.tickets;peers[i].expectedClose=true;peers[i].disconnect();peers[i]=await TestPeer.connect(url);observe(peers[i]);await command(peers[i],'resume',{code:room.code,token:p.token});await peers[i].until(x=>x.state?.me.id===p.id);assert.equal(peers[i].state.me.inventory.tickets,wallet);audit.reconnects++;nextReconnect+=60000;}
    if(!pauseDone&&elapsed>=duration/2){const before=room.ranking.clockMs;await command(host,'pause');const paused=room.ranking.clockMs;await delay(2000);assert.equal(room.ranking.clockMs,paused);await command(host,'resumeGame');assert.ok(paused>=before);pauseDone=true;audit.pauses++;}
    if(elapsed>=nextSample){const m=process.memoryUsage();samples.push({wallMs:elapsed,logicalMs:room.ranking.clockMs,active:room.ranking.active.size,completed:room.ranking.completed.size,records:room.ranking.records.size,archiveBytes:room.ranking.recordBytes,heapMiB:m.heapUsed/2**20,rssMiB:m.rss/2**20});console.log('SOAK',Math.floor(elapsed/1000),'s',samples.at(-1).completed,'matches',Math.round(m.rss/2**20),'MiB');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(report,null,2));nextSample+=30000;}
    assert.equal(audit.privacy,0);assert.ok(room.ranking.recordBytes<=64*1024*1024);iteration++;await delay(1000);
  }
  const cpu=process.cpuUsage(cpuStart);report.wallMs=performance.now()-began;report.completedMatches=room.ranking.completed.size;report.maxActive=room.ranking.metrics.maxActive;report.cpuOneCorePercent=(cpu.user+cpu.system)/(report.wallMs*1000)*100;report.ack={p50:pct(latencies,.5),p95:pct(latencies,.95),max:Math.max(...latencies)};report.tickBatch={p95:pct(room.ranking.metrics.tickMs,.95),max:Math.max(...room.ranking.metrics.tickMs)};report.eventLoop={p95:lag.percentile(95)/1e6,max:lag.max/1e6};
  await command(host,'endSession');await host.until(p=>p.state.room.phase==='RESULTS',50000);const runId=room.runId;await command(host,'rematch');await host.until(p=>p.state.room.phase==='LOBBY');assert.notEqual(room.runId,runId);await command(host,'start');await peers[0].until(p=>p.state.room.phase==='ACTIVE');assert.equal(peers[0].state.me.inventory.tickets,10);assert.equal(peers[0].state.me.rating,1000);await command(peers[0],'queue',{slotId:0});await command(peers[1],'queue',{slotId:0});assert.equal(room.ranking.active.size,1);await command(host,'endSession');await host.until(p=>p.state.room.phase==='RESULTS',50000);
  assert.equal((await sourceFingerprint(target,{includePublic:false})).sha256,report.source.sha256,'server or simulation source changed during the measured soak');
  report.rematch=true;report.status='PASS';assert.ok(report.wallMs>=duration);assert.equal(audit.privacy,0);assert.equal(audit.closed.filter(c=>!c.expected).length,0,'unexpected WebSocket disconnection');
}catch(e){errors.push(e.stack);report.status='FAIL';console.error(e.stack);process.exitCode=1;}
finally{lag.disable();for(const p of peers){p.expectedClose=true;p.disconnect();}host?.disconnect();await app.close();await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(report,null,2));}
