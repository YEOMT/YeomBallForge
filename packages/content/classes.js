// World units and fixed 60 Hz ticks. These numbers are shared by the server and codex.
export const ELEMENTS = {
  neutral: { id: 'neutral', name: '무속성', icon: '●', color: '#dce4f2' },
  fire: { id: 'fire', name: '화염', icon: '▲', color: '#ff744d', strong: 'nature', weak: 'water' },
  water: { id: 'water', name: '물결', icon: '≈', color: '#59d5ff', strong: 'fire', weak: 'lightning' },
  lightning: { id: 'lightning', name: '번개', icon: 'ϟ', color: '#f7d857', strong: 'water', weak: 'earth' },
  earth: { id: 'earth', name: '대지', icon: '◆', color: '#d9a06e', strong: 'lightning', weak: 'nature' },
  nature: { id: 'nature', name: '자연', icon: '✳', color: '#89dc71', strong: 'earth', weak: 'fire' },
};

function ball(id, name, element, icon, description, trigger, weakness, stats, hidden = false) {
  return {
    id, name, element, icon, hidden, description, trigger, weakness,
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
};

export const COMBAT = Object.freeze({
  hz: 60, bodyCooldown: 36, radius: 13, speedCap: 425, hpBase: 200, hpPerLevel: 6,
  attackBase: 10, attackPerLevel: .5, projectileLimit: 120, fieldLimit: 30,
  projectilesPerOwner: 6, fieldsPerOwner: 3, eventBuffer: 128, concurrentDuels: 4,
  duelSeconds: 45, finalSeconds: 60, rumbleSeconds: 120, intermissionSeconds: 5,
  duelPressure: 30, finalPressure: 45, rumblePressure: 90, shrinkFrom: 45,
});

export function advantage(attacker, defender) {
  const element = ELEMENTS[attacker];
  if (element?.strong === defender) return 1.20;
  if (element?.weak === defender) return .85;
  return 1;
}
