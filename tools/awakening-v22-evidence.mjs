import {writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {EVOLUTIONS,VAMPIRE_MATCH_HEAL_CAP} from '../packages/content/evolution.js';
import {AWAKENINGS,AWAKENING_PROFILE_IDS} from '../packages/content/awakening.js';
import {createDemoArena,NORMAL_DEMO_PROFILES} from '../packages/sim/demo.js';
import {stepArena,arenaSnapshot} from '../packages/sim/arena.js';

function trace(id,awakening){
  const a=createDemoArena(id,{awakening}),events=[...a.events],objects=new Map();
  let maxRadius=a.balls[0].r,maxMass=a.balls[0].cl.mass,maxProjectiles=0,maxFields=0;
  for(let tick=0;tick<360&&!a.done;tick++){
    const seq=a.seq;stepArena(a);events.push(...a.events.filter(e=>e.seq>seq));
    maxRadius=Math.max(maxRadius,a.balls[0].r);maxMass=Math.max(maxMass,a.balls[0].cl.mass);
    maxProjectiles=Math.max(maxProjectiles,a.objects.filter(o=>!o.field).length);maxFields=Math.max(maxFields,a.objects.filter(o=>o.field).length);
    for(const o of a.objects.filter(o=>o.owner.id==='demo'&&o.awakeningId))if(!objects.has(o.id))objects.set(o.id,{kind:o.kind,r:o.r,expires:o.expires,born:o.born,speed:Math.hypot(o.vx??0,o.vy??0),push:o.push,range:o.mythicRange,pull:o.mythicPull,greaterUntil:o.greaterUntil,currentPower:o.currentPower,maxHp:o.maxHp,x2:o.x2,y2:o.y2});
  }
  const source=events.filter(e=>e.sourceId==='demo'),starts=source.filter(e=>e.type==='awakening-start');
  return {profileId:id,prepared:true,setup:a.demo.setup,ballId:a.balls[0].ballId,firstActivationTick:starts[0]?.tick??null,activationCount:starts.length,
    state:arenaSnapshot(a).balls[0].awakeningState,actualDamage:source.filter(e=>e.type==='hit'&&e.awakeningId).reduce((n,e)=>n+e.damage,0),
    healing:source.filter(e=>e.type==='heal').map(e=>({tick:e.tick,kind:e.kind,healing:e.healing})),maxRadius,maxMass,maxProjectiles,maxFields,
    actualObjects:[...objects.values()],actions:[...new Set(source.filter(e=>['skill','hit','field','block','awakening-hit','awakening-dash'].includes(e.type)).map(e=>e.action??e.kind))],
    awakeningEvents:source.filter(e=>e.type.startsWith('awakening')).map(e=>({tick:e.tick,type:e.type,action:e.action,damage:e.damage,impulse:e.impulse,rootAttackId:e.rootAttackId,reason:e.reason}))};
}
const normal=NORMAL_DEMO_PROFILES.map(id=>trace(id,false));
const mythic=AWAKENING_PROFILE_IDS.map(id=>trace(id,true));
const report={ruleset:'2.2.0',kind:'PREPARED_SCENARIOS_NOT_NATURAL_ACTIVATION_RATES',generatedAt:new Date().toISOString(),durationTicks:360,
  methodology:{actualDamage:'All actual damage from attacks marked with awakeningId; not incremental damage compared with evolution alone.',healing:'Actual heal events including original recovery mechanics, distinguished by kind; state.healing counts actual mythic-lifesteal only.',branches:'One disclosed prepared scenario per profile; morph/cards select their offensive scheduled form. This is not independent proof of every alternate form/target condition.',naturalReadiness:'NOT MEASURED by this six-second prepared demo tool; see the separate normal-match balance report.'},normal,awakening:mythic};
const output=resolve(process.argv[2]??'docs/v2.2-awakening-evidence.json');await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
const esc=x=>String(x??'').replaceAll('|','/').replaceAll('\n',' ');
const lines=[
 '# YeomBallForge v2.2.0 구현 설계',
 '',
 '이 문서는 현재 코드의 실행 계약에서 생성합니다. 명세는 `spec/v2.2-combat-evolution.md`, 전투 정의는 `packages/content/evolution.js`와 `packages/content/awakening.js`입니다. 경제·저장·랭킹·멀티플레이 기능의 완료 여부는 별도 통합 검증 보고서를 기준으로 합니다.',
 '',
 '## 실행 계약',
 '',
 '- 50개 기존 프로필 각각 일반 진화 1개. 실제 피해·방어·포획·귀환·이동 등 서버 사건으로 준비하고 지정 행동에서 소모합니다.',
 '- 49개 각성은 실제 카탈로그 T1 폼, 프로필 일치, level 19를 모두 요구합니다. Basic, 가짜 레벨, T2 폼, 내려간 레벨은 거절합니다.',
 '- 각성 상태: charging → ready(통상 18틱 예고) → active → spent. 예고 중 사망은 cancelled. 경기 생성 시 전부 초기화합니다. phoenix/rewind는 기존 유일한 회복 순간에만 준비·발동하며 별도 부활을 만들지 않습니다.',
 '- 일반 진화와 각성의 같은 기하 계수는 교체합니다. 예전 HP 35% 공통 ×1.12 버프는 제거했습니다. 각성별 피해·형태·움직임·반동을 실제 공통 판정에 연결합니다.',
 '- 각성에서 파생된 공격은 한 각성 root/대상 합계가 min(공격력 ×2.75, 대상 최대 HP ×30%) 이하입니다. 세 검/굴절탄/집중 살보는 추가로 한 묶음의 대상 중복을 막습니다. DOT와 일반 후속 공격을 새 각성으로 재귀 호출하지 않습니다.',
 '- 전역 투사체 120/필드 30, 공당 투사체 6/필드 3, 사건 링 128을 유지합니다. 각성 예약 행동 최대 8, 중복 기억 최대 64, 기록 피해 항목 최대 32입니다.',
 '- `awakening-ready/start/shape/path/dash/beat/hit/end`와 실제 hit 사건의 awakeningId/rootAttackId를 서버 snapshot/replay에 남깁니다. 준비 시연은 `createDemoArena(build,{awakening:true})`이며 카탈로그의 합법 T1을 사용하고 준비 조건을 화면에 명시합니다.',
 '- 6초 시연은 실제 전투 승률이나 자연 발동률의 근거가 아닙니다. `tests/awakening-v22.test.js`는 대표 8종을 먼저 확인한 뒤 49종 실제 효과와 진화만 켠 반사실 비교를 확인합니다.',
 '- 아래의 표시 피해는 awakeningId가 붙은 공격의 실제 총 피해입니다. 일반 진화만 켠 경기보다 추가로 얻은 순증 피해를 뜻하지 않습니다. 회복 목록은 기존 phoenix/rewind 회복과 일반 흡혈도 종류별로 구분하며, state.healing은 실제 적용된 추가 각성 흡혈만 셉니다.',
 '',
 '## 일반 진화 50종',
 '',
 '| 프로필 / ID | 실제 준비 | 소모 행동 | 실제 계수/행동 | 지속·회복 틱 | 약점 | 이벤트/자산 키 |',
 '|---|---|---|---|---|---|---|',
 ...Object.values(EVOLUTIONS).map(d=>`| ${d.profileId} / ${d.id} | ${d.trigger} × ${d.count} | ${d.actions.join(', ')} | ${esc(JSON.stringify(d.effects))} | ${d.duration} / ${d.recovery} | ${esc(d.weakness)} | evo-charge/ready/activate/consume/expire · ${d.vfxId} |`),
 '',
 '## 합법 T1 고유 각성 49종',
 '',
 '각 행의 숫자는 실행 데이터입니다. 모든 행의 각성 시연과 일반 시연이 존재합니다. `vfx` 키는 기존 프로필의 실제 무기/장판/투사체와 절차적 효과 렌더링을 선택하는 식별자이며, 49장의 별도 이미지 파일을 뜻하지 않습니다.',
 '',
 '| 프로필 / 각성 ID·이름 | 발동 | 실제 행동·계수 | 지속/회수 틱 | 약점 | 시연의 실제 증거 | 효과 키 |',
 '|---|---|---|---|---|---|---|',
 ...Object.values(AWAKENINGS).map(d=>{const t=mythic.find(t=>t.profileId===d.profileId);return `| ${d.profileId} / ${d.id} ${d.name} | ${esc(d.trigger)} → ${d.actionKinds.join(', ')} | ${esc(d.effect)} · ${esc(JSON.stringify(d.modifiers))} | ${d.durationTicks}/${d.recoveryTicks} | ${esc(d.weakness)} | ${t.activationCount}회 @${t.firstActivationTick}틱; 실제 표시 피해 ${t.actualDamage.toFixed(1)}; ${esc([...new Set([...t.actualObjects.map(o=>o.kind),...t.awakeningEvents.filter(e=>e.type==='awakening-hit'||e.type==='awakening-dash').map(e=>e.action??e.type),...t.healing.map(h=>h.kind+' 회복')])].join(', ')||'실제 궤도/형태 변화')} | ${d.vfx} |`; }),
 '',
 '## 세부 경계',
 '',
 '- 전면 물결은 후방 목표를 제외하고 한 번의 증폭 반격 뒤 일반 상태로 돌아갑니다. 철퇴·대검·결정타의 회수 동안 재공격을 억제합니다.',
 '- 두 번째 질주는 방향을 미리 고정하고 별도 예고 후 실제 몸체를 이동합니다. 순간이동 교차 절단은 출구 주변만 검사하며 이동 경로에는 피해를 주지 않습니다.',
 '- frost 파쇄/portal 절단/idol 후속 박자/균사 연쇄는 지연된 실제 범위 검사입니다. 대상이 벗어나거나 소유자가 죽으면 피해가 발생하지 않습니다.',
 '- 소환은 기존 사역마 한 개를 최대 150틱 상위형으로 바꿉니다. 같은 생성 경로의 일반 진화가 상위형 반지름을 다시 덮어쓰지 않으며 기존 객체의 수명을 연장하지 않습니다. 분신은 최대 내구성 42, 반지름 14이며 실제 표적·파괴 물체입니다.',
 '- 철퇴의 각성 몸체 강타만 벽꿍 상태를 부여합니다. 파생 wallslam은 다시 벽꿍이나 새 충격량을 부여하지 않으며 같은 원인의 반복 벽 접촉은 추가 피해를 재생성하지 않습니다.',
 `- vampire 추가 회복은 최초 유효 근접 피해의 22%와 최대 HP 2.5% 중 작은 값, 잃은 HP 이하이며 죽은 뒤 회복하지 않습니다. 일반·각성 흡혈의 경기 합산 실제 회복은 최대 HP의 ${VAMPIRE_MATCH_HEAL_CAP*100}%로 제한합니다. phoenix 원래 회복은 최대 HP 16% 한 번, rewind는 일반 진화 포함 최대 HP 13.8% 한 번이며 각성이 회복량을 다시 곱하지 않습니다. 시간의 닻은 복귀 순간 잔류 피격 관성도 해제합니다.`,
 '- 6초 동안 모든 발사가 맞아야 하는 것은 아닙니다. 예컨대 고정 탄환의 빗나감은 소모되고, 실제 기하·방향·회수 변경을 검증합니다. 진화만 적용한 동일 시드와 비교하여 이름/상태/색상만 달라지는 구현을 거릅니다.',
 '- 프로필마다 한 가지 공개된 준비 조건을 사용합니다. morph/cards 시연은 예정된 공격 형태를 선택합니다. 별도 회귀 테스트는 예정된 방어 형태에서 동일한 실제 공격을 받아 일반 진화만 켠 경우보다 차단량이 늘고 실제 HP 손실이 감소함을 확인합니다. 모든 대체 형태·상대 조건의 조합을 전수 검사한 것은 아닙니다. portal은 출구 주변 판정을 보기 위한 정지 훈련 대상을 사용합니다.',
 '',
 '## 검증 범위와 남은 판단',
 '',
 '생성 명령: `node tools/awakening-v22-evidence.mjs`. 기계 판독 증거: `docs/v2.2-awakening-evidence.json`. 테스트 명령: `node --test tests/awakening-v22.test.js`.',
 '',
 '자연 경기 발동률·첫 발동 시점·승률·럼블 부하와 네트워크·브라우저 결과는 `docs/v2.2-balance.md`, `docs/v2.2-validation.md` 및 해당 실제 산출물에서 별도 보고합니다. 이 생성 문서는 그 결과를 대신하지 않습니다. 청취 평가와 AWS/Render 실서비스 배포는 이 도구에서 NOT RUN입니다.',
 '',
];
await writeFile(resolve('docs/v2.2-design.md'),lines.join('\n'));
console.log(JSON.stringify({output,normal:normal.length,awakening:mythic.length,started:mythic.filter(t=>t.activationCount===1).length}));
