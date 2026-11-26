import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {sourceFingerprint} from './source-fingerprint.mjs';
import assert from 'node:assert/strict';
const root=path.resolve(process.env.V22_TARGET_ROOT??'.');
// This tool executes only the shared simulator/content; transport and browser
// changes cannot affect these matches. Hash the actual dependency boundary.
const source=await sourceFingerprint(root,{directories:['packages']});
const load=p=>import(pathToFileURL(path.join(root,p)));
const [{CLASSES},{BALL_CATALOG,CONTENT_VERSION},{createArena,stepArena,RULESET_VERSION},{compatibleTraits}]=await Promise.all([
  load('packages/content/classes.js'),load('packages/content/balls.js'),load('packages/sim/index.js'),load('packages/content/traits.js')]);
const suite=process.env.BALANCE_SUITE??'all',out=process.env.BALANCE_OUT??'artifacts/v22-balance.json';
const seeds=[101,211,307,401,503,601,701,809],profiles=Object.keys(CLASSES).filter(id=>id!=='basic');
const reps=['mace','trinity','tide','beam','bolt','frost','summoner','star'];
const fixture=(id,p,tier=5,extra={})=>{const f=BALL_CATALOG.find(f=>f.classId===p&&f.tier===tier);return {id,name:p,classId:p,level:20-tier,ballId:f?.id,path:f?.path,element:f?.element??CLASSES[p].element,...extra};};
const cases=[];
function add(label,a,b,tierA=5,tierB=5,s=seeds,extra={}){for(const seed of s)for(const swapped of [false,true])cases.push({label,a,b,tierA,tierB,seed,swapped,...extra});}
if(['all','compat'].includes(suite)){
  const old=JSON.parse(await fs.readFile(path.join(root,'docs/v2.1-combat-analysis.json'),'utf8'));
  for(const m of old.matches)cases.push({...m,label:'compat/'+m.label,fixedPositions:true,synthetic:m.a==='basic'&&m.tierA<19||m.b==='basic'&&m.tierB<19||m.label.startsWith('element-'),
    ...(m.label==='element-advantage'?{elementA:'fire',elementB:'nature'}:m.label==='element-disadvantage'?{elementA:'water',elementB:'lightning'}:{})});
}
if(['all','grid'].includes(suite))for(let i=0;i<profiles.length;i++)for(let j=i+1;j<profiles.length;j++)add('legal-t5',profiles[i],profiles[j]);
if(['all','deep'].includes(suite)){
  const deepSeeds=Array.from({length:100},(_,i)=>1009+i*7919);
  for(const [a,b] of [['summoner','mace'],['summoner','trinity'],['summoner','tide'],['summoner','beam'],['summoner','star'],['summoner','captor'],['beam','tide'],['bolt','frost'],['vampire','thorn'],['decoy','sniper'],['phoenix','rewind'],['mimic','reactor']])add('deep',a,b,5,5,deepSeeds);
}
if(['all','tiers'].includes(suite))for(const p of profiles)for(const tier of [3,5])add('t1-vs-tier',p,p,1,tier);
if(['all','traits'].includes(suite))for(const p of reps)for(const trait of compatibleTraits(p))add('trait',p,p,5,5,seeds,{traitA:trait.id});
if(['all','traits'].includes(suite))for(const [a,b] of [['crimson','thorn'],['tide','crimson'],['bolt','tide'],['frost','bolt']]){
  add('element-default',a,b);add('element-neutral-control',a,b,5,5,seeds,{elementA:'neutral',elementB:'neutral',synthetic:true});
}
if(['all','extended'].includes(suite)){
  for(const p of profiles)add('mirror',p,p);
  for(const p of reps){add('t10-vs-t5',p,p,10,5);for(const trait of compatibleTraits(p))add('t1-trait',p,p,1,1,seeds,{traitA:trait.id});}
  for(let i=0;i<reps.length;i++)for(let j=i+1;j<reps.length;j++)add('t1-cross',reps[i],reps[j],1,1);
  add('early-legal','basic','basic',20,19);for(const p of new Set(BALL_CATALOG.filter(f=>f.tier===18).map(f=>f.classId)))add('early-legal','basic',p,19,18);
}
if(suite==='selected'){
  const pairs=JSON.parse(await fs.readFile(process.env.BALANCE_PAIRS_FILE,'utf8'));
  if(!Array.isArray(pairs)||pairs.some(p=>!Array.isArray(p)||p.length!==2||p.some(id=>!profiles.includes(id))))throw new Error('Selected pairs must be legal profile ID pairs');
  for(const [a,b] of pairs)add('deep-selected',a,b,5,5,Array.from({length:100},(_,i)=>1009+i*7919));
}
if(!cases.length)throw new Error('No balance cases selected');
const wilson=(wins,n)=>{if(!n)return [0,1];const z=1.95996398454,p=wins/n,d=1+z*z/n,c=(p+z*z/(2*n))/d,r=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;return [c-r,c+r].map(x=>+x.toFixed(4));};
const quantile=(xs,q)=>xs.length?xs[Math.min(xs.length-1,Math.floor(xs.length*q))]:null;
const groups=new Map(),profileRows=new Map(),records=[],started=performance.now();
let rootReviewCount=0,rootReviewMax=0;
for(const [i,m] of cases.entries()){
  const builds=[fixture('A',m.a,m.tierA,{...(m.elementA?{element:m.elementA}:{}),traitId:m.traitA}),fixture('B',m.b,m.tierB,{...(m.elementB?{element:m.elementB}:{}),traitId:m.traitB})];
  if(m.swapped)builds.reverse();
  const a=createArena(builds,{seed:m.seed,id:'balance-'+i,outcomePolicy:'ranking'});
  if(m.fixedPositions)a.balls.forEach((b,j)=>Object.assign(b,{x:j?225:65,y:109,px:j?225:65,py:109}));
  let last=0,attackDamage=0,pressureDamage=0,firstEvolution=null,firstReady=null,firstAwakening=null,firstAwakeningHit=null,lastTickDamage=[],skillEvents=0;
  const damageByKind={};
  const roots=new Map(),evos=new Set(),ready=new Set(),awakened=new Set(),effective=new Set(),activeAwakenings=new Set(),blockedDuringAction=new Map();
  while(!a.done){
    stepArena(a);const events=[];for(let j=a.events.length-1;j>=0&&a.events[j].seq>last;j--)events.push(a.events[j]);last=a.seq;
    for(const e of events.reverse()){
      if(e.type==='awakening-start')activeAwakenings.add(e.sourceId);
      if(e.type==='block'&&e.blocked>0&&activeAwakenings.has(e.sourceId))blockedDuringAction.set(e.sourceId,(blockedDuringAction.get(e.sourceId)??0)+e.blocked);
      if(e.type==='awakening-end')activeAwakenings.delete(e.sourceId);
      if(e.type==='hit'&&e.damage>0){
        damageByKind[e.kind]=(damageByKind[e.kind]??0)+e.damage;
        if(e.kind==='pressure')pressureDamage+=e.damage;else attackDamage+=e.damage;
        if(lastTickDamage[0]?.tick!==e.tick)lastTickDamage=[];lastTickDamage.push({tick:e.tick,kind:e.kind,targetId:e.targetId});
        if(e.kind!=='pressure'&&e.sourceId){const key=e.rootAttackId+'/'+e.targetId,ratio=(roots.get(key)??0)+e.damage/a.index.get(e.targetId).maxHp;roots.set(key,ratio);}
        if(e.awakeningId){firstAwakeningHit??=e.tick;effective.add(e.sourceId);}
      }
      if(e.type==='skill')skillEvents++;
      if(e.type==='evo-activate'){firstEvolution??=e.tick;evos.add(e.sourceId);}
      if(e.type==='awakening-ready'){firstReady??=e.tick;ready.add(e.sourceId);}
      if(e.type==='awakening-start'){firstAwakening??=e.tick;awakened.add(e.sourceId);}
      if(e.type==='awakening-hit'&&e.damage>0){firstAwakeningHit??=e.tick;effective.add(e.sourceId);}
    }
  }
  const eliminated=a.balls.filter(b=>!b.alive),deadIds=new Set(eliminated.map(b=>b.id)),pressureKill=eliminated.some(b=>b.cause==='pressure'),sameTickAttack=lastTickDamage.some(e=>e.kind!=='pressure'&&deadIds.has(e.targetId)),sameTickPressure=lastTickDamage.some(e=>e.kind==='pressure'&&deadIds.has(e.targetId));
  const ending=a.tick>=a.limitTicks?'limit-adjudication':a.outcome?.draw?'simultaneous-draw':pressureKill?(sameTickAttack?'pressure-mixed-ko':'pressure-ko'):a.tick>=a.pressureTick?(sameTickPressure?'post-pressure-mixed-attack-ko':'post-pressure-attack-ko'):'natural-ko';
  const maxRoot=Math.max(0,...roots.values());if(maxRoot>.25)rootReviewCount++;rootReviewMax=Math.max(rootReviewMax,maxRoot);
  const row={label:m.label,a:m.a,b:m.b,tierA:m.tierA,tierB:m.tierB,seed:m.seed,swapped:m.swapped,synthetic:Boolean(m.synthetic),traitA:m.traitA,winner:a.outcome?.winnerId,draw:Boolean(a.outcome?.draw),seconds:a.tick/60,ending,
    pressureShare:pressureDamage/(attackDamage+pressureDamage||1),maxRootRatio:maxRoot,firstEvolution,firstReady,firstAwakening,firstAwakeningHit,evolved:[...evos],ready:[...ready],awakened:[...awakened],effective:[...effective],skillEvents,damageByKind,
    awakening:a.balls.filter(b=>b.awakeningState?.id).map(b=>({id:b.id,status:b.awakeningState.status,triggerCount:b.awakeningState.triggerCount,starts:b.awakeningState.actionCount,appliedDamage:b.awakeningState.applied,healing:b.awakeningState.healing,blockedDuringAction:blockedDuringAction.get(b.id)??0,startTick:b.awakeningState.startTick??null}))};
  records.push(row);
  const key=[m.label,m.a,m.b,m.tierA,m.tierB,m.traitA??''].join('/'),g=groups.get(key)??{label:m.label,a:m.a,b:m.b,tierA:m.tierA,tierB:m.tierB,traitA:m.traitA,synthetic:!!m.synthetic,n:0,wins:0,draws:0,times:[],pressure:0,endings:{},readyA:0,activatedA:0,effectiveA:0,damageByKind:{},awakeningDamageA:0,awakeningHealingA:0,awakeningBlockedA:0,activationTicksA:[]};
  for(const [kind,damage] of Object.entries(damageByKind))g.damageByKind[kind]=(g.damageByKind[kind]??0)+damage;
  const aw=row.awakening.find(b=>b.id==='A');if(aw){g.awakeningDamageA+=aw.appliedDamage??0;g.awakeningHealingA+=aw.healing??0;g.awakeningBlockedA+=aw.blockedDuringAction??0;if(aw.startTick!=null)g.activationTicksA.push(aw.startTick);}
  g.n++;g.wins+=Number(row.winner==='A');g.draws+=Number(row.draw);g.times.push(row.seconds);g.pressure+=row.pressureShare;g.endings[ending]=(g.endings[ending]??0)+1;g.readyA+=Number(ready.has('A'));g.activatedA+=Number(awakened.has('A'));g.effectiveA+=Number(effective.has('A'));groups.set(key,g);
  if(m.label==='legal-t5')for(const [id,p] of [['A',m.a],['B',m.b]]){const r=profileRows.get(p)??{id:p,n:0,wins:0,draws:0,evolved:0};r.n++;r.wins+=Number(row.winner===id);r.draws+=Number(row.draw);r.evolved+=Number(evos.has(id));profileRows.set(p,r);}
  if(i%1000===0)console.log('BALANCE',CONTENT_VERSION,i+'/'+cases.length,Math.round((performance.now()-started)/1000)+'s');
}
const summarized=[...groups.values()].map(({times,pressure,...g})=>({...g,winRate:g.wins/g.n,wilson95:wilson(g.wins,g.n),drawRate:g.draws/g.n,meanSeconds:times.reduce((a,b)=>a+b,0)/g.n,pressureShare:pressure/g.n}));
const times=records.map(r=>r.seconds).sort((a,b)=>a-b),endings={};for(const r of records)endings[r.ending]=(endings[r.ending]??0)+1;
const sections=Object.fromEntries([...new Set(records.map(r=>r.label))].map(label=>{
  const rows=records.filter(r=>r.label===label),durations=rows.map(r=>r.seconds).sort((a,b)=>a-b),ends={};
  for(const r of rows)ends[r.ending]=(ends[r.ending]??0)+1;
  return [label,{n:rows.length,synthetic:rows.filter(r=>r.synthetic).length,meanSeconds:durations.reduce((a,b)=>a+b,0)/rows.length,medianSeconds:quantile(durations,.5),p95Seconds:quantile(durations,.95),endings:ends,pressureShare:rows.reduce((n,r)=>n+r.pressureShare,0)/rows.length}];
}));
const report={source,version:CONTENT_VERSION,rules:RULESET_VERSION,suite,environment:{node:process.version,platform:process.platform,arch:process.arch,scope:'Local deterministic common simulator; no hosted capacity/FPS claim'},seeds,deepSeeds:[...new Set(cases.filter(m=>m.label.startsWith('deep')).map(m=>m.seed))],
  methodology:{legalT5Profiles:profiles.length,positions:'Seeded createArena initial layout; compatibility816 only uses legacy fixed XY',swapped:'Both build-array sides for every seed',synthetic:'Basic T5 and element override counterfactual cases explicitly flagged; excluded from legal T5 profile rates',pressure:'Unchanged production policy; endings and pressure damage counted separately',awakening:'Damage and healing are actual awakening-marked amounts, not counterfactual incremental benefit. awakeningBlockedA sums actual positive block events within ordered awakening-start/end windows, including ordinary defense during that window; it is not incremental awakening defense. Damage-free spatial utility is covered by effect tests, not falsely counted as a damaging hit.',wilson:'95% Wilson binary win rate; draws are separately reported, not treated as wins'},
  n:records.length,elapsedMs:performance.now()-started,sections,seconds:{mean:times.reduce((a,b)=>a+b,0)/(times.length||1),median:quantile(times,.5),p95:quantile(times,.95)},endings,
  rootDamageReview:{matchesAbove25Percent:rootReviewCount,maxRatio:rootReviewMax},profiles:[...profileRows.values()].map(r=>({...r,winRate:r.wins/r.n,wilson95:wilson(r.wins,r.n)})),groups:summarized,
  review:{overallOutside35to65:[...profileRows.values()].filter(r=>r.wins/r.n<.35||r.wins/r.n>.65).map(r=>r.id),deepOutside20to80:summarized.filter(g=>g.label.startsWith('deep')&&(g.winRate<.2||g.winRate>.8))}};
assert.equal((await sourceFingerprint(root,{directories:['packages']})).sha256,source.sha256,'simulator or content source changed during balance analysis');
await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(report,null,2));await fs.writeFile(out.replace(/\.json$/,'.matches.json'),JSON.stringify(records));
console.log(JSON.stringify({file:out,n:report.n,seconds:report.seconds,endings,rootDamageReview:report.rootDamageReview,reviewProfiles:report.review.overallOutside35to65,deepExtremes:report.review.deepOutside20to80.length,elapsedMs:report.elapsedMs},null,2));
