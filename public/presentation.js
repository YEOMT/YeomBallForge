const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
// Display time is independent of authoritative simulation time. Damage, HP,
// sounds and effects are consumed only with the same committed display frame.
export class PresentationClock{
  constructor(){this.frames=[];this.tick=0;this.hold=0;this.windowStart=0;this.spent=0;this.last=null;}
  reset(frame){this.frames=frame?[frame]:[];this.tick=frame?.tick||0;this.last=null;this.hold=0;this.spent=0;this.windowStart=0;this.finishedKey=null;this.finishedAt=null;}
  push(frame){const last=this.frames.at(-1);if(!last||last.id!==frame.id||frame.tick<last.tick||frame.tick-last.tick>120){this.reset(frame);return;}if(frame.tick===last.tick)return;this.frames.push(frame);if(this.frames.length>64)this.frames.shift();this.tick=Math.max(this.tick,this.frames[0].tick);}
  stop(ms,now){if(now-this.windowStart>=1000){this.windowStart=now;this.spent=0;}const used=Math.max(0,Math.min(100,ms,120-this.spent));this.spent+=used;this.hold+=used;return used;}
  sample(now,{reduced=false,playbackRate=1}={}){
    if(!this.frames.length)return null;
    const dt=this.last===null?0:clamp(now-this.last,0,100);this.last=now;
    if(reduced)this.hold=0;
    const held=Math.min(dt,this.hold);this.hold=Math.max(0,this.hold-held);
    const latest=this.frames.at(-1),lag=latest.tick-this.tick;
    this.tick=clamp(this.tick+(dt-held)*.06*playbackRate*(lag>12?1.18:1),Math.max(this.frames[0].tick,latest.tick-24),latest.tick);
    let i=this.frames.findLastIndex(f=>f.tick<=this.tick);i=Math.max(0,i);
    const frame=this.frames[i],next=this.frames[i+1]||frame,alpha=next.tick===frame.tick?0:(this.tick-frame.tick)/(next.tick-frame.tick);
    if(i>2)this.frames.splice(0,i-2);
    const finishedKey=frame.done?`${frame.id}:${frame.tick}`:null;
    if(finishedKey!==this.finishedKey){this.finishedKey=finishedKey;this.finishedAt=finishedKey?now:null;}
    // After the authoritative final state, let only cosmetic tails settle.
    // The final HP, outcome, positions and recorded tick remain unchanged.
    const effectTime=this.tick*1000/60+(finishedKey?now-this.finishedAt:0);
    return {frame,next,alpha,tick:this.tick,effectTime};
  }
}
export class HpTrail{
  constructor(){this.states=new Map();}
  reset(){this.states.clear();}
  value(id,hp,max,now){
    const value=clamp(hp,0,max);let s=this.states.get(id);
    if(!s||s.max!==max||value>s.hp){s={hp:value,red:value,max,first:null,start:now,from:value};this.states.set(id,s);}
    if(value<s.hp){s.from=s.red;s.start=now;s.first??=now;s.hp=value;}
    if(s.red>s.hp){const elapsed=now-Math.min(s.start+200,(s.first??now)+450);const p=clamp(elapsed/450,0,1);s.red=s.from+(s.hp-s.from)*p;if(now-(s.first??now)>=900)s.red=s.hp;if(s.red<=s.hp+.001)s.first=null;}
    return {blue:value/max,red:s.red/max};
  }
}
