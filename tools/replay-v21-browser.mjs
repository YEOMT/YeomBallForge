import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createGameServer} from '../apps/server/index.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href:'playwright');
const out=process.env.BROWSER_OUT||'artifacts/v2.1-replay';await fs.mkdir(out,{recursive:true});
const app=createGameServer({password:'replay-local-check',production:false});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
const report={scope:'Local Chromium rendering and replay lifecycle; assigned demo/record fixtures, no live ranking rewards',checks:[],errors:[]};
try{
  const page=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'reduce'});page.on('pageerror',e=>report.errors.push(e.stack));
  await page.goto('http://127.0.0.1:'+app.server.address().port);
  await page.evaluate(async()=>{
    const api=await import('/replay-lab.js'),{ArenaView}=await import('/arena.js');
    const dialog=document.createElement('dialog');document.body.append(dialog);
    const probe={api,dialog,live:new Set(),view:null,originalUpdate:ArenaView.prototype.update,originalDestroy:ArenaView.prototype.destroy};
    ArenaView.prototype.update=function(frame){if(this.canvas.closest('dialog')===dialog){probe.live.add(this);probe.view=this;}return probe.originalUpdate.call(this,frame);};
    ArenaView.prototype.destroy=function(){probe.live.delete(this);return probe.originalDestroy.call(this);};
    window.replayProbe=probe;
    await api.openDemo(dialog,'earth-5-mace',{reduced:true});
    await api.openDemo(dialog,'water-5-tide',{reduced:true});
  });
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>replayProbe.live.size),1);
  assert.equal(await page.evaluate(()=>replayProbe.dialog.open),true);
  report.checks.push({name:'open-dialog-replacement-retains-one-player',status:'PASS'});
  await page.locator('[data-replay-speed]').selectOption('2');
  await page.evaluate(()=>{const seek=replayProbe.dialog.querySelector('[data-replay-seek]');seek.value='120';seek.dispatchEvent(new Event('input'));});
  await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>replayProbe.view.options.playbackRate),2);
  await page.locator('[data-replay-last]').click();await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>replayProbe.view.options.playbackRate),2);
  await page.evaluate(()=>{const seek=replayProbe.dialog.querySelector('[data-replay-seek]');seek.value=seek.max;seek.dispatchEvent(new Event('input'));});
  await page.waitForTimeout(50);await page.locator('[data-replay-toggle]').click();await page.waitForTimeout(50);
  assert.equal(await page.evaluate(()=>replayProbe.view.options.playbackRate),2);assert.equal(await page.evaluate(()=>replayProbe.live.size),1);
  report.checks.push({name:'speed-preserved-across-seek-last-four-and-restart',status:'PASS',rate:2});
  await page.evaluate(async()=>{replayProbe.dialog.close();await replayProbe.api.openDemo(replayProbe.dialog,'common-5-beam',{reduced:true});});
  await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>replayProbe.live.size),1);
  await page.locator('.sf-replay button[value=close]').click();await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>replayProbe.live.size),0);
  const stopped=await page.locator('[data-replay-time]').textContent();await page.waitForTimeout(120);assert.equal(await page.locator('[data-replay-time]').textContent(),stopped);
  report.checks.push({name:'queued-native-close-and-animation-cleanup',status:'PASS'});
  await page.evaluate(async()=>{
    const original=crypto.subtle.digest.bind(crypto.subtle);let finish;
    crypto.subtle.digest=()=>new Promise(resolve=>{finish=resolve;});
    const promise=replayProbe.api.openReplay(replayProbe.dialog,{frames:[{tick:0}],events:[],finalHash:'0'.repeat(64)});
    replayProbe.api.closeLab(replayProbe.dialog);finish(new Uint8Array(32).buffer);await promise;crypto.subtle.digest=original;
  });
  assert.equal(await page.evaluate(()=>replayProbe.dialog.open),false);assert.equal(await page.evaluate(()=>replayProbe.live.size),0);
  report.checks.push({name:'late-integrity-result-cannot-reopen-closed-lab',status:'PASS'});
  const result=await page.evaluate(async()=>{
    const {getBall}=await import('/packages/content/balls.js');
    const builds=['earth-5-mace','water-5-tide'].map((id,i)=>{const b=getBall(id);return {id:'p'+i,name:'검사'+i,ballId:id,classId:b.classId,level:15,path:b.path,element:b.element};});
    const record=replayProbe.api.simulateRecord(builds,{seed:261126});record.practice=false;record.snapshot.rulesetVersion='2.1.0';
    const data=JSON.stringify({frame:record.frames.at(-1),events:record.events,outcome:record.frames.at(-1).outcome??undefined});
    record.finalHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data)))].map(n=>n.toString(16).padStart(2,'0')).join('');
    await replayProbe.api.openReplay(replayProbe.dialog,record,{reduced:true});window.replayRecord=record;
    return {frames:record.frames.length,events:record.events.length,done:record.frames.at(-1).done,hash:record.finalHash};
  });
  assert.equal(result.done,true);assert.equal(await page.locator('.sf-replay canvas').isVisible(),true);
  assert.match(await page.locator('.sf-replay h2').textContent(),/원본 기록 재생/);
  report.checks.push({name:'recorded-frames-integrity-and-original-label',status:'PASS',...result,fixture:'local shared-sim record; not a real ranked match'});
  await page.evaluate(async()=>{await replayProbe.api.openReplay(replayProbe.dialog,{...window.replayRecord,finalHash:'f'.repeat(64)});});
  assert.equal(await page.locator('.sf-replay canvas').isVisible(),false);assert.match(await page.locator('.sf-replay h2').textContent(),/원본 재생 불가/);assert.equal(await page.evaluate(()=>replayProbe.live.size),0);
  report.checks.push({name:'corrupted-record-never-labeled-as-playable-original',status:'PASS'});
}catch(e){report.failure=e.stack;console.error(e);}
finally{await browser.close();await app.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));if(report.failure||report.errors.length)process.exitCode=1;
