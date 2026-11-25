import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createGameServer} from '../apps/server/index.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href:'playwright');
const app=createGameServer({password:'render-check-only',production:false});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
const result={scope:'Headless Chromium on development PC; viewport emulation, not physical device FPS or AWS capacity',cases:[],errors:[]};
try{
  for(const config of [{width:1440,height:900,low:false,reduced:false,skin:'hybrid'},{width:390,height:844,low:true,reduced:true,skin:'orb'},{width:844,height:390,low:false,reduced:true,skin:'portrait'}]){
    const page=await browser.newPage({viewport:{width:config.width,height:config.height}});page.on('pageerror',e=>result.errors.push(e.message));
    await page.goto('http://127.0.0.1:'+app.server.address().port);
    const measured=await page.evaluate(async config=>{
      const [{ArenaView},{createArena,stepArena,arenaSnapshot},{BALL_CATALOG},{NEW_PROFILES}]=await Promise.all([import('/arena.js'),import('/packages/sim/arena.js'),import('/packages/content/balls.js'),import('/packages/content/new-profiles.js')]);
      document.body.innerHTML='<canvas style="width:min(100%,960px);height:70vh;display:block;margin:auto"></canvas>';
      const ids=[...NEW_PROFILES.map(p=>p.id),'mace','beam','frost','summoner','star','tide'];
      const builds=ids.map((id,i)=>{const b=BALL_CATALOG.find(b=>b.classId===id&&b.tier===5);return {...b,id:'render-'+i,name:id,ballId:b.id,level:15};});
      const arena=createArena(builds,{id:'render',mode:'rumble',seed:210126}),view=new ArenaView(document.querySelector('canvas'),config);
      let interval,last,frames=0,maxObjects=0,maxEffects=0,maxEvents=0;const render=[],raf=[];const original=view.frame.bind(view);
      view.frame=now=>{const start=performance.now();original(now);frames++;if(frames>20){render.push(performance.now()-start);if(last!=null)raf.push(now-last);}last=now;maxEffects=Math.max(maxEffects,view.fx.length);};
      const feed=()=>{for(let i=0;i<6;i++)stepArena(arena);const f=arenaSnapshot(arena);maxObjects=Math.max(maxObjects,f.objects.length);maxEvents=Math.max(maxEvents,f.events.length);view.update(f);};
      feed();interval=setInterval(feed,100);await new Promise(r=>setTimeout(r,6500));clearInterval(interval);view.destroy();
      const percentile=(a,p)=>a.sort((x,y)=>x-y)[Math.floor((a.length-1)*p)]??0;
      return {frames,renderCpuP95Ms:percentile(render,.95),rafIntervalP95Ms:percentile(raf,.95),rafMedianMs:percentile(raf,.5),maxObjects,maxEffects,maxEvents,finalTick:arena.tick};
    },config);
    assert.ok(measured.frames>10);assert.ok(measured.maxEffects<=(config.low?24:96));result.cases.push({config,...measured});console.log(JSON.stringify(result.cases.at(-1)));await page.close();
  }
  assert.deepEqual(result.errors,[]);
}finally{await browser.close();await app.close();await fs.mkdir('docs/evidence-v2.1',{recursive:true});await fs.writeFile('docs/evidence-v2.1/render-load.json',JSON.stringify(result,null,2));}
