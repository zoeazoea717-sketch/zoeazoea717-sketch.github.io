(() => {
  const muteButtons = [...document.querySelectorAll('.crt-mute')];
  const screen = document.getElementById('crt-screen');
  const preference = 'zoea.crt.muted';
  const sounds = new Map();
  const icon = new Image();
  let muted = false;
  let playing;

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

  const interactionSounds = ['enter','select','return','qq-open','qq-close'];
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
    if (muted || event.defaultPrevented || !event.isTrusted || screen.inert) return;
    const control = event.target.closest('button:not(:disabled),a[href]');
    if (!control || control.matches('.crt-mute,.about-contact,#zoea-qq button')) return;
    if (event.button!==0 && !(event.button===1 && control.matches('a[href]'))) return;
    if (control.matches('.terminal')) play('enter');
    else if (control.matches('.wordmark')) play('return');
    else play('select');
  }
  screen.addEventListener('click',playControlCue,{capture:true});
  screen.addEventListener('auxclick',playControlCue,{capture:true});
  screen.addEventListener('crt-qq-toggle',event=>{
    if (!muted) play(event.detail ? 'qq-open' : 'qq-close');
  });

  document.addEventListener('zoea-language-change',updateMute);
  updateMute();
  for (const button of muteButtons) button.hidden = false;
  prepare(['mute','unmute']);
  if (!muted) prepare(interactionSounds);
})();
