import fs from 'node:fs';
import {createArena,stepArena} from '../packages/sim/arena.js';
import {BALL_CATALOG} from '../packages/content/balls.js';
const profiles=['elastic','blade','portal','chain','summoner','mace','trinity','tide','beam','saw','pendulum','mason','current','decoy','mimic','captor','storm'],seeds=[101,211,307,401];
const forms=new Map(profiles.map(id=>[id,BALL_CATALOG.find(f=>f.classId===id&&f.tier===5)]));
const rows=[],rates=Object.fromEntries(profiles.map(id=>[id,{n:0,wins:0,natural:0,damage:0,byKind:{}}]));
for(let i=0;i<profiles.length;i++)for(let j=i+1;j<profiles.length;j++)for(const seed of seeds)for(const swap of [false,true]){
  const pair=[profiles[i],profiles[j]],builds=pair.map((id,k)=>({...forms.get(id),classId:id,ballId:forms.get(id).id,id:k?'B':'A'}));if(swap)builds.reverse();
  const a=createArena(builds,{seed,outcomePolicy:'ranking'});let last=0;while(!a.done){stepArena(a);for(let k=a.events.length-1;k>=0&&a.events[k].seq>last;k--){const e=a.events[k];if(e.type==='hit'&&e.sourceId&&e.damage>0){const id=a.index.get(e.sourceId).classId,r=rates[id];r.damage+=e.damage;r.byKind[e.kind]=(r.byKind[e.kind]??0)+e.damage;}}last=a.seq;}
  const natural=a.tick<a.pressureTick&&a.balls.some(b=>!b.alive);for(const [k,id] of pair.entries()){const r=rates[id];r.n++;r.wins+=Number(a.outcome.winnerId===(k?'B':'A'));r.natural+=Number(natural);}rows.push({pair,seed,swap,winner:a.outcome.winnerId,natural,seconds:a.tick/60});
}
const result={notice:'Focused 17-profile opportunity diagnostic, 4 seeds and both sides. Not the full legal T5 grid.',n:rows.length,rates:Object.entries(rates).map(([id,r])=>({id,...r,winRate:r.wins/r.n,naturalRate:r.natural/r.n,averageDamage:r.damage/r.n})),rows};
fs.writeFileSync('artifacts/v22-opportunity-tuning.json',JSON.stringify(result,null,2));console.log(JSON.stringify({n:result.n,rates:result.rates.map(({id,winRate,naturalRate,averageDamage})=>({id,winRate,naturalRate,averageDamage}))},null,2));
