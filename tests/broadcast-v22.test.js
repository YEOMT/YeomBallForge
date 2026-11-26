import test from 'node:test';
import assert from 'node:assert/strict';
import {FeaturedMatches} from '../apps/server/broadcast.js';
import {buildHighlights} from '../packages/sim/highlights.js';
import {Room} from '../apps/server/room.js';
import {finalizeBuild} from '../packages/content/forge.js';
const ball=(id,hp=100)=>({id,name:id,level:15,classId:'mace',hp,maxHp:100,alive:true});
const arena=(id,n=1)=>({id,tick:60,balls:[ball(id+'a',n*10),ball(id+'b',n*10)],done:false});
test('teacher recommendations are bounded, throttled and contain facts rather than extra snapshots',()=>{
  const f=new FeaturedMatches(),a=Array.from({length:15},(_,i)=>arena('m'+i));a[4].balls[0].level=19;
  const first=f.update(a,0);assert.equal(first.length,3);assert.equal(first[0].matchId,'m4');assert.ok(first[0].reasons.includes('T1 공 출전'));
  assert.equal(f.update(a,749),first);a[4].done=true;assert.ok(!f.update(a,750).some(x=>x.matchId==='m4'));
  assert.ok(first.every(x=>!('balls' in x)&&!('objects'in x)));f.update([],1500);assert.equal(f.history.size,0);
});
test('rank recommendations are teacher-only and never steal manual broadcast focus',()=>{
  const r=new Room('220022',0),p=Array.from({length:8},(_,i)=>r.add('학생'+i));r.startQuiz(0);
  for(const x of p)r.ranking.queue(x,0);r.tick(50);const focus=r.teacher.focus;
  const host=r.state(r.teacher,50),student=r.state(p[0],50);assert.equal(host.room.ranking.featured.length,3);
  assert.equal(student.room.ranking.featured,undefined);assert.equal(student.room.battle.arenas.length,1);
  r.tick(850);r.state(r.teacher,850);assert.equal(r.teacher.focus,focus);
});

test('duel recommendations never invent both-sides reasons or thirty-name cards for rumble',()=>{
  const f=new FeaturedMatches(),rumble={id:'r',mode:'rumble',tick:200,balls:Array.from({length:30},(_,i)=>ball('r'+i,i<2?10:100))};
  assert.deepEqual(f.update([rumble],0),[]);assert.equal(f.history.size,0);
});
test('milestone announcements only expose valid ready forms once per slot and reset with the room',()=>{
  const r=new Room('220023',0),p=r.add('<student>');r.startQuiz(0);const b=p.inventory.slots[0];
  Object.assign(b,{level:19,ballId:'earth-1-mace',classId:'mace',path:'earth',pendingChoice:true});
  r.observeMilestones(p,1);assert.equal(r.announcements.length,0);finalizeBuild(b);r.observeMilestones(p,2);r.observeMilestones(p,3);
  assert.equal(r.announcements.length,1);assert.equal(r.announcements[0].tier,1);
  assert.deepEqual(Object.keys(r.announcements[0]).sort(),['at','ballName','id','kind','name','tier']);
  assert.equal(r.announcementsAt(7000).length,0);r.phase='RESULTS';r.reset(7000);assert.equal(r.announced.size,0);
});
test('highlights reference only actual bounded record events and never invent awakening hits',()=>{
  const events=[{eventId:'m:1',seq:1,type:'block',kind:'tide',sourceId:'a',blocked:12,tick:100,rootAttackId:'b1'},{eventId:'m:2',seq:2,type:'hit',kind:'wallslam',sourceId:'a',damage:20,tick:160,rootAttackId:'a1'},{eventId:'m:3',seq:3,type:'awakening-start',sourceId:'a',tick:170},{eventId:'m:4',seq:4,type:'ko',kind:'pressure',tick:200}];
  const frames=[{tick:0,balls:[ball('a'),ball('b')]},{tick:200,balls:[ball('a',1),ball('b',0)]}];
  const rows=buildHighlights('m',frames,events);assert.ok(rows.length<=6);assert.ok(rows.some(x=>x.kind==='wallslam'));assert.ok(rows.some(x=>x.kind==='counter'));
  assert.ok(!rows.some(x=>x.kind==='awakening'));assert.ok(rows.every(x=>x.fromTick>=0&&x.toTick<=200&&x.eventIds.every(id=>events.some(e=>e.eventId===id))));
  assert.ok(!JSON.stringify(rows).includes('"frames"'));
});
