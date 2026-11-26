import {impactCategory,FEEDBACK_LIMITS} from './combat-feedback.js';
let context,compressor,musicTimer,musicNotes=0;
const owners=new Map(),nodes=new Set(),voices=new Set();
let peakNodes=0,peakVoices=0,played=0,dropped=0;
const defaults={sound:false,music:false,volume:.6,sfxVolume:.7,musicVolume:.2};
// Two different layers per material: low/body envelope plus contact/air/noise.
// Values are original synthesis recipes, not sampled commercial audio.
export const SOUND_RECIPES=Object.freeze({
  body:[[175,55,.07,'sine',.065],[470,180,.025,'triangle',.012]],
  slash:[[1450,370,.055,'triangle',.034],[3100,900,.035,'noise',.013]],
  heavy:[[112,30,.24,'sine',.105],[690,170,.075,'triangle',.045]],
  blast:[[135,42,.20,'sawtooth',.045],[1350,240,.12,'noise',.022]],
  wallslam:[[88,28,.22,'sine',.10],[240,80,.13,'noise',.032]],
  bounce:[[140,65,.045,'sine',.026]],
  guard:[[890,560,.13,'triangle',.047],[1700,1100,.06,'sine',.018]],
  ice:[[2000,2700,.07,'sine',.025],[4100,1700,.08,'noise',.014]],
  electric:[[920,2450,.05,'square',.017],[1850,470,.075,'sine',.029]],
  water:[[300,82,.17,'sine',.06],[630,270,.09,'triangle',.018]],
  summon:[[280,560,.18,'sine',.036],[700,1400,.10,'triangle',.018]],
  'summon-shot':[[720,350,.08,'triangle',.021],[1600,860,.05,'sine',.011]],
  'summon-hit':[[250,100,.10,'triangle',.035],[550,220,.06,'sine',.016]],
  flight:[[880,320,.05,'triangle',.016]],
  glass:[[2650,1740,.16,'sine',.024],[3900,2280,.11,'triangle',.012]],
  organic:[[195,72,.12,'triangle',.032],[510,260,.09,'noise',.012]],
  void:[[82,35,.25,'sine',.050],[330,115,.18,'sine',.021]],
  rubber:[[115,310,.10,'sine',.052],[360,120,.12,'triangle',.023]],
  flame:[[120,65,.16,'triangle',.037],[1750,360,.14,'noise',.018]],
  echo:[[610,440,.22,'sine',.023],[920,660,.28,'sine',.013]],
  mark:[[540,230,.12,'triangle',.030],[790,340,.17,'sine',.013]],
  sonic:[[523,523,.18,'sine',.028],[784,784,.13,'sine',.016]],
  absorb:[[740,170,.17,'sine',.046],[1300,390,.11,'triangle',.016]],
  skill:[[340,120,.10,'triangle',.039],[870,460,.045,'sine',.017]],
  charge:[[180,480,.20,'sine',.022]],
  evolution:[[440,660,.20,'sine',.025],[660,880,.15,'triangle',.013]],
  awakening:[[220,440,.28,'triangle',.034],[880,1320,.24,'sine',.026]],
  ko:[[180,35,.34,'triangle',.07],[610,90,.18,'sine',.038]],
});
const hidden=()=>typeof document!=='undefined'&&document.hidden;
function currentOwner(){return [...owners.keys()].at(-1);}
export function unlockAudio(){try{const Constructor=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Constructor)return;if(!context){context=new Constructor();compressor=context.createDynamicsCompressor();compressor.threshold.value=-12;compressor.knee.value=12;compressor.ratio.value=8;compressor.attack.value=.003;compressor.release.value=.12;compressor.connect(context.destination);}context.resume().catch(()=>{});}catch{}}
export function audioOptions(owner,options){if(!owners.has(owner))for(const previous of owners.keys())silenceAudio(previous);const state=owners.get(owner)||{options:{...defaults},roots:new Map(),intervals:new Map()};Object.assign(state.options,options);owners.set(owner,state);for(const node of [...nodes])if(node.owner===owner&&!(node.music?state.options.music:state.options.sound))node.stop();if([...owners.values()].some(s=>s.options.music)){musicTimer??=setInterval(musicStep,550);}else{clearInterval(musicTimer);musicTimer=null;}}
export function silenceAudio(owner){const state=owners.get(owner);state?.roots.clear();state?.intervals.clear();for(const n of [...nodes])if(n.owner===owner)n.stop();for(const v of [...voices])if(v.owner===owner)voices.delete(v);}
export function releaseAudio(owner){silenceAudio(owner);owners.delete(owner);if(!owners.size){clearInterval(musicTimer);musicTimer=null;}}
export function audioDiagnostics(){return {owners:owners.size,nodes:nodes.size,graphNodes:[...nodes].reduce((sum,n)=>sum+n.graphNodes,compressor?1:0),sfxNodes:[...nodes].filter(n=>!n.music).length,voices:voices.size,peakNodes,peakVoices,played,dropped,limits:{sfxNodes:8,voices:4,musicNodes:2}};}
let noiseBuffer;
function noise(){if(noiseBuffer)return noiseBuffer;noiseBuffer=context.createBuffer(1,Math.ceil(context.sampleRate*.4),context.sampleRate);const values=noiseBuffer.getChannelData(0);let seed=1013904223;for(let i=0;i<values.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;values[i]=seed/0xffffffff*2-1;}return noiseBuffer;}
function synth(owner,tone,gainScale,variation=1,music=false,onDone=()=>{}){
  const [freq,end,duration,type,gain]=tone,now=context.currentTime,env=context.createGain();let source,filter;
  if(type==='noise'){source=context.createBufferSource();source.buffer=noise();filter=context.createBiquadFilter();filter.type='bandpass';filter.frequency.setValueAtTime(freq,now);filter.frequency.exponentialRampToValueAtTime(Math.max(30,end),now+duration);filter.Q.value=.9;source.connect(filter).connect(env);}else{source=context.createOscillator();source.type=type;source.frequency.setValueAtTime(freq*variation,now);source.frequency.exponentialRampToValueAtTime(Math.max(20,end*variation),now+duration);source.connect(env);}
  const peak=Math.min(.12,gain*gainScale);env.gain.setValueAtTime(.0001,now);env.gain.linearRampToValueAtTime(Math.max(.0001,peak),now+.004);env.gain.exponentialRampToValueAtTime(.0001,now+duration);env.connect(compressor);
  let ended=false;const node={owner,music,graphNodes:filter?3:2,stop(){if(ended)return;try{source.stop();}catch{}cleanup();}};
  function cleanup(){if(ended)return;ended=true;source.disconnect();filter?.disconnect();env.disconnect();nodes.delete(node);onDone();}
  source.onended=cleanup;nodes.add(node);peakNodes=Math.max(peakNodes,nodes.size);source.start(now);source.stop(now+duration+.012);return node;
}
function musicStep(){const owner=currentOwner(),s=owners.get(owner);if(!s?.options.music||hidden()||context?.state!=='running'||[...nodes].filter(n=>n.music).length>=2)return;const p=s.options,note=[130.81,164.81,196,164.81,146.83,174.61,220,174.61][musicNotes++%8];synth(owner,[note,note,.9,'sine',.035],p.volume*p.musicVolume,1,true);}
export function soundCategory(e){if(e.type==='charge'||/^(charge|beamcharge|thermalcharge|snipercharge|salvocharge|punchcharge|great-charge)$/.test(e.kind))return 'charge';if(e.type==='shot')return e.summon?'summon-shot':'flight';if(e.type==='hit'&&(e.kind==='familiar'||e.reasonTags?.includes('summon')))return 'summon-hit';if(impactCategory(e)==='dot')return 'dot';if(/shard|prism|cardshot/.test(e.kind))return 'glass';if(/bloom|web-cross|seed/.test(e.kind))return 'organic';if(/collapse|gravity/.test(e.kind))return 'void';if(/punch|stretch/.test(e.kind))return 'rubber';if(/blaze|phoenixfire|reform/.test(e.kind))return 'flame';if(/echo|rewind/.test(e.kind))return 'echo';if(/curse/.test(e.kind))return 'mark';if(/sonic|^beat$/.test(e.kind))return 'sonic';return impactCategory(e);}
export function playCombatSound(e,owner=currentOwner()){
  const state=owners.get(owner),p=state?.options;if(owner!==currentOwner()||!p?.sound||hidden()||context?.state!=='running'||e.kind==='pressure'||!['hit','block','wall','ko','skill','shot','charge','evo-activate','awakening-start'].includes(e.type))return;
  if(e.type==='hit'&&!(e.damage>0))return;
  const material=soundCategory(e),recipe=SOUND_RECIPES[material];if(!recipe||material==='dot')return;
  const now=performance.now(),key=`${e.matchId||''}/${e.rootAttackId||e.eventId||e.seq}/${material}`;
  if(state.roots.has(key)||now-(state.intervals.get(material)??-Infinity)<(material==='slash'?40:65))return;
  if(voices.size>=FEEDBACK_LIMITS.sfxVoices||[...nodes].filter(n=>!n.music).length+recipe.length>FEEDBACK_LIMITS.sfxNodes){dropped++;return;}
  state.roots.set(key,now);if(state.roots.size>256)state.roots.delete(state.roots.keys().next().value);state.intervals.set(material,now);
  const voice={owner},variation=1+((e.seq||0)%5-2)*.011;let remaining=recipe.length;voices.add(voice);peakVoices=Math.max(peakVoices,voices.size);played++;
  for(const layer of recipe)synth(owner,layer,Math.max(0,Math.min(1,p.volume))*Math.max(0,Math.min(1,p.sfxVolume)),variation,false,()=>{if(--remaining===0)voices.delete(voice);});
}
