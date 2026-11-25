import { randomUUID } from 'node:crypto';
import { ensure } from '../../packages/protocol/index.js';
import { tierOf } from '../../packages/content/economy.js';
import { enhance, buyShield, toggleShield, chooseClass, choosePath, chooseBall, resolveHidden, chooseTrait, buildReady, lockBuild } from './forge.js';

export const FORGE_COMMANDS = new Set(['enhance','buyShield','shield','chooseClass','choosePath','chooseBall','hidden','chooseTrait','ackForge','lock']);
export const CHOICE_COMMANDS = new Set(['ackForge','chooseClass','choosePath','chooseBall','hidden','chooseTrait']);
const shape = b => ({level:b.level,tier:tierOf(b.level),ballId:b.ballId,classId:b.classId,path:b.path,element:b.element,traitId:b.traitId??null});

// Runs on a cloned build (or the legacy room's synchronous transaction). A
// receipt belongs to one command/result, not to a reconnect or animation.
export function forgeAction(build, msg, now, {allowNew=true} = {}) {
  ensure(!build.locked && !build.storageLocked, '현재 공을 변경할 수 없습니다. 출전·보관 잠금을 확인하세요.');
  const receipt=build.lastForge;
  if (!allowNew) {
    ensure(CHOICE_COMMANDS.has(msg.type) && receipt && msg.resultId===receipt.resultId, '종료 정리 중에는 승인된 결과의 선택만 마칠 수 있습니다.');
    const hiddenPending=Boolean(build.hiddenOffer && build.hiddenDecision===null);
    const remaining={
      ackForge:!receipt.acknowledged,
      choosePath:build.pendingChoice&&!build.path,
      chooseClass:build.pendingChoice&&!build.classChosen,
      chooseBall:build.pendingChoice,
      hidden:!build.pendingChoice&&hiddenPending,
      chooseTrait:build.pendingTrait&&!build.pendingChoice&&!hiddenPending,
    };
    ensure(remaining[msg.type], '종료 정리 중에는 아직 남은 선택만 마칠 수 있습니다.');
  }
  if (msg.type==='ackForge') {
    ensure(receipt && msg.resultId===receipt.resultId,'확인할 강화 결과가 없습니다.');
    ensure(now-receipt.createdAt>=300,'강화 결과를 확인한 뒤 계속하세요.');
    receipt.acknowledged=true;
    return {resultId:receipt.resultId,acknowledged:true};
  }
  if (CHOICE_COMMANDS.has(msg.type) && receipt) {
    ensure(receipt.acknowledged && msg.resultId===receipt.resultId,'강화 결과를 먼저 확인하세요.');
  }
  switch(msg.type) {
    case 'enhance': {
      ensure(!receipt || receipt.acknowledged,'강화 결과를 먼저 확인하세요.');
      const before=shape(build);
      const result=enhance(build,undefined,undefined,{protect:msg.protect,buyMissing:msg.buyMissing});
      const record={...result,commandId:msg.commandId,resultId:randomUUID(),before,after:shape(build),
        createdAt:now,acknowledged:false,walletAfter:{tickets:build.tickets,shields:build.shields}};
      build.lastForge=structuredClone(record);
      return record;
    }
    case 'buyShield': buyShield(build); break;
    case 'shield': toggleShield(build,msg.enabled); break;
    case 'chooseClass': chooseClass(build,msg.classId); break;
    case 'choosePath': choosePath(build,msg.pathId); break;
    case 'chooseBall': chooseBall(build,msg.ballId); break;
    case 'hidden': resolveHidden(build,msg.accept); break;
    case 'chooseTrait': chooseTrait(build,msg.traitId); break;
    case 'lock':
      ensure((!receipt || receipt.acknowledged) && buildReady(build),'공과 특성 선택을 먼저 마치세요.');
      lockBuild(build); break;
    default: throw new Error('알 수 없는 강화 명령입니다.');
  }
  return {resultId:receipt?.resultId??null,ready:buildReady(build),walletAfter:{tickets:build.tickets,shields:build.shields}};
}

export function publicBuild(build) {
  if(!build)return null;
  const {awakeningRolled,hiddenOffer,...visible}=structuredClone(build);
  visible.hiddenOffer=build.classChosen && !build.pendingChoice && build.hiddenDecision===null?hiddenOffer:null;
  visible.tier=tierOf(build.level);
  return visible;
}
