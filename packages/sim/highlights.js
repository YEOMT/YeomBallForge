// References into an existing authoritative archive; no duplicate simulation.
export function buildHighlights(matchId,frames,events){
  const last=frames.at(-1)?.tick??0,rows=[];
  const add=(kind,label,e,extra={})=>{if(!e||!Number.isFinite(e.tick))return;const toTick=Math.min(last,Math.max(240,e.tick+60));rows.push({id:`${matchId}:${kind}:${e.seq}`,matchId,kind,label,fromTick:Math.max(0,toTick-240),toTick,eventIds:[e.eventId??`${matchId}:${e.seq}`],rootAttackIds:[e.rootAttackId].filter(Boolean),...extra});};
  const hits=events.filter(e=>e.type==='hit'&&e.damage>0);
  const wall=hits.filter(e=>e.kind==='wallslam').sort((a,b)=>b.damage-a.damage)[0];
  if(wall)add('wallslam','강타 → 벽 충돌',wall,{damage:wall.damage});
  const awakened=hits.find(e=>e.awakeningId||e.reasonTags?.includes('awakening'))??events.find(e=>e.type==='awakening-hit'&&e.damage>0);
  if(awakened)add('awakening','T1 고유 각성 적중',awakened,{damage:awakened.damage});
  const started=events.find(e=>e.type==='awakening-start');
  if(started&&!awakened)add('awakening-start','T1 고유 각성 발동',started);
  const block=events.find(e=>e.type==='block'&&e.blocked>0&&hits.some(h=>h.sourceId===e.sourceId&&h.tick>e.tick&&h.tick-e.tick<=120));
  if(block){const counter=hits.find(h=>h.sourceId===block.sourceId&&h.tick>block.tick&&h.tick-block.tick<=120);add('counter','유효 방어 뒤 실제 타격',counter,{eventIds:[block.eventId,counter.eventId],rootAttackIds:[block.rootAttackId,counter.rootAttackId].filter(Boolean),blocked:block.blocked,damage:counter.damage});}
  let previous=null;
  for(const f of frames){if(f.balls.length!==2)continue;const [a,b]=f.balls,diff=a.hp/a.maxHp-b.hp/b.maxHp;
    if(previous&&Math.abs(diff)>.08&&Math.sign(diff)!==Math.sign(previous.diff)&&f.tick-previous.tick<=300){const cause=[...hits].reverse().find(e=>e.tick<=f.tick&&e.tick>=previous.tick);if(cause){add('comeback','실제 HP 우세 역전',cause);break;}}
    if(Math.abs(diff)>.08)previous={diff,tick:f.tick};
  }
  const ko=[...events].reverse().find(e=>e.type==='ko');if(ko)add('ko',ko.cause==='pressure'?'전장 압박으로 경기 종료':'마지막 KO 장면',ko);
  return rows.filter(x=>x.toTick>x.fromTick).slice(0,6);
}
