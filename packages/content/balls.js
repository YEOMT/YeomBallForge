import { CLASSES, ELEMENTS } from './classes.js';
import { tierOf, levelOf, HIDDEN_CLASSES } from './economy.js';
export { tierOf, levelOf } from './economy.js';

// A path is a persistent draft direction. Choosing a common ball does not erase it.
export const PATHS = Object.freeze({
  fire: { id: 'fire', name: '화염', icon: '▲', color: ELEMENTS.fire.color, element: 'fire', description: '화상·돌격·화염 검무' },
  water: { id: 'water', name: '물결·빙결', icon: '❄', color: ELEMENTS.water.color, element: 'water', description: '방어·반격·서리 제어' },
  lightning: { id: 'lightning', name: '번개', icon: 'ϟ', color: ELEMENTS.lightning.color, element: 'lightning', description: '고속 돌진·감쇠 연쇄' },
  earth: { id: 'earth', name: '대지', icon: '◆', color: ELEMENTS.earth.color, element: 'earth', description: '철퇴·벽꿍·결정 반사' },
  nature: { id: 'nature', name: '자연', icon: '✳', color: ELEMENTS.nature.color, element: 'nature', description: '가시·독·씨앗 장판' },
  blade: { id: 'blade', name: '검술', icon: '⚔', color: '#6056a7', element: 'neutral', description: '초승달 검기·삼중 검무' },
  space: { id: 'space', name: '공간·별빛', icon: '◈', color: '#7c49b7', element: 'neutral', description: '공간 이동·별빛 흡수' },
  summon: { id: 'summon', name: '소환·잔영', icon: '影', color: '#785085', element: 'neutral', description: '그림자 협공·분신 돌진' },
});

const PATH_ARCHETYPES = Object.freeze({
  fire: ['crimson', 'ring'], water: ['tide', 'frost'], lightning: ['bolt', 'magnet'],
  earth: ['mace', 'crystal'], nature: ['thorn', 'seed'], blade: ['blade', 'trinity'],
  space: ['portal', 'star'], summon: ['summoner', 'ninja'],
});
const COMMON_ARCHETYPES = Object.freeze(['elastic', 'beam', 'chain', 'idol', 'berserk', 'cannon']);
const EVOLUTION_TITLES = ['수련', '숙련', '정예', '비전', '초월', '전설', '천공', '성좌', '불멸', '근원'];
const PATH_NAMES = {
  fire: [
    ['불꽃 선봉', '불꽃 윤무'], ['홍련 돌격', '화염의 쌍륜'], ['불사조 돌격', '붉은 검무'], ['작열 선봉', '용염의 고리'],
    ['화산 돌파자', '삼족오의 날개'], ['태양 돌격대', '홍련 폭풍'], ['적룡의 선봉', '일식 화륜'], ['진홍 유성', '태양의 검무'],
    ['불멸의 화신', '업화의 군무'], ['태양왕의 심장', '종말의 화륜'],
  ],
  water: [
    ['물결 수호자', '서리 견습생'], ['해일 방패', '얼음 왕관'], ['푸른 성벽', '설원의 지배자'], ['심해 기사', '빙정 마법사'],
    ['용궁의 파수꾼', '백야의 서리'], ['대양의 군주', '빙하의 심장'], ['별바다 수호자', '절대빙정'], ['만조의 신전', '겨울 성좌'],
    ['영원의 해일', '영구동토의 왕'], ['창세의 바다', '태초의 겨울'],
  ],
  lightning: [
    ['전격 질주자', '전극 견습생'], ['번개 선봉', '자력 궤도'], ['뇌광 기사', '전자의 춤'], ['폭풍 질주', '자력 지휘자'],
    ['천둥 돌파자', '뇌운의 고리'], ['섬광 영웅', '폭풍의 왕관'], ['천공의 번개', '성운 전극'], ['뇌신의 화살', '성좌의 전류'],
    ['찰나의 제왕', '무한 전류핵'], ['광속의 심장', '태초의 번개'],
  ],
  earth: [
    ['돌망치 기사', '수정 수호자'], ['거암 철퇴', '결정 방벽'], ['암석 파쇄자', '보석 기사'], ['산맥의 망치', '수정의 거울'],
    ['지각 분쇄자', '광물의 성채'], ['산왕의 철퇴', '다이아 방패'], ['천공 파쇄자', '운석의 방벽'], ['별의 대장장이', '성좌의 결정'],
    ['대륙의 군주', '불멸의 성벽'], ['세계의 망치', '태초의 결정'],
  ],
  nature: [
    ['가시 수련자', '씨앗 견습생'], ['덩굴 검사', '발아 사수'], ['장미의 기사', '꽃잎 포격수'], ['맹독 수호자', '숲의 정원사'],
    ['고대의 가시', '포자 마법사'], ['가시 여왕', '세계수 정원사'], ['하늘숲의 가시', '별꽃 포격수'], ['장미 성좌', '행성의 씨앗'],
    ['불멸의 덩굴', '생명의 정원'], ['태초의 가시', '창세의 씨앗'],
  ],
  blade: [
    ['달빛 수련검', '세 자루의 약속'], ['월광 검사', '삼중 검객'], ['초승달 참격', '삼도 수호자'], ['유성의 검기', '회오리 검무'],
    ['흑월 검사', '세 갈래 폭풍'], ['월식의 검', '검무의 달인'], ['천공 참월', '하늘의 세 칼날'], ['은하 검성', '삼중 성좌'],
    ['불멸의 월광', '무한의 검무'], ['하늘을 가르는 검', '삼천세계의 칼날'],
  ],
  space: [
    ['공간 견습생', '작은 별먹이'], ['차원 접기', '별빛 포식자'], ['포털 기사', '유성 사냥꾼'], ['경계의 여행자', '은빛 별핵'],
    ['차원 마법사', '혜성 포식자'], ['공간의 지배자', '행성의 심장'], ['천공의 문', '성운 수집가'], ['은하의 문지기', '성좌 포식자'],
    ['무한의 경계', '불멸의 별'], ['차원의 근원', '우주의 첫 별'],
  ],
  summon: [
    ['그림자 견습생', '잔영 수련자'], ['그림자 계약자', '잔영 닌자'], ['사역마 지휘관', '분신의 그림자'], ['밤의 소환사', '안개의 인술'],
    ['검은 군단장', '달빛 잔영'], ['그림자 군주', '분신의 달인'], ['천공 소환사', '하늘의 잔영'], ['성좌의 계약', '유성 인술'],
    ['불멸의 군단', '무한의 잔영'], ['영혼의 근원', '그림자의 태초'],
  ],
};

