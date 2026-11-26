import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createGameServer} from '../apps/server/index.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href:'playwright');
const app=createGameServer({password:'low-check-local',production:false});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+app.server.address().port);
 const result=await page.evaluate(async()=>{
  const [{ArenaView,renderDiagnostics},{createDemoArena},{stepArena,arenaSnapshot}]=await Promise.all([import('/arena.js'),import('/packages/sim/demo.js'),import('/packages/sim/arena.js')]);
  const arena=createDemoArena('mace',{awakening:true,seed:220222});let previous=arenaSnapshot(arena),current=previous;
  while(arena.tick<360&&!arena.done){stepArena(arena);if(arena.tick%3===0){previous=current;current=arenaSnapshot(arena);if(current.events.some(e=>e.type==='hit'&&e.kind==='mace'&&e.sourceId==='demo'&&e.damage>0))break;}}
  document.body.innerHTML='<main style="padding:12px"><h1 style="font-size:20px">저사양 · 실제 철퇴 피격</h1><p style="font-size:12px;line-height:1.6">준비된 각성 시연 · 무기 사거리 안 상대, 벽 충전과 진화 준비. 실제 사건의 피해 숫자만 표시합니다.</p><canvas style="width:100%;height:510px;display:block"></canvas></main>';
  const view=new ArenaView(document.querySelector('canvas'),{low:true,reduced:true,skin:'orb',sound:false});view.observer.disconnect();view.bounds=view.canvas.getBoundingClientRect();cancelAnimationFrame(view.frameId);view.update(previous);view.frame(0);cancelAnimationFrame(view.frameId);view.update(current);view.frame(100);cancelAnimationFrame(view.frameId);await new Promise(r=>setTimeout(r,100));view.frame(100);cancelAnimationFrame(view.frameId);
  return {tick:current.tick,events:current.events.filter(e=>e.type==='hit'||e.type==='block').map(e=>({type:e.type,kind:e.kind,damage:e.damage,blocked:e.blocked})),cache:renderDiagnostics(),overflow:document.documentElement.scrollWidth>innerWidth+1};
 });assert.ok(result.cache.damageLabels>0&&result.cache.damageLabels<=96);assert.equal(result.overflow,false);assert.deepEqual(errors,[]);await page.screenshot({path:'docs/evidence-v2.2/visual/low-cached-impact.png',fullPage:true});await fs.writeFile('docs/evidence-v2.2/visual/low-cache-check.json',JSON.stringify({...result,errors},null,2));console.log(JSON.stringify(result));
}finally{await browser.close();await app.close();}
