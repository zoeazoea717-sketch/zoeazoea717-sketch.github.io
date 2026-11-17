(() => {
  const background = document.getElementById('crt-backplane');
  const streamLayer = document.getElementById('crt-streams');
  const glass = document.getElementById('crt-screen');
  const home = document.getElementById('zoea-monitor');
  const archive = document.getElementById('zoea-archive');
  const geometry = window.crtGeometry;
  const fileTiles = new Map([...archive.querySelectorAll('.file-tile')].map(tile=>[tile.hash.slice(1),tile]));
  const projectRoutes = new Set(['projects','projects/works','projects/tools',...fileTiles.keys()]);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const ctx = background.getContext('2d');
  const flowCtx = streamLayer.getContext('2d');
  const field = document.createElement('canvas');
  const fieldCtx = field.getContext('2d');
  const dots = [], streams = [];
  let cellPitch = 5.5;
  let width = 0, height = 0, scale = 1, bend = 1;
  let lastPaint = -Infinity;
  let frame = 0, current, requestedView, revision = 0, effect;
  let poweringOff = false;
  let duration = 1;
  let entryStart = null, entryFrame = 0;
  const entryHandoff = 182, entryInteractive = 405, entryEnd = 460;
  home.crtEntryTime = archive.crtEntryTime = now => entryStart === null ? -1 : now-entryStart;
  const screenPower = () => {
    if (!effect || effect.playState==='finished') return poweringOff ? 0 : 1;
    const progress = Math.min(1,Math.max(0,(effect.currentTime ?? 0)/duration));
    return poweringOff ? 1-progress**1.7 : 1-(1-progress)**2.6;
  };
  home.crtPower = archive.crtPower = screenPower;
  const noise = (x,y) => {
    const value = Math.sin(x*127.1+y*311.7)*43758.5453;
    return value-Math.floor(value);
  };

  function project(x,y) {
    const nx = 2*x/width-1, ny = 2*y/height-1;
    return [
      x-(.044*ny*ny+.022*nx*nx-.04)*nx*width/2*bend,
      y-(.061*nx*nx+.018*ny*ny-.04)*ny*height/2*bend
    ];
  }

  function resize() {
    width = background.clientWidth;
    height = background.clientHeight;
    bend = geometry.bend;
    scale = Math.min(devicePixelRatio || 1,2);
    field.width = streamLayer.width = background.width = Math.round(width*scale);
    field.height = streamLayer.height = background.height = Math.round(height*scale);
    fieldCtx.scale(scale,scale);
    ctx.setTransform(scale,0,0,scale,0,0);
    flowCtx.setTransform(scale,0,0,scale,0,0);
    lastPaint = -Infinity;
    const pitch = width<420 ? 4 : 5.5;
    cellPitch = pitch;
    fieldCtx.font = '700 '+pitch*1.37+'px Consolas, monospace';
    fieldCtx.textAlign = 'center';
    fieldCtx.textBaseline = 'middle';
    dots.length = 0;
    streams.length = 0;
    // Reserve channels for the moving layer before placing the fixed phosphors.
    const columnStep = pitch*10, rowStep = pitch*15;
    const columnOffset = columnStep*.47, rowOffset = rowStep*.53;
    const channelWidth = pitch*.59;
    function inChannel(position,step,offset) {
      return Math.abs(position-offset-Math.round((position-offset)/step)*step)<channelWidth;
    }
    for (let y=pitch*.5;y<height;y+=pitch*1.15) {
      for (let x=pitch*.5;x<width;x+=pitch) {
        if (inChannel(x,columnStep,columnOffset) || inChannel(y,rowStep,rowOffset)) continue;
        const seed = noise(x,y);
        const light = .023+.039*Math.exp(-((y/height-.78)**2)/.15)+(seed-.5)*.10;
        const index = Math.round(light*12);
        if (index<1) continue;
        const [px,py] = project(x,y);
        fieldCtx.fillStyle = 'rgba(249,152,70,'+(.24+light*1.4)+')';
        fieldCtx.fillText(index===1 ? '.' : ':',px,py);
        if (seed>.83 && noise(x+11,y+59)>.64) dots.push([px,py,seed]);
      }
    }
    for (const vertical of [true,false]) {
      const step = vertical ? columnStep : rowStep;
      const offset = vertical ? columnOffset : rowOffset;
      const cross = vertical ? width : height;
      for (let lane=offset;lane<cross;lane+=step) {
        const seed = noise(lane/step,vertical ? 41 : 73);
        streams.push({
          vertical, lane, seed,
          speed:(vertical ? 31 : 43)+seed*32,
          length:12+Math.floor(seed*17)
        });
      }
    }
    schedule();
  }

  function draw(now) {
    frame = 0;
    if (!reduced.matches && now-lastPaint<32) {
      schedule();
      return;
    }
    lastPaint = now;
    ctx.clearRect(0,0,width,height);
    ctx.drawImage(field,0,0,width,height);
    flowCtx.clearRect(0,0,width,height);
    if (reduced.matches) return;
    const t = now/1000;
    ctx.fillStyle = '#ffc17b';
    for (const [x,y,seed] of dots) {
      const beat = .5+.5*Math.sin(t*(.8+noise(x,y)*2.6)+seed*97+x*.13);
      ctx.globalAlpha = .05+.66*beat**3;
      ctx.fillRect(x-.74,y-.62,1.48,1.24);
    }
    ctx.globalAlpha = 1;
    const symbols = '01235+:.';
    flowCtx.fillStyle = '#ffbd7b';
    flowCtx.font = '700 '+cellPitch*1.28+'px Consolas, monospace';
    flowCtx.textAlign = 'center';
    flowCtx.textBaseline = 'middle';
    for (const {vertical,lane,seed,speed,length} of streams) {
      const span = vertical ? height : width;
      const spacing = cellPitch*(vertical ? 1.16 : 1);
      const trail = length*spacing;
      const head = (seed*(span+trail)+t*speed)%(span+trail);
      for (let i=0;i<length;i++) {
        const position = head-i*spacing;
        if (position<0 || position>span) continue;
        const [px,py] = vertical ? project(lane,position) : project(position,lane);
        const index = Math.floor(noise(Math.floor(position/spacing),lane)*symbols.length);
        flowCtx.globalAlpha = (1-i/length)**1.72*(i===0 ? .78 : .38+seed*.20);
        flowCtx.fillText(symbols[index],px,py);
      }
    }
    flowCtx.globalAlpha = 1;
    schedule();
  }

  function schedule() {
    if (!frame && !document.hidden) frame = requestAnimationFrame(draw);
  }
  new ResizeObserver(resize).observe(background);
  geometry.compactTouch.addEventListener('change',resize);
  document.addEventListener('visibilitychange',schedule);
  reduced.addEventListener('change',schedule);

  function cancelTransition() {
    revision++;
    cancelAnimationFrame(entryFrame);
    entryFrame = 0;
    entryStart = null;
    effect?.cancel();
    effect = null;
    poweringOff = false;
    glass.inert = false;
    glass.classList.remove('crt-powering');
  }

  function enterArchive(change, focus) {
    entryStart = performance.now();
    glass.inert = true;
    let handedOff = false, interactive = false;
    function advance(now) {
      const time = now-entryStart;
      if (!handedOff && (time>=entryHandoff || reduced.matches)) {
        handedOff = true;
        change();
        archive.crtLive.present(now);
      }
      if (!interactive && (time>=entryInteractive || reduced.matches)) {
        interactive = true;
        glass.inert = false;
        focus();
      }
      if (time>=entryEnd || reduced.matches) {
        entryStart = null;
        entryFrame = 0;
        return;
      }
      entryFrame = requestAnimationFrame(advance);
    }
    entryFrame = requestAnimationFrame(advance);
  }

  function powerCycle(change,close) {
    const ticket = revision;
    function animate(on) {
      poweringOff = !on;
      duration = on ? 420 : 330;
      const view = current==='home' ? home : archive;
      const live = view.classList.contains('crt-live-ready');
      const full = {opacity:1,clipPath:'inset(0)'};
      const beam = {opacity:.94,clipPath:live ? 'inset(0)' : 'inset(49% 10% 49% 10%)'};
      const dot = {opacity:0,clipPath:live ? 'inset(0)' : 'inset(49.7% 49% 49.7% 49%)'};
      glass.classList.add('crt-powering');
      return glass.animate(on ? [dot,{...beam,offset:.32},full] : [full,{...beam,offset:.78},dot],
        {duration,fill:on ? 'none' : 'forwards'});
    }
    async function cycle() {
      if (close && !reduced.matches) {
        glass.inert = true;
        effect = animate(false);
        try { await effect.finished; } catch { return; }
      }
      if (ticket!==revision) return;
      change();
      glass.inert = false;
      effect?.cancel();
      if (!reduced.matches) {
        effect = animate(true);
        effect.finished.then(()=>{
          if (ticket===revision) glass.classList.remove('crt-powering');
        },()=>{});
        if (!close) {
          background.animate([{opacity:0},{opacity:.28,offset:.26},{opacity:1}],
            {duration:430,easing:'ease-out'});
          streamLayer.animate([{opacity:0},{opacity:.28,offset:.26},{opacity:1}],
            {duration:430,easing:'ease-out'});
        }
      } else {
        poweringOff = false;
        glass.classList.remove('crt-powering');
      }
    }
    cycle();
  }

  function updateTitle() {
    const {text} = window.zoeaLocale;
    const tile = fileTiles.get(current);
    document.title = current==='home' ? 'ZOEA' :
      current==='about' ? text('about','关于')+' · ZOEA' :
      tile ? tile.textContent.trim()+' · ZOEA' : text('portfolioTitle','作品目录 · ZOEA');
  }

  function switchView(view) {
    if (view===requestedView) return;
    requestedView = view;
    const previous = current;
    const active = document.activeElement;
    const moveFocus = active?.matches(':focus-visible');
    cancelTransition();
    if (view===previous) return;
    function focus() {
      if (!previous || !moveFocus) return;
      if (view!=='home' && view!=='about' && active.matches('[data-category]')) return;
      const previousTile = fileTiles.get(previous);
      const target = view==='home' ? home.querySelector('.terminal') :
        fileTiles.has(view) ? archive.querySelector('#zoea-heading') :
        previousTile && previous.slice(0,previous.lastIndexOf('/'))===view ? previousTile :
        archive.querySelector('[aria-current="page"]');
      target?.focus({preventScroll:true});
    }
    const change = ()=>{
      current = view;
      home.hidden = view!=='home';
      archive.hidden = view==='home';
      home.dispatchEvent(new Event('crt-view'));
      archive.dispatchEvent(new CustomEvent('crt-view',{detail:view}));
      updateTitle();
    };
    if (previous==='home' && view!=='home' && !reduced.matches && home.crtLive && archive.crtLive) {
      enterArchive(change,focus);
      return;
    }
    function changeAndFocus() {
      change();
      queueMicrotask(focus);
    }
    if (previous && previous!=='home' && view!=='home') changeAndFocus();
    else powerCycle(changeAndFocus,Boolean(previous));
  }

  const legacyRoutes = new Map([
    ['projects/plugins','projects/tools'],
    ['projects/mod','projects/tools'],
    ['projects/plugins/demo','projects/tools/film-scan-helper'],
    ['projects/plugins/film-scan-helper','projects/tools/film-scan-helper'],
    ['projects/mod/gwent-finder','projects/tools/gwent-finder']
  ]);
  function syncView() {
    let path = location.hash.slice(1);
    if (legacyRoutes.has(path)) {
      path = legacyRoutes.get(path);
      history.replaceState(history.state,'','#'+path);
    }
    switchView(projectRoutes.has(path) || path==='about' ? path : 'home');
  }
  window.addEventListener('hashchange',syncView);
  document.addEventListener('zoea-language-change',updateTitle);
  // The archive registers its view listener in the same deferred script batch.
  document.addEventListener('DOMContentLoaded',syncView,{once:true});
})();
