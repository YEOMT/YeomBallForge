import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createGameServer} from '../apps/server/index.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href:'playwright');
const base=await import(pathToFileURL(path.resolve(process.env.V22_BASELINE||'../ballforge-v22-baseline','apps/server/index.js')).href);
const report={scope:'Sequential local headless Chromium, identical T5 builds/seed and settings, six seconds per 30-ball scene. Canvas CPU timing is wall-clock instrumentation, not a physical mobile FPS guarantee.',cases:[],errors:[]};
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
Object.assign(report,{node:process.version,platform:process.platform,browser:browser.version(),generatedAt:new Date().toISOString(),baselineSha:'cad650262eb44bff828c3b664b79b97cf74d5db1'});
try{
  for(const version of ['before','after']){
    const app=(version==='before'?base.createGameServer:createGameServer)({password:'perf-local',production:false});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
    try{for(const config of [{width:1440,height:900,low:false,reduced:false,skin:'hybrid'},{width:390,height:844,low:true,reduced:true,skin:'orb'},{width:844,height:390,low:false,reduced:true,skin:'portrait'}]){
      const page=await browser.newPage({viewport:{width:config.width,height:config.height}});page.on('pageerror',e=>report.errors.push(e.message));await page.goto('http://127.0.0.1:'+app.server.address().port);
      const metrics=await page.evaluate(async config=>{
        const [{ArenaView,renderDiagnostics},{createArena,stepArena,arenaSnapshot},{BALL_CATALOG},{NEW_PROFILES}]=await Promise.all([import('/arena.js'),import('/packages/sim/arena.js'),import('/packages/content/balls.js'),import('/packages/content/new-profiles.js')]);
        document.body.innerHTML='<canvas style="width:min(100%,960px);height:70vh;min-height:300px;display:block;margin:auto"></canvas>';
        const ids=[...NEW_PROFILES.map(p=>p.id),'mace','beam','frost','summoner','star','tide'];const builds=ids.map((id,i)=>{const form=BALL_CATALOG.find(b=>b.classId===id&&b.tier===5);return {...form,id:'render-'+i,name:id,ballId:form.id,level:15};});
        const arena=createArena(builds,{id:'render-perf',mode:'rumble',seed:210126}),view=new ArenaView(document.querySelector('canvas'),config);let last,frames=0,maxObjects=0,maxEffects=0,maxEvents=0;const cpu=[],raf=[];const original=view.frame.bind(view);
        view.frame=now=>{const start=performance.now();original(now);frames++;if(frames>20){cpu.push(performance.now()-start);if(last!=null)raf.push(now-last);}last=now;maxEffects=Math.max(maxEffects,view.fx.length);};
        const feed=()=>{for(let i=0;i<6;i++)stepArena(arena);const frame=arenaSnapshot(arena);maxObjects=Math.max(maxObjects,frame.objects.length);maxEvents=Math.max(maxEvents,frame.events.length);view.update(frame);};feed();const interval=setInterval(feed,100);await new Promise(r=>setTimeout(r,6500));clearInterval(interval);view.destroy();
        const percentile=(a,p)=>a.sort((x,y)=>x-y)[Math.floor((a.length-1)*p)]??0;return {cache:renderDiagnostics?.()??null,frames,renderCpuMedianMs:percentile(cpu,.5),renderCpuP95Ms:percentile(cpu,.95),rafIntervalP95Ms:percentile(raf,.95),rafMedianMs:percentile(raf,.5),maxObjects,maxEffects,maxEvents,finalTick:arena.tick};
      },config);assert.ok(metrics.frames>10);assert.ok(metrics.maxEffects<=(config.low?24:96));report.cases.push({version,config,...metrics});console.log(JSON.stringify(report.cases.at(-1)));await page.close();
    }}finally{await app.close();}
  }
  assert.deepEqual(report.errors,[]);
}finally{await browser.close();await fs.mkdir('docs/evidence-v2.2/visual',{recursive:true});await fs.writeFile('docs/evidence-v2.2/visual/render-comparison.json',JSON.stringify(report,null,2));}
