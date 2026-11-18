(() => {
  const root = document.getElementById('zoea-archive');
  const viewer = document.getElementById('dossier-lightbox');
  const original = viewer.querySelector('.dossier-original');
  const launch = viewer.querySelector('.dossier-zoom-toggle');
  const inspector = document.getElementById('dossier-zoom');
  const frame = inspector.querySelector('.dossier-inspector-frame');
  const viewport = inspector.querySelector('.dossier-zoom-viewport');
  const image = viewport.querySelector('img');
  const title = inspector.querySelector('h2');
  const level = inspector.querySelector('output');
  const minus = inspector.querySelector('[data-zoom-step="-1"]');
  const plus = inspector.querySelector('[data-zoom-step="1"]');
  const pointers = new Map();
  const factor = Math.SQRT2;
  let width = 0, height = 0, scale = 1, left = 0, top = 0;
  let viewWidth = 0, viewHeight = 0, lastWheel = 0, pinchStartScale = 0;
  let closingAnimation;

  // Wrapped captions and controls take up real space, especially beside a portrait.
  const bar = viewer.querySelector('.dossier-modal-bar');
  const footer = viewer.querySelector('.dossier-modal-footer');
  const plane = viewer.querySelector('.dossier-plane');
  function measureChrome() {
    if (!viewer.open) return;
    const style = getComputedStyle(plane);
    const chrome = bar.offsetHeight + footer.offsetHeight + parseFloat(style.paddingTop) +
      parseFloat(style.paddingBottom) + plane.offsetHeight - plane.clientHeight;
    const value = Math.ceil(chrome)+'px';
    if (viewer.style.getPropertyValue('--viewer-chrome')!==value) viewer.style.setProperty('--viewer-chrome',value);
  }
  const chromeSize = new ResizeObserver(measureChrome);
  chromeSize.observe(bar);
  chromeSize.observe(footer);

  const clamp = (value,low,high)=>Math.max(low,Math.min(high,value));
  const minimum = ()=>Math.max(viewWidth/width,viewHeight/height);
  const maximum = ()=>Math.max(4,minimum()*4);
  const center = ()=>({x:viewWidth/2,y:viewHeight/2});
  function cue(action) {
    root.dispatchEvent(new CustomEvent('dossier-action',{detail:action}));
  }
  function paint() {
    left = clamp(left,Math.min(0,viewWidth-width*scale),0);
    top = clamp(top,Math.min(0,viewHeight-height*scale),0);
    image.style.transform = 'translate('+left+'px,'+top+'px) scale('+scale+')';
    level.value = Math.round(scale*100)+'%';
    minus.disabled = scale<=minimum()+.0001;
    plus.disabled = scale>=maximum()-.0001;
  }
  function scaleAt(next,from=center(),to=from) {
    const before = scale;
    scale = clamp(next,minimum(),maximum());
    left = to.x-(from.x-left)*scale/before;
    top = to.y-(from.y-top)*scale/before;
    paint();
    return Math.abs(scale-before)>.00001;
  }
  function point(event) {
    const box = viewport.getBoundingClientRect();
    return {x:event.clientX-box.left,y:event.clientY-box.top};
  }
  function open(anchor) {
    const source = original.querySelector('img');
    if (inspector.open || !viewer.open || original.hidden || launch.disabled || !source?.naturalWidth) return;
    width = source.naturalWidth;
    height = source.naturalHeight;
    image.style.width = width+'px';
    image.style.height = height+'px';
    image.alt = source.alt;
    image.src = source.currentSrc;
    title.textContent = viewer.querySelector('h2').textContent+' / '+source.alt;
    inspector.removeAttribute('data-closing');
    inspector.showModal();
    viewWidth = viewport.clientWidth;
    viewHeight = viewport.clientHeight;
    const fit = original.clientWidth/width;
    scale = clamp(Math.max(1,fit*1.8),minimum(),maximum());
    const bounds = viewport.getBoundingClientRect();
    const targetX = anchor ? clamp(anchor.x-bounds.left,0,viewWidth) : viewWidth/2;
    const targetY = anchor ? clamp(anchor.y-bounds.top,0,viewHeight) : viewHeight/2;
    left = targetX - (anchor?.u ?? .5)*width*scale;
    top = targetY - (anchor?.v ?? .5)*height*scale;
    lastWheel = performance.now();
    paint();
    viewport.focus({preventScroll:true});
    cue('expand');
  }
  function close(audible) {
    if (!inspector.open) return;
    if (audible) {
      if (closingAnimation) return;
      cue('collapse');
      inspector.setAttribute('data-closing','');
      const animation = frame.getAnimations().find(effect=>effect.animationName==='crt-expose');
      if (animation) {
        closingAnimation = animation;
        const finish = ()=>{ if (closingAnimation===animation) close(false); };
        animation.finished.then(finish,finish);
        return;
      }
    }
    closingAnimation = null;
    inspector.removeAttribute('data-closing');
    inspector.close();
  }
  launch.addEventListener('click',()=>open());
  original.addEventListener('wheel',event=>{
    if (event.deltaY>=0 || launch.disabled || inspector.open) return;
    event.preventDefault();
    const box = original.getBoundingClientRect();
    const u = clamp((event.clientX-box.left)/box.width,0,1);
    const v = clamp((event.clientY-box.top)/box.height,0,1);
    open({u,v,x:event.clientX,y:event.clientY});
  },{passive:false});
  viewport.addEventListener('wheel',event=>{
    event.preventDefault();
    const delta = event.deltaY*(event.deltaMode===1 ? 16 : event.deltaMode===2 ? viewHeight : 1);
    const changed = scaleAt(scale*Math.exp(-clamp(delta,-350,350)*.0025),point(event));
    const now = performance.now();
    if (changed && now-lastWheel>180) cue('select');
    lastWheel = now;
  },{passive:false});
  function step(direction) {
    if (scaleAt(scale*Math.pow(factor,direction))) cue('select');
  }
  minus.addEventListener('click',()=>step(-1));
  plus.addEventListener('click',()=>step(1));
  inspector.querySelector('.dossier-zoom-reset').addEventListener('click',()=>close(true));
  inspector.addEventListener('cancel',event=>{event.preventDefault(); close(true);});
  inspector.addEventListener('close',()=>{
    if (inspector.open) return;
    closingAnimation = null;
    pointers.clear();
    image.removeAttribute('src');
    image.removeAttribute('style');
    image.alt = title.textContent = '';
    width = height = 0;
    if (viewer.open && !launch.disabled) launch.focus({preventScroll:true});
  });
  for (const event of ['crt-view','dossier-lock']) root.addEventListener(event,()=>close(false));
  viewer.addEventListener('close',()=>{if (!viewer.open) close(false);});

  viewport.addEventListener('pointerdown',event=>{
    if (event.button!==0 || pointers.size>=2) return;
    event.preventDefault();
    pointers.set(event.pointerId,point(event));
    if (pointers.size===2) pinchStartScale = scale;
    viewport.setPointerCapture(event.pointerId);
  });
  function pair() {
    const [a,b] = pointers.values();
    return {middle:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},distance:Math.hypot(a.x-b.x,a.y-b.y)};
  }
  viewport.addEventListener('pointermove',event=>{
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const current = point(event);
    const before = pointers.size===2 ? pair() : null;
    pointers.set(event.pointerId,current);
    if (before) {
      const after = pair();
      if (before.distance>1) scaleAt(scale*after.distance/before.distance,before.middle,after.middle);
      if (pinchStartScale && Math.abs(Math.log(scale/pinchStartScale))>.055) {
        cue('select');
        pinchStartScale = 0;
      }
    } else {
      left += current.x-previous.x;
      top += current.y-previous.y;
      paint();
    }
  });
  for (const event of ['pointerup','pointercancel','lostpointercapture']) {
    viewport.addEventListener(event,e=>pointers.delete(e.pointerId));
  }
  inspector.addEventListener('keydown',event=>{
    if (event.altKey || event.metaKey || event.ctrlKey || event.isComposing) return;
    const move = event.shiftKey ? 160 : 60;
    switch (event.key) {
      case '+': case '=': step(1); break;
      case '-': case '_': step(-1); break;
      case 'ArrowLeft': left += move; break;
      case 'ArrowRight': left -= move; break;
      case 'ArrowUp': top += move; break;
      case 'ArrowDown': top -= move; break;
      default: return;
    }
    event.preventDefault();
    paint();
  });
  new ResizeObserver(()=>{
    if (!inspector.open || !width) return;
    const oldCenter = center();
    viewWidth = viewport.clientWidth;
    viewHeight = viewport.clientHeight;
    scaleAt(scale,oldCenter,center());
  }).observe(viewport);
})();
