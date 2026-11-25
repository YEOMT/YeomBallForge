import test from 'node:test';
import assert from 'node:assert/strict';
import {SUCCESS_PERCENT, ECONOMY_RULES, wardRequired} from '../packages/content/economy.js';
import {initialBuild, finalizeBuild, enhance, forgeQuote, forgeCandidates, chooseBall, choosePath, chooseClass, chooseTrait, resolveHidden, buildReady, resetBuild} from '../packages/content/forge.js';
import {compatibleTraits} from '../packages/content/traits.js';
import {getBallChoices} from '../packages/content/balls.js';
import {createInventory,fundInventory,inventoryBuild,mutateBall,createBall,resetInventoryBall,deleteBall,setStorageLock,freezeBattleBuild,releaseBattleBuild} from '../packages/content/inventory.js';
import {economicModel,economicAnalyzer} from '../tools/economy-v21.mjs';

function ready(level,extra={}) {
  const b={...initialBuild(),level,best:level,pendingChoice:level>=2,tickets:100,awakeningRolled:true,...extra};
  finalizeBuild(b);return b;
}
test('all nineteen target probabilities are public and below 100 percent',()=>{
  assert.deepEqual(SUCCESS_PERCENT,[0,95,92,90,88,85,82,80,78,75,72,68,60,52,44,35,26,18,10,3]);
  assert.ok(SUCCESS_PERCENT.slice(1).every(p=>p>0&&p<100));
  for(let level=0;level<19;level++)assert.equal(ECONOMY_RULES.successByTargetTier[19-level],SUCCESS_PERCENT[level+1]);
});
test('failure boundaries use the current tier, never the target tier',()=>{
  for(const [level,after] of [[0,0],[1,0],[9,8],[10,0],[18,0]]){
    const b=ready(level),r=enhance(b,()=>.999,()=>.5,{protect:false});
    assert.equal(b.level,after);assert.equal(b.tickets,99);assert.equal(r.reset,level>=10);
    if(level>=10){assert.equal(b.path,null);assert.equal(b.traitId,null);assert.equal(b.hiddenClass,null);}
  }
  const final=ready(19),before=structuredClone(final);assert.throws(()=>enhance(final,()=>0));assert.deepEqual(final,before);
});
test('ward needs are 1 for T5, 2 for T4–T2 and 3 for T1; success preserves all wards',()=>{
  for(const [level,need] of [[0,0],[1,1],[14,1],[15,2],[17,2],[18,3]]){
    assert.equal(wardRequired(level),need);
    const success=ready(level,{shields:3});enhance(success,()=>0,()=>.5,{protect:true});assert.equal(success.shields,3);
    const failure=ready(level,{shields:3}),r=enhance(failure,()=>.999,()=>.5,{protect:true});
    assert.equal(failure.shields,3-need);assert.equal(r.wardConsumed,need);assert.equal(failure.level,level);
  }
});
test('protected shortfall rejects before RNG; explicit combined purchase is atomic',()=>{
  const b=ready(18,{shields:2,tickets:3}),before=structuredClone(b);let draws=0;
  assert.throws(()=>enhance(b,()=>{draws++;return 0;},()=>.5,{protect:true}));
  assert.deepEqual(b,before);assert.equal(draws,0);
  assert.deepEqual({...forgeQuote(b,true),version:undefined},{version:undefined,previousTier:2,targetTier:1,chance:3,failureTier:20,wardRequired:3,wardOwned:2,wardShortfall:1,purchaseCost:2,attemptCost:1,totalCost:3});
  const poor=ready(18,{shields:2,tickets:2}),copy=structuredClone(poor);
  assert.throws(()=>enhance(poor,()=>{draws++;return 0;},()=>.5,{protect:true,buyMissing:true}));
  assert.deepEqual(poor,copy);assert.equal(draws,0);
  const r=enhance(b,()=>.999,()=>.5,{protect:true,buyMissing:true});
  assert.equal(r.wardPurchased,1);assert.equal(r.wardConsumed,3);assert.equal(b.tickets,0);assert.equal(b.shields,0);assert.equal(b.level,18);
  const invalid=ready(9,{awakeningRolled:false}),saved=structuredClone(invalid);
  assert.throws(()=>enhance(invalid,()=>0,()=>2));assert.deepEqual(invalid,saved);
});
test('final hidden profile precedes one trait choice; compatible traits survive later upgrades',()=>{
  const b=ready(9,{awakeningRolled:false});let draw=0;
  enhance(b,()=>0,()=>[0,.5][draw++]);
  choosePath(b,'fire');chooseBall(b,'fire-10-crimson');
  assert.equal(b.pendingTrait,false);assert.throws(()=>chooseTrait(b,'stability'));
  resolveHidden(b,true);assert.equal(b.pendingTrait,true);assert.equal(buildReady(b),false);
  chooseTrait(b,compatibleTraits(b)[0].id);const trait=b.traitId;
  assert.equal(buildReady(b),true);enhance(b,()=>0,()=>{throw Error('second hidden roll');});
  chooseBall(b,`hidden-9-${b.hiddenClass}`);assert.equal(b.traitId,trait);assert.equal(b.pendingTrait,false);
  resetBuild(b);assert.equal(b.traitId,null);assert.equal(b.traitPreference,trait);assert.equal(b.awakeningRolled,true);
});
test('three slots share one atomic wallet and preserve hidden ledgers across destructive changes',()=>{
  const inv=createInventory('test');fundInventory(inv);fundInventory(inv);assert.equal(inv.tickets,10);
  createBall(inv,1);createBall(inv,2);assert.equal(inv.tickets,10);
  inv.tickets=1;
  mutateBall(inv,0,b=>enhance(b,()=>0,()=>.5));
  const before=structuredClone(inv);assert.throws(()=>mutateBall(inv,1,b=>enhance(b,()=>0,()=>.5)));assert.deepEqual(inv,before);
  assert.equal(inv.tickets,0);assert.equal(inv.slots[0].level,1);assert.equal(inv.slots[1].level,0);
  inv.slots[0].awakeningRolled=true;inv.slots[0].traitPreference='stability';
  resetInventoryBall(inv,0);assert.equal(inv.hiddenLedger[0],true);assert.equal(inv.tickets,0);
  deleteBall(inv,0);createBall(inv,0);assert.equal(inv.slots[0].awakeningRolled,true);assert.equal(inv.tickets,0);
  assert.equal(inv.slots[1].awakeningRolled,false);assert.equal(inventoryBuild(inv,1).tickets,0);
});
test('stored builds may enter battle, but mutation cannot change a frozen snapshot',()=>{
  const inv=createInventory('frozen');fundInventory(inv);createBall(inv,1);
  setStorageLock(inv,0,true);assert.throws(()=>mutateBall(inv,0,b=>enhance(b,()=>0)));
  const battle=freezeBattleBuild(inv,0),original=structuredClone(battle);
  assert.throws(()=>resetInventoryBall(inv,0));assert.throws(()=>deleteBall(inv,0));
  mutateBall(inv,1,b=>enhance(b,()=>0));assert.deepEqual(battle,original);
  releaseBattleBuild(inv,0,battle.instanceId);assert.equal(inv.slots[0].storageLocked,true);
  setStorageLock(inv,0,false);resetInventoryBall(inv,0);assert.equal(inv.slots[1].level,1);
});
test('room packs gate paths, default selection, new slots and reset without opening forbidden paths',()=>{
  const b={...initialBuild(),level:10,best:10,pendingChoice:true,packId:'defense'};
  assert.deepEqual(forgeCandidates(b).paths,['water','earth']);
  const before=structuredClone(b);assert.throws(()=>choosePath(b,'fire'));assert.throws(()=>chooseClass(b,'crimson'));assert.deepEqual(b,before);
  finalizeBuild(b);assert.equal(b.path,'water');assert.equal(buildReady(b),true);
  const inv=createInventory('pack');inv.packId='defense';createBall(inv,1);
  assert.equal(inv.slots[1].packId,'defense');resetInventoryBall(inv,1);assert.equal(inv.slots[1].packId,'defense');
});
test('exact finite-state economy reproduces v2.1 A/B tables and total mass',()=>{
  const model=economicModel(),analyzer=economicAnalyzer(model);
  const expected=[[30,.000878116353824,.006301834364345],[50,.099357356750331,.214217184902464],[70,.794488861051928,1.211612007832424],[90,2.636900100020811,3.443878755456146],[130,9.941637402721522,11.353719908272742]];
  for(const [tickets,a,b] of expected){const r=analyzer.row(tickets);assert.ok(Math.abs(r.policyA.T1-a)<1e-9);assert.ok(Math.abs(r.policyB.T1-b)<1e-9);assert.ok(Math.abs(r.policyA.terminalMass-1)<1e-12);}
  for(let level=0;level<19;level++)for(let wards=0;wards<4;wards++){
    const t=model.transitions[level].wards[wards];assert.equal(t.unprotected.success.cost,1);assert.equal(t.unprotected.failure.cost,1);
  }
});
