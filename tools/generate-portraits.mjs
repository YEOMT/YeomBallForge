// Original, code-drawn character portraits. Rebuild with node tools/generate-portraits.mjs.
import {mkdir, writeFile} from 'node:fs/promises';
const out = new URL('../public/assets/balls/', import.meta.url);
await mkdir(out, {recursive:true});
const portraits = [
  ['basic','시작의 공','#dcecff','#5b94ed','ball',''],
  ['crimson','홍련 투사','#ffe4d5','#ef663f','spike','<path d="M27 50 20 31 39 35 35 13 55 29 65 9 75 30 94 17 91 39 108 37 99 58" fill="#ffba49"/><path d="m45 82 12 9 20-6" fill="none"/>'],
  ['ring','화륜 승려','#fff1d0','#e87c28','bun','<circle cx="64" cy="39" r="34" fill="none" stroke="#f3a22c" stroke-width="7"/><circle cx="64" cy="39" r="25" fill="none" stroke="#fff7c7" stroke-width="3"/>'],
  ['tide','파도 마도사','#d9f3ff','#267bb1','bob','<path d="M14 97q24-30 42 0t57 0v31H12Z" fill="#55bfd2"/><path d="M23 97q15-17 29-2" fill="none" stroke="#fff" stroke-width="4"/>'],
  ['cannon','포격 기사','#e0edf5','#4b6b91','robot','<path d="m19 91 23-6 9 27-23 7Z" fill="#839ab8"/><ellipse cx="28" cy="104" rx="10" ry="13" fill="#28354c"/><circle cx="29" cy="104" r="4" fill="#71dcf2"/>'],
  ['bolt','섬광 주자','#fff3bf','#e5b22d','spike','<path d="m95 17-16 27h12l-7 23 24-35H96l9-15Z" fill="#ffe049" stroke="#9d7024"/>'],
  ['magnet','극성 로봇','#ffe1ee','#d76291','robot','<path d="M20 65V35h12v30q0 11 10 11t10-11V35h12v30q0 23-22 23T20 65" fill="#df7194"/><path d="M20 35h12v13H20m32-13h12v13H52" fill="#eaf1ff"/>'],
  ['mace','대지 골렘','#e8e2d4','#89765c','golem','<path d="m86 36 23-5 9 15-9 21-23-4-8-17Z" fill="#ac9c83"/><path d="m94 63-8 35" fill="none" stroke="#564c45" stroke-width="10"/>'],
  ['crystal','수정 여우','#e9e5ff','#8b82d3','fox','<path d="m19 81 8-18 8 18-8 17Zm81-50 7-16 8 17-8 13Z" fill="#d1c5ff"/>'],
  ['thorn','가시 정찰자','#dcf4e4','#4d9061','bob','<path d="M16 112q12-30 9-55m0 21-10-4m12 20 12-8M108 112q-10-27-4-53m-1 20 11-9m-10 28-14-7" fill="none" stroke="#38714b" stroke-width="5"/>'],
  ['seed','새싹 정령','#e7f6d2','#78a64e','spirit','<path d="M64 34q-3-27-30-23 3 26 30 23Zm1 0q-1-29 28-25-1 24-28 25Z" fill="#81b858"/><path d="M64 34v13" stroke="#436e3e" stroke-width="5"/>'],
  ['prism','프리즘 항해자','#e8e8ff','#726ace','visor','<path d="m18 95 10-17 10 17-10 17Zm79-59 7-13 8 13-8 13Z" fill="#78d3d8"/><path d="M36 56h56" stroke="#f6dc83" stroke-width="4"/>'],
  ['gravity','중력 현자','#e9e2f5','#67528a','hood','<ellipse cx="64" cy="23" rx="35" ry="13" fill="none" stroke="#9f77cf" stroke-width="6" transform="rotate(-17 64 23)"/><circle cx="64" cy="23" r="12" fill="#27213e"/>'],
  ['hourglass','시간 수리공','#fff0cc','#ae8b47','goggles','<path d="M90 76h22m-22 34h22M93 77q0 13 8 16-8 4-8 16m16-32q0 13-8 16 8 4 8 16" fill="none" stroke="#9d7839" stroke-width="4"/><path d="m96 105 5-9 5 9Z" fill="#e5b94e" stroke="none"/>'],
  ['blade','월광 검사','#e2eaff','#5f78b7','samurai','<path d="m21 106 66-87 9 1-63 94Z" fill="#d8ecff"/><path d="m16 101 20 15" stroke="#cea454" stroke-width="6"/>'],
  ['trinity','삼도 수호자','#e7edf3','#70849c','spike','<path d="M14 104 34 23l7-6 1 12-17 79Zm95 0L91 24l-7-6-1 12 16 77Z" fill="#f1f6ff"/><path d="M64 8v32" stroke="#c5d3e9" stroke-width="7"/>'],
  ['ninja','잔상 닌자','#e9e3fa','#65529c','ninja','<path d="M39 88Q13 76 8 101q22-2 36 10m47-26q13-5 29-1l-13 12-16 2" fill="#aa7dcd"/>'],
  ['elastic','탄성 모험가','#fff0d8','#c28b46','cap','<path d="M13 95q-1-15 15-13l14 9-2 20-18 4Z" fill="#f2bd94"/><path d="m20 92 12 3m-12 3 11 3m-10 2 10 3" fill="none" stroke="#b37b65" stroke-width="2"/>'],
  ['beam','광선 조종사','#def4fc','#489ebc','visor','<path d="m93 83 26-8v19l-26 7Z" fill="#9bdbea"/><path d="m101 82 27-7v11l-27 6Z" fill="#e9ffff" stroke="#62bfdd"/>'],
  ['frost','빙설 술사','#e2f5ff','#6eacc9','bob','<path d="m35 27 9-16 12 17 8-21 10 22 13-17 7 21Z" fill="#b9e8f8"/><path d="M104 77v28m-12-21 24 14m-24 0 24-14" fill="none" stroke="#7db5d4" stroke-width="4"/>'],
  ['portal','문지기','#ebe5ff','#8171c4','hood','<ellipse cx="29" cy="87" rx="17" ry="28" fill="none" stroke="#b18fe3" stroke-width="8" transform="rotate(20 29 87)"/><ellipse cx="29" cy="87" rx="10" ry="20" fill="none" stroke="#e2d3ff" stroke-width="3" transform="rotate(20 29 87)"/>'],
  ['summoner','그림자 소환사','#ebe8f4','#777083','ninja','<path d="M89 111V93l-5-13 12 6 11-6-2 15 4 16Z" fill="#383043"/><path d="m92 96 4 1m5-1 4-1" stroke="#d3b2ff" stroke-width="3"/>'],
  ['chain','사슬 감시자','#e5ecee','#69818a','visor','<g fill="none" stroke="#8597a5" stroke-width="5"><ellipse cx="19" cy="81" rx="7" ry="11"/><ellipse cx="24" cy="97" rx="7" ry="11" transform="rotate(-25 24 97)"/><ellipse cx="33" cy="111" rx="7" ry="11" transform="rotate(-40 33 111)"/></g>'],
  ['idol','음파 스타','#ffe4f2','#c86eaa','headphones','<path d="m103 70 3 8 9 1-7 6 2 9-8-5-8 5 2-9-6-6 10-1Z" fill="#ffd678"/><path d="M23 101v-18l10-3v16" fill="none" stroke="#aa5c94" stroke-width="4"/><ellipse cx="19" cy="103" rx="6" ry="4" fill="#aa5c94" stroke="none"/>'],
  ['star','별 포식자','#ffe5ec','#dc8baf','star','<path d="m100 18 4 9 10 1-8 7 3 11-9-6-9 6 2-11-8-7 11-1Z" fill="#f8cb6e"/>'],
  ['berserk','격노의 늑대','#ffe4df','#a36061','wolf','<path d="m94 64 18-9-5 19 12 5-16 16" fill="#de7970"/><path d="m22 31 9 14m-18-4 12 12" fill="none" stroke="#cd6b65" stroke-width="4"/>'],
];

