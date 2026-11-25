import {CLASSES} from './classes.js';
import {BALL_CATALOG} from './balls.js';
export const VAMPIRE_MATCH_HEAL_CAP=.35;
export const CURRENT_MIN_TURN_RADIANS=.0035;
// Fixed ticks/world units. Every profile owns an explicit, bounded behavior.
// Counts refer to effective authoritative events, never to animation callbacks.
const row=(id,name,trigger,count,actions,effects,weakness,extra={})=>({profileId:id,id:'evo-'+id,name,trigger,count,cap:1,window:360,duration:120,recovery:90,readyTtl:480,actions,effects,weakness,vfxId:'evolution/'+id,sfxId:'evolution/'+id,...extra});
const definitions=[
  row('basic','관성 코어','body',2,['body'],{push:1.2,bodyImpulse:38},'몸체가 닿아야 하며 사거리는 늘지 않습니다.',{duration:1,recovery:75}),
  row('crimson','응축 화염','wall',1,['blaze'],{push:1.25,burnTicks:1.15},'충전 후 실제 몸체 접촉이 필요합니다.',{duration:1}),
  row('ring','확장 화염륜','blade',3,['orbit'],{orbit:1.15,spin:1.12},'회전 궤도 밖의 적에게 닿지 않습니다.'),
  row('tide','압축 해일','block',2,['surge'],{range:1.2,push:1.25},'후방과 방어 재충전 중에는 취약합니다.',{duration:1}),
  row('cannon','심해 압력','wall',2,['wave'],{shotR:1.2,recoil:55},'탄의 방향이 고정되고 발사 후 회복합니다.',{duration:1,recovery:120}),
  row('bolt','뇌광 가속','dash',2,['dash'],{dashTicks:1.2,dashSpeed:1.05,push:1.15},'빗나가도 충전은 소모되고 방향을 바꾸지 않습니다.',{duration:40}),
  row('magnet','극성 수렴','arc',2,['arc'],{range:1.2,chainRange:1.1},'한 대상에게 같은 사슬을 반복하지 않습니다.',{duration:1}),
  row('mace','성장 철퇴','mace-wall',2,['orbit'],{weaponR:1.2,push:1.22},'철퇴 안쪽의 사각과 느린 회수가 남습니다.',{duration:150,stages:2,recovery:100}),
  row('crystal','결정 압축','block',2,['shard'],{shotR:1.2,shotSpeed:1.1},'결정 뒤와 재충전 중에는 방어하지 못합니다.',{duration:1}),
  row('thorn','독화 파열','thorn-poison',2,['thorn'],{poisonBurst:.42},'이미 쌓인 독을 소모하며 지속 피해로 재충전되지 않습니다.',{duration:1}),
  row('seed','발아 고리','bloom',2,['seed'],{fieldRadius:1.2},'발아 예고와 필드 수명은 유지됩니다.',{duration:1}),
  row('prism','굴절 분광','prism',2,['prism'],{spread:1.45,shotSpeed:1.12},'최대 세 탄이며 먼 적에게 모두 맞지 않습니다.',{duration:1}),
  row('gravity','성단 수렴','collapse',1,['gravity'],{pull:1.2,coreRange:1.12},'중심 밖으로 벗어나면 마지막 폭발을 피할 수 있습니다.',{duration:1}),
  row('hourglass','저장 잔상','block',2,['echo'],{echoPush:62},'기록된 공격자가 사라지면 반향은 불발입니다.',{duration:1}),
  row('blade','월광 장검','crescent',2,['crescent'],{shotR:1.2},'검기는 고정된 직선입니다.',{duration:1}),
  row('trinity','삼격 연무','trinity',3,['orbit'],{spin:1.18,triadShots:3},'세 방향 검기는 한 적에게 한 번만 연계 피해를 줍니다.',{duration:90,recovery:120}),
  row('ninja','선명한 잔영','shadowdash',2,['shadowdash'],{afterimageRange:1.2,dashTicks:1.12},'잔영은 생존자가 아니며 고정 궤도만 공격합니다.',{duration:35}),
  row('elastic','탄성 축적','punch',2,['punch'],{range:1.2,push:1.25,recoil:45},'측면과 후방에는 맞지 않습니다.',{duration:1,recovery:100}),
  row('beam','응축 파동','beam',2,['beam'],{beamR:1.2,recoil:80},'차지 후 조준이 고정됩니다.',{duration:1,recovery:120}),
  row('frost','결정 파쇄','icewave',2,['icewave'],{fracture:.35,range:1.08},'감속이 남은 대상만 한 번 파쇄하며 영구 빙결이 없습니다.',{duration:1}),
  row('portal','출구 절단','portalstrike',2,['portalstrike'],{portalCut:34},'이동 경로 전체를 공격하지 않습니다.',{duration:1}),
  row('summoner','상위 계약','summon-hit',3,['familiar'],{familiarRadius:1.2,familiarInterval:.9},'기존 사역마 하나만 교체하며 추가 개체는 만들지 않습니다.',{duration:150,recovery:150}),
  row('chain','팽팽한 결속','chain-pull',2,['chain'],{pull:1.2,tetherTicks:1.12},'짧은 당김 뒤에는 회복 공백이 생깁니다.',{duration:1}),
  row('idol','세 박자 공명','sonic',3,['sonic'],{range:1.15},'적중하지 않은 박자는 충전하지 않습니다.',{duration:1}),
  row('star','별빛 저장','absorb',2,['starcounter'],{shotR:1.2,shotSpeed:1.15},'실제 흡수 없이는 충전되지 않습니다.',{duration:1}),
  row('berserk','투지 발사','taken',.18,['ragebody'],{bodyImpulse:100},'비환경 피해로만 준비하며 다음 분노 충돌 한 번 뒤 2.5초 탈진합니다.',{duration:1,recovery:150}),
  row('returner','회귀 숙련','return',2,['returnshield'],{returnSpeed:1.18,shotR:1.1},'방패가 손에 없는 동안 방어하지 못합니다.',{duration:1}),
  row('pendulum','원호 관성','swing',2,['swing-release'],{releaseSpeed:1.15,push:1.2},'줄을 실제 완주해야 하며 빗나가면 회복합니다.',{duration:30}),
  row('reactor','압축 살보','salvo',2,['salvo'],{shotR:1.15,spread:.55,recoil:105},'세 번째 살보 뒤 강제 냉각합니다.',{duration:1,recovery:180}),
  row('captor','포획 반환','capture',2,['captured'],{shotSpeed:1.2,shotR:1.15},'두 저장탄만 반환하며 반사탄을 재포획하지 않습니다.',{duration:1}),
  row('rewind','시간 잔상','taken',.18,['rewind'],{rewindRestore:1.15},'경기당 유일한 되감기를 강화하며 추가 생명을 주지 않습니다.',{duration:1,recovery:7200}),
  row('mason','연성 확장','wall-deflect',2,['wallsegment'],{wallLength:1.2,fieldLife:1.1},'벽 끝을 우회할 수 있고 공을 가두지 않습니다.',{duration:1}),
  row('morph','예정된 변신','morph-success',3,['morph'],{formSpeed:1.12,formShotR:1.2,formGuard:1.2},'질주 적중·사격 명중·실제 방어를 모두 해내야 다음 예정 형태 하나만 강화합니다. 전환 공백은 유지합니다.',{duration:90}),
  row('titan','거신 관성','small-travel',120,['resize'],{titanImpulse:145,bodyMass:1.15},'커진 피격 범위와 낮은 속도를 유지합니다.',{duration:100}),
  row('phoenix','잿불 재형성','fire-hit',2,['reform'],{phoenixRadius:1.2},'유일한 재형성만 강화하며 압박은 충전하지 않습니다.',{duration:1,recovery:7200}),
  row('thermal','응축 열선','thermal',2,['thermal'],{beamR:1.18},'긴 예고와 후방 안전지대가 남습니다.',{duration:60}),
  row('curse','매듭 파열','curse-touch',3,['curse-release'],{cursePush:65},'한 대상의 표식을 소모하며 파열은 재충전하지 않습니다.',{duration:1}),
  row('cards','완성 카드','card-cycle',3,['card'],{cardDuration:1.2,cardShotR:1.2},'다음 공개된 카드 한 장만 바뀝니다.',{duration:1}),
  row('saw','톱니 열','saw',3,['orbit'],{spin:1.18,weaponR:1.1},'기존 과열과 통합하며 과열 뒤 정지합니다.',{duration:90,recovery:130,window:90,stages:2}),
  row('sniper','응축 조준','snipe',2,['snipe'],{shotSpeed:1.12,shotR:1.1,recoil:95},'조준을 고정하며 빗나가도 소모합니다.',{duration:1,recovery:120}),
  row('trail','긴 광로','trail-cross',2,['lighttrail'],{fieldLife:1.2,trailLength:1.12},'한 선분이 한 대상에게 한 번만 작동합니다.',{duration:1}),
  row('mimic','모사 숙련','copy-hit',2,['copy'],{copyRange:1.15,shotR:1.15},'허용된 공격만 복사하고 불가 유형에는 충전되지 않습니다.',{duration:1}),
  row('greatsword','이동 축력','travel',100,['greatslash'],{range:1.15,push:1.22},'예고 뒤 후방 사각과 긴 회수가 있습니다.',{duration:1,recovery:120}),
  row('storm','종결 낙뢰','lightningstrike',2,['cloudmark'],{stormLastRadius:1.2},'마지막 낙뢰 위치도 미리 고정되어 이동해 피할 수 있습니다.',{duration:1}),
  row('current','대조류 준비','current-bend',2,['watercurrent'],{currentForce:1.2},'실제 방향이 변한 적만 집계하며 체류·수명을 늘리지 않습니다.',{duration:1}),
  row('decoy','거울 내구','decoy-block',24,['decoy'],{decoyHp:1.2},'기존 분신 하나만 강화하고 파괴되면 사라집니다.',{duration:1}),
  row('mycelium','균사 만개','web-cross',2,['mycelium'],{webPulse:.25,webSlowTicks:1.12},'세 노드 한도와 대상별 간격을 유지합니다.',{duration:1}),
  row('vampire','흡혈 공명','lifesteal',2,['lifesteal'],{heal:1.2,healCap:.04},'실제 근접 피해로만 회복하며 경기 전체 회복은 최대 HP 35%까지입니다. 죽은 뒤 소생하지 않습니다.',{duration:1}),
  row('fracture','준비된 균열','frost-touch',2,['ice-shatter'],{shatterPush:85},'감속과 표식이 유효할 때 한 번만 소모됩니다.',{duration:1}),
  row('combo','발사 연계','jab',3,['combo-finish'],{finisherPush:175},'연계 시간이 끊기면 준비도 만료됩니다.',{duration:1,window:180,readyTtl:180,recovery:100}),
];
export const EVOLUTIONS=Object.freeze(Object.fromEntries(definitions.map(d=>[d.profileId,Object.freeze({...d,actions:Object.freeze(d.actions),effects:Object.freeze(d.effects),supportedTiers:Object.freeze([...new Set(BALL_CATALOG.filter(f=>f.classId===d.profileId).map(f=>f.tier))].sort((a,b)=>b-a))})])));
if(Object.keys(CLASSES).length!==definitions.length||Object.keys(CLASSES).some(id=>!EVOLUTIONS[id]))throw new Error('Every combat profile requires exactly one evolution.');
export function evolutionFor(build){return EVOLUTIONS[typeof build==='string'?build:build?.classId]??null;}
export const EVOLUTION_TRIGGER_LABELS=Object.freeze({body:'몸체 유효타',wall:'벽 반사',blade:'회전 날 유효타',block:'실제 방어',dash:'돌진 유효타',arc:'방전 유효타','mace-wall':'벽 충전 철퇴 유효타','thorn-poison':'독 2중첩 대상의 가시 유효타',bloom:'씨앗 발아 유효타',prism:'분광탄 묶음 유효타',collapse:'중심 붕괴 유효타',crescent:'검기 유효타',trinity:'독립 검격',shadowdash:'잔영 돌진 유효타',punch:'주먹 유효타',beam:'차지포 유효타',icewave:'냉기 파동 유효타',portalstrike:'이동 후 공간 유효타','summon-hit':'사역마 유효타','chain-pull':'유효 사슬 당김',sonic:'음파 유효타',absorb:'일반 탄환 흡수',taken:'비환경 피해 손실',return:'벽 반사 후 방패 회수',swing:'스윙 완주',salvo:'살보 발사',capture:'일반 탄환 포획','wall-deflect':'벽의 적·탄환 반사','morph-success':'형태 유효 행동','small-travel':'작은 형태 이동 거리','fire-hit':'화염 계열 유효타',thermal:'차지 열선 묶음 유효타','curse-touch':'저주 직접타','card-cycle':'카드 순환 행동',saw:'연속 톱 접촉',snipe:'고정 조준 명중','trail-cross':'빛 선분 유효 횡단','copy-hit':'허용 복사 유효타',travel:'실제 이동 거리',lightningstrike:'고정 낙뢰 유효타','current-bend':'적·탄환 방향 변경','decoy-block':'분신의 실제 차단 피해','web-cross':'균사 연결선 유효 횡단',lifesteal:'간격을 지킨 실제 흡혈','frost-touch':'냉기 직접 표식',jab:'연계 직접타'});
export function evolutionDescription(build){const d=evolutionFor(build);if(!d)return '';const count=d.trigger==='taken'?Math.round(d.count*100)+'% HP':d.count;return `${d.name} · ${EVOLUTION_TRIGGER_LABELS[d.trigger]} ${count} 누적 → ${d.duration>1?(d.duration/60).toFixed(1)+'초 변화':'다음 고유 행동 1회'} · 회복 ${(d.recovery/60).toFixed(1)}초. ${d.weakness}`;}
