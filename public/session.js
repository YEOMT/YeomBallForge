import { GameConnection, getSavedSession } from "./session-network.js";
import { lobby, quiz, forge, locked, results, waiting, phases, modes, esc, button, who } from "./session-screens.js";
import { Broadcast } from "./session-battle.js";
import { drawEmblem, unlockAudio } from "./arena.js";
import { CLASSES } from "./packages/content/classes.js";

export { getSavedSession };

const screens = { LOBBY:lobby, QUIZ:quiz, FORGE:forge, LOCKED:locked, RESULTS:results };
const nextPhase = { QUIZ:"강화 시작", FORGE:"빌드 잠금", LOCKED:"대전 시작" };
const symbols = { LOBBY:"⌂", QUIZ:"?", FORGE:"✧", LOCKED:"◆", BATTLE:"✹", RESULTS:"★" };

function formatClock(ms) {
  const seconds = Math.max(0,Math.ceil(ms / 1000));
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2,"0");
}

function readOptions() {
  const motion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const defaults = {sound:false, shake:!motion, reduced:motion};
  try { return {...defaults,...JSON.parse(localStorage.getItem("ballforge-prefs") || "{}")}; }
  catch { return defaults; }
}

function nodeWith(root, selector, html) {
  const node = root.querySelector(selector);
  if (node._html !== html) {
    node.innerHTML = html;
    node._html = html;
    return true;
  }
  return false;
}

export async function startSession(args) {
  if (!args?.mount || !["create","join","resume"].includes(args.mode)) throw new Error("접속 방식을 확인해 주세요.");
  const ui = new SessionUI(args);
  try {
    const identity = await ui.connection.open(args);
    ui.identity = identity;
    ui.attach();
    return ui;
  } catch (err) {
    ui.dispose(false);
    throw err;
  }
}

class SessionUI {
  constructor(args) {
    this.args = args;
    this.root = args.mount;
    this.options = readOptions();
    this.settingsChanged = () => { this.options = readOptions(); this.render(); };
    this.chosenElement = "fire";
    this.busy = false;
    this.networkMessage = "";
    this.feedback = "";
    this.connection = new GameConnection(args.wsUrl, {
      message: m => this.receive(m),
      status: m => { this.networkMessage = m; this.render(); },
      terminal: m => this.terminal(m)
    });
    this.click = e => { this.onClick(e).catch(err => this.notify(err.message)); };
    this.change = e => { this.onChange(e).catch(err => this.notify(err.message)); };
    this.input = e => {
      const form = e.target.closest('[data-form="settings"]');
      if (form) this.settingsDraft = Object.fromEntries(new FormData(form));
    };
    this.submit = e => { this.onSubmit(e).catch(err => this.notify(err.message)); };
  }

  attach() {
    this.attached = true;
    this.root.classList.add("sf-session");
    this.root.innerHTML = '<div class="sf-shell"><header class="sf-top"><button type="button" class="sf-brand" data-action="exit" aria-label="게임 입장 화면"><img src="./assets/forge.svg" alt=""><i>DS</i> BALL FORGE</button><div class="sf-top-tools"><button type="button" data-action="codex">볼 도감</button><button type="button" data-action="prefs">환경 설정</button><button type="button" data-action="exit">입장 화면</button></div></header>' +
      '<div data-banner role="status"></div><div class="sf-status" data-head></div><div class="sf-wrap"><div data-body></div><nav class="sf-operations" aria-label="교사 운영" data-ops></nav></div><div data-feedback role="status" aria-live="polite"></div></div><dialog class="sf-dialog"></dialog>';
    this.root.addEventListener("click",this.click);
    this.root.addEventListener("input",this.input);
    this.root.addEventListener("change",this.change);
    this.root.addEventListener("submit",this.submit);
    window.addEventListener("forge-settings",this.settingsChanged);
    this.timer = setInterval(() => this.updateClock(),250);
    this.render();
  }

