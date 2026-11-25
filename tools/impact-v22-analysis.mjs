import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

// Deliberately prepared mechanical fixtures, not win-rate samples. Both versions
// receive the same legal forms, positions and base velocities. Only explicitly
// labelled evolved fixtures prime v2.2's new prerequisite.
const root=process.cwd(),baseline=process.env.BASELINE_DIR??path.resolve(root,'../ballforge-v22-baseline');
const versions=[['before',baseline],['after',root]],rows=[];
for(const [version,dir] of versions){
  const api=await import(pathToFileURL(path.join(dir,'packages/sim/arena.js'))),{BALL_CATALOG}=await import(pathToFileURL(path.join(dir,'packages/content/balls.js')));
  const build=(id,key)=>{const f=BALL_CATALOG.find(f=>f.classId===id&&f.tier===(id==='basic'?19:5));return {id:key,classId:id,ballId:f.id,level:f.level,path:f.path,element:f.element};};
  const cases=[...['mace','trinity','tide','beam','bolt','frost','summoner','star'].flatMap(id=>[{id,evolved:false},{id,evolved:true}]),{id:'mace',charged:true},{id:'tide',guard:'front'},{id:'tide',guard:'back'},{id:'beam',miss:true}];
  for(const spec of cases){
    const a=api.createArena([build(spec.id,'a'),build('basic','b')],{id:`impact-${spec.id}`,seed:22022});const [b,q]=a.balls;
    const pose=(p,x,y,vx=0)=>Object.assign(p,{x,y,px:x,py:y,vx,vy:0,kx:0,ky:0});
    pose(b,90,109);pose(q,160,109);b.cl.speed=q.cl.speed=0;b.next=0;q.next=99999;
    if(spec.evolved&&api.primeEvolutionDemo)api.primeEvolutionDemo(a,b);
    if(spec.id==='mace'||spec.id==='trinity'){pose(b,220,109);pose(q,220+b.cl.orbit,109);b.angle=-b.cl.spin;if(spec.id==='mace')b.state.wallCharge=spec.evolved||spec.charged?3:0;}
    if(spec.id==='tide')b.charge=2;
    if(spec.id==='beam'){b.charge=1;b.aim=0;if(spec.miss)pose(q,160,170);}
    if(spec.id==='bolt'){b.charge=1;b.aim=0;}
    if(spec.id==='frost')pose(q,140,109);
    if(spec.id==='star'||spec.guard){
      b.next=99999;b.charge=0;b.vx=spec.guard==='back'?1:-1;b.heading=spec.guard==='back'?0:Math.PI;
      a.objects.push({id:'incoming',kind:'fixture',owner:q,field:false,x:b.x-15,y:b.y,vx:300,vy:0,r:5,power:1,born:-1,expires:40,maxTargets:1,hit:new Set(),reflected:0,rootAttackId:'fixture-incoming'});
    }
    const expected={mace:'mace',trinity:'trinity',tide:'surge',beam:'beam',bolt:'dash',frost:'icewave',summoner:'shadow',star:'starcounter'}[spec.id];
    let first=null,origin=null,last=null,pathLength=0,maxSpeed=0,all=[],lastSeq=0;const samples={};
    for(let i=0;i<180&&!a.done;i++){
      api.stepArena(a);const fresh=a.events.filter(e=>e.seq>lastSeq);if(fresh.length)lastSeq=fresh.at(-1).seq;all.push(...fresh);
      if(!first)first=fresh.find(e=>e.type==='hit'&&(spec.guard?e.targetId==='a':e.sourceId==='a'&&e.kind===expected)&&e.damage>0);
      const victim=spec.guard?b:q;
      if(first&&!origin){origin={x:victim.x,y:victim.y};last={...origin};b.next=99999;q.next=99999;}
      else if(first){const dx=victim.x-last.x,dy=victim.y-last.y,delta=Math.hypot(dx,dy);pathLength+=delta;maxSpeed=Math.max(maxSpeed,delta*60);last={x:victim.x,y:victim.y};const dt=a.tick-first.tick;
        if([6,12,21].includes(dt))samples[`${Math.round(dt/60*1000)}ms`]={pathDistance:pathLength,displacement:Math.hypot(victim.x-origin.x,victim.y-origin.y),x:victim.x,y:victim.y};if(dt>=21)break;
      }
    }
    const rootHits=first?all.filter(e=>e.type==='hit'&&e.rootAttackId===first.rootAttackId&&e.targetId===first.targetId):[];
    rows.push({version,fixture:spec,prepared:!!spec.evolved,prerequisiteApplied:!!spec.evolved&&!!api.primeEvolutionDemo,firstHit:first??null,samples,maxSpeed,rootDamage:rootHits.reduce((n,e)=>n+e.damage,0),wallslamDamage:rootHits.filter(e=>e.kind==='wallslam').reduce((n,e)=>n+e.damage,0),blocked:all.filter(e=>e.type==='block').reduce((n,e)=>n+e.blocked,0),finalHp:{a:b.hp,b:q.hp},events:all});
  }
}
const result={schema:1,baseline,notice:'Prepared deterministic mechanical fixtures only. Not normal-match win-rate evidence. Evolution prerequisites are explicitly primed only in the labelled v2.2 fixture.',samplesMilliseconds:[100,200,350],rows};
fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/v22-impact-comparison.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({file:'artifacts/v22-impact-comparison.json',fixtures:rows.length,summary:rows.map(r=>({version:r.version,...r.fixture,hit:r.firstHit?.kind??null,impulse:r.firstHit?.impulse??0,travel350:r.samples['350ms']?.pathDistance??0,maxSpeed:r.maxSpeed,rootDamage:r.rootDamage,wallslam:r.wallslamDamage,blocked:r.blocked}))},null,2));
