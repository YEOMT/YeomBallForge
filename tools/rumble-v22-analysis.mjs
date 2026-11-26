import {writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import os from 'node:os';
import {BALL_CATALOG} from '../packages/content/balls.js';
import {createArena,stepArena,arenaSnapshot,primeEvolutionDemo} from '../packages/sim/arena.js';

const scenarios={
  melee:['mace','trinity','saw','thorn','greatsword','combo','vampire','berserk'],
  summoners:['summoner','summoner','decoy','morph','ninja'],
  fields:['gravity','seed','storm','current','mycelium','mason','trail'],
  absorbReflect:['star','captor','crystal','returner','prism','reactor','blade','sniper'],
  highT1:['mace','trinity','tide','beam','bolt','frost','summoner','star','phoenix','rewind','thermal','portal','reactor','current','vampire'],
};
const seeds=Number(process.env.RUMBLE_SEEDS??3),output=resolve(process.argv[2]??'docs/v2.2-rumble-analysis.json');
if(!Number.isInteger(seeds)||seeds<1||seeds>30)throw Error('RUMBLE_SEEDS must be 1..30');
const percentile=(xs,p)=>{const sorted=[...xs].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]??0;};
function buildsFor(ids,tier){return Array.from({length:30},(_,i)=>{const classId=ids[i%ids.length],f=BALL_CATALOG.find(b=>b.classId===classId&&b.tier===tier);return {id:'p'+i,name:'검증 '+i,classId,ballId:f.id,level:f.level,path:f.path,element:f.element};});}
function run(name,seed,prepared=false){
  const builds=buildsFor(prepared?['trinity']:scenarios[name],name==='highT1'||prepared?1:5),input=JSON.stringify(builds);
  const arena=createArena(builds,{id:'rumble-'+name+'-'+seed,mode:'rumble',seed,...(prepared?{limitTicks:360}:{})});
  if(prepared)for(const b of arena.balls){
    primeEvolutionDemo(arena,b);
    // Disclosed completed general prerequisite: do not also emit its earlier
    // three-shot volley. All 30 actual mythic volleys start after 18 ticks.
    b.evolution.ready=false;b.evolution.value=0;b.evolution.activations=1;b.evolution.effects={};b.next=18;
  }
  const initialReady=arena.balls.filter(b=>b.awakeningState.ready).length,hash=createHash('sha256'),steps=[],snapshots=[],rolling=[],queue=[],anomalies=[],starts=new Map(),markedOwners=new Set(),budgetViolations=[];
  let peakProjectiles=0,peakFields=0,peakEvents=0,peakFrameBytes=0,peakProjectilesPerOwner=0,peakFieldsPerOwner=0,rollingSum=0,peakSameTick=0,at18=null;
  while(!arena.done&&arena.tick<6000){
    const began=performance.now();stepArena(arena);const cost=performance.now()-began;steps.push(cost);queue.push(cost);rollingSum+=cost;if(queue.length>8)rollingSum-=queue.shift();if(queue.length===8)rolling.push(rollingSum);
    const projectile=arena.objects.filter(o=>!o.field),fields=arena.objects.filter(o=>o.field);
    peakProjectiles=Math.max(peakProjectiles,projectile.length);peakFields=Math.max(peakFields,fields.length);peakEvents=Math.max(peakEvents,arena.events.length);
    for(const b of arena.balls){
      const p=projectile.filter(o=>o.owner===b).length,f=fields.filter(o=>o.owner===b).length;peakProjectilesPerOwner=Math.max(p,peakProjectilesPerOwner);peakFieldsPerOwner=Math.max(f,peakFieldsPerOwner);
      if(![b.x,b.y,b.hp,b.vx,b.vy,b.kx,b.ky,b.r,b.angle].every(Number.isFinite))anomalies.push(`nonfinite:${arena.tick}:${b.id}`);
      if(b.alive&&(b.x<arena.inset+b.r-1e-6||b.x>arena.width-arena.inset-b.r+1e-6||b.y<arena.inset+b.r-1e-6||b.y>arena.height-arena.inset-b.r+1e-6))anomalies.push(`out-of-bounds:${b.id}`);
      if(b.awakeningState.actionCount>1)anomalies.push(`repeat-awakening:${b.id}`);
      if(b.awakeningState.used&&!starts.has(b.id))starts.set(b.id,b.awakeningState.startTick);
      for(const [targetId,used] of Object.entries(b.awakeningState.budgetDamage??{})){const t=arena.index.get(targetId);if(used>Math.min(b.atk*2.75,t.maxHp*.30)+1e-6)budgetViolations.push(`${b.id}:${targetId}`);}
    }
    for(const o of arena.objects)if(o.awakeningId)markedOwners.add(o.owner.id);
    if(arena.tick===18)at18={started:starts.size,actualProjectileOwners:new Set(projectile.filter(o=>o.awakeningId).map(o=>o.owner.id)).size,projectiles:projectile.length,fields:fields.length};
    if(arena.tick%3===0){const before=performance.now(),frame=arenaSnapshot(arena),text=JSON.stringify(frame);snapshots.push(performance.now()-before);peakFrameBytes=Math.max(peakFrameBytes,Buffer.byteLength(text));hash.update(text);}
  }
  if(JSON.stringify(builds)!==input)anomalies.push('mutated-build-input');
  if(!arena.done||arena.results.length!==30)anomalies.push('incomplete-results');
  const ids=new Set(builds.map(b=>b.id));
  for(const row of arena.results){if(!ids.has(row.id)||!Number.isInteger(row.rank)||row.rank<1||row.rank>30)anomalies.push('invalid-rank:'+row.id);if(row.killedById&&(!ids.has(row.killedById)||row.killedById===row.id))anomalies.push('invalid-killer:'+row.id);}
  if(!arena.results.some(r=>r.rank===1))anomalies.push('missing-first-rank');
  if(peakProjectiles>120||peakFields>30||peakEvents>128||peakProjectilesPerOwner>6||peakFieldsPerOwner>3)anomalies.push('object-or-event-cap');
  if(budgetViolations.length)anomalies.push('awakening-root-budget');
  const ticks=[...starts.values()];for(const tick of new Set(ticks))peakSameTick=Math.max(peakSameTick,ticks.filter(t=>t===tick).length);
  if(prepared&&(initialReady!==30||peakSameTick!==30||at18?.actualProjectileOwners!==30))anomalies.push('prepared-burst-did-not-execute-all30');
  hash.update(JSON.stringify(arena.results));
  return {name,seed,prepared,prerequisite:prepared?'PREPARED: all30 legal T1 trinity, completed evolution prerequisite, no prior volley; 18tick telegraph then normal action pipeline':'natural full rumble',
    ticks:arena.tick,seconds:arena.tick/60,reason:arena.reason,initialReady,awakened:starts.size,peakSameTick,at18,markedObjectOwners:markedOwners.size,starts:Object.fromEntries(starts),
    peakProjectiles,peakFields,peakEvents,peakProjectilesPerOwner,peakFieldsPerOwner,peakFrameBytes,
    timing:{stepP50:percentile(steps,.5),stepP95:percentile(steps,.95),stepMax:Math.max(...steps),snapshotP95:percentile(snapshots,.95),
      rolling8TicksP95:percentile(rolling,.95),rolling8TicksMax:Math.max(...rolling),rolling8TicksOver120ms:rolling.filter(t=>t>120).length,note:'Local server simulation CPU only; 8ticks span133ms at60Hz, measured work budget120ms. No network/browser/device acceptance claim.'},
    resultHash:hash.digest('hex'),results:arena.results,anomalies:[...new Set(anomalies)]};
}
const rows=[];
for(const name of Object.keys(scenarios))for(let i=0;i<seeds;i++){
  const seed=2201+i,first=run(name,seed),repeat=run(name,seed);first.deterministic=first.resultHash===repeat.resultHash;if(!first.deterministic)first.anomalies.push('nondeterministic-repeat');rows.push(first);
  console.log(JSON.stringify({name,seed,ticks:first.ticks,peakProjectiles:first.peakProjectiles,peakFields:first.peakFields,awakened:first.awakened,deterministic:first.deterministic,anomalies:first.anomalies.slice(0,5)}));
}
const prepared=run('synchronized30',2299,true),repeat=run('synchronized30',2299,true);prepared.deterministic=prepared.resultHash===repeat.resultHash;if(!prepared.deterministic)prepared.anomalies.push('nondeterministic-repeat');rows.push(prepared);
const failed=rows.filter(r=>r.anomalies.length),report={ruleset:'2.2.0',generatedAt:new Date().toISOString(),status:failed.length?'FAIL':'PASS',environment:{node:process.version,platform:process.platform,cpu:os.cpus()[0]?.model,cpuCount:os.cpus().length,concurrentExternalWork:'Not isolated from other workspace checks; timing is observational'},
  fullNaturalRuns:Object.keys(scenarios).length*seeds,deterministicRepeats:rows.length,preparedBursts:1,serverOnly:true,browserNetwork:'NOT RUN in this tool',rows};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,output,fullNaturalRuns:report.fullNaturalRuns,prepared30:prepared.at18,failures:failed.map(r=>({name:r.name,seed:r.seed,anomalies:r.anomalies.slice(0,5)}))}));
if(failed.length)process.exitCode=1;
