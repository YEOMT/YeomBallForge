import {ELEMENTS,CLASSES} from './packages/content/classes.js';
import {TRAITS} from './packages/content/traits.js';
import {healthGeometry} from './combat-feedback.js';
export {healthGeometry} from './combat-feedback.js';
const statusNames={frost:'감속',poison:'중독',burn:'화상',rage:'분노'};
const stateNames={locked:'조건 대기',charging:'충전 중',ready:'발동 준비',active:'발동 중',spent:'사용 완료',cancelled:'발동 취소'};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const hudHeight=(w,frame)=>frame?.mode==='rumble'?(w<540?152:156):(w<540?152:156);
const textCache=new Map();
function fit(c,text,width){const key=c.font+'/'+width+'/'+text;if(textCache.has(key))return textCache.get(key);let shown=String(text);if(c.measureText(shown).width>width){while(shown.length&&c.measureText(shown+'…').width>width)shown=shown.slice(0,-1);shown+='…';}if(textCache.size>600)textCache.clear();textCache.set(key,shown);return shown;}
function label(c,text,x,y,width){c.fillText(fit(c,text,width),x,y);}
export function drawCombatHud(c,f,w,h,now,trail,selected){
  const duel=f.mode!=='rumble'&&f.balls.length===2,small=w<540,pad=small?9:14,gap=duel?(small?16:64):0;
  c.fillStyle='#101c28';c.fillRect(0,0,w,h);c.fillStyle='#263c4b';c.fillRect(0,h-2,w,2);c.textBaseline='top';
  const focus=f.balls.find(b=>b.id===selected)||f.balls.find(b=>b.alive)||f.balls[0],list=duel?f.balls:[focus];
  list.forEach((b,i)=>{
    if(!b)return;const width=duel?(w-pad*2-gap)/2:w-pad*2-(small?80:146),x=pad+i*(width+gap),right=duel&&i===1;
    c.textAlign='left';c.fillStyle='#edf5fa';c.font=`700 ${small?11:15}px "Segoe UI","Malgun Gothic",sans-serif`;label(c,`${b.name} · T${b.tier??20-b.level}`,x,9,width);
    const element=ELEMENTS[b.element]||ELEMENTS.neutral;c.font=`${small?10:12}px "Segoe UI","Malgun Gothic",sans-serif`;c.fillStyle='#adbeca';label(c,`${element.icon} ${element.name} · ${b.ballName||CLASSES[b.classId]?.name||b.classId}`,x,small?27:30,width);
    const y=small?45:49,barH=small?20:24,hp=trail.value(b.id,b.hp,b.maxHp,now),g=healthGeometry(x,width,hp.blue,hp.red,right);
    c.fillStyle='#39414b';c.fillRect(x,y,width,barH);c.fillStyle='#ef4444';c.fillRect(g.redX,y,g.redWidth,barH);c.fillStyle='#2563eb';c.fillRect(g.blueX,y,g.blueWidth,barH);
    c.fillStyle='#73b8ff';c.fillRect(g.blueX,y,g.blueWidth,2);c.strokeStyle='#97bbcd66';c.lineWidth=1;c.strokeRect(x+.5,y+.5,width-1,barH-1);
    c.font=`700 ${small?11:13}px Consolas,monospace`;c.textAlign='center';c.lineWidth=3;c.strokeStyle='#12263b';const hpText=`${Math.ceil(Math.max(0,b.hp))} / ${Math.ceil(b.maxHp)}`;c.strokeText(hpText,x+width/2,y+4);c.fillStyle='#fff';c.fillText(hpText,x+width/2,y+4);c.textAlign='left';
    const evo=b.evolution,resource=b.resource,core=resource?`${resource.name||resource.kind||'고유 기믹'} ${Math.round(resource.value??resource.current??0)}/${resource.max??resource.cap??1}${resource.ready?' · 준비':''}`:b.charge?'차지 · 조준 고정':'기본 전투';
    c.font=`${small?10:11}px "Segoe UI","Malgun Gothic",sans-serif`;c.fillStyle=resource?.ready?'#c4eea2':'#bbccd2';label(c,core,x,y+barH+7,width);
    const progress=resource?clamp((resource.value??resource.current??0)/(resource.max||resource.cap||1),0,1):0;c.fillStyle='#263b3e';c.fillRect(x,y+barH+22,width,3);c.fillStyle=resource?.ready?'#bce787':'#729d8d';c.fillRect(x,y+barH+22,width*progress,3);
    const awakening=b.awakeningState,trait=TRAITS[b.traitId]?.name||'특성 없음',awText=awakening?(awakening.status==='locked'?'T1 전용 각성':`${stateNames[awakening.status]||'조건 대기'} · ${awakening.name||'T1 각성'}`):null;
    c.fillStyle=evo?.active?'#c2ecae':evo?.ready?'#e0d29e':'#a8b6c3';label(c,evo?`진화 ${evo.active?'발동':evo.ready?'준비':Math.round(evo.value)+'/'+evo.max} · ${evo.name}`:'진화 상태 없음',x,y+barH+30,width);
    c.fillStyle=awakening?.status==='active'?'#ffe397':awakening?.ready?'#e6c777':'#9aaebc';label(c,awText||`전술 · ${trait}`,x,y+barH+46,width);
    const states=(b.status||[]).map(x=>statusNames[x]||x);const shield=b.shield?.value??b.shieldHp??null;const tactical=b.tacticResource;const auxiliary=[awText?trait:'',tactical?`${tactical.name||'특성'} ${Math.round(tactical.value??tactical.current??0)}/${tactical.max??tactical.cap??1}`:'',...states,shield!=null?'방패 '+Math.ceil(shield):''].filter(Boolean).join(' · ');
    if(auxiliary){c.fillStyle='#c1cbd0';c.font=`${small?9:10}px "Segoe UI","Malgun Gothic",sans-serif`;label(c,auxiliary,x,y+barH+62,width);}
  });
  const remaining=Math.max(0,Math.ceil(((f.limitTicks??2400)-f.tick)/60)),seconds=String(remaining).padStart(2,'0');
  if(duel&&!small){c.textAlign='center';c.fillStyle='#e4ebec';c.font='700 19px Consolas,monospace';c.fillText(f.done?'END':seconds,w/2,46);c.font='9px "Segoe UI",sans-serif';c.fillStyle='#8298a6';c.fillText('SECONDS',w/2,71);}
  else if(duel){c.textAlign='center';c.font='700 9px Consolas,monospace';c.fillStyle='#d7e4e9';c.fillText(f.done?'끝':seconds,w/2,11);}
  else{c.textAlign='right';c.fillStyle='#e7f3ff';c.font=`700 ${small?11:15}px "Segoe UI",sans-serif`;c.fillText(`생존 ${f.balls.filter(b=>b.alive).length}/${f.balls.length}`,w-pad,13);c.font='11px Consolas,monospace';c.fillText(f.done?'END':seconds+'s',w-pad,38);c.font='10px "Segoe UI",sans-serif';c.fillStyle='#9fb4c3';c.fillText('공 선택',w-pad,62);}
}
