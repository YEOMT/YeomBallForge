import { ArenaView } from "./arena.js";
import { button, esc, who } from "./session-screens.js";

const roundName = n => n > 2 ? n + '강' : '결승';
const reasonName = {
  ko:"KO", health:"잔여 체력 비율", hp:"잔여 체력 비율", damage:"유효 피해 비율",
  seed:"시드 추첨", bye:"부전승", timeout:"제한시간 판정", survivor:"최후 생존",
  hpRatio:"잔여 체력 비율", damageRatio:"유효 피해 비율", byes:"부전승",
};
const timeLeft = arena => Math.max(0,Math.ceil((arena.limitTicks - arena.tick) / 60));

function insertIfChanged(node, html) {
  if (node._html === html) return;
  node.innerHTML = html;
  node._html = html;
}

export class Broadcast {
  constructor(root, session) {
    this.root = root;
    this.s = session;
    this.views = new Map();
    root.innerHTML =
      '<div class="sf-broadcast"><div class="sf-broad-title"><div><span class="sf-kicker">ARENA LIVE</span><h2 data-round>자동 대전</h2><p data-upnext></p></div><div class="sf-actions" data-options></div></div>' +
      '<div class="sf-match-tabs" data-switch></div><div class="sf-stages" data-stages><button type="button" class="sf-button sf-exit-full" data-action="fullscreenExit">전체 화면 닫기</button></div><div class="sf-panel sf-cheer"><div><h3>경기 응원</h3><span data-cheers aria-live="polite"></span></div><div class="sf-actions" data-react></div></div>' +
      '<details class="sf-panel sf-bracket"><summary>대진표와 경기 결과</summary><div data-bracket></div></details></div>';
    for (const name of ["round","upnext","options","switch","stages","cheers","react","bracket"]) {
      this[name] = root.querySelector('[data-' + name + ']');
    }
  }

  update(b) {
    if (!b) return;
    this.latest = b;
    const s = this.s;
    const arenaList = b.arenas || [];
    const matches = b.matches || [];
    const rumble = b.stage === "rumble" || b.mode === "rumble" || arenaList.some(a => a.mode === "rumble");
    const names = ids => (ids || []).map(id => who(s.room,id)).join(' vs ');
    this.round.textContent = rumble ? "전원 럼블" : "토너먼트 · " + roundName(b.roundSize || 2);
    const ownMatch = m => m.ids?.includes(s.me.id);
    const current = matches.find(ownMatch);
    const upcoming = (b.bracket || []).find(m => ownMatch(m) && !m.winnerId && !matches.some(a => a.id === m.id));
    const lost = (b.bracket || []).find(m => ownMatch(m) && m.winnerId && m.winnerId !== s.me.id);
    this.upnext.textContent = rumble ? "마지막까지 살아남은 공이 우승합니다." : s.teacher
      ? "중계 화면을 선택하면 해당 경기를 크게 볼 수 있습니다."
      : s.me.waiting ? "관전 중 · 다음 판부터 참가합니다."
      : current ? "나의 경기 · " + names(current.ids)
      : upcoming ? "다음 출전 대기 · " + names(upcoming.ids)
      : lost ? who(s.room,lost.winnerId) + "에게 패했습니다. 자동 관전에서 승자를 따라갑니다." : "다음 대진을 기다리고 있습니다.";
    if (b.waitTicks > 0) this.upnext.textContent = "다음 경기까지 " + Math.ceil(b.waitTicks / 60) + "초 · " + this.upnext.textContent;
    insertIfChanged(this.options, (document.fullscreenEnabled ? button("fullscreen","중계 전체 화면") : "") + button("audio",s.options.sound ? "소리 켜짐" : "소리 꺼짐",s.options.sound ? "sf-selected" : "") +
      button("shake",s.options.shake ? "흔들림 켜짐" : "흔들림 꺼짐") + button("effects",s.options.reduced ? "간소 효과" : "기본 효과"));
    if (this.focusId && !matches.some(m => m.id === this.focusId)) this.focusId = null;
    const active = matches.filter(m => !m.done);
    insertIfChanged(this.switch, active.length > 1 || (!s.teacher && this.focusId) ?
      button("watch",s.teacher ? "전체 중계" : "자동 관전",!this.focusId ? "sf-selected" : "",false,"") +
      active.map(m => button("watch", esc(names(m.ids)), this.focusId === m.id ? "sf-selected" : "", false,m.id)).join('') : "");
    const visible = s.teacher && this.focusId ? arenaList.filter(a => a.id === this.focusId) : arenaList;
    this.syncArenas(visible);
    if (!visible.length) {
      if (!this.stages.querySelector('.sf-between')) {
        this.stages.insertAdjacentHTML('beforeend','<div class="sf-panel sf-between"></div>');
      }
      this.stages.querySelector('.sf-between').textContent = b.waitTicks > 0
        ? "다음 경기 준비 중 · " + Math.ceil(b.waitTicks / 60) + "초" : "경기장에 연결하고 있습니다.";
    } else this.stages.querySelector('.sf-between')?.remove();
    const cheerOff = !!s.room.paused || Date.now() < (s.cheerUntil || 0);
    insertIfChanged(this.react, ["🔥","👏","⚡","💫"].map(e => button("cheer",e,"sf-emoji",cheerOff,e)).join(''));
    this.react.querySelectorAll("button").forEach(b => b.setAttribute("aria-label", b.textContent + " 응원"));
    const now = Date.now() + (s.serverOffset || 0);
    const cheers = (s.room.cheers || []).filter(c => c.at > now - 3500).slice(-3);
    const cheerText = cheers.length ? cheers.map(c => c.name + ' ' + c.emoji).join(' · ') : '응원은 경기 결과에 영향을 주지 않습니다.';
    if (this.cheers.textContent !== cheerText) this.cheers.textContent = cheerText;
    const bracket = b.bracket || [];
    const bracketNode = this.bracket.parentElement;
    bracketNode.hidden = !bracket.length;
    const bracketKey = JSON.stringify(bracket);
    if (this.bracketKey !== bracketKey) {
      this.bracketKey = bracketKey;
      const rounds = new Map();
      for (const m of bracket) {
        if (!rounds.has(m.roundSize)) rounds.set(m.roundSize,[]);
        rounds.get(m.roundSize).push(m);
      }
      insertIfChanged(this.bracket,'<div class="sf-rounds">' + [...rounds].map(([size,rows]) =>
        '<section><h4>' + roundName(size) + '</h4><ul class="sf-matches">' + rows.map(m => {
          const result = m.winnerId ? who(s.room,m.winnerId) + ' 승' : m.state === "playing" ? '진행 중' : '대기';
          const reason = m.reason && (reasonName[m.reason] || m.reason);
          return '<li><span>' + esc(names(m.ids) || "대진 미정") + '</span><b>' + esc(result) + (reason ? ' · ' + esc(reason) : '') + '</b></li>';
        }).join('') + '</ul></section>').join('') + '</div>');
    }
  }

