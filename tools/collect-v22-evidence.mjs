import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {sourceFingerprint} from './source-fingerprint.mjs';
const out='docs/evidence-v2.2';await fs.mkdir(out,{recursive:true});
const read=async name=>JSON.parse(await fs.readFile('artifacts/'+name,'utf8'));
const source=await sourceFingerprint(process.cwd()),serverSource=await sourceFingerprint(process.cwd(),{includePublic:false});
const soak=await read('v22-final-soak.json');
assert.equal(soak.status,'PASS');assert.ok(soak.wallMs>=900000);assert.equal(soak.source.sha256,serverSource.sha256);
const baselineSoak=await read('v22-baseline-soak.json');delete baselineSoak.target;
baselineSoak.scope+=' Timing collected during development; compare stability, not directly to final soak CPU/latency. Use quiet serial socket reports for controlled short-load comparison.';
const impact=await read('v22-impact-comparison.json');delete impact.baseline;impact.baselineSha='cad650262eb44bff828c3b664b79b97cf74d5db1';
const names=['v22-baseline-server-load.json','v22-final-server-load.json','v22-pages-browser.json','v22-start-health.json','v22-final-browser-summary.json'];
for(const name of names)await fs.copyFile('artifacts/'+name,out+'/'+name.replace(/^v22-/,''));
for(const [name,data] of [['soak-before.json',baselineSoak],['soak-after.json',soak],['impact-comparison.json',impact],['source-fingerprint.json',{source,serverSource,baselineSha:impact.baselineSha}]])await fs.writeFile(out+'/'+name,JSON.stringify(data,null,2));
const reports=[['v22-legacy-browser/report.json','legacy-browser.json'],['v2.1-practice/results.json','practice-browser.json'],['v2.1-forge-flow/report.json','forge-browser.json'],['v2.1-replay/report.json','replay-browser.json'],['v22-broadcast-browser/report.json','broadcast-browser.json']];
for(const [from,to] of reports){const data=await read(from);assert.ok(!data.failure&&!(data.errors?.length),from);await fs.writeFile(out+'/'+to,JSON.stringify(data,null,2));}
for(const file of ['v22-final-tests.txt','v22-final-build.txt'])await fs.copyFile('artifacts/'+file,out+'/'+file.replace(/^v22-final-/,''));
console.log(JSON.stringify({status:'PASS',source,serverSource,soakMinutes:soak.wallMs/60000,completed:soak.completedMatches}));
