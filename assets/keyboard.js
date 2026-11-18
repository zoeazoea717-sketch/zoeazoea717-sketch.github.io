(() => {
  const screen = document.getElementById('crt-screen');
  const home = document.getElementById('zoea-monitor');
  const archive = document.getElementById('zoea-archive');
  const selectable = 'button:not(:disabled),a[href],input:not(:disabled)';

  function setInput(mode) {
    if (document.documentElement.dataset.input===mode) return;
    document.documentElement.dataset.input = mode;
    document.dispatchEvent(new Event('zoea-input-change'));
  }

  function moveFocus(scope, key) {
    const items = [...scope.querySelectorAll(selectable)].filter(item=>item.tabIndex>=0 && item.getClientRects().length);
    const active = document.activeElement;
    if (!items.includes(active)) {
      const first = scope===home ? home.querySelector('.terminal') : items.find(item=>item.closest('.intro'));
      (first ?? items[0])?.focus();
      return;
    }
    const vertical = key==='ArrowUp' || key==='ArrowDown';
    const sign = key==='ArrowUp' || key==='ArrowLeft' ? -1 : 1;
    const box = active.getBoundingClientRect();
    const axes = vertical ? ['top','bottom','left','right'] : ['left','right','top','bottom'];
    const [start,end,crossStart,crossEnd] = axes;
    const center = (rect,a,b)=>(rect[a]+rect[b])/2;
    let best, bestScore = Infinity;
    for (const item of items) {
      if (item===active) continue;
      const other = item.getBoundingClientRect();
      const forward = sign*(center(other,start,end)-center(box,start,end));
      // Projected controls on the same row can be a few pixels higher or lower.
      if (forward < Math.min(box[end]-box[start],other[end]-other[start])*.45) continue;
      const across = Math.max(0,other[crossStart]-box[crossEnd],box[crossStart]-other[crossEnd]);
      const ahead = Math.max(0,sign>0 ? other[start]-box[end] : box[start]-other[end]);
      const score = ahead + across*3 + .02*Math.abs(center(other,crossStart,crossEnd)-center(box,crossStart,crossEnd));
      if (score<bestScore) { best=item; bestScore=score; }
    }
    if (best) best.focus();
    else if (vertical) window.scrollBy(0,sign*window.innerHeight*.45);
  }

  document.addEventListener('pointerdown',()=>setInput('pointer'),true);
  // Capture the modality before the browser moves focus or activates a control.
  document.addEventListener('keydown',event=>{
    if (!event.isComposing && !event.altKey && !event.metaKey && !event.ctrlKey &&
        ['Tab','Enter',' ','Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) setInput('keyboard');
  },true);
  document.addEventListener('keydown',event=>{
    if (event.defaultPrevented || event.isComposing || event.altKey || event.metaKey || event.ctrlKey || screen.inert) return;
    const key = event.key;
    const dialog = screen.querySelector('dialog[open]');
    const scope = dialog || (home.hidden ? archive : home);
    const active = document.activeElement;
    if (key==='Escape' && !dialog && !event.repeat && scope===archive) {
      const privateToggle = archive.querySelector('[data-group="private"]');
      const file = archive.querySelector('.file-properties:not([hidden])');
      if (file) file.querySelector('.file-action').click();
      else if (privateToggle.getClientRects().length && privateToggle.getAttribute('aria-expanded')==='true') {
        privateToggle.click();
        privateToggle.focus();
      } else archive.querySelector('.wordmark').click();
      event.preventDefault();
      return;
    }
    if (active?.matches('input,textarea,select,[contenteditable="true"]')) return;
    if (key.startsWith('Arrow') && !event.shiftKey) {
      if (dialog?.id==='film-viewer') return;
      event.preventDefault();
      if (!dialog || dialog.querySelectorAll(selectable).length>1) moveFocus(scope,key);
    } else if (!event.repeat && key==='Enter' && scope===home && !scope.contains(active)) {
      event.preventDefault();
      home.querySelector('.terminal').click();
    } else if (!event.repeat && key===' ' && active?.matches('a[href]') && scope.contains(active)) {
      event.preventDefault();
      active.click();
    }
  });
})();
