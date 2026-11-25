import {ELEMENTS,CLASSES} from './packages/content/classes.js';
import {TRAITS} from './packages/content/traits.js';
const statusNames={frost:'감속',poison:'중독',burn:'화상',rage:'분노'};
export function drawCombatHud(c,f,w,h,now,trail,selected){
  const duel=f.mode!=='rumble'&&f.balls.length===2;
  c.fillStyle='#111c29';c.fillRect(0,0,w,h);c.textBaseline='top';
  const list=duel?f.balls:[f.balls.find(b=>b.id===selected)||f.balls.find(b=>b.alive)||f.balls[0]];
  list.forEach((b,i)=>{
    if(!b)return;const width=duel?(w-32)/2:Math.min(w*.68,w-100),x=duel?12+i*(width+8):12;
    const hp=trail.value(b.id,b.hp,b.maxHp,now);
    c.textAlign='left';c.fillStyle='#eff6ff';c.font='700 13px "Segoe UI","Malgun Gothic",sans-serif';c.fillText(`${b.name} · T${b.tier??20-b.level}`,x,8,width*.66);
    c.textAlign='right';c.font='700 11px Consolas,monospace';c.fillStyle='#a7d7f2';c.fillText(`${Math.ceil(Math.max(0,b.hp))} / ${Math.ceil(b.maxHp)}`,x+width,10,width*.34);
    c.fillStyle='#293343';c.fillRect(x,29,width,12);c.fillStyle='#d85a62';c.fillRect(x,29,width*hp.red,12);c.fillStyle='#3ba4e9';c.fillRect(x,29,width*hp.blue,12);
    c.textAlign='left';c.fillStyle='#b9c8d3';c.font='11px "Segoe UI","Malgun Gothic",sans-serif';
    const element=ELEMENTS[b.element]||ELEMENTS.neutral;c.fillText(`${element.icon} ${element.name} · ${b.ballName||CLASSES[b.classId]?.name||b.classId}`,x,47,width);
    const resource=b.resource,resourceText=resource?`${resource.name||resource.label||'전투 자원'} ${resource.value??resource.current??0}/${resource.max??resource.cap??1}${resource.ready?' · 준비':''}`:b.charge?'충전 예고':TRAITS[b.traitId]?.name||'기본 전투';
    c.fillStyle=b.awakening?'#f2dc88':resource?.ready?'#b9e896':'#99a9b9';c.fillText((b.awakening?'각성 · ':'')+resourceText,x,63,width);
    const states=(b.status||[]).map(x=>statusNames[x]||x);if(states.length){c.textAlign='right';c.fillStyle='#f1bc9b';c.fillText(states.join(' · '),x+width,63,width*.46);}
  });
  if(!duel){c.textAlign='right';c.fillStyle='#e7f3ff';c.font='700 14px "Segoe UI",sans-serif';c.fillText(`생존 ${f.balls.filter(b=>b.alive).length} / ${f.balls.length}`,w-12,12);c.font='11px "Segoe UI",sans-serif';c.fillStyle='#a2b6c6';c.fillText('공을 눌러 상세 보기',w-12,39);}
}
