(() => {
  const root = document.getElementById('zoea-archive');
  window.createCrt(root);
  const find = selector => root.querySelector(selector);
  const canvas = find('.crt-signal');
  const display = find('.display');
  const ctx = canvas.getContext('2d');
  const list = find('.list');
  const heading = find('#zoea-heading');
  const intro = find('.intro');
  const panel = find('.crt-panel');
  const controls = [...root.querySelectorAll('.wordmark, nav button, .list button')];
  const reduced = matchMedia('(prefers-reduced-motion:reduce)');
  const characters = ' .:-=+x2579%#@';
  const categories = [
    ['作品','WORKS'],
    ['插件','PLUGINS'],
    ['MOD','MOD']
  ];
  let current = 'project';
  let selected = 0;
  const limit = n => Math.max(0,Math.min(1,n));
  const soft = n => Math.exp(-n*n);
  function grain(x,y) {
    const value = Math.sin(x*127.1+y*311.7)*43758.5453;
    return value-Math.floor(value);
  }

  function emblem(x,y) {
    const r = Math.hypot((x-.5)*1.86,y-.5);
    const angle = Math.atan2(y-.5,(x-.5)*1.86);
    const hex = .25+.025*Math.cos(6*angle);
    return .034+.47*soft((r-.36)/.011)+.36*soft((r-.30)/.022)+.52*soft((r-hex)/.017)+.34*soft(r/.10);
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
  let refreshLabels;
  let labelLayout;

  function updateHitAreas(w,h) {
    const screen = display.getBoundingClientRect();
    const aspect = w/h;
    const areas = controls.map(control=>{
      const box = control.getBoundingClientRect();
      const left = box.left-screen.left, top = box.top-screen.top;
      const corners = [[left,top],[left+box.width,top],[left,top+box.height],[left+box.width,top+box.height]]
        .map(([x,y])=>{
          const nx = 2*x/w-1, ny = 2*y/h-1;
          return [nx,ny,.48*nx*(1+.044*ny*ny+.022*nx*nx)*aspect,.48*ny*(1+.061*nx*nx+.018*ny*ny)];
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

  function drawSignal(signal,width,height,scale,time=0,still=true,live=false) {
    for (const layer of [sourceLayer,diffuseLayer,haloLayer]) {
      if (layer.width !== width || layer.height !== height) {
        layer.width = width;
        layer.height = height;
      }
    }
    sourceCtx.clearRect(0,0,width,height);
    sourceCtx.textAlign = 'center';
    sourceCtx.textBaseline = 'middle';
    const pitch = (width/scale < 420 ? 4 : 5.5)*scale;
    sourceCtx.font = '700 '+pitch*1.37+'px Consolas, monospace';
    for (let y=pitch*.5;y<height;y+=pitch*1.15) {
      for (let x=pitch*.5;x<width;x+=pitch) {
        const luminance = signal(x/width,y/height);
        if (luminance<.028) continue;
        // Dither belongs to the emblem, never the empty CRT foreground.
        const light = limit(luminance+(grain(x,y)-.5)*Math.min(.10,luminance));
        const phase = time*.24-x/width;
        const sweep = still ? 0 : soft((phase-Math.round(phase))/.076);
        const index = Math.round(limit(light*(1+.22*sweep))*(characters.length-1));
        if (index===0) continue;
        sourceCtx.fillStyle = 'rgba(255,255,255,'+Math.min(1,.18+light*1.36)+')';
        const refreshed = !still && sweep>.45 && index>=3 && index<characters.length-1;
        sourceCtx.fillText(characters[index+(refreshed ? 1 : 0)],x,y);
      }
    }
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
    for (const label of root.querySelectorAll('.wordmark, nav button, .prompt, #zoea-detail, .list button')) {
      if (!label.getClientRects().length) continue;
      const text = label.firstChild;
      if (text?.nodeType !== Node.TEXT_NODE) continue;
      const lines = [];
      let line, top = -Infinity;
      for (let i=0;i<text.length;i++) {
        range.setStart(text,i);
        range.setEnd(text,i+1);
        const box = range.getBoundingClientRect();
        if (box.top !== top) {
          top = box.top;
          line = {text:'',left:box.left-screen.left,middle:top+box.height*.5-screen.top};
          lines.push(line);
        }
        line.text += text.data[i];
      }
      const box = label.getBoundingClientRect();
      const {fontWeight,fontSize,fontFamily} = getComputedStyle(label);
      layout.push({label,lines,fontWeight,fontSize,fontFamily,left:box.left-screen.left,bottom:box.bottom-screen.top,width:box.width});
    }
    return {w:screen.width,h:screen.height,layout};
  }

  function drawLabels(width,height,scale) {
    labelsLayer.width = width;
    labelsLayer.height = height;
    const {w,h,layout} = labelLayout ?? measureLabels();
    function sample(left,middle) {
      const nx = 2*left/w-1, ny = 2*middle/h-1;
      return [(nx*(1+.044*ny*ny+.022*nx*nx)*.96+1)*width/2,
        (ny*(1+.061*nx*nx+.018*ny*ny)*.96+1)*height/2];
    }
    for (const {label,lines,fontWeight,fontSize,fontFamily,left,bottom,width:boxWidth} of layout) {
      const active = label.getAttribute('aria-pressed') === 'true'
        || label.getAttribute('aria-current') === 'page';
      labelsCtx.font = fontWeight+' '+parseFloat(fontSize)*scale+'px '+fontFamily;
      labelsCtx.textBaseline = 'middle';
      labelsCtx.fillStyle = '#fff';
      labelsCtx.globalAlpha = active ? .69 : .56;
      const highlighted = label === document.activeElement || label.matches(':hover');
      if (highlighted) {
        labelsCtx.globalAlpha = .88;
        labelsCtx.shadowColor = '#fff';
        labelsCtx.shadowBlur = 2.2*scale;
      }

      for (const [index,line] of lines.entries()) {
        if (index===lines.length-1 && active && label.matches('.list button')) {
          labelsCtx.fillText('>',...sample(line.left-labelsCtx.measureText('> ').width/scale,line.middle));
        }
        labelsCtx.fillText(line.text,...sample(line.left,line.middle));
      }
      if (lines.length && (active || highlighted) && label.matches('nav button, .list button')) {
        labelsCtx.fillRect(...sample(left,bottom-2),boxWidth*scale,scale*(highlighted ? 1.5 : 1));
      }
      labelsCtx.shadowBlur = 0;
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
    const dx = (box.left-screen.left)/screen.width*2-1;
    const dy = (box.top-screen.top)/screen.height*2-1;
    const x = (dx*(1+.044*dy*dy+.022*dx*dx)*.96+1)*width/2;
    const y = (dy*(1+.061*dx*dx+.018*dy*dy)*.96+1)*height/2;
    const pitch = Math.max(2,2.05*scale);
    for (let row=0;row<titleLayer.height;row+=pitch) {
      for (let col=0;col<titleLayer.width;col+=pitch) {
        const alpha = text[(Math.floor(row)*titleLayer.width+Math.floor(col))*4+3]/255;
        if (alpha<.25) continue;
        const strength = alpha*(.63+.27*grain(col,row));
        sourceCtx.fillStyle = 'rgba(255,255,255,'+strength+')';
        sourceCtx.fillRect(x+col,y+row,pitch*.85,pitch*.78);
      }
    }
  }

  function render() {
    const w = display.clientWidth;
    const h = display.clientHeight;
    if (w<2 || h<2) return;
    const screen = display.getBoundingClientRect();
    const mobile = w<580;
    const artTop = (intro.getBoundingClientRect().bottom-screen.top+(mobile ? 13 : 18))/h;
    const box = panel.getBoundingClientRect();
    const artBottom = (box.bottom-screen.top-12)/h;
    const center = .50;
    const middle = (artTop+artBottom)/2;
    const span = Math.max(.11,artBottom-artTop);
    const subjectWidth = mobile ? 1 : 1.02;
    const subjectHeight = Math.min(span*1.34,w*subjectWidth/(1.86*h));
    function signal(x,y,time,still) {
      if (current!=='about') return 0;
      const drift = still ? 0 : .008*Math.sin(time*.42);
      const u = .5+(x-center-drift)/subjectWidth;
      const v = .5+(y-middle)/subjectHeight;
      return Math.max(0,emblem(u,v)-.034)*limit((y-artTop)*24)*limit((artBottom-y)*24);
    }
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
      refreshLabels = ()=>drawLabels(width,height,scale);
      refreshLabels();
      root.crtLive.setScene((time,_x,_y,still)=>
        drawSignal((u,v)=>signal(u,v,time,still),width,height,scale,time,still,true),current==='about');
      root.classList.add('crt-ready');
    } else {
      renderFallback((u,v)=>signal(u,v,0,true),w,h);
    }
  }

  function renderFallback(signal,w,h) {
    const scale = Math.min(Math.max(devicePixelRatio || 1,1.25),1.6,1400/w,1050/h);
    const width = canvas.width = Math.round(w*scale);
    const height = canvas.height = Math.round(h*scale);
    drawLabels(width,height,scale);
    const [source,diffuse,halo] = drawSignal(signal,width,height,scale)
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
    const [label, path] = categories[selected];
    heading.textContent = about ? '关于 ZOEA' : label;
    find('#zoea-directory').textContent = about ? 'C:\\ZOEA\\ABOUT>' : 'C:\\ZOEA\\PROJECTS\\'+path+'>';
    find('#zoea-detail').textContent = about ? '拍黑白胶片，做影像工具，也尝试游戏 Mod 和 UE。' : '';
    canvas.setAttribute('aria-label',about ? '琥珀色字符绘制的图形' : label);
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

  root.addEventListener('crt-view',event=>{
    if (event.detail==='home') return;
    const changed = current !== (event.detail==='about' ? 'about' : 'project');
    current = event.detail==='about' ? 'about' : 'project';
    updateContent();
    if (changed && root.crtEntryTime?.(performance.now()) < 0) refreshPanel();
  });
  root.querySelectorAll('[data-page]').forEach(button=>{
    button.addEventListener('click',()=>{location.hash=button.dataset.page==='about' ? 'about' : 'projects';});
  });
  [...list.children].forEach((button,index)=>{
    button.addEventListener('click',()=>{
      if (selected===index && current==='project') return;
      selected = index;
      if (current==='about') {
        location.hash='projects';
        return;
      }
      updateContent();
      refreshPanel();
    });
  });
  function updateLabelHighlight(event) {
    if (!root.crtLive || !event.target.closest('.list button, header a, header button')) return;
    refreshLabels?.();
    root.crtLive.invalidate();
  }
  for (const event of ['focusin','focusout','pointerover','pointerout']) {
    root.addEventListener(event,updateLabelHighlight);
  }
  new ResizeObserver(()=>render()).observe(display);

})();
