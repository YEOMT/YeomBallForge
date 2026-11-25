import fs from 'node:fs/promises';
const read=async name=>JSON.parse(await fs.readFile('artifacts/'+name,'utf8'));
const before=await read('v22-baseline-final-balance.json'),after=await read('v22-final-balance.json');
const baselineRows=await read('v22-baseline-final-balance.matches.json'),rows=await read('v22-final-balance.matches.json');
const selected=await read('v22-selected-balance.json');
const pct=n=>(n*100).toFixed(1)+'%',num=n=>Number(n).toFixed(2),ci=a=>a.map(pct).join('–');
function sections(records){return Object.fromEntries([...new Set(records.map(r=>r.label))].map(label=>{const a=records.filter(r=>r.label===label),times=a.map(r=>r.seconds).sort((a,b)=>a-b),endings={};for(const r of a)endings[r.ending]=(endings[r.ending]??0)+1;return [label,{n:a.length,synthetic:a.filter(r=>r.synthetic).length,meanSeconds:times.reduce((x,y)=>x+y,0)/a.length,medianSeconds:times[Math.floor(a.length*.5)],p95Seconds:times[Math.floor(a.length*.95)],endings,pressureShare:a.reduce((s,r)=>s+r.pressureShare,0)/a.length}];}));}
before.sections=sections(baselineRows);
before.methodology.awakening='The v2.1 baseline used a shared low-HP skill event for eight profiles, not v2.2 awakening-ready/start/hit events. New-contract counters in this baseline JSON are unavailable and must not be interpreted as zero legacy awakening activity. Outcomes and HP damage still use the actual baseline simulator.';
const out='docs/evidence-v2.2';await fs.mkdir(out,{recursive:true});
for(const [name,data] of [['balance-before.json',before],['balance-after.json',after],['balance-selected.json',selected]])await fs.writeFile(out+'/'+name,JSON.stringify(data,null,2));
const b=before.sections['legal-t5'],a=after.sections['legal-t5'],oldProfile=new Map(before.profiles.map(p=>[p.id,p]));
const e=(x,k)=>x.endings[k]??0,pressure=x=>(e(x,'pressure-ko')+e(x,'pressure-mixed-ko'))/x.n;
const mirrors=rows.filter(r=>r.label==='mirror'),leftWins=mirrors.filter(r=>r.winner===(r.swapped?'B':'A')).length;
const deep=[...after.groups,...selected.groups].filter(g=>g.label.startsWith('deep'));
const extremes=deep.filter(g=>g.winRate<.2||g.winRate>.8);
const lines=[
'# v2.2 전투 밸런스 분석',
'',
'기준 main: `cad650262eb44bff828c3b664b79b97cf74d5db1` (v2.1.0). 비교본은 이 PR의 v2.2.0 공통 시뮬레이터다. 아래는 합법 빌드의 결정적 시뮬레이션이며 실제 학생 수업의 승률이 아니다. 명세의 초기 검토 목표를 충족하지 못한 항목도 그대로 남긴다.',
'',
'## 표본과 재현',
'',
`- 기준 ${before.n.toLocaleString()}경기, 변경본 ${after.n.toLocaleString()}경기와 추가 문제 조합 ${selected.n.toLocaleString()}경기.`,
'- 전체 T5: 합법 49프로필 × 서로 다른 1,176쌍 × 8시드 × 두 배열 배치 = 18,816경기. 프로필당 768경기. 기본 특성 미선택, 실제 폼 속성. 기본 공은 합법 T20/19 및 초반 상대에서 별도 검사한다.',
'- 기준 호환 816건만 과거 고정 위치를 사용한다. 불법 basic T5 및 강제 속성 대조군은 synthetic으로 표시하며 전체 T5 승률에서 제외한다.',
'- 문제 조합은 각 100시드 × 두 배치 = 200경기. 동일 프로필 T1 대 T3/T5, 대표 8종 T10 및 세 호환 특성, T1 교차, 거울전은 별도 그룹이다. 전체 49×49×특성×티어를 모두 검사한 것으로 해석하지 않는다.',
'- 승률은 승리/n이며 무승부는 별도다. Wilson 95% 구간은 표본의 이항 승리 불확실성 표현이며 이 고정 상대 분포 밖의 실전 일반화를 보장하지 않는다.',
'- v2.1은 8종 공통 저체력 skill 사건을 사용하므로 신규 각성 사건 카운터와 직접 비교하지 않는다. 기준 JSON의 신규 계약 카운터 0은 기존 각성이 없었다는 의미가 아니다. 같은 시드를 여러 상대에 재사용한 스크리닝의 구간은 참고값이며 독립적인 실제 수업 표본이 아니다.',
'- 시드, 각 조합 n/승/무, 피해 종류, 각성 준비/발동/실제 피해·회복·방어는 [이전 JSON](evidence-v2.2/balance-before.json), [최종 JSON](evidence-v2.2/balance-after.json), [추가 200경기 조합](evidence-v2.2/balance-selected.json)에 있다.',
'',
'```sh',
'# baseline directory must be an untouched checkout of the main SHA above',
'V22_TARGET_ROOT=/path/to/baseline BALANCE_OUT=artifacts/v22-baseline-final-balance.json node tools/combat-v22-analysis.mjs',
'BALANCE_OUT=artifacts/v22-final-balance.json node tools/combat-v22-analysis.mjs',
'BALANCE_SUITE=selected BALANCE_PAIRS_FILE=tools/v22-review-pairs.json BALANCE_OUT=artifacts/v22-selected-balance.json node tools/combat-v22-analysis.mjs',
'node tools/report-v22-balance.mjs',
'```',
'',
'PowerShell에서는 같은 이름의 `$env:` 변수로 지정한다. 원시 경기 JSON은 각 출력 파일 옆 `.matches.json`으로 생성된다. 본문 수치는 JSON에서 생성한다.',
'',
'## 합법 동티어 종료 원인',
'',
'| 지표 | v2.1 | v2.2 |',
'|---|---:|---:|',
...[["평균 초",num(b.meanSeconds),num(a.meanSeconds)],["중앙값 초",num(b.medianSeconds),num(a.medianSeconds)],["P95 초",num(b.p95Seconds),num(a.p95Seconds)],["압박 전 자연 KO",e(b,'natural-ko'),e(a,'natural-ko')],["압박 후 공격 KO",e(b,'post-pressure-attack-ko')+e(b,'post-pressure-mixed-attack-ko'),e(a,'post-pressure-attack-ko')+e(a,'post-pressure-mixed-attack-ko')],["압박 원인 KO (혼합 포함)",pct(pressure(b)),pct(pressure(a))],["무승부",e(b,'simultaneous-draw'),e(a,'simultaneous-draw')],["제한시간 판정",e(b,'limit-adjudication'),e(a,'limit-adjudication')],["평균 압박 피해 비율",pct(b.pressureShare),pct(a.pressureShare)]].map(r=>'| '+r.join(' | ')+' |'),
'',
'압박은 30초 시작/40초 제한/10+12×경과초를 그대로 유지했다. 같은 틱의 실제 공격과 압박 피해는 혼합으로 표시하며 최종 원인은 서버 cause를 따른다. **압박 원인 KO 20% 이하 목표는 미달이다.** 제한시간 도달이 없다는 사실을 자연스럽게 싸움이 끝났다는 근거로 쓰지 않는다.',
'',
'## 프로필별 전체 스크리닝',
'',
`평균 승률 35–65% 밖: v2.1 ${before.review.overallOutside35to65.length}개 → v2.2 ${after.review.overallOutside35to65.length}개. 전체 로스터 균형 목표는 미달이며 출시 준비 완료로 판정하지 않는다.`,
'',
'| 프로필 | 이전 승률 | 현재 승률 | 현재 Wilson 95% | 진화 실제 발동/n |',
'|---|---:|---:|---|---:|',
...after.profiles.sort((a,b)=>b.winRate-a.winRate).map(p=>`| ${p.id} | ${pct(oldProfile.get(p.id).winRate)} | ${pct(p.winRate)} | ${ci(p.wilson95)} | ${p.evolved}/${p.n} |`),
'',
'## 심층 문제 조합',
'',
`총 ${deep.length}쌍, 각 200경기 중 20% 미만/80% 초과는 ${extremes.length}쌍이다. 강한 카운터뿐 아니라 약한 설치형의 전반적인 유효 공격 기회 부족도 남아 있다.`,
'',
'| A 대 B | A 승/무/n | A 승률 | Wilson 95% |',
'|---|---:|---:|---|',
...deep.map(g=>`| ${g.a} 대 ${g.b} | ${g.wins}/${g.draws}/${g.n} | ${pct(g.winRate)} | ${ci(g.wilson95)} |`),
'',
'## 실제 조정과 남은 원인',
'',
'- elastic의 방향 무시 확정 타격을 12틱 고정 방향 예고/측후방 빗나감으로 바꿨다. portal도 고정 출구 예고, 0.12초 부분 예측, 실제 출구 거리 검사, 175틱 회복을 사용한다. 초기 portal 과도한 약화와 trinity 과도한 추격은 중간 전체 분석 뒤 재조정했다.',
'- summoner 유도 혼합 .06→.035, 기본 발사 간격 64→72틱. 진화는 기존 사역마 하나를 제한 시간 강화한다. mace 등 일부 근접은 165 이내에서 제한 회전으로 접근 기회를 얻는다. 전역 속도/HP/공격력/속성 배율을 바꾸지 않았다.',
'- storm은 고정 낙뢰의 부분 예측, mason은 실제 첫 반사 소유권, current는 소유자를 제외한 고정 물길 방향을 수정했다. [정확한 경로·수치·회귀 근거](v2.2-core-changes.md)를 참조한다.',
'- blade/chain 등의 지속 명중과 약한 decoy/mimic/mason/current의 조건부 기회 차이가 여전히 크다. 카운터 정체성을 없애는 전역 보정이나 임의 승자 변경으로 이 결과를 숨기지 않았다. 다음 튜닝은 유효 접촉·필드 체류·상대 탄환 기회를 실제 사건으로 분리해야 한다.',
'',
'## T1 효용과 편향',
'',
'아래는 동일 프로필 T1 대 T5 각 16경기의 작은 표본이다. 각성 피해는 표시된 각성 공격의 실제 피해이며, 각성 없는 반사실 대비 순증가 피해가 아니다. 방어는 순서가 있는 start/end 사건 사이 실제 양수 block을 합산하며 그 기간의 일반 방어도 포함한다. 순증가 각성 방어로 해석하지 않는다. 방어·이동형의 유용성을 피해 0만으로 무효라고 판단하지 않는다. 별도 49종 진화만 켠 A/B 실제 효과 테스트와 준비 시연을 함께 보되, 시연을 정상 발동률로 대신하지 않는다.',
'',
'| 프로필 | 승/무/n | 각성 준비/시작/피해 적중 | 평균 표시 피해/회복/활성 중 방어 |',
'|---|---:|---:|---:|',
...after.groups.filter(g=>g.label==='t1-vs-tier'&&g.tierB===5).map(g=>`| ${g.a} | ${g.wins}/${g.draws}/${g.n} | ${g.readyA}/${g.activatedA}/${g.effectiveA} | ${num(g.awakeningDamageA/g.n)}/${num(g.awakeningHealingA/g.n)}/${num(g.awakeningBlockedA/g.n)} |`),
'',
`거울전 ${mirrors.length}건의 배열 왼쪽 승리 ${leftWins}, 오른쪽 승리 ${mirrors.filter(r=>r.winner&&r.winner!==(r.swapped?'B':'A')).length}, 무승부 ${mirrors.filter(r=>r.draw).length}. 양 배치 검사와 별도 순서/동시 피해 회귀를 유지한다.`,
`최종 전체 분석의 단일 root/대상 피해 최대 ${pct(after.rootDamageReview.maxRatio)}, 25% 초과 ${after.rootDamageReview.matchesAbove25Percent}경기. 추가 조합 최대 ${pct(selected.rootDamageReview.maxRatio)}. 준비 각성의 적중·사망 취소·수명·단일 벽꿍·피해 예산은 별도 회귀 검사한다.`,
'',
'## 판정',
'',
'기능·기믹 구현과 재현 가능한 분석은 제출하지만, 압박 의존도·로스터 승률 편차·일부 T1 조건부 발동률은 추가 개선 과제다. 이 PR은 해당 문제와 성능 비용을 검토할 개발 후보이며, 밸런스 완성이나 공개 서버 운영 성공을 주장하지 않는다.',
''];
await fs.writeFile('docs/v2.2-balance.md',lines.join('\n'));
console.log(JSON.stringify({before:before.n,after:after.n,selected:selected.n,legal:a,extremePairs:extremes.length}));
