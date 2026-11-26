import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)));
const root=path.resolve('dist'),prefix='/YeomBallForge/',errors=[],requests=[],report={scope:'Local dist served under actual Pages subpath; not a public deployment',checks:[],errors};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith(prefix)){res.writeHead(404).end();return;}const rel=decodeURIComponent(url.pathname.slice(prefix.length))||'index.html',file=path.resolve(root,rel);if(!file.startsWith(root+path.sep))throw Error('invalid path');res.setHeader('Content-Type',mime[path.extname(file)]??'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{requests.push(r.url());if(r.status()>=400)errors.push(r.status()+' '+r.url());});page.on('websocket',ws=>errors.push('Unexpected network classroom attempt '+ws.url()));
 await page.goto(origin+prefix);await page.waitForFunction(()=>typeof window.openForgePractice==='function');assert.equal(await page.evaluate(()=>window.BALLFORGE_CONFIG.version),'2.2.0');
 await page.locator('[data-open=practice]').click();await page.locator('[data-action=beginGrowth]').click();await page.locator('[data-action=growthAnswer]').first().waitFor();report.checks.push('offline practice at /YeomBallForge/');
 const result=await page.evaluate(async()=>{const [{openDemo,closeLab},{BALL_CATALOG},{CLASSES}]=await Promise.all([import('./replay-lab.js'),import('./packages/content/balls.js'),import('./packages/content/classes.js')]);let count=0;const d=document.createElement('dialog');document.body.append(d);for(const profile of Object.keys(CLASSES))for(const awakening of profile==='basic'?[false]:[false,true]){const b=BALL_CATALOG.find(b=>b.classId===profile&&b.tier===(awakening?1:profile==='basic'?20:5));await openDemo(d,b.id,{awakening,sound:false,reduced:true});if(!d.open||!d.querySelector('canvas'))throw new Error(profile);closeLab(d);count++;}d.remove();const assets=[...new Set(BALL_CATALOG.map(b=>b.portraitKey))];for(const key of assets){const r=await fetch('./assets/balls/'+key+'.svg');if(!r.ok)throw Error('portrait '+key);}return {demos:count,portraits:assets.length};});assert.equal(result.demos,99);assert.equal(result.portraits,50);report.checks.push(result);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await new Promise(r=>setTimeout(r,100));assert.deepEqual(errors,[]);report.status='PASS';console.log(JSON.stringify(report));
}catch(e){report.status='FAIL';report.failure=e.stack;console.error(e.stack);process.exitCode=1;}
finally{await browser.close();await new Promise(r=>server.close(r));await fs.mkdir('artifacts',{recursive:true});await fs.writeFile('artifacts/v22-pages-browser.json',JSON.stringify({...report,requests:requests.length},null,2));}
