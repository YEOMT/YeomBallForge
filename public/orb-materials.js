import {CLASSES,ELEMENTS} from './packages/content/classes.js';
const skins=new Map(),TAU=Math.PI*2;
function circle(c,r,fill,stroke,width){c.beginPath();c.arc(0,0,r,0,TAU);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
const insignia={
returner:'M-.32-.28 L.32-.28 L.26.19 L0 .37 L-.26.19 Z M-.18-.06 L0 .12 L.18-.06',
pendulum:'M0-.4 L0-.11 M-.3-.27 L-.4-.02 M.3-.27 L.4-.02 M-.28.07 L-.4.3 M.28.07 L.4.3 M0-.22 A.27.27 0 1 1-.01-.22 M0-.12 L 0 .05 L.16.13',
reactor:'M-.22-.37 L.22-.37 L.35-.16 L.29.32 L-.29.32 L-.35-.16 Z M-.12-.2 L.13-.04 L-.12.11 L.14.26 M-.42-.14 L-.42.24 M.42-.14 L.42.24',
captor:'M-.3-.17 Q0-.4.3-.17 L.2.24 L 0 .36 L-.2.24 Z M-.45.2 Q0 .43.45-.2 M-.45.2 L-.33.25 M.45-.2 L.33-.25',
rewind:'M-.3-.35 L.3-.35 L-.23.34 L.23.34 L-.3-.35 M-.42.02 Q-.4-.3-.15-.4 M-.42.02 L-.23-.04',
mason:'M-.28-.3 L.28-.3 L.28.31 L-.28.31 Z M-.28-.1 L.28-.1 M-.28.11 L.28.11 M0-.3 L0-.1 M-.12-.1 L-.12.11 M.13.11 L.13.31',
morph:'M0-.36 L.32.18 L-.32.18 Z M0 0 L0-.36 M0 0 L.32.18 M0 0 L-.32.18 M-.26.3 Q0 .47.26.3',
titan:'M-.32-.3 L.32-.3 L.39.05 L.2.35 L-.2.35 L-.39.05 Z M-.18-.08 L-.04-.02 M.04-.02 L.18-.08 M-.14.16 L.14.16',
phoenix:'M0-.37 L.13-.05 L.43-.31 L.27.19 L.08.3 L 0 .43 L-.08.3 L-.27.19 L-.43-.31 L-.13-.05 Z',
thermal:'M-.3.26 L-.25-.22 L-.05-.38 L.11-.18 L.25-.34 L.31.03 L.45.03 L.45.23 L.1.21 M-.07-.02 L.12.01',
curse:'M-.3-.27 Q0-.42.3-.27 L.29.25 L 0 .39 L-.29.25 Z M-.38-.04 L.4.18 M-.4.25 L.37-.2 M-.14-.2 L.16.27',
cards:'M-.37-.19 L-.11-.3 L.07.22 L-.19.34 Z M.07-.3 L.37-.19 L.19.34 L-.07.22 Z M-.26-.03 L-.09.12 M.22-.07 L.09.16',
saw:'M-.18-.37 L.03-.3 L.22-.37 L.27-.16 L.42-.04 L.3.13 L.29.35 L.06.29 L-.1.42 L-.22.24 L-.43.17 L-.32-.04 L-.37-.24 L-.18-.37 M0-.15 A.15.15 0 1 1-.01-.15',
sniper:'M-.3 0 A.3.3 0 1 1-.3.01 M-.42 0 L.42 0 M0-.42 L 0 .42 M.25.27 L.41.4',
trail:'M-.34.25 L-.17-.07 L.08-.34 L.24-.18 L.08.04 L.31.29 M-.42-.03 L-.25-.25 M-.1.35 L.1.19',
mimic:'M0-.37 L.3-.25 L.36.2 L 0 .4 L-.36.2 L-.3-.25 Z M0-.37 L-.08-.17 L.09.04 L-.07.23 L 0 .4 M-.22-.07 L-.07.05 M.07.05 L.22-.07',
greatsword:'M-.21-.42 L.03-.35 L.08.19 L-.14.19 Z M-.28.2 L.2.2 M-.04.2 L-.04.42 M.18-.2 L.32-.08 L.24.3',
storm:'M-.33.07 Q-.48-.18-.2-.2 Q-.15-.45.09-.25 Q.37-.4.38-.08 Q.55.14.2.12 M-.07.05 L-.2.3 L.03.22 L-.04.43 L.27.13',
current:'M-.35.24 Q-.48-.18-.12-.3 Q.27-.42.36-.06 Q.36.18.1.12 Q-.04.06.05-.09 M-.24.12 Q0 .4.39.17',
decoy:'M-.37-.21 L-.11-.35 L.03-.16 L-.04.22 L-.24.34 L-.4.12 Z M.06-.28 L.28-.38 L.4-.16 L.32.24 L.14.36 L.03.12 Z',
mycelium:'M-.3-.08 L 0 .3 L.3-.2 L-.3-.08 M-.43-.08 Q-.29-.42-.15-.08 Z M-.13.3 Q0-.02.13.3 Z M.17-.2 Q.3-.5.43-.2 Z',
vampire:'M-.42-.3 L-.12-.1 L0-.37 L.14-.09 L.42-.3 L.32.23 L.13.15 L 0 .4 L-.13.15 L-.32.23 Z M-.08.01 L 0 .13 L.08.01',
fracture:'M0-.42 L.31-.21 L.39.13 L.1.39 L-.27.29 L-.4-.08 Z M0-.42 L-.1-.13 L.13.07 L-.04.4 M-.38-.08 L-.1-.13 M.13.07 L.39.13',
combo:'M-.42-.05 L-.27-.25 L-.07-.13 L-.02.18 L-.23.35 L-.43.22 Z M.06-.24 L.25-.39 L.44-.2 L.4.05 L.15.21 L.04.08 Z M-.32-.03 L-.12.01 M.17-.19 L.35-.13',
};
function emblem(c,id,color,fallback){c.strokeStyle=color;c.fillStyle=color;c.lineWidth=.052;c.lineCap='round';c.lineJoin='round';if(insignia[id]){const p=new Path2D(insignia[id]);c.stroke(p);}else{c.textAlign='center';c.textBaseline='middle';c.font='bold .57px "Segoe UI Symbol",sans-serif';c.fillText(fallback,0,.018);}}
// Restores the project's original 23c5c34 layered metal/core material, without
// replacing current collision, weapon, portrait or interpolation code.
export function orbSkin(b){
  const cl=CLASSES[b.classId]||CLASSES.basic,material=cl.material||cl.orbMaterial||(['tide','crystal','frost','returner','current','fracture','captor','rewind','mimic'].includes(b.classId)?'glass':'metal');
  const color=b.element==='neutral'?cl.color:ELEMENTS[b.element]?.color||cl.color;
  const band=b.level>=19?5:b.level>=15?4:b.level>=10?3:b.level>=5?2:b.level>=2?1:0,key=`${b.classId}/${color}/${band}/${material}`;
  if(skins.has(key))return skins.get(key);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=144;const c=canvas.getContext('2d');c.translate(72,72);c.scale(58,58);
  const g=c.createRadialGradient(-.38,-.45,.03,0,0,1.04);g.addColorStop(0,'#f5fff1');g.addColorStop(.16,color);g.addColorStop(.44,material==='glass'?'#9fd1db':'#485952');g.addColorStop(.70,'#152329');g.addColorStop(.92,'#101416');g.addColorStop(1,color);
  circle(c,.98,g,color,.045);c.save();c.beginPath();c.arc(0,0,.94,0,TAU);c.clip();
  for(let i=0;i<6;i++){c.save();c.rotate(i*TAU/6+.32);c.beginPath();c.moveTo(.20,-.58);c.lineTo(.46,-.45);c.lineTo(.69,-.52);c.lineTo(1.03,-.32);c.lineTo(1.1,-.20);c.lineTo(.71,-.40);c.lineTo(.42,-.36);c.closePath();c.fillStyle=band?color:'#9ca9a2';c.globalAlpha=.82;c.fill();c.restore();}
  c.restore();circle(c,.48,'#172120',color,.06);
  if(band>=3){c.strokeStyle=color;c.lineWidth=.045;for(let i=0;i<3;i++){c.beginPath();c.arc(0,0,.71,i*TAU/3+.15,i*TAU/3+1.35);c.stroke();}}
  if(band>=2){c.save();c.globalAlpha=.28;c.strokeStyle=color;c.lineWidth=.018;circle(c,.85,null,color,.018);c.restore();}
  emblem(c,b.classId,color,b.glyph||cl.icon);
  if(band===5){c.strokeStyle='#fff2a0';c.lineWidth=.045;c.setLineDash([.16,.11]);circle(c,1.08,null,'#fff2a0',.045);}
  if(skins.size>=180)skins.clear();skins.set(key,canvas);return canvas;
}
export function drawOrb(c,b,x,y,r){const size=r*144/58;c.drawImage(orbSkin(b),x-size/2,y-size/2,size,size);}
