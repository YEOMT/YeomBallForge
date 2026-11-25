import {CLASSES,ELEMENTS} from './packages/content/classes.js';
const skins=new Map(),TAU=Math.PI*2;
function circle(c,r,fill,stroke,width){c.beginPath();c.arc(0,0,r,0,TAU);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
// Restores the project's original 23c5c34 layered metal/core material, without
// replacing current collision, weapon, portrait or interpolation code.
export function orbSkin(b){
  const cl=CLASSES[b.classId]||CLASSES.basic,material=cl.material||cl.orbMaterial||(['tide','crystal','frost'].includes(b.classId)?'glass':'metal');
  const color=b.element==='neutral'?cl.color:ELEMENTS[b.element]?.color||cl.color;
  const band=b.level>=19?4:b.level>=15?3:b.level>=10?2:b.level>=2?1:0,key=`${b.classId}/${color}/${band}/${material}`;
  if(skins.has(key))return skins.get(key);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=144;const c=canvas.getContext('2d');c.translate(72,72);c.scale(58,58);
  const g=c.createRadialGradient(-.38,-.45,.03,0,0,1.04);g.addColorStop(0,'#f5fff1');g.addColorStop(.16,color);g.addColorStop(.44,material==='glass'?'#9fd1db':'#485952');g.addColorStop(.70,'#152329');g.addColorStop(.92,'#101416');g.addColorStop(1,color);
  circle(c,.98,g,color,.045);c.save();c.beginPath();c.arc(0,0,.94,0,TAU);c.clip();
  for(let i=0;i<6;i++){c.save();c.rotate(i*TAU/6+.32);c.beginPath();c.moveTo(.20,-.58);c.lineTo(.46,-.45);c.lineTo(.69,-.52);c.lineTo(1.03,-.32);c.lineTo(1.1,-.20);c.lineTo(.71,-.40);c.lineTo(.42,-.36);c.closePath();c.fillStyle=band?color:'#9ca9a2';c.globalAlpha=.82;c.fill();c.restore();}
  c.restore();circle(c,.48,'#172120',color,.06);
  if(band>=3){c.strokeStyle=color;c.lineWidth=.045;for(let i=0;i<3;i++){c.beginPath();c.arc(0,0,.71,i*TAU/3+.15,i*TAU/3+1.35);c.stroke();}}
  c.fillStyle=color;c.textAlign='center';c.textBaseline='middle';c.font='bold .57px "Segoe UI Symbol",sans-serif';c.fillText(b.glyph||cl.icon,0,.018);
  if(band===4){c.strokeStyle='#fff2a0';c.lineWidth=.045;c.setLineDash([.16,.11]);circle(c,1.08,null,'#fff2a0',.045);}
  if(skins.size>=180)skins.clear();skins.set(key,canvas);return canvas;
}
export function drawOrb(c,b,x,y,r){const size=r*144/58;c.drawImage(orbSkin(b),x-size/2,y-size/2,size,size);}