function makeBall(id, tier, classId, name, options = {}) {
  const cl = CLASSES[classId];
  if (!cl) throw new Error('Unknown combat archetype: ' + classId);
  const path = options.path ?? null;
  const grade = tier <= 3 ? 'mythic' : tier <= 6 ? 'legendary' : tier <= 10 ? 'awakened' : tier <= 15 ? 'forged' : 'starter';
  return Object.freeze({
    id, name, tier, level: levelOf(tier), classId, path, common: !path && !options.hidden,
    hidden: Boolean(options.hidden), element: path ? PATHS[path].element : 'neutral',
    icon: cl.icon, glyph: cl.icon, color: cl.color, portraitKey: classId,
    portraitVariant: grade, motif: classId, description: cl.description, trigger: cl.trigger,
    weakness: cl.weakness,
    ...options,
    modifiers: Object.freeze({ hp: 1, attack: 1, speed: 1, ...options.modifiers }),
  });
}

const catalog = [
  makeBall('core-20', 20, 'basic', '기본 볼'),
  makeBall('core-19', 19, 'basic', '단단한 코어'),
];
const early = [
  [18, 'blade', '초승달 연습검', 'mace', '작은 철퇴'],
  [17, 'cannon', '물방울 포수', 'ring', '불꽃 고리'],
  [16, 'tide', '물방패 기사', 'thorn', '장미 가시'],
  [15, 'bolt', '번개 발걸음', 'seed', '새싹 투척수'],
  [14, 'trinity', '세 칼날 수련생', 'elastic', '늘어나는 주먹'],
  [13, 'frost', '서리 결정', 'chain', '사슬 견습생'],
  [12, 'ninja', '그림자 달리기', 'beam', '파동 수련생'],
  [11, 'crystal', '결정 기사', 'idol', '리듬 메이커'],
];
for (const [tier, a, nameA, b, nameB] of early) {
  catalog.push(makeBall(`common-${tier}-${a}`, tier, a, nameA, { modifiers: { hp: 1.03, attack: 1, speed: .98 } }));
  catalog.push(makeBall(`common-${tier}-${b}`, tier, b, nameB, { modifiers: { hp: .98, attack: 1.02, speed: 1.02 } }));
}
for (let tier = 10; tier >= 1; tier--) {
  const stage = 10 - tier;
  for (const [path, archetypes] of Object.entries(PATH_ARCHETYPES)) {
    archetypes.forEach((classId, i) => catalog.push(makeBall(`${path}-${tier}-${classId}`, tier, classId, PATH_NAMES[path][stage][i], {
      path, common: false, modifiers: i === 0 ? { hp: 1.03, attack: 1, speed: .98 } : { hp: .98, attack: 1.02, speed: 1.02 },
    })));
  }
  COMMON_ARCHETYPES.forEach((classId, i) => catalog.push(makeBall(`common-${tier}-${classId}`, tier, classId, `${EVOLUTION_TITLES[stage]} ${CLASSES[classId].name}`, {
    modifiers: i % 2 === 0 ? { hp: 1.04, attack: .99, speed: .98 } : { hp: .97, attack: 1.02, speed: 1.03 },
  })));
  for (const classId of HIDDEN_CLASSES) catalog.push(makeBall(`hidden-${tier}-${classId}`, tier, classId, `${EVOLUTION_TITLES[stage]} ${CLASSES[classId].name}`, {
    common: false, hidden: true,
  }));
}
export const BALL_CATALOG = Object.freeze(catalog);
export const BALLS = Object.freeze(Object.fromEntries(catalog.map(b => [b.id, b])));
export const getBall = ballId => BALLS[ballId] ?? null;

export function getBallChoices(build) {
  if (!build?.pendingChoice) return [];
  const tier = tierOf(build.level);
  if (tier > 18 || (tier <= 10 && !PATHS[build.path])) return [];
  const candidates = catalog.filter(b => b.tier === tier && !b.hidden && (b.common || b.path === build.path));
  const hidden = build.hiddenClass && getBall(`hidden-${tier}-${build.hiddenClass}`);
  return hidden ? [hidden, ...candidates] : candidates;
}

export function classPath(classId) {
  return Object.entries(PATH_ARCHETYPES).find(([, ids]) => ids.includes(classId))?.[0]
    ?? ({ cannon: 'water', elastic: 'blade', beam: 'space', chain: 'blade', idol: 'summon', berserk: 'blade' }[classId] ?? null);
}
