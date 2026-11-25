// Room-wide, versioned candidate pools. Early forms and six common advanced
// profiles stay available; only complete advanced growth paths are enabled.
export const PACK_VERSION='classroom-packs-2.1.0';
const common=Object.freeze(['elastic','beam','chain','idol','berserk','cannon']);
const pack=(id,name,description,paths,profiles)=>Object.freeze({id,name,description,
  paths:Object.freeze(paths),profiles:profiles?Object.freeze(profiles):null,common,version:PACK_VERSION});
export const PACKS=Object.freeze({
  all:pack('all','전체 팩','모든 성장 경로와 구현된 전투 프로필',['fire','water','lightning','earth','nature','blade','space','summon'],null),
  intro:pack('intro','입문 팩','강타·방어·포격을 중심으로 화염·물결·대지 세 경로',['fire','water','earth'],
    ['crimson','ring','reactor','tide','frost','returner','mace','crystal','mason']),
  defense:pack('defense','방어와 반격','물결·대지의 방어·귀환·경로 제어와 공용 공격',['water','earth'],
    ['tide','returner','current','mace','crystal','mason']),
});
export const PACK_LIST=Object.freeze(Object.values(PACKS));
export const getPack=id=>PACKS[id??'all']??null;
export const packPaths=id=>getPack(id)?.paths??[];
export function packAllowsBall(id,ball) {
  const p=getPack(id);if(!p||!ball)return false;
  if(ball.tier>10||ball.hidden)return true;
  if(ball.common)return p.common.includes(ball.classId);
  return p.paths.includes(ball.path)&&(!p.profiles||p.profiles.includes(ball.classId));
}
export function validatePack(id,catalog) {
  const p=getPack(id),errors=[];if(!p)return {ok:false,errors:['알 수 없는 수업 팩입니다.']};
  for(let tier=18;tier>=11;tier--)if(catalog.filter(b=>b.tier===tier&&!b.hidden&&packAllowsBall(id,b)).length<2)errors.push(`T${tier} 후보 2개 필요`);
  for(let tier=10;tier>=1;tier--) {
    const pool=catalog.filter(b=>b.tier===tier&&!b.hidden&&packAllowsBall(id,b));
    if(pool.filter(b=>b.common).length<6)errors.push(`T${tier} 공용 후보 6개 필요`);
    for(const path of p.paths)if(pool.filter(b=>!b.common&&b.path===path).length<3)errors.push(`T${tier} ${path} 후보 3개 필요`);
  }
  return {ok:errors.length===0,errors};
}
