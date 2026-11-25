export function summarizeEvents(events,playerId) {
  const own=events.filter(e=>e.sourceId===playerId),incoming=events.filter(e=>e.targetId===playerId);
  const hits=own.filter(e=>e.type==='hit'&&e.damage>0), blocks=own.filter(e=>e.type==='block'&&e.blocked>0);
  const sum=(rows,key)=>Math.round(rows.reduce((n,e)=>n+(Number(e[key])||0),0)*10)/10;
  const kinds={};
  for(const e of hits){const row=kinds[e.kind]??={kind:e.kind,count:0,damage:0,eventIds:[]};row.count++;row.damage+=e.damage;row.eventIds.push(e.eventId??e.seq);}
  const detail=Object.values(kinds).map(r=>({...r,damage:Math.round(r.damage*10)/10})).sort((a,b)=>b.damage-a.damage);
  const highlights=detail.slice(0,2).map(r=>({kind:r.kind,count:r.count,damage:r.damage,eventIds:r.eventIds}));
  if(blocks.length)highlights.push({kind:'block',count:blocks.length,blocked:sum(blocks,'blocked'),eventIds:blocks.map(e=>e.eventId??e.seq)});
  else if(incoming.some(e=>e.type==='hit')){const decisive=incoming.filter(e=>e.type==='hit').sort((a,b)=>(b.damage??0)-(a.damage??0))[0];highlights.push({kind:'largest-hit',damage:decisive.damage,sourceId:decisive.sourceId,eventIds:[decisive.eventId??decisive.seq]});}
  return {damage:sum(hits,'damage'),received:sum(incoming.filter(e=>e.type==='hit'),'damage'),blocked:sum(blocks,'blocked'),
    directHits:hits.filter(e=>e.reasonTags?.includes('direct')).length,wallDamage:sum(hits.filter(e=>e.kind==='wallslam'),'damage'),
    skills:own.filter(e=>e.type==='skill').length,traits:own.filter(e=>e.type==='trait').length,healed:sum(own.filter(e=>e.type==='heal'),'healing'),
    highlights:highlights.slice(0,3),details:detail};
}
