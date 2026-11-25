import { NEW_PROFILES } from './new-profiles.js';
// World units and fixed 60 Hz ticks. These numbers are shared by the server and codex.
export const ELEMENTS = {
  neutral: { id: 'neutral', name: '공용', icon: '●', color: '#475569' },
  fire: { id: 'fire', name: '화염', icon: '▲', color: '#dc4a27', strong: 'nature', weak: 'water' },
  water: { id: 'water', name: '물결', icon: '≈', color: '#087db9', strong: 'fire', weak: 'lightning' },
  lightning: { id: 'lightning', name: '번개', icon: 'ϟ', color: '#b27700', strong: 'water', weak: 'earth' },
  earth: { id: 'earth', name: '대지', icon: '◆', color: '#935c35', strong: 'lightning', weak: 'nature' },
  nature: { id: 'nature', name: '자연', icon: '✳', color: '#31834a', strong: 'earth', weak: 'fire' },
};

function ball(id, name, element, icon, description, trigger, weakness, stats, hidden = false) {
  return {
    id, name, element, icon, glyph: icon, portraitKey: id, hidden, description, trigger, weakness,
    color: ELEMENTS[element].color, hpScale: 1, mass: 1, speed: 172, bodyPower: 1, ...stats,
  };
}

export const CLASSES = {
  basic: ball('basic', '원형 코어', 'neutral', '●', '반사 운동으로 몸체를 부딪쳐 피해를 준다.', '몸체 접촉', '원거리 공격이 없다.', { bodyPower: 1.12 }),
  crimson: ball('crimson', '홍련돌격구', 'fire', '▲', '벽에서 코어를 충전한 뒤 몸체 충돌로 밀어내고 화상을 남긴다.', '벽 반사 후 첫 충돌', '충전된 코어를 직접 부딪쳐야 한다.', { speed: 187, power: 1.20, burnTicks: 120, burnPower: .12, push: 180, bodyPower: .86 }),
  ring: ball('ring', '화염륜구', 'fire', '✹', '두 개의 회전 화염 날이 각각 근접한 상대를 벤다.', '날 끝 접촉', '화염 날보다 멀리 있는 적을 공격할 수 없다.', { bodyPower: .93, orbit: 25, weaponR: 6, spin: .070, cooldown: 40, power: .69 }),
  tide: ball('tide', '해일수호구', 'water', '≈', '진행 방향의 방패가 피해를 줄이고 두 번 막으면 반격 파동을 낸다.', '전면 방어 두 번', '뒤에서 맞거나 방어 간격 중에 맞으면 피해를 받는다.', { speed: 164, bodyPower: .91, block: .39, blockCooldown: 29, range: 76, power: .88, maxTargets: 3, push: 92 }),
  cannon: ball('cannon', '파동포구', 'water', '◉', '반사 때 압력을 모아 진행 방향으로 두 상대까지 관통하는 탄환을 쏜다.', '벽 반사 두 번', '발사 후 탄환 방향은 바뀌지 않는다.', { bodyPower: 1.09, power: 1.58, shotSpeed: 290, shotLife: 76, shotR: 8, maxTargets: 2, cooldown: 50, push: 36 }),
  bolt: ball('bolt', '뇌광질주구', 'lightning', 'ϟ', '충전 예고가 끝나면 가까운 적이 있던 곳을 향해 직선으로 질주한다.', '주기적 충전 후 직선 돌진', '질주 중에는 목표 방향을 바꾸지 못한다.', { bodyPower: 1.13, speed: 175, dashSpeed: 390, dashTicks: 30, windup: 24, cooldown: 115, power: 2.10 }),
  magnet: ball('magnet', '자력궤도구', 'lightning', '⊕', '근거리 적에게 방전하고 주변 다른 적 두 명까지 약해지는 번개를 잇는다.', '전극 충전 후 사거리 진입', '근처 대상이 없으면 방전할 수 없다.', { bodyPower: .67, range: 62, chainRange: 80, maxTargets: 3, cooldown: 127, power: .68, falloff: .53, orbit: 21, spin: .053, weaponR: 4 }),
  mace: ball('mace', '거암철퇴구', 'earth', '⬢', '철퇴 머리로 적을 밀친 뒤 벽에 부딪치면 한 번 더 피해를 준다.', '회전 철퇴 머리 적중', '느린 회전 궤도의 안쪽에 사각이 있다.', { bodyPower: .88, mass: 1.24, speed: 155, orbit: 31, spin: .048, weaponR: 8, power: 1.18, cooldown: 54, push: 215, wallPower: .32, wallTicks: 29 }),
  crystal: ball('crystal', '결정방벽구', 'earth', '◇', '정면의 결정이 공격을 줄이고 파편으로 반격한다. 날아온 탄은 한 번 반사한다.', '준비된 결정으로 전면 방어', '뒤쪽과 재충전 중의 공격에 취약하다.', { bodyPower: .80, block: .43, blockCooldown: 120, shotSpeed: 290, shotR: 5, shotLife: 55, power: .75, maxTargets: 1 }),
  thorn: ball('thorn', '가시덩굴구', 'nature', '✳', '회전 가시가 독을 묻힌다. 독은 두 겹까지 쌓이고 마지막 접촉으로 지속시간이 갱신된다.', '짧은 가시 궤도 접촉', '독 피해는 시간에 걸쳐 적용된다.', { bodyPower: .84, orbit: 21, spin: .064, weaponR: 6, cooldown: 44, power: .40, poisonPower: .23, poisonTicks: 150, stacks: 2 }),
  seed: ball('seed', '씨앗포구', 'nature', '✤', '이동 경로에 남긴 씨앗이 적의 접근이나 수명 만료 때 발아해 최대 세 적을 친다.', '접근 또는 씨앗 만료', '발아 범위 밖의 적은 피해를 받지 않는다.', { bodyPower: .71, cooldown: 98, armTicks: 20, life: 180, range: 35, triggerRange: 27, maxTargets: 3, power: .85 }),
  prism: ball('prism', '프리즘 분광구', 'neutral', '✧', '방향이 조금씩 다른 세 분광탄을 한 묶음으로 발사한다.', '프리즘 충전 완료', '발사 후 산개해 먼 적에게 모두 맞히기 어렵다.', { bodyPower: .64, cooldown: 137, shotSpeed: 230, shotLife: 76, shotR: 5, maxTargets: 1, power: .45, color: '#e1a1ff' }, true),
  gravity: ball('gravity', '중력 성단구', 'neutral', '◎', '짧은 중력장이 가까운 적 세 공의 궤도를 당기고 중심에서 폭발한다.', '중력장 주기 도달', '중심 범위를 벗어나면 마지막 타격을 피한다.', { bodyPower: .99, cooldown: 135, life: 42, range: 85, coreRange: 47, maxTargets: 3, pull: 14, power: 1.05, color: '#b1a0ff' }, true),
  hourglass: ball('hourglass', '시간유리구', 'neutral', '⌛', '직접 피격 시 피해 일부를 막고 잔상에 기록된 공격자를 잠시 뒤 반격한다.', '잔상 준비 후 직접 피격', '반격에는 재충전 시간이 필요하다.', { bodyPower: .64, block: .34, blockCooldown: 130, delay: 26, power: .68, color: '#8ce6d6' }, true),
  blade: ball('blade', '월광검사', 'neutral', '☾', '검이 휘둘러질 때 초승달 검기를 날려 직선 위의 상대를 벤다.', '검기 주기 도달', '검기를 쏜 다음 방향을 바꾸지 못한다.', { cooldown: 90, power: 1.15, shotSpeed: 310, shotLife: 55, shotR: 8, maxTargets: 2, bodyPower: .82, color: '#6d58ba' }),
  trinity: ball('trinity', '삼중검객', 'neutral', '✥', '세 자루의 검이 서로 다른 각도에서 회전하며 교차하는 검무를 만든다.', '회전 검 끝 접촉', '짧은 사거리와 공유 재적중 간격이 있다.', { orbit: 26, spin: .058, weaponR: 5, power: .65, cooldown: 48, bodyPower: .82, color: '#397e73' }),
  ninja: ball('ninja', '잔영닌자', 'neutral', '影', '분신 같은 잔상을 남기고 예고한 방향으로 빠르게 돌진한다.', '인술 충전 후 돌진', '돌진 궤도는 직선이며 잔상은 별도 생존자가 아니다.', { cooldown: 130, windup: 20, dashTicks: 25, dashSpeed: 405, power: 1.7, bodyPower: .78, color: '#65568b' }),
  elastic: ball('elastic', '탄성주먹', 'neutral', '拳', '늘어나는 주먹으로 닿기 어려운 적을 때리고 반동으로 몸을 튕긴다.', '주먹 사거리 안의 적 포착', '늘어난 주먹의 옆과 뒤에는 사각이 있다.', { range: 90, cooldown: 75, power: 1.1, push: 145, bodyPower: .82, color: '#cf6750' }),
  beam: ball('beam', '파동수련자', 'neutral', '気', '기운을 모은 다음 한 줄의 긴 파동포를 방출한다.', '충전 예고 뒤 직선 발사', '발사 전 충전 시간이 길다.', { cooldown: 150, windup: 36, range: 310, power: 1.45, bodyPower: .70, color: '#267fb0' }),
  frost: ball('frost', '서리왕관', 'water', '❄', '차가운 결정 파동이 주변 공에 피해를 주고 잠시 속도를 낮춘다.', '서리 코어 충전', '영구 빙결은 없으며 멀리 있는 적은 닿지 않는다.', { cooldown: 135, range: 80, power: .65, slowTicks: 90, slowFactor: .62, bodyPower: .86, color: '#2689aa' }),
  portal: ball('portal', '공간접기', 'neutral', '◈', '공간 문을 접어 상대 주변으로 이동하고 짧은 공간 타격을 남긴다.', '공간 문 재충전', '문을 연속으로 사용할 수 없고 출구가 표시된다.', { cooldown: 145, power: 1.05, bodyPower: .83, color: '#7c49b7' }),
  summoner: ball('summoner', '그림자계약자', 'neutral', '召', '그림자 사역마처럼 움직이는 짧은 유도 공격으로 협공한다.', '계약 인장 충전', '소환 공격의 수와 수명이 제한된다.', { cooldown: 110, shotSpeed: 245, shotLife: 50, shotR: 6, power: .50, maxTargets: 1, bodyPower: .77, color: '#785085' }),
  chain: ball('chain', '사슬사냥꾼', 'neutral', '⛓', '사슬을 맞힌 상대를 잠깐 당겨 다음 충돌 기회를 만든다.', '사슬 사거리 진입', '당기는 힘은 짧고 벽을 통과하지 못한다.', { cooldown: 110, range: 110, power: .60, pull: 140, bodyPower: .90, color: '#536b81' }),
  idol: ball('idol', '공명아이돌', 'neutral', '♪', '음표가 모이면 동심원 음파로 가까운 적들을 두드린다.', '공명 박자 도달', '음파 사거리 밖의 적은 맞지 않는다.', { cooldown: 105, range: 95, power: .65, maxTargets: 3, bodyPower: .83, color: '#b84885' }),
  star: ball('star', '별먹이', 'neutral', '★', '가까운 탄환의 힘을 받아 별빛 반격으로 되돌린다.', '별 코어 충전', '별빛 반격에는 재사용 시간이 있다.', { cooldown: 115, power: .90, shotSpeed: 260, shotLife: 60, shotR: 6, maxTargets: 2, bodyPower: .87, color: '#a96e17' }),
  berserk: ball('berserk', '한계돌파자', 'neutral', '闘', '주기적으로 힘을 폭발시켜 강한 충돌을 노리는 맨손 격투 공이다.', '투지 폭발', '강한 순간이 끝나면 다시 충전해야 한다.', { cooldown: 120, power: 1.3, bodyPower: 1.02, speed: 182, color: '#b44048' }),
};

for (const profile of NEW_PROFILES) CLASSES[profile.id] = profile;

export const COMBAT = Object.freeze({
  hz: 60, bodyCooldown: 36, radius: 13, speedCap: 425, hpBase: 200, hpPerLevel: 6,
  attackBase: 10, attackPerLevel: .5, projectileLimit: 120, fieldLimit: 30,
  projectilesPerOwner: 6, fieldsPerOwner: 3, eventBuffer: 128, concurrentDuels: 4,
  duelSeconds: 40, finalSeconds: 40, rumbleSeconds: 120, intermissionSeconds: 5,
  duelPressure: 30, finalPressure: 30, duelPressureBase: 10, duelPressureGrowth: 12, rumblePressure: 90, shrinkFrom: 45,
  awakeningThreshold:.35,awakeningTicks:180,awakeningPower:1.12,
});
export const AWAKENING_PROFILES=Object.freeze(['mace','trinity','tide','beam','bolt','frost','summoner','star']);

export function advantage(attacker, defender) {
  const element = ELEMENTS[attacker];
  if (element?.strong === defender) return 1.20;
  if (element?.weak === defender) return .85;
  return 1;
}
