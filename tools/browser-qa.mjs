// Run with a local Playwright installation. Optional overrides point to index.mjs
// and an existing Chromium/Edge executable. All rooms use the live WebSocket path.
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { createGameServer } from '../apps/server/index.js';
const { chromium } = process.env.PLAYWRIGHT_MODULE
  ? await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href)
  : await import('playwright');
const artifacts = path.resolve('artifacts/browser');
await mkdir(artifacts,{recursive:true});
const server = createGameServer({password:'browser-classroom',production:false});
await new Promise(resolve => server.server.listen(0,'127.0.0.1',resolve));
const origin = 'http://127.0.0.1:' + server.server.address().port;
const browser = await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE || undefined});
const errors = [], peers = [];
const bank = Array.from({length:8},(_,i) => '검증 문항 ' + (i+1) + '|정답|보기 하나|보기 둘|보기 셋').join('\n');
const ids = ['crimson','mace','tide','magnet','ring','bolt','thorn','seed','cannon','crystal'];
const pause = ms => new Promise(r => setTimeout(r,ms));

async function wait(check, ms = 12000) {
  const end = Date.now()+ms;
  while (Date.now() < end) { if (await check()) return; await pause(40); }
  throw new Error('Timed out waiting for ' + String(check));
}
class Pupil {
  constructor() {
    this.ws = new WebSocket(origin.replace('http','ws') + '/ws');
    this.pending = new Map();
    this.ws.on('message',data => {
      const msg = JSON.parse(data);
      if (msg.type === 'state') this.state = msg;
      if (msg.type === 'ack') {
        this.pending.get(msg.commandId)?.(msg);
        this.pending.delete(msg.commandId);
      }
    });
    peers.push(this);
  }
  async join(code,name) {
    await new Promise((resolve,reject) => { this.ws.once('open',resolve); this.ws.once('error',reject); });
    await this.cmd('join',{code,name});
    await wait(() => this.state);
  }
  async cmd(type,fields) {
    const commandId = randomUUID();
    const msg = await new Promise(resolve => {
      this.pending.set(commandId,resolve);
      this.ws.send(JSON.stringify({type,commandId,runId:this.state?.room.runId,...fields}));
    });
    assert.ok(msg.ok,msg.error);
  }
  async quiz() {
    await wait(() => this.state.room.phase === 'QUIZ');
    for (let i=0;i<8;i++) {
      const q = this.state.me.question;
      await this.cmd('answer',{questionId:q.id,attemptId:q.attemptId,answerId:q.answers.find(a=>a.text==='정답').id});
      await wait(() => this.state.me.answered === i+1);
    }
  }
  async forge(classId) {
    await wait(() => this.state.room.phase === 'FORGE');
    // Commands are sent once per server response including a fresh state.
    while (this.state.me.level < 10 && this.state.me.tickets) {
      const old = this.state.me.tickets;
      await this.cmd('enhance');
      await wait(() => this.state.me.tickets < old);
    }
    if (this.state.me.level >= 10) await this.cmd('chooseClass',{classId});
    await this.cmd('lock');
  }
}

async function openPage(mobile = false) {
  const ctx = await browser.newContext({viewport:mobile ? {width:393,height:852} : {width:1330,height:940}});
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror',e => errors.push(e.message));
  page.on('console',message => { if (message.type() === 'error') errors.push(message.text()); });
  return page;
}
const act = (page,type) => page.locator('[data-action="' + type + '"]').first();
const shot = (page,name) => page.screenshot({path:path.join(artifacts,name + '.png'),fullPage:true});
async function advance(page) {
  await act(page,'advance').click();
  await page.locator('.sf-dialog[open] button[value="ok"]').click();
}