  receive(message) {
    if (message.type === "battle") {
      this.lastFrame = message.battle;
      if (this.room?.phase === "BATTLE") this.broadcast?.update(this.lastFrame);
      return;
    }
    if (message.type !== "state") return;
    const old = this.room;
    this.room = message.room;
    this.me = message.me;
    this.teacher = this.me.role === "teacher";
    this.serverOffset = this.room.serverTime - Date.now();
    if (this.room.phase === "LOBBY") {
      // A repeated join broadcast must not replace a form while a teacher is typing.
      const formState = JSON.stringify([this.room.runId,this.room.settings,this.room.players,this.room.bank,this.me]);
      if (this.formState === formState) return;
      this.formState = formState;
    } else this.formState = null;
    if (old && (old.runId !== this.room.runId || old.phase !== this.room.phase)) {
      this.answerFeedback = null;
      this.forgeFx = null;
      clearTimeout(this.fxTimer);
      clearTimeout(this.answerTimer);
      this.settingsDraft = null;
      this.root.querySelector("dialog[open]")?.close();
      if (this.room.phase !== "BATTLE") this.lastFrame = null;
      if (old.runId !== this.room.runId) {
        this.chosenElement = "fire";
        this.cheerUntil = 0;
      }
      this.feedback = "";
      if (this.attached) window.scrollTo({top:0,behavior:"instant"});
    }
    this.render();
  }

  render() {
    if (!this.attached || this.destroyed) return;
    const { room, me } = this;
    const banner = this.networkMessage || (room?.paused ? "교사가 일시정지했습니다. 남은 시간과 경기가 함께 멈춥니다." : "");
    nodeWith(this.root,"[data-banner]",banner ? '<div class="sf-banner">' + esc(banner) + '</div>' : '');
    nodeWith(this.root,"[data-feedback]",this.feedback ? '<div class="sf-toast">' + esc(this.feedback) + '</div>' : '');
    if (this.ended) {
      this.broadcast?.destroy();
      this.broadcast = null;
      nodeWith(this.root,"[data-head]","");
      nodeWith(this.root,"[data-body]",'<section class="sf-panel sf-wait"><h2>접속 종료</h2><p>' + esc(this.ended) + '</p>' + button("exit","입장 화면으로","sf-primary") + '</section>');
      nodeWith(this.root,"[data-ops]","");
      return;
    }
    if (!room) {
      nodeWith(this.root,"[data-body]",'<div class="sf-panel sf-wait">방 정보를 불러오고 있습니다.</div>');
      return;
    }
    const hasClock = room.deadline != null || (room.paused && room.phase !== "BATTLE");
    const role = this.teacher ? "교사" : me.waiting ? "관전자" : esc(me.name || this.identity?.name || "학생");
    nodeWith(this.root,"[data-head]",'<div class="sf-status-inner"><div class="sf-context"><b>방 ' + esc(room.code) + '</b><span>' + role + '</span><span>' + esc(modes[room.settings.mode]) + '</span></div><div class="sf-phase"><span>' + symbols[room.phase] + '</span> ' +
      esc(phases[room.phase]) + (hasClock ? ' <time data-clock></time>' : '') + '</div></div>');
    this.updateClock();
    const body = this.root.querySelector("[data-body]");
    if (room.phase === "BATTLE") {
      if (!this.broadcast) {
        body._html = null;
        this.broadcast = new Broadcast(body,this);
      }
      this.broadcast.update(this.lastFrame || room.battle);
    } else {
      this.broadcast?.destroy();
      this.broadcast = null;
      const screen = me.waiting && !["RESULTS","LOBBY"].includes(room.phase) ? waiting : screens[room.phase];
      if (screen) {
        const focused = body.contains(document.activeElement) ? document.activeElement : null;
        const field = focused?.name;
        const prevDetail = body.querySelector(".sf-learning")?.open;
        if (nodeWith(this.root,"[data-body]", screen(this))) {
          if (field && ["questionCount","quizSeconds","forgeSeconds","mode"].includes(field)) body.querySelector('[name="' + field + '"]')?.focus({preventScroll:true});
          if (prevDetail && body.querySelector(".sf-learning")) body.querySelector(".sf-learning").open = true;
          const canvas = body.querySelector("canvas[data-emblem]");
          if (canvas) drawEmblem(canvas,{classId:me.classId || "basic", element:me.element || "neutral", level:me.level || 0});
        }
      }
    }
    const actions = [];
    if (this.teacher) {
      const off = this.busy || !!this.networkMessage;
      if (room.phase === "LOBBY") actions.push(button("start","퀴즈 시작","sf-primary",off || !room.players.length || room.bank?.count < room.settings.questionCount));
      if (room.phase === "RESULTS") actions.push(button("rematch","같은 방에서 새 판","sf-primary",off));
      if (!["LOBBY","RESULTS"].includes(room.phase)) {
        actions.push(button(room.paused ? "resumeGame" : "pause",room.paused ? "진행 재개" : "일시정지","",off));
        if (nextPhase[room.phase]) actions.push(button("advance",nextPhase[room.phase],"sf-primary",off));
      }
      actions.push(button("close","방 닫기","sf-danger",off));
    }
    nodeWith(this.root,"[data-ops]",actions.join(''));
  }

