import {pathToFileURL} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {ECONOMY_RULES, SUCCESS_PERCENT, MAX_LEVEL, AWAKENING_LEVEL, wardRequired, BASE_TICKETS, TICKETS_PER_CORRECT} from '../packages/content/economy.js';
import {initialBuild, finalizeBuild, enhance} from '../packages/content/forge.js';

// All transitions are sampled from the actual shared forge with explicit branch
// draws, not copied probability/penalty formulas. No random Monte Carlo samples.
export function economicModel() {
  const branch = (level, wards, protect, success) => {
    const b = {...initialBuild(), level, best:level, tickets:1000, shields:wards,
      awakeningRolled:true, pendingChoice:level>=2};
    finalizeBuild(b);
    const r=enhance(b,()=>success?0:0.999999,()=>0.5,{protect});
    if(r.success!==success)throw new Error('All v2.1 stages must allow both branches');
    return {level:b.level,wards:b.shields,cost:1000-b.tickets};
  };
  return {version:ECONOMY_RULES.version,rules:ECONOMY_RULES,baseTickets:BASE_TICKETS,ticketsPerCorrect:TICKETS_PER_CORRECT,
    transitions:Array.from({length:MAX_LEVEL},(_,level)=>({
      chance:SUCCESS_PERCENT[level+1]/100,need:wardRequired(level),
      wards:Array.from({length:4},(_,wards)=>({
        unprotected:{success:branch(level,wards,false,true),failure:branch(level,wards,false,false)},
        protected:wards>=wardRequired(level)?{success:branch(level,wards,true,true),failure:branch(level,wards,true,false)}:null,
      })),
    }))};
}
export function economicAnalyzer(model=economicModel()) {
  const memoA=new Map(),memoB=new Map();
  const key=(budget,level,wards)=>(budget*20+level)*4+wards;
  function distributionA(budget,level=0,wards=0) {
    const k=key(budget,level,wards);if(memoA.has(k))return memoA.get(k);
    const distribution=Array(20).fill(0);
    if(level===MAX_LEVEL||budget<1){distribution[level]=1;return distribution;}
    const t=model.transitions[level],protectedAttempt=level>=AWAKENING_LEVEL;
    const purchased=protectedAttempt?Math.max(0,t.need-wards):0;
    const cost=1+purchased*model.rules.wardPrice;
    if(budget<cost){distribution[level]=1;return distribution;}
    const branches=t.wards[wards+purchased][protectedAttempt?'protected':'unprotected'];
    for(const [name,p] of [['success',t.chance],['failure',1-t.chance]]){
      const next=branches[name],tail=distributionA(budget-cost,next.level,next.wards);
      for(let i=0;i<20;i++)distribution[i]+=p*tail[i];
    }
    memoA.set(k,distribution);return distribution;
  }
  function optimalT1(budget,level=0,wards=0) {
    if(level===MAX_LEVEL)return 1;if(budget<1)return 0;
    const k=key(budget,level,wards);if(memoB.has(k))return memoB.get(k);
    const t=model.transitions[level];let best=0;
    for(const mode of ['unprotected','protected']){
      const b=t.wards[wards][mode];if(!b)continue;
      const value=t.chance*optimalT1(budget-1,b.success.level,b.success.wards)+(1-t.chance)*optimalT1(budget-1,b.failure.level,b.failure.wards);
      best=Math.max(best,value);
    }
    if(wards<3&&budget>=model.rules.wardPrice)best=Math.max(best,optimalT1(budget-model.rules.wardPrice,level,wards+1));
    memoB.set(k,best);return best;
  }
  function row(budget) {
    const d=distributionA(budget),mass=d.reduce((a,b)=>a+b,0);
    if(Math.abs(mass-1)>1e-10)throw new Error('Terminal probability mass must be one');
    const a=d[19],b=optimalT1(budget);
    return {tickets:budget,correct:(budget-model.baseTickets)/model.ticketsPerCorrect,
      policyA:{T5:d.slice(15).reduce((a,b)=>a+b,0)*100,T3:d.slice(17).reduce((a,b)=>a+b,0)*100,T1:a*100,terminalMass:mass},
      policyB:{T1:b*100},classroom30:{policyA:(1-(1-a)**30)*100,policyB:(1-(1-b)**30)*100}};
  }
  function classroom(seconds,secondsPerQuestion,accuracy=.8){
    const n=Math.floor(seconds/secondsPerQuestion);let probability=(1-accuracy)**n,a=0,b=0,mass=0;
    for(let correct=0;correct<=n;correct++){
      const budget=model.baseTickets+model.ticketsPerCorrect*correct;
      a+=probability*distributionA(budget)[19];b+=probability*optimalT1(budget);mass+=probability;
      probability*=((n-correct)/(correct+1))*accuracy/(1-accuracy);
    }
    return {quizSeconds:seconds,secondsPerQuestion,questions:n,accuracy,expectedCorrect:n*accuracy,
      expectedTickets:model.baseTickets+model.ticketsPerCorrect*n*accuracy,policyA_T1:a*100,policyB_T1:b*100,probabilityMass:mass};
  }
  return {distributionA,optimalT1,row,classroom};
}
export function economyReport() {
  const model=economicModel(),a=economicAnalyzer(model);
  return {rules:model.rules,method:'Finite-state dynamic programming; complete probability sums, IEEE-754 arithmetic, no Monte Carlo',
    policies:{A:'Before T10 unprotected; from T10 buy missing wards and protect; stop when combined cost cannot be paid',
      B:'Bellman maximum T1 probability for one ball; buy a ward, protect, or attempt unprotected without knowledge of future draws'},
    assumptions:['One ball, immediate choices, no time cost, no additional rewards, stop at T1',
      'Classroom assumes 30 independent players with the same budget and policy',
      'Policies are not confidence bounds or observed student results; B is not a proof about all three-slot strategies'],
    rows:[30,50,70,90,130,170].map(a.row),
    classroomTimeExamples:[[450,18],[540,14],[600,12],[600,8]].map(([s,q])=>a.classroom(s,q)),
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const data=process.argv.includes('--model')?economicModel():economyReport();
  const json=JSON.stringify(data,null,2)+'\n',out=process.argv.indexOf('--out');
  if(out>=0)await writeFile(process.argv[out+1],json);else process.stdout.write(json);
}
