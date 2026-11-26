import {htmlEsc as esc} from './ball-ui.js';
export function featuredMarkup(rows,action='rankWatch'){
  if(!rows?.length)return '';
  return '<section class="sf-featured"><span class="sf-kicker">주목 경기 · 수동 선택</span><div>'+rows.map(x=>'<button type="button" class="sf-button" data-action="'+action+'" data-value="'+esc(x.matchId)+'"><strong>'+esc(x.names.join(' vs '))+'</strong><small>'+esc(x.reasons.join(' · '))+'</small></button>').join('')+'</div></section>';
}
export function highlightButtons(matchId,rows){
  return (rows||[]).map(h=>'<button type="button" class="sf-button" data-action="highlight" data-value="'+esc(JSON.stringify([matchId,h.id]))+'">'+esc(h.label)+' · 원본 구간</button>').join('');
}