  updateClock() {
    const clock = this.attached && this.root.querySelector("[data-clock]");
    if (!clock || !this.room) return;
    const remaining = this.room.paused ? this.room.remainingMs : this.room.deadline - (Date.now() + this.serverOffset);
    const time = formatClock(remaining);
    if (clock.textContent !== time) clock.textContent = time;
  }

  notify(message) {
    this.feedback = message;
    this.render();
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.feedback = "";
      if (this.attached && !this.destroyed) nodeWith(this.root,"[data-feedback]","");
    },3500);
  }

  async cmd(type, fields, done) {
    if (this.busy || this.ended) return;
    this.busy = true;
    this.render();
    const runId = this.room.runId;
    try {
      const data = await this.connection.request(type,fields);
      if (!this.destroyed && this.room.runId === runId) done?.(data);
    } catch (err) { this.notify(err.message); }
    finally { this.busy = false; this.render(); }
  }

  modal(heading, html, yesLabel) {
    const d = this.root.querySelector("dialog");
    if (d.open) d.close();
    d.innerHTML = '<div class="sf-modal"><h2>' + esc(heading) + '</h2><div class="sf-modal-body">' + html +
      '</div><form method="dialog" class="sf-actions"><button class="sf-button" value="cancel">' + (yesLabel ? "취소" : "닫기") + '</button>' +
      (yesLabel ? '<button class="sf-button sf-primary" value="ok">' + esc(yesLabel) + '</button>' : '') + '</form></div>';
    d.returnValue = "";
    d.showModal();
    return new Promise(resolve => d.addEventListener("close",() => resolve(d.returnValue === "ok"),{once:true}));
  }

  async previewBank(offset = 0) {
    const b = await this.connection.request("bankPreview",{offset});
    if (this.destroyed || this.room.phase !== "LOBBY") return;
    const body = '<p>' + esc(b.filename) + ' · 총 ' + b.count + '문항</p><ol class="sf-preview" start="' + (offset + 1) + '">' + b.preview.map(q =>
      '<li><b>' + esc(q.text) + '</b><small>정답 · ' + esc(q.correctText) + '</small><p>' + q.answers.map(esc).join(' / ') + '</p></li>').join('') +
      '</ol><div class="sf-actions">' + (offset > 0 ? button("bankPage","이전 문항","",false,offset - 20) : '') +
      (offset + 20 < b.count ? button("bankPage","다음 문항","",false,offset + 20) : '') + '</div>';
    this.modal("교사용 문제 미리보기",body);
  }

  async onClick(event) {
    const control = event.target.closest("[data-action]");
    if (!control || control.disabled || !this.root.contains(control)) return;
    const action = control.dataset.action, value = control.dataset.value;
    if (action === "exit") {
      this.dispose(false);
      this.args.onExit?.();
      return;
    }
    if (action === "codex") { window.openForgeCodex?.(); return; }
    if (action === "prefs") { window.openForgeSettings?.(); return; }
    const m = this.me, r = this.room;
    if (!r || this.ended) return;
    switch (action) {
      case "copy":
        try { await navigator.clipboard.writeText(value); this.notify("학생 참가 링크를 복사했습니다."); }
        catch { this.modal("학생 참가 링크",'<input aria-label="학생 참가 링크" readonly value="' + esc(value) + '">'); }
        break;
      case "bankPreview": case "bankPage": await this.previewBank(Number(value) || 0); break;
      case "start":
        if (this.settingsDraft) { this.notify("변경한 수업 설정을 먼저 저장하세요."); break; }
        await this.cmd("start"); break;
      case "pause": case "resumeGame": case "rematch": await this.cmd(action,{phase:r.phase}); break;
      case "advance":
        if (await this.modal(nextPhase[r.phase],'<p>현재 단계를 지금 마치고 다음 단계로 진행합니다.</p>',"진행")) await this.cmd(action,{phase:r.phase});
        break;
      case "close":
        if (await this.modal("수업 방을 닫을까요?",'<p>모든 참가자의 연결이 종료되고 이 방의 기록이 사라집니다.</p>',"방 닫기")) await this.cmd(action);
        break;
      case "remove":
        if (await this.modal("참가자 제외",'<p>' + esc(who(r,value)) + '님을 대기실에서 제외할까요?</p>',"제외")) await this.cmd(action,{playerId:value});
        break;
      case "answer": {
        const question = m.question, index = m.answered + 1;
        if (!question || this.answerFeedback) break;
        await this.cmd("answer",{questionId:question.id,attemptId:question.attemptId,answerId:value},data => {
          if (this.room.phase !== "QUIZ") return;
          this.answerFeedback = {...data,question,choice:value,index};
          clearTimeout(this.answerTimer);
          this.answerTimer = setTimeout(() => { this.answerFeedback = null; this.render(); },data.correct ? 700 : 1500);
        });
        break;
      }
      case "enhance":
        if (this.forgeFx) break;
        await this.cmd(action,{},data => {
          if (this.room.phase !== "FORGE") return;
          const big = data.success && [10,15,20].includes(data.level);
          const extra = {10:" · 전직 개방",15:" · 코어 각성",20:" · 최종 완성"}[data.level];
          this.forgeFx = {style:big ? "sf-big-success" : data.success ? "sf-success" : "sf-fail",
            label:data.success ? '+' + data.level + ' 강화 성공' + (extra || '') : data.protected ? "유지권 발동 · 단계 유지" : '강화 실패 · +' + data.level};
          clearTimeout(this.fxTimer);
          this.fxTimer = setTimeout(() => { this.forgeFx = null; this.render(); },big ? 1100 : 520);
        });
        break;
      case "buyShield": await this.cmd(action,{},() => this.notify("유지권 1개를 구매했습니다.")); break;
      case "shield": await this.cmd(action,{enabled:!m.useShield}); break;
      case "element": this.chosenElement = value; this.render(); break;
      case "chooseClass": {
        const chosen = CLASSES[value];
        if (await this.modal(chosen.name + ' 전직','<p>' + esc(chosen.description) + '</p><p>확정하면 이번 판에 다시 선택할 수 없습니다.</p>',"전직 확정")) {
          await this.cmd(action,{classId:value},() => this.notify(chosen.name + ' 전직 완료'));
        }
        break;
      }
      case "hidden":
        if (await this.modal(value === "yes" ? "히든 클래스로 전직할까요?" : "일반 클래스를 유지할까요?",'<p>이번 판의 최종 전직 선택입니다.</p>',"선택 확정")) {
          await this.cmd(action,{accept:value === "yes"},() => {
            if (value === "yes" && this.room.phase === "FORGE") {
              this.forgeFx = {style:"sf-big-success sf-awaken-hidden",label:"히든 각성 · " + CLASSES[m.hiddenOffer].name};
              clearTimeout(this.fxTimer);
              this.fxTimer = setTimeout(() => { this.forgeFx = null; this.render(); },1200);
            } else this.notify("일반 클래스를 유지합니다.");
          });
        }
        break;
      case "lock":
        if (await this.modal('+' + m.level + ' 출전 확정','<p>현재 단계로 출전합니다. 확정 후에는 강화와 전직을 마칩니다.</p>' +
          (m.level >= 10 && !m.classChosen ? '<p>기본 전직인 홍련돌격구로 출전합니다.</p>' : '') + (m.hiddenOffer ? '<p>미응답 히든 제안은 거절됩니다.</p>' : ''),"출전 확정")) await this.cmd(action);
        break;
      case "watch":
        if (this.teacher) this.broadcast?.focus(value);
        else await this.cmd(action,{matchId:value || null},() => this.broadcast?.focus(value));
        break;
      case "fullscreen":
        await this.root.querySelector("[data-stages]")?.requestFullscreen();
        break;
      case "fullscreenExit":
        if (document.fullscreenElement) await document.exitFullscreen();
        break;
      case "cheer": await this.cmd(action,{emoji:value},() => {
        this.cheerUntil = Date.now() + 2500;
        clearTimeout(this.cheerTimer);
        this.cheerTimer = setTimeout(() => this.broadcast?.update(this.lastFrame),2550);
      }); break;
      case "audio":
        if (!this.options.sound) await unlockAudio();
        this.options.sound = !this.options.sound;
        this.saveOptions(); break;
      case "shake": this.options.shake = !this.options.shake; this.saveOptions(); break;
      case "effects": this.options.reduced = !this.options.reduced; this.saveOptions(); break;
    }
  }

  saveOptions() {
    try { localStorage.setItem("ballforge-prefs",JSON.stringify(this.options)); }
    catch { /* The current view retains this choice until the tab closes. */ }
    this.render();
  }

  async onChange(event) {
    if (event.target.dataset.file !== "bank") return;
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 100000) { this.notify("문제은행 파일은 100 KB 이하로 선택하세요."); return; }
    let text;
    try { text = new TextDecoder("utf-8",{fatal:true}).decode(await file.arrayBuffer()); }
    catch { this.notify("파일을 UTF-8 TXT 형식으로 저장해 주세요."); return; }
    await this.cmd("bank",{filename:file.name,text},() => this.notify("문제은행 검사 결과를 확인하세요."));
  }

  async onSubmit(event) {
    if (event.target.dataset.form !== "settings") return;
    event.preventDefault();
    const cfg = Object.fromEntries(new FormData(event.target));
    for (const k of ["quizSeconds","forgeSeconds","questionCount"]) cfg[k] = Number(cfg[k]);
    await this.cmd("settings",cfg,() => { this.settingsDraft = null; this.notify("수업 설정을 저장했습니다."); });
  }

  terminal(message) {
    this.ended = message;
    this.networkMessage = "";
    this.root.querySelector('dialog[open]')?.close();
    this.render();
  }

  dispose(forget = false) {
    this.destroyed = true;
    this.connection.end(forget);
    clearInterval(this.timer);
    for (const timer of [this.fxTimer,this.toastTimer,this.answerTimer,this.cheerTimer]) clearTimeout(timer);
    this.broadcast?.destroy();
    if (!this.attached) return;
    this.root.querySelector("dialog[open]")?.close();
    this.root.removeEventListener("click",this.click);
    this.root.removeEventListener("input",this.input);
    this.root.removeEventListener("change",this.change);
    this.root.removeEventListener("submit",this.submit);
    window.removeEventListener("forge-settings",this.settingsChanged);
    this.root.replaceChildren();
    this.root.classList.remove("sf-session");
  }
}
