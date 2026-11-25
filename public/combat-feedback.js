// Presentation recipes consume authoritative event categories only. No combat RNG.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const FEEDBACK_LIMITS=Object.freeze({maxStopMs:90,stopPerSecondMs:120,normalEffects:96,lowEffects:24,sfxVoices:4,sfxNodes:8});
export function effectPriority(e){return e.type==='ko'?5:e.type==='awakening-start'||e.type==='awakening-path'||/(charge$|portal-warning)/.test(e.kind)?4:['hit','block','heal'].includes(e.type)?(impactCategory(e)==='dot'?1:3):e.type==='shot'||e.type==='wall'?0:2;}
function lowestEffect(effects){let lowest=0;for(let i=1;i<effects.length;i++)if(effectPriority(effects[i])<effectPriority(effects[lowest]))lowest=i;return lowest;}
export function trimEffects(effects,limit){while(effects.length>limit)effects.splice(lowestEffect(effects),1);}
export function retainEffect(effects,event,limit){trimEffects(effects,limit);if(effects.length>=limit){const lowest=lowestEffect(effects);if(effectPriority(effects[lowest])>effectPriority(event))return false;effects.splice(lowest,1);}effects.push(event);return true;}
export function impactCategory(e){
  if(e.kind==='pressure'||['poison','burn'].includes(e.kind))return 'dot';
  if(e.type==='ko')return 'ko';
  if(e.kind==='wallslam')return 'wallslam';
  if(e.type==='block')return e.kind==='absorb'?'absorb':'guard';
  if(e.type==='wall')return 'bounce';
  if(e.type?.startsWith('awakening-'))return 'awakening';
  if(e.type?.startsWith('evo-'))return 'evolution';
  if(e.impactKind==='dot')return 'dot';
  if(e.impactKind==='wall')return 'wallslam';
  if(e.impactKind==='cut')return 'slash';
  if(e.impactKind==='heavy')return 'heavy';
  if(/mace|greatsword|combo-finish|stretch|titan/.test(e.kind))return 'heavy';
  if(/trinity|blade|crescent|ring|saw|thorn/.test(e.kind))return 'slash';
  if(/ice|frost|fracture/.test(e.kind))return 'ice';
  if(/arc|bolt|dash|lightning|sniper/.test(e.kind))return 'electric';
  if(/familiar|summon|decoy/.test(e.kind))return 'summon';
  if(/water|tide|surge|current/.test(e.kind))return 'water';
  if(/beam|thermal|cannon|reactor/.test(e.kind))return 'blast';
  if(/absorb|starcounter|captor|portal/.test(e.kind))return 'absorb';
  if(e.impactKind==='summon')return 'summon';
  return e.kind==='body'||e.impactKind==='body'?'body':'skill';
}
export function healthGeometry(x,width,blue,red,mirrored=false){const b=clamp(blue,0,1),r=clamp(Math.max(blue,red),0,1);return {blueX:mirrored?x+width-width*b:x,blueWidth:width*b,redX:mirrored?x+width-width*r:x,redWidth:width*r};}
const RECIPES={body:[12,.6,.06,.06,120],slash:[10,.7,.07,.05,120],heavy:[62,4.5,.22,.18,220],blast:[48,3.3,.17,.13,190],wallslam:[48,3.6,.18,.14,220],guard:[22,1.1,.04,.04,130],bounce:[0,0,.01,.01,80],ice:[0,0,.04,.03,160],electric:[28,1.5,.12,.09,130],water:[25,1.1,.1,.08,180],summon:[18,.5,.07,.05,160],absorb:[15,.4,.05,.05,180],skill:[30,1.6,.12,.09,160],ko:[80,5,.2,.16,240],awakening:[0,0,0,0,240],evolution:[0,0,0,0,180],dot:[0,0,0,0,100]};
export function feedbackFor(e){
  const category=impactCategory(e),r=RECIPES[category]||RECIPES.skill;
  const impulse=typeof e.impulse==='number'?e.impulse:Math.hypot(e.impulse?.x||0,e.impulse?.y||0);
  const actual=Number(e.damage||e.blocked||0),grade=Number.isFinite(e.impactGrade)?clamp(e.impactGrade,0,3):clamp(Math.max(actual/25,impulse/170),.35,2);
  const scale=clamp(.7+grade*.25,.7,1.2),damageEvent=(e.type==='hit'&&actual>0)||e.type==='block'||e.type==='ko';
  return {category,grade,stopMs:damageEvent?Math.min(90,r[0]*scale):0,shake:damageEvent?r[1]*scale:0,squash:r[2],stretch:r[3],duration:r[4],weight:Math.min(1,actual/45),direction:Math.atan2(e.ny||0,e.nx||1)};
}
