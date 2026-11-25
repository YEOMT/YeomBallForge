import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { DEFAULTS, EMOJI, ensure, MAX_STUDENTS } from '../../packages/protocol/index.js';
import { createCompetition, stepCompetition, competitionSnapshot } from '../../packages/sim/index.js';
import { initialBuild, fundBuild, enhance, buyShield, toggleShield, chooseClass, resolveHidden, lockBuild } from './forge.js';
import { defaultBank, parseBank, bankPreview, assignQuestions, publicQuestion, shuffle } from './quiz.js';

const FORGE_COMMANDS = new Set(['enhance', 'buyShield', 'shield', 'chooseClass', 'hidden', 'lock']);
const TEACHER_COMMANDS = new Set(['settings', 'bank', 'bankPreview', 'remove', 'start', 'advance', 'pause', 'resumeGame', 'rematch', 'close']);
const modes = new Set(['tournament', 'rumble', 'combined']);
const intIn = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;

export function member(role, name) {
  return { id: randomBytes(9).toString('base64url'), token: randomBytes(32).toString('base64url'), epoch: 0, socket: null, role, name,
    waiting: false, build: initialBuild(), questions: [], correct: 0, answered: 0,
    lastAnswer: null, seen: new Map(), focus: null, lastCheer: 0 };
}
export class Room {
  constructor(code, now = Date.now()) {
    this.code = code;
    this.runId = randomUUID();
    this.phase = 'LOBBY';
    this.settings = { ...DEFAULTS };
    this.bank = defaultBank();
    this.teacher = member('teacher', '교사');
    this.students = new Map();
    this.deadline = null;
    this.paused = false;
    this.left = 0;
    this.competition = null;
    this.lastTickAt = now;
    this.accumulator = 0;
    this.createdAt = now;
    this.emptySince = now;
    this.cheers = [];
    this.closed = false;
  }
  members() { return [this.teacher, ...this.students.values()]; }
  add(name) {
    ensure(this.students.size < MAX_STUDENTS, '정원이 가득 찼습니다. 학생은 최대 30명까지 참가할 수 있습니다.');
    ensure(typeof name === 'string' && name.trim().length > 0 && [...name.trim()].length <= 18 && !/[\x00-\x1f\x7f]/.test(name), '이름을 1~18자로 입력하세요.');
    const user = member('student', name.trim());
    while (user.id === this.teacher.id || this.students.has(user.id)) user.id = randomBytes(9).toString('base64url');
    user.waiting = this.phase !== 'LOBBY';
    this.students.set(user.id, user);
    return user;
  }
  active() { return [...this.students.values()].filter(p => !p.waiting); }
  startQuiz(now) {
    ensure(this.phase === 'LOBBY', '로비에서 시작할 수 있습니다.');
    ensure(this.students.size, '참가 학생이 한 명 이상 필요합니다.');
    ensure(this.bank.count >= this.settings.questionCount, '고유 문항이 부족합니다. 문제 수를 줄이거나 문제은행을 보충하세요.');
    const selected = shuffle(this.bank.items).slice(0, this.settings.questionCount);
    for (const p of this.active()) p.questions = assignQuestions(selected);
    this.setPhase('QUIZ', now, this.settings.quizSeconds);
  }
  setPhase(phase, now, seconds = 0) {
    this.phase = phase;
    this.paused = false;
    this.left = 0;
    this.deadline = seconds ? now + seconds * 1000 : null;
    this.lastTickAt = now;
    this.accumulator = 0;
  }
  advance(now) {
    switch (this.phase) {
      case 'LOBBY': return this.startQuiz(now);
      case 'QUIZ':
        for (const p of this.active()) fundBuild(p.build, p.correct);
        return this.setPhase('FORGE', now, this.settings.forgeSeconds);
      case 'FORGE': {
        for (const p of this.active()) lockBuild(p.build);
        const builds = this.active().map(p => ({ id: p.id, name: p.name, level: p.build.level, classId: p.build.classId, element: p.build.element }));
        this.competition = createCompetition(builds, this.settings.mode, randomInt(0x100000000), randomBytes(9).toString('base64url'));
        return this.setPhase('LOCKED', now, 5);
      }
      case 'LOCKED':
        return this.setPhase(this.competition.done ? 'RESULTS' : 'BATTLE', now);
      default: throw new Error('현재 단계에서는 다음 단계로 넘길 수 없습니다.');
    }
  }
  tick(now) {
    if (this.closed || this.paused) return false;
    if (this.deadline !== null && now >= this.deadline) {
      this.advance(now);
      return true;
    }
    if (this.phase !== 'BATTLE') return false;
    // Pause a suspended host's clock rather than running an unbounded catch-up loop.
    this.accumulator += Math.min(250, Math.max(0, now - this.lastTickAt)) * 60;
    this.lastTickAt = now;
    while (this.accumulator >= 1000 && !this.competition.done) {
      stepCompetition(this.competition);
      this.accumulator -= 1000;
    }
    if (this.competition.done) {
      this.setPhase('RESULTS', now);
      return true;
    }
    return false;
  }
  reset(now) {
    ensure(this.phase === 'RESULTS', '결과 화면에서 재경기할 수 있습니다.');
    this.runId = randomUUID();
    this.competition = null;
    this.cheers = [];
    for (const p of this.members()) {
      Object.assign(p, { build: initialBuild(), waiting: false, questions: [], correct: 0,
        answered: 0, lastAnswer: null, focus: null, lastCheer: 0 });
      p.seen.clear();
    }
    this.setPhase('LOBBY', now);
  }
  dispatch(p, msg, now) {
    ensure(!this.closed, '방이 종료되었습니다.');
    ensure(msg.runId === this.runId, '이전 경기의 요청입니다. 현재 방 상태를 확인하세요.');
    if (msg.connectionEpoch !== undefined) ensure(msg.connectionEpoch === p.epoch, '이전 연결의 요청입니다.');
    // A preview carries the whole selected page. Never retain these read-only
    // payloads in the command journal, even if a teacher pages through it often.
    if (msg.type === 'bankPreview') {
      ensure(p.role === 'teacher', '교사만 사용할 수 있는 기능입니다.');
      return this.teacherAction(msg, now);
    }
    const old = p.seen.get(msg.commandId);
    if (old) {
      ensure(old.type === msg.type, '명령 번호가 이미 사용되었습니다.');
      return old.result;
    }
    // Replays must keep their original response even across phase changes.
    ensure(p.seen.size < 2048 || ['close', 'rematch', 'lock'].includes(msg.type), '이번 판의 명령 수 제한에 도달했습니다.');
    let result = {};
    if (TEACHER_COMMANDS.has(msg.type)) {
      ensure(p.role === 'teacher', '교사만 사용할 수 있는 기능입니다.');
      result = this.teacherAction(msg, now);
    } else if (msg.type === 'watch') {
      ensure(this.phase === 'BATTLE' && (msg.matchId === null || this.competition.active.some(a => a.id === msg.matchId)), '현재 방송 중인 경기를 선택하세요.');
      p.focus = msg.matchId;
    } else if (msg.type === 'cheer') {
      ensure(this.phase === 'BATTLE' && !this.paused && EMOJI.includes(msg.emoji) && now - p.lastCheer >= 2400, '잠시 뒤 다시 응원하세요.');
      p.lastCheer = now;
      this.cheers = [...this.cheers.filter(c => now - c.at < 3500), { id: randomUUID(), name: p.name, emoji: msg.emoji, at: now }].slice(-8);
    } else {
      ensure(p.role === 'student' && !p.waiting, '다음 경기부터 참가할 수 있습니다.');
      ensure(!this.paused, '경기가 일시정지 상태입니다.');
      ensure(this.deadline !== null && now < this.deadline, '접수 시간이 종료되었습니다.');
      if (msg.type === 'answer') {
        ensure(this.phase === 'QUIZ', '퀴즈 시간이 아닙니다.');
        const q = p.questions[p.answered];
        ensure(q && msg.questionId === q.id && msg.attemptId === q.attemptId, '현재 문항의 첫 제출만 인정됩니다.');
        ensure(q.answers.some(a => a.id === msg.answerId), '보기 중 하나를 선택하세요.');
        const correct = q.correctAnswer.id === msg.answerId;
        p.answered++;
        if (correct) p.correct++;
        result = { correct, correctText: q.correctAnswer.text, explanation: q.explanation ?? '' };
        p.lastAnswer = { questionId: q.id, ...result };
      } else {
        ensure(FORGE_COMMANDS.has(msg.type) && this.phase === 'FORGE' && !p.build.locked, '현재 공을 변경할 수 없습니다.');
        switch (msg.type) {
          case 'enhance': result = enhance(p.build); break;
          case 'buyShield': buyShield(p.build); break;
          case 'shield': toggleShield(p.build, msg.enabled); break;
          case 'chooseClass': chooseClass(p.build, msg.classId); break;
          case 'hidden': resolveHidden(p.build, msg.accept); break;
          case 'lock': lockBuild(p.build); break;
        }
      }
    }
    if (msg.runId === this.runId) p.seen.set(msg.commandId, { type: msg.type, result });
    return result;
  }
  teacherAction(msg, now) {
    switch (msg.type) {
      case 'settings': {
        ensure(this.phase === 'LOBBY', '로비에서만 설정할 수 있습니다.');
        const next = { ...this.settings };
        for (const key of Object.keys(next)) if (msg[key] !== undefined) next[key] = msg[key];
        ensure(modes.has(next.mode) && intIn(next.questionCount, 1, 20) &&
          intIn(next.quizSeconds, 1, 600) && intIn(next.forgeSeconds, 1, 600), '모드, 문항 수(1~20), 제한시간(1~600초)을 확인하세요.');
        this.settings = next;
        break;
      }
      case 'bank':
        ensure(this.phase === 'LOBBY', '로비에서만 업로드할 수 있습니다.');
        this.bank = parseBank(msg.text, msg.filename);
        break;
      case 'bankPreview':
        ensure(intIn(msg.offset ?? 0, 0, 1500), '미리보기 위치가 올바르지 않습니다.');
        return bankPreview(this.bank, msg.offset);
      case 'remove': {
        ensure(this.phase === 'LOBBY', '로비에서만 참가자를 제외할 수 있습니다.');
        const target = this.students.get(msg.playerId);
        ensure(target, '참가자를 찾을 수 없습니다.');
        this.students.delete(target.id);
        target.socket?.close(4003, 'removed');
        target.socket = null;
        break;
      }
      case 'start': this.startQuiz(now); break;
      case 'advance': this.advance(now); break;
      case 'pause':
        ensure(!this.paused && !['LOBBY', 'RESULTS'].includes(this.phase), '지금은 일시정지할 수 없습니다.');
        this.left = this.deadline === null ? 0 : Math.max(0, this.deadline - now);
        this.deadline = null;
        this.paused = true;
        break;
      case 'resumeGame':
        ensure(this.paused, '이미 진행 중입니다.');
        this.paused = false;
        this.deadline = this.phase === 'BATTLE' ? null : now + this.left;
        this.lastTickAt = now;
        break;
      case 'rematch': this.reset(now); break;
      case 'close': this.closed = true; break;
    }
    return {};
  }
  focus(p) {
    if (p.role === 'teacher') return undefined;
    const active = this.competition.active;
    const chosen = active.find(a => a.id === p.focus);
    const includes = (a, id) => a.balls.some(b => b.id === id);
    if (chosen) return chosen.id;
    let follow = p.id;
    for (const m of this.competition.bracket) {
      if (m.winnerId && m.ids.includes(follow)) follow = m.winnerId;
    }
    return (active.find(a => includes(a, p.id)) || active.find(a => includes(a, follow)) || active[0])?.id ?? null;
  }
  frame(p) {
    return this.competition && competitionSnapshot(this.competition, this.focus(p));
  }
  state(p, now) {
    const isTeacher = p.role === 'teacher';
    const players = [...this.students.values()].map(s => ({
      id: s.id, name: s.name, connected: Boolean(s.socket), waiting: s.waiting,
      locked: s.build.locked, level: s.build.level, classId: s.build.classId, element: s.build.element,
      ...(isTeacher ? { answered: s.answered, correct: s.correct, best: s.build.best } : {})
    }));
    const { hiddenOffer, awakeningRolled, ...build } = p.build;
    return { type: 'state', room: { code: this.code, runId: this.runId, phase: this.phase, paused: this.paused,
      deadline: this.deadline, remainingMs: this.paused ? this.left : Math.max(0, (this.deadline ?? now) - now),
      serverTime: now, settings: this.settings, players, ...(isTeacher ? { bank: bankPreview(this.bank) } : {}),
      battle: this.competition && competitionSnapshot(this.competition, null), results: this.competition?.results ?? null,
      cheers: this.cheers.filter(c => now - c.at < 3500) },
      me: { id: p.id, name: p.name, role: p.role, waiting: p.waiting, correct: p.correct, answered: p.answered,
        ...build, hiddenOffer: build.classChosen && build.hiddenDecision === null ? hiddenOffer : null,
        question: this.phase === 'QUIZ' ? publicQuestion(p.questions[p.answered]) : null, lastAnswer: p.lastAnswer } };
  }
}
