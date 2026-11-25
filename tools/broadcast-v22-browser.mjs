import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createGameServer} from '../apps/server/index.js';
import {TestPeer} from './ws-client.js';
import {BALL_CATALOG} from '../packages/content/balls.js';
import {finalizeBuild} from '../packages/content/forge.js';
const {chromium}=await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)));
const out='artifacts/v22-broadcast-browser';await fs.mkdir(out,{recursive:true});
const app=createGameServer({password:'v22-browser-fixture',production:false});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+app.server.address().port,browser=await chromium.launch({headless:true}),sockets=[],pages=[];
const report={scope:'Local actual browser sessions + WebSockets; legal advanced builds assigned explicitly; no deployed endpoint claim',checks:[],errors:[]};
const wait=async fn=>{const end=Date.now()+55000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,50));}throw new Error('Timed out '+fn);};
const click=(p,a)=>p.locator(`[data-action="${a}"]`).first().click();
async function page(width=1440,height=900){const c=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'}),p=await c.newPage();pages.push(p);p.on('pageerror',e=>report.errors.push(e.stack));p.on('console',e=>{if(e.type()==='error')report.errors.push(e.text());});await p.goto(origin);return p;}
const check=async(name,fn)=>{const evidence=await fn();report.checks.push({name,status:'PASS',evidence});console.log('PASS',name);};
let host,student,other,room,pupil;
try{
  await check('teacher + two browser sessions + six additional independent sockets',async()=>{
    host=await page();await host.locator('[data-open=create]').click();await host.locator('[name=password]').fill('v22-browser-fixture');await host.locator('.entry-form button[type=submit]').click();await host.locator('.sf-code').waitFor();const code=(await host.locator('.sf-code').innerText()).replace(/\s/g,'');room=app.rooms.get(code);
    student=await page(390,844);other=await page(844,390);
    for(const [p,name] of [[student,'학생 A'],[other,'학생 B']]){await p.locator('[data-open=join]').click();await p.locator('[name=code]').fill(code);await p.locator('[name=name]').fill(name);await p.locator('.entry-form button[type=submit]').click();await p.locator('.sf-context').waitFor();}
    for(let i=0;i<6;i++){const p=await TestPeer.connect(origin.replace('http','ws')+'/ws');sockets.push(p);await p.send('join',{code,name:'소켓 '+i});await p.until(x=>x.state);}
    await click(host,'start');await student.locator('.rank-tabs').waitFor();pupil=[...room.students.values()][0];assert.equal(room.students.size,8);return {browserSessions:3,extraSockets:6};
  });
  await check('valid T1 announcements are dismissible, deduplicated and preserve quiz focus',async()=>{
    await student.evaluate(()=>{window.quiz=document.querySelector('.sf-quiz');window.answer=document.querySelector('[data-action=rankAnswer]');window.answer.focus();});
    for(const [i,p] of [...room.students.values()].entries()){
      const profile=['mace','trinity','tide','beam','bolt','frost','summoner','star'][i],f=BALL_CATALOG.find(f=>f.classId===profile&&f.tier===(i%2?5:1));
      Object.assign(p.inventory.slots[0],{level:20-f.tier,classId:profile,ballId:f.id,path:f.path??'fire',element:f.element,pendingChoice:false});finalizeBuild(p.inventory.slots[0]);room.observeMilestones(p,Date.now());
    }
    await student.locator('[data-news] span').first().waitFor();assert.equal(await student.evaluate(()=>window.quiz===document.querySelector('.sf-quiz')&&document.activeElement===window.answer),true);
    const count=room.announced.size;room.observeMilestones(pupil,Date.now());assert.equal(room.announced.size,count);await click(student,'hideNews');assert.equal(await student.locator('[data-news] span').count(),0);assert.equal(await student.evaluate(()=>JSON.parse(localStorage.getItem('ballforge-prefs')).announcements),false);return {assignedLegalForms:true,dedup:true,focusStable:true};
  });
  await check('top three recommendations preserve manual focus and student private frame',async()=>{
    await click(student,'queue');await click(other,'queue');for(const p of sockets)await p.send('queue',{slotId:0});await wait(()=>room.ranking.active.size===4);
    await host.locator('[data-live-featured] button').first().waitFor();assert.equal(await host.locator('[data-live-featured] button').count(),3);const button=host.locator('[data-live-featured] button').last(),selected=await button.getAttribute('data-value');await button.click();await wait(()=>room.teacher.focus===selected);
    await new Promise(r=>setTimeout(r,2200));assert.equal(room.teacher.focus,selected);assert.equal(await student.locator('.sf-featured button').count(),0);for(const p of room.students.values())assert.equal(room.frame(p).arenas[0]?.balls.some(b=>b.id===p.id),true);
    await host.screenshot({path:path.join(out,'featured-host.png'),fullPage:true});await student.screenshot({path:path.join(out,'private-student.png'),fullPage:true});
    return {recommended:3,manualFocus:selected,studentFrames:1};
  });
  await check('authoritative highlight seeks original bounded frames at 0.5 speed without rewards',async()=>{
    await wait(()=>!pupil.currentMatch);await student.locator('[data-action=rankTab][data-value=history]').click();await student.locator('[data-action=highlight]').first().waitFor();const before=JSON.stringify(pupil.inventory),rating=pupil.rating;
    await click(student,'highlight');await student.locator('.sf-replay-dialog[open] canvas').waitFor();assert.ok((await student.locator('.sf-replay h2').textContent()).includes('원본 하이라이트'));assert.equal(await student.locator('[data-replay-speed]').inputValue(),'0.5');
    const range=student.locator('[data-replay-seek]'),from=Number(await range.getAttribute('min')),to=Number(await range.getAttribute('max'));assert.ok(to-from<=300&&to-from>=180);await range.fill(String(from+30));await student.locator('[data-replay-speed]').selectOption('2');await student.locator('[data-replay-speed]').selectOption('0.5');
    await student.screenshot({path:path.join(out,'original-highlight-mobile.png'),fullPage:true});await student.locator('.sf-replay button[value=close]').click();assert.equal(JSON.stringify(pupil.inventory),before);assert.equal(pupil.rating,rating);return {from,to,originalRecord:true,walletUnchanged:true};
  });
  await check('all 50 normal and 49 legal T1 demos load in the browser with clean modal lifecycle',async()=>{
    const result=await host.evaluate(async()=>{const [{openDemo,closeLab},{BALL_CATALOG},{CLASSES}]=await Promise.all([import('/replay-lab.js'),import('/packages/content/balls.js'),import('/packages/content/classes.js')]);const d=document.createElement('dialog');document.body.append(d);let count=0;
      for(const p of Object.keys(CLASSES))for(const awakening of p==='basic'?[false]:[false,true]){const b=BALL_CATALOG.find(b=>b.classId===p&&b.tier===(awakening?1:p==='basic'?20:5));await openDemo(d,b.id,{awakening,reduced:true,sound:false});if(!d.open||!d.querySelector('canvas')||d.querySelector('canvas').hidden)throw new Error('No rendered demo '+p);closeLab(d);count++;}d.remove();return {count};});assert.equal(result.count,99);return result;
  });
  assert.deepEqual(report.errors,[]);report.status='PASS';
}catch(e){report.status='FAIL';report.failure=e.stack;console.error(e.stack);process.exitCode=1;for(let i=0;i<pages.length;i++)await pages[i].screenshot({path:path.join(out,'failure-'+i+'.png'),fullPage:true}).catch(()=>{});}
finally{for(const p of sockets)p.disconnect();await browser.close();await app.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
