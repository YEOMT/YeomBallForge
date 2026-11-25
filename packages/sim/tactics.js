import {traitFor} from '../content/traits.js';
export function configureTactic(b) {
  b.trait=traitFor(b);b.tactic={count:0,readyUntil:-1,last:-999,lastWall:-999,seen:[],marks:new Map()};
  const p=b.trait?.params;if(!p)return;
  if(b.trait.id==='stability')b.cl.speed*=p.speed;
  if(b.trait.id==='long_reach'){b.cl.orbit*=p.reach;b.cl.spin*=p.spin;}
  if(b.trait.id==='guard_riposte'&&b.cl.block)b.cl.block*=p.block;
  if(b.trait.id==='pulse_focus')b.cl.windup=Math.ceil((b.cl.windup??20)*p.windup);
}
export function damageTags(h) {
  if(!h.source)return ['environment'];
  if(h.projectile?.summon)return ['summon'];
  if(h.field)return ['field','derived'];
  if(h.projectile?.reflected)return ['reflect','derived'];
  if(h.projectile?.derived)return ['derived'];
  if(['burn','poison','residualheat'].includes(h.kind))return ['dot','derived'];
  return h.reactive?['derived']:['direct'];
}
function once(b,root){const s=b.tactic;if(s.seen.includes(root))return false;s.seen.push(root);if(s.seen.length>64)s.seen.shift();return true;}
export function tacticBeforeHit(a,h,emit) {
  h.reasonTags=damageTags(h);if(h.evolutionId||h.projectile?.evolutionId)h.reasonTags.push('evolved');if(h.awakeningId||h.projectile?.awakeningId)h.reasonTags.push('awakening');h.procDepth=h.reasonTags.includes('direct')?0:1;
  const b=h.source,t=b?.trait,s=b?.tactic;if(!t||!h.reasonTags.includes('direct'))return;
  const p=t.params;
  if(p.base)h.power*=p.base;
  if(['wall_charge','impact_rhythm','guard_riposte'].includes(t.id)&&s.readyUntil>=a.tick){h.power*=p.power;s.readyUntil=-1;s.count=0;emit(a,'trait',t.id,b,h.target,h.x,h.y,{rootAttackId:h.attackId,reasonTags:['trait','derived'],procDepth:1});}
  if(t.id==='quick_return'&&h.projectile)h.power*=p.power;
  if(t.id==='frost_fracture'&&h.target.slowUntil>=a.tick&&once(b,h.attackId)){
    const old=s.marks.get(h.target.id),count=(old&&old.until>=a.tick?old.count:0)+1;
    if(count>=p.marks){h.power+=p.power;s.marks.delete(h.target.id);emit(a,'trait','frost-fracture',b,h.target,h.x,h.y,{rootAttackId:h.attackId,reasonTags:['trait','derived'],procDepth:1});}
    else s.marks.set(h.target.id,{count,until:a.tick+p.window});
  }
  if(t.id==='frost_fracture'&&h.slowTicks)h.slowTicks=Math.ceil(h.slowTicks*p.slow);
}
export function tacticAfterHit(a,h,amount,emit) {
  const b=h.source,t=b?.trait,s=b?.tactic;if(!t||amount<=0||!h.reasonTags?.includes('direct'))return;
  const p=t.params;
  if(t.id==='impact_rhythm'&&once(b,h.attackId)){
    if(a.tick-s.last>p.window)s.count=0;s.last=a.tick;
    if(++s.count>=p.hits){s.count=0;s.readyUntil=a.tick+p.window;emit(a,'skill','rhythm-ready',b,null,b.x,b.y,{rootAttackId:h.attackId});}
  }
  if(t.id==='residual_heat'&&['blaze','blade','missile','thermal','phoenixfire'].includes(h.kind)){
    h.target.dots.set('traitheat/'+b.id,{owner:b,kind:'residualheat',attackId:h.attackId,next:a.tick+p.interval,end:a.tick+p.ticks,stacks:1,power:p.power});
  }
}
export function tacticWall(a,b,emit){
  if(b.trait?.id!=='wall_charge')return;const s=b.tactic,p=b.trait.params;
  if(a.tick-s.lastWall<p.wallGap)return;s.lastWall=a.tick;
  if(s.readyUntil>=a.tick)return;
  if(++s.count>=p.walls){s.count=0;s.readyUntil=a.tick+p.ttl;emit(a,'skill','wall-charge-ready',b,null,b.x,b.y);}
}
export function tacticBlock(a,b,h,blocked,emit){if(b.trait?.id==='guard_riposte'&&blocked>0&&!h.reactive){b.tactic.readyUntil=a.tick+b.trait.params.ttl;emit(a,'skill','riposte-ready',b,h.source,b.x,b.y,{rootAttackId:h.attackId});}}
export function tacticResource(a,b){if(!b.trait)return null;const s=b.tactic,t=b.trait,p=t.params;
  if(['wall_charge','impact_rhythm','guard_riposte'].includes(t.id))return {name:t.name,value:s.readyUntil>=a.tick?(p.walls??p.hits??1):s.count,max:p.walls??p.hits??1,ready:s.readyUntil>=a.tick};
  return null;
}