async function lessonAndDraw() {
  const teacher = await openPage();
  const learner = await openPage(true);
  await teacher.goto(origin);
  await teacher.locator('[data-open=create]').click();
  await teacher.locator('[name=password]').fill('browser-classroom');
  await teacher.locator('.entry-form button[type=submit]').click();
  const code = (await teacher.locator('.sf-code').innerText()).replace(/\s/g,'');
  await teacher.locator('[name=mode]').selectOption('tournament');
  await teacher.locator('[name=questionCount]').fill('1');
  await teacher.locator('[data-form=settings] button[type=submit]').click();
  await teacher.locator('.sf-context').getByText('토너먼트',{exact:true}).waitFor();
  await act(teacher,'bankPreview').click();
  await teacher.locator('.sf-preview li').first().waitFor();
  const answers = await teacher.locator('.sf-preview li').evaluateAll(rows =>
    Object.fromEntries(rows.map(row => [row.querySelector('b').textContent,row.querySelector('small').textContent.replace('정답 · ','')])));
  await teacher.locator('.sf-dialog button[value=cancel]').click();
  await learner.goto(origin + '/?code=' + code);
  await learner.locator('[name=name]').fill('별사탕');
  await learner.locator('.entry-form button[type=submit]').click();
  await learner.getByText('별사탕님, 입장했습니다').waitFor();
  await Promise.all([new Pupil().join(code,'동백'),new Pupil().join(code,'은하수')]);
  await wait(async() => await teacher.locator('.sf-roster li').count() === 3);
  await act(teacher,'start').click();
  const question = await learner.locator('.sf-quiz h3').innerText();
  assert.ok(answers[question]);
  const options = learner.locator('.sf-answer');
  const wrong = (await options.allTextContents()).findIndex(text => text.slice(1) !== answers[question]);
  await options.nth(wrong).click();
  const feedback = await learner.locator('.sf-feedback').innerText();
  assert.ok(feedback.includes(answers[question]));
  assert.ok(feedback.split('입니다.').slice(1).join('입니다.').trim().length > 4,'Specific explanation after the answer');
  await advance(teacher);
  await advance(teacher);
  await teacher.locator('.sf-draw').getByText(/부전승/).waitFor();
  await learner.locator('.sf-opponent h3').filter({hasText:/부전승|1라운드 대결/}).waitFor();
  await shot(teacher,'teacher-bracket-intro');
  await act(teacher,'close').click();
  await teacher.locator('.sf-dialog[open] button[value=ok]').click();
  await learner.getByRole('heading',{name:'접속 종료'}).waitFor();
  await teacher.context().close();
  await learner.context().close();
  console.log('PASS browser default answer explanation and seeded three-player draw');
}

