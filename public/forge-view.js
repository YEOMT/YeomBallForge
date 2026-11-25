import {CLASSES, ELEMENTS} from './packages/content/classes.js';
import {tierOf, nextChance, MAX_LEVEL, SHIELD_COST, wardRequired} from './packages/content/economy.js';
import {getBall, getBallChoices, PATHS} from './packages/content/balls.js';
import {compatibleTraits} from './packages/content/traits.js';
import {packPaths} from './packages/content/packs.js';
import {ballOf, ballCard, combatIdentity, statLine, pathCards, pathLabel, elementMatchup, htmlEsc as esc} from './ball-ui.js';

const button=(action,label,off=false,value='',style='')=>`<button type="button" class="sf-button ${style}" data-action="${action}" data-value="${esc(value)}" ${off?'disabled':''}>${label}</button>`;
const unresolvedHidden=b=>b.hiddenOffer && b.hiddenDecision==null;
export function forgeNeedsChoice(b){return !!(b.pendingChoice || b.pendingTrait || (b.level>=10&&!b.path) || unresolvedHidden(b) || (b.level>=10&&!b.traitId));}
export function forgeReceipt(s){return s.me.pendingForge || s.me.lastForge || null;}
// Preview only legal next-tier forms; no RNG, hidden offer or build mutation.
export function nextTierCandidates(build){
  if(build.level>=MAX_LEVEL)return [];
  const next={...build,level:build.level+1,pendingChoice:true};
  if(next.level<2)return [getBall('core-'+tierOf(next.level))];
  const paths=next.level>=10&&!next.path?packPaths(next.packId||'all'):[next.path];
  return [...new Map(paths.flatMap(path=>getBallChoices({...next,path})).map(ball=>[ball.id,ball])).values()];
}
function preview(build){
  const choices=nextTierCandidates(build);if(!choices.length)return '';
  return `<details class="sf-next-preview"><summary>다음 T${tierOf(build.level+1)} 후보 · ${choices.length}종 미리보기</summary><p class="sf-note">성공 후 선택할 수 있는 현재 팩의 후보입니다. 미발견 히든은 포함하지 않습니다.</p><div class="sf-preview-grid">${choices.map(ball=>`<article><strong>${esc(ball.name)}</strong><small>${esc(ball.hidden?'히든':ball.common?'공용':pathLabel(ball.path))}</small><p>${esc(ball.trigger)}</p><span>${esc(ball.description)}</span></article>`).join('')}</div></details>`;
}
export function renderChoices(s){
  const b=s.me,off=s.busy||s.room.paused||b.locked||b.storageLocked,tier=tierOf(b.level);
  if(b.locked||b.storageLocked)return '';
  if(tier<=10&&!b.path)return `<section class="sf-panel sf-ball-selection"><span class="sf-kicker">PATH · T10</span><h3>성장 방향을 선택하세요</h3><p>공용 공을 골라도 경로는 유지됩니다.</p>${pathCards({disabled:off,paths:packPaths(b.packId||s.room.settings?.packId)})}</section>`;
  if(b.pendingChoice){
    const receipt=forgeReceipt(s),fixed=receipt?.immutableCandidates;
    const pool=fixed?(fixed.byPath?.[b.path]||fixed.balls):receipt?.candidates;
    const choices=getBallChoices(b).filter(ball=>!Array.isArray(pool)||!pool.length||pool.some(p=>(p.id||p)===ball.id));
    const continued=choices.find(ball=>ball.classId===(receipt?.before?.classId||b.classId));
    return `<section class="sf-panel sf-ball-selection"><span class="sf-kicker">T${tier} · FORM</span><h3>새 공의 능력을 골라보세요</h3>${continued?button('chooseBall',`같은 계열 계속 · ${esc(continued.name)}`,off,continued.id):''}<div class="ball-choice-grid">${choices.map(ball=>`<div>${ballCard(ball,{action:'chooseBall',disabled:off})}${button('demo','6초 능력 시연',false,ball.id,'sf-demo-link')}${ball.tier===1?button('awakeningDemo','T1 각성 시연',false,ball.id,'sf-demo-link sf-awakening-demo'):''}</div>`).join('')}</div></section>`;
  }
  if(unresolvedHidden(b)){
    const h=CLASSES[b.hiddenOffer];
    return `<section class="sf-panel sf-hidden"><span class="sf-kicker">HIDDEN DISCOVERY</span><h3>${esc(h?.name||'히든 코어')} 발견</h3><p>${esc(h?.description)}</p><p>한 슬롯의 이번 수업 최초 T10 판정입니다. 초기화해도 다시 추첨하지 않습니다.</p><div class="sf-actions">${button('hidden','히든 수락',off,'yes','sf-primary')}${button('hidden','현재 공 유지',off,'no')}</div></section>`;
  }
  if(tier<=10 && (!b.traitId||b.pendingTrait||s.editTrait))return `<section class="sf-panel sf-traits"><span class="sf-kicker">TACTIC · 1 SLOT</span><h3>전술 특성 하나</h3><p>무료 변경 · 출전 대기 전까지 선택할 수 있습니다.</p><div class="sf-trait-grid">${compatibleTraits(b).map(t=>`<button type="button" class="sf-trait ${b.traitId===t.id?'is-selected':''}" data-action="chooseTrait" data-value="${esc(t.id)}" ${off?'disabled':''}><strong>${esc(t.name)}</strong><span>${esc(t.description)}</span><small>${esc(t.tradeoff||t.cost||'')}</small></button>`).join('')}</div></section>`;
  return '';
}
export function renderForge(s,{ranking=false}={}){
  const b=s.me,tier=tierOf(b.level),ball=ballOf(b),cl=CLASSES[b.classId]||CLASSES.basic;
  const receipt=forgeReceipt(s),pendingReceipt=receipt&&!receipt.acknowledged;
  const need=wardRequired(b.level),missing=Math.max(0,need-(b.shields||0)),protectCost=1+missing*SHIELD_COST;
  const off=s.busy||s.room.paused||b.locked||b.storageLocked||s.room.phase==='RESULTS';
  const draining=s.room.phase==='DRAINING',needs=forgeNeedsChoice(b),fx=s.forgeFx;
  const failure=b.level===0?'T20 유지':b.level<10?`T${tier+1}로 하락`:'이 공을 T20으로 초기화';
  const validTrait=compatibleTraits(b).find(t=>t.id===b.traitId);
  const resetActions=ranking&&!receipt?.success&&receipt?.reset?`<div class="sf-actions sf-recovery-actions">${button('recoverForge','보관 공 선택',s.busy||!s.receiptReady,'store')}${button('recoverForge','문제 풀기',s.busy||!s.receiptReady,'quiz')}${button('recoverForge','이 코어 다시 육성',s.busy||!s.receiptReady,'grow')}</div>`:'';
  const result= pendingReceipt ? `<section class="sf-forge-result ${receipt.success?'sf-success':'sf-fail'} ${receipt.success&&receipt.tier===1?'sf-master-success':receipt.success&&[10,5,3].includes(receipt.tier)?'sf-milestone-success':''} ${s.options?.reduced?'sf-reduced-motion':''}" role="status" data-result-id="${esc(receipt.resultId)}"><span class="sf-kicker">${receipt.success&&receipt.tier===1?'MASTER · T1 COMPLETE':receipt.success?'FORGE SUCCESS':'FORGE RESULT'}</span><h3>${receipt.success?`T${receipt.tier??tier} 강화 성공`:receipt.protected?'유지권 발동 · 티어 유지':`강화 실패 · T${receipt.tier??tier}`}</h3><p>유지권 ${receipt.wardConsumed??receipt.wardsConsumed??0}개 사용 · 강화권 ${b.tickets}장 남음</p>${button('ackForge','결과 확인 · 다음',s.busy||!s.receiptReady,receipt.resultId,'sf-primary')}${!receipt.success&&b.level===0?'<p>보관 공으로 출전하거나 다른 슬롯을 육성할 수 있습니다.</p>'+resetActions:''}</section>` : '';
  return forgeMarkup();
  function forgeMarkup(){return `<div class="sf-stack">${result}${pendingReceipt||fx?'':renderChoices(s)}<div class="sf-grid"><section class="sf-panel sf-forge-core ${fx?.style||''}" style="--sf-ball:${esc(cl.color)}"><span class="sf-kicker">${tier===1?'MASTER CORE':tier<=10?'AWAKENED CORE':'FORGE CORE'}</span><canvas data-emblem width="360" height="240" aria-label="내 공 외형"></canvas><h3><span class="sf-tier">T${tier}</span> ${esc(b.pendingChoice?'새 공 선택 중':ball.name)}</h3><p>${esc(pathLabel(b.path))} 경로 · ${esc(ELEMENTS[b.element]?.name||'무속성')} · 최고 T${tierOf(b.best)}</p>${b.pendingChoice?'<p class="sf-note">최종 공 선택을 마치면 새 티어의 전투 수치를 표시합니다.</p>':statLine(ball,b.level)}<p class="sf-note">공격은 기본 공격 계수입니다. 기술별 계수와 방어 조건은 서로 다릅니다.</p><p>${esc(elementMatchup(b.element))}</p><p>${esc(ball.trigger||cl.trigger)}</p><p class="sf-note">대응법 · ${esc(ball.weakness||cl.weakness)}</p>${validTrait?`<p class="sf-trait-badge">${esc(validTrait.name)}</p>`:''}<div class="sf-actions">${button('demo','능력 시연',false,ball.id)}${tier===1&&!b.pendingChoice?button('awakeningDemo','T1 각성 시연',false,ball.id,'sf-awakening-demo'):''}${tier<=10&&!needs?button('editTrait','특성 변경',off):''}</div>${!b.pendingChoice?`<div class="sf-evolution-detail">${combatIdentity({...ball,tier})}</div>`:''}<strong class="sf-fx-label" aria-live="polite">${esc(fx?.label||'')}</strong></section><section class="sf-panel sf-workbench"><header class="sf-section-heading"><h3>강화 작업대</h3><span>경제 v2.1</span></header><div class="sf-metrics"><div class="sf-stat"><span>강화권</span><strong>${b.tickets||0}</strong></div><div class="sf-stat"><span>유지권</span><strong>${b.shields||0}</strong></div></div>${tier>1?`<div class="sf-target"><span>T${tier} → <b>T${tier-1}</b></span><span>성공률 <b>${nextChance(b.level)}%</b></span></div><p class="sf-risk">무보호 실패: ${failure}</p><p class="sf-note">보유 ${b.shields||0}개 / 이번 보호 ${need}개<br>부족 ${missing}개 구매 ${missing*SHIELD_COST}장 + 강화 1장</p>`:'<h3>최종 T1 완성</h3>'}<div class="sf-column-actions">${button('enhance','무보호 강화 · 1장',off||draining||needs||pendingReceipt||!!fx||b.tickets<1||b.level>=MAX_LEVEL,'','sf-primary')}${need>0?button('protectedEnhance',`보호하고 강화 · ${protectCost}장`,off||draining||needs||pendingReceipt||!!fx||b.tickets<protectCost||b.level>=MAX_LEVEL):''}${button('buyShield','유지권 1개 구매 · 2장',off||draining||b.tickets<2||b.level>=MAX_LEVEL)}${ranking?'':button('lock',`현재 T${tier} 공 출전 확정`,off||pendingReceipt||!!fx,'','sf-lock')}</div>${!pendingReceipt&&!needs?preview(b):''}${needs||pendingReceipt?'<p class="sf-choice-alert">결과 확인과 선택을 마친 뒤 다음 강화를 할 수 있습니다.</p>':''}${b.storageLocked?'<p>보관 잠금 중 · 출전은 가능하며 수정하려면 잠금을 해제하세요.</p>':''}${b.locked?'<p>대기열·경기에 확정된 공입니다. 다른 슬롯과 퀴즈는 사용할 수 있습니다.</p>':''}</section></div></div>`;}
}
