import {CLASSES, ELEMENTS} from './packages/content/classes.js';

const TAU=Math.PI*2, clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
let audio=null, voices=0, lastTone=0;
export function unlockAudio(){
  try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
    audio??=new Audio(); if(audio.state==='suspended')audio.resume().catch(()=>{});
  }catch{}
}
function tone(e){
  const now=performance.now(); if(!audio || audio.state!=='running' || voices>=4 || now-lastTone<65 || e.kind==='pressure')return;
  lastTone=now;
  const note=e.type==='ko'?[260,48,.23,'triangle']:e.type==='block'?[570,770,.13,'sine']:e.kind==='mace'||e.kind==='wallslam'?[118,35,.15,'triangle']:e.kind==='arc'||e.kind==='dash'?[760,280,.07,'sawtooth']:e.kind==='blade'?[570,130,.08,'triangle']:e.type==='wall'?[100,65,.04,'sine']:[300,86,.08,'sine'];
  const osc=audio.createOscillator(),gain=audio.createGain(),t=audio.currentTime;
  osc.type=note[3];osc.frequency.setValueAtTime(note[0],t);osc.frequency.exponentialRampToValueAtTime(note[1],t+note[2]);
  gain.gain.setValueAtTime(e.type==='wall'?.012:.045,t);gain.gain.exponentialRampToValueAtTime(.0001,t+note[2]);
  osc.connect(gain).connect(audio.destination); voices++;osc.onended=()=>{voices--;osc.disconnect();gain.disconnect();};osc.start(t);osc.stop(t+note[2]+.01);
}
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
  const requested=b.portraitKey||b.classId||'basic';
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
function sprite(ctx,b,x,y,r){
  const cl=CLASSES[b.classId]||CLASSES.basic,color=colorOf(b),img=portrait(b);
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
  setOptions(o){Object.assign(this.options,o);}
  update(next){
    if(!next)return;
    const same=this.current?.id===next.id && next.tick>=this.current.tick;
    if(same&&next.tick===this.current.tick)return;
    this.previous=same?this.current:null;this.current=next;this.received=performance.now();
    this.oldBalls=new Map((this.previous?.balls||[]).map(b=>[b.id,b]));
    this.oldObjects=setupObjects(this.previous);this.walls=new Map();
    if(!same){this.seq=0;this.fx.length=0;this.hits.clear();this.view=null;}
    for(const e of next.events||[]){
      if(e.type==='wall'){let arr=this.walls.get(e.sourceId);if(!arr)this.walls.set(e.sourceId,arr=[]);arr.push(e);}
      if(e.seq<=this.seq)continue;this.seq=e.seq;
      if(!same)continue;
      if(e.type==='hit' && !['poison','burn','pressure'].includes(e.kind))this.hits.set(e.targetId,{at:this.received,nx:e.nx,ny:e.ny});
      if(e.type!=='wall' && e.type!=='pressure'){if(this.fx.length>=96)this.fx.shift();this.fx.push({...e,at:this.received});}
      if(this.options.sound)tone(e);
    }
  }
  destroy(){cancelAnimationFrame(this.frameId);this.observer.disconnect();this.canvas.removeEventListener('pointerdown',this.pick);this.canvas.removeEventListener('keydown',this.cycle);this.fx.length=0;this.hits.clear();this.current=null;}
  frame(now){
    this.frameId=requestAnimationFrame(t=>this.frame(t));
    const f=this.current, c=this.ctx, d=Math.min(devicePixelRatio||1,this.options.reduced?1.25:2);
    const w=this.bounds.width,h=this.bounds.height;if(!f||w<1||h<1||document.hidden)return;
    if(this.canvas.width!==Math.round(w*d)||this.canvas.height!==Math.round(h*d)){this.canvas.width=Math.round(w*d);this.canvas.height=Math.round(h*d);}
    c.setTransform(d,0,0,d,0,0);c.fillStyle='#f1f5f9';c.fillRect(0,0,w,h);
    const prevTick=this.previous?.tick??f.tick, delta=f.tick-prevTick;
    const t=delta?clamp((now-this.received)/(delta*1000/60),0,1):1;
    const players=f.balls.filter(b=>b.alive).map(b=>({...b,...pointAt(b.teleportedAt>prevTick?null:this.oldBalls.get(b.id),b,t,prevTick,f.tick,this.walls.get(b.id)),color:colorOf(b)}));
    const byId=new Map(players.map(p=>[p.id,p]));
    const colors=new Map(f.balls.map(b=>[b.id,colorOf(b)]));
    let target={x:f.width/2,y:f.height/2,w:f.width+6,h:f.height+6};
    if(f.mode==='rumble' && players.length<=5 && f.balls.length>5 && players.length){
      const xs=players.map(p=>p.x),ys=players.map(p=>p.y),l=Math.max(0,Math.min(...xs)-68),r=Math.min(f.width,Math.max(...xs)+68),top=Math.max(0,Math.min(...ys)-58),bottom=Math.min(f.height,Math.max(...ys)+58);
      target={x:(l+r)/2,y:(top+bottom)/2,w:r-l,h:bottom-top};
    }
    this.view??={...target};for(const k of ['x','y','w','h'])this.view[k]+=(target[k]-this.view[k])*.09;
    const scale=Math.min(w/this.view.w,h/this.view.h);let ox=w/2-this.view.x*scale,oy=h/2-this.view.y*scale;
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
      sprite(c,b,0,0,b.r);if(power>.4)circle(c,0,0,b.r,'#ffffff44');
      if(b.id===this.options.playerId||b.id===this.selected)circle(c,0,0,b.r+3.7,null,b.id===this.selected?'#172033':'#2563eb',1.2);
      if(b.charge)circle(c,0,0,b.r+2,null,b.color,1.2);
      if(b.status?.length){const status=b.status.includes('frost')?'#56c9ed':b.status.includes('poison')?'#65a30d':b.status.includes('rage')?'#dc2626':'#ea580c';circle(c,b.r*.72,-b.r*.72,3,status,'#fff',1);}
      c.restore();
      if(b.classId==='beam'&&b.charge){
        c.save();c.setLineDash([5,4]);line(c,b.x,b.y,b.x+Math.cos(b.aim||0)*310,b.y+Math.sin(b.aim||0)*310,b.color+'88',.8);c.restore();
      }
    }
    for(const obj of f.objects){
      const old=this.oldObjects.get(obj.id),b=byId.get(obj.ownerId);let pos=old?mix(old,obj,t):obj;
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
      circle(c,e.x,e.y,r,null,e.type==='block'?'#0e7490':color,small?.6:1.3);
      if(!this.options.reduced&&!small&&e.type==='hit'){for(let i=0;i<4;i++){const a=e.seq+i*1.57;line(c,e.x+Math.cos(a)*r,e.y+Math.sin(a)*r,e.x+Math.cos(a)*(r+4),e.y+Math.sin(a)*(r+4),color,1);}}
      c.restore();
    }
    c.restore();c.strokeStyle=f.pressure?'#dc6024':'#26334a';c.lineWidth=1.8;c.strokeRect(s,s,cw,ch);
    c.setTransform(d,0,0,d,0,0);const boxes=[],labels=[];
    const priority=b=>b.id===this.options.playerId?2:b.id===this.selected?1:0;
    const sorted=players.sort((a,b)=>priority(b)-priority(a));
    const crowd=sorted.length>8 && w<720;
    this.targets=sorted.map(b=>({id:b.id,x:ox+b.x*scale,y:oy+b.y*scale,r:b.r*scale}));
    const font=clamp(scale*6,10,14);c.font='700 '+font+'px "Segoe UI", "Malgun Gothic",sans-serif';c.textAlign='center';c.textBaseline='alphabetic';
    for(const b of sorted){
      const x=ox+b.x*scale, y=oy+b.y*scale, radius=b.r*scale;
      const name=String(b.name),brief=!priority(b)&&name.length>8?name.slice(0,4)+'…'+name.slice(-3):name;
      const label=(b.id===this.options.playerId?'◆ ':'')+brief+' · T'+(b.tier??20-b.level);
      const hpText=Math.ceil(Math.max(0,b.hp))+' / '+Math.ceil(b.maxHp);
      const length=Math.min(w,Math.max(c.measureText(label).width,c.measureText(hpText).width)+10),cx=clamp(x,length/2,w-length/2);
      const top=clamp(y-radius-font-9,font+4,h-font-9),bottom=clamp(y+radius+font+3,font+4,h-font-9);
      const positions=[top,bottom,clamp(top-font*2-10,font+4,h-font-9),clamp(bottom+font*2+10,font+4,h-font-9)];
      const cy=positions.find(pos=>!boxes.some(q=>Math.abs(q.y-pos)<font*2+12&&Math.abs(q.x-cx)<(q.w+length)/2+4));
      const hp=clamp(b.hp/b.maxHp,0,1);
      if(cy===undefined || (crowd&&!priority(b)&&boxes.length>=4)){
        const bar=Math.max(44,radius*1.8),by=clamp(y+radius+3,0,h-16),bx=clamp(x,bar/2+2,w-bar/2-2);
        c.fillStyle='#ffffffed';c.fillRect(bx-bar/2-2,by-1,bar+4,17);
        c.fillStyle='#cbd5e1';c.fillRect(bx-bar/2,by,bar,4);c.fillStyle=hp<.25?'#dc2626':b.color;c.fillRect(bx-bar/2,by,bar*hp,4);
        c.save();c.font='700 10px "Segoe UI",sans-serif';c.fillStyle='#172033';c.fillText(hpText,bx,by+14);c.restore();continue;
      }
      boxes.push({x:cx,y:cy,w:length});labels.push({b,cy,cx,length,label,hp,hpText});
    }
    for(const {b,cy,cx,length,label,hp,hpText} of labels.reverse()){
      c.fillStyle='#fffffff2';c.fillRect(cx-length/2,cy-font-2,length,font*2+12);
      c.fillStyle=b.id===this.options.playerId?'#1d4ed8':'#172033';c.fillText(label,cx,cy-1,length);
      c.fillStyle='#e2e8f0';c.fillRect(cx-length/2+3,cy+3,length-6,5);c.fillStyle=hp<.25?'#dc2626':b.color;c.fillRect(cx-length/2+3,cy+3,(length-6)*hp,5);
      c.save();c.font='700 '+Math.max(10,font-1)+'px "Segoe UI",sans-serif';c.fillStyle='#334155';c.fillText(hpText,cx,cy+font+8,length);c.restore();
    }
    for(const e of this.fx){
      const isDamage=e.type==='hit'&&e.damage>0,blocked=e.type==='block';if(!isDamage&&!blocked)continue;
      const u=(now-e.at)/760,amount=isDamage?Math.max(1,Math.round(e.damage)):0;
      const text=isDamage?'−'+amount:e.kind==='absorb'?'흡수':e.kind==='evade'?'회피':'방어';
      const size=clamp(13+Math.sqrt(amount)*.8,13,22),x=clamp(ox+e.x*scale+((e.seq%3)-1)*9,22,w-22),y=clamp(oy+e.y*scale-16-u*28,20,h-8);
      c.save();c.globalAlpha=Math.min(1,(1-u)*2);c.font='900 '+size+'px "Segoe UI", "Malgun Gothic",sans-serif';c.lineWidth=3.5;c.strokeStyle='#ffffff';c.strokeText(text,x,y);
      c.fillStyle=blocked?'#0369a1':e.kind==='poison'?'#4d7c0f':e.kind==='pressure'?'#64748b':amount>=25?'#b91c1c':'#8c2923';c.fillText(text,x,y);c.restore();
    }
  }
}
