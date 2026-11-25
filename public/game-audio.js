let context,voices=0,musicTimer,musicNotes=0;
const intervals=new Map(),owners=new Set();
let preferences={sound:false,music:false,volume:.6,sfxVolume:.7,musicVolume:.2};
export function unlockAudio(){try{const Constructor=globalThis.AudioContext||globalThis.webkitAudioContext;if(Constructor){context??=new Constructor();context.resume().catch(()=>{});}}catch{}}
export function audioOptions(owner,options){owners.add(owner);Object.assign(preferences,options);if(!preferences.music||!owners.size){clearInterval(musicTimer);musicTimer=null;}else if(!musicTimer)musicTimer=setInterval(musicStep,500);}
export function releaseAudio(owner){owners.delete(owner);if(!owners.size){clearInterval(musicTimer);musicTimer=null;}}
function synth(freq,end,duration,type,gain){if(!context||context.state!=='running')return;const osc=context.createOscillator(),env=context.createGain(),now=context.currentTime;osc.type=type;osc.frequency.setValueAtTime(freq,now);osc.frequency.exponentialRampToValueAtTime(Math.max(20,end),now+duration);env.gain.setValueAtTime(Math.max(.0001,gain),now);env.gain.exponentialRampToValueAtTime(.0001,now+duration);osc.connect(env).connect(context.destination);osc.start(now);osc.stop(now+duration+.01);return {osc,env};}
function musicStep(){if(!preferences.music||document.hidden||!owners.size)return;const note=[130.81,164.81,196,164.81,146.83,174.61,220,174.61][musicNotes++%8];const pair=synth(note,note,1.1,'sine',preferences.volume*preferences.musicVolume*.04);if(pair)pair.osc.onended=()=>{pair.osc.disconnect();pair.env.disconnect();};}
export function playCombatSound(e){
  if(!preferences.sound||document.hidden||voices>=4||!context||context.state!=='running'||e.kind==='pressure')return;
  const now=performance.now(),material=e.type==='ko'?'ko':e.type==='block'?'shield':e.type==='wall'||e.kind==='wallslam'?'wall':/mace|blade|greatsword|saw|trinity/.test(e.kind)?'metal':/beam|arc|portal|absorb|ice/.test(e.kind)?'energy':'body';
  if(now-(intervals.get(material)||-Infinity)<65)return;intervals.set(material,now);
  const tone={ko:[260,48,.26,'triangle',.09],shield:[620,810,.12,'sine',.06],wall:[105,35,.16,'triangle',.07],metal:[720,140,.08,'triangle',.055],energy:[390,980,.13,'sine',.045],body:[210,85,.06,'sine',.045]}[material];
  const variation=1+((e.seq||0)%5-2)*.012;const pair=synth(tone[0]*variation,tone[1],tone[2],tone[3],tone[4]*preferences.volume*preferences.sfxVolume);if(!pair)return;
  voices++;pair.osc.onended=()=>{voices--;pair.osc.disconnect();pair.env.disconnect();};
}
