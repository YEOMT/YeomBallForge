import {CLASSES} from '../../packages/content/classes.js';

// Tiny, teacher-only facts; never a second stream of full arena snapshots.
export class FeaturedMatches{
  constructor(){this.nextAt=-1;this.rows=[];this.history=new Map();}
  update(matches,now,standings=[]){
    if(now<this.nextAt)return this.rows;
    this.nextAt=now+750;
    const top=new Set(standings.slice(0,5).map(p=>p.id)),previous=new Set(this.rows.map(x=>x.matchId)),live=new Set();
    const rows=[];
    for(const m of matches){const a=m.arena??m;if(a.done||a.mode==='rumble'||a.balls.length!==2)continue;live.add(a.id);const b=a.balls;
      const reasons=[],add=(score,text)=>reasons.push({score,text});
      if(b.some(x=>x.level===19))add(24,'T1 공 출전');
      if(b.some(x=>CLASSES[x.classId]?.hidden))add(14,'히든 공 출전');
      if(b.filter(x=>top.has(x.id)).length===2)add(12,'상위권 맞대결');
      if(b.filter(x=>x.alive&&x.hp/x.maxHp<.25).length>=2)add(20,'양쪽 HP 25% 미만');
      if(b.some(x=>x.awakeningState?.status==='active'))add(28,'고유 각성 발동 중');
      else if(b.some(x=>x.awakeningState?.ready))add(19,'고유 각성 준비');
      const diff=b[0].hp/b[0].maxHp-b[1].hp/b[1].maxHp,old=this.history.get(a.id);
      const flipped=old&&Math.abs(diff)>.08&&Math.abs(old.diff)>.08&&Math.sign(diff)!==Math.sign(old.diff);
      const flipAt=flipped?a.tick:old?.flipAt??-1000;
      if(a.tick-flipAt<=240)add(22,'최근 HP 우세 역전');
      this.history.set(a.id,{diff:Math.abs(diff)>.08?diff:old?.diff??diff,flipAt});
      if(!reasons.length)add(1,'진행 중 경기');
      reasons.sort((a,b)=>b.score-a.score);
      rows.push({matchId:a.id,names:b.map(x=>x.name),tick:a.tick,reasons:reasons.slice(0,2).map(x=>x.text),score:reasons.reduce((n,x)=>n+x.score,0)+(previous.has(a.id)?3:0)});
    }
    for(const id of this.history.keys())if(!live.has(id))this.history.delete(id);
    this.rows=rows.sort((a,b)=>b.score-a.score||a.matchId.localeCompare(b.matchId)).slice(0,3);return this.rows;
  }
}
