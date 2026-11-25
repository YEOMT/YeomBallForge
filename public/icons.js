const shapes = {
  settings:'<path d="m9 3 1-1h4l1 2 3 1 2-1 2 4-2 2v4l2 2-2 4-3-1-2 1-1 2h-4l-1-2-3-1-2 1-2-4 2-2v-4L2 8l2-4 3 1z"/><circle cx="12" cy="12" r="3.3"/>',
  users:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m1 3a5 5 0 0 1 4 5"/>',
  bolt:'<path d="m14 2-11 12h8l-1 8L21 9h-8z"/>',
  book:'<path d="M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2zm9 2v15"/>',
  gamepad:'<path d="M7 7h10c3 0 4 3 5 9 .5 4-2 5-4 3l-3-3H9l-3 3c-2 2-5 1-4-3 1-6 2-9 5-9Z"/><path d="M6 11v4m-2-2h4m7-1h.01m3 2h.01"/>',
  screen:'<rect x="2" y="3" width="20" height="14" rx="1.5"/><path d="M8 21h8m-4-4v4m-5-10 3-3 3 2 4-4"/>',
  enter:'<path d="M13 4h7v16h-7M3 12h12m-4-4 4 4-4 4"/>',
  plus:'<path d="M12 4v16M4 12h16"/>',close:'<path d="m5 5 14 14M19 5 5 19"/>',
  bracket:'<path d="M2 3h4v5H2m0 8h4v5H2M6 5h5v14H6m5-7h7"/><circle cx="20" cy="12" r="2"/>',
  rumble:'<circle cx="12" cy="5" r="3"/><circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/><path d="m7 9-2 3m9-3 3 3m-9 5h6"/>',
  trophy:'<path d="M7 3h10v5c0 4-2 6-5 6s-5-2-5-6zm0 2H3v3a4 4 0 0 0 5 4m9-7h4v3a4 4 0 0 1-5 4m-4 2v5m-4 2h8"/>',
  external:'<path d="M14 3h7v7m0-7L10 14m0-10H4v16h16v-6"/>'
};
export function fillIcons(root=document) {
  for(const node of root.querySelectorAll('[data-icon]')) {
    if(!node.childElementCount && shapes[node.dataset.icon]) node.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+shapes[node.dataset.icon]+'</svg>';
  }
}
