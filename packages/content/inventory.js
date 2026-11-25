import {BASE_TICKETS} from './economy.js';
import {initialBuild, resetBuild, buildReady} from './forge.js';
import {ensure} from '../protocol/index.js';

export const INVENTORY_SLOTS = 3;
const slotIndex = value => Number.isInteger(value) && value >= 0 && value < INVENTORY_SLOTS;
function slot(inv, slotId) {
  ensure(slotIndex(slotId), '공 슬롯을 선택하세요.');
  ensure(inv.slots[slotId], '비어 있는 슬롯입니다.');
  return inv.slots[slotId];
}
function freshBall(inv, slotId) {
  const ball = {...initialBuild(), instanceId:`${inv.prefix}-${slotId}-${inv.generations[slotId]}`,
    slotId, generation:inv.generations[slotId], revision:0,
    awakeningRolled:inv.hiddenLedger[slotId] === true, packId:inv.packId || 'all', traitsEnabled:inv.traitsEnabled !== false};
  // Only the inventory owns spendable currency. Copies borrow the wallet when
  // entering the shared forge and return it atomically in mutateBall.
  delete ball.tickets; delete ball.shields; delete ball.funded;
  return ball;
}
export function createInventory(prefix = 'ball') {
  const inv = {prefix:String(prefix), slots:[null,null,null], selectedSlotId:0,
    tickets:0, shields:0, funded:false, hiddenLedger:[false,false,false], generations:[0,0,0]};
  inv.slots[0] = freshBall(inv, 0);
  return inv;
}
export const initialInventory = createInventory;
export function fundInventory(inv) {
  if (!inv.funded) {inv.tickets = BASE_TICKETS; inv.funded = true;}
  return inv.tickets;
}
export function inventoryBuild(inv, slotId = inv.selectedSlotId) {
  const ball = slot(inv, slotId);
  return {...structuredClone(ball), tickets:inv.tickets, shields:inv.shields, funded:inv.funded,
    awakeningRolled:Boolean(ball.awakeningRolled || inv.hiddenLedger[slotId])};
}
export function mutateBall(inv, slotId, transition) {
  const current = slot(inv, slotId);
  ensure(typeof transition === 'function', '공 변경 함수를 확인하세요.');
  const next = inventoryBuild(inv, slotId);
  const result = transition(next);
  ensure(!result || typeof result.then !== 'function', '공 변경은 동기적으로 처리해야 합니다.');
  ensure(Number.isSafeInteger(next.tickets) && next.tickets >= 0 && Number.isSafeInteger(next.shields) && next.shields >= 0, '지갑 잔액을 확인하세요.');
  ensure(next.instanceId === current.instanceId && next.slotId === slotId, '공 식별자가 일치하지 않습니다.');
  const tickets = next.tickets, shields = next.shields;
  delete next.tickets; delete next.shields; delete next.funded;
  next.revision = current.revision + 1;
  inv.tickets = tickets; inv.shields = shields;
  inv.hiddenLedger[slotId] ||= Boolean(next.awakeningRolled);
  next.awakeningRolled ||= inv.hiddenLedger[slotId];
  inv.slots[slotId] = next;
  return result;
}
export function createBall(inv, slotId) {
  ensure(slotIndex(slotId) && inv.slots[slotId] === null, '비어 있는 공 슬롯을 선택하세요.');
  inv.generations[slotId]++;
  inv.slots[slotId] = freshBall(inv, slotId);
  return inv.slots[slotId];
}
export function resetInventoryBall(inv, slotId) {
  mutateBall(inv, slotId, resetBuild);
  return inv.slots[slotId];
}
export function deleteBall(inv, slotId) {
  const ball = slot(inv, slotId);
  ensure(!ball.locked && !ball.storageLocked, '출전 또는 보관 잠금을 먼저 해제하세요.');
  inv.hiddenLedger[slotId] ||= Boolean(ball.awakeningRolled);
  inv.slots[slotId] = null;
  if (inv.selectedSlotId === slotId) inv.selectedSlotId = inv.slots.findIndex(Boolean);
}
export function setStorageLock(inv, slotId, enabled) {
  const ball = slot(inv, slotId);
  ensure(typeof enabled === 'boolean' && !ball.locked, '대기열 또는 경기 중인 공의 잠금을 바꿀 수 없습니다.');
  ensure(!enabled || buildReady(ball), '경로·공·특성 선택을 마친 뒤 보관하세요.');
  ball.storageLocked = enabled; ball.revision++;
}
export function selectBall(inv, slotId) {
  slot(inv, slotId); inv.selectedSlotId = slotId;
}
export function freezeBattleBuild(inv, slotId = inv.selectedSlotId) {
  const ball = slot(inv, slotId);
  ensure(!ball.locked && buildReady(ball), '출전 공의 선택을 완료하세요.');
  ball.locked = true; ball.revision++;
  // The caller keeps this independent snapshot until settlement/cancel. Stored
  // balls may enter battle; storage lock still prevents future forge changes.
  return structuredClone(ball);
}
export function releaseBattleBuild(inv, slotId, instanceId) {
  const ball = slot(inv, slotId);
  ensure(ball.instanceId === instanceId, '출전 공이 변경됐습니다.');
  ball.locked = false; ball.revision++;
}
