import { CLASSES, ELEMENTS, COMBAT } from './packages/content/classes.js';
import { getBall, PATHS, tierOf } from './packages/content/balls.js';
import {evolutionDescription} from './packages/content/evolution.js';
import {AWAKENINGS} from './packages/content/awakening.js';

export const htmlEsc = value => String(value ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
export const tierLabel = build => 'T' + tierOf(Number(build?.level) || 0);
export const ballOf = build => getBall(build?.ballId) || { ...(CLASSES[build?.classId] || CLASSES.basic), classId:build?.classId || 'basic', tier:tierOf(build?.level || 0) };
export const pathLabel = path => PATHS[path]?.name || '공용';
export const portraitUrl = ball => new URL('./assets/balls/' + (ball?.portraitKey || ball?.classId || 'basic') + '.svg', import.meta.url).href;

export function portrait(ball, className = '') {
  return '<span class="ball-portrait ' + className + '" style="--ball-color:' + htmlEsc(ball?.color || '#a3b7ce') + '"><img src="' + htmlEsc(portraitUrl(ball)) + '" alt="" loading="lazy"></span>';
}

export function ballStats(ball, level = 20 - (ball?.tier || 20)) {
  const cl = CLASSES[ball?.classId] || CLASSES.basic;
  return {
    hp:Math.ceil((COMBAT.hpBase + level * COMBAT.hpPerLevel) * (cl.hpScale || 1) * (ball?.modifiers?.hp || 1)),
    attack:Math.round((COMBAT.attackBase + level * COMBAT.attackPerLevel) * (ball?.modifiers?.attack || 1) * 10) / 10,
    speed:Math.round((cl.speed || 1) * (ball?.modifiers?.speed || 1) * 100) / 100,
  };
}

export function statLine(ball, level) {
  const stats = ballStats(ball, level);
  return '<span class="ball-stats"><span>♥ HP <b>' + stats.hp + '</b></span><span>✦ 기본 공격 <b>' + stats.attack + '</b></span><span>➜ 속도 <b>' + stats.speed + '</b></span></span>';
}
export function combatIdentity(ball){
  const evolution=evolutionDescription(ball.classId),awakening=ball.tier===1?AWAKENINGS[ball.classId]:null;
  return `<span class="ball-evolution"><b>전투 진화</b> ${htmlEsc(evolution)}</span>${awakening?`<span class="ball-awakening"><b>T1 · ${htmlEsc(awakening.name)}</b> ${htmlEsc(awakening.description||awakening.trigger)}<br>조건 · ${htmlEsc(awakening.trigger)}<br>빈틈 · ${htmlEsc(awakening.weakness)}</span>`:''}`;
}

export function ballCard(ball, {action, disabled = false, selected = false, compact = false, level} = {}) {
  const cl = CLASSES[ball.classId] || CLASSES.basic;
  const tag = ball.hidden ? '히든' : ball.common ? '공용' : pathLabel(ball.path);
  const heading = '<span class="ball-card-top">' + portrait(ball) + '<span><span class="ball-tag">T' + ball.tier + ' · ' + htmlEsc(tag) + '</span><strong>' + htmlEsc(ball.name) + '</strong></span></span>';
  const detail = statLine(ball, level) + '<span class="ball-trigger">출전 속성 · '+htmlEsc(ball.hidden?'선택한 경로의 속성':ELEMENTS[ball.element]?.name||'무속성')+'</span><span class="ball-description">' + htmlEsc(ball.description || cl.description) + '</span>' +
    (!compact ? '<span class="ball-trigger"><b>전투 스킬</b> ' + htmlEsc(ball.trigger || cl.trigger) + '</span><span class="ball-weakness"><b>약점</b> ' + htmlEsc(ball.weakness || cl.weakness) + '</span>' : '');
  const contents = heading + detail + (!compact?combatIdentity(ball):'') + (action ? '<span class="ball-pick">' + (selected ? '선택한 공' : '이 공 선택 →') + '</span>' : '');
  return action ? '<button type="button" class="ball-card' + (selected ? ' is-selected' : '') + '" data-action="' + action + '" data-value="' + htmlEsc(ball.id) + '"' + (disabled ? ' disabled' : '') + '>' + contents + '</button>' : '<article class="ball-card">' + contents + '</article>';
}

export function pathCards({action = 'choosePath', disabled = false,paths} = {}) {
  return '<div class="ball-path-grid">' + Object.values(PATHS).filter(p=>!paths||paths.includes(p.id)).map(path => '<button type="button" class="ball-path-card" data-action="' + action + '" data-value="' + htmlEsc(path.id) + '"' + (disabled ? ' disabled' : '') + '><span style="color:' + htmlEsc(path.color) + '">' + htmlEsc(path.icon) + '</span><strong>' + htmlEsc(path.name) + '</strong><small>' + htmlEsc(path.description) + '</small></button>').join('') + '</div>';
}

export function elementMatchup(elementId) {
  const element = ELEMENTS[elementId];
  return element?.strong ? element.name + ' · ' + ELEMENTS[element.strong].name + '에게 ×1.20 · ' + ELEMENTS[element.weak].name + '에게 ×0.85' : '공용 속성 · 상성 보정 없음';
}

export function eliminationText(row, room) {
  if (!row) return '';
  const killer = row.killedByName || room?.players?.find(p => p.id === (row.killedById || row.eliminatedBy))?.name;
  if (killer) return killer + '에게 탈락';
  if (row.rank === 1) return '최후의 승자';
  if (row.cause === 'timeout' || row.reason === 'timeout') return '제한시간 판정';
  if (row.cause === 'pressure') return '전장 압박으로 탈락';
  if (row.cause === 'storm' || row.cause === 'arena') return '전장 피해로 탈락';
  return row.alive === false ? '탈락' : row.rank ? '경기 종료' : '생존 중';
}
