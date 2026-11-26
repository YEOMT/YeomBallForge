// Assigned combat builds, real 31-client sockets and normal-clock traffic.
// Fast-forward completion happens only after the measured live window.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {monitorEventLoopDelay} from 'node:perf_hooks';
import {cpus,platform,release,arch,totalmem} from 'node:os';
import {writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const target=path.resolve(process.env.V22_TARGET_ROOT??'.'),load=p=>import(pathToFileURL(path.join(target,p)));
const {createGameServer}=await load('apps/server/index.js');
const {TestPeer}=await load('tools/ws-client.js');
const {BALL_CATALOG,getBallChoices,CONTENT_VERSION}=await load('packages/content/balls.js');
const {finalizeBuild}=await load('packages/content/forge.js');
const {compatibleTraits}=await load('packages/content/traits.js');
const {COMBAT}=await load('packages/content/classes.js');
const {createArena}=await load('packages/sim/index.js');

const app=createGameServer({password:'v21-load-only',production:false,origins:[]});
app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
const url='ws://127.0.0.1:'+app.server.address().port+'/ws',peers=[],audit=[],latencies=[];
const round=n=>Math.round(n*100)/100,percentile=(xs,p)=>[...xs].sort((a,b)=>a-b)[Math.min(xs.length-1,Math.floor(xs.length*p))]??0;
let teacher,room,logicalOffset=0;
try {
  teacher=await TestPeer.connect(url);const identity=await teacher.send('create',{password:'v21-load-only'});await teacher.until(p=>p.state);
  const states=[];
  for(let i=0;i<30;i++) {
    const peer=await TestPeer.connect(url);peers.push(peer);states.push({maxPacket:0,frames:0,wrong:0});
    peer.ws.on('message',raw=>{
      const packet=JSON.parse(raw),item=states[i];item.maxPacket=Math.max(item.maxPacket,raw.length);
      if(packet.type==='battle'&&packet.battle.arenas.length){item.frames++;if(packet.battle.arenas.length!==1||!packet.battle.arenas[0].balls.some(b=>b.id===peer.state?.me.id))item.wrong++;}
      if(packet.type==='state')for(const p of packet.room.players)if('tickets'in p||'inventory'in p||'quizLedger'in p||'token'in p)item.wrong++;
    });
    await peer.send('join',{code:identity.code,name:`부하${i+1}`});await peer.until(p=>p.state);
  }
  room=app.rooms.get(identity.code);await teacher.send('start');await peers[0].until(p=>p.state.room.phase==='ACTIVE');
  const ids=['mace','blade','tide','cannon','crimson','frost','summoner','star','reactor','returner','mason','thermal','decoy','mycelium','fracture'];
  for(const [i,p] of [...room.students.values()].entries()) {
    const form=BALL_CATALOG.find(b=>b.tier===5&&b.classId===ids[i%ids.length]);assert.ok(form);
    Object.assign(p.inventory.slots[0],{level:15,ballId:form.id,formId:form.id,classId:form.classId,profileId:form.classId,path:form.path??'fire',element:form.element,pendingChoice:false});
    finalizeBuild(p.inventory.slots[0]);await peers[i].send('createBall',{slotId:1});
  }
  const startMatch=room.ranking.startMatch.bind(room.ranking);let seedIndex=0;
  room.ranking.startMatch=(a,b)=>{startMatch(a,b);const m=room.ranking.active.get(a.currentMatch);m.seed=210126+seedIndex++;m.arena=createArena(m.builds,{id:m.id,seed:m.seed,mode:'duel',outcomePolicy:'ranking',limitTicks:2400});m.frames=[];m.events=[];m.lastSeq=0;m.rawBytes=8192;room.ranking.recordFrame(m);};
  for(const peer of peers)await peer.send('queue',{slotId:0});
  assert.equal(room.ranking.active.size,15);
  const assigned=[...room.ranking.active.values()].map(m=>({id:m.id,seed:m.seed,builds:m.builds}));
  const lag=monitorEventLoopDelay({resolution:10});lag.enable();const cpuStart=process.cpuUsage(),wallStart=performance.now(),heapStart=process.memoryUsage().heapUsed;
  let peakHeap=heapStart,peakRss=process.memoryUsage().rss;
  const sample=setInterval(()=>{peakHeap=Math.max(peakHeap,process.memoryUsage().heapUsed);peakRss=Math.max(peakRss,process.memoryUsage().rss);},50);
  const command=async(peer,type,fields)=>{const t=performance.now();await peer.send(type,fields);latencies.push(performance.now()-t);};
  const end=performance.now()+6000;
  while(performance.now()<end) {
    await Promise.all(peers.map(async peer=>{
      const p=room.students.get(peer.state.me.id),q=p.rankingQuestion;
      if(q)await command(peer,'answer',{questionId:q.id,attemptId:q.attemptId,answerId:q.correctAnswer.id});
      const b=p.inventory.slots[1],receipt=b.lastForge;
      if(receipt&&!receipt.acknowledged) {if(room.ranking.clockMs-receipt.createdAt>=300)await command(peer,'ackForge',{slotId:1,resultId:receipt.resultId});}
      else if(b.pendingChoice) {
        if(b.level>=10&&!b.path)await command(peer,'choosePath',{slotId:1,pathId:'fire',resultId:receipt.resultId});
        else await command(peer,'chooseBall',{slotId:1,ballId:getBallChoices(b)[0].id,resultId:receipt.resultId});
      } else if(b.hiddenOffer&&b.hiddenDecision===null)await command(peer,'hidden',{slotId:1,accept:false,resultId:receipt.resultId});
      else if(b.pendingTrait)await command(peer,'chooseTrait',{slotId:1,traitId:compatibleTraits(b)[0].id,resultId:receipt.resultId});
      else if(p.inventory.tickets>0&&b.level<19)await command(peer,'enhance',{slotId:1,protect:false});
    }));
    await delay(400);
  }
  clearInterval(sample);lag.disable();
  const elapsed=performance.now()-wallStart,cpu=process.cpuUsage(cpuStart);
  audit.push({mode:'ranking',clients:31,normalClockMs:round(elapsed),maxSimultaneous:room.ranking.metrics.maxActive,
    serverTickBatchMs:{p50:round(percentile(room.ranking.metrics.tickMs,.5)),p95:round(percentile(room.ranking.metrics.tickMs,.95)),max:round(Math.max(...room.ranking.metrics.tickMs))},
    ackMs:{count:latencies.length,p50:round(percentile(latencies,.5)),p95:round(percentile(latencies,.95)),max:round(Math.max(...latencies))},
    eventLoopMs:{p95:round(lag.percentile(95)/1e6),max:round(lag.max/1e6)},cpuOneCorePercent:round((cpu.user+cpu.system)/(elapsed*1000)*100),
    heapStartMiB:round(heapStart/1048576),heapPeakMiB:round(peakHeap/1048576),rssPeakMiB:round(peakRss/1048576),
    maxPacketBytes:Math.max(...states.map(s=>s.maxPacket)),totalFrames:states.reduce((n,s)=>n+s.frames,0),privacyErrors:states.reduce((n,s)=>n+s.wrong,0),
    largestRecordedFrameBytes:room.ranking.metrics.maxFrameBytes,assigned});
  assert.equal(audit[0].privacyErrors,0);assert.ok(states.every(s=>s.frames>0));
  // Resume a real socket during its frozen match; wallet/identity is unchanged.
  const first=[...room.students.values()][0],wallet=first.inventory.tickets;
  peers[0].disconnect();const resumed=await TestPeer.connect(url);peers.push(resumed);
  await resumed.send('resume',{code:room.code,token:first.token});await resumed.until(p=>p.state?.me.id===first.id);assert.equal(resumed.state.me.inventory.tickets,wallet);
  // Completion speed-up is excluded from CPU/latency figures above.
  for(let i=0;i<500&&room.ranking.active.size;i++)room.tick(room.ranking.lastAt+100);
  assert.equal(room.ranking.active.size,0);assert.ok([...room.students.values()].every(p=>p.recentMatches.length===1));
  const replay=await resumed.send('replay',{matchId:first.recentMatches[0]});assert.ok(replay.frames.at(-1).done);
  audit[0].replay={records:room.ranking.records.size,compressedBytes:room.ranking.recordBytes,frames:replay.frames.length,events:replay.events.length,roundTrip:true};
  // A separate 30-ball rumble stress snapshot uses common server competition,
  // with assigned summoners / fields / reflection, and private student packets.
  const ranking=room.ranking;ranking.finish();const previousRun=room.runId;await teacher.send('rematch');
  await teacher.until(p=>p.state.room.phase==='LOBBY'&&p.state.room.runId!==previousRun);
  await teacher.send('settings',{mode:'rumble'});
  await teacher.send('start');await teacher.send('advance');
  const worst=['summoner','decoy','mycelium','reactor','thermal','mason','storm','seed','crystal','star'];
  for(const [i,p] of [...room.students.values()].entries()) {
    const form=BALL_CATALOG.find(b=>b.tier===1&&b.classId===worst[i%worst.length]);Object.assign(p.build,{level:19,ballId:form.id,classId:form.classId,path:form.path??'fire',element:form.element,pendingChoice:false});finalizeBuild(p.build);
  }
  await teacher.send('advance');await teacher.send('advance');
  const rumbleStart=performance.now(),tickTimes=[];let maxObjects=0,maxEvents=0,maxSnapshot=0;
  for(let i=0;i<1200;i++) {
    const start=performance.now();room.tick(room.lastTickAt+100);tickTimes.push(performance.now()-start);
    const a=room.competition.active[0];maxObjects=Math.max(maxObjects,a.objects.length);maxEvents=Math.max(maxEvents,a.events.length);
    if(i%10===0)maxSnapshot=Math.max(maxSnapshot,Buffer.byteLength(JSON.stringify(room.frame(room.teacher))));
    for(const p of room.students.values()){const frame=room.frame(p);assert.equal(frame.arenas.length,0);assert.equal(frame.personal.id,p.id);}
    if(room.phase==='RESULTS')break;
  }
  audit.push({mode:'rumble',balls:30,simulationOnly:true,wallMs:round(performance.now()-rumbleStart),
    gameTicks:room.competition.active[0].tick,tickBatchMs:{p95:round(percentile(tickTimes,.95)),max:round(Math.max(...tickTimes))},maxObjects,maxEventBuffer:maxEvents,maxHostFrameBytes:maxSnapshot,studentPrivacy:true});
  const result={version:CONTENT_VERSION,generatedAt:new Date().toISOString(),combatTuning:{duelSeconds:COMBAT.duelSeconds,pressureSeconds:COMBAT.duelPressure,pressureBase:COMBAT.duelPressureBase,pressureGrowth:COMBAT.duelPressureGrowth},scope:'One Windows development PC, loopback, assigned builds. Not AWS or physical school-device performance.',
    environment:{node:process.version,os:`${platform()} ${release()} ${arch()}`,cpu:cpus()[0].model,logicalCpus:cpus().length,totalMemoryGiB:round(totalmem()/1073741824)},audit};
  const out=process.env.LOAD_OUT??'artifacts/v22-server-load.json';await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify(result,null,2));
  console.log(JSON.stringify({...result,audit:result.audit.map(({assigned,...r})=>r)},null,2));
} finally {for(const peer of peers)peer.disconnect();teacher?.disconnect();await app.close();}
