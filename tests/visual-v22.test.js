import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {feedbackFor,impactCategory,retainEffect,trimEffects,healthGeometry,FEEDBACK_LIMITS} from '../public/combat-feedback.js';
import {PresentationClock,HpTrail} from '../public/presentation.js';
import {NEW_PROFILES} from '../packages/content/new-profiles.js';
import {CLASSES} from '../packages/content/classes.js';

test('eight representative impacts consume real hit categories and remain materially distinct',()=>{
  const impacts=[['mace','heavy','heavy'],['trinity','cut','slash'],['surge','body','water'],['beam','energy','blast'],['dash','energy','electric'],['frost','body','ice'],['familiar','summon','summon'],['absorb','body','absorb']];
  const feedback=impacts.map(([kind,impactKind,category])=>{const f=feedbackFor({type:kind==='absorb'?'block':'hit',kind,impactKind,damage:30,impactGrade:2,nx:0,ny:1});assert.equal(f.category,category);assert.ok(f.stopMs<=90);return f;});
  assert.ok(feedback[0].stopMs>feedback[1].stopMs*3);assert.ok(feedback[0].squash>feedback[1].squash*2);assert.equal(feedback[5].shake,0);
  assert.equal(impactCategory({type:'hit',kind:'residualheat',impactKind:'dot'}),'dot');
  assert.equal(feedbackFor({type:'hit',kind:'mace',damage:0}).stopMs,0);
  assert.equal(feedbackFor({type:'hit',kind:'burn',damage:12}).stopMs,0);
});
test('120ms hit-stop budget cannot alter authoritative HP; red trail and mirrored bars remain coherent',()=>{
  const clock=new PresentationClock(),trail=new HpTrail(),zero={id:'f',tick:0,balls:[{hp:100}],events:[]},one={id:'f',tick:6,balls:[{hp:50}],events:[{type:'hit',damage:50}]};clock.push(zero);clock.sample(0);clock.push(one);
  const impact=feedbackFor({type:'hit',kind:'mace',damage:50,impactGrade:3});let used=0;for(let i=0;i<5;i++)used+=clock.stop(impact.stopMs,50);assert.equal(used,FEEDBACK_LIMITS.stopPerSecondMs);assert.equal(clock.sample(100).frame.balls[0].hp,100);assert.equal(clock.frames.at(-1).balls[0].hp,50);
  trail.value('p',100,100,0);const hp=trail.value('p',50,100,100),left=healthGeometry(10,400,hp.blue,hp.red),right=healthGeometry(490,400,hp.blue,hp.red,true);assert.equal(left.blueWidth,right.blueWidth);assert.equal(left.blueX,10);assert.equal(right.blueX+right.blueWidth,890);assert.equal(right.redX,490);
  const healed=trail.value('p',90,100,120);assert.equal(healed.blue,healed.red);const g=healthGeometry(0,100,2,-1,true);assert.deepEqual(g,{blueX:0,blueWidth:100,redX:0,redWidth:100});
});
test('all 24 new profiles resolve to their own original geometry and all 50 manifest hashes verify',async()=>{
  const manifest=JSON.parse(await fs.readFile(new URL('../public/assets/balls/manifest-v2.2.json',import.meta.url),'utf8'));
  const geometries=new Set();assert.equal(NEW_PROFILES.length,24);
  for(const profile of NEW_PROFILES){assert.equal(profile.portraitKey,profile.id);const svg=await fs.readFile(new URL('../public/assets/balls/'+profile.id+'.svg',import.meta.url),'utf8');const geometry=[...svg.matchAll(/<(?:path|polygon|circle|ellipse|rect)[^>]*>/g)].map(m=>m[0].replace(/(?:fill|stroke)="[^"]*"/g,'')).join('');geometries.add(geometry);assert.match(svg,/viewBox="0 0 128 128"/);}
  assert.equal(geometries.size,24);assert.equal(manifest.assets.length,50);assert.equal(manifest.aliases,0);
  for(const asset of manifest.assets){const svg=await fs.readFile(new URL('../public/'+asset.path,import.meta.url));assert.equal(createHash('sha256').update(svg).digest('hex'),asset.sha256);}
  assert.equal(Object.keys(CLASSES).length,50);
});
test('layered audio deduplicates roots, bounds simultaneous sources, and synchronously cleans owner/mute',async()=>{
  class Param {setValueAtTime(){} exponentialRampToValueAtTime(){} linearRampToValueAtTime(){}}
  class Node {constructor(){this.frequency=new Param();this.gain=new Param();this.Q={};}connect(){return this;}disconnect(){}start(){}stop(){}}
  class AudioMock {constructor(){this.state='running';this.currentTime=0;this.sampleRate=8000;this.destination={};}resume(){return Promise.resolve();}createDynamicsCompressor(){const n=new Node();for(const k of ['threshold','knee','ratio','attack','release'])n[k]={};return n;}createGain(){return new Node();}createOscillator(){return new Node();}createBufferSource(){return new Node();}createBiquadFilter(){return new Node();}createBuffer(_channels,size){return {getChannelData:()=>new Float32Array(size)};}}
  globalThis.AudioContext=AudioMock;const {audioOptions,unlockAudio,playCombatSound,audioDiagnostics,releaseAudio}=await import('../public/game-audio.js');const owner={};audioOptions(owner,{sound:true});unlockAudio();
  const kinds=['mace','trinity','beam','frost','summon'];for(let i=0;i<kinds.length;i++)playCombatSound({seq:i+1,rootAttackId:'a'+i,type:'hit',kind:kinds[i],damage:30},owner);
  const active=audioDiagnostics();assert.equal(active.voices,4);assert.equal(active.sfxNodes,8);assert.ok(active.graphNodes<=25);assert.equal(active.dropped,1);
  await new Promise(r=>setTimeout(r,80));playCombatSound({seq:99,rootAttackId:'a0',type:'hit',kind:'mace',damage:30},owner);assert.equal(audioDiagnostics().played,4);
  const overlay={};audioOptions(overlay,{sound:true});assert.equal(audioDiagnostics().sfxNodes,0);playCombatSound({seq:201,rootAttackId:'background',type:'hit',kind:'mace',damage:20},owner);assert.equal(audioDiagnostics().sfxNodes,0);playCombatSound({seq:202,rootAttackId:'overlay',type:'hit',kind:'mace',damage:20},overlay);assert.equal(audioDiagnostics().sfxNodes,2);audioOptions(overlay,{sound:false});assert.equal(audioDiagnostics().sfxNodes,0);releaseAudio(overlay);audioOptions(owner,{sound:false});assert.equal(audioDiagnostics().sfxNodes,0);assert.equal(audioDiagnostics().voices,0);releaseAudio(owner);assert.equal(audioDiagnostics().owners,0);assert.equal(audioDiagnostics().graphNodes,1);delete globalThis.AudioContext;
});

test('low-mode decoration pressure preserves contact/KO feedback within the existing budget',()=>{const effects=Array.from({length:24},(_,i)=>({type:'hit',kind:'mace',damage:10,seq:i}));assert.equal(retainEffect(effects,{type:'shot',kind:'shadow',seq:30},24),false);assert.equal(effects.length,24);assert.equal(retainEffect(effects,{type:'ko',kind:'ko',seq:31},24),true);assert.equal(effects.at(-1).seq,31);assert.equal(effects.length,24);effects.push(...Array.from({length:72},()=>({type:'shot',kind:'shadow'})));trimEffects(effects,24);assert.equal(effects.length,24);assert.ok(effects.some(e=>e.type==='ko'));assert.equal(effects.filter(e=>e.type==='shot').length,0);});

test('turning reduced motion on discards pending cosmetic stop instead of replaying it on toggle-off',()=>{const clock=new PresentationClock();clock.push({id:'x',tick:0});clock.sample(0);clock.push({id:'x',tick:12});clock.stop(90,0);clock.sample(50,{reduced:true});assert.equal(clock.hold,0);assert.equal(clock.sample(100,{reduced:false}).tick,6);});
