(() => {
  const root = document.getElementById('zoea-archive');
  window.createCrt(root);
  const find = selector => root.querySelector(selector);
  const canvas = find('.crt-signal');
  const display = find('.display');
  const ctx = canvas.getContext('2d');
  const list = find('.list');
  const heading = find('#zoea-heading');
  const panel = find('.crt-panel');
  const aboutContent = find('.about-content');
  const fileGrids = [...root.querySelectorAll('.file-grid')];
  const fileTiles = [...root.querySelectorAll('.file-tile')];
  const fileDetails = new Map([...root.querySelectorAll('.file-properties')]
    .map(detail=>[detail.dataset.fileId ?? 'film-scan-helper',detail]));
  const fileIcons = [...root.querySelectorAll('.file-icon')];
  const qqDialog = find('#zoea-qq');
  const qqButton = find('[aria-controls="zoea-qq"]');
  const qqIcon = qqButton.querySelector('img');
  const qqGlass = qqDialog.querySelector('.qq-glass');
  const qqCode = qqDialog.querySelector('.qq-code');
  const qqSource = qqCode.querySelector('.crt-signal');
  const controls = [...root.querySelectorAll('header a, header button, .list button, .about-contact, .file-tile, .file-action')];
  const soundButton = find('.crt-mute');
  const reduced = matchMedia('(prefers-reduced-motion:reduce)');
  let current = 'project';
  let selected = 0;
  let openFile = null;
  const limit = n => Math.max(0,Math.min(1,n));
  const soft = n => Math.exp(-n*n);
  function grain(x,y) {
    const value = Math.sin(x*127.1+y*311.7)*43758.5453;
    return value-Math.floor(value);
  }

  const sourceLayer = document.createElement('canvas');
  const diffuseLayer = document.createElement('canvas');
  const haloLayer = document.createElement('canvas');
  const titleLayer = document.createElement('canvas');
  const labelsLayer = document.createElement('canvas');
  const sourceCtx = sourceLayer.getContext('2d');
  const diffuseCtx = diffuseLayer.getContext('2d');
  const haloCtx = haloLayer.getContext('2d');
  const titleCtx = titleLayer.getContext('2d',{willReadFrequently:true});
  const labelsCtx = labelsLayer.getContext('2d');
  // Keep small glyph strokes intact between the brighter phosphor dots.
  const textCell = document.createElement('canvas');
  textCell.width = textCell.height = 2;
  const textCellCtx = textCell.getContext('2d');
  textCellCtx.fillStyle = 'rgba(255,255,255,.72)';
  textCellCtx.fillRect(0,0,2,2);
  textCellCtx.fillStyle = '#fff';
  textCellCtx.fillRect(0,0,1,1);
  const textPhosphor = labelsCtx.createPattern(textCell,'repeat');
  const graphemes = new Intl.Segmenter();
  let refreshLabels;
  let labelLayout;

  function updateHitAreas(w,h) {
    const screen = display.getBoundingClientRect();
    const aspect = w/h;
    const areas = controls.filter(control=>control.getClientRects().length).map(control=>{
      const box = control.getBoundingClientRect();
      const left = box.left-screen.left, top = box.top-screen.top;
      const corners = [[left,top],[left+box.width,top],[left,top+box.height],[left+box.width,top+box.height]]
        .map(([x,y])=>{
          const nx = 2*x/w-1, ny = 2*y/h-1;
          return [nx,ny,nx*.5*aspect,ny*.5];
        });
      control.style.transformOrigin = '0 0';
      return {control,left,top,width:box.width,height:box.height,corners};
    });

    let lastX, lastY;
    root.crtLive.setHitAreaUpdater((x,y)=>{
      if (Math.abs(x-lastX)<.0003 && Math.abs(y-lastY)<.0003) return;
      lastX = x;
      lastY = y;
      // Forward projection of the same tilted plane the CRT shader samples.
      const sx = Math.sin(y*.063), cx = Math.cos(y*.063);
      const sy = Math.sin(-x*.080), cy = Math.cos(-x*.080);
      for (const {control,left,top,width,height,corners} of areas) {
        const [a,b,c,d] = corners.map(([nx,ny,u,v])=>{
          const depth = 2.3-sy*u+cy*sx*v;
          const flatX = 2.3*(cy*u+sy*sx*v)/(depth*aspect);
          const flatY = 2.3*cx*v/depth;
          let px = nx, py = ny;
          for (let i=0;i<5;i++) {
            const curvedX = .48*px*(1+.044*py*py+.022*px*px);
            const curvedY = .48*py*(1+.061*px*px+.018*py*py);
            px += 2*(flatX-curvedX);
            py += 2*(flatY-curvedY);
          }
          return {x:(px+1)*w/2-left,y:(py+1)*h/2-top};
        });
        // Map the native focus and pointer area to all four projected corners.
        const bx = b.x-d.x, by = b.y-d.y, cxEdge = c.x-d.x, cyEdge = c.y-d.y;
        const ex = a.x-b.x-c.x+d.x, ey = a.y-b.y-c.y+d.y;
        const determinant = bx*cyEdge-by*cxEdge;
        const gx = (ex*cyEdge-ey*cxEdge)/determinant;
        const gy = (bx*ey-by*ex)/determinant;
        control.style.transform = `matrix3d(${[
          (b.x*(1+gx)-a.x)/width,(b.y*(1+gx)-a.y)/width,0,gx/width,
          (c.x*(1+gy)-a.x)/height,(c.y*(1+gy)-a.y)/height,0,gy/height,
          0,0,1,0,a.x,a.y,0,1
        ].join(',')})`;
      }
    });
  }
  const tone = Array.from({length:1024},(_,index)=>{
    const light = index/1023;
    return [
      6+328*Math.pow(light,.79),
      4+269*Math.pow(light,1.05),
      3+209*Math.pow(light,1.51)
    ];
  });

  function drawSignal(width,height,scale,live=false) {
    for (const layer of [sourceLayer,diffuseLayer,haloLayer]) {
      if (layer.width !== width || layer.height !== height) {
        layer.width = width;
        layer.height = height;
      }
    }
    sourceCtx.clearRect(0,0,width,height);
    drawHeading(width,height,scale);
    sourceCtx.drawImage(labelsLayer,0,0);
    if (live) return sourceLayer;
    diffuseCtx.filter = 'blur('+1.8*scale+'px)';
    diffuseCtx.globalCompositeOperation = 'copy';
    diffuseCtx.drawImage(sourceLayer,0,0);
    haloCtx.filter = 'blur('+6*scale+'px)';
    haloCtx.globalCompositeOperation = 'copy';
    haloCtx.drawImage(sourceLayer,0,0);
    return [sourceLayer,diffuseLayer,haloLayer];
  }

  function measureLabels() {
    const screen = display.getBoundingClientRect();
    const range = document.createRange();
    const layout = [];
    for (const label of root.querySelectorAll('.wordmark, nav button, .prompt, .about-content :is(h2,p), .list button, [data-file-text]')) {
      if (!label.getClientRects().length) continue;
      if (!root.crtLive && (aboutContent.contains(label) || label.hasAttribute('data-file-text'))) continue;
      const text = label.firstChild;
      if (text?.nodeType !== Node.TEXT_NODE) continue;
      const {fontWeight,fontSize,fontFamily,textAlign} = getComputedStyle(label);
      const justify = textAlign==='justify' && label.matches('.file-description p');
      const lines = [];
      let line, top = -Infinity;
      for (const {segment,index} of graphemes.segment(text.data)) {
        range.setStart(text,index);
        range.setEnd(text,index+segment.length);
        const box = range.getBoundingClientRect();
        if (box.top !== top) {
          top = box.top;
          line = {text:'',left:box.left-screen.left,middle:top+box.height*.5-screen.top,glyphs:justify ? [] : null};
          lines.push(line);
        }
        line.text += segment;
        if (justify && segment.trim()) line.glyphs.push({segment,left:box.left-screen.left});
      }
      const box = label.getBoundingClientRect();
      layout.push({label,lines,fontWeight,fontSize,fontFamily,left:box.left-screen.left,bottom:box.bottom-screen.top,width:box.width});
    }
    function measureBox(element) {
      const box = element.getBoundingClientRect();
      return {left:box.left-screen.left,top:box.top-screen.top,width:box.width,height:box.height};
    }
    function measureIcon(icon) {
      const {left,top,width,height} = measureBox(icon);
      return {x:left+width/2,y:top+height/2,width,height};
    }
    return {layout,
      soundIcon:measureIcon(soundButton.querySelector('.crt-mute-icon')),contactIcon:measureIcon(qqIcon),
      files:fileIcons.filter(icon=>icon.getClientRects().length)
        .map(icon=>({icon,tile:icon.closest('.file-tile'),...measureIcon(icon)})),
      tiles:fileTiles.filter(tile=>tile.getClientRects().length).map(tile=>({tile,...measureBox(tile)})),
      properties:openFile ? {
        box:measureBox(openFile),bar:measureBox(openFile.querySelector('.file-bar')),
        footer:measureBox(openFile.querySelector('.file-actions'))
      } : null,
      actions:openFile ? [...openFile.querySelectorAll('.file-action')].map(action=>({action,...measureBox(action)})) : []
    };
  }

  function drawLabels(width,height) {
    labelsLayer.width = width;
    labelsLayer.height = height;
    // Draw the full surface in layout coordinates. The CRT applies curvature and perspective once.
    const scaleX = width/display.clientWidth;
    labelsCtx.setTransform(scaleX,0,0,height/display.clientHeight,0,0);
    const {layout,soundIcon,contactIcon,tiles,properties,files,actions} = labelLayout ?? measureLabels();
    if (root.crtLive) {
      const highlighted = control=>control.matches(':hover,:focus-visible');
      labelsCtx.strokeStyle = '#fff';
      function outline({left,top,width,height},alpha) {
        labelsCtx.globalAlpha = alpha;
        labelsCtx.strokeRect(left,top,width,height);
      }
      for (const {tile,...box} of tiles) {
        if (highlighted(tile)) outline(box,.36);
      }
      if (properties) {
        const {box,bar,footer} = properties;
        outline(box,.42);
        labelsCtx.fillStyle = '#fff';
        labelsCtx.globalAlpha = .10;
        labelsCtx.fillRect(box.left,box.top,box.width,bar.top+bar.height-box.top);
        labelsCtx.globalAlpha = .40;
        for (const y of [bar.top+bar.height,footer.top]) {
          labelsCtx.fillRect(box.left,y-.5,box.width,1);
        }
        for (const {action,...box} of actions) {
          outline(box,highlighted(action) ? .75 : action.matches('.file-download') ? .46 : .30);
        }
      }
      for (const {icon,tile,x,y,width,height} of files) {
        labelsCtx.globalAlpha = tile && highlighted(tile) ? 1 : .80;
        labelsCtx.drawImage(icon,x-width/2,y-height/2,width,height);
      }
    }
    for (const {label,lines,fontWeight,fontSize,fontFamily,left,bottom,width:boxWidth} of layout) {
      const active = label.getAttribute('aria-pressed') === 'true'
        || label.getAttribute('aria-current') === 'page';
      labelsCtx.font = fontWeight+' '+fontSize+' '+fontFamily;
      labelsCtx.textBaseline = 'middle';
      const fileText = label.hasAttribute('data-file-text');
      labelsCtx.fillStyle = fileText ? textPhosphor : '#fff';
      const descriptionHeading = label.matches('h2,h3');
      labelsCtx.globalAlpha = fileText ? .91 : active ? .69 : descriptionHeading ? .74 : .56;
      const highlighted = label === document.activeElement || label.matches(':hover') ||
        label.closest('.file-tile')?.matches(':hover,:focus-visible');
      if (highlighted) {
        labelsCtx.globalAlpha = fileText ? 1 : .88;
        labelsCtx.shadowColor = '#fff';
        labelsCtx.shadowBlur = fileText ? 0 : 2.2*scaleX;
      }

      for (const [index,line] of lines.entries()) {
        if (index===lines.length-1 && active && label.matches('.list button')) {
          labelsCtx.fillText('>',line.left-labelsCtx.measureText('> ').width,line.middle);
        }
        if (line.glyphs) {
          for (const {segment,left} of line.glyphs) labelsCtx.fillText(segment,left,line.middle);
        } else {
          labelsCtx.fillText(line.text,line.left,line.middle);
        }
      }
      if (lines.length && (active || highlighted) && label.matches('nav button, .list button')) {
        labelsCtx.fillRect(left,bottom-2,boxWidth,highlighted ? 1.5 : 1);
      }
      labelsCtx.shadowBlur = 0;
    }
    if (root.crtLive && soundIcon.width) {
      window.drawCrtSoundIcon(labelsCtx,soundButton,soundIcon.x,soundIcon.y,soundIcon.width);
    }
    if (root.crtLive && contactIcon.width && qqIcon.complete && qqIcon.naturalWidth) {
      const {x,y,width:w,height:h} = contactIcon;
      labelsCtx.globalAlpha = qqButton.matches(':hover,:focus-visible') ? .99 : .82;
      labelsCtx.drawImage(qqIcon,x-w/2,y-h/2,w,h);
      qqButton.classList.add('crt-icon-ready');
    }
  }

  function drawPhosphorDots(target,pixels,width,height,pitch,x,y) {
    for (let row=0;row<height;row+=pitch) {
      for (let col=0;col<width;col+=pitch) {
        const alpha = pixels[(Math.floor(row)*width+Math.floor(col))*4+3]/255;
        if (alpha<.25) continue;
        const strength = alpha*(.63+.27*grain(col,row));
        target.fillStyle = 'rgba(255,255,255,'+strength+')';
        target.fillRect(x+col,y+row,pitch*.85,pitch*.78);
      }
    }
  }

  function paintFilmIcon() {
    titleCtx.strokeRect(5,12,58,44);
    titleCtx.strokeRect(10,24,22,20);
    titleCtx.strokeRect(36,24,22,20);
    for (let x=10;x<=54;x+=8) {
      titleCtx.fillRect(x,16,4,4);
      titleCtx.fillRect(x,48,4,4);
    }
    titleCtx.fillRect(14,28,4,4);
    titleCtx.fillRect(22,36,6,4);
    titleCtx.fillRect(40,36,8,4);
    titleCtx.fillRect(48,32,6,8);
  }

  function paintGwentIcon() {
    for (const [x,y,angle] of [[18,36,-.29],[50,36,.29],[34,32,0]]) {
      titleCtx.save();
      titleCtx.translate(x,y);
      titleCtx.rotate(angle);
      titleCtx.clearRect(-11,-18,22,36);
      titleCtx.strokeRect(-11,-18,22,36);
      titleCtx.strokeRect(-7,-9,14,17);
      titleCtx.fillRect(-7,-14,4,2);
      titleCtx.fillRect(2,12,5,2);
      titleCtx.restore();
    }
    // Sword on the face of the foremost card.
    titleCtx.beginPath();
    titleCtx.moveTo(29,37);
    titleCtx.lineTo(38,28);
    titleCtx.moveTo(29,32);
    titleCtx.lineTo(34,37);
    titleCtx.stroke();
  }

  function paintFileIcons() {
    const size = 68;
    for (const [kind,paint] of [['film',paintFilmIcon],['gwent',paintGwentIcon]]) {
      titleLayer.width = titleLayer.height = size;
      titleCtx.strokeStyle = '#fff';
      titleCtx.fillStyle = '#fff';
      titleCtx.lineWidth = 2;
      paint();
      const {data} = titleCtx.getImageData(0,0,size,size);
      for (const icon of fileIcons.filter(icon=>(icon.dataset.icon ?? 'film')===kind)) {
        drawPhosphorDots(icon.getContext('2d'),data,size,size,2,0,0);
      }
    }
  }

  function drawHeading(width,height,scale) {
    const box = heading.getBoundingClientRect();
    const screen = display.getBoundingClientRect();
    const style = getComputedStyle(heading);
    titleLayer.width = Math.ceil(box.width*scale)+4;
    titleLayer.height = Math.ceil(box.height*scale)+4;
    titleCtx.font = style.fontWeight+' '+parseFloat(style.fontSize)*scale+'px '+style.fontFamily;
    titleCtx.textBaseline = 'middle';
    titleCtx.fillStyle = '#fff';
    titleCtx.fillText(heading.textContent,0,box.height*scale/2);
    const text = titleCtx.getImageData(0,0,titleLayer.width,titleLayer.height).data;
    const x = (box.left-screen.left)*width/display.clientWidth;
    const y = (box.top-screen.top)*height/display.clientHeight;
    const pitch = Math.max(2,2.05*scale);
    drawPhosphorDots(sourceCtx,text,titleLayer.width,titleLayer.height,pitch,x,y);
  }

  function render() {
    const w = display.clientWidth;
    const h = display.clientHeight;
    if (w<2 || h<2) return;
    const screen = display.getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    if (root.crtLive) {
      for (const control of controls) control.style.transform = '';
      labelLayout = measureLabels();
      updateHitAreas(w,h);
      root.crtLive.setPanel([
        (box.left-screen.left)/w,(box.top-screen.top)/h,
        (box.right-screen.left)/w,(box.bottom-screen.top)/h
      ]);
      const scale = Math.min(Math.max(1,devicePixelRatio || 1),2.5,Math.sqrt(7500000/(w*h)));
      const width = Math.round(w*scale), height = Math.round(h*scale);
      refreshLabels = ()=>drawLabels(width,height);
      refreshLabels();
      root.crtLive.setScene(()=>drawSignal(width,height,scale,true),false);
      root.classList.add('crt-ready');
    } else {
      renderFallback(w,h);
    }
  }

  function renderFallback(w,h) {
    const scale = Math.min(Math.max(devicePixelRatio || 1,1.25),1.6,1400/w,1050/h);
    const width = canvas.width = Math.round(w*scale);
    const height = canvas.height = Math.round(h*scale);
    drawLabels(width,height);
    const [source,diffuse,halo] = drawSignal(width,height,scale)
      .map(layer=>layer.getContext('2d').getImageData(0,0,width,height).data);
    const pixels = ctx.createImageData(width,height);
    const pitch = Math.max(2.2,height/180);
    for (let y=0;y<height;y++) {
      const dy = 2*(y+.5)/height-1;
      for (let x=0;x<width;x++) {
        const dx = 2*(x+.5)/width-1;
        const radius = dx*dx+dy*dy;
        const u = (dx*(1+.044*dy*dy+.022*dx*dx)*.96+1)*width/2-.5;
        const v = (dy*(1+.061*dx*dx+.018*dy*dy)*.96+1)*height/2-.5;
        const sx = Math.max(0,Math.min(width-1.001,u));
        const sy = Math.max(0,Math.min(height-1.001,v));
        const col = Math.floor(sx), row = Math.floor(sy);
        const fx = sx-col, fy = sy-row, stride = width*4;
        const p = (row*width+col)*4+3;
        const top = source[p]*(1-fx)+source[p+4]*fx;
        const bottom = source[p+stride]*(1-fx)+source[p+stride+4]*fx;
        const sharp = (top*(1-fy)+bottom*fy)/255;
        const bloom = diffuse[p]/255;
        const edge = .08+.24*limit((radius-.25)/1.4);
        const emission = sharp*(1-edge)+bloom*edge;
        const phase = v/pitch-Math.round(v/pitch);
        const beam = .36+.64*soft(phase/(.20+.20*Math.sqrt(emission)));
        const vignette = Math.max(.56,1-.075*radius-.068*radius*radius);
        const signalLight = emission*beam + bloom*.46 + halo[p]/255*.31;
        const value = limit(signalLight*vignette);
        const color = tone[Math.round(value*1023)];
        const alpha = Math.min(255,color[0]-6);
        const normalize = 255/Math.max(1,alpha);
        const i = 4*(y*width+x);
        pixels.data[i] = (color[0]-6)*normalize;
        pixels.data[i+1] = (color[1]-4)*normalize;
        pixels.data[i+2] = (color[2]-3)*normalize;
        pixels.data[i+3] = alpha;
      }
    }
    ctx.putImageData(pixels,0,0);
    root.classList.add('crt-ready');
  }

  function updateContent() {
    const about = current==='about';
    const category = list.children[selected];
    const path = category.dataset.category.toUpperCase();
    const {text} = window.zoeaLocale;
    const label = about ? text('aboutHeading','关于 ZOEA') : openFile ? text('fileDetails','文件详情') : category.textContent;
    heading.textContent = label;
    find('#zoea-directory').textContent = about ? 'C:\\ZOEA\\ABOUT>' :
      'C:\\ZOEA\\PROJECTS\\'+path+(openFile ? '\\'+(openFile.dataset.fileId ?? 'film-scan-helper').toUpperCase() : '')+'>';
    root.dataset.view = current;
    root.toggleAttribute('data-file-open',Boolean(openFile));
    aboutContent.hidden = !about;
    for (const grid of fileGrids) {
      grid.hidden = about || Boolean(openFile) || (grid.dataset.fileCategory ?? 'plugins')!==category.dataset.category;
    }
    for (const detail of fileDetails.values()) detail.hidden = detail!==openFile;
    canvas.setAttribute('aria-label',label);
    [...list.children].forEach((button,i)=>button.setAttribute('aria-pressed',String(!about && i===selected)));
    root.querySelectorAll('[data-page]').forEach(button=>{
      if (button.dataset.page===current) button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    });
    render();
  }

  let panelAnimation;
  function refreshPanel() {
    if (root.crtLive) {
      root.crtLive.refreshPanel();
    } else if (!reduced.matches) {
      panelAnimation?.cancel();
      panelAnimation = panel.animate([{clipPath:'inset(0 100% 0 0)'},{clipPath:'inset(0)'}],
        {duration:570,easing:'linear'});
    }
  }

  let qqDisplayInitialized = false;
  function initializeQqDisplay() {
    if (qqDisplayInitialized || !qqDialog.open || !qqSource.naturalWidth) return;
    qqDisplayInitialized = true;
    window.createCrt(qqCode,{closeup:true});
    if (!qqCode.crtLive) return;
    const signal = document.createElement('canvas');
    const target = signal.getContext('2d',{willReadFrequently:true});
    qqCode.crtLive.setScene(()=>{
      const cssSize = qqCode.clientWidth;
      const density = Math.min(Math.max(1,devicePixelRatio),2.5);
      const size = Math.round(cssSize*density);
      if (signal.width===size && signal.height===size) return signal;
      signal.width = signal.height = size;
      target.drawImage(qqSource,0,0,size,size);
      const {data} = target.getImageData(0,0,size,size);
      target.clearRect(0,0,size,size);
      // A faint continuous core preserves the contrast of each code module.
      target.globalAlpha = .49;
      target.drawImage(qqSource,0,0,size,size);
      target.globalAlpha = 1;
      drawPhosphorDots(target,data,size,size,2.05*density,0,0);
      return signal;
    },false);
    new ResizeObserver(()=>qqCode.crtLive.invalidate()).observe(qqCode);
  }
  qqSource.addEventListener('load',initializeQqDisplay);

  let qqClosing;
  let qqPointerFrame = 0;
  function setQqPerspective(x,y) {
    qqGlass.style.setProperty('--qq-tilt-x',`${-y*4.2}deg`);
    qqGlass.style.setProperty('--qq-tilt-y',`${x*5.1}deg`);
    qqGlass.style.setProperty('--qq-light-x',`${50+x*39}%`);
    qqGlass.style.setProperty('--qq-light-y',`${50+y*39}%`);
  }
  function resetQqPerspective() {
    cancelAnimationFrame(qqPointerFrame);
    qqPointerFrame = 0;
    setQqPerspective(0,0);
  }
  qqDialog.addEventListener('pointermove',event=>{
    if (!qqDialog.open || qqClosing || reduced.matches || event.pointerType==='touch') return;
    cancelAnimationFrame(qqPointerFrame);
    const {clientX,clientY} = event;
    qqPointerFrame = requestAnimationFrame(()=>{
      qqPointerFrame = 0;
      // The dialog box stays flat, so its coordinates are stable as its contents tilt.
      const box = qqDialog.getBoundingClientRect();
      const x = 2*limit((clientX-box.left)/box.width)-1;
      const y = 2*limit((clientY-box.top)/box.height)-1;
      setQqPerspective(x,y);
    });
  },{passive:true});
  qqDialog.addEventListener('pointerleave',resetQqPerspective);
  reduced.addEventListener('change',resetQqPerspective);

  function resetQqAnimation() {
    qqClosing?.cancel();
    qqClosing = null;
    resetQqPerspective();
  }
  function playQqCue(open) {
    qqDialog.dispatchEvent(new CustomEvent('crt-qq-toggle',{bubbles:true,detail:open}));
  }
  function closeQq(event) {
    event.preventDefault();
    if (!qqDialog.open || qqClosing) return;
    cancelAnimationFrame(qqPointerFrame);
    playQqCue(false);
    if (reduced.matches) {
      qqDialog.close();
      return;
    }
    qqClosing = qqGlass.animate([
      {clipPath:getComputedStyle(qqGlass).clipPath,filter:'brightness(1)',opacity:1},
      {clipPath:'inset(49.3% 0)',filter:'brightness(2.3)',opacity:1,offset:.68},
      {clipPath:'inset(49.9% 46%)',filter:'brightness(2.5)',opacity:0}
    ],{duration:155,easing:'ease-in',fill:'forwards'});
    qqClosing.finished.then(()=>qqDialog.close(),()=>{});
  }
  qqButton.addEventListener('click',()=>{
    if (qqDialog.open) return;
    resetQqAnimation();
    qqDialog.showModal();
    initializeQqDisplay();
    playQqCue(true);
  });
  qqDialog.addEventListener('submit',closeQq);
  qqDialog.addEventListener('cancel',closeQq);
  qqDialog.addEventListener('close',()=>{
    if (!qqDialog.open) resetQqAnimation();
  });
  qqDialog.addEventListener('click',event=>{
    if (event.target===qqDialog) closeQq(event);
  });

  root.addEventListener('crt-view',event=>{
    if (event.detail!=='about' && qqDialog.open) {
      resetQqAnimation();
      qqDialog.close();
    }
    if (event.detail==='home') return;
    const [,category,fileId] = event.detail.split('/');
    const previous = current, previousCategory = selected, previousFile = openFile;
    current = event.detail==='about' ? 'about' : 'project';
    if (category) selected = [...list.children].findIndex(button=>button.dataset.category===category);
    openFile = fileDetails.get(fileId) ?? null;
    if (previousFile!==openFile) window.scrollTo(0,0);
    updateContent();
    const changed = previous!==current || previousCategory!==selected || previousFile!==openFile;
    if (changed && root.crtEntryTime?.(performance.now()) < 0) refreshPanel();
  });
  document.addEventListener('zoea-language-change',updateContent);
  root.querySelectorAll('[data-page]').forEach(button=>{
    button.addEventListener('click',()=>{location.hash=button.dataset.page==='about' ? 'about' : 'projects';});
  });
  [...list.children].forEach(button=>{
    button.addEventListener('click',()=>{
      location.hash='projects/'+button.dataset.category;
    });
  });
  function updateLabelHighlight(event) {
    if (!root.crtLive || !event.target.closest('.list button, header a, header button, .about-contact, .file-tile, .file-action')) return;
    refreshLabels?.();
    root.crtLive.invalidate();
  }
  for (const event of ['focusin','focusout','pointerover','pointerout','crt-sound-change']) {
    root.addEventListener(event,updateLabelHighlight);
  }
  qqIcon.addEventListener('load',updateLabelHighlight);
  paintFileIcons();
  new ResizeObserver(()=>render()).observe(display);

})();
