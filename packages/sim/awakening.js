import {awakeningFor,AWAKENINGS} from '../content/awakening.js';

const TAU=Math.PI*2,clamp=(v,l,h)=>Math.max(l,Math.min(h,v));
const angle=(a,b)=>Math.atan2(b.y-a.y,b.x-a.x);
const active=(a,b)=>b.awakeningState?.status==='active'&&b.awakeningState.activeUntil>=a.tick;
const definition=b=>AWAKENINGS[b.classId];
const has=(b,kind)=>definition(b)?.actionKinds.includes(kind);
const singleHit=new Set(['crimson','tide','mace','elastic','chain','portal','berserk','pendulum','titan','curse','vampire','fracture','combo','hourglass','greatsword']);
function event(a,b,type,c,extra={}){c.emit(a,type,definition(b).id,b,null,b.x,b.y,{awakeningId:definition(b).id,reasonTags:['awakening'],...extra});}
export function configureAwakening(b){
  const def=awakeningFor(b);
  b.awakeningState={id:def?.id??null,name:def?.name??'',status:def?'charging':'locked',ready:false,used:false,triggerCount:0,readyAt:-1,activeUntil:-1,recoveryUntil:-1,reason:def?'고유 진화 조건':'합법 T1 폼 필요',modifiers:{},queue:[],seen:[],rootDamage:{},budgetDamage:{},applied:0,healing:0,actionCount:0};
}
function arm(a,b,c,reason,lethal=false){
  const s=b.awakeningState,d=definition(b);if(!s||s.status!=='charging'||!awakeningFor(b)||!b.alive||b.hp<=0&&!lethal)return;
  s.status='ready';s.ready=true;s.readyAt=a.tick;s.triggerCount++;s.reason=reason;s.deadline=a.tick+480;
  event(a,b,'awakening-ready',c,{duration:d.telegraphTicks,trigger:reason});
}
export function awakeningSignal(a,b,signal,detail={},c){
  const e=signal==='event'?detail:null;
  if(signal==='evo-ready'||signal==='evo-activate'||e&&['evo-ready','evo-activate'].includes(e.type)){
    // A recovery cannot spend its one chance while the fighter is healthy.
    // Berserk likewise telegraphs its combined condition, not early chip damage.
    if(!['phoenix','rewind'].includes(b.classId)&&(b.classId!=='berserk'||b.hp/b.maxHp<=.4||b.rage>=60))arm(a,b,c,'진화 조건 달성');
  }
  if(e?.type==='heal'&&e.kind==='mythic-lifesteal'&&e.healing>0&&b.awakeningState?.used)b.awakeningState.healing+=e.healing;
  if(signal==='death'&&['ready','active'].includes(b.awakeningState?.status)){
    const s=b.awakeningState,reason=s.ready?'death-before-action':'death';
    s.status='cancelled';s.ready=false;s.queue=[];s.modifiers={};s.reason='탈락';s.activeUntil=a.tick-1;b.awakeningUntil=a.tick-1;
    event(a,b,'awakening-end',c,{reason});
  }
}
function schedule(b,at,kind,props={}){const q=b.awakeningState.queue;if(q.length<8)q.push({at,kind,...props});}
function strike(a,b,target,kind,power,c,props={}){if(target?.alive&&target.hp>0)c.hit(a,b,target,kind,power,b,{reactive:true,awakeningId:definition(b).id,attackId:b.awakeningState.root,...props});}
function nearest(a,b,c,range=Infinity){return c.nearby(a,b,range,b,1)[0];}
function recoil(b,amount){const theta=b.aim??b.heading;b.kx-=Math.cos(theta)*amount;b.ky-=Math.sin(theta)*amount;}
function begin(a,b,kind,c,detail){
  const s=b.awakeningState,d=definition(b);s.status='active';s.ready=false;s.used=true;s.activeUntil=a.tick+d.durationTicks;s.modifiers={...d.modifiers};s.reason=d.effect;s.root=`${a.id}:${b.id}:mythic`;s.actionCount++;s.startTick=a.tick;s.actionKind=kind;s.firstRoot=null;s.objectCount=0;s.consumed=false;s.targetId=detail?.target?.id??detail?.targetId??null;
  b.awakeningUsed=true;b.awakeningUntil=s.activeUntil;
  event(a,b,'awakening-start',c,{rootAttackId:s.root,duration:d.durationTicks,action:kind,modifiers:s.modifiers,vfx:d.vfx,sfx:d.sfx});
  if(['double-dash','cross-dash'].includes(d.special)){
    const theta=(b.aim??b.heading)+(d.special==='cross-dash'?Math.PI*.5:0);
    schedule(b,a.tick+30,'dash-warning',{angle:theta});schedule(b,a.tick+48,'dash',{angle:theta});
  }
  if(d.special==='triad-wave'){
    for(let i=0;i<3;i++)c.shoot(a,b,'mythic-triad',b.angle+i*TAU/3,{shotR:5,shotSpeed:285,shotLife:45,power:.32,maxTargets:1,rootAttackId:s.root,projectile:{awakeningId:d.id,mythicOneTarget:true}});
  }
  if(d.special==='polar-fracture')schedule(b,a.tick+24,'frost-shatter',{x:b.x,y:b.y,range:(b.cl.range??80)*1.08});
  if(d.special==='finale'){schedule(b,a.tick+18,'beat',{index:2,x:b.x,y:b.y});schedule(b,a.tick+36,'beat',{index:3,x:b.x,y:b.y});}
  if(d.special==='greater-familiar'){
    const familiar=a.objects.find(o=>o.owner===b&&o.kind==='familiar');
    if(familiar){familiar.greaterUntil=s.activeUntil;familiar.awakeningId=d.id;familiar.r=10;familiar.fireIntervalScale=1;familiar.expires=Math.min(familiar.expires,s.activeUntil);}
  }
  if(d.special==='giant-impact'&&b.state.large){b.r=Math.min(22,b.r*1.12);b.x=clamp(b.x,a.inset+b.r,a.width-a.inset-b.r);b.y=clamp(b.y,a.inset+b.r,a.height-a.inset-b.r);}
  if(d.special==='resolve')b.rageUntil=Math.max(b.rageUntil,a.tick+60);
  if(d.special==='anchor'){b.kx=0;b.ky=0;}
  if(d.special==='complete-form'&&b.state.form===2)s.modifiers.guard=1.25;
  if(d.special==='last-card'&&b.state.card===0){s.modifiers.guard=1.18;b.state.guardUntil=Math.max(b.state.guardUntil??0,a.tick+115);}
}
export function awakeningAction(a,b,kind,c,detail={}){
  const s=b.awakeningState,d=definition(b);if(!s||!d||!awakeningFor(b)||!b.alive||(b.hp<=0&&!(b.classId==='phoenix'&&kind==='reform')))return false;
  // Reformation and rewind augment the existing once-only action, never heal
  // or resurrect independently. Their valid action is itself the prerequisite.
  if((b.classId==='phoenix'&&kind==='reform'&&!b.state.revived)||(b.classId==='rewind'&&kind==='rewind'&&!b.state.used))arm(a,b,c,b.classId==='phoenix'?'최초 치명 피해':'실제 피해 손실',b.classId==='phoenix');
  if(s.status!=='ready'||a.tick-s.readyAt<d.telegraphTicks||!has(b,kind))return false;
  if(b.classId==='berserk'&&b.hp/b.maxHp>.4&&b.rage<60)return false;
  if(b.classId==='captor'&&(b.state.held?.length??0)<2)return false;
  if(b.classId==='star'&&!b.charge)return false;
  if(b.classId==='titan'&&!b.state.large&&kind!=='resize')return false;
  if(b.classId==='thorn'&&!a.balls.some(t=>[...t.dots.values()].some(dot=>dot.owner===b&&dot.kind==='poison'&&dot.stacks>=2)))return false;
  begin(a,b,kind,c,detail);return true;
}
export function awakeningScale(b,key){return b.awakeningState?.status==='active'&&!(b.classId==='tide'&&b.awakeningState.primaryResolved)&&Object.hasOwn(b.awakeningState.modifiers,key)?b.awakeningState.modifiers[key]:null;}
export function awakeningTick(a,b,c){
  const s=b.awakeningState;if(!s)return;
  if(!b.alive||b.hp<=0){
    awakeningSignal(a,b,'death',{},c);return;
  }
  if(s.status==='charging'&&b.classId==='berserk'&&(b.evolution?.activations>0||b.evolution?.ready)&&(b.hp/b.maxHp<=.4||b.rage>=60))arm(a,b,c,'유효 투지와 결정적 피해 조건');
  if(s.status==='ready'&&a.tick>s.deadline){s.status='cancelled';s.ready=false;s.reason='준비 후 유효 행동 없음';event(a,b,'awakening-end',c,{reason:'ready-expired'});}
  if(s.status!=='active')return;
  for(const q of s.queue.filter(q=>q.at<=a.tick)){
    if(q.kind==='dash-warning')event(a,b,'awakening-path',c,{angle:q.angle,r:Math.min(425,b.cl.dashSpeed??390)*Math.min(30,b.cl.dashTicks??25)/60,duration:18,rootAttackId:s.root});
    if(q.kind==='dash'){b.aim=q.angle;b.vx=Math.cos(q.angle)*Math.min(425,b.cl.dashSpeed??390);b.vy=Math.sin(q.angle)*Math.min(425,b.cl.dashSpeed??390);b.dashUntil=a.tick+Math.min(30,b.cl.dashTicks??25);event(a,b,'awakening-dash',c,{angle:q.angle,duration:b.dashUntil-a.tick,rootAttackId:s.root});}
    if(q.kind==='frost-shatter')for(const t of c.nearby(a,q,q.range,b,4))if(t.slowUntil>=a.tick)strike(a,b,t,'mythic-frost-shatter',.28,c,{push:45});
    if(q.kind==='beat'){event(a,b,'awakening-beat',c,{x:q.x,y:q.y,beat:q.index,r:b.cl.range??95,rootAttackId:s.root});for(const t of c.nearby(a,q,b.cl.range??95,b,3))strike(a,b,t,'mythic-beat',.18,c,{push:q.index===3?75:0});}
    if(q.kind==='chain-break'){const t=a.index.get(q.targetId);if(t?.alive&&Math.hypot(t.x-b.x,t.y-b.y)<140)strike(a,b,t,'mythic-chain-break',.25,c,{push:155});b.tether=null;}
    if(q.kind==='exit-cross'){for(const t of c.nearby(a,q,55,b,2))strike(a,b,t,'mythic-exit-cross',.24,c,{push:50});}
    if(q.kind==='flare'){for(const t of c.nearby(a,q,32,b,3))if(t.id!==q.exclude)strike(a,b,t,'mythic-flare',.22,c,{push:70});}
    if(q.kind==='web-bloom'){for(const t of c.nearby(a,q,30,b,2))strike(a,b,t,'mythic-web-bloom',.16,c,{slowTicks:24,slowFactor:.75});}
  }
  s.queue=s.queue.filter(q=>q.at>a.tick);
  if(a.tick>s.activeUntil){
    s.status='spent';s.modifiers={};s.queue=[];s.recoveryUntil=a.tick+definition(b).recoveryTicks;s.reason='사용 완료';
    if(['mace','greatsword','combo','reactor','saw'].includes(b.classId))b.next=Math.max(b.next,s.recoveryUntil);
    if(b.classId==='reactor'){b.state.coolUntil=s.recoveryUntil;b.state.heat=0;}
    if(b.classId==='saw')b.state.overheatUntil=Math.max(b.state.overheatUntil??0,s.recoveryUntil);
    if(b.classId==='titan'&&b.state.large){b.r=19;b.cl.mass=1.7;}
    event(a,b,'awakening-end',c,{rootAttackId:s.root,reason:'consumed',applied:s.applied,healing:s.healing});
  }
}
export function awakeningObject(a,b,kind,props,c){
  awakeningAction(a,b,kind,c,props);
  if(!active(a,b)||!has(b,kind))return props;
  const s=b.awakeningState,d=definition(b);s.objectCount++;
  const limit=['prism','reactor','storm'].includes(b.classId)?3:['captor','star'].includes(b.classId)?2:1;
  if(s.objectCount>limit)return props;
  // Equivalent geometry upgrades replace evolution on this action. Never
  // multiply an evolved projectile radius by the mythic radius again.
  const base=props._baseAwakening;
  if(base)for(const key of ['x','y','r','vx','vy','expires','x2','y2','hp','maxHp'])if(base[key]!=null)props[key]=base[key];
  props.awakeningId=d.id;props.awakeningRoot=s.root;
  const speed=factor=>{props.vx*=factor;props.vy*=factor;};
  switch(d.special){
    case 'deepcannon':props.r*=1.35;recoil(b,90);break;
    case 'crystal-shard':props.r*=1.4;props.reflected=1;break;
    case 'worldseed':props.r*=1.22;props.mythicRange=(b.cl.range??35)*1.28;props.expires=Math.min(props.expires,a.tick+120);break;
    case 'singularity':props.r*=1.12;props.mythicPull=1.22;props.mythicRange=(b.cl.coreRange??47)*1.2;break;
    case 'refraction':props.refractAt=a.tick+14+s.objectCount*3;props.refractAngle=(s.objectCount-2)*.27;props.rootAttackId=s.root;props.mythicOneTarget=true;break;
    case 'eclipse-slash':props.r*=1.45;props.push=75;recoil(b,45);break;
    case 'greater-familiar':{
      props.r=10;props.fireIntervalScale=1;props.greaterUntil=s.activeUntil;props.expires=Math.min(props.expires,s.activeUntil);
      // Evolution can reuse an existing familiar before this hook. Apply the
      // final mythic shape to that same object, not discarded spawn props.
      const familiar=props.upgradedExistingId&&a.objects.find(o=>o.id===props.upgradedExistingId&&o.owner===b&&o.kind==='familiar');
      if(familiar)Object.assign(familiar,{r:10,fireIntervalScale:1,greaterUntil:s.activeUntil,awakeningId:d.id,awakeningRoot:s.root,upgradeUntil:null,expires:Math.min(familiar.expires,s.activeUntil)});
      break;
    }
    case 'constellation-return':props.r*=1.2;props.push=85;props.reflected=1;recoil(b,35);break;
    case 'guardian-return':props.returnSpeed=380;props.turnAt=a.tick+26;props.r*=1.15;break;
    case 'final-salvo':{const speed0=Math.hypot(props.vx,props.vy);props.vx=Math.cos(b.aim)*speed0;props.vy=Math.sin(b.aim)*speed0;props.r*=1.12;props.rootAttackId=s.root;props.mythicOneTarget=true;b.state.coolUntil=a.tick+180;recoil(b,s.objectCount===1?85:0);break;}
    case 'psychic-return':speed(1.12);props.push=95;props.reflected=1;break;
    case 'rampart':if(props.y2!=null){const mid=(props.y+props.y2)/2,half=Math.min(43,(props.y2-props.y)*.6);const low=clamp(mid-half,a.inset+18,a.height-a.inset-18),high=clamp(mid+half,a.inset+18,a.height-a.inset-18);if(!a.balls.some(t=>t.alive&&Math.abs(t.x-props.x)<t.r+8&&t.y>low-t.r&&t.y<high+t.r)){props.y=low;props.y2=high;}props.expires=Math.min(props.expires+18,a.tick+215);}break;
    case 'complete-form':if(b.state.form===1){props.r*=1.3;props.push=65;}break;
    case 'ash-sun':props.r=Math.min(60,props.r*1.25);props.expires=Math.min(props.expires,a.tick+90);break;
    case 'last-card':if(b.state.card===1){props.r*=1.25;props.maxTargets=Math.min(2,(props.maxTargets??1)+1);}break;
    case 'point-pierce':speed(1.12);props.r=Math.max(3,props.r*.85);props.maxTargets=Math.min(3,(props.maxTargets??2)+1);props.push=100;recoil(b,110);break;
    case 'light-seal':if(props.x2!=null){const dx=props.x2-props.x,dy=props.y2-props.y;props.x2=clamp(props.x2+dx*.16,a.inset+8,a.width-a.inset-8);props.y2=clamp(props.y2+dy*.16,a.inset+8,a.height-a.inset-8);props.expires=Math.min(props.expires+15,a.tick+90);}break;
    case 'perfect-copy':props.r*=1.22;props.push=50;break;
    case 'judgment':if(s.objectCount===3){props.r*=1.3;props.power*=1.12;props.mythicFinal=true;}break;
    case 'great-current':props.currentPower=1.5;props.expires=Math.min(props.expires,a.tick+100);break;
    case 'mirror-guard':props.hp=Math.min(42,(props.hp??24)*1.4);props.maxHp=props.hp;props.r=Math.min(14,props.r*1.1);break;
    case 'web-bloom':{const nodes=a.objects.filter(o=>o.owner===b&&o.kind==='mycelium').slice(0,3);nodes.forEach((o,i)=>schedule(b,a.tick+12+i*8,'web-bloom',{x:o.x,y:o.y}));break;}
  }
  event(a,b,'awakening-shape',c,{rootAttackId:s.root,action:kind,r:props.r,x2:props.x2,y2:props.y2,hp:props.hp,expires:props.expires});
  return props;
}
export function awakeningHit(a,h,c){
  const b=h.source;if(!b)return;
  awakeningAction(a,b,h.kind,c,{target:h.target});
  const s=b.awakeningState,d=definition(b),marked=h.awakeningId||h.projectile?.awakeningId;
  if(!s||(!active(a,b)&&!marked)||(!has(b,h.kind)&&!marked))return;
  if(s.primaryResolved&&singleHit.has(b.classId)&&!marked)return;
  if(h.kind==='pressure'||!h.target?.alive)return;
  h.awakeningId=d.id;h.awakeningRoot=s.root;
  if(d.modifiers.push&&h._basePush!=null)h.push=h._basePush*d.modifiers.push;
  if(h.projectile?.mythicOneTarget){const key=`projectile/${h.projectile.awakeningRoot??s.root}/${h.target.id}`;if(s.seen.includes(key)){h.cancelled=true;return;}s.seen.push(key);}
  if(s.seen.length>64)s.seen.splice(0,s.seen.length-64);
  switch(d.special){
    case 'flare':if(!s.consumed){schedule(b,a.tick+1,'flare',{x:h.x,y:h.y,exclude:h.target.id});s.consumed=true;h.push=Math.max(h.push??0,110);}break;
    case 'frontwave':if(Math.cos(angle(b,h.target)-(b.heading??0))<0){h.cancelled=true;return;}break;
    case 'polarity':if(!s.consumed){h.push=-75;s.consumed=true;}break;
    case 'earthbreak':if(h.kind==='mace'){h.wall=true;h.push=Math.min(360,(h.push??215)*1.1);}break;
    case 'poison-bloom':if(!s.consumed){const entries=[...h.target.dots.entries()].filter(([,dot])=>dot.owner===b&&dot.kind==='poison');for(const [key,dot] of entries){h.power+=Math.min(.28,dot.power*dot.stacks);h.target.dots.delete(key);}s.consumed=true;h.push=45;}break;
    case 'history-echo':h.push=70;h.power*=1.12;break;
    case 'giant-punch':if(!s.consumed){recoil(b,90);s.consumed=true;}break;
    case 'radiant-beam':if(!s.consumed){recoil(b,120);s.consumed=true;}break;
    case 'exit-cross':if(!s.consumed){schedule(b,a.tick+8,'exit-cross',{x:b.x,y:b.y});s.consumed=true;}break;
    case 'chain-break':if(!s.consumed){schedule(b,a.tick+26,'chain-break',{targetId:h.target.id});s.consumed=true;}break;
    case 'resolve':if(!s.consumed&&['body','ragebody'].includes(h.kind)){h.push=190;s.consumed=true;b.rage=0;b.rageUntil=a.tick+1;}break;
    case 'crescent-swing':h.push=Math.max(h.push??0,190);break;
    case 'complete-form':if(b.state.form===0){h.push=140;}break;
    case 'giant-impact':if(!s.consumed&&b.state.large){h.push=230;s.consumed=true;}break;
    case 'knot-release':h.push=70;h.power=Math.min(1.5,h.power*1.15);break;
    case 'last-card':if(b.state.card===2){h.slowTicks=Math.min(90,(h.slowTicks??75)+15);h.push=-30;}break;
    case 'perfect-copy':if(h.kind==='copy-cleave')h.push=Math.max(100,h.push??0);if(h.kind==='copy-cold')h.slowTicks=45;break;
    case 'white-fracture':if(h.kind==='ice-shatter'){h.push=95;h.power=Math.min(1.05,h.power*1.2);}break;
    case 'heaven-finisher':if(h.kind==='combo-finish'){h.push=245;s.consumed=true;b.next=Math.max(b.next,a.tick+100);}break;
  }
}
// Reserve the same root budget before side effects/impulse. The later actual
// amount can be smaller from simultaneous overkill; it can never exceed it.
export function awakeningRemainingDamage(a,h,value){
  const b=h.source,s=b?.awakeningState,d=definition(b??{});
  if(!s?.used||!d||!(h.awakeningId||h.projectile?.awakeningId)||value<=0)return value;
  const key=h.target.id,cap=Math.min(b.atk*d.maxTargetPower,h.target.maxHp*d.maxTargetHpFraction),used=s.budgetDamage[key]??0;
  return Math.max(0,Math.min(value,cap-used));
}
export function awakeningDamageBudget(a,h,value){
  const permitted=awakeningRemainingDamage(a,h,value),s=h.source?.awakeningState;
  if(s?.used&&(h.awakeningId||h.projectile?.awakeningId)&&permitted>0)s.budgetDamage[h.target.id]=(s.budgetDamage[h.target.id]??0)+permitted;
  return permitted;
}
export function awakeningAfterHit(a,h,amount,c){
  const b=h.source,s=b?.awakeningState;if(!s||!h.awakeningId||amount<=0)return;
  s.applied+=amount;const key=`${h.attackId}/${h.target.id}`;s.rootDamage[key]=(s.rootDamage[key]??0)+amount;
  if(Object.keys(s.rootDamage).length>32)delete s.rootDamage[Object.keys(s.rootDamage)[0]];
  event(a,b,'awakening-hit',c,{rootAttackId:h.attackId,targetId:h.target.id,damage:amount,impulse:h.push??0,action:h.kind});
  if(singleHit.has(b.classId)&&has(b,h.kind)&&!s.primaryResolved&&(b.classId!=='berserk'||['body','ragebody'].includes(h.kind))){s.primaryResolved=true;s.recoveryUntil=Math.max(a.tick+definition(b).recoveryTicks,s.activeUntil+1);b.next=Math.max(b.next,s.recoveryUntil);}
  if(b.classId==='vampire'&&!s.consumed&&['body','ragebody'].includes(h.kind)&&b.hp>0){s.consumed=true;const healing=Math.min(amount*.22,b.maxHp*.025,b.maxHp-b.hp);if(healing>0){a.healing??=[];a.healing.push({ball:b,amount:healing,kind:'mythic-lifesteal'});}}
}
export function awakeningSnapshot(a,b){
  const s=b.awakeningState;if(!s||s.status==='locked')return {id:null,name:'',status:'locked',ready:false,used:false,activeUntil:-1,reason:s?.reason??'합법 T1 폼 필요'};
  return {id:s.id,name:s.name,status:s.status,ready:s.ready,used:s.used,activeUntil:s.activeUntil,recoveryUntil:s.recoveryUntil,triggerCount:s.triggerCount,reason:s.reason,actionCount:s.actionCount,applied:Math.round(s.applied*10)/10,healing:Math.round(s.healing*10)/10};
}
