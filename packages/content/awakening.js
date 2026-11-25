import {BALL_CATALOG,getBall} from './balls.js';

// One real action contract per legal T1 profile. Numbers here drive both the
// shared simulation and descriptions; no general-purpose T1 damage multiplier.
const definitions=[
  ['crimson','홍련 핵폭쇄','blaze','충전 화염 충돌','짧은 접촉 폭쇄와 큰 밀침','충돌을 빗나가면 소모',{push:1.3},'flare'],
  ['ring','이중 태양륜','orbit,blade,ring','화염륜 진화 뒤 날 접촉','두 실제 날의 외곽 궤도 확장','궤도 안쪽과 바깥 사각',{orbit:1.2,weaponR:1.08},'sunring'],
  ['tide','해왕의 반격','surge,tide','유효 방어 완충 뒤 반격','정면 압축 물결의 범위와 밀침','뒤쪽은 반격 범위 밖',{range:1.25,push:1.45},'frontwave'],
  ['cannon','심해 관통포','wave,cannon','벽 압력 충전 뒤 발사','큰 관통탄과 발사 반동','발사 방향 고정',{push:1.3},'deepcannon'],
  ['bolt','천뢰 연속질주','dash,bolt','진화 질주 준비 뒤 질주','고정 예고를 가진 두 직선 질주','두 번째 질주도 빗나갈 수 있음',{dashSpeed:1.04,dashTicks:1.1},'double-dash'],
  ['magnet','극성 폭주','arc,magnet','방전 진화 뒤 사거리 진입','넓은 방전과 첫 적의 극성 수렴','대상별 중복 사슬 불가',{range:1.2},'polarity'],
  ['mace','대지 분쇄','mace','충전 철퇴의 다음 유효 접촉','실제 대형 머리와 강한 벽 충격','무거운 회수와 안쪽 사각',{weaponR:1.24,push:1.35},'earthbreak'],
  ['crystal','만상 결정','crystal,shard','준비된 결정의 유효 방어','막은 방향의 넓은 결정 파편','반사 재귀와 자동 전방위 방어 없음',{},'crystal-shard'],
  ['thorn','독화 만개','thorn','독 표식 상대의 다음 가시 접촉','남은 독 일부를 소비한 접촉 파열','소모한 독은 지속 피해와 이중 계산하지 않음',{},'poison-bloom'],
  ['seed','세계수 발아','seed,bloom','강화 씨앗 준비 뒤 발아','한 씨앗의 넓은 발아 고리','예고 뒤 범위 밖으로 회피',{fieldRadius:1.22},'worldseed'],
  ['prism','칠색 굴절','prism','분광 진화 뒤 다음 세 탄','세 탄의 제한된 굴절 궤도','같은 적에게 세 탄 중 한 번만 각성 증폭',{},'refraction'],
  ['gravity','특이점 붕괴','gravity,collapse','강화 중력장 생성','짧게 강한 흡인 후 작은 중심 붕괴','중심 밖으로 벗어나기',{pull:1.22},'singularity'],
  ['hourglass','역사의 반향','echo,hourglass','시간 방어 뒤 저장 반격','저장한 공격자의 위치에 지연 반향','사망한 대상에는 불발',{},'history-echo'],
  ['blade','월식 일섬','crescent,blade','검기 진화 뒤 베기','두꺼운 고정 방향 초승달','발사 뒤 방향 전환 불가',{},'eclipse-slash'],
  ['trinity','삼천검무','orbit,trinity,triad','독립 검 연계 뒤 다음 검격','세 방향 검기 한 묶음','한 대상에는 한 묶음 한 번',{},'triad-wave'],
  ['ninja','그림자 교차','shadowdash,ninja','강화 돌진의 첫 발동','예고된 교차 방향의 두 번째 이동','실제 이동 경로만 접촉',{dashTicks:1.1},'cross-dash'],
  ['elastic','거인의 탄성격','punch,stretch,elastic','강화 주먹 준비 뒤 사거리 진입','긴 실제 주먹과 반동·회수','옆과 뒤에 사각',{range:1.23,push:1.3},'giant-punch'],
  ['beam','성광 파동포','beam','강화 차지 뒤 발사','두꺼운 단발 선분 포격과 반동','고정 조준과 긴 재사용',{beamR:1.55,push:1.3},'radiant-beam'],
  ['frost','극야 파쇄','icewave,frost','냉기 진화 뒤 다음 파동','결정 링 뒤 한 번의 지연 파쇄','냉기 대상이 범위를 벗어나면 파쇄 회피',{range:1.08},'polar-fracture'],
  ['portal','차원절단','portalstrike,portal','공간 진화 뒤 출구 도달','출구의 짧은 교차 절단','이동 경로 전체에는 피해 없음',{},'exit-cross'],
  ['summoner','상위 계약','familiar,summon,summoner','사역마 유효 피해 계약 완충','기존 사역마 한 개를 잠시 상위형으로 교체','동시 소환 수와 발사 간격 유지',{},'greater-familiar'],
  ['chain','결속 파단','chain','강화 사슬 적중','짧은 당김 뒤 제한된 파단 밀침','연속 구속과 벽 통과 불가',{},'chain-break'],
  ['idol','피날레 공명','sonic,beat,idol','실제 세 박자 뒤 다음 파동','세 시간차 공명 고리','한 대상당 묶음 피해 상한',{range:1.08},'finale'],
  ['star','별무리 반환','starcounter,starburst,star','실제 포획 충족 뒤 반환','저장한 별빛의 방향성 묶음','적 탄환이 없으면 준비 불가',{},'constellation-return'],
  ['berserk','투지 해방','body,ragebody,ragewave,berserk','투지 준비와 낮은 체력','짧은 격투 뒤 한 번의 발사 충격','직접타 이후 탈진',{push:1.25},'resolve'],
  ['returner','수호륜 회귀','returnshield,returner','벽 반사 뒤 실제 회수 누적','반사한 방패의 빠른 실효 귀환','방패가 손에 없으면 방어 불가',{returnSpeed:1.16},'guardian-return'],
  ['pendulum','초승 스윙','swingdash,swing-release,pendulum','실제 스윙 누적 뒤 줄 해제','원호 끝 관성 발사 강타','정해진 원호와 긴 준비',{push:1.3,dashTicks:1.15,releaseSpeed:1.25},'crescent-swing'],
  ['reactor','최종 살보','missile,reactor','과열 직전의 살보','산개를 집중 궤도로 바꾼 세 발','즉시 냉각하여 다음 발사 지연',{},'final-salvo'],
  ['captor','염력 역전','captured,captor','실제로 포획한 두 탄의 반환','두 저장탄의 빠른 방향성 반격','반사탄 재포획 금지',{},'psychic-return'],
  ['rewind','시간의 닻','rewind','실제 피해 손실과 최초 되감기','위치 닻과 제한된 기존 회복','추가 회복·부활·재사용 없음',{},'anchor'],
  ['mason','연성 성벽','wallsegment,mason','유효 반사 뒤 다음 벽','탈출 공간을 남긴 긴 반사벽','기존 벽 교체와 예고 유지',{fieldLife:1.1},'rampart'],
  ['morph','삼형 완성','morph,morphshot,morph-gap','형태 한 순환의 실제 행동','예정된 현재 형태의 대표 동작','세 형태를 동시에 사용하지 않음',{},'complete-form'],
  ['titan','거신 충돌','resize,body,titan','축소 이동 뒤 큰 형태','실제 큰 몸·질량과 첫 충격','피격 범위 확대와 느린 회복',{bodyMass:1.18,push:1.3},'giant-impact'],
  ['phoenix','재의 태양','reform,phoenixfire','첫 치명 피해의 재형성','유일한 재형성의 태양 고리','회복량과 경기당 한 생명 유지',{},'ash-sun'],
  ['thermal','종언 열선','thermal','강화된 차지 완료','두꺼운 제한 회전 열선','후방 안전지대와 피해 틱 상한',{beamR:1.65},'end-heat'],
  ['curse','매듭 해방','curse-release','대상별 직접타 표식 소비','저장 표식의 제한된 지연 충격','이미 쓴 표식 재사용 불가',{},'knot-release'],
  ['cards','마지막 패','card,cardshot,cardbind','실제 카드 한 순환','다음 예정 카드 한 장의 다른 동작','현재 카드 외 능력 적용 없음',{},'last-card'],
  ['saw','극한 회전','orbit,saw','과열 직전 연속 접촉','짧은 고속 톱 궤도 뒤 냉각','유효 적중 간격과 피해 상한',{spin:1.2,weaponR:1.1},'overdrive-saw'],
  ['sniper','일점 관통','snipe,sniper','강화된 고정 조준 뒤 발사','빠르고 가는 관통탄과 반동','빗나가도 각성 소모',{},'point-pierce'],
  ['trail','광로 폐쇄','lighttrail,trail','유효 횡단 뒤 다음 궤적','예고된 한 긴 빛 선분','한 선분 대상당 한 번',{fieldLife:1.18},'light-seal'],
  ['mimic','모사 완성','copy-cleave,copy-cold,copy-crescent,copybolt,copy','허용 복사 공격의 실제 유효타','허용한 공격 한 번의 넓은 형태','다른 각성·부활·소환 복사 금지',{range:1.16},'perfect-copy'],
  ['greatsword','절산검','greatslash,greatsword','실제 이동 축력 뒤 베기','큰 부채꼴의 단발 강타','긴 예고와 회수·후방 사각',{range:1.22,push:1.22},'mountain-cleave'],
  ['storm','천둥의 심판','cloudmark,lightningstrike,storm','고정 낙뢰 유효타 뒤 마지막 표식','위치가 고정된 마지막 큰 낙뢰','표식 밖으로 이동하면 회피',{},'judgment'],
  ['current','대조류','watercurrent,current','실제 방향 변경 누적 뒤 새 물길','짧고 강한 물길 방향 전환','무한 강제 이동·벽 통과 불가',{},'great-current'],
  ['decoy','거울 수호','decoy','분신이 실제 받은 피해 누적','강화 내구성 분신 한 개','별도 생존자·영구 방어 없음',{},'mirror-guard'],
  ['mycelium','균사 만개','mycelium,web-cross','연결선의 유효 횡단 누적','최대 세 노드의 짧은 연쇄 파열','같은 적에게 무한 연쇄 불가',{},'web-bloom'],
  ['vampire','적월 흡혈','body,ragebody,lifesteal','간격을 지킨 실제 흡혈 누적','실제 근접 피해 기반 제한 회복','최대 HP·생존 상태·회복 상한',{},'red-moon'],
  ['fracture','백야 붕괴','ice-shatter','냉기 표식 완충 뒤 직접타','표식을 소모한 한 번의 얼음 파쇄','표식 즉시 소모·재귀 불가',{},'white-fracture'],
  ['combo','천격 마무리','combo-finish','독립 직접타 연계 뒤 결정타','한 번의 발사형 마무리','연계 만료와 긴 회복',{},'heaven-finisher'],
];

