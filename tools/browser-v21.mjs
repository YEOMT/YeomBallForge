import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createGameServer} from '../apps/server/index.js';
import {initialBuild,enhance,choosePath,chooseBall,chooseTrait,resolveHidden,finalizeBuild} from '../packages/content/forge.js';
import {getBallChoices} from '../packages/content/balls.js';
import {compatibleTraits} from '../packages/content/traits.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href:'playwright');
const out=process.env.BROWSER_OUT||'artifacts/v2.1-browser';await fs.mkdir(out,{recursive:true});
const app=createGameServer({password:'v21-browser-classroom',production:false});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+app.server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
const report={scope:'Local real WebSocket/UI; assigned advanced states explicitly identified; not AWS/physical device/natural classroom balance',checks:[],screenshots:[],errors:[]};
const pages=[];
async function page(w=1440,h=900){const context=await browser.newContext({viewport:{width:w,height:h},reducedMotion:'reduce'});const p=await context.newPage();pages.push(p);p.setDefaultTimeout(15000);p.on('pageerror',e=>report.errors.push(e.stack));p.on('console',e=>{if(e.type()==='error')report.errors.push(e.text());});await p.goto(origin);return p;}
const wait=async(fn,timeout=15000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,30));}throw new Error('Condition timed out: '+fn);};
const act=(p,a)=>p.locator(`[data-action="${a}"]`).first();
async function shot(p,name){await p.screenshot({path:path.join(out,name+'.png'),fullPage:true});report.screenshots.push(name+'.png');}
async function check(name,fn){try{const evidence=await fn();report.checks.push({name,status:'PASS',evidence});console.log('PASS',name);}catch(e){report.checks.push({name,status:'FAIL',error:e.stack});console.error('FAIL',name,e.message);throw e;}}
let host,student,peer,room,pupil,other;
try{
  await check('host-and-two-independent-students',async()=>{
    host=await page();await host.locator('[data-open=create]').click();await host.locator('[name=password]').fill('v21-browser-classroom');await host.locator('.entry-form button[type=submit]').click();
    await host.locator('.sf-code').waitFor();const code=(await host.locator('.sf-code').innerText()).replace(/\s/g,'');room=app.rooms.get(code);
    await host.locator('[data-file=bank]').setInputFiles({name:'browser-bank.txt',mimeType:'text/plain',buffer:Buffer.from(Array.from({length:6},(_,i)=>`검증 문제 ${i+1}|정답|오답1|오답2|오답3`).join('\n'))});
    student=await page(390,844);peer=await page(1280,720);
    for(const [p,name] of [[student,'별사탕'],[peer,'달빛']]){await p.locator('[data-open=join]').click();await p.locator('[name=code]').fill(code);await p.locator('[name=name]').fill(name);await p.locator('.entry-form button[type=submit]').click();await p.locator('.sf-context').waitFor();}
    await wait(()=>room.students.size===2);[pupil,other]=[...room.students.values()];
    await act(host,'start').click();await student.locator('.rank-tabs').waitFor();assert.equal(room.phase,'ACTIVE');assert.equal(pupil.inventory.tickets,10);
    await shot(host,'01-host-ranking');await shot(student,'02-student-quiz-mobile');return {students:2,initialTickets:10};
  });
  await check('quiz-reward-and-ranking-update-preserves-question',async()=>{
    await student.evaluate(()=>{window.quizNode=document.querySelector('.sf-quiz');window.quizText=window.quizNode.textContent;window.scrollTo(0,90);window.savedScroll=scrollY;});
    room.ranking.version++;other.rating+=2;await new Promise(r=>setTimeout(r,1200));
    assert.equal(await student.evaluate(()=>window.quizNode===document.querySelector('.sf-quiz')&&window.quizText===window.quizNode.textContent&&Math.abs(window.savedScroll-scrollY)<2),true);
    await student.locator('[data-action=rankAnswer]').filter({hasText:'정답'}).click();await student.locator('.sf-feedback').waitFor();await wait(()=>pupil.inventory.tickets===12);await act(student,'rankNext').click();return {tickets:12,stableNode:true,stableScroll:true};
  });
  await check('real-enhancement-receipt-before-selection-and-three-slots',async()=>{
    await student.locator('[data-action=rankTab][data-value=forge]').click();await act(student,'enhance').click();await student.locator('[data-result-id]').waitFor();
    assert.equal(await student.locator('[data-action=chooseBall]').count(),0);await wait(()=>pupil.inventory.tickets===11);
    await act(student,'ackForge').click();await wait(()=>pupil.inventory.slots[0].lastForge.acknowledged);
    await student.locator('[data-action=createBall][data-value="1"]').click();await wait(()=>pupil.inventory.slots[1]);assert.equal(pupil.inventory.tickets,11);
    await student.locator('[data-action=storageLock][data-value="1"]').click();await wait(()=>pupil.inventory.slots[1].storageLocked);await shot(student,'03-forge-three-slots-mobile');return {attemptTickets:1,freeSlotNoGrant:true};
  });
  await check('assigned-T10-success-path-ball-trait-and-reconnect',async()=>{
    await student.locator('[data-action=selectSlot][data-value="0"]').click();
    const old=pupil.inventory.slots[0],b=initialBuild();b.tickets=1000;b.funded=true;
    for(let level=1;level<=9;level++){enhance(b,()=>0,()=>.9,{protect:false});if(b.pendingChoice)chooseBall(b,getBallChoices(b)[0].id);}
    const result=enhance(b,()=>0,()=>.9,{protect:false});Object.assign(b,{instanceId:old.instanceId,slotId:0,packId:'all',lastForge:{...result,resultId:'browser-assigned-t10',commandId:'assigned-fixture',acknowledged:false,createdAt:room.ranking.clockMs}});delete b.tickets;delete b.shields;pupil.inventory.slots[0]=b;
    await student.locator('[data-result-id="browser-assigned-t10"]').waitFor();assert.equal(await student.locator('[data-action=choosePath]').count(),0);await shot(student,'04-success-before-choice');
    await student.reload();await student.locator('.rank-tabs').waitFor();await student.locator('[data-action=rankTab][data-value=forge]').click();await act(student,'ackForge').click();
    await student.locator('[data-action=choosePath][data-value=earth]').click();await student.locator('[data-action=chooseBall][data-value="earth-10-mace"]').click();await student.locator('[data-action=chooseTrait][data-value=long_reach]').click();
    await wait(()=>pupil.inventory.slots[0].traitId==='long_reach');assert.equal(pupil.inventory.tickets,11);await shot(student,'05-t10-ready-mobile');return {fixture:'assigned T11→T10 successful receipt; real UI choices and actual reconnect',trait:'long_reach'};
  });
  await check('real-student-match-host-broadcast-and-new-HUD',async()=>{
    await act(student,'queue').click();await act(peer,'queue').click();await wait(()=>pupil.currentMatch&&other.currentMatch);assert.equal(pupil.currentMatch,other.currentMatch);
    await student.locator('.rank-tabs [data-action=rankTab][data-value=live]').click();await student.locator('.rank-canvas').waitFor();await new Promise(r=>setTimeout(r,1800));
    await shot(host,'06-host-live-hud');await shot(student,'07-own-live-mobile');
    await student.locator('[data-action=rankTab][data-value=quiz]').click();assert.ok(await student.locator('.sf-quiz').count());await wait(()=>!pupil.currentMatch,50000);assert.equal(pupil.recentMatches.length,1);assert.equal(pupil.rating+other.rating,2002);return {matchId:pupil.recentMatches[0],serverResult:true,maxSeconds:40};
  });
  await check('stored-replay-and-isolated-comparison',async()=>{
    await student.locator('[data-action=rankTab][data-value=history]').click();await act(student,'replay').click();await student.locator('.sf-replay canvas').waitFor();await new Promise(r=>setTimeout(r,1000));
    assert.equal(await student.locator('.sf-replay canvas').isVisible(),true);assert.ok((await student.locator('.sf-replay h2').textContent()).includes('원본'));await shot(student,'08-original-replay-mobile');
    await student.locator('.sf-replay button[value=close]').click();const original=JSON.stringify(pupil.inventory);
    await act(student,'compare').click();await student.locator('[data-lab-trait]').selectOption('stability');await student.locator('[data-lab-run]').click();assert.equal(JSON.stringify(pupil.inventory),original);await shot(student,'09-comparison-mobile');await student.locator('.sf-replay button[value=close]').click();return {inventoryUnchanged:true,records:pupil.recentMatches.length};
  });
  await check('representative-eight-demo-scenes-and-viewport-safety',async()=>{
    await host.evaluate(()=>{window.demoDialog=document.createElement('dialog');document.body.append(window.demoDialog);});
    const cases=['earth-5-mace','blade-5-trinity','water-5-tide','common-5-beam','lightning-5-bolt','water-5-frost','summon-5-summoner','space-5-star'];
    for(const id of cases){await host.evaluate(async id=>{const {openDemo}=await import('/replay-lab.js');await openDemo(window.demoDialog,id,{reduced:true,skin:'orb'});},id);await new Promise(r=>setTimeout(r,1200));await shot(host,'demo-'+id);await host.locator('.sf-replay button[value=close]').click();}
    for(const [width,height] of [[1920,1080],[1440,900],[1280,720],[1024,768],[844,390],[390,844]]){await host.setViewportSize({width,height});assert.equal(await host.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width} overflow`);}
    return {scenes:8,viewports:6,assigned:true};
  });
  await check('end-draining-and-results',async()=>{
    await host.setViewportSize({width:1440,height:900});await act(host,'endRanking').click();await host.locator('.sf-dialog[open] button[value=ok]').click();await wait(()=>room.phase==='RESULTS');await shot(host,'10-session-results');return {phase:room.phase};
  });
}catch(e){report.failure=e.stack;for(let i=0;i<pages.length;i++)await shot(pages[i],'failure-'+i).catch(()=>{});}
finally{await browser.close();await app.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
if(report.failure||report.errors.length){console.error(JSON.stringify(report.errors));process.exitCode=1;}
