import {CLASSES, ELEMENTS} from './packages/content/classes.js';
import {PresentationClock,HpTrail} from './presentation.js';
import {drawOrb} from './orb-materials.js';
import {drawCombatHud} from './combat-hud.js';
import {unlockAudio,audioOptions,releaseAudio,playCombatSound} from './game-audio.js';
export {unlockAudio};

const TAU=Math.PI*2, clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
function circle(ctx,x,y,r,fill,stroke,line=1){
  ctx.beginPath();ctx.arc(x,y,Math.max(.01,r),0,TAU);
  if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=line;ctx.stroke();}
}
function line(ctx,x,y,ex,ey,color,width){
  ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(ex,ey);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
}
function polygon(ctx,r,sides,angle,inner=r){
  ctx.beginPath();
  for(let i=0;i<sides*2;i++){const a=angle+i*Math.PI/sides,d=i%2?inner:r;const x=d*Math.cos(a),y=d*Math.sin(a);i?ctx.lineTo(x,y):ctx.moveTo(x,y);}
  ctx.closePath();
}
const portraits=new Map();
function portrait(b,onload){
  const requested=b.portraitKey||CLASSES[b.classId]?.portraitKey||b.classId||'basic';
  const key=/^[a-z0-9_-]+$/.test(requested)?requested:'basic';
  let entry=portraits.get(key);
  if(!entry){
    const img=new Image();entry={img,ready:false,failed:false,listeners:new Set()};portraits.set(key,entry);
    img.onload=()=>{entry.ready=true;for(const callback of entry.listeners)callback();entry.listeners.clear();};
    img.onerror=()=>{entry.failed=true;entry.listeners.clear();};
    img.src=new URL('./assets/balls/'+key+'.svg',import.meta.url).href;
  }
  if(onload&&!entry.ready&&!entry.failed)entry.listeners.add(onload);
  return entry.ready?entry.img:null;
}
function colorOf(b){const cl=CLASSES[b.classId]||CLASSES.basic;return cl.hidden||b.element==='neutral'?cl.color:ELEMENTS[b.element]?.color||cl.color;}
function sprite(ctx,b,x,y,r,mode='hybrid'){
  const cl=CLASSES[b.classId]||CLASSES.basic,color=colorOf(b),img=portrait(b);
  if(mode!=='portrait'){
    drawOrb(ctx,b,x,y,r);
    if(mode==='orb')return;
    ctx.save();ctx.beginPath();ctx.arc(x,y,r*.46,0,TAU);ctx.clip();if(img)ctx.drawImage(img,x-r*.46,y-r*.46,r*.92,r*.92);ctx.restore();return;
  }
  circle(ctx,x,y,r+1,'#fff','#172033',.9);
  ctx.save();ctx.beginPath();ctx.arc(x,y,r-.7,0,TAU);ctx.clip();
  if(img)ctx.drawImage(img,x-r,y-r,r*2,r*2);
  else{
    const glow=ctx.createRadialGradient(x-r*.25,y-r*.35,0,x,y,r);
    glow.addColorStop(0,'#ffffff');glow.addColorStop(1,color+'35');circle(ctx,x,y,r,glow);
    ctx.fillStyle=color;ctx.font='800 '+r+'px "Segoe UI Symbol",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(b.glyph||cl.icon,x,y+.6);
  }
  ctx.restore();circle(ctx,x,y,r,null,color,1.7);
  if(b.level>=16){ctx.save();ctx.setLineDash([2.5,2.2]);circle(ctx,x,y,r+2.6,null,'#a97908',.8);ctx.restore();}
}
export function drawEmblem(canvas,b){
  if(!canvas)return;
  const w=canvas.clientWidth||240,h=canvas.clientHeight||180,dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
  const c=canvas.getContext('2d');c.scale(dpr,dpr);const r=Math.min(w,h)*.32,cl=CLASSES[b.classId]||CLASSES.basic;
  const glow=c.createRadialGradient(w/2,h/2,r*.1,w/2,h/2,r*1.5);glow.addColorStop(0,cl.color+'70');glow.addColorStop(1,cl.color+'00');circle(c,w/2,h/2,r*1.5,glow);sprite(c,b,w/2,h/2,r);
  const key=b.ballId||b.classId;canvas.dataset.emblem=key;
  portrait(b,()=>{if(canvas.isConnected&&canvas.dataset.emblem===key)drawEmblem(canvas,b);});
}
function pointAt(p,q,t,prevTick,nowTick,walls){
  if(!p)return q;
  let last=p,lastTick=prevTick;
  const tick=prevTick+(nowTick-prevTick)*t;
  for(const wall of walls||[]){
    if(wall.tick<=prevTick||wall.tick>nowTick)continue;
    if(tick<=wall.tick)return mix(last,wall,(tick-lastTick)/Math.max(1,wall.tick-lastTick));
    last=wall;lastTick=wall.tick;
  }
  return mix(last,q,(tick-lastTick)/Math.max(1,nowTick-lastTick));
}
function mix(a,b,t){return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}
function setupObjects(frame){return new Map((frame?.objects||[]).map(o=>[o.id,o]));}
function drawObject(c,o,b){
  const col=b?.color||'#536b8d',r=o.r;
  if(o.x2!=null&&o.y2!=null){c.save();if(o.warning)c.setLineDash([4,3]);line(c,o.x,o.y,o.x2,o.y2,col,o.r*2);c.restore();return;}
  if(['cloudmark','watercurrent','mycelium','phoenixfire'].includes(o.kind)){
    c.save();if(o.warning)c.setLineDash([3,3]);circle(c,o.x,o.y,r,col+'12',col+'bb',1.4);if(o.kind==='watercurrent')line(c,o.x-Math.cos(o.angle)*r*.5,o.y-Math.sin(o.angle)*r*.5,o.x+Math.cos(o.angle)*r*.5,o.y+Math.sin(o.angle)*r*.5,col,2);c.restore();return;
  }
  if(o.kind==='decoy'){circle(c,o.x,o.y,r,col+'66',col,1.4);c.save();c.setLineDash([2,2]);circle(c,o.x,o.y,r+3,null,col,.7);c.restore();return;}
  if(o.kind==='tether'){
    if(b){line(c,b.x,b.y,o.x,o.y,'#334155',1.5);const length=Math.hypot(o.x-b.x,o.y-b.y);for(let t=7;t<length;t+=8){const u=t/length;circle(c,b.x+(o.x-b.x)*u,b.y+(o.y-b.y)*u,2,null,col,.9);}}
    return;
  }
  if(o.kind==='shield'||o.kind==='crystal'){
    c.beginPath();c.arc(o.x,o.y,r,o.angle-.99,o.angle+.99);c.lineWidth=o.ready?3:1;c.strokeStyle=o.ready?col:col+'75';c.stroke();return;
  }
  if(['gravity','seed'].includes(o.kind)){
    circle(c,o.x,o.y,r,col+'12',col+'99',.9);circle(c,o.x,o.y,o.kind==='seed'?3:r*.37,col+'55',col,1);return;
  }
  if(o.kind==='afterimage'){
    c.save();c.setLineDash([3,3]);circle(c,o.x,o.y,r,col+'0d',col+'88',.8);circle(c,o.x,o.y,11,col+'45',col,1);c.restore();return;
  }
  if(o.kind==='familiar'){
    circle(c,o.x,o.y,r,'#352b53',col,1.4);circle(c,o.x-2,o.y-1,1.3,'#fff');circle(c,o.x+2,o.y-1,1.3,'#fff');return;
  }
  c.save();c.translate(o.x,o.y);const ang=o.angle??(b?Math.atan2(o.y-b.y,o.x-b.x):0);c.rotate(ang);
  if(o.kind==='mace'){
    if(b)line(c,0,0,-Math.hypot(o.x-b.x,o.y-b.y),0,'#b7a58a',1.8);
    polygon(c,r,8,0,r*.70);c.fillStyle='#726152';c.fill();c.strokeStyle=col;c.lineWidth=1.6;c.stroke();
  }else if(o.kind==='crescent'){
    c.beginPath();c.arc(-r*.4,0,r,-1.3,1.3);c.strokeStyle=col;c.lineWidth=3.5;c.stroke();
    c.beginPath();c.arc(-r*.4,0,r-2,-1.1,1.1);c.strokeStyle='#fff';c.lineWidth=1;c.stroke();
  }else if(o.kind==='trinity'){
    c.beginPath();c.moveTo(-r*1.6,-r*.45);c.lineTo(r*1.5,0);c.lineTo(-r*1.6,r*.45);c.closePath();c.fillStyle='#f8fafc';c.fill();c.strokeStyle=col;c.lineWidth=1.3;c.stroke();line(c,-r,0,-r*2.2,0,'#26334a',2);
  }else if(o.kind==='starcounter'){
    polygon(c,r,5,0,r*.42);c.fillStyle='#ffe690';c.fill();c.strokeStyle='#a76c00';c.lineWidth=1;c.stroke();
  }else if(o.kind==='shadow'){
    line(c,-r*2.3,0,0,0,col+'66',r);circle(c,0,0,r,'#443065',col,1);
  }else if(['blade','thorn','shard','prism'].includes(o.kind)){
    polygon(c,r,o.kind==='thorn'?5:3,0,o.kind==='thorn'?r*.4:r);c.fillStyle=col;c.fill();
  }else{circle(c,0,0,r,col+'77',col,1.5);circle(c,0,0,r*.32,'#fff');}
  c.restore();
}
export class ArenaView{
  constructor(canvas,options={}){
    this.canvas=canvas;this.ctx=canvas.getContext('2d');
    this.options={reduced:matchMedia('(prefers-reduced-motion:reduce)').matches,sound:false,shake:true,...options};
    this.timeline=new PresentationClock();this.hpTrail=new HpTrail();audioOptions(this,this.options);
    this.fx=[];this.hits=new Map();this.bounds=canvas.getBoundingClientRect();
    this.observer=new ResizeObserver(entries=>{this.bounds=entries[0].contentRect;});this.observer.observe(canvas);
    canvas.tabIndex=0;canvas.title='공을 누르거나 방향키로 선택하여 이름과 체력을 확인하세요.';
    this.pick=e=>{
      const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
      const nearest=(this.targets||[]).map(p=>({...p,distance:Math.hypot(x-p.x,y-p.y)})).sort((a,b)=>a.distance-b.distance)[0];
      if(nearest && nearest.distance<Math.max(20,nearest.r+10))this.selected=nearest.id;
    };
    this.cycle=e=>{
      if(!['ArrowRight','ArrowLeft'].includes(e.key)||!this.targets?.length)return;
      e.preventDefault();const list=this.targets,i=list.findIndex(p=>p.id===this.selected);
      this.selected=list[(i+(e.key==='ArrowRight'?1:-1)+list.length)%list.length].id;
    };
    canvas.addEventListener('pointerdown',this.pick);canvas.addEventListener('keydown',this.cycle);
    this.frameId=requestAnimationFrame(t=>this.frame(t));
  }
  setOptions(o){Object.assign(this.options,o);audioOptions(this,this.options);}
  update(next){
    if(!next)return;
    this.latest=next;this.timeline.push(next);
  }
  accept(next,displayTime){
    const same=this.current?.id===next.id && next.tick>=this.current.tick;
    if(same&&next.tick===this.current.tick)return;
    this.previous=same?this.current:null;this.current=next;this.received=displayTime;
    this.oldBalls=new Map((this.previous?.balls||[]).map(b=>[b.id,b]));
    this.oldObjects=setupObjects(this.previous);this.walls=new Map();
    if(!same){this.seq=0;this.fx.length=0;this.hits.clear();this.view=null;this.hpTrail.reset();}
    for(const e of next.events||[]){
      if(e.type==='wall'){let arr=this.walls.get(e.sourceId);if(!arr)this.walls.set(e.sourceId,arr=[]);arr.push(e);}
      if(e.seq<=this.seq)continue;this.seq=e.seq;
      if(!same)continue;
      if(e.type==='hit' && !['poison','burn','pressure'].includes(e.kind))this.hits.set(e.targetId,{at:this.received,nx:e.nx,ny:e.ny});
      if(e.type!=='pressure'){if(this.fx.length>=(this.options.low?24:96))this.fx.shift();this.fx.push({...e,at:this.received});}
      if(e.type==='hit'&&['mace','wallslam','beam','greatsword','combo-finish'].includes(e.kind)&&!this.options.reduced)this.timeline.stop(50,performance.now());
      if(this.options.sound)playCombatSound(e);
    }
  }
  destroy(){cancelAnimationFrame(this.frameId);this.observer.disconnect();this.canvas.removeEventListener('pointerdown',this.pick);this.canvas.removeEventListener('keydown',this.cycle);this.fx.length=0;this.hits.clear();this.current=null;releaseAudio(this);}
  frame(realNow){
    this.frameId=requestAnimationFrame(t=>this.frame(t));
    if(document.hidden){this.wasHidden=true;return;}
    if(this.wasHidden){this.wasHidden=false;this.timeline.reset(this.latest);this.current=null;}
    const sample=this.timeline.sample(realNow,this.options);if(!sample)return;
    const now=sample.effectTime;this.accept(sample.frame,now);
    const f=this.current, c=this.ctx, d=Math.min(devicePixelRatio||1,this.options.low?1:this.options.reduced?1.25:2);
    const w=this.bounds.width,h=this.bounds.height;if(!f||w<1||h<1)return;
    if(this.canvas.width!==Math.round(w*d)||this.canvas.height!==Math.round(h*d)){this.canvas.width=Math.round(w*d);this.canvas.height=Math.round(h*d);}
    c.setTransform(d,0,0,d,0,0);c.fillStyle='#f1f5f9';c.fillRect(0,0,w,h);
    const prevTick=f.tick,t=sample.alpha,nextBalls=new Map(sample.next.balls.map(b=>[b.id,b]));
    const players=f.balls.filter(b=>b.alive).map(b=>{const next=nextBalls.get(b.id)||b;return {...b,...pointAt(next.teleportedAt>prevTick?null:b,next,t,prevTick,sample.next.tick,sample.next.events?.filter(e=>e.type==='wall'&&e.sourceId===b.id)),color:colorOf(b)};});
    const byId=new Map(players.map(p=>[p.id,p]));
    const colors=new Map(f.balls.map(b=>[b.id,colorOf(b)]));
    let target={x:f.width/2,y:f.height/2,w:f.width+6,h:f.height+6};
    if(f.mode==='rumble' && players.length<=5 && f.balls.length>5 && players.length){
      const xs=players.map(p=>p.x),ys=players.map(p=>p.y),l=Math.max(0,Math.min(...xs)-68),r=Math.min(f.width,Math.max(...xs)+68),top=Math.max(0,Math.min(...ys)-58),bottom=Math.min(f.height,Math.max(...ys)+58);
      target={x:(l+r)/2,y:(top+bottom)/2,w:r-l,h:bottom-top};
    }
    this.view??={...target};for(const k of ['x','y','w','h'])this.view[k]+=(target[k]-this.view[k])*.09;
    const hudHeight=84,scale=Math.min(w/this.view.w,(h-hudHeight)/this.view.h);let ox=w/2-this.view.x*scale,oy=hudHeight+(h-hudHeight)/2-this.view.y*scale;
    if(this.options.shake&&!this.options.reduced&&players.length<=4&&this.fx.some(e=>['wallslam','mace','beam','ragewave','ko'].includes(e.kind)&&now-e.at<85)){ox+=Math.sin(now*.16)*1.6;oy+=Math.cos(now*.12);}
    c.translate(ox,oy);c.scale(scale,scale);
    const s=f.inset, cw=f.width-s*2,ch=f.height-s*2;
    c.fillStyle='#ffffff';c.fillRect(s,s,cw,ch);c.save();c.beginPath();c.rect(s,s,cw,ch);c.clip();
    for(const b of players){
      if(!this.options.reduced&&(b.dash||b.charge||b.level>=5)){
        const theta=Math.atan2(b.vy,b.vx);c.save();c.translate(b.x,b.y);c.rotate(theta);
        c.beginPath();c.moveTo(0,-b.r*.65);c.lineTo(-b.r*(b.dash?3.4:1.9),0);c.lineTo(0,b.r*.65);c.fillStyle=b.color+'63';c.fill();c.restore();
      }
      const hit=this.hits.get(b.id),power=hit?clamp(1-(now-hit.at)/140,0,1):0;
      c.save();c.translate(b.x,b.y);if(power){const a=Math.atan2(hit.ny,hit.nx);c.rotate(a);c.scale(1-.17*power,1+.12*power);c.rotate(-a);}
      sprite(c,b,0,0,b.r,this.options.skin||b.renderMode||'hybrid');if(power>.4)circle(c,0,0,b.r,'#ffffff44');
      // A short, local T1 entrance; never covers the quiz or delays the match.
      if(b.level===19&&f.tick<90){
        const entrance=1-f.tick/90;
        c.save();c.globalAlpha=entrance;
        circle(c,0,0,b.r+5+(this.options.reduced?0:(1-entrance)*17),null,'#b68a20',1.7);
        if(!this.options.low&&!this.options.reduced)for(let i=0;i<6;i++){const a=i*TAU/6+f.tick*.008,r=b.r+10;line(c,Math.cos(a)*r,Math.sin(a)*r,Math.cos(a)*(r+7*entrance),Math.sin(a)*(r+7*entrance),'#e7bb42',1.4);}
        c.restore();
      }
      if(b.id===this.options.playerId||b.id===this.selected)circle(c,0,0,b.r+3.7,null,b.id===this.selected?'#172033':'#2563eb',1.2);
      if(b.charge)circle(c,0,0,b.r+2,null,b.color,1.2);
      if(b.status?.length){const status=b.status.includes('frost')?'#56c9ed':b.status.includes('poison')?'#65a30d':b.status.includes('rage')?'#dc2626':'#ea580c';circle(c,b.r*.72,-b.r*.72,3,status,'#fff',1);}
      c.restore();
      if(b.classId==='beam'&&b.charge){
        c.save();c.setLineDash([5,4]);line(c,b.x,b.y,b.x+Math.cos(b.aim||0)*310,b.y+Math.sin(b.aim||0)*310,b.color+'88',.8);c.restore();
      }
    }
    for(const obj of f.objects){
      const next=sample.next.objects.find(o=>o.id===obj.id),b=byId.get(obj.ownerId);let pos=next?mix(obj,next,t):obj;
      if(b&&(obj.kind==='shield'||obj.kind==='crystal'))pos=b;
      drawObject(c,{...obj,x:pos.x,y:pos.y},b);
    }
    this.fx=this.fx.filter(e=>now-e.at<760);
    for(const e of this.fx){
      if(now-e.at>440||e.kind==='pressure')continue;
      const u=(now-e.at)/440,color=colors.get(e.sourceId)||'#64748b',small=['poison','burn'].includes(e.kind);
      c.save();c.globalAlpha=1-u;
      const r=e.r?Math.max(1,e.r*u):e.type==='ko'?5+26*u:small?2+3*u:2+11*u;
      if(e.kind==='arc'&&e.fromX!=null){line(c,e.fromX,e.fromY,e.x,e.y,'#9a6b00',2.4);line(c,e.fromX,e.fromY,e.x,e.y,'#ffdc5e',1.1);}
      if(e.kind==='beam'&&e.endX!=null){line(c,e.x,e.y,e.endX,e.endY,color,11*(1-u));line(c,e.x,e.y,e.endX,e.endY,'#ffffff',4*(1-u));}
      if(e.kind==='stretch'&&e.fromX!=null){line(c,e.fromX,e.fromY,e.x,e.y,'#7c4426',5);line(c,e.fromX,e.fromY,e.x,e.y,'#f9bf81',3);circle(c,e.x,e.y,6,'#f9bf81','#7c4426',1.2);}
      if(e.kind==='portal'&&e.fromX!=null){circle(c,e.fromX,e.fromY,10+u*11,null,color,2);circle(c,e.x,e.y,16-u*5,null,color,2);}
      if(e.kind==='sonic'){circle(c,e.x,e.y,r*.58,null,color,1.1);circle(c,e.x,e.y,r*.78,null,color,.7);}
      if(e.kind==='icewave')for(let i=0;i<8;i++){const a=i*TAU/8;line(c,e.x+Math.cos(a)*r*.8,e.y+Math.sin(a)*r*.8,e.x+Math.cos(a)*r,e.y+Math.sin(a)*r,'#0891b2',1.4);}
      if(e.kind==='triad')for(let i=0;i<3;i++){c.beginPath();c.arc(e.x,e.y,r,i*TAU/3,i*TAU/3+1.2);c.strokeStyle=color;c.lineWidth=2.3;c.stroke();}
      if(e.kind==='charge')line(c,e.x,e.y,e.x+Math.cos(e.angle)*31,e.y+Math.sin(e.angle)*31,color,1);
      if(e.kind==='absorb'){
        // Inward motion distinguishes absorption from an outward impact ring.
        for(let i=0;i<(this.options.low?3:6);i++){const a=i*TAU/6+e.seq*.13,d=5+22*(1-u);line(c,e.x+Math.cos(a)*d,e.y+Math.sin(a)*d,e.x+Math.cos(a)*(d+5),e.y+Math.sin(a)*(d+5),color,1.6);}
      }else if(e.type==='block'){
        const defender=byId.get(e.sourceId),attacker=byId.get(e.targetId);
        const angle=defender&&attacker?Math.atan2(attacker.y-defender.y,attacker.x-defender.x):0;
        c.beginPath();c.arc(e.x,e.y,5+6*u,angle-1.1,angle+1.1);c.strokeStyle='#0e7490';c.lineWidth=3*(1-u)+.5;c.stroke();
      }
      if(e.kind==='wallslam'&&!this.options.reduced){
        const nx=e.nx||0,ny=e.ny||-1,a=Math.atan2(ny,nx);
        for(let i=0;i<(this.options.low?3:6);i++){const angle=a+(i-2.5)*.4,d=4+u*19;c.fillStyle=color;c.fillRect(e.x+Math.cos(angle)*d,e.y+Math.sin(angle)*d,2.5*(1-u)+.7,2.5*(1-u)+.7);}
      }
      circle(c,e.x,e.y,r,null,e.type==='block'?'#0e7490':color,small?.6:1.3);
      if(!this.options.reduced&&!small&&e.type==='hit'){for(let i=0;i<4;i++){const a=e.seq+i*1.57;line(c,e.x+Math.cos(a)*r,e.y+Math.sin(a)*r,e.x+Math.cos(a)*(r+4),e.y+Math.sin(a)*(r+4),color,1);}}
      c.restore();
    }
    c.restore();c.strokeStyle=f.pressure?'#dc6024':'#26334a';c.lineWidth=1.8;c.strokeRect(s,s,cw,ch);
    c.setTransform(d,0,0,d,0,0);
    drawCombatHud(c,f,w,hudHeight,now,this.hpTrail,this.selected||this.options.playerId);
    const priority=b=>b.id===this.options.playerId?2:b.id===this.selected?1:0;
    const sorted=players.sort((a,b)=>priority(b)-priority(a));
    this.targets=sorted.map(b=>({id:b.id,x:ox+b.x*scale,y:oy+b.y*scale,r:b.r*scale}));
    c.font='700 11px "Segoe UI","Malgun Gothic",sans-serif';c.textAlign='center';c.textBaseline='alphabetic';
    const labels=[];
    for(const b of sorted){
      const x=clamp(ox+b.x*scale,38,w-38),y=clamp(oy+(b.y+b.r)*scale+15,hudHeight+12,h-5);
      const label=String(b.name).slice(0,16),length=c.measureText(label).width+8;
      if(!priority(b)&&labels.some(p=>Math.abs(p.y-y)<15&&Math.abs(p.x-x)<(p.length+length)/2))continue;
      labels.push({x,y,length});c.fillStyle='#ffffffd9';c.fillRect(x-length/2,y-11,length,14);c.fillStyle=b.id===this.options.playerId?'#1d4ed8':'#172033';c.fillText(label,x,y,length);
    }
    for(const e of this.fx){
      const isDamage=e.type==='hit'&&e.damage>0,blocked=e.type==='block';if(!isDamage&&!blocked)continue;
      const u=(now-e.at)/760,amount=isDamage?Math.max(1,Math.round(e.damage)):0;
      const text=isDamage?'−'+amount:e.kind==='absorb'?'흡수':e.kind==='evade'?'회피':'방어';
      const size=clamp(13+Math.sqrt(amount)*.8,13,22),x=clamp(ox+e.x*scale+((e.seq%3)-1)*9,22,w-22),y=clamp(oy+e.y*scale-16-u*28,hudHeight+16,h-8);
      c.save();c.globalAlpha=Math.min(1,(1-u)*2);c.font='900 '+size+'px "Segoe UI", "Malgun Gothic",sans-serif';c.lineWidth=3.5;c.strokeStyle='#ffffff';c.strokeText(text,x,y);
      c.fillStyle=blocked?'#0369a1':e.kind==='poison'?'#4d7c0f':e.kind==='pressure'?'#64748b':amount>=25?'#b91c1c':'#8c2923';c.fillText(text,x,y);c.restore();
    }
  }
}