function face(kind, color) {
  if(kind==='ball') return '<circle cx="64" cy="69" r="36" fill="#88b7f4"/><ellipse cx="52" cy="54" rx="13" ry="8" fill="#cce1ff" stroke="none"/><path d="M48 72v7m32-7v7m-28 8q12 12 24 0" fill="none" stroke-linecap="round" stroke-width="5"/>';
  if(kind==='robot') return '<path d="M36 40h56l8 17v34L87 106H41L28 91V57Z" fill="#cad5e0"/><path d="M37 55h54v25H37Z" fill="#30485e"/><path d="M44 65h13m15 0h13" stroke="#8fe6eb" stroke-width="5"/><path d="M48 91h32m-16-9v16M64 39V25" fill="none"/><circle cx="64" cy="22" r="5" fill="#ffe190"/>';
  if(kind==='golem') return '<path d="m37 37 39-8 24 24-6 40-30 16-33-18-7-32Z" fill="#b4a48a"/><path d="m36 55 18 4-5 13-15-4m58-13-18 4 5 13 15-4" fill="#f1d67d"/><path d="m45 88 20-5 14 6M58 34l-4 17 13 9-5 13" fill="none"/>';
  if(kind==='fox'||kind==='wolf') return `<path d="M31 61 27 23l27 24h22l27-24-6 40 7 19-40 29-40-29Z" fill="${kind==='fox'?'#c2b4e8':'#b27a7b'}"/><path d="m35 60 29 21 29-21-7 32-22 15-22-15Z" fill="#f8ece7" stroke="none"/><path d="m42 69 12 4m20 0 12-4" stroke-width="5"/><path d="m58 86 6 5 6-5Z" fill="#2e3044"/><path d="M64 91v8" fill="none"/>`;
  if(kind==='spirit') return '<path d="M34 65q-6-25 30-25t30 25q18 17 2 32-9 12-32 10-25 3-34-12-13-14 4-30Z" fill="#b5d887"/><ellipse cx="48" cy="73" rx="4" ry="7" fill="#384d36"/><ellipse cx="80" cy="73" rx="4" ry="7" fill="#384d36"/><path d="m58 89 6 4 6-4" fill="none"/>';
  if(kind==='star') return '<path d="m44 45 20-24 20 24 27 8-12 27 1 27-29-4-26 8-15-24-9-25Z" fill="#efb1cd"/><path d="M49 65v10m30-10v10" stroke-width="6" stroke-linecap="round"/><ellipse cx="64" cy="88" rx="10" ry="8" fill="#824961"/><ellipse cx="39" cy="80" rx="7" ry="4" fill="#e18cab" stroke="none"/><ellipse cx="89" cy="80" rx="7" ry="4" fill="#e18cab" stroke="none"/>';
  let hair = {
    spike:'M30 62 23 44 38 45 33 25 50 33 56 13 67 32 83 19 83 39 102 34 94 63 79 48 64 57 49 46Z',
    bob:'M29 95V52q0-27 35-27t35 27v43l-19-5 8-35-15 7-14-15-17 14 6 30Z',
    bun:'M33 59q-5-30 31-30t31 30L78 48 64 52 50 47Z',
    samurai:'M29 67V48q2-27 36-27 31 0 33 27v18L82 47 64 56 51 45 36 68Z',
    goggles:'M30 60 27 39 42 39 44 24 63 31 80 23 84 40 99 45 92 65 74 51 57 57 45 49Z',
    headphones:'M30 90V52q0-28 34-28t34 28v38L83 80V55L64 63 47 50v31Z',
    cap:'M33 55q1-29 31-29t31 29L78 51 51 57Z',
  }[kind] ?? 'M31 61V48q0-25 33-25t33 25v15L79 48 64 56 48 48Z';
  let result = `<path d="M22 128v-13q6-20 42-20t42 20v13Z" fill="${color}"/><path d="M52 94v11l12 8 12-8V94" fill="#ebbc9e"/><path d="M34 57q0-26 30-26t30 26v19q-4 25-30 28-26-3-30-28Z" fill="#f2c7a6"/>`;
  if(kind==='hood') result += `<path d="M20 111V61q0-42 44-42t44 42v50L86 99 91 65 64 38 37 65l5 34Z" fill="${color}"/>`;
  else result += `<path d="${hair}" fill="${color}"/>`;
  result += '<path d="m43 65 12 3m18 0 12-3" fill="none" stroke-width="3"/><path d="M49 72v5m30-5v5" stroke-width="5" stroke-linecap="round"/><path d="m57 89 7 3 7-3" fill="none" stroke-width="2.5"/>';
  if(kind==='bun') result += `<circle cx="64" cy="23" r="12" fill="${color}"/><path d="M40 57h48" stroke="#e6bc67" stroke-width="6"/>`;
  if(kind==='ninja') result += `<path d="M31 51h66v12H31Z" fill="#e5dfef"/><path d="M34 80 64 85 94 80v13l-30 12-30-12Z" fill="${color}"/><path d="m59 57 5-4 5 4-5 4Z" fill="#aaa0c7"/>`;
  if(kind==='visor') result += '<path d="M34 57h60v23L64 85 34 80Z" fill="#345269"/><path d="m43 63 39 3-4 7-35-3Z" fill="#a0e1ed" stroke="none"/>';
  if(kind==='goggles') result += '<path d="M32 57h64" stroke="#66574f" stroke-width="7"/><circle cx="48" cy="56" r="12" fill="#dfba67"/><circle cx="80" cy="56" r="12" fill="#dfba67"/><circle cx="48" cy="56" r="7" fill="#9ac3c8"/><circle cx="80" cy="56" r="7" fill="#9ac3c8"/>';
  if(kind==='headphones') result += '<path d="M28 66V52q0-31 36-31t36 31v14" fill="none" stroke="#4c4665" stroke-width="8"/><rect x="23" y="58" width="14" height="24" rx="6" fill="#f7d3e7"/><rect x="91" y="58" width="14" height="24" rx="6" fill="#f7d3e7"/>';
  if(kind==='cap') result += '<path d="M34 45q2-22 30-22t30 22v8H34Z" fill="#edca81"/><path d="M21 52q43-11 86 0l-4 8q-40-7-79 0Z" fill="#f2dca0"/><path d="M36 44h56" stroke="#ae6d58" stroke-width="6"/>';
  return result;
}
for(const [id,name,bg,color,kind,extra] of portraits) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img"><title>${name}</title><desc>Yeom Ball Forge original character portrait</desc><defs><clipPath id="frame"><circle cx="64" cy="64" r="62"/></clipPath></defs><g clip-path="url(#frame)" stroke="#2e3044" stroke-width="2.5" stroke-linejoin="round"><path fill="${bg}" stroke="none" d="M0 0h128v128H0z"/><circle cx="70" cy="61" r="43" fill="#ffffff" opacity=".5" stroke="none"/>${face(kind,color)}${extra}</g><circle cx="64" cy="64" r="62" fill="none" stroke="${color}" stroke-width="3"/></svg>\n`;
  await writeFile(new URL(id+'.svg',out), svg);
}
console.log(`Created ${portraits.length} original ball portraits.`);
