(() => {
  const muteButtons = [...document.querySelectorAll('.crt-mute')];
  const screen = document.getElementById('crt-screen');
  const archive = document.getElementById('zoea-archive');
  const fileViews = new Set([...archive.querySelectorAll('.file-tile')].map(link=>link.hash.slice(1)));
  const preference = 'zoea.crt.muted';
  const sounds = new Map();
  const icon = new Image();
  let muted = false;
  let playing;
  let currentView;
  let navigationKey = '';
  let keyReset;
  let lastCueAt = -Infinity;

  try {
    muted = localStorage.getItem(preference) === 'true';
  } catch {
    // The current tab can still be muted when storage is unavailable.
  }

  function prepare(names) {
    for (const name of names) {
      if (sounds.has(name)) continue;
      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = './assets/audio/'+name+'.wav';
      sounds.set(name,audio);
    }
  }

  function updateMute() {
    const {text} = window.zoeaLocale;
    for (const button of muteButtons) {
      button.setAttribute('aria-pressed',String(muted));
      button.setAttribute('aria-label',text('mute','静音'));
      button.title = muted ? text('enableSound','开启音效') : text('disableSound','关闭音效');
    }
  }

  function play(name) {
    prepare([name]);
    playing?.pause();
    playing = sounds.get(name);
    playing.currentTime = 0;
    playing.play().catch(()=>{});
    lastCueAt = performance.now();
  }

  function refreshIcon() {
    for (const button of muteButtons) {
      button.dispatchEvent(new Event('crt-sound-change',{bubbles:true}));
    }
  }

  // Both views rasterize the same speaker glyph into their CRT signal.
  window.drawCrtSoundIcon = (target,button,x,y,size)=>{
    if (!icon.complete || !icon.naturalWidth) return;
    const tile = icon.naturalHeight;
    const offset = muted ? tile : 0;
    target.save();
    target.globalAlpha = button.matches(':hover,:focus-visible') ? .98 : muted ? .62 : .79;
    target.drawImage(icon,offset,0,tile,tile,x-size/2,y-size/2,size,size);
    target.restore();
    button.closest('[data-crt]').classList.add('crt-sound-ready');
  };
  icon.addEventListener('load',refreshIcon);
  icon.src = './assets/sound-icon.svg';

  const interactionSounds = ['enter','select','return','qq-open','qq-close','focus','expand','collapse','granted','denied','typing'];
  const dossierSounds = new Set(['expand','collapse','select']);
  for (const button of muteButtons) {
    button.addEventListener('click',()=>{
      muted = !muted;
      play(muted ? 'mute' : 'unmute');
      if (!muted) prepare(interactionSounds);
      updateMute();
      refreshIcon();
      try {
        localStorage.setItem(preference,String(muted));
      } catch {
        // Muting still applies for the current tab.
      }
    });
  }

  function playControlCue(event) {
    if (muted || event.defaultPrevented || screen.inert || (!event.isTrusted && !navigationKey)) return;
    const control = event.target.closest('button:not(:disabled),a[href]');
    if (!control || control.matches('.crt-mute,.about-contact,.preview-thumb,[data-dossier-control][aria-haspopup="dialog"],.works-lock [type="submit"]')) return;
    if (control.matches('.dossier-zoom-toggle,.dossier-zoom-reset,[data-zoom-step]')) return;
    if (control.matches('dialog button') && !control.matches('.dossier-film,.dossier-download,.dossier-pagination button,.retry-access,.asset-tabs button,.asset-original')) return;
    if (event.button!==0 && !(event.button===1 && control.matches('a[href]'))) return;
    if (control.matches('.file-tile,.file-action[href^="#projects/"]')) {
      // Opening another tab leaves this tab's route unchanged.
      if (event.button===1 || event.ctrlKey || event.metaKey || event.shiftKey) play('qq-open');
      return;
    }
    if (fileViews.has(currentView) && control.matches('[data-page],[data-category]')) return;
    if (control.matches('.terminal')) play('enter');
    else if (control.matches('.wordmark')) play('return');
    else if (control.matches('.tool-disclosure,.dossier-group-toggle')) play(control.getAttribute('aria-expanded')==='true' ? 'collapse' : 'expand');
    else play('select');
  }
  const focusKeys = new Set(['Tab','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End']);
  window.addEventListener('keydown',event=>{
    if (!event.isTrusted || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
    if (!focusKeys.has(event.key) && !['Enter',' ','Escape'].includes(event.key)) return;
    navigationKey = event.key;
    clearTimeout(keyReset);
    keyReset = setTimeout(()=>{navigationKey='';},0);
  },{capture:true});

  screen.addEventListener('focusin',()=>{
    if (!muted && focusKeys.has(navigationKey) && performance.now()-lastCueAt>=100) play('focus');
  });
  document.addEventListener('zoea-access-result',event=>{
    if (!muted) play(event.detail.ok ? 'granted' : 'denied');
  });
  archive.querySelector('#zoea-works-password').addEventListener('input',event=>{
    if (event.isTrusted && !muted && !screen.inert) play('typing');
  });
  archive.addEventListener('invalid',event=>{
    if (!muted && event.target.matches('#zoea-works-password')) play('denied');
  },{capture:true});
  screen.addEventListener('click',playControlCue,{capture:true});
  screen.addEventListener('auxclick',playControlCue,{capture:true});
  archive.addEventListener('crt-view',event=>{
    const previous = currentView;
    currentView = event.detail;
    if (muted || !previous || previous===currentView) return;
    if (currentView!=='home' && (fileViews.has(previous) || fileViews.has(currentView))) play('qq-open');
    else if (archive.querySelector('#dossier-lightbox[open],#dossier-reader[open]')) play('qq-close');
  },{capture:true});
  archive.addEventListener('crt-dialog-toggle',event=>{
    if (!muted) play(event.detail ? 'qq-open' : 'qq-close');
  });
  // The archive emits its state changes on its own root, including non-bubbling events.
  archive.addEventListener('dossier-action',event=>{
    if (!muted && dossierSounds.has(event.detail)) play(event.detail);
  });
  archive.addEventListener('dossier-entry-dismiss',()=>{
    if (!muted) play('collapse');
  });

  document.addEventListener('zoea-language-change',updateMute);
  updateMute();
  for (const button of muteButtons) button.hidden = false;
  prepare(['mute','unmute']);
  if (!muted) prepare(interactionSounds);
})();
