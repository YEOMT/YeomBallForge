import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createGameServer} from '../apps/server/index.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href:'playwright');
const out='docs/evidence-v2.2/visual';await fs.mkdir(out,{recursive:true});
const report={scope:'Local headless Chromium; actual ArenaView, legal same-tier builds, fixed seeds and recorded snapshots. Viewport emulation, not physical-device FPS. Audio graph exercised; human listening NOT RUN.',paired:[],viewports:[],coverage:[],errors:[]};
const baselinePath=process.env.V22_BASELINE||'../ballforge-v22-baseline';
const baseModule=await import(pathToFileURL(path.resolve(baselinePath,'apps/server/index.js')).href);
const servers=[{version:'before',app:baseModule.createGameServer({password:'visual-only',production:false})},{version:'after',app:createGameServer({password:'visual-only',production:false})}];
for(const entry of servers){await new Promise(r=>entry.app.server.listen(0,'127.0.0.1',r));entry.origin='http://127.0.0.1:'+entry.app.server.address().port;}
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
Object.assign(report,{node:process.version,platform:process.platform,browser:browser.version(),generatedAt:new Date().toISOString(),baselineSha:'cad650262eb44bff828c3b664b79b97cf74d5db1'});
const profiles=['mace','trinity','tide','beam','bolt','frost','summoner','star'];
async function pageFor(origin,width=1440,height=1000){const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>report.errors.push(e.stack));await page.goto(origin);await page.evaluate(()=>document.fonts.ready);return page;}
try{
  for(const entry of servers){
    const page=await pageFor(entry.origin);
    for(const tick of [120,360,600]){
      const rows=await page.evaluate(async({profiles,tick,version})=>{
        window.views?.forEach(v=>v.destroy());
        const [{ArenaView},{createArena,stepArena,arenaSnapshot},{BALL_CATALOG}]=await Promise.all([import('/arena.js'),import('/packages/sim/arena.js'),import('/packages/content/balls.js')]);
        document.body.innerHTML=`<main style="margin:0 auto;width:1400px;padding:18px;background:#12202a;color:#e2e9e8;font:14px Segoe UI,sans-serif"><h1 style="font-size:24px">Combat Evolution · ${version==='before'?'v2.1 baseline':'v2.2 working build'} · ${(tick/60).toFixed(0)} seconds</h1><p>Same legal T5 builds / seeds · actual simulation and renderer · no forced hits or prepared resources</p><section id="grid" style="display:grid;grid-template-columns:1fr 1fr;gap:18px"></section></main>`;
        window.views=[];const results=[];const opponents=['trinity','tide','bolt','crimson','frost','mace','star','beam'];
        for(let i=0;i<profiles.length;i++){
          const id=profiles[i],other=opponents[i],build=(id,key)=>{const f=BALL_CATALOG.find(b=>b.classId===id&&b.tier===5);if(!f)throw new Error('Missing legal T5 '+id);return {...f,id:key,name:key==='a'?'검증 선수 A':'검증 선수 B',ballId:f.id,level:15};};
          const arena=createArena([build(id,'a'),build(other,'b')],{id:'paired-'+id,seed:220200+i});let previous=arenaSnapshot(arena),current=previous,events=0;
          while(arena.tick<tick&&!arena.done){stepArena(arena);if(arena.tick%6===0){previous=current;current=arenaSnapshot(arena);events+=current.events.filter(e=>e.type==='hit').length;}}
          const card=document.createElement('article');card.innerHTML=`<h2 style="font-size:15px;margin:0 0 7px">${id} × ${other} · tick ${arena.tick}</h2><canvas style="display:block;width:100%;height:400px"></canvas>`;document.querySelector('#grid').append(card);
          const view=new ArenaView(card.querySelector('canvas'),{reduced:false,sound:false,shake:true,skin:'hybrid'});view.observer.disconnect();view.bounds=view.canvas.getBoundingClientRect();cancelAnimationFrame(view.frameId);view.update(previous);view.frame(0);cancelAnimationFrame(view.frameId);view.update(current);view.frame(100);cancelAnimationFrame(view.frameId);window.views.push(view);
          results.push({profile:id,opponent:other,tick:arena.tick,hp:current.balls.map(b=>b.hp),objects:current.objects.length,hitEventSamples:events});
        }
        await new Promise(r=>setTimeout(r,200));for(const view of window.views){view.frame(100);cancelAnimationFrame(view.frameId);}return results;
      },{profiles,tick,version:entry.version});
      const file=`${entry.version}-eight-${tick}.png`;await page.screenshot({path:path.join(out,file),fullPage:true});report.paired.push({version:entry.version,requestedTick:tick,file,rows});
    }
    const impactRows=await page.evaluate(async({profiles,version})=>{
      window.views?.forEach(v=>v.destroy());const [{ArenaView},{createDemoArena},{stepArena,arenaSnapshot},{BALL_CATALOG}]=await Promise.all([import('/arena.js'),import('/packages/sim/demo.js'),import('/packages/sim/arena.js'),import('/packages/content/balls.js')]);document.body.innerHTML=`<main style="width:1400px;margin:auto;padding:18px;background:#12202a;color:#e2e9e8;font:13px Segoe UI,sans-serif"><h1 style="font-size:24px">Prepared ability scenes · ${version}</h1><p>Actual first profile hit selected from the six-second simulation. Prepared prerequisites are disclosed below. Not natural trigger-rate evidence.</p><section id="grid" style="display:grid;grid-template-columns:1fr 1fr;gap:18px"></section></main>`;window.views=[];const rows=[];
      for(const id of profiles){const form=BALL_CATALOG.find(b=>b.classId===id&&b.tier===5),a=createDemoArena({...form,classId:id,ballId:form.id,level:15},{seed:220222}),frames=[arenaSnapshot(a)];while(a.tick<360&&!a.done){stepArena(a);if(a.tick%3===0)frames.push(arenaSnapshot(a));}const selected=frames.findIndex((frame,i)=>i>0&&frame.events.some(e=>e.type==='hit'&&e.sourceId==='demo'&&e.damage>0&&!['body','burn','poison'].includes(e.kind)));const at=selected<1?Math.min(30,frames.length-1):selected,previous=frames[at-1],current=frames[at];const card=document.createElement('article');card.innerHTML=`<h2 style="font-size:16px;margin:0">${id} · tick ${current.tick}</h2><p style="font-size:11px;height:30px">준비: ${a.demo.setup.join(' · ')}</p><canvas style="width:100%;height:440px;display:block"></canvas>`;document.querySelector('#grid').append(card);const view=new ArenaView(card.querySelector('canvas'),{skin:'hybrid',sound:false});view.observer.disconnect();view.bounds=view.canvas.getBoundingClientRect();cancelAnimationFrame(view.frameId);view.update(previous);view.frame(0);cancelAnimationFrame(view.frameId);view.update(current);view.frame(100);cancelAnimationFrame(view.frameId);window.views.push(view);rows.push({profile:id,tick:current.tick,prepared:a.demo.setup,hit:current.events.filter(e=>e.type==='hit'&&e.sourceId==='demo').map(e=>({kind:e.kind,damage:e.damage,impactKind:e.impactKind}))});}
      await new Promise(r=>setTimeout(r,120));for(const view of window.views){view.frame(100);cancelAnimationFrame(view.frameId);}return rows;
    },{profiles,version:entry.version});await page.screenshot({path:path.join(out,entry.version+'-eight-prepared-impact.png'),fullPage:true});report.paired.push({version:entry.version,scope:'Prepared ability scenes, first non-body profile hit',rows:impactRows});
    await page.close();
  }
  const origin=servers[1].origin;
  const gallery=await pageFor(origin,1440,1000);
  await gallery.evaluate(async()=>{const {NEW_PROFILES}=await import('/packages/content/new-profiles.js');document.body.innerHTML='<main style="padding:28px;background:#101c28;color:#e8eff1;font:16px Segoe UI,sans-serif"><h1>24 original silhouettes · v2.2</h1><section id="art" style="display:grid;grid-template-columns:repeat(6,1fr);gap:18px"></section></main>';for(const p of NEW_PROFILES){const card=document.createElement('article');card.style='text-align:center;background:#1c2b36;border:1px solid #354b58;padding:14px;border-radius:12px';card.innerHTML=`<img src="/assets/balls/${p.portraitKey}.svg" style="width:150px;height:150px"><div>${p.name}</div><small>${p.id}</small>`;document.querySelector('#art').append(card);}await Promise.all([...document.images].map(img=>img.decode()));});
  await gallery.screenshot({path:path.join(out,'24-original-portraits.png'),fullPage:true});await gallery.close();
  for(const [width,height] of [[1920,1080],[1440,900],[1280,720],[1024,768],[390,844],[844,390]]){
    const page=await pageFor(origin,width,height);const homeOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(homeOverflow,false,'home horizontal overflow '+width);
    const stats=await page.evaluate(async()=>{
      const [{ArenaView},{createDemoArena},{stepArena,arenaSnapshot},{BALL_CATALOG},{audioOptions,unlockAudio,playCombatSound,audioDiagnostics,releaseAudio}]=await Promise.all([import('/arena.js'),import('/packages/sim/demo.js'),import('/packages/sim/arena.js'),import('/packages/content/balls.js'),import('/game-audio.js')]);
      document.body.innerHTML='<main style="padding:12px;max-width:1100px;margin:auto"><h1 style="font-size:20px">전투 HUD · 대표 철퇴 시연</h1><p style="font-size:12px">실제 시뮬레이션 · 배치된 시연 조건: 무기 사거리 안 상대 / 벽 반사 충전 3회</p><canvas style="width:100%;height:max(360px,65vh);display:block"></canvas><button id="audio">음향 진단 시작</button></main>';
      const form=BALL_CATALOG.find(b=>b.classId==='mace'&&b.tier===1),arena=createDemoArena({...form,ballId:form.id,classId:'mace',level:19},{seed:2202});const view=new ArenaView(document.querySelector('canvas'),{sound:false,skin:innerWidth<540?'orb':'hybrid',low:innerWidth<540,reduced:innerWidth<540});window.auditView=view;cancelAnimationFrame(view.frameId);view.observer.disconnect();view.bounds=view.canvas.getBoundingClientRect();let previous=arenaSnapshot(arena),current=previous;
      for(let i=0;i<120&&!arena.done;i++){stepArena(arena);if(arena.tick%6===0){previous=current;current=arenaSnapshot(arena);}}view.update(previous);view.frame(0);cancelAnimationFrame(view.frameId);view.update(current);view.frame(100);cancelAnimationFrame(view.frameId);await new Promise(r=>setTimeout(r,120));view.frame(100);cancelAnimationFrame(view.frameId);
      window.audioOwner={};document.querySelector('#audio').onclick=()=>{unlockAudio();audioOptions(window.audioOwner,{sound:true});for(const [i,kind] of ['mace','trinity','frost','familiar','beam'].entries())playCombatSound({seq:i+1,rootAttackId:'audio-'+i,type:'hit',kind,damage:30},window.audioOwner);};window.audioDiagnostics=audioDiagnostics;window.releaseAuditAudio=()=>releaseAudio(window.audioOwner);
      return {quality:{low:view.options.low,reduced:view.options.reduced,skin:view.options.skin},overflow:document.documentElement.scrollWidth>innerWidth+1,canvas:{width:view.bounds.width,height:view.bounds.height},targets:view.targets.map(t=>({x:t.x,y:t.y,r:t.r})),hp:current.balls.map(b=>b.hp),tick:current.tick};
    });
    assert.equal(stats.overflow,false);assert.ok(stats.targets.every(t=>t.y>=156&&t.y<stats.canvas.height));await page.screenshot({path:path.join(out,`hud-${width}x${height}.png`),fullPage:true});
    await page.click('#audio');const audio=await page.evaluate(()=>audioDiagnostics());assert.ok(audio.sfxNodes<=8);assert.ok(audio.voices<=4);await page.evaluate(()=>{releaseAuditAudio();auditView.destroy();});const cleaned=await page.evaluate(()=>audioDiagnostics());assert.equal(cleaned.nodes,0);assert.equal(cleaned.owners,0);report.viewports.push({width,height,...stats,audio,cleanup:cleaned});await page.close();
  }
  for(const [width,height] of [[1440,900],[390,844]]){
    const ui=await pageFor(origin,width,height);await ui.evaluate(()=>window.openForgeCodex());await ui.selectOption('[data-codex-tier]','1');assert.ok(await ui.locator('[data-codex-awakening]').count()>0);await ui.locator('[data-codex-awakening]').first().click();await ui.locator('.sf-replay canvas').waitFor();await ui.waitForTimeout(800);const uiStats=await ui.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>({width:d.clientWidth,scroll:d.scrollWidth}))}));assert.equal(uiStats.overflow,false);assert.ok(uiStats.dialogs.every(d=>d.scroll<=d.width+1));await ui.screenshot({path:path.join(out,`codex-awakening-${width}x${height}.png`),fullPage:true});report.viewports.push({width,height,scope:'Actual codex to T1 awakening replay UI',...uiStats});await ui.close();
  }
  const page=await pageFor(origin);
  report.coverage=await page.evaluate(async()=>{
    const [{ArenaView},{createDemoArena},{arenaSnapshot,stepArena},{CLASSES}]=await Promise.all([import('/arena.js'),import('/packages/sim/demo.js'),import('/packages/sim/arena.js'),import('/packages/content/classes.js')]);document.body.innerHTML='<canvas style="width:960px;height:600px"></canvas>';const canvas=document.querySelector('canvas');const rows=[];
    for(const skin of ['orb','portrait','hybrid']){const view=new ArenaView(canvas,{skin,low:skin==='orb',reduced:skin==='portrait'});view.observer.disconnect();view.bounds=canvas.getBoundingClientRect();cancelAnimationFrame(view.frameId);
      for(const awakening of [false,true])for(const id of Object.keys(CLASSES)){if(awakening&&id==='basic')continue;const arena=createDemoArena(id,{seed:220210,awakening});let previous=arenaSnapshot(arena),current=previous;let objects=0;for(let i=0;i<360&&!arena.done;i++){stepArena(arena);if(arena.tick%6===0){previous=current;current=arenaSnapshot(arena);objects=Math.max(objects,current.objects.length);}}view.update(previous);view.frame(0);cancelAnimationFrame(view.frameId);view.update(current);view.frame(100);cancelAnimationFrame(view.frameId);rows.push({id,skin,awakening,objects,tick:arena.tick,fx:view.fx.length});}view.destroy();}
    return rows;
  });assert.equal(report.coverage.length,297);assert.deepEqual(report.errors,[]);await page.close();
}finally{await browser.close();for(const {app} of servers)await app.close();await fs.writeFile(path.join(out,'visual-report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({paired:report.paired.length,viewports:report.viewports.length,coverage:report.coverage.length,errors:report.errors},null,2));
