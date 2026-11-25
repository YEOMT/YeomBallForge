// Parameters are shared by simulation and descriptions. No RNG or economy hooks.
const def=(id,name,description,tradeoff,params)=>Object.freeze({id,name,description:description(params),tradeoff:tradeoff(params),params:Object.freeze(params)});
export const TRAITS=Object.freeze({
  wall_charge:def('wall_charge','벽 축전',p=>`유효 벽 반사 ${p.walls}회 뒤 다음 직접 피해 ×${p.power}. 충전 1개, ${p.ttl/60}초 유지.`,p=>`기본 직접 피해 ×${p.base}`,{walls:3,power:1.35,base:.94,ttl:360,wallGap:12}),
  stability:def('stability','무게 중심',p=>`받는 넉백 ×${p.impulse}, 넉백 감쇠 ${p.decay}. 밀려나도 더 빨리 자세를 회복.`,p=>`이동 속도 ×${p.speed}`,{impulse:.65,decay:.90,speed:.94}),
  impact_rhythm:def('impact_rhythm','연계 박자',p=>`${p.window/60}초 안에 직접타 ${p.hits}회 후 다음 직접 피해 ×${p.power}.`,p=>`기본 직접 피해 ×${p.base}. 파생타는 충전하지 않음`,{hits:3,power:1.30,base:.95,window:180}),
  guard_riposte:def('guard_riposte','반격 준비',p=>`유효 방어 뒤 ${p.ttl/60}초 동안 다음 직접 피해 ×${p.power}. 충전 1개.`,p=>`기존 방어 효율 ×${p.block}`,{power:1.30,ttl:120,block:.85}),
  long_reach:def('long_reach','긴 무기',p=>`회전 무기의 실제 궤도 반경 ×${p.reach}.`,p=>`회전 속도 ×${p.spin}`,{reach:1.20,spin:.82}),
  quick_return:def('quick_return','회수 숙련',p=>`방패가 실제 귀환하면 다음 준비시간 ×${p.cooldown}.`,p=>`비행 중 피해 ×${p.power}`,{cooldown:.65,power:.85}),
  residual_heat:def('residual_heat','잔열',p=>`고유 화염 직접타 뒤 ${p.ticks/60}초 동안 ${p.ticks/p.interval}회의 잔열. 각 기본 공격 계수 ×${p.power}.`,p=>`직접 피해 ×${p.base}. 대상별 중첩 1`,{ticks:60,interval:30,power:.08,base:.94}),
  frost_fracture:def('frost_fracture','빙결 균열',p=>`감속 중인 상대에게 직접타 표식 ${p.marks}개를 모아 파쇄 계수 ${p.power}.`,p=>`감속 지속시간 ×${p.slow}. 소환·반사·지속 피해는 표식 제외`,{marks:2,power:.4,slow:.75,window:180}),
  pulse_focus:def('pulse_focus','집중 포격',p=>`차지 공격의 폭 ×${p.width} 또는 관통 +${p.pierce}.`,p=>`차지 예고 시간 ×${p.windup}`,{width:1.35,pierce:1,windup:1.30}),
  squad_focus:def('squad_focus','소수 정예',p=>`사역마 또는 분신 최대 ${p.count}개. 사역마 발사 간격 ×${p.interval}, 분신 체력 ×${p.hp}.`,p=>`동시 소환 수 2 → ${p.count}`,{count:1,interval:.72,hp:1.5}),
});
const common=['stability','impact_rhythm','wall_charge'];
const special={
  crimson:['residual_heat','stability','impact_rhythm'],ring:['long_reach','residual_heat','stability'],
  tide:['guard_riposte','stability','impact_rhythm'],crystal:['guard_riposte','stability','impact_rhythm'],hourglass:['guard_riposte','stability','impact_rhythm'],
  mace:['long_reach','stability','impact_rhythm'],thorn:['long_reach','stability','impact_rhythm'],trinity:['long_reach','stability','impact_rhythm'],
  beam:['pulse_focus','stability','impact_rhythm'],frost:['frost_fracture','stability','impact_rhythm'],summoner:['squad_focus','stability','impact_rhythm'],
  returner:['quick_return','guard_riposte','stability'],reactor:['pulse_focus','residual_heat','stability'],thermal:['pulse_focus','residual_heat','stability'],
  cards:['guard_riposte','stability','impact_rhythm'],saw:['long_reach','stability','impact_rhythm'],sniper:['pulse_focus','stability','impact_rhythm'],
  greatsword:['pulse_focus','stability','impact_rhythm'],decoy:['squad_focus','stability','impact_rhythm'],
};
export function compatibleTraits(buildOrClassId){const id=typeof buildOrClassId==='string'?buildOrClassId:buildOrClassId?.classId??buildOrClassId?.profileId;return (special[id]??common).map(id=>TRAITS[id]);}
export const traitCompatible=(buildOrClassId,id)=>compatibleTraits(buildOrClassId).some(t=>t.id===id);
export const traitFor=build=>build?.level>=10&&traitCompatible(build,build.traitId)?TRAITS[build.traitId]:null;
