import fs from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {CLASSES,COMBAT} from '../packages/content/classes.js';
import {BALL_CATALOG,CONTENT_VERSION} from '../packages/content/balls.js';
import {NEW_PROFILES} from '../packages/content/new-profiles.js';
import {compatibleTraits} from '../packages/content/traits.js';
import {createArena,stepArena,arenaSnapshot,createDemoArena,RULESET_VERSION} from '../packages/sim/index.js';
const seeds=[101,211,307,401];
const representatives=['mace','trinity','tide','beam','bolt','frost','summoner','star'];
const build=(id,profile,tier=5,element)=>{const form=BALL_CATALOG.find(f=>f.classId===profile&&f.tier===tier);return {id,name:profile,classId:profile,level:20-tier,ballId:form?.id,element:element??form?.element??CLASSES[profile].element,path:form?.path??null};};
const matches=[];
function duel(profileA,profileB,tierA=5,tierB=5,label='same-tier',elements){
  for(const seed of seeds)for(const swapped of [false,true]){
    const builds=[build('A',profileA,tierA,elements?.[0]),build('B',profileB,tierB,elements?.[1])];
    if(swapped)builds.reverse();
    const a=createArena(builds,{seed,id:`analysis-${matches.length}`,outcomePolicy:'ranking'});
    // Exchange physical starting sides, retaining the seeded initial velocities.
    // A forced horizontal head-on line would repeatedly favor line weapons.
    a.balls.forEach((b,i)=>Object.assign(b,{x:i?225:65,y:109,px:i?225:65,py:109}));
    let last=0,skillCount=0;
    while(!a.done){stepArena(a);for(const e of a.events)if(e.seq>last&&['skill','field','block'].includes(e.type))skillCount++;last=a.seq;}
    matches.push({label,a:profileA,b:profileB,tierA,tierB,seed,swapped,winner:a.outcome.winnerId,draw:a.outcome.draw,seconds:a.tick/60,reason:a.reason,skillCount});
  }
}
const began=performance.now();
for(let i=0;i<representatives.length;i++)for(let j=i+1;j<representatives.length;j++)duel(representatives[i],representatives[j]);
for(const id of representatives)for(const tier of [3,5])duel(id,id,1,tier,'tier-comparison');
for(const id of ['mace','trinity','tide','beam']){duel(id,'summoner',1,5,'counter-tier');duel(id,'portal',1,10,'counter-tier');}
for(const p of NEW_PROFILES){duel(p.id,'basic',5,5,'new-vs-body');duel(p.id,'blade',5,5,'new-vs-projectile');}
duel('crimson','thorn',5,5,'element-advantage',['fire','nature']);duel('crimson','thorn',5,5,'element-disadvantage',['water','lightning']);
const grouping=new Map();
for(const m of matches){const key=[m.label,m.a,m.b,m.tierA,m.tierB].join('/');const g=grouping.get(key)??{label:m.label,a:m.a,b:m.b,tierA:m.tierA,tierB:m.tierB,games:0,wins:0,draws:0,seconds:[]};g.games++;g.wins+=Number(m.winner==='A');g.draws+=Number(m.draw);g.seconds.push(m.seconds);grouping.set(key,g);}
const groups=[...grouping.values()].map(g=>({...g,winRate:g.wins/g.games,meanSeconds:g.seconds.reduce((a,b)=>a+b,0)/g.games,seconds:undefined}));
const demos=[];
for(const id of Object.keys(CLASSES)){
  const arena=createDemoArena(id),events=[],seen=new Set();
  while(!arena.done){stepArena(arena);for(const e of arena.events)if(!seen.has(e.seq)){seen.add(e.seq);events.push(e);}}
  const meaningful=events.filter(e=>e.sourceId==='demo'&&e.kind!=='bounce'&&(id==='basic'||!['body','ragebody'].includes(e.kind)));
  if(!meaningful.length)throw new Error('No actual demo mechanic: '+id);
  demos.push({profile:id,setup:arena.demo.setup,seconds:arena.tick/60,firstEvent:meaningful[0],kinds:[...new Set(meaningful.map(e=>e.kind))]});
}
const rumbleBuilds=Array.from({length:30},(_,i)=>({...build('r'+i,NEW_PROFILES[i%24].id,5),traitId:compatibleTraits(NEW_PROFILES[i%24].id)[i%3].id}));
const rumble=createArena(rumbleBuilds,{mode:'rumble',seed:20261126}),ticks=[];let peakObjects=0,peakEvents=0,peakFrameBytes=0;
while(!rumble.done){const at=performance.now();stepArena(rumble);ticks.push(performance.now()-at);peakObjects=Math.max(peakObjects,rumble.objects.length);peakEvents=Math.max(peakEvents,rumble.events.length);if(rumble.tick%6===0)peakFrameBytes=Math.max(peakFrameBytes,Buffer.byteLength(JSON.stringify(arenaSnapshot(rumble))));}
ticks.sort((a,b)=>a-b);const times=matches.map(m=>m.seconds).sort((a,b)=>a-b),quantile=(xs,q)=>xs[Math.min(xs.length-1,Math.floor(xs.length*q))];
const report={rulesetVersion:RULESET_VERSION,contentVersion:CONTENT_VERSION,environment:{node:process.version,platform:process.platform,arch:process.arch,scope:'Local common simulator; not AWS capacity or device/browser FPS'},seeds,swapped:true,initialPositions:[{x:65,y:109},{x:225,y:109}],
  sample:matches.length,elapsedMs:performance.now()-began,meanSeconds:times.reduce((a,b)=>a+b,0)/times.length,medianSeconds:quantile(times,.5),p95Seconds:quantile(times,.95),timeoutCount:matches.filter(m=>m.seconds===40).length,
  extremeMatchups:groups.filter(g=>g.winRate===0||g.winRate===1),groups,demos,rumble:{players:30,seconds:rumble.tick/60,tickP50Ms:quantile(ticks,.5),tickP95Ms:quantile(ticks,.95),tickMaxMs:Math.max(...ticks),peakObjects,peakEvents,peakFrameBytes,projectileLimit:COMBAT.projectileLimit,fieldLimit:COMBAT.fieldLimit},matches};
await fs.writeFile('docs/v2.1-combat-analysis.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({sample:report.sample,mean:report.meanSeconds,median:report.medianSeconds,p95:report.p95Seconds,timeouts:report.timeoutCount,demos:demos.length,rumble:report.rumble,extremes:report.extremeMatchups.length},null,2));