  syncArenas(list) {
    const s = this.s;
    for (const [id, entry] of this.views) {
      if (!list.some(a => a.id === id)) {
        entry.view.destroy();
        entry.card.remove();
        this.views.delete(id);
      }
    }
    this.stages.classList.toggle("sf-split",list.length > 1);
    for (const a of list) {
      let entry = this.views.get(a.id);
      if (!entry) {
        const card = document.createElement("article");
        card.className = "sf-arena";
        card.innerHTML = '<header><h3></h3><strong></strong></header><canvas role="img" aria-label="자동 공 대전 실시간 중계"></canvas><footer aria-label="경기 점수"></footer>';
        const canvas = card.querySelector("canvas");
        this.stages.append(card);
        entry = {card, view:new ArenaView(canvas,{...s.options,playerId:s.me.id}), title:card.querySelector("h3"),
          clock:card.querySelector("header strong"), info:card.querySelector("footer"), seen:0, log:[]};
        this.views.set(a.id,entry);
      }
      entry.view.setOptions({...s.options,playerId:s.me.id});
      entry.view.update(a);
      const balls = a.balls || [];
      const alive = balls.filter(x => x.alive).length;
      const battleTitle = a.mode === "rumble" || balls.length > 2 ? "생존 " + alive + " / " + balls.length + "명" : balls.map(p => p.name).join(' vs ');
      if (entry.title.textContent !== battleTitle) entry.title.textContent = battleTitle;
      entry.clock.textContent = (s.room.paused ? "일시정지 · " : "") + timeLeft(a) + "초";
      for (const e of a.events || []) {
        if (e.seq <= entry.seen) continue;
        entry.seen = e.seq;
        if (e.type === "ko") entry.log = [...entry.log,who(s.room,e.targetId) + " 탈락"].slice(-3);
      }
      const personal = balls.find(p => p.id === s.me.id);
      const selected = balls.length <= 2 ? balls : personal ? [personal] : [];
      const hud = selected.map(p => esc(p.name) + ' · +' + p.level + ' · HP ' + Math.max(0,Math.ceil(p.hp)) + '/' + Math.ceil(p.maxHp)).join("　");
      insertIfChanged(entry.info,(hud ? '<span>' + hud + '</span>' : '') + '<span>' + esc(entry.log.join(' · ')) + '</span>');
    }
  }

  focus(id) {
    this.focusId = id || null;
    this.update(this.latest);
  }
  destroy() {
    for (const e of this.views.values()) e.view.destroy();
    this.views.clear();
  }
}
