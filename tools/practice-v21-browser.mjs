import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {createGameServer} from '../apps/server/index.js';
const {chromium}=process.env.PLAYWRIGHT_MODULE?await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href):await import('playwright');
const output='artifacts/v2.1-practice';await mkdir(output,{recursive:true});
const server=createGameServer({production:false,password:'local-practice-qa'});
await new Promise(r=>server.server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
const errors=[],checks=[];
const page=await browser.newPage({viewport:{width:1440,height:900}});
page.on('pageerror',e=>errors.push(e.message));
// Assigned deterministic local draws exercise the UI; not natural-player odds.
await page.addInitScript(()=>{Math.random=()=>.1;});
const click=async(action,value)=>{const l=page.locator(`[data-action="${action}"]${value===undefined?'':`[data-value="${value}"]`}`).first();await l.click();};
async function check(name,fn){await fn();checks.push({name,status:'PASS'});console.log('PASS',name);}
try{
  await page.goto('http://127.0.0.1:'+server.server.address().port);
  await page.waitForFunction(()=>typeof window.openForgePractice==='function');
  await page.evaluate(()=>window.openForgePractice());
  await click('beginGrowth');
  await check('local-quiz-wallet-and-three-free-slots',async()=>{
    await click('growthAnswer','0');
    assert.match(await page.locator('.practice-mount').innerText(),/공유 강화권 12장/);
    await click('growthTab','inventory');await click('growthCreate','1');
    assert.match(await page.locator('.practice-mount').innerText(),/공유 강화권 12장/);
    await click('growthTab','inventory');await click('growthCreate','2');
    assert.match(await page.locator('.practice-mount').innerText(),/공유 강화권 12장/);
    await click('growthTab','inventory');await click('growthSlot','1');
  });
  await check('success-before-choices-path-trait-and-no-reroll',async()=>{
    for(let i=0;i<10;i++){
      await click('enhance');
      await page.locator('.sf-forge-result').waitFor();
      assert.equal(await page.locator('[data-action="chooseBall"]').count(),0);
      assert.equal(await page.locator('[data-action="chooseTrait"]').count(),0);
      await click('ackForge');
      if(await page.locator('[data-action="choosePath"]').count())await click('choosePath','fire');
      if(await page.locator('[data-action="chooseBall"]').count())await click('chooseBall');
      if(await page.locator('[data-action="chooseTrait"]').count())await click('chooseTrait');
    }
    assert.match(await page.locator('.practice-mount').innerText(),/공유 강화권 2장/);
    assert.match(await page.locator('.sf-forge-core').innerText(),/T10/);
    assert.equal(await page.locator('.sf-trait-badge').count(),1);
    await page.screenshot({path:output+'/three-slot-t10.png'});
  });
  await check('CPU-battle-keeps-quiz-node-and-does-not-grant-currency',async()=>{
    await click('growthBattle');
    await page.locator('.practice-broadcast canvas').first().waitFor();
    assert.equal(await page.locator('[data-round]').innerText(),'CPU 연습 경기');
    await page.screenshot({path:output+'/cpu-battle.png'});
    await click('growthTab','quiz');await click('growthQuestion');
    await page.evaluate(()=>{window.practiceQuestionNode=document.querySelector('.practice-mount .sf-quiz h3');});
    const original=await page.locator('.practice-mount .sf-quiz h3').innerText();
    await page.waitForFunction(()=>document.querySelector('[data-growth-status]')?.textContent.includes('최근 CPU'),{},{timeout:55000});
    assert.equal(await page.locator('.practice-mount .sf-quiz h3').innerText(),original);
    assert.equal(await page.evaluate(()=>window.practiceQuestionNode===document.querySelector('.practice-mount .sf-quiz h3')),true);
    assert.match(await page.locator('.practice-mount').innerText(),/공유 강화권 2장/);
    await click('growthAnswer','1');assert.match(await page.locator('.practice-mount').innerText(),/공유 강화권 4장/);
  });
  await check('recorded-replay-and-copy-only-comparison',async()=>{
    await click('growthTab','forge');const trait=await page.locator('.sf-trait-badge').innerText();
    await click('growthTab','battle');await click('growthReplay','0');
    await page.locator('.sf-replay-dialog[open] canvas').waitFor();
    await page.screenshot({path:output+'/cpu-recorded-replay.png'});
    await page.locator('.sf-replay-dialog form button').click();
    await click('growthCompare');await page.locator('[data-lab-trait]').selectOption({index:2});await page.locator('[data-lab-run]').click();
    await page.locator('.sf-replay-dialog form button').click();await click('growthTab','forge');
    assert.equal(await page.locator('.sf-trait-badge').innerText(),trait);
    assert.match(await page.locator('.practice-mount').innerText(),/공유 강화권 4장/);
  });
  await check('narrow-mobile-practice-controls',async()=>{
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:output+'/mobile-390x844.png'});
    const bounds=await page.locator('[data-action="protectedEnhance"]').boundingBox();
    assert.ok(bounds.width>40&&bounds.x>=0&&bounds.x+bounds.width<=391);
    await click('growthTab','inventory');await page.screenshot({path:output+'/mobile-inventory.png'});
  });
  assert.deepEqual(errors,[]);
}finally{
  await writeFile(output+'/results.json',JSON.stringify({scope:'Local CPU practice; deterministic assigned forge draws; no real players or Elo',checks,errors},null,2));
  await browser.close();await server.close();
}
