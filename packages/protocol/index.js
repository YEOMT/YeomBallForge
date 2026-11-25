export const PROTOCOL_VERSION = 1;
export const DEFAULTS = Object.freeze({ mode: 'combined', questionCount: 20, quizSeconds: 120, forgeSeconds: 120 });
export const MAX_STUDENTS = 30;
export const MAX_PAYLOAD = 128 * 1024;
export const EMOJI = Object.freeze(['🔥', '👏', '⚡', '💫']);
export const PHASES = Object.freeze(['LOBBY', 'QUIZ', 'FORGE', 'LOCKED', 'BATTLE', 'RESULTS']);
export function ensure(condition, message) {
  if (!condition) throw new Error(message);
}
export function checkEnvelope(packet) {
  ensure(packet && typeof packet === 'object' && !Array.isArray(packet), '요청 형식을 확인하세요.');
  ensure(typeof packet.type === 'string' && packet.type.length <= 24, '명령 이름이 올바르지 않습니다.');
  ensure(typeof packet.commandId === 'string' && /^[a-zA-Z0-9._:-]{1,96}$/.test(packet.commandId), '명령 번호가 올바르지 않습니다.');
  ensure(packet.version === undefined || packet.version === PROTOCOL_VERSION, '게임 창을 새로고침해 버전을 맞춰 주세요.');
}
