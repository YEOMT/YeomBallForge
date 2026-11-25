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
const skins=new Map();
function skin(b){
  const key=b.classId+'-'+b.element+'-'+(b.level>=20?4:b.level>=15?3:b.level>=10?2:b.level>=5?1:0);
  if(skins.has(key))return skins.get(key);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=144;
  const c=canvas.getContext('2d'), cl=CLASSES[b.classId]||CLASSES.basic, color=cl.hidden?cl.color:(ELEMENTS[b.element]?.color||cl.color);
  c.translate(72,72);c.scale(58,58);
  const g=c.createRadialGradient(-.38,-.45,.03,0,0,1.04);g.addColorStop(0,'#f5fff1');g.addColorStop(.16,color);g.addColorStop(.44,'#485952');g.addColorStop(.70,'#152320');g.addColorStop(.92,'#101416');g.addColorStop(1,color);
  circle(c,0,0,.98,g,color,.045);c.save();c.beginPath();c.arc(0,0,.94,0,TAU);c.clip();
  for(let i=0;i<6;i++){
    c.save();c.rotate(i*TAU/6+.32);
    c.beginPath();c.moveTo(.20,-.58);c.lineTo(.46,-.45);c.lineTo(.69,-.52);c.lineTo(1.03,-.32);c.lineTo(1.1,-.20);c.lineTo(.71,-.40);c.lineTo(.42,-.36);c.closePath();
    c.fillStyle=b.level>=5?color:'#9ca9a2';c.globalAlpha=.82;c.fill();c.restore();
  }
  c.restore();circle(c,0,0,.48,'#172120',color,.06);
  if(b.level>=15){c.strokeStyle=color;c.lineWidth=.045;for(let i=0;i<3;i++){c.beginPath();c.arc(0,0,.71,i*TAU/3+.15,i*TAU/3+1.35);c.stroke();}}
  c.fillStyle=color;c.textAlign='center';c.textBaseline='middle';c.font='bold .57px "Segoe UI Symbol",sans-serif';c.fillText(cl.icon,0,.018);
  if(b.level>=20){c.strokeStyle='#fff2a0';c.lineWidth=.045;c.setLineDash([.16,.11]);c.beginPath();c.arc(0,0,1.08,0,TAU);c.stroke();}
  if(skins.size>180)skins.clear();skins.set(key,canvas);return canvas;
}
function sprite(ctx,b,x,y,r){const sz=r*144/58;ctx.drawImage(skin(b),x-sz/2,y-sz/2,sz,sz);}
export function drawEmblem(canvas,b){
  if(!canvas)return;
  const w=canvas.clientWidth||240,h=canvas.clientHeight||180,dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
  const c=canvas.getContext('2d');c.scale(dpr,dpr);const r=Math.min(w,h)*.32,cl=CLASSES[b.classId]||CLASSES.basic;
  const glow=c.createRadialGradient(w/2,h/2,r*.1,w/2,h/2,r*1.5);glow.addColorStop(0,cl.color+'70');glow.addColorStop(1,cl.color+'00');circle(c,w/2,h/2,r*1.5,glow);sprite(c,b,w/2,h/2,r);
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
  const col=b?.color||'#b5dcbb',r=o.r;
  if(o.kind==='shield'||o.kind==='crystal'){
    c.beginPath();c.arc(o.x,o.y,r,o.angle-.99,o.angle+.99);c.lineWidth=o.ready?3:1;c.strokeStyle=o.ready?col:col+'75';c.stroke();return;
  }
  if(['gravity','seed'].includes(o.kind)){
    circle(c,o.x,o.y,r,col+'12',col+'99',.9);circle(c,o.x,o.y,o.kind==='seed'?3:r*.37,col+'55',col,1);return;
  }
  c.save();c.translate(o.x,o.y);const ang=b?Math.atan2(o.y-b.y,o.x-b.x):0;c.rotate(ang);
  if(o.kind==='mace'){
    if(b)line(c,0,0,-Math.hypot(o.x-b.x,o.y-b.y),0,'#b7a58a',1.8);
    polygon(c,r,8,0,r*.70);c.fillStyle='#726152';c.fill();c.strokeStyle=col;c.lineWidth=1.6;c.stroke();
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
      if(e.type!=='wall' && e.kind!=='pressure'){if(this.fx.length>=72)this.fx.shift();this.fx.push({...e,at:this.received});}
      if(this.options.sound)tone(e);
    }
  }
  destroy(){cancelAnimationFrame(this.frameId);this.observer.disconnect();this.canvas.removeEventListener('pointerdown',this.pick);this.canvas.removeEventListener('keydown',this.cycle);this.fx.length=0;this.hits.clear();this.current=null;}
  frame(now){
    this.frameId=requestAnimationFrame(t=>this.frame(t));
    const f=this.current, c=this.ctx, d=Math.min(devicePixelRatio||1,this.options.reduced?1.25:2);
    const w=this.bounds.width,h=this.bounds.height;if(!f||w<1||h<1||document.hidden)return;
    if(this.canvas.width!==Math.round(w*d)||this.canvas.height!==Math.round(h*d)){this.canvas.width=Math.round(w*d);this.canvas.height=Math.round(h*d);}
    c.setTransform(d,0,0,d,0,0);c.fillStyle='#0b1415';c.fillRect(0,0,w,h);
    const prevTick=this.previous?.tick??f.tick, delta=f.tick-prevTick;
    const t=delta?clamp((now-this.received)/(delta*1000/60),0,1):1;
    const players=f.balls.filter(b=>b.alive).map(b=>({...b,...pointAt(this.oldBalls.get(b.id),b,t,prevTick,f.tick,this.walls.get(b.id)),color:CLASSES[b.classId]?.hidden?CLASSES[b.classId].color:ELEMENTS[b.element]?.color||'#a3d4b8'}));
    const byId=new Map(players.map(p=>[p.id,p]));
    let target={x:f.width/2,y:f.height/2,w:f.width+6,h:f.height+6};
    if(f.mode==='rumble' && players.length<=5 && f.balls.length>5 && players.length){
      const xs=players.map(p=>p.x),ys=players.map(p=>p.y),l=Math.max(0,Math.min(...xs)-68),r=Math.min(f.width,Math.max(...xs)+68),top=Math.max(0,Math.min(...ys)-58),bottom=Math.min(f.height,Math.max(...ys)+58);
      target={x:(l+r)/2,y:(top+bottom)/2,w:r-l,h:bottom-top};
    }
    this.view??={...target};for(const k of ['x','y','w','h'])this.view[k]+=(target[k]-this.view[k])*.09;
    const scale=Math.min(w/this.view.w,h/this.view.h);let ox=w/2-this.view.x*scale,oy=h/2-this.view.y*scale;
    if(this.options.shake&&!this.options.reduced&&players.length<=4&&this.fx.some(e=>['wallslam','mace','ko'].includes(e.kind)&&now-e.at<85)){ox+=Math.sin(now*.16)*1.6;oy+=Math.cos(now*.12);}
    c.translate(ox,oy);c.scale(scale,scale);
    const s=f.inset, cw=f.width-s*2,ch=f.height-s*2;
    c.fillStyle='#162223';c.fillRect(s,s,cw,ch);c.save();c.beginPath();c.rect(s,s,cw,ch);c.clip();
    c.lineWidth=.5;c.strokeStyle='#263738';c.beginPath();for(let x=0;x<f.width;x+=24){c.moveTo(x,0);c.lineTo(x,f.height);}for(let y=0;y<f.height;y+=24){c.moveTo(0,y);c.lineTo(f.width,y);}c.stroke();
    circle(c,f.width/2,f.height/2,Math.min(cw,ch)*.21,null,'#344546',.8);
    line(c,f.width/2,s,f.width/2,f.height-s,'#344546',.8);
    for(const b of players){
      if(!this.options.reduced&&(b.dash||b.charge||b.level>=5)){
        const theta=Math.atan2(b.vy,b.vx);c.save();c.translate(b.x,b.y);c.rotate(theta);
        c.beginPath();c.moveTo(0,-b.r*.65);c.lineTo(-b.r*(b.dash?3.4:1.9),0);c.lineTo(0,b.r*.65);c.fillStyle=b.color+'63';c.fill();c.restore();
      }
      const hit=this.hits.get(b.id),power=hit?clamp(1-(now-hit.at)/140,0,1):0;
      c.save();c.translate(b.x,b.y);if(power){const a=Math.atan2(hit.ny,hit.nx);c.rotate(a);c.scale(1-.17*power,1+.12*power);c.rotate(-a);}
      sprite(c,b,0,0,b.r);if(power>.4)circle(c,0,0,b.r,'#ffffff44');
      if(b.id===this.options.playerId||b.id===this.selected)circle(c,0,0,b.r+2,null,b.id===this.selected?'#fff':'#e9ffc1',1.5);
      if(b.charge)circle(c,0,0,b.r*.5,b.color+'88');if(b.status?.length)circle(c,b.r*.72,-b.r*.72,2.8,b.status.includes('poison')?'#a9ef65':'#ff8451','#121b15',.6);
      c.restore();
    }
    for(const obj of f.objects){
      const old=this.oldObjects.get(obj.id),b=byId.get(obj.ownerId);let pos=old?mix(old,obj,t):obj;
      if(b&&(obj.kind==='shield'||obj.kind==='crystal'))pos=b;
      drawObject(c,{...obj,x:pos.x,y:pos.y},b);
    }
    this.fx=this.fx.filter(e=>now-e.at<440);
    for(const e of this.fx){
      const u=(now-e.at)/440,color=byId.get(e.sourceId)?.color||'#e3eec0',small=['poison','burn'].includes(e.kind);
      c.save();c.globalAlpha=1-u;
      const r=e.r?Math.max(1,e.r*u):e.type==='ko'?5+26*u:small?2+3*u:2+11*u;
      if(e.kind==='arc'&&e.fromX!=null)line(c,e.fromX,e.fromY,e.x,e.y,'#ffe88a',1.8);
      if(e.kind==='charge')line(c,e.x,e.y,e.x+Math.cos(e.angle)*31,e.y+Math.sin(e.angle)*31,color,1);
      circle(c,e.x,e.y,r,null,e.type==='block'?'#e4fbff':color,small?.6:1.3);
      if(!this.options.reduced&&!small&&e.type==='hit'){for(let i=0;i<4;i++){const a=e.seq+i*1.57;line(c,e.x+Math.cos(a)*r,e.y+Math.sin(a)*r,e.x+Math.cos(a)*(r+4),e.y+Math.sin(a)*(r+4),color,1);}}
      c.restore();
    }
    c.restore();c.strokeStyle=f.pressure?'#ef925e':'#8cbba3';c.lineWidth=1.8;c.strokeRect(s,s,cw,ch);
    c.setTransform(d,0,0,d,0,0);const boxes=[],labels=[];
    const priority=b=>b.id===this.options.playerId?2:b.id===this.selected?1:0;
    const sorted=players.sort((a,b)=>priority(b)-priority(a));
    const crowd=sorted.length>8 && w<720;
    this.targets=sorted.map(b=>({id:b.id,x:ox+b.x*scale,y:oy+b.y*scale,r:b.r*scale}));
    const font=clamp(scale*6,10,14);c.font='650 '+font+'px "Segoe UI", "Malgun Gothic",sans-serif';c.textAlign='center';
    for(const b of sorted){
      const x=ox+b.x*scale, y=oy+b.y*scale, radius=b.r*scale;
      const name=String(b.name),brief=!priority(b)&&name.length>8?name.slice(0,4)+'…'+name.slice(-3):name;
      const label=(b.id===this.options.playerId?'◆ ':'')+(ELEMENTS[b.element]?.icon||'●')+' '+brief+' +'+b.level;
      const length=Math.min(w,c.measureText(label).width+7),cx=clamp(x,length/2,w-length/2);
      const top=clamp(y-radius-7,14,h-5),bottom=clamp(y+radius+font+3,14,h-5);
      const positions=[top,bottom,clamp(top-font-4,14,h-5),clamp(bottom+font+4,14,h-5)];
      const cy=positions.find(pos=>!boxes.some(q=>Math.abs(q.y-pos)<font+6&&Math.abs(q.x-cx)<(q.w+length)/2+4));
      const hp=clamp(b.hp/b.maxHp,0,1);
      if(cy===undefined || (crowd&&!priority(b)&&boxes.length>=4)){
        const bar=Math.max(9,radius*1.65),by=y+radius+2;c.fillStyle='#0b100d';c.fillRect(x-bar/2-1,by-1,bar+2,4);c.fillStyle=b.color;c.fillRect(x-bar/2,by,bar*hp,2);continue;
      }
      boxes.push({x:cx,y:cy,w:length});labels.push({b,cy,cx,length,label,hp});
    }
    for(const {b,cy,cx,length,label,hp} of labels.reverse()){
      c.fillStyle='#0a100def';c.fillRect(cx-length/2,cy-font,length,font+3);
      c.fillStyle=b.id===this.options.playerId?'#d8ff9e':'#f4f8f0';c.fillText(label,cx,cy-1,length);
      c.fillStyle='#293332';c.fillRect(cx-length/2,cy+2,length,2.5);c.fillStyle=b.color;c.fillRect(cx-length/2,cy+2,length*hp,2.5);
    }
  }
}
