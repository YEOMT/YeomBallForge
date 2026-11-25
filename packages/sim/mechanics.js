import {NEW_PROFILES} from '../content/new-profiles.js';
import {COMBAT,AWAKENING_PROFILES} from '../content/classes.js';
const ids=new Set(NEW_PROFILES.map(p=>p.id));
const TAU=Math.PI*2;
const sq=(x,y)=>x*x+y*y;
const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const direct=h=>h.reasonTags?.includes('direct');
export const COPYABLE_ATTACKS=Object.freeze({ring:'cleave',mace:'cleave',thorn:'cleave',trinity:'cleave',saw:'cleave',greatsword:'cleave',elastic:'cleave',blade:'crescent',frost:'coldwave',fracture:'coldwave',cannon:'bolt',sniper:'bolt'});
function heal(a,b,amount,c,kind){const value=Math.max(0,Math.min(amount,b.maxHp-b.hp));if(!value)return;b.hp+=value;c.emit(a,'heal',kind,b,b,b.x,b.y,{healing:value});}
function target(a,b,c){return ['returner','reactor','sniper','captor'].includes(b.classId)?c.aimTarget(a,b):c.nearby(a,b,Infinity,b,1)[0];}
function aimAt(b,t){return Math.atan2(t.y-b.y,t.x-b.x);}
function ray(a,b,angle,range,width,power,kind,c,extra={}){
  const dx=Math.cos(angle),dy=Math.sin(angle);
  for(const t of c.nearby(a,b,range+30,b,4)){
    const x=t.x-b.x,y=t.y-b.y,along=x*dx+y*dy;
    if(along>=0&&along<=range&&Math.abs(x*dy-y*dx)<=t.r+width)c.hit(a,b,t,kind,power,b,extra);
  }
  c.emit(a,'skill',kind,b,null,b.x,b.y,{endX:b.x+dx*range,endY:b.y+dy*range,angle,r:width});
}
function arc(a,b,angle,range,halfAngle,power,kind,c,extra={}){
  for(const t of c.nearby(a,b,range,b,4))if(Math.abs(angleDelta(aimAt(b,t),angle))<=halfAngle)c.hit(a,b,t,kind,power,b,extra);
  c.emit(a,'skill',kind,b,null,b.x,b.y,{angle,r:range,halfAngle});
}
function warning(a,b,kind,c,props){c.emit(a,'skill',kind,b,null,b.x,b.y,props);}
export function newTimer(a,b,c){
  const s=b.state,t=a.tick,cl=b.cl,id=b.classId;
  if(b.level===19&&!b.awakeningUsed&&b.hp/b.maxHp<=COMBAT.awakeningThreshold&&AWAKENING_PROFILES.includes(id)){
    b.awakeningUsed=true;b.awakeningUntil=t+COMBAT.awakeningTicks;c.emit(a,'skill','awakening',b,null,b.x,b.y,{duration:COMBAT.awakeningTicks,power:COMBAT.awakeningPower});
  }
  if(!ids.has(id))return false;
  if(s.queued){for(const q of s.queued){if(q.at<=t&&q.target.alive)c.hit(a,b,q.target,q.kind,q.power,b,{reactive:true,attackId:q.root});}s.queued=s.queued.filter(q=>q.at>t);}
  if(id==='rewind'&&t%15===0){s.history??=[];s.history.push({x:b.x,y:b.y,hp:b.hp});if(s.history.length>9)s.history.shift();}
  if(id==='captor'){
    s.held??=[];
    for(const o of [...a.objects])if(!o.field&&o.owner!==b&&!o.reflected&&!o.returning&&s.held.length<2&&sq(o.x-b.x,o.y-b.y)<48**2){
      a.objects.splice(a.objects.indexOf(o),1);s.held.push({power:Math.min(1.2,o.power),kind:o.kind,rootAttackId:o.rootAttackId??o.id});
      s.releaseAt??=t+60;c.emit(a,'block','capture',b,o.owner,o.x,o.y,{blocked:0,rootAttackId:o.rootAttackId??o.id});
    }
    if(s.held.length&&t>=s.releaseAt){const enemy=target(a,b,c);if(enemy)s.held.forEach((o,i)=>c.shoot(a,b,'captured',aimAt(b,enemy)+(i-.5)*.15,{power:o.power*.75,shotSpeed:280,shotLife:65,reflected:1,rootAttackId:o.rootAttackId}));s.held=[];s.releaseAt=null;}
  }
  if(id==='saw'&&(s.lastContact??-999)<t-60)s.heat=0;
  if(t<b.next)return true;
  const enemy=target(a,b,c);
  switch(id){
    case 'returner':
      if(s.away){b.next=t+8;break;}
      if(enemy){c.shoot(a,b,'returnshield',aimAt(b,enemy),{power:cl.power,shotSpeed:cl.shotSpeed,shotLife:180,shotR:9,maxTargets:2,projectile:{returnShield:true,returning:false,turnAt:t+35}});s.away=true;}
      b.next=t+cl.cooldown;break;
    case 'pendulum': {
      if(s.swing){b.next=t+8;break;}
      const edges=[{x:0,y:b.y,d:b.x},{x:a.width,y:b.y,d:a.width-b.x},{x:b.x,y:0,d:b.y},{x:b.x,y:a.height,d:a.height-b.y}].sort((x,y)=>x.d-y.d);
      const anchor=edges[0];s.swing={x:anchor.x,y:anchor.y,r:Math.max(b.r+2,anchor.d),angle:Math.atan2(b.y-anchor.y,b.x-anchor.x),until:t+48};
      c.emit(a,'skill','tether-swing',b,null,b.x,b.y,{fromX:anchor.x,fromY:anchor.y,duration:48});b.next=t+cl.cooldown;break;
    }
    case 'reactor':
      if((s.coolUntil??0)>t){b.next=s.coolUntil;break;}
      if(!s.aiming){s.aiming=true;b.aim=enemy?aimAt(b,enemy):b.heading;b.next=t+cl.windup;warning(a,b,'salvocharge',c,{angle:b.aim});}
      else{for(const angle of [-.24,0,.24])c.shoot(a,b,'missile',b.aim+angle,{power:cl.power,shotSpeed:cl.shotSpeed,shotLife:65,maxTargets:1});b.kx-=Math.cos(b.aim)*90;b.ky-=Math.sin(b.aim)*90;s.aiming=false;s.heat=(s.heat??0)+1;if(s.heat>=3){s.coolUntil=t+180;s.heat=0;b.cl.speed=120;c.emit(a,'skill','overheat',b,null,b.x,b.y,{duration:180});}else b.cl.speed=172;b.next=s.coolUntil>t?s.coolUntil:t+cl.cooldown;}
      break;
    case 'captor':b.next=t+10;break;
    case 'rewind':
      if(!s.used&&s.history?.length>3&&s.history[0].hp-b.hp>=b.maxHp*.18){const old=s.history[0],fromX=b.x,fromY=b.y;s.used=true;b.x=c.clamp(old.x,a.inset+b.r,a.width-a.inset-b.r);b.y=c.clamp(old.y,a.inset+b.r,a.height-a.inset-b.r);b.px=b.x;b.py=b.y;b.teleportedAt=t;heal(a,b,Math.min(b.maxHp*.12,(old.hp-b.hp)*.5),c,'rewind');c.emit(a,'skill','rewind',b,null,b.x,b.y,{fromX,fromY});}
      b.next=t+15;break;
    case 'mason': {
      let x=c.clamp(b.x+(b.vx>0?65:-65),40,a.width-40),y=c.clamp(b.y,45,a.height-45);
      if(a.balls.some(p=>p.alive&&Math.abs(p.x-x)<p.r+8&&Math.abs(p.y-y)<48)){b.next=t+20;break;}
      c.spawn(a,b,'wallsegment',{x,y:y-35,x2:x,y2:y+35,r:3,armAt:t+20,expires:t+185,warning:true},true);b.next=t+cl.cooldown;break;
    }
    case 'morph':
      s.form=((s.form??-1)+1)%3;s.gapUntil=t+18;b.cl.speed=[218,160,145][s.form];b.cl.bodyPower=[1.1,.7,.85][s.form];
      if(s.form===1&&enemy)c.shoot(a,b,'morphshot',aimAt(b,enemy),{power:.9,shotSpeed:280,shotLife:65});
      c.emit(a,'skill','morph',b,null,b.x,b.y,{form:s.form,nextForm:(s.form+1)%3});b.next=t+cl.cooldown;break;
    case 'titan':
      s.large=!s.large;b.r=s.large?19:9;b.cl.mass=s.large?1.7:.65;b.cl.speed=s.large?135:215;b.cl.bodyPower=s.large?1.4:.7;
      b.x=c.clamp(b.x,a.inset+b.r,a.width-a.inset-b.r);b.y=c.clamp(b.y,a.inset+b.r,a.height-a.inset-b.r);
      c.emit(a,'skill','resize',b,null,b.x,b.y,{r:b.r,large:s.large});b.next=t+cl.cooldown;break;
    case 'phoenix':b.next=t+cl.cooldown;break;
    case 'thermal':
      if(!s.sweeping){s.sweeping=true;s.sweep=0;b.aim=(enemy?aimAt(b,enemy):b.heading)-.35;b.next=t+cl.windup;warning(a,b,'thermalcharge',c,{angle:b.aim+.35,r:cl.range});}
      else {ray(a,b,b.aim,cl.range,8*(b.trait?.id==='pulse_focus'?b.trait.params.width:1),cl.power,'thermal',c);b.aim+=.175;if(++s.sweep>=5){s.sweeping=false;b.next=t+cl.cooldown;}else b.next=t+12;}
      break;
    case 'curse':if(enemy&&Math.hypot(enemy.x-b.x,enemy.y-b.y)<85)c.hit(a,b,enemy,'curse-touch',cl.power,b);b.next=t+cl.cooldown;break;
    case 'cards':
      s.card=((s.card??-1)+1)%3;
      if(s.card===0)s.guardUntil=t+100;
      if(s.card===1&&enemy)c.shoot(a,b,'cardshot',aimAt(b,enemy),{power:.9,shotSpeed:285,shotLife:65});
      if(s.card===2&&enemy&&Math.hypot(enemy.x-b.x,enemy.y-b.y)<105)c.hit(a,b,enemy,'cardbind',.45,b,{slowTicks:75,slowFactor:.7});
      c.emit(a,'skill','card',b,null,b.x,b.y,{card:s.card,nextCard:(s.card+1)%3});b.next=t+cl.cooldown;break;
    case 'saw':b.next=t+10;break;
    case 'sniper':
      if(!s.aiming){s.aiming=true;b.aim=enemy?Math.atan2(enemy.y+(enemy.vy??0)*.22-b.y,enemy.x+(enemy.vx??0)*.22-b.x):b.heading;b.next=t+cl.windup;warning(a,b,'snipercharge',c,{angle:b.aim,r:350});}
      else{c.shoot(a,b,'snipe',b.aim,{power:cl.power,shotSpeed:cl.shotSpeed,shotLife:45,shotR:4,maxTargets:2});b.kx-=Math.cos(b.aim)*70;b.ky-=Math.sin(b.aim)*70;s.aiming=false;b.next=t+cl.cooldown;}
      break;
    case 'trail':
      if(s.point)c.spawn(a,b,'lighttrail',{x:s.point.x,y:s.point.y,x2:b.x,y2:b.y,r:2,expires:t+70,power:cl.power,hit:new Set()},true);
      s.point={x:b.x,y:b.y};b.next=t+cl.cooldown;break;
    case 'mimic':
      if(enemy){s.copied=COPYABLE_ATTACKS[enemy.classId]??null;
        if(!s.copied){c.emit(a,'skill','copy-unavailable',b,enemy,b.x,b.y);b.next=t+cl.cooldown;break;}
        if(s.copied==='cleave')arc(a,b,aimAt(b,enemy),75,1.3,.75,'copy-cleave',c,{push:70});
        else if(s.copied==='coldwave')c.pulse(a,b,'copy-cold',b,70,.4,3,0,false);
        else c.shoot(a,b,s.copied==='crescent'?'copy-crescent':'copybolt',aimAt(b,enemy),{power:.7,shotSpeed:280,shotLife:60,shotR:s.copied==='crescent'?8:5,maxTargets:2});
        if(s.copied==='coldwave')for(const p of c.nearby(a,b,70,b,3)){p.slowUntil=Math.max(p.slowUntil,t+45);p.slowFactor=.8;}
        c.emit(a,'skill','copy',b,enemy,b.x,b.y,{copied:s.copied});}
      b.next=t+cl.cooldown;break;
    case 'greatsword':
      s.travel=(s.travel??0)+Math.hypot(b.x-(s.lastX??b.x),b.y-(s.lastY??b.y));s.lastX=b.x;s.lastY=b.y;
      if(s.aiming){arc(a,b,b.aim,cl.range,b.trait?.id==='pulse_focus'?b.trait.params.width:1,cl.power,'greatslash',c,{push:180});s.travel=0;s.aiming=false;b.next=t+cl.cooldown;}
      else if(s.travel>=70){s.aiming=true;b.aim=enemy?aimAt(b,enemy):b.heading;b.next=t+cl.windup;warning(a,b,'great-charge',c,{angle:b.aim,r:cl.range});}else b.next=t+4;
      break;
    case 'storm':
      if(enemy)for(let i=0;i<3;i++)c.spawn(a,b,'cloudmark',{x:c.clamp(enemy.x+enemy.vx*.08*i,18,a.width-18),y:c.clamp(enemy.y+enemy.vy*.08*i,18,a.height-18),r:28,expires:t+30+i*24,power:cl.power,warning:true},true);
      b.next=t+cl.cooldown;break;
    case 'current':c.spawn(a,b,'watercurrent',{x:b.x,y:b.y,r:65,angle:b.heading+Math.PI/2,expires:t+135},true);b.next=t+cl.cooldown;break;
    case 'decoy': {
      const limit=b.trait?.id==='squad_focus'?b.trait.params.count:2,mine=a.objects.filter(o=>o.owner===b&&o.kind==='decoy');if(mine.length>=limit)a.objects.splice(a.objects.indexOf(mine[0]),1);
      const hp=24*(b.trait?.id==='squad_focus'?b.trait.params.hp:1);
      c.spawn(a,b,'decoy',{x:c.clamp(b.x+35,a.inset+12,a.width-a.inset-12),y:b.y,r:12,hp,maxHp:hp,expires:t+150},true);b.next=t+cl.cooldown;break;
    }
    case 'mycelium':c.spawn(a,b,'mycelium',{x:b.x,y:b.y,r:5,expires:t+230},true);b.next=t+cl.cooldown;break;
    case 'vampire':b.next=t+cl.cooldown;break;
    case 'fracture':if(enemy&&Math.hypot(enemy.x-b.x,enemy.y-b.y)<cl.range)c.hit(a,b,enemy,'frost-touch',cl.power,b,{slowTicks:70,slowFactor:.75});b.next=t+cl.cooldown;break;
    case 'combo':if(enemy&&Math.hypot(enemy.x-b.x,enemy.y-b.y)<cl.range)c.hit(a,b,enemy,'jab',cl.power,b);b.next=t+cl.cooldown;break;
  }
  return true;
}
export function newMove(a,b,c){
  const s=b.state;
  if(s.swing){const p=s.swing;if(a.tick>=p.until){b.vx=-Math.sin(p.angle)*280;b.vy=Math.cos(p.angle)*280;b.dashUntil=a.tick+24;b.cl.dashSpeed=280;s.swing=null;return false;}
    p.angle+=.035;b.x=c.clamp(p.x+Math.cos(p.angle)*p.r,a.inset+b.r,a.width-a.inset-b.r);b.y=c.clamp(p.y+Math.sin(p.angle)*p.r,a.inset+b.r,a.height-a.inset-b.r);b.vx=-Math.sin(p.angle)*172;b.vy=Math.cos(p.angle)*172;return true;}
  return false;
}
export function newContact(a,b,other,c){
  if(b.classId==='pendulum'&&b.dashUntil>=a.tick){c.hit(a,b,other,'swingdash',b.cl.power,b,{push:120});return true;}
  if(b.classId==='morph'&&(b.state.gapUntil??0)>a.tick){c.hit(a,b,other,'morph-gap',b.cl.bodyPower*.5,b);return true;}
  return false;
}
export function newDefend(a,h,damage,c){
  const b=h.target,s=b.state,id=b.classId;let fraction=0;
  if(h.reactive)return null;
  if(id==='returner'){
    if(s.away)return damage;
    return null; // Original directional guard applies while the shield is held.
  }
  if(id==='morph'&&s.form===2&&(s.gapUntil??0)<a.tick)fraction=.25;
  if(id==='cards'&&(s.guardUntil??-1)>=a.tick)fraction=.32;
  if(fraction&&a.tick-b.blockedAt>=35){if(b.trait?.id==='guard_riposte')fraction*=b.trait.params.block;b.blockedAt=a.tick;const blocked=damage*fraction;b.blocked+=blocked;c.emit(a,'block',id,b,h.source,h.x,h.y,{blocked,rootAttackId:h.attackId});c.tacticBlock(a,b,h,blocked,c.emit);return damage-blocked;}
  return null;
}
export function newAfterHit(a,h,amount,c){
  const b=h.source;if(!b||amount<=0||!direct(h))return;const s=b.state,t=a.tick,target=h.target;
  s.seen??=[];if(s.seen.includes(h.attackId))return;s.seen.push(h.attackId);if(s.seen.length>64)s.seen.shift();
  if(b.classId==='saw'&&h.kind==='saw'){
    if(t-(s.lastContact??-999)>60)s.heat=0;s.lastContact=t;s.heat=(s.heat??0)+1;
    if(s.heat>=6){s.overheatUntil=t+100;s.heat=0;c.emit(a,'skill','saw-overheat',b,null,b.x,b.y,{duration:100});}
  }
  if(b.classId==='vampire'&&['body','ragebody'].includes(h.kind)&&t-(s.healAt??-999)>=60){s.healAt=t;a.healing??=[];a.healing.push({ball:b,amount:Math.min(amount*.3,b.maxHp*.035),kind:'lifesteal'});}
  if(['curse','fracture','combo'].includes(b.classId)){
    const same=s.targetId===target.id&&t-(s.markAt??-999)<180;s.targetId=target.id;s.marks=same?(s.marks??0)+1:1;s.markAt=t;s.stored=same?(s.stored??0)+amount:amount;
    const max=b.classId==='combo'?4:3;
    if(s.marks>=max){s.queued??=[];s.queued.push({at:t+(b.classId==='curse'?30:1),target,kind:{curse:'curse-release',fracture:'ice-shatter',combo:'combo-finish'}[b.classId],power:b.classId==='curse'?Math.min(1.3,s.stored/b.atk*.35):b.classId==='fracture'?.8:1.2,root:h.attackId});s.marks=0;s.stored=0;c.emit(a,'skill','marks-release',b,target,target.x,target.y,{rootAttackId:h.attackId});}
  }
}
function segmentHit(o,p,r=0){const dx=o.x2-o.x,dy=o.y2-o.y,l=dx*dx+dy*dy;const t=l?Math.max(0,Math.min(1,((p.x-o.x)*dx+(p.y-o.y)*dy)/l)):0;return sq(p.x-o.x-dx*t,p.y-o.y-dy*t)<(p.r+r)**2;}
export function newField(a,o,live,expired,c){
  if(!o.field||!['wallsegment','lighttrail','cloudmark','watercurrent','decoy','mycelium','phoenixfire'].includes(o.kind))return false;
  const b=o.owner,t=a.tick;
  if(!b.alive||t>=o.expires){
    if(o.kind==='cloudmark'&&b.alive)c.pulse(a,b,'lightningstrike',o,o.r,o.power,3,65);
    expired.add(o);return true;
  }
  if(o.kind==='wallsegment'){
    o.warning=t<o.armAt;if(o.warning)return true;
    for(const p of live)if(segmentHit(o,p,3)&&Math.abs(p.x-o.x)<p.r+4){const left=p.px<o.x;p.x=o.x+(left?-1:1)*(p.r+4);p.vx=(left?-1:1)*Math.abs(p.vx);p.kx=(left?-1:1)*Math.abs(p.kx);c.emit(a,'skill','wall-deflect',b,p,p.x,p.y,{rootAttackId:o.id});}
    for(const shot of a.objects)if(!shot.field&&segmentHit(o,{...shot,r:shot.r??4},3)&&shot.lastWall!==o.id){shot.vx*=-1;shot.lastWall=o.id;c.emit(a,'skill','wall-deflect',b,shot.owner,shot.x,shot.y,{rootAttackId:shot.rootAttackId??shot.id});}
  }
  if(o.kind==='lighttrail')for(const p of live)if(p!==b&&!o.hit.has(p.id)&&segmentHit(o,p,2)){o.hit.add(p.id);c.hit(a,b,p,'trail-cross',o.power,o,{reactive:true,slowTicks:40,slowFactor:.82,attackId:o.id});}
  if(o.kind==='watercurrent'){
    const dx=Math.cos(o.angle),dy=Math.sin(o.angle);
    for(const p of live)if(sq(p.x-o.x,p.y-o.y)<o.r**2){p.kx+=dx*4/p.cl.mass;p.ky+=dy*4/p.cl.mass;if(p.state.currentField!==o.id){p.state.currentField=o.id;c.emit(a,'skill','current-bend',b,p,p.x,p.y,{rootAttackId:o.id,impulse:4/p.cl.mass});}}
    for(const shot of a.objects)if(!shot.field&&sq(shot.x-o.x,shot.y-o.y)<o.r**2){shot.vx+=dx*3;shot.vy+=dy*3;if(shot.currentField!==o.id){shot.currentField=o.id;c.emit(a,'skill','current-bend',b,shot.owner,shot.x,shot.y,{rootAttackId:shot.rootAttackId??shot.id,impulse:3});}}
  }
  if(o.kind==='decoy'){
    for(const shot of [...a.objects])if(!shot.field&&shot.owner!==b&&c.swept(shot.x,shot.y,shot.x+shot.vx/60,shot.y+shot.vy/60,{...o,px:o.x,py:o.y},o.r+shot.r)){
      const damage=shot.owner.atk*shot.power;o.hp-=damage;expired.add(shot);shot.cancelled=true;c.emit(a,'block','decoy',b,shot.owner,o.x,o.y,{blocked:damage,rootAttackId:shot.rootAttackId??shot.id});
    }
    for(const p of live)if(p!==b&&sq(p.x-o.x,p.y-o.y)<(p.r+o.r)**2&&t-(o.contactAt??-999)>30){o.contactAt=t;o.hp-=p.atk*.7;p.vx*=-1;p.vy*=-1;}
    if(o.hp<=0){expired.add(o);c.emit(a,'skill','decoy-break',b,null,o.x,o.y);}
  }
  if(o.kind==='mycelium'){
    const nodes=a.objects.filter(n=>n.owner===b&&n.kind==='mycelium');const i=nodes.indexOf(o),next=nodes[i+1];
    if(next){o.x2=next.x;o.y2=next.y;for(const p of live)if(p!==b&&segmentHit(o,p,2)&&t-(p.state.webAt??-999)>60){p.state.webAt=t;c.hit(a,b,p,'web-cross',b.cl.power,o,{reactive:true,slowTicks:50,slowFactor:.65,attackId:o.id});}}
  }
  if(o.kind==='phoenixfire'&&t-(o.pulseAt??-999)>=30){o.pulseAt=t;c.pulse(a,b,'phoenixfire',o,o.r,.35,3,0,true);}
  return true;
}
export function newProjectile(a,o,live,expired,c){
  if(!o.returnShield)return false;const b=o.owner,t=a.tick;
  if(!b.alive){expired.add(o);return true;}
  if(t>=o.turnAt)o.returning=true;
  if(o.returning){const [nx,ny]=c.unit(b.x-o.x,b.y-o.y);o.vx=nx*330;o.vy=ny*330;if(sq(b.x-o.x,b.y-o.y)<(b.r+o.r+5)**2){expired.add(o);b.state.away=false;b.next=t+Math.ceil(70*(b.trait?.id==='quick_return'?b.trait.params.cooldown:1));c.emit(a,'skill','shield-return',b,null,b.x,b.y);return true;}}
  let x=o.x+o.vx/60,y=o.y+o.vy/60;
  if(x<o.r||x>a.width-o.r){o.vx*=-1;o.returning=true;x=c.clamp(x,o.r,a.width-o.r);}
  if(y<o.r||y>a.height-o.r){o.vy*=-1;o.returning=true;y=c.clamp(y,o.r,a.height-o.r);}
  for(const p of live)if(p!==b&&!o.hit.has(p.id)&&c.swept(o.x,o.y,x,y,p,p.r+o.r)){o.hit.add(p.id);c.hit(a,b,p,'returnshield',o.power,o,{projectile:o,attackId:o.rootAttackId??o.id,push:55});}
  o.x=x;o.y=y;if(t>=o.expires){expired.add(o);b.state.away=false;b.next=t+60;}return true;
}
export function newLethal(a,b,c){if(b.classId!=='phoenix'||b.state.revived)return false;b.state.revived=true;b.hp=b.maxHp*.16;c.emit(a,'heal','phoenix',b,b,b.x,b.y,{healing:b.hp});c.spawn(a,b,'phoenixfire',{r:48,expires:a.tick+90},true);c.emit(a,'skill','reform',b,null,b.x,b.y,{remaining:0});return true;}
export function flushHealing(a,c){for(const h of a.healing??[])if(h.ball.hp>0)heal(a,h.ball,h.amount,c,h.kind);a.healing=[];}
export function newResource(a,b){const s=b.state;
  const resource=(name,value,max,ready=false)=>({name,value,max,ready});
  switch(b.classId){
    case 'mace':return resource('벽 강타',s.wallCharge??0,3,(s.wallCharge??0)>=3);
    case 'tide':return resource('방어 반격',b.charge,2,b.charge>=2);
    case 'trinity':return resource('검격',b.combo,3,b.combo===2);
    case 'beam':case 'bolt':case 'ninja':return resource('차지',b.charge,1,!!b.charge);
    case 'star':return resource('흡수',b.charge,1,!!b.charge);
    case 'berserk':return resource('투지',Math.round(b.rage),100,b.rage>=30);
    case 'reactor':return resource((s.coolUntil??0)>a.tick?'냉각':'열',s.heat??0,3,(s.coolUntil??0)<=a.tick);
    case 'saw':return resource((s.overheatUntil??0)>a.tick?'톱 냉각':'접촉 열',s.heat??0,6,false);
    case 'captor':return resource('포획',s.held?.length??0,2,!!s.held?.length);
    case 'returner':return resource(s.away?'방패 비행':'방패 준비',s.away?0:1,1,!s.away);
    case 'rewind':return resource('되감기',s.used?0:1,1,!s.used);
    case 'phoenix':return resource('재형성',s.revived?0:1,1,!s.revived);
    case 'morph':return resource(['질주','사격','방어'][s.form??0],(s.form??0)+1,3,false);
    case 'cards':return resource('다음 '+['방어','탄환','구속'][((s.card??-1)+1)%3],((s.card??-1)+1)%3+1,3,false);
    case 'titan':return resource(s.large?'거인':'축소',s.large?2:1,2,false);
    case 'curse':case 'fracture':case 'combo':return resource('표식',s.marks??0,b.classId==='combo'?4:3,false);
    case 'greatsword':return resource('이동 축력',Math.min(70,Math.round(s.travel??0)),70,!!s.aiming);
    case 'thermal':case 'sniper':return resource('조준',s.aiming||s.sweeping?1:0,1,!!(s.aiming||s.sweeping));
    default:return null;
  }
}