export const AWAKENINGS=Object.freeze(Object.fromEntries(definitions.map(([profileId,name,kinds,trigger,effect,weakness,modifiers,special])=>[profileId,Object.freeze({
  id:'mythic-'+profileId,profileId,name,trigger,effect,weakness,actionKinds:Object.freeze(kinds.split(',')),
  telegraphTicks:['phoenix','rewind'].includes(profileId)?0:18,durationTicks:['ring','summoner','thermal','gravity'].includes(profileId)?150:profileId==='saw'?72:96,
  recoveryTicks:['mace','greatsword','combo','reactor','saw'].includes(profileId)?72:36,
  maxTargetPower:2.75,maxTargetHpFraction:.30,
  modifiers:Object.freeze(modifiers),special,vfx:'mythic-'+special,sfx:['mace','titan','greatsword','combo'].includes(profileId)?'heavy':'awakening',
  description:effect+' · '+trigger+' · 경기당 1회 / '+((['ring','summoner','thermal','gravity'].includes(profileId)?150:profileId==='saw'?72:96)/60).toFixed(1)+'초 이하',
})])));
export const AWAKENING_PROFILE_IDS=Object.freeze([...new Set(BALL_CATALOG.filter(b=>b.tier===1).map(b=>b.classId))]);
export function awakeningFor(build){
  const form=getBall(build?.ballId);
  return build?.level===19&&form?.tier===1&&form.classId===build.classId?AWAKENINGS[build.classId]??null:null;
}
export function validateAwakenings(){
  const ids=Object.keys(AWAKENINGS);
  if(ids.length!==49||AWAKENING_PROFILE_IDS.length!==49||ids.some(id=>!AWAKENING_PROFILE_IDS.includes(id)))throw new Error('T1 각성 카탈로그가 합법 49개 프로필과 일치하지 않습니다.');
  return {profiles:ids.length,basic:!ids.includes('basic')};
}