async function scenario(count,mode) {
  const teacher = await openPage();
  const learner = await openPage(true);
  await teacher.goto(origin);
  await teacher.locator('[data-open=create]').click();
  await teacher.locator('[name=password]').fill('browser-classroom');
  await teacher.locator('.entry-form button[type=submit]').click();
  await teacher.locator('.sf-code').waitFor();
  const code = (await teacher.locator('.sf-code').innerText()).replace(/\s/g,'');
  await teacher.locator('[data-file=bank]').setInputFiles({name:'브라우저검증.txt',mimeType:'text/plain',buffer:Buffer.from(bank)});
  await teacher.getByText(/브라우저검증.txt · 정상 8문항/).waitFor();
  await teacher.locator('[name=mode]').selectOption(mode);
  await teacher.locator('[name=questionCount]').fill('8');
  await teacher.locator('[data-form=settings] button[type=submit]').click();
  await teacher.getByText('수업 설정을 저장했습니다.').waitFor();
  await learner.goto(origin + '/?code=' + code);
  await learner.locator('[name=name]').fill('별사탕');
  await learner.locator('.entry-form button[type=submit]').click();
  await learner.getByText('별사탕님, 입장했습니다').waitFor();
  const students = await Promise.all(Array.from({length:count-1},async(_,i) => {
    const p = new Pupil();
    await p.join(code,'참가자 ' + (i+2)); return p;
  }));
  await wait(async() => await teacher.locator('.sf-roster li').count() === count);
  if (count === 2) {
    await shot(teacher,'teacher-lobby');
    await act(teacher,'bankPreview').click();
    await teacher.getByRole('heading',{name:'교사용 문제 미리보기'}).waitFor();
    await teacher.locator('.sf-dialog[open] button[value=cancel]').click();
  }
  await act(teacher,'start').click();
  await learner.locator('.sf-answer').first().waitFor();
  if (count === 2) {
    await act(teacher,'pause').click();
    await learner.locator('.sf-banner').waitFor();
    assert.equal(await learner.locator('.sf-answer:disabled').count(),4);
    await act(teacher,'resumeGame').click();
    await learner.locator('.sf-banner').waitFor({state:'hidden'});
    await shot(learner,'student-quiz');
  }
  const othersAnswer = Promise.all(students.map(p => p.quiz()));
  for (let i=0;i<8;i++) {
    await learner.locator('.sf-answer').filter({hasText: i===0 ? '보기 하나' : '정답'}).click();
    await learner.locator('.sf-feedback').waitFor();
    await learner.locator('.sf-feedback').waitFor({state:'hidden'});
  }
  await othersAnswer;
  await advance(teacher);
  await learner.getByRole('heading',{name:'나의 공 강화'}).waitFor();
  const othersForge = Promise.all(students.map((p,i)=>p.forge(ids[i%ids.length])));
  if (count === 2) {
    await act(learner,'enhance').click();
    await learner.getByRole('heading',{name:'+1 원형 코어',exact:true}).waitFor();
    await learner.reload();
    await learner.getByRole('heading',{name:'+1 원형 코어',exact:true}).waitFor();
    await teacher.reload();
    await teacher.getByRole('heading',{name:'학급 강화 현황'}).waitFor();
  }
  // A browser path exercises continued enhancement, selection, purchase, and locking.
  let retries = 0;
  while (!(await learner.locator('.sf-ajob').count()) && retries++<15) {
    const enhance = act(learner,'enhance');
    await enhance.click();
    await learner.locator('.sf-fx-label').filter({hasText:/강화/}).waitFor();
    await learner.locator('.sf-fx-label').filter({hasText:/강화/}).waitFor({state:'hidden'});
  }
  if (await learner.locator('.sf-ajob').count()) {
    await learner.locator('[data-action=element][data-value=water]').click();
    await learner.locator('[data-action=chooseClass][data-value=tide]').click();
    await learner.locator('.sf-dialog[open] button[value=ok]').click();
    await learner.getByRole('heading',{name:/해일수호구/}).waitFor();
    const buy = act(learner,'buyShield');
    if (await buy.isEnabled()) await buy.click();
  }
  if (count === 2) await shot(learner,'student-forge');
  await act(learner,'lock').click();
  await learner.locator('.sf-dialog[open] button[value=ok]').click();
  await learner.getByRole('heading',{name:'출전 준비 완료'}).waitFor();
  await othersForge;
  await advance(teacher);
  await advance(teacher);
  const expected = count === 8 ? 4 : 1;
  await wait(async() => await teacher.locator('.sf-arena canvas').count() === expected,20000);
  await learner.locator('.sf-arena canvas').first().waitFor();
  await pause(1600);
  await shot(teacher,count === 8 ? 'teacher-four-duels' : count === 30 ? 'teacher-rumble-30' : 'teacher-duel');
  if (count === 8) {
    await teacher.locator('[data-action=watch]').nth(1).click();
    await wait(async() => await teacher.locator('.sf-arena canvas').count() === 1);
    await act(teacher,'watch').click();
    await wait(async() => await teacher.locator('.sf-arena canvas').count() === 4);
    await act(teacher,'fullscreen').click();
    await teacher.locator('[data-stages]:fullscreen').waitFor();
    await pause(350);
    await shot(teacher,'teacher-four-duels-fullscreen');
    await act(teacher,'fullscreenExit').click();
  }
  if (count===30) await shot(learner,'student-rumble-30');
  if (count===2) {
    await act(learner,'cheer').click();
    await teacher.locator('[data-cheers]').filter({hasText:'별사탕'}).waitFor();
    await teacher.getByRole('heading',{name:'경기 결과',exact:true}).waitFor({timeout:75000});
    await learner.getByRole('heading',{name:'별사탕님의 기록'}).waitFor();
    await shot(learner,'student-results');
    await act(teacher,'rematch').click();
    await teacher.getByRole('heading',{name:'수업 대기실'}).waitFor();
    await teacher.getByText(/브라우저검증.txt · 정상 8문항/).waitFor();
    await learner.getByText('별사탕님, 입장했습니다').waitFor();
  }
  await act(teacher,'close').click();
  await teacher.locator('.sf-dialog[open] button[value=ok]').click();
  await learner.getByRole('heading',{name:'접속 종료'}).waitFor();
  await learner.context().close();
  await teacher.context().close();
  console.log('PASS browser',count,mode,'arenas',expected);
}

try {
  const requested = process.argv.slice(2).map(Number);
  if (!requested.length || process.argv.includes('lesson')) await lessonAndDraw();
  for (const [count,mode] of [[2,'tournament'],[8,'tournament'],[30,'rumble']]) {
    if (!requested.length || requested.includes(count)) {
      try { await scenario(count,mode); }
      catch (error) {
        for (const [i,c] of browser.contexts().entries()) {
          const p = c.pages()[0];
          if (p) await shot(p,'failure-' + count + '-' + i);
        }
        throw error;
      }
    }
  }
  assert.deepEqual(errors,[]);
  console.log('PASS browser console; screenshot directory',artifacts);
} finally {
  for (const p of peers) p.ws.close();
  await browser.close();
  await server.close();
}
