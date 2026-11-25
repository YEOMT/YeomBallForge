import { CLASSES, ELEMENTS } from "./packages/content/classes.js";
import { BASE_TICKETS, MAX_LEVEL, NORMAL_ELEMENTS, nextChance, SHIELD_COST } from "./packages/content/economy.js";

export const phases = { LOBBY:"대기실", QUIZ:"퀴즈", FORGE:"강화", LOCKED:"출전 소개", BATTLE:"자동 대전", RESULTS:"결과" };
export const modes = { combined:"토너먼트 + 전원 럼블", tournament:"토너먼트", rumble:"전원 럼블" };
export const esc = value => String(value ?? "").replace(/[&<>"']/g, x => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[x]);
const disabled = value => value ? " disabled" : "";
export const button = (action, label, style = "", off = false, value = "") =>
  '<button type="button" class="sf-button ' + style + '" data-action="' + action + '" data-value="' + esc(value) + '"' + disabled(off) + '>' + label + '</button>';
const small = (title, value) => '<div class="sf-stat"><span>' + title + '</span><strong>' + esc(value) + '</strong></div>';
const classOf = p => CLASSES[p?.classId] || CLASSES.basic;
const numbered = n => String(n).padStart(2, "0");
export const who = (room, id) => room.players.find(p => p.id === id)?.name || "참가자";
export const title = (over, heading, description = "") =>
  '<div class="sf-heading"><span class="sf-kicker">' + esc(over) + '</span><h2>' + esc(heading) + '</h2>' +
  (description ? '<p>' + esc(description) + '</p>' : '') + '</div>';

export function roster(s, allowRemove = false) {
  const { room, me } = s;
  const active = room.players.filter(p => !p.waiting);
  return '<section class="sf-panel"><header class="sf-section-heading"><h3>참가자</h3><span>' + active.length + ' / 30명</span></header>' +
    (room.players.length ? '<ul class="sf-roster">' + room.players.map(p => {
      const cl = classOf(p);
      const info = p.waiting ? "다음 판 대기" : !p.connected ? "재접속 대기" : room.phase === "QUIZ" && s.teacher
        ? '응답 ' + (p.answered || 0) + ' · 정답 ' + (p.correct || 0)
        : room.phase === "FORGE" ? (p.locked ? "출전 확정" : "강화 중") + ' · +' + p.level : p.locked ? cl.name + ' +' + p.level : "참가 완료";
      return '<li><span class="sf-avatar" style="--sf-ball:' + cl.color + '">' + esc(cl.icon) + '</span><div><strong>' + esc(p.name) +
        (p.id === me.id ? ' <em>나</em>' : '') + '</strong><small>' + esc(info) + '</small></div>' +
        (allowRemove ? button("remove", "제외", "sf-link", s.busy, p.id) : '') + '</li>';
    }).join('') + '</ul>' : '<div class="sf-empty">첫 번째 학생을 기다리고 있습니다.</div>') + '</section>';
}

function settings(s) {
  const { room } = s;
  const cfg = s.settingsDraft || room.settings;
  const bank = room.bank || {};
  const numeric = (key, label, min, max) => '<label>' + label + '<input type="number" name="' + key + '" value="' + esc(cfg[key]) + '" min="' + min + '" max="' + max + '" required></label>';
  return '<section class="sf-panel"><header class="sf-section-heading"><h3>수업 설정</h3></header><form class="sf-settings" data-form="settings"><label>경기 방식<select name="mode">' +
    Object.entries(modes).map(([id, name]) => '<option value="' + id + '"' + (id === cfg.mode ? ' selected' : '') + '>' + name + '</option>').join('') +
    '</select></label><div class="sf-fields">' + numeric("questionCount","문항 수",1,20) + numeric("quizSeconds","퀴즈 시간 (초)",1,600) + numeric("forgeSeconds","강화 시간 (초)",1,600) +
    '</div><button class="sf-button" type="submit"' + disabled(s.busy) + '>설정 저장</button></form>' +
    '<div class="sf-rule"></div><h4>문제은행</h4><p class="sf-note">' + esc(bank.filename || "기본 문제은행") + ' · 정상 ' + Number(bank.count || 0) + '문항 · 오류 ' + (bank.errors?.length || 0) + '건</p>' +
    '<div class="sf-actions"><label class="sf-button sf-upload">TXT 업로드<input type="file" data-file="bank" accept=".txt,text/plain"' + disabled(s.busy) + '></label>' +
    button("bankPreview","문제 미리보기","",!bank.preview?.length) + '<a class="sf-button" href="./sample-quiz.txt" download>예시 TXT 받기</a></div><p class="sf-note">UTF-8 · 한 줄에 문제|정답|오답1|오답2|오답3</p>' +
    (bank.errors?.length ? '<ul class="sf-errors">' + bank.errors.map(e => '<li>' + e.line + '행 · ' + esc(e.message) + '</li>').join('') + '</ul>' : '') + '</section>';
}

export function lobby(s) {
  const { room, me } = s;
  const url = new URL(location.href);
  if (s.identity?.joinOrigin && ["localhost","127.0.0.1","[::1]"].includes(url.hostname)) {
    const origin = new URL(s.identity.joinOrigin);
    url.protocol = origin.protocol;
    url.host = origin.host;
  }
  url.search = '';
  url.hash = '';
  url.searchParams.set("code", room.code);
  const qr = new URL("/api/qr", s.connection.url.origin.replace(/^ws/, "http"));
  qr.searchParams.set("url", url.toString());
  if (!s.teacher) return title("LOBBY", me.waiting ? "다음 판을 기다리고 있어요" : escPlainName(s) + "님, 입장했습니다", modes[room.settings.mode]) +
    '<div class="sf-grid"><section class="sf-panel sf-wait"><canvas data-emblem width="240" height="220" aria-label="내 기본 공"></canvas><h3>출발선에서 준비 중</h3><p>교사가 시작하면 ' + room.settings.questionCount + '문항 퀴즈가 열립니다.</p></section>' + roster(s) + '</div>';
  return title("LOBBY", "수업 대기실", "학생들이 입장하면 퀴즈를 시작하세요.") +
    '<div class="sf-grid"><div class="sf-stack"><section class="sf-panel sf-invite"><div><span class="sf-kicker">STUDENT ACCESS</span><h3>참가 코드</h3><strong class="sf-code">' +
    esc(String(room.code).slice(0,3)) + ' ' + esc(String(room.code).slice(3)) + '</strong><p>학생 기기에서 QR을 스캔하거나 참가 코드를 입력하세요.</p>' +
    button("copy","참가 링크 복사","","", url.toString()) + '</div><img alt="학생 참가용 QR 코드" src="' + esc(qr.href) + '" width="132" height="132"></section>' +
    roster(s,true) + '</div>' + settings(s) + '</div>';
}

function escPlainName(s) { return s.room.players.find(p => p.id === s.me.id)?.name || s.identity?.name || "학생"; }

function teacherProgress(s) {
  const active = s.room.players.filter(p => !p.waiting);
  const quiz = s.room.phase === "QUIZ";
  const done = active.filter(p => quiz ? p.answered >= s.room.settings.questionCount : p.locked).length;
  return title(quiz ? "QUIZ" : "FORGE", quiz ? "학급 퀴즈 진행" : "학급 강화 현황") +
    '<div class="sf-metrics">' + small(quiz ? "모든 문항 제출" : "출전 확정", done + ' / ' + active.length) +
    small(quiz ? "미응답" : "강화 중", active.filter(p => quiz ? !p.answered : !p.locked).length + '명') +
    small("재접속 대기", active.filter(p => !p.connected).length + '명') + '</div>' + roster(s);
}

export function quiz(s) {
  if (s.teacher) return teacherProgress(s);
  const { room, me } = s;
  const feed = s.answerFeedback;
  const q = feed?.question || me.question;
  const count = room.settings.questionCount;
  const answered = me.answered || 0;
  if (!q) return title("QUIZ", "퀴즈를 모두 풀었습니다") + '<div class="sf-panel sf-wait"><div class="sf-large-symbol">✓</div><h3>정답 ' +
    me.correct + '개</h3><p>강화 시간에 기본 ' + BASE_TICKETS + '장과 정답 보상 ' + me.correct + '장을 받습니다.</p></div>';
  const ix = Math.min(count, feed?.index || answered + 1);
  return title("QUIZ", "강화권 획득 퀴즈") + '<section class="sf-panel sf-quiz"><div class="sf-quiz-meta"><b>문항 ' + numbered(ix) +
    ' <span>/ ' + numbered(count) + '</span></b><span>정답 ' + me.correct + '개</span></div><progress aria-label="제출한 문항" value="' + answered + '" max="' + count + '"></progress>' +
    '<h3>' + esc(q.text) + '</h3><div class="sf-answers">' + q.answers.map((a,i) =>
      button("answer", '<span>' + 'ABCD'[i] + '</span>' + esc(a.text), 'sf-answer' + (feed?.correctText === a.text ? ' sf-correct' : feed?.choice === a.id ? ' sf-wrong' : ''),
        s.busy || room.paused || !!feed, a.id)).join('') + '</div>' + (feed ? '<p class="sf-feedback" role="status"><b>' +
    (feed.correct ? '정답! 강화권 1장을 획득했습니다.' : '오답 · 정답은 ' + esc(feed.correctText) + '입니다.') + '</b> ' + esc(feed.explanation === '정답은 ‘' + feed.correctText + '’입니다.' ? '' : feed.explanation || "") + '</p>' :
    '<p class="sf-note">문항별로 한 번만 답을 제출할 수 있습니다.</p>') + '</section>';
}

function classChoice(s) {
  const m = s.me;
  const off = s.busy || s.room.paused;
  if (m.classChosen && m.hiddenOffer && m.hiddenDecision == null) {
    const h = CLASSES[m.hiddenOffer];
    if (!h) return '';
    return '<section class="sf-panel sf-hidden"><span class="sf-kicker">HIDDEN CLASS</span><h3>히든 코어 발견 · ' + h.name + '</h3><p>' + esc(h.description) +
      ' 수락하면 선택한 속성을 유지하고 공격 기믹이 교체됩니다.</p><div class="sf-actions">' +
      button("hidden","히든 클래스 수락","sf-primary",off,"yes") + button("hidden","일반 클래스 유지","",off,"no") + '</div></section>';
  }
  if (m.level < 10 || m.classChosen || m.locked) return '';
  const el = ELEMENTS[s.chosenElement] || ELEMENTS.fire;
  return '<section class="sf-panel sf-ajob"><span class="sf-kicker">CLASS AWAKENING</span><h3>공의 전직을 선택하세요</h3><p>선택은 이번 판 동안 유지됩니다. 미선택 시 출전 확정과 함께 홍련돌격구가 됩니다.</p>' +
    '<div class="sf-tabs">' + Object.values(ELEMENTS).filter(e => e.id !== "neutral").map(e =>
      button("element", e.icon + ' ' + e.name, e.id === el.id ? "sf-selected" : "", off, e.id)).join('') + '</div><p>' + el.name +
    ' · 강점 ' + ELEMENTS[el.strong].name + ' ×1.20 · 약점 ' + ELEMENTS[el.weak].name + ' ×0.85</p><div class="sf-choices">' +
    Object.keys(NORMAL_ELEMENTS).map(id => CLASSES[id]).filter(c => c.element === el.id).map(c =>
      button("chooseClass", '<b>' + esc(c.name) + '</b><span>' + esc(c.description) + '</span>', "sf-choice", off, c.id)).join('') + '</div></section>';
}

export function forge(s) {
  if (s.teacher) return teacherProgress(s);
  const { me:m, room } = s;
  const cl = classOf(m);
  const element = ELEMENTS[m.element] || ELEMENTS.neutral;
  const off = s.busy || room.paused || m.locked;
  const fx = s.forgeFx;
  const failure = m.level <= 10 ? '현재 단계 유지' : m.useShield && m.shields > 0 ? '유지권 1개 소모 · 단계 유지' : '+' + (m.level - 1) + '로 하락';
  const next = m.level < MAX_LEVEL ? '<div class="sf-target"><span>다음 목표 <b>+' + (m.level + 1) + '</b></span><span>성공률 <b>' + nextChance(m.level) + '%</b></span></div><p class="sf-note">실패 시 ' + failure + ' · 시도당 강화권 1장</p>' : '<p>최종 강화 단계에 도달했습니다.</p>';
  return title("FORGE", m.locked ? "출전 준비 완료" : "나의 공 강화") + '<div class="sf-stack">' + (m.locked ? '' : classChoice(s)) +
    '<div class="sf-grid"><section class="sf-panel sf-forge-core ' + (fx?.style || '') + '" style="--sf-ball:' + esc(cl.color) + '"><span class="sf-kicker">' +
    (m.level >= 20 ? 'MASTER CORE' : m.level >= 15 ? 'AWAKENED CORE' : m.level >= 10 ? 'CLASS CORE' : 'FORGE CORE') +
    '</span><canvas data-emblem width="360" height="270" aria-label="내 공의 강화 외형"></canvas><h3>+' + m.level + ' ' + esc(cl.name) + '</h3><p>' + element.icon + ' ' + element.name +
    ' · 최고 +' + m.best + '</p><strong class="sf-fx-label" aria-live="polite">' + esc(fx?.label || (m.locked ? "출전 확정" : "")) + '</strong></section><section class="sf-panel sf-workbench">' +
    '<header class="sf-section-heading"><h3>강화 작업대</h3></header><div class="sf-metrics">' + small("강화권",m.tickets + "장") + small("유지권",m.shields + "개") + '</div>' +
    '<p class="sf-note">최초 지급 · 기본 ' + BASE_TICKETS + '장 + 정답 보상 ' + m.correct + '장</p>' + (m.locked ? '<p>확정한 공으로 자동 대전에 출전합니다.</p>' :
    next + '<div class="sf-column-actions">' + button("enhance", m.level === MAX_LEVEL ? "최종 강화 완료" : '+' + (m.level + 1) + ' 강화 시도', "sf-primary", off || m.tickets < 1 || m.level >= MAX_LEVEL || !!fx) +
    button("buyShield","유지권 구매 · 강화권 " + SHIELD_COST + "장","",off || m.tickets < SHIELD_COST || m.level >= MAX_LEVEL) +
    button("shield","유지권 적용 " + (m.useShield ? "켜짐" : "꺼짐"), m.useShield ? "sf-selected" : "", off || m.level <= 10 || !m.shields || m.level >= MAX_LEVEL) +
    button("lock","현재 +" + m.level + " 공으로 출전 확정","sf-lock",off) + '</div>') + '</section></div></div>';
}

export function locked(s) {
  const active = s.room.players.filter(p => !p.waiting);
  const bracket = (s.room.battle?.bracket || []).filter(m => m.round === 1);
  const own = bracket.find(m => m.ids.includes(s.me.id));
  const opponent = own?.ids.find(id => id !== s.me.id);
  const pairing = own ? own.bye ? "1라운드 부전승" : who(s.room,opponent) + "님과 1라운드 대결"
    : active.length === 1 ? "단독 출전" : "전원 럼블 · " + active.length + "명 동시 출전";
  const draw = !s.teacher ? '<section class="sf-panel sf-opponent"><span class="sf-kicker">MY MATCH</span><h3>' + esc(pairing) + '</h3></section>'
    : bracket.length ? '<section class="sf-panel sf-draw"><h3>첫 라운드 대진</h3><ul>' +
      bracket.map(m => '<li><b>' + esc(m.ids.map(id => who(s.room,id)).join(" vs ")) + '</b>' + (m.bye ? ' · 부전승' : '') + '</li>').join('') +
      '</ul></section>' : '';
  return title("LINEUP", "출전할 공이 확정됐습니다", modes[s.room.settings.mode]) +
    draw + '<div class="sf-lineup">' + active.map(p => '<article class="sf-panel"><span class="sf-avatar" style="--sf-ball:' +
    classOf(p).color + '">' + classOf(p).icon + '</span><h3>' + esc(p.name) + '</h3><p>+' + p.level + ' ' + classOf(p).name + '</p></article>').join('') + '</div>';
}

export function waiting(s) {
  return title("SPECTATOR", "다음 판 참가 대기", "현재 경기가 시작되어 관전자로 입장했습니다. 같은 방에서 새 판이 열리면 참가합니다.") + roster(s);
}

export function results(s) {
  const { room, me } = s;
  const scores = room.results || room.battle?.results || {};
  const table = (kind,label) => {
    const list = scores[kind];
    if (!Array.isArray(list) || !list.length) return "";
    const leaders = list.filter(p => p.rank === 1);
    const winners = leaders.map(p => p.name || who(room,p.id)).join(", ");
    const reason = leaders[0]?.reason;
    return '<section class="sf-panel sf-results"><span class="sf-kicker">' + (kind === "rumble" ? 'RUMBLE' : 'TOURNAMENT') +
      '</span><h3>' + label + '</h3><p class="sf-champion">✦ ' + esc(winners) + '</p>' + (reason ? '<p class="sf-verdict">' + esc(reason) + '</p>' : '') + '<div class="sf-table-wrap"><table><caption class="sf-sr">' + label +
      ' 순위표</caption><thead><tr><th>순위</th><th>참가자</th><th>유효 피해</th><th>처치</th></tr></thead><tbody>' +
      list.map(p => '<tr' + (p.id === me.id ? ' class="sf-own"' : '') + '><td>' + p.rank + '위</td><td>' + esc(p.name || who(room,p.id)) +
        (p.id === me.id ? ' · 나' : '') + '</td><td>' + Math.round(p.damage || 0) + '</td><td>' + (p.kills || 0) + '</td></tr>').join('') + '</tbody></table></div></section>';
  };
  return title("RESULTS", "경기 결과") + (!s.teacher && !me.waiting ? '<section class="sf-panel sf-personal"><h3>' + esc(escPlainName(s)) + '님의 기록</h3><div class="sf-metrics">' +
    small("출전 공", '+' + me.level + ' ' + classOf(me).name) + small("최고 강화",'+' + me.best) + small("퀴즈 정답",me.correct + ' / ' + room.settings.questionCount) + '</div></section>' : '') +
    '<div class="sf-result-grid">' + table("tournament","토너먼트") + table("rumble","전원 럼블") + '</div>' +
    (s.teacher ? '<details class="sf-panel sf-learning"><summary>학습·강화 기록</summary><div class="sf-table-wrap"><table><thead><tr><th>참가자</th><th>응답</th><th>정답</th><th>출전 공</th></tr></thead><tbody>' +
    room.players.filter(p=>!p.waiting).map(p=>'<tr><td>' + esc(p.name) + '</td><td>' + (p.answered || 0) + '</td><td>' + (p.correct || 0) + '</td><td>+' + p.level + ' ' + classOf(p).name + '</td></tr>').join('') + '</tbody></table></div></details>' : '');
}
