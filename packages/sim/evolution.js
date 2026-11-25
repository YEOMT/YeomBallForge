import {evolutionFor,CURRENT_MIN_TURN_RADIANS} from '../content/evolution.js';
const DIRECT_ONLY=new Set(['body','blade','dash','arc','mace-wall','thorn-poison','crescent','trinity','shadowdash','punch','beam','icewave','portalstrike','sonic','thermal','curse-touch','saw','snipe','frost-touch','jab','copy-hit','fire-hit','morph-success']);
const hitKinds={body:['body','ragebody'],blade:['blade'],dash:['dash'],arc:['arc'],'mace-wall':['mace'],'thorn-poison':['thorn'],crescent:['crescent'],trinity:['trinity'],shadowdash:['shadowdash'],punch:['punch'],beam:['beam'],icewave:['icewave'],portalstrike:['portalstrike'],sonic:['sonic'],thermal:['thermal'],'curse-touch':['curse-touch'],saw:['saw'],snipe:['snipe'],'frost-touch':['frost-touch'],jab:['jab'],'copy-hit':['copy-cleave','copy-cold','copy-crescent','copybolt'],'fire-hit':['body','blaze','phoenixfire'],'morph-success':['body','morphshot'],'chain-pull':['chain'],bloom:['bloom'],collapse:['collapse'],prism:['prism'],lightningstrike:['lightningstrike'],'trail-cross':['trail-cross'],'web-cross':['web-cross']};
export function configureEvolution(b){const d=evolutionFor(b);b.evolution={kind:d.id,name:d.name,value:0,max:d.count,stage:0,ready:false,activeUntil:-1,recoveryUntil:-1,last:-999,lastWall:-999,seen:[],activations:0,consumed:0,effects:{},readyAt:-1,expired:0,travel:0,lastX:b.x,lastY:b.y};}
function event(a,b,type,c,extra={}){c.emit(a,type,b.evolution.kind,b,null,b.x,b.y,{reasonTags:['evolution'],...extra});}
function remember(s,key){if(s.seen.includes(key))return false;s.seen.push(key);if(s.seen.length>64)s.seen.shift();return true;}
function formCharge(a,b,root,c){const s=b.evolution,form=b.state.form;if(![0,1,2].includes(form))return;if(a.tick-s.last>evolutionFor(b).window)s.formMask=0;if((s.formMask??0)&(1<<form))return;if(evolutionCharge(a,b,1,root,c))s.formMask=(s.formMask??0)|(1<<form);}
function thornCharge(a,b,e,root,c){
  const s=b.evolution,d=evolutionFor(b),target=a.index.get(e.targetId);
  if(!target||!target.alive||s.seen.includes(root)||![...target.dots.values()].some(x=>x.owner===b&&x.kind==='poison'&&x.stacks>=2))return;
  // One bounded entry per participant, never an aggregate across poisoned foes.
  s.targetHits=(s.targetHits??[]).filter(x=>a.tick-x.last<=d.window&&a.index.get(x.id)?.alive);
  let entry=s.targetHits.find(x=>x.id===target.id);if(!entry){if(s.targetHits.length>=30)s.targetHits.shift();entry={id:target.id,value:0,last:a.tick};s.targetHits.push(entry);}
  s.value=entry.value;s.stage=0;
  if(evolutionCharge(a,b,1,root,c)){entry.value=s.value;entry.last=a.tick;if(s.ready)s.chargeTargetId=target.id;}
}
export function evolutionCharge(a,b,amount,root,c){
  const s=b.evolution,d=evolutionFor(b);if(!s||!b.alive||amount<=0||s.ready||s.activeUntil>=a.tick||s.recoveryUntil>a.tick||!remember(s,root))return false;
  if(a.tick-s.last>d.window)s.value=0;const previousBand=Math.floor(s.value/s.max*10);s.last=a.tick;s.value=Math.min(s.max,s.value+amount);s.stage=Math.min(d.stages??1,Math.floor(s.value/s.max*(d.stages??1)));
  // Snapshots retain exact progress. Travel emits at most ten progress events per
  // cycle instead of one every simulation tick, preserving the archive budget.
  if(d.trigger!=='travel'&&d.trigger!=='small-travel'||Math.floor(s.value/s.max*10)!==previousBand)event(a,b,'evo-charge',c,{rootAttackId:root,value:s.value,max:s.max,stage:s.stage});
  if(s.value+1e-9>=s.max){s.ready=true;s.readyAt=a.tick;event(a,b,'evo-ready',c,{rootAttackId:root,value:s.value,max:s.max,stage:s.stage});}
  return true;
}
export function evolutionSignal(a,b,signal,e,c){
  const s=b?.evolution,d=evolutionFor(b);if(!s||!d||!b.alive||e?.reasonTags?.includes('evolution'))return;
  if(b.classId==='morph'&&signal==='event'&&e.type==='block'&&e.kind==='morph'&&e.blocked>0&&s.effects.guard){delete s.effects.guard;s.formConsumed=true;}
  if(s.ready||s.activeUntil>=a.tick||s.recoveryUntil>a.tick)return;
  if(signal==='taken'){if(d.trigger==='taken'&&e.damage>0&&e.sourceId&&e.sourceId!==b.id&&!e.reasonTags?.includes('environment'))evolutionCharge(a,b,e.damage/b.maxHp,e.rootAttackId,c);return;}
  if(signal!=='event')return;
  const root=e.rootAttackId??e.eventId;
  if(e.type==='wall'&&d.trigger==='wall'&&a.tick-s.lastWall>=12){s.lastWall=a.tick;evolutionCharge(a,b,1,root,c);return;}
  if(e.type==='hit'&&e.damage>0&&e.targetId!==b.id){
    if(d.trigger==='summon-hit'&&e.reasonTags?.includes('summon')&&a.tick-s.last>=12)evolutionCharge(a,b,1,root,c);
    else if((hitKinds[d.trigger]||[]).includes(e.kind)&&(!DIRECT_ONLY.has(d.trigger)||e.reasonTags?.includes('direct'))){
      if(d.trigger==='thorn-poison'){thornCharge(a,b,e,root,c);return;}
      if(d.trigger==='morph-success'){if(b.state.form===0&&e.kind==='body'||b.state.form===1&&e.kind==='morphshot')formCharge(a,b,root,c);return;}
      if(d.trigger==='mace-wall'&&!e.wallCharged)return;
      if(d.trigger==='portalstrike'&&a.tick-b.teleportedAt>30)return;
      evolutionCharge(a,b,1,root,c);
    }
  }
  if(e.type==='block'){
    if(d.trigger==='block'&&e.blocked>0)evolutionCharge(a,b,1,root,c);
    if(d.trigger==='absorb'&&e.kind==='absorb'&&e.blocked>0)evolutionCharge(a,b,1,root,c);
    if(d.trigger==='capture'&&e.kind==='capture'&&e.captured===true)evolutionCharge(a,b,1,root,c);
    if(d.trigger==='decoy-block'&&e.kind==='decoy'&&e.blocked>0)evolutionCharge(a,b,e.blocked,root,c);
    if(d.trigger==='morph-success'&&e.kind==='morph'&&e.blocked>0&&b.state.form===2)formCharge(a,b,root,c);
  }
  if(e.type==='skill'){
    if(d.trigger==='return'&&e.kind==='shield-return'&&e.reflected)evolutionCharge(a,b,1,root,c);
    if(d.trigger==='swing'&&e.kind==='swing-release')evolutionCharge(a,b,1,root,c);
    if(d.trigger==='salvo'&&e.kind==='salvo-fired')evolutionCharge(a,b,1,root,c);
    if(d.trigger==='card-cycle'&&e.kind==='card'&&e.acted)evolutionCharge(a,b,1,root,c);
    if(d.trigger==='wall-deflect'&&e.kind==='wall-deflect'&&e.targetId!==b.id)evolutionCharge(a,b,1,root+':'+e.targetId,c);
    if(d.trigger==='current-bend'&&e.kind==='current-bend'&&e.targetId!==b.id&&e.impulse>0&&e.turnAngle>=CURRENT_MIN_TURN_RADIANS)evolutionCharge(a,b,1,root+':'+e.targetId,c);
  }
  if(e.type==='heal'&&d.trigger==='lifesteal'&&e.kind==='lifesteal'&&e.healing>0)evolutionCharge(a,b,1,root,c);
}
export function evolutionTick(a,b,c){
  const s=b.evolution,d=evolutionFor(b);if(!s)return;
  for(const q of s.queue??[])if(q.at===a.tick&&q.target?.alive&&(q.kind!=='ice-fracture'||q.target.slowUntil>=a.tick)&&(q.kind!=='exit-cut'||Math.hypot(q.target.x-q.x,q.target.y-q.y)<=34+q.target.r))c.hit(a,b,q.target,q.kind,q.power,{x:q.x,y:q.y},{reactive:true,attackId:q.root,evolutionId:s.kind,push:q.push??0});
  if(s.queue)s.queue=s.queue.filter(q=>q.at>a.tick);
  if(s.activeUntil>=0&&a.tick>s.activeUntil){s.effects={};s.activeUntil=-1;s.stage=0;s.expired++;if(b.classId==='titan'&&b.state.large&&b.awakeningState?.status!=='active')b.cl.mass=1.7;if(b.classId==='morph'&&s.activeForm===0&&b.state.form===0)b.cl.speed=218;event(a,b,'evo-expire',c);}
  if(s.ready&&a.tick-s.readyAt>d.readyTtl){s.ready=false;s.value=0;s.stage=0;s.targetHits=[];s.formMask=0;s.chargeTargetId=null;s.expired++;event(a,b,'evo-expire',c,{reason:'준비 시간 만료'});}
  if(!s.ready&&s.value>0&&a.tick-s.last>d.window){s.value=0;s.stage=0;}
  if(d.trigger!=='travel'&&d.trigger!=='small-travel')return;
  const distance=Math.hypot(b.x-s.lastX,b.y-s.lastY);s.lastX=b.x;s.lastY=b.y;
  if((d.trigger==='travel'||(d.trigger==='small-travel'&&!b.state.large))&&b.teleportedAt<a.tick-1&&distance<15)evolutionCharge(a,b,distance,`${a.id}:${b.id}:travel:${a.tick}`,c);
}
export function evolutionAction(a,b,kind,c,detail={}){
  const s=b.evolution,d=evolutionFor(b);if(!s||!s.ready||!b.alive||!d.actions.includes(kind))return false;
  if(b.classId==='fracture'&&detail.target?.slowUntil<a.tick)return false;
  if(b.classId==='mace'&&(b.state.wallCharge??0)<3)return false;
  if(b.classId==='thorn'&&(!detail.target||s.chargeTargetId&&detail.target.id!==s.chargeTargetId||![...detail.target.dots.values()].some(d=>d.owner===b&&d.kind==='poison'&&d.stacks>=2)))return false;
  if(b.classId==='morph'&&![0,1,2].includes(b.state.form))return false;
  s.ready=false;s.value=0;s.effects={...d.effects};s.activeUntil=a.tick+d.duration-1;s.recoveryUntil=s.activeUntil+d.recovery;s.activations++;s.consumed++;
  s.root=detail.rootAttackId??`${a.id}:${b.id}:${a.tick}:evolution:${s.activations}`;
  s.heavyConsumed=false;s.recoveryFrom=null;s.familiarApplied=false;s.directConsumed=false;s.formConsumed=false;
  if(b.classId==='thorn'){s.targetHits=[];s.poisonConsumed=false;}
  if(b.classId==='morph'){s.activeForm=b.state.form;s.formMask=0;s.effects=s.activeForm===0?{formSpeed:d.effects.formSpeed}:s.activeForm===1?{formShotR:d.effects.formShotR}:{guard:d.effects.formGuard};}
  event(a,b,'evo-activate',c,{rootAttackId:s.root,duration:d.duration,effects:s.effects,stage:s.stage});event(a,b,'evo-consume',c,{rootAttackId:s.root,value:0});
  return true;
}
export function evolutionScale(b,key){return b.evolution?.effects?.[key]??1;}
export function evolutionEffect(b,key,fallback=0){return b.evolution?.effects?.[key]??fallback;}
export function evolutionHit(a,h,c){
  const b=h.source,s=b?.evolution;if(!s||!Object.keys(s.effects).length||!b.alive)return;
  const id=b.classId,fx=s.effects;
  const weaponKind={ring:'blade',mace:'mace',trinity:'trinity',saw:'saw',titan:'body',morph:'body',pendulum:'swingdash',reactor:'missile',mimic:h.kind.startsWith('copy')?h.kind:'',storm:'lightningstrike',current:'current-bend'}[id];
  if(!evolutionFor(b).actions.includes(h.kind)&&h.kind!==weaponKind&&!h.evolutionId&&!h.projectile?.evolutionId)return;
  if(id==='berserk'){if(h.kind!=='ragebody'||h.reactive||s.directConsumed)return;s.directConsumed=true;}
  if(fx.push&&h.push)h.push*=fx.push;
  if(fx.bodyImpulse&&['body','ragebody'].includes(h.kind))h.push=Math.max(h.push??0,fx.bodyImpulse);
  if(id==='thorn'&&h.kind==='thorn'&&fx.poisonBurst){if(s.poisonConsumed||s.chargeTargetId&&h.target.id!==s.chargeTargetId)return;const entry=[...h.target.dots].find(([,d])=>d.owner===b&&d.kind==='poison'&&d.stacks>=2);if(entry){h.target.dots.delete(entry[0]);h.power+=fx.poisonBurst;h.status=null;h.evolutionConsumed='poison';s.poisonConsumed=true;}}
  if(id==='hourglass'&&h.kind==='echo'&&fx.echoPush)h.push=fx.echoPush;
  if(id==='curse'&&h.kind==='curse-release'&&fx.cursePush)h.push=fx.cursePush;
  if(id==='fracture'&&h.kind==='ice-shatter'&&fx.shatterPush)h.push=fx.shatterPush;
  if(id==='combo'&&h.kind==='combo-finish'&&fx.finisherPush)h.push=fx.finisherPush;
  if(id==='titan'&&b.state.large&&h.kind==='body'&&fx.titanImpulse){h.push=fx.titanImpulse;s.effects.titanImpulse=0;}
  if(id==='mace'&&h.kind==='mace'&&!s.heavyConsumed){h.wall=true;h.wallPower=b.cl.wallPower*1.15;s.heavyConsumed=true;s.recoveryFrom=a.tick+1;}
  h.evolutionId=s.kind;h.evolutionRoot=s.root;
}
export function evolutionAfterHit(a,h,amount){
  const b=h.source,s=b?.evolution;if(!s||amount<=0||!h.evolutionId)return;
  if(b.classId==='morph'&&h.kind==='body'&&s.effects.formSpeed){delete s.effects.formSpeed;s.formConsumed=true;if(b.state.form===0)b.cl.speed=218;}
  if(b.classId==='berserk'&&h.kind==='ragebody'){b.rage=0;b.rageUntil=a.tick;b.state.fatigueUntil=s.recoveryUntil;b.next=Math.max(b.next,s.recoveryUntil);}
  if(b.classId==='frost'&&h.kind==='icewave'&&s.effects.fracture){s.queue??=[];if(s.queue.length<4)s.queue.push({at:a.tick+18,target:h.target,kind:'ice-fracture',power:s.effects.fracture,x:h.target.x,y:h.target.y,root:h.attackId,push:28});}
  if(b.classId==='portal'&&h.kind==='portalstrike'&&s.effects.portalCut){s.queue??=[];s.queue.push({at:a.tick+8,target:h.target,kind:'exit-cut',power:.3,x:b.x,y:b.y,root:h.attackId,push:35});}
}
export function evolutionObject(a,b,kind,p,c){
  const fx=b.evolution?.effects;if(!fx||!Object.keys(fx).length)return;
  if(!p.field&&p.vx!=null){if(fx.shotR)p.r*=fx.shotR;if(fx.shotSpeed){p.vx*=fx.shotSpeed;p.vy*=fx.shotSpeed;}}
  if(fx.fieldLife&&p.expires)p.expires=a.tick+Math.round((p.expires-a.tick)*fx.fieldLife);
  if(kind==='seed'&&fx.fieldRadius){p.r*=fx.fieldRadius;p.evoRange=fx.fieldRadius;}
  if(kind==='gravity'){p.pullScale=fx.pull??1;p.coreScale=fx.coreRange??1;}
  if(kind==='afterimage'&&fx.afterimageRange)p.r*=fx.afterimageRange;
  if(kind==='familiar'&&fx.familiarRadius&&!b.evolution.familiarApplied){b.evolution.familiarApplied=true;p.r*=fx.familiarRadius;p.upgraded=true;p.fireIntervalScale=fx.familiarInterval;p.upgradeUntil=b.evolution.activeUntil;const old=a.objects.find(o=>o.owner===b&&o.kind==='familiar');if(old){Object.assign(old,{r:p.r,upgraded:true,fireIntervalScale:p.fireIntervalScale,upgradeUntil:p.upgradeUntil,evolutionId:b.evolution.kind,evolutionRoot:b.evolution.root});p.upgradedExistingId=old.id;p.skipSpawn=true;}}
  if(kind==='returnshield'&&fx.returnSpeed)p.returnSpeedScale=fx.returnSpeed;
  if(kind==='wallsegment'&&fx.wallLength){const mid=(p.y+p.y2)/2,half=(p.y2-p.y)/2*fx.wallLength;const y=Math.max(a.inset+12,mid-half),y2=Math.min(a.height-a.inset-12,mid+half);if(!a.balls.some(t=>t.alive&&Math.abs(t.x-p.x)<t.r+8&&t.y>y-t.r&&t.y<y2+t.r)){p.y=y;p.y2=y2;}}
  if(kind==='phoenixfire'&&fx.phoenixRadius)p.r*=fx.phoenixRadius;
  if(kind==='cardshot'&&fx.cardShotR)p.r*=fx.cardShotR;
  if(kind==='morphshot'&&fx.formShotR)p.r*=fx.formShotR;
  if(kind==='lighttrail'&&fx.trailLength){p.x2=p.x+(p.x2-p.x)*fx.trailLength;p.y2=p.y+(p.y2-p.y)*fx.trailLength;}
  if(kind==='cloudmark'&&fx.stormLastRadius&&p.lastMark)p.r*=fx.stormLastRadius;
  if(kind==='watercurrent'&&fx.currentForce)p.forceScale=fx.currentForce;
  if(kind==='decoy'&&fx.decoyHp){p.hp*=fx.decoyHp;p.maxHp=p.hp;}
  if(kind==='mycelium'&&fx.webPulse){p.webPulse=fx.webPulse;p.slowScale=fx.webSlowTicks;}
  p.evolutionId=b.evolution.kind;p.evolutionRoot=b.evolution.root;
}
export function evolutionSnapshot(a,b){const s=b.evolution;return {kind:s.kind,name:s.name,value:Math.round(s.value*10)/10,max:s.max,stage:s.stage,ready:s.ready,active:s.activeUntil>=a.tick,activeUntil:s.activeUntil,recoveryUntil:s.recoveryUntil,activations:s.activations};}
