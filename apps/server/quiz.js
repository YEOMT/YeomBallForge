import { randomInt, randomUUID } from 'node:crypto';
import { ensure } from '../../packages/protocol/index.js';

const sample = `삼각형의 세 내각의 합은 몇 도일까요?|180도|90도|270도|360도
1시간 30분은 몇 분일까요?|90분|60분|100분|130분
8과 12의 최대공약수는 무엇일까요?|4|2|6|24
다음 중 소수는 무엇일까요?|7|1|9|15
0.25를 분수로 바르게 나타낸 것은 무엇일까요?|1/4|1/2|2/5|3/4
한 변이 5cm인 정사각형의 둘레는 얼마일까요?|20cm|10cm|15cm|25cm
한글을 창제한 조선의 왕은 누구일까요?|세종|태조|정조|광해군
지구에서 가장 가까운 별은 무엇일까요?|태양|북극성|시리우스|베가
달이 스스로 빛나는 것처럼 보이는 이유는 무엇일까요?|태양빛을 반사해서|표면이 타서|핵융합을 해서|지구가 가려서
물의 세 가지 상태 중 수증기는 무엇일까요?|기체|액체|고체|결정
식물이 광합성에 이용하는 기체는 무엇일까요?|이산화탄소|산소|헬륨|네온
전기 회로에서 전류가 흐르려면 무엇이 필요할까요?|닫힌 회로|끊어진 전선|열린 스위치|절연 장갑
소리가 전해지려면 무엇이 필요할까요?|공기 같은 물질|진공|빛|자기장
계절이 바뀌는 현상과 가장 관련이 깊은 것은 무엇일까요?|기울어진 지구 자전축과 공전|달의 자전|바다의 파도|자석의 극
우리 몸에서 혈액을 온몸으로 보내는 기관은 무엇일까요?|심장|위|폐|간
지도에서 실제 거리를 줄인 비율은 무엇일까요?|축척|방위|위도|등고선
동쪽의 반대 방향은 어디일까요?|서쪽|북쪽|남쪽|북동쪽
되풀이해서 실행하는 컴퓨터 명령 구조는 무엇일까요?|반복|분기|저장|입력
자료를 크기순으로 나열하는 과정은 무엇일까요?|정렬|암호화|압축|복원
인터넷에서 개인정보를 지키는 행동은 무엇일까요?|서비스마다 다른 비밀번호 사용|비밀번호를 게시판에 올리기|인증 코드를 친구에게 보내기|출처 모를 파일 열기`;

export function shuffle(items, draw = randomInt) {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i--) {
    const j = draw(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
export function parseBank(text, filename = '예시 문제은행') {
  ensure(typeof text === 'string' && Buffer.byteLength(text) <= 100_000, '문제은행 크기는 100 KB 이하여야 합니다.');
  const errors = [], items = [], seen = new Set();
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n?|\n/);
  ensure(lines.length <= 1500, '문제 파일은 1,500줄 이하여야 합니다.');
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    const fields = line.split('|').map(field => field.trim());
    const [question, ...answers] = fields;
    let message;
    if (fields.length !== 5) message = '문제와 보기 4개를 |로 구분하세요.';
    else if (fields.some(field => !field || field.length > 500)) message = '각 칸에 1~500자의 내용을 입력하세요.';
    else if (new Set(answers).size !== 4) message = '보기가 중복됩니다.';
    else if (seen.has(question)) message = '문제가 중복됩니다.';
    if (message) errors.push({ line: index + 1, message });
    else {
      seen.add(question);
      items.push({ id: randomUUID(), text: question, answers: answers.map(text => ({ id: randomUUID(), text })) });
    }
  });
  return { filename: String(filename).slice(0, 120), count: items.length, errors, items };
}
const explanations = [
  '삼각형의 세 내각을 한 점에 모으면 평각인 180도가 됩니다.',
  '1시간은 60분이므로 60분에 30분을 더합니다.',
  '8과 12의 공약수는 1, 2, 4이며 그중 가장 큰 수는 4입니다.',
  '소수는 1보다 크고 약수가 1과 자기 자신뿐인 자연수입니다.',
  '0.25는 25/100이고 분자와 분모를 25로 나누면 1/4입니다.',
  '정사각형은 네 변의 길이가 같으므로 5cm를 네 번 더합니다.',
  '세종은 백성이 쉽게 배울 수 있는 글자인 훈민정음을 창제했습니다.',
  '태양은 지구가 공전하는 태양계의 중심별입니다.',
  '달에 닿은 태양빛이 반사되어 지구에 있는 우리 눈에 도달합니다.',
  '물이 기체 상태로 변하면 수증기라고 부릅니다.',
  '식물은 광합성으로 이산화탄소와 물을 이용해 양분을 만듭니다.',
  '전류가 흐르려면 전지와 전기 기구 사이에 끊어지지 않은 길이 있어야 합니다.',
  '소리는 물질의 진동으로 전달되므로 진공에서는 전해지지 않습니다.',
  '기울어진 자전축을 유지하며 공전하기 때문에 계절마다 햇빛의 입사각이 달라집니다.',
  '심장이 수축하고 이완하면서 혈액을 순환시킵니다.',
  '축척은 지도 위 거리와 실제 거리 사이의 비율입니다.',
  '동서남북에서 동쪽과 서쪽은 서로 마주 보는 방향입니다.',
  '반복 구조는 조건이나 정해진 횟수에 따라 명령을 다시 실행합니다.',
  '정렬은 정해진 기준에 따라 자료의 순서를 바꾸는 작업입니다.',
  '비밀번호를 구분하면 한 서비스의 비밀번호가 알려져도 다른 계정을 보호할 수 있습니다.',
];
export function defaultBank() {
  const bank = parseBank(sample);
  bank.items.forEach((q, i) => { q.explanation = explanations[i]; });
  return bank;
}
export function bankPreview(bank, offset = 0) {
  return { filename: bank.filename, count: bank.count, errors: bank.errors,
    preview: bank.items.slice(offset, offset + 20).map(q => ({ text: q.text, answers: q.answers.map(a => a.text), correctText: q.answers[0].text })) };
}
export function assignQuestions(items) {
  return shuffle(items).map(q => ({ id: q.id, attemptId: randomUUID(), text: q.text,
    answers: shuffle(q.answers), correctAnswer: q.answers[0], explanation: q.explanation }));
}
export function publicQuestion(q) {
  if (!q) return null;
  return { id: q.id, attemptId: q.attemptId, text: q.text, answers: q.answers };
}
