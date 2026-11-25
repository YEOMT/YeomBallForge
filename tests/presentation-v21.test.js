import test from 'node:test';
import assert from 'node:assert/strict';
import {PresentationClock,HpTrail} from '../public/presentation.js';
const frame=(tick,hp=100)=>({id:'m1',tick,balls:[{hp}],events:tick?[{type:'hit',tick}]:[]});
test('final hit trails settle without advancing the recorded final tick or HP',()=>{
  const clock=new PresentationClock(),trail=new HpTrail();clock.push(frame(0));clock.sample(0);trail.value('a',100,100,0);
  const final={...frame(6,0),done:true};clock.push(final);
  const first=clock.sample(100);assert.equal(first.frame,final);assert.deepEqual(trail.value('a',0,100,first.effectTime),{blue:0,red:1});
  const settled=clock.sample(1000);assert.equal(settled.tick,6);assert.equal(settled.frame,final);assert.equal(settled.frame.balls[0].hp,0);
  assert.deepEqual(trail.value('a',0,100,settled.effectTime),{blue:0,red:0});
  clock.push({...frame(0),id:'m2'});assert.equal(clock.sample(2000).effectTime,0);
});
test('display frame holds HP and events together while positions may interpolate',()=>{
  const clock=new PresentationClock();clock.push(frame(0));clock.sample(0);clock.push(frame(6,80));
  const half=clock.sample(50);assert.equal(half.frame.tick,0);assert.equal(half.frame.balls[0].hp,100);assert.equal(half.frame.events.length,0);assert.equal(half.alpha,.5);
  const impact=clock.sample(100);assert.equal(impact.frame.tick,6);assert.equal(impact.frame.balls[0].hp,80);assert.equal(impact.frame.events[0].tick,6);
});
test('hitstop remains display-only and limited to100ms/120ms per second',()=>{
  const clock=new PresentationClock();clock.push(frame(0));clock.sample(0);clock.push(frame(12,60));
  assert.equal(clock.stop(500,100),100);assert.equal(clock.stop(100,100),20);assert.equal(clock.stop(50,100),0);
  clock.sample(100);assert.equal(clock.tick,0);assert.equal(clock.frames.at(-1).tick,12);
  clock.sample(200);assert.ok(clock.tick>0);assert.equal(clock.stop(100,1100),100);
});
test('reduced motion consumes identical authoritative frames without hold',()=>{
  const clock=new PresentationClock();clock.push(frame(0));clock.sample(0);clock.push(frame(6,80));clock.stop(100,10);
  assert.equal(clock.sample(100,{reduced:true}).frame.balls[0].hp,80);
});
test('presentation buffer and lag stay bounded; changed match discards old events',()=>{
  const clock=new PresentationClock();for(let i=0;i<500;i++)clock.push(frame(i*6));
  assert.ok(clock.frames.length<=64);clock.sample(10);assert.ok(clock.frames.at(-1).tick-clock.tick<=24);
  clock.push({...frame(0),id:'m2'});assert.equal(clock.frames.length,1);assert.equal(clock.tick,0);
});
test('blue HP changes immediately; red waits200ms then follows450ms',()=>{
  const trail=new HpTrail();trail.value('a',100,100,0);
  assert.deepEqual(trail.value('a',60,100,100),{blue:.6,red:1});
  assert.equal(trail.value('a',60,100,299).red,1);
  assert.ok(Math.abs(trail.value('a',60,100,525).red-.8)<1e-8);
  assert.deepEqual(trail.value('a',60,100,750),{blue:.6,red:.6});
});
test('continuous hits cannot extend red trail beyond900ms; recovery/maxHP resets',()=>{
  const trail=new HpTrail();trail.value('a',100,100,0);trail.value('a',90,100,1);
  for(let i=1;i<=8;i++)trail.value('a',90-i*5,100,i*100);
  assert.deepEqual(trail.value('a',50,100,901),{blue:.5,red:.5});
  assert.deepEqual(trail.value('a',80,100,910),{blue:.8,red:.8});
  assert.deepEqual(trail.value('a',80,200,920),{blue:.4,red:.4});
  trail.reset();assert.deepEqual(trail.value('a',40,100,0),{blue:.4,red:.4});
});
