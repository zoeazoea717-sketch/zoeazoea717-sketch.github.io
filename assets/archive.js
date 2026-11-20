(() => {
  const root = document.getElementById('zoea-archive');
  const geometry = window.crtGeometry;
  window.createCrt(root);
  const find = selector => root.querySelector(selector);
  const canvas = find('.crt-signal');
  const display = find('.display');
  const ctx = canvas.getContext('2d');
  const list = find('.list');
  const heading = find('#zoea-heading');
  const panel = find('.crt-panel');
  const aboutContent = find('.about-content');
  const worksLock = find('.works-lock');
  const worksReady = find('.works-unlocked');
  const worksPassword = find('#zoea-works-password');
  const worksSubmit = worksLock.querySelector('button');
  const worksStatus = find('#zoea-works-access-status');
  const errorWindow = find('.access-error');
  const retryButton = find('.retry-access');
  const worksDirectory = find('.works-directory');
  const privateToggle = find('[data-group="private"]');
  const privateBody = find('#private-archive');
  let privateExpanded = false;
  let worksUnlocked = false, checkingPassword = false;
  let worksError;
  const toolDirectory = find('.tool-directory:not(.works-directory)');
  const disclosures = [...root.querySelectorAll('.tool-disclosure')];
  const fileTiles = [...root.querySelectorAll('.file-tile')];
  const fileDetails = new Map([...root.querySelectorAll('.file-properties')]
    .map(detail=>[detail.dataset.fileId ?? 'film-scan-helper',detail]));
  const fileIcons = [...root.querySelectorAll('.file-icon')];
  const paintedIcons = new WeakSet();
  const assetViewer = find('#asset-viewer');
  const qqDialog = find('#zoea-qq');
  const qqButton = find('[aria-controls="zoea-qq"]');
  const contactImages = [...root.querySelectorAll('.archive-portals img, .about-contact img')];
  const qqGlass = qqDialog.querySelector('.qq-glass');
  const qqCode = qqDialog.querySelector('.qq-code');
  const qqSource = qqCode.querySelector('.crt-signal');
  const controlSelector = 'header a, header button, .list button, .about-contact, .tool-disclosure, .file-source, .file-tile, .file-action, .preview-thumb, .works-lock input, .works-lock button, [data-dossier-control]';
  let controls = [];
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
  const coverAnimations = new Map();

  function paintCardImage({image,imageBox}, lit=false) {
    const animation = coverAnimations.get(image);
    const sheet = animation?.strip.naturalWidth ? animation.strip : image;
    const frames = sheet === animation?.strip ? animation.durations.length : 1;
    const width = imageBox.width-2, height = imageBox.height-2;
    if (width<=0 || height<=0) return;
    labelsCtx.save();
    labelsCtx.globalAlpha = 1;
    labelsCtx.fillStyle = '#100b08';
    labelsCtx.fillRect(imageBox.left+1,imageBox.top+1,width,height);
    if (sheet?.complete && sheet.naturalWidth) {
      const cellWidth = sheet.naturalWidth/frames;
      const scale = Math.max(width/cellWidth,height/sheet.naturalHeight);
      const sw = width/scale, sh = height/scale;
      const start = frames>1 ? animation.frame*cellWidth : 0;
      labelsCtx.filter = 'grayscale(1) brightness(.62)';
      labelsCtx.drawImage(sheet,start+(cellWidth-sw)/2,(sheet.naturalHeight-sh)/2,sw,sh,
        imageBox.left+1,imageBox.top+1,width,height);
    }
    if (lit) {
      labelsCtx.filter = 'none';
      labelsCtx.fillStyle = 'rgba(255,255,255,.08)';
      labelsCtx.fillRect(imageBox.left+1,imageBox.top+1,width,height);
    }
    labelsCtx.restore();
  }

  // Canvas samples only the default frame of a GIF. Advance the matching sprite strip
  // at its authored frame times, updating just the card interior in the cached labels.
  if (root.crtLive) for (const image of worksDirectory.querySelectorAll('img[data-strip]')) {
    const durations = image.dataset.frameMs.split(',').map(Number);
    const animation = {strip:new Image(),durations,frame:0};
    coverAnimations.set(image,animation);
    let timer;
    function update() {
      clearTimeout(timer);
      if (root.hidden || document.hidden || root.querySelector('dialog[open]')) return;
      const card = labelLayout?.cardLayouts.find(item=>item.image===image);
      if (!card || !animation.strip.naturalWidth) return;
      const top = display.getBoundingClientRect().top + card.imageBox.top;
      if (top >= innerHeight || top+card.imageBox.height <= 0) return;
      if (reduced.matches) animation.frame = 0;
      paintCardImage(card,card.open.matches(':hover,:focus-visible'));
      root.crtLive.invalidate();
      if (!reduced.matches) timer = setTimeout(()=>{
        animation.frame = (animation.frame+1)%durations.length;
        update();
      },durations[animation.frame]);
    }
    animation.update = update;
    window.addEventListener('scroll',update,{passive:true});
    animation.strip.onload = update;
    animation.strip.src = image.dataset.strip;
    document.addEventListener('visibilitychange',update);
    reduced.addEventListener('change',update);
    root.addEventListener('close',update,true);
  }

  function updateHitAreas(w,h) {
    const screen = display.getBoundingClientRect();
    const aspect = w/h;
    const areas = controls.filter(control=>!control.closest('dialog') && control.getClientRects().length).map(control=>{
      const box = control.getBoundingClientRect();
      const left = box.left-screen.left, top = box.top-screen.top;
      function source(x,y) {
          const nx = 2*x/w-1, ny = 2*y/h-1;
          return [nx,ny,nx*.5*aspect,ny*.5];
      }
      const corners = [source(left,top),source(left+box.width,top),source(left,top+box.height),source(left+box.width,top+box.height)];
      const hit = control.querySelector('.dossier-surface-hit');
      const outline = [];
      if (hit) {
        // Full-width rows and the artwork can bow well beyond their four corner points.
        const across = Math.ceil(box.width/70), down = Math.ceil(box.height/70);
        for (let i=0;i<across;i++) outline.push(source(left+box.width*i/across,top));
        for (let i=0;i<down;i++) outline.push(source(left+box.width,top+box.height*i/down));
        for (let i=across;i>0;i--) outline.push(source(left+box.width*i/across,top+box.height));
        for (let i=down;i>0;i--) outline.push(source(left,top+box.height*i/down));
      }
      control.style.transformOrigin = '0 0';
      return {control,left,top,width:box.width,height:box.height,corners,hit,outline};
    });

    const thumbnails = areas.filter(({control})=>control.matches('.preview-thumb'));
    let previousFront;
    root.crtLive.setPanelMediaUpdater(thumbnails.length ? (solid,clear)=>{
      if (clear===previousFront) return;
      previousFront = clear;
      for (const {control,left,width} of thumbnails) {
        const end = clear*w-left;
        const start = solid*w-left;
        if (end<=0 || start>=width) {
          control.style.clipPath = end<=0 ? 'inset(0 100% 0 0)' : '';
          control.style.maskImage = '';
        } else {
          control.style.clipPath = 'inset(0 '+Math.max(0,width-end)+'px 0 0)';
          control.style.maskImage = 'linear-gradient(90deg, black '+start+'px, transparent '+end+'px)';
        }
      }
    } : null);

    let lastX, lastY, lastBend;
    root.crtLive.setHitAreaUpdater((x,y,bend)=>{
      if (bend===lastBend && Math.abs(x-lastX)<.0003 && Math.abs(y-lastY)<.0003) return;
      lastX = x;
      lastY = y;
      lastBend = bend;
      // Forward projection of the same tilted plane the CRT shader samples.
      const sx = Math.sin(y*.063), cx = Math.cos(y*.063);
      const sy = Math.sin(-x*.080), cy = Math.cos(-x*.080);
      for (const {control,left,top,width,height,corners,hit,outline} of areas) {
        function project([nx,ny,u,v]) {
          const depth = 2.3-sy*u+cy*sx*v;
          const flatX = 2.3*(cy*u+sy*sx*v)/(depth*aspect);
          const flatY = 2.3*cx*v/depth;
          let px = nx, py = ny;
          for (let i=0;i<5;i++) {
            const curvedX = geometry.glassX(px,py,bend);
            const curvedY = geometry.glassY(px,py,bend);
            px += 2*(flatX-curvedX);
            py += 2*(flatY-curvedY);
          }
          return {x:(px+1)*w/2-left,y:(py+1)*h/2-top};
        }
        if (hit) {
          const points = outline.map(project);
          const xs = points.map(point=>point.x), ys = points.map(point=>point.y);
          const l = Math.min(...xs), t = Math.min(...ys);
          Object.assign(hit.style,{left:l+'px',top:t+'px',width:(Math.max(...xs)-l)+'px',height:(Math.max(...ys)-t)+'px',
            clipPath:'polygon('+points.map(p=>(p.x-l).toFixed(2)+'px '+(p.y-t).toFixed(2)+'px').join(',')+')'});
          continue;
        }
        const [a,b,c,d] = corners.map(project);
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
    for (const label of root.querySelectorAll('.wordmark, nav button, .prompt, .about-content :is(h2,p), .list button, [data-file-text], [data-works-text]')) {
      if (label.closest('dialog') || !label.getClientRects().length) continue;
      if (!root.crtLive && (aboutContent.contains(label) || label.matches('[data-file-text],[data-works-text]'))) continue;
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
    const file = openFile && !openFile.hidden ? openFile : null;
    const divider = file?.querySelector('.file-divider');
    const example = file?.querySelector('.asset-example');
    const cardLayouts = [...worksDirectory.querySelectorAll('.dossier-card')]
      .filter(card=>card.dataset.project && card.getClientRects().length)
      .map(card=>({
        box:measureBox(card),
        imageBox:measureBox(card.querySelector('.dossier-card-media')),
        image:card.querySelector('img'),
        open:card.querySelector('.dossier-card-open'),
        corners:measureBox(card.querySelector('.dossier-corners'))
      }));
    const shelf = find('#dossier-student-projects');
    const bay = find('.dossier-bay');
    return {layout,cardLayouts,shelfBox:shelf.getClientRects().length ? measureBox(shelf) : null, bay:bay.getClientRects().length ? measureBox(bay) : null,
      engravings:[...worksDirectory.querySelectorAll('.dossier-metal')].filter(mark=>mark.getClientRects().length)
        .map(mark=>({box:measureBox(mark), horizontal:mark.classList.contains('cassette-grip')})),
      dossierBars:[...worksReady.querySelectorAll('.dossier-resume-launch,.dossier-lock,.dossier-group-toggle')]
        .filter(button=>button.getClientRects().length).map(button=>({
          button,bar:measureBox(button),box:measureBox(button.closest('.dossier-group') || button)
        })),
      example:example ? measureBox(example) : null,
      soundIcon:measureIcon(soundButton.querySelector('.crt-mute-icon')),
      contactIcons:contactImages.filter(img=>img.getClientRects().length).map(img=>({img,box:measureIcon(img)})),
      files:fileIcons.filter(icon=>icon.getClientRects().length)
        .map(icon=>({icon,tile:icon.closest('.file-tile'),...measureIcon(icon)})),
      tiles:fileTiles.filter(tile=>tile.getClientRects().length).map(tile=>({tile,...measureBox(tile)})),
      focusBoxes:new Map(controls.filter(control=>control.getClientRects().length).map(control=>[control,measureBox(control)])),
      staticWindows:[...root.querySelectorAll('.public-works-bar,.access-error h3')]
        .filter(bar=>!bar.closest('dialog') && bar.getClientRects().length)
        .map(bar=>({box:measureBox(bar.parentElement),bar:measureBox(bar)})),
      groups:disclosures.filter(button=>button.getClientRects().length).map(button=>({
        button,box:measureBox(button.closest('section')),bar:measureBox(button.parentElement)
      })),
      properties:file ? {
        box:measureBox(file),bar:measureBox(file.querySelector('.file-bar')),
        footer:measureBox(file.querySelector('.file-actions')),
        divider:divider ? measureBox(divider) : null
      } : null,
      actions:file ? [...file.querySelectorAll('.file-action')].map(action=>({action,...measureBox(action)})) : [],
      lock:worksLock.hidden || worksLock.closest('dialog') ? null : {
        box:measureBox(worksLock),input:measureBox(worksPassword),button:measureBox(worksSubmit),
        symbol:measureBox(worksLock.querySelector('.works-lock-symbol'))
      }
    };
  }

  function drawLabels(width,height) {
    labelsLayer.width = width;
    labelsLayer.height = height;
    // Draw the full surface in layout coordinates. The CRT applies curvature and perspective once.
    const scaleX = width/display.clientWidth;
    labelsCtx.setTransform(scaleX,0,0,height/display.clientHeight,0,0);
    const {layout,cardLayouts,dossierBars,bay,engravings,soundIcon,contactIcons,tiles,groups,properties,files,actions,lock,example,focusBoxes,staticWindows} = labelLayout ?? measureLabels();
    for (const {icon,width} of files) paintFileIcon(icon,width,Math.max(1,scaleX));
    if (root.crtLive) {
      const highlighted = control=>control.matches(':hover,:focus-visible');
      labelsCtx.strokeStyle = '#fff';
      function outline({left,top,width,height},alpha) {
        labelsCtx.globalAlpha = alpha;
        labelsCtx.strokeRect(left,top,width,height);
      }
      function drawWindow(box,bar,hasBody,lit) {
        outline(box,lit ? .65 : .42);
        labelsCtx.fillStyle = '#fff';
        labelsCtx.globalAlpha = lit ? .18 : .10;
        labelsCtx.fillRect(bar.left,bar.top,bar.width,bar.height);
        if (hasBody) {
          labelsCtx.globalAlpha = lit ? .65 : .40;
          labelsCtx.fillRect(box.left,bar.top+bar.height-.5,box.width,1);
        }
      }
      for (const {button,box,bar} of groups) {
        drawWindow(box,bar,button.getAttribute('aria-expanded')==='true',highlighted(button));
      }
      for (const {box,bar} of staticWindows) drawWindow(box,bar,true,false);
      for (const {button,bar,box} of dossierBars) {
        if (button.classList.contains('dossier-lock')) outline(bar,highlighted(button) ? .65 : .35);
        else drawWindow(box,bar,button.getAttribute('aria-expanded')==='true',highlighted(button));
      }
      if (bay) {
        labelsCtx.save();
        labelsCtx.fillStyle = '#fff';
        labelsCtx.globalAlpha = .018;
        labelsCtx.fillRect(bay.left+2,bay.top+4,bay.width-4,bay.height-6);
        labelsCtx.setLineDash([4,4]);
        outline(bay,.55);
        labelsCtx.restore();
        labelsCtx.fillStyle = '#fff';
        labelsCtx.globalAlpha = .28;
        labelsCtx.fillRect(bay.left+3,bay.top+bay.height-2,bay.width-6,1);
      }
      for (const {box,imageBox,image,open,corners} of cardLayouts) {
        const lit = highlighted(open);
        labelsCtx.globalAlpha = 1;
        paintCardImage({image,imageBox});
        if (lit) {
          labelsCtx.fillStyle = '#fff';
          labelsCtx.globalAlpha = .08;
          labelsCtx.fillRect(box.left,box.top,box.width,box.height);
        }
        outline(box,lit ? .86 : .43);
        outline(imageBox,lit ? .60 : .34);
        labelsCtx.fillStyle = '#fff';
        labelsCtx.globalAlpha = lit ? 1 : .82;
        const arm = Math.min(12,Math.max(8,Math.round(box.width*.045)));
        for (const dx of [1,-1]) {
          for (const dy of [1,-1]) {
            const x = dx>0 ? corners.left : corners.left+corners.width;
            const y = dy>0 ? corners.top : corners.top+corners.height;
            labelsCtx.fillRect(x,y,dx*arm,dy*2);
            labelsCtx.fillRect(x,y,dx*2,dy*arm);
          }
        }
      }
      // The fallback stripes use the same mark boxes, pitch and stroke widths.
      labelsCtx.fillStyle = '#fff';
      labelsCtx.globalAlpha = .68;
      for (const {box,horizontal} of engravings) {
        if (horizontal) {
          for (let y=0;y<box.height;y+=3) labelsCtx.fillRect(box.left,box.top+y,box.width,1);
        } else {
          for (let x=0;x<box.width;x+=4) labelsCtx.fillRect(box.left+x,box.top,Math.min(2,box.width-x),box.height);
        }
      }
      for (const {tile,...box} of tiles) {
        if (highlighted(tile)) outline(box,.36);
      }
      if (lock) {
        outline(lock.box,.35);
        outline(lock.input,highlighted(worksPassword) || worksError ? .80 : .46);
        outline(lock.button,highlighted(worksSubmit) ? .86 : .54);
        const {left,top,width:w,height:h} = lock.symbol;
        labelsCtx.globalAlpha = .90;
        labelsCtx.beginPath();
        labelsCtx.ellipse(left+w*.5,top+h*.42,w*.22,h*.32,0,Math.PI,2*Math.PI);
        labelsCtx.stroke();
        labelsCtx.strokeRect(left+w*.16,top+h*.42,w*.68,h*.46);
        labelsCtx.fillStyle = textPhosphor;
        labelsCtx.fillRect(left+w*.46,top+h*.57,w*.08,h*.15);
      }
      if (properties) {
        const {box,bar,footer,divider} = properties;
        drawWindow(box,bar,true,false);
        labelsCtx.globalAlpha = .40;
        labelsCtx.fillRect(box.left,footer.top-.5,box.width,1);
        if (divider) {
          labelsCtx.globalAlpha = .36;
          labelsCtx.fillRect(divider.left,divider.top,divider.width,divider.height);
        }
        for (const {action,...box} of actions) {
          outline(box,highlighted(action) ? .75 : action.matches('.file-download') ? .46 : .30);
        }
      }
      for (const {icon,tile,x,y,width,height} of files) {
        labelsCtx.globalAlpha = tile && highlighted(tile) ? 1 : .80;
        labelsCtx.drawImage(icon,x-width/2,y-height/2,width,height);
      }
      const focusBox = focusBoxes.get(document.activeElement);
      if (focusBox && document.documentElement.dataset.input==='keyboard') {
        labelsCtx.save();
        labelsCtx.setLineDash([3,2]);
        outline(focusBox,.94);
        labelsCtx.restore();
      }
      if (example) {
        labelsCtx.globalAlpha = .34;
        labelsCtx.fillStyle = '#fff';
        labelsCtx.fillRect(example.left,example.top,example.width,1);
        labelsCtx.fillRect(example.left,example.top+example.height-1,example.width,1);
      }
    }
    for (const {label,lines,fontWeight,fontSize,fontFamily,left,bottom,width:boxWidth} of layout) {
      const active = Boolean(label.closest('[aria-pressed="true"]'))
        || label.getAttribute('aria-current') === 'page';
      labelsCtx.font = fontWeight+' '+fontSize+' '+fontFamily;
      labelsCtx.textBaseline = 'middle';
      const fileText = label.matches('[data-file-text],[data-works-text]');
      labelsCtx.fillStyle = fileText ? textPhosphor : '#fff';
      const descriptionHeading = label.matches('h2,h3');
      labelsCtx.globalAlpha = fileText ? .91 : active ? .69 : descriptionHeading ? .74 : .56;
      const highlighted = label === document.activeElement || label.matches(':hover') ||
        label.closest('.file-tile,.dossier-card-open')?.matches(':hover,:focus-visible');
      if (label.matches('.dossier-card-kind,.dossier-card-number,.dossier-card-tag,.dossier-lock,.dossier-byline,.dossier-bay-status,.dossier-empty')) {
        labelsCtx.globalAlpha = active ? .98 : .64;
      }
      if (highlighted) {
        labelsCtx.globalAlpha = fileText ? 1 : .88;
        labelsCtx.shadowColor = '#fff';
        labelsCtx.shadowBlur = fileText ? 0 : 2.2*scaleX;
      }

      for (const [index,line] of lines.entries()) {
        if (label.classList.contains('dossier-card-name')) {
          drawCardTitle(line,labelsCtx.font,parseFloat(fontSize),scaleX);
          continue;
        }
        if (index===lines.length-1 && active && label.matches('.list button')) {
          labelsCtx.fillText('>',line.left-labelsCtx.measureText('> ').width,line.middle);
        }
        if (line.glyphs) {
          for (const {segment,left} of line.glyphs) labelsCtx.fillText(segment,left,line.middle);
        } else {
          labelsCtx.fillText(line.text,line.left,line.middle);
        }
      }
      if (lines.length && (active || highlighted) && label.matches('nav button, .list button, .file-source')) {
        labelsCtx.fillRect(left,bottom-2,boxWidth,highlighted ? 1.5 : 1);
      }
      labelsCtx.shadowBlur = 0;
    }
    if (root.crtLive && soundIcon.width) {
      window.drawCrtSoundIcon(labelsCtx,soundButton,soundIcon.x,soundIcon.y,soundIcon.width);
    }
    if (root.crtLive) for (const {img,box:{x,y,width:w,height:h}} of contactIcons) {
      if (!w || !img.complete || !img.naturalWidth) continue;
      const control = img.parentElement;
      labelsCtx.globalAlpha = control.matches(':hover,:focus-visible') ? .99 : .82;
      labelsCtx.drawImage(control.matches('.archive-portals a') ? window.crtIconMask(img) : img,x-w/2,y-h/2,w,h);
      control.classList.add('crt-icon-ready');
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

  const titleStamps = new Map();
  function drawCardTitle(line,font,size,scale) {
    // Rasterize the same phosphor cells as the archive heading, cached per title and size.
    const id = [line.text,font,scale].join('|');
    let cells = titleStamps.get(id);
    if (!cells) {
      const mask = document.createElement('canvas');
      const pen = mask.getContext('2d',{willReadFrequently:true});
      mask.width = Math.ceil((labelsCtx.measureText(line.text).width+5)*scale);
      mask.height = Math.ceil(size*1.55*scale);
      pen.scale(scale,scale);
      pen.font = font; pen.fillStyle = '#fff'; pen.textBaseline = 'middle';
      pen.fillText(line.text,1,mask.height/(2*scale));
      cells = document.createElement('canvas');
      cells.width = mask.width; cells.height = mask.height;
      drawPhosphorDots(cells.getContext('2d'),pen.getImageData(0,0,mask.width,mask.height).data,mask.width,mask.height,2.05*scale,0,0);
      titleStamps.set(id,cells);
    }
    labelsCtx.drawImage(cells,line.left-1,line.middle-cells.height/(2*scale),cells.width/scale,cells.height/scale);
  }

  // The dossier's native HTML text uses the same phosphor cell as the CRT canvas.
  const dossierCell = document.createElement('canvas');
  dossierCell.width = dossierCell.height = 41;
  drawPhosphorDots(dossierCell.getContext('2d'),new Uint8ClampedArray(41*41*4).fill(255),41,41,2.05,0,0);
  root.style.setProperty('--dossier-phosphor-mask','url('+dossierCell.toDataURL()+')');

  const dossierReader = find('#dossier-reader');
  const headingDisplay = document.createElement('span');
  headingDisplay.className = 'dossier-heading-screen';
  headingDisplay.setAttribute('aria-hidden','true');
  const headingSignal = document.createElement('canvas');
  headingSignal.className = 'crt-signal';
  headingDisplay.append(headingSignal);
  let dossierHeadingReady = false;
  function drawDossierHeading() {
    const label = headingDisplay.parentElement;
    if (!label || !headingDisplay.clientWidth) return headingSignal;
    const density = Math.min(Math.max(1,devicePixelRatio),2.5);
    headingSignal.width = Math.max(1, Math.round(headingDisplay.clientWidth*density));
    headingSignal.height = Math.max(1, Math.round(headingDisplay.clientHeight*density));
    const target = headingSignal.getContext('2d',{willReadFrequently:true});
    const style = getComputedStyle(label);
    const bounds = headingDisplay.getBoundingClientRect();
    const xScale = headingSignal.width/bounds.width, yScale = headingSignal.height/bounds.height;
    target.font = style.fontWeight+' '+parseFloat(style.fontSize)*density+'px '+style.fontFamily;
    target.textBaseline = 'middle';
    target.fillStyle = '#fff';
    const text = label.firstChild;
    const range = document.createRange();
    for (const {index,segment} of graphemes.segment(text.data)) {
      range.setStart(text,index);
      range.setEnd(text,index+segment.length);
      const box = range.getBoundingClientRect();
      target.fillText(segment,(box.left-bounds.left)*xScale,(box.top+box.height/2-bounds.top)*yScale);
    }
    const pixels = target.getImageData(0,0,headingSignal.width,headingSignal.height);
    target.clearRect(0,0,pixels.width,pixels.height);
    drawPhosphorDots(target,pixels.data,pixels.width,pixels.height,2.05*density,0,0);
    return headingSignal;
  }
  dossierReader.addEventListener('dossier-selection',()=>{
    const label = dossierReader.querySelector('.dossier-title');
    if (!label || (dossierHeadingReady && !headingDisplay.crtLive)) return;
    headingDisplay.hidden = false;
    label.append(headingDisplay);
    if (!dossierHeadingReady) {
      dossierHeadingReady = true;
      // The reader's glass already projects the title with the surrounding text.
      window.createCrt(headingDisplay,{closeup:true,bendScale:0});
      if (!headingDisplay.crtLive) { headingDisplay.remove(); return; }
      headingDisplay.crtLive.setScene(drawDossierHeading,false);
      new ResizeObserver(()=>headingDisplay.crtLive.invalidate()).observe(headingDisplay);
    }
    if (headingDisplay.crtLive) {
      label.classList.add('dossier-heading-live');
      headingDisplay.crtLive.invalidate();
    }
  });
  dossierReader.addEventListener('close',()=>{
    headingDisplay.hidden = true;
    headingDisplay.remove();
    headingSignal.width = headingSignal.height = 1;
  });

  function filmPerforations(count,pitch,width,height,top) {
    const path = new Path2D();
    const left = (68-(count-1)*pitch-width)/2;
    const bottom = 68-top-height;
    for (let i=0;i<count;i++) {
      const x = left+i*pitch;
      path.rect(x,top,width,height);
      path.rect(x,bottom,width,height);
    }
    return path;
  }
  const iconPerforations = filmPerforations(6,8,4,4,16);
  const artworkPerforations = filmPerforations(10,5.6,3.2,3,17);

  function paintFilmIcon() {
    titleCtx.strokeRect(5,12,58,44);
    titleCtx.strokeRect(10,24,22,20);
    titleCtx.strokeRect(36,24,22,20);
    titleCtx.fill(iconPerforations);
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

  function paintFilmArtwork() {
    const film = titleCtx;
    const base = film.createLinearGradient(4,14,64,54);
    base.addColorStop(0,'rgba(255,255,255,.64)');
    base.addColorStop(1,'rgba(255,255,255,.22)');
    film.fillStyle = 'rgba(255,255,255,.64)';
    film.fillRect(4,14,60,8);
    film.fillRect(4,46,60,8);
    film.fillStyle = base;
    film.fillRect(4,22,60,24);
    film.lineWidth = 1;
    film.strokeStyle = 'rgba(255,255,255,.88)';
    film.strokeRect(4,14,60,40);
    for (const [x,reversed] of [[8,false],[36,true]]) {
      film.clearRect(x,23,24,21);
      film.save();
      film.beginPath();
      film.rect(x,23,24,21);
      film.clip();
      const exposure = film.createLinearGradient(x,23,x,44);
      exposure.addColorStop(0,reversed ? 'rgba(255,255,255,.15)' : 'rgba(255,255,255,.56)');
      exposure.addColorStop(1,reversed ? 'rgba(255,255,255,.36)' : 'rgba(255,255,255,.21)');
      film.fillStyle = exposure;
      film.fillRect(x,23,24,21);
      film.fillStyle = reversed ? 'rgba(255,255,255,.72)' : 'rgba(255,255,255,.80)';
      film.beginPath();
      film.moveTo(x,39);
      film.lineTo(x+7,29);
      film.lineTo(x+13,37);
      film.lineTo(x+18,32);
      film.lineTo(x+24,39);
      film.lineTo(x+24,44);
      film.lineTo(x,44);
      film.closePath();
      if (!reversed) film.globalCompositeOperation = 'destination-out';
      film.fill();
      film.beginPath();
      film.arc(x+18,27.5,2.2,0,Math.PI*2);
      film.globalCompositeOperation = reversed ? 'destination-out' : 'source-over';
      film.fillStyle = reversed ? '#fff' : 'rgba(255,255,255,.72)';
      film.fill();
      film.restore();
      film.strokeStyle = 'rgba(255,255,255,.72)';
      film.strokeRect(x,23,24,21);
    }
  }

  function paintGwentArtwork() {
    const card = titleCtx;
    for (const [x,y,angle,front] of [[18.5,35,-.30,false],[49.5,35,.30,false],[34,32,0,true]]) {
      card.save();
      card.translate(x,y);
      card.rotate(angle);
      card.clearRect(-12,-19,24,38);
      const paper = card.createLinearGradient(-12,-18,12,19);
      paper.addColorStop(0,front ? 'rgba(255,255,255,.46)' : 'rgba(255,255,255,.27)');
      paper.addColorStop(1,'rgba(255,255,255,.13)');
      card.fillStyle = paper;
      card.fillRect(-12,-19,24,38);
      card.lineWidth = 1.35;
      card.strokeStyle = front ? '#fff' : 'rgba(255,255,255,.70)';
      card.strokeRect(-12,-19,24,38);
      card.lineWidth = .85;
      card.strokeRect(-8,-10,16,22);
      card.fillStyle = 'rgba(255,255,255,.64)';
      card.fillRect(-8,-15,4.5,1.6);
      card.fillRect(3.5,14,4.5,1.6);
      if (front) {
        card.fillStyle = 'rgba(255,255,255,.29)';
        card.beginPath();
        card.moveTo(0,-8);
        card.lineTo(5.8,-5);
        card.lineTo(5,3.5);
        card.lineTo(0,9);
        card.lineTo(-5,3.5);
        card.lineTo(-5.8,-5);
        card.closePath();
        card.fill();
        card.lineWidth = 1.65;
        card.beginPath();
        card.moveTo(-3.8,5.5);
        card.lineTo(4,-4.8);
        card.moveTo(-3.9,1.4);
        card.lineTo(.1,4.7);
        card.stroke();
      } else {
        const side = Math.sign(angle)*4;
        card.strokeStyle = 'rgba(255,255,255,.58)';
        card.beginPath();
        card.moveTo(side,-5);
        card.lineTo(side+3,-.5);
        card.lineTo(side,4);
        card.lineTo(side-3,-.5);
        card.closePath();
        card.stroke();
      }
      card.restore();
    }
  }

  function drawArtworkCharacters(target,pixels,size,width) {
    const characters = ['','.',':','=','+','x+','2x','25','57','7#'];
    const pitch = size/Math.max(32,Math.round(width/6.3));
    const rowPitch = pitch*1.16;
    target.textAlign = 'center';
    target.textBaseline = 'middle';
    target.font = '700 '+pitch*1.38+'px Consolas, monospace';
    for (let y=rowPitch*.5;y<size;y+=rowPitch) {
      for (let x=pitch*.5;x<size;x+=pitch) {
        const center = (Math.floor(y)*size+Math.floor(x))*4+3;
        const offset = Math.max(1,Math.floor(pitch*.25));
        const light = (pixels[center]*2+pixels[center-offset*4]+pixels[center+offset*4])/1020;
        if (light<.07) continue;
        const variation = grain(x/pitch,y/rowPitch);
        const index = Math.round(limit(light+(variation-.5)*.16)*(characters.length-1));
        if (!index) continue;
        const choices = characters[index];
        target.globalAlpha = Math.min(1,.20+light*1.08);
        target.fillText(choices[Math.floor(variation*choices.length)],x,y);
      }
    }
    target.globalAlpha = 1;
  }

  function paintDownloaderIcon(artwork) {
    titleCtx.strokeRect(5,10,58,47);
    titleCtx.beginPath();
    titleCtx.moveTo(5,20);
    titleCtx.lineTo(63,20);
    titleCtx.moveTo(34,25);
    titleCtx.lineTo(34,43);
    titleCtx.moveTo(25,35);
    titleCtx.lineTo(34,44);
    titleCtx.lineTo(43,35);
    titleCtx.moveTo(20,44);
    titleCtx.lineTo(20,50);
    titleCtx.lineTo(48,50);
    titleCtx.lineTo(48,44);
    titleCtx.stroke();
    for (const x of [10,15,20]) titleCtx.fillRect(x,14,2,2);
    if (artwork) {
      titleCtx.lineWidth = .7;
      titleCtx.strokeRect(25,13,32,4);
      titleCtx.strokeRect(8,23,52,31);
      titleCtx.globalAlpha = .36;
      for (let y=27;y<48;y+=3) {
        titleCtx.fillRect(12,y,5,0.8);
        titleCtx.fillRect(51,y,5,0.8);
      }
      titleCtx.globalAlpha = 1;
    }
  }

  function paintFileIcon(icon,width,density) {
    const size = Math.max(1,Math.ceil(width*density));
    if (icon.width===size && paintedIcons.has(icon)) return;
    icon.width = icon.height = size;
    titleLayer.width = titleLayer.height = size;
    const unit = size/68;
    titleCtx.setTransform(unit,0,0,unit,0,0);
    titleCtx.strokeStyle = '#fff';
    titleCtx.fillStyle = '#fff';
    titleCtx.lineWidth = 2;
    const gwent = icon.dataset.icon==='gwent';
    const artwork = icon.classList.contains('file-art');
    if (icon.dataset.icon==='downloader') paintDownloaderIcon(artwork);
    else if (artwork) {
      if (gwent) paintGwentArtwork();
      else paintFilmArtwork();
    } else if (gwent) paintGwentIcon();
    else paintFilmIcon();
    const {data} = titleCtx.getImageData(0,0,size,size);
    const target = icon.getContext('2d');
    if (artwork) {
      target.fillStyle = '#fff';
      drawArtworkCharacters(target,data,size,width);
      if (icon.dataset.icon==='film') {
        // Punch through the final glyphs so cell size cannot shift or bridge a hole.
        target.save();
        target.scale(unit,unit);
        target.globalCompositeOperation = 'destination-out';
        target.fill(artworkPerforations);
        target.restore();
      }
    } else {
      drawPhosphorDots(target,data,size,size,2*density,0,0);
    }
    paintedIcons.add(icon);
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
    controls = [...root.querySelectorAll(controlSelector)].filter(control=>!control.closest('dialog'));
    const screen = display.getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    if (root.crtLive) {
      for (const control of controls) control.style.transform = '';
      titleStamps.clear();
      labelLayout = measureLabels();
      root.crtLive.setArtworkBounds([0,0,0,0]);
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
      // Embedded sheets may decode and enter the viewport before the first layout.
      for (const animation of coverAnimations.values()) animation.update();
      root.classList.add('crt-ready');
    } else {
      renderFallback(w,h);
    }
  }

  function renderFallback(w,h) {
    const bend = geometry.bend;
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
        const u = (geometry.blend(dx,dx*(1+.044*dy*dy+.022*dx*dx)*.96,bend)+1)*width/2-.5;
        const v = (geometry.blend(dy,dy*(1+.061*dx*dx+.018*dy*dy)*.96,bend)+1)*height/2-.5;
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
    const categoryId = category.dataset.category;
    const works = !about && categoryId==='works';
    const file = about ? null : openFile;
    const path = categoryId.toUpperCase();
    const {text} = window.zoeaLocale;
    const label = about ? text('aboutHeading','关于 ZOEA') : file ? text('fileDetails','文件详情') : category.textContent;
    heading.textContent = label;
    find('#zoea-directory').textContent = about ? 'C:\\ZOEA\\ABOUT>' :
      'C:\\ZOEA\\PROJECTS\\'+path+(file ? '\\'+(file.dataset.fileId ?? 'film-scan-helper').toUpperCase() : '')+'>';
    root.dataset.view = current;
    root.toggleAttribute('data-file-open',Boolean(file));
    aboutContent.hidden = !about;
    list.hidden = about;
    worksDirectory.hidden = !works || Boolean(file);
    const privateOpen = !worksDirectory.hidden && privateExpanded;
    worksLock.hidden = !privateOpen || worksUnlocked;
    worksReady.hidden = !privateOpen || !worksUnlocked;
    if (worksLock.hidden) {
      window.zoeaEntry?.hide();
      worksPassword.value = '';
      worksError = null;
    }
    updateWorksStatus();
    toolDirectory.hidden = about || Boolean(file) || categoryId!=='tools';
    for (const button of disclosures) {
      if (button===privateToggle) {
        privateBody.hidden = !privateExpanded;
        if (worksUnlocked) {
          button.removeAttribute('aria-haspopup');
          button.setAttribute('aria-controls','private-archive');
          button.setAttribute('aria-expanded',String(privateExpanded));
          button.textContent = (privateExpanded ? '▾ ' : '▸ ')+text('privateArchive','个人档案');
        } else {
          button.removeAttribute('aria-expanded');
          button.setAttribute('aria-haspopup','dialog');
          button.setAttribute('aria-controls','dossier-entry');
          button.textContent = text('privateArchiveLocked','[LOCKED] 个人档案');
        }
        continue;
      }
      const expanded = button.getAttribute('aria-expanded')==='true';
      const groupName = button.dataset.group==='mod' ? 'MOD' : text('programs','程序');
      button.textContent = (expanded ? '▾ ' : '▸ ')+groupName;
      document.getElementById(button.getAttribute('aria-controls')).hidden = !expanded;
    }
    for (const detail of fileDetails.values()) detail.hidden = detail!==file;
    canvas.setAttribute('aria-label',label);
    [...list.children].forEach((button,i)=>button.setAttribute('aria-pressed',String(!about && i===selected)));
    root.querySelectorAll('[data-page]').forEach(button=>{
      if (button.dataset.page===current) button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    });
    render();
  }

  function updateWorksStatus() {
    const {text} = window.zoeaLocale;
    errorWindow.hidden = !worksError;
    worksStatus.textContent = worksError ? text(...worksError) : '';
    worksPassword.setAttribute('aria-invalid',String(Boolean(worksError)));
  }

  function showAccessError(key,description) {
    worksError = [key,description];
    updateWorksStatus();
    render();
    retryButton.focus();
    document.dispatchEvent(new CustomEvent('zoea-access-result',{detail:{ok:false}}));
  }
  function retryAccess() {
    worksError = null;
    updateWorksStatus();
    render();
    worksPassword.focus();
    worksPassword.select();
  }
  retryButton.addEventListener('click',retryAccess);
  worksLock.addEventListener('keydown',event=>{
    if (event.key==='Escape' && worksError && !event.isComposing) {
      event.preventDefault();
      retryAccess();
    }
  });
  worksPassword.addEventListener('input',()=>{
    if (!worksError) return;
    worksError = null;
    updateWorksStatus();
    render();
  });
  worksLock.addEventListener('submit',async event=>{
    event.preventDefault();
    if (checkingPassword || worksLock.hidden) return;
    if (!worksPassword.value) {
      showAccessError('worksMissing','请输入访问密码。');
      return;
    }
    checkingPassword = true;
    try {
      if (!window.crypto?.subtle) {
        showAccessError('worksPasswordUnavailable','请通过 HTTPS 打开网站后再试。');
        return;
      }
      await window.zoeaDossier.unlock(worksPassword.value);
      if (worksLock.hidden) { window.zoeaDossier.lock(); return; }
      worksUnlocked = true;
      updateContent();
      find('.dossier-resume-launch').focus({preventScroll:true});
      document.dispatchEvent(new CustomEvent('zoea-access-result',{detail:{ok:true}}));
      refreshPanel();
    } catch (error) {
      if (worksLock.hidden) return;
      if (error.name==='OperationError') showAccessError('worksIncorrect','密码不正确，请重试。');
      else showAccessError('worksArchiveUnavailable','档案暂时未能载入，请重试。');
    } finally {
      checkingPassword = false;
    }
  });

  let panelAnimation;
  function refreshPanel() {
    if (root.crtLive) {
      root.crtLive.refreshPanel();
    } else if (!reduced.matches) {
      panelAnimation?.cancel();
      panelAnimation = panel.animate([{clipPath:'inset(0 100% 0 0)'},{clipPath:'inset(0)'}],
        {duration:geometry.panelWriteMs,easing:'cubic-bezier(.22,1,.36,1)'});
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
      // A steady core keeps the modules readable between the moving scanlines.
      target.globalAlpha = .9;
      target.drawImage(qqSource,0,0,size,size);
      target.globalAlpha = 1;
      drawPhosphorDots(target,data,size,size,2.05*density,0,0);
      return signal;
    },false);
    new ResizeObserver(()=>qqCode.crtLive.invalidate()).observe(qqCode);
  }
  qqSource.addEventListener('load',initializeQqDisplay);

  function bindGlassTilt(dialog, surface, tiltScale, isClosing=()=>false) {
    let pointerFrame = 0;
    function setTilt(x,y) {
      const gain = geometry.tilt*tiltScale;
      surface.style.setProperty('--dialog-tilt-x',`${-y*4.2*gain}deg`);
      surface.style.setProperty('--dialog-tilt-y',`${x*5.1*gain}deg`);
      surface.style.setProperty('--preview-light-x',`${50+x*39}%`);
      surface.style.setProperty('--preview-light-y',`${50+y*39}%`);
    }
    function resetTilt() {
      cancelAnimationFrame(pointerFrame);
      setTilt(0,0);
    }
    dialog.addEventListener('pointermove',event=>{
      if (isClosing() || reduced.matches || event.pointerType==='touch') return;
      cancelAnimationFrame(pointerFrame);
      const {clientX,clientY} = event;
      pointerFrame = requestAnimationFrame(()=>{
        // The native dialog stays flat while the single surface inside tilts.
        const box = dialog.getBoundingClientRect();
        setTilt(2*limit((clientX-box.left)/box.width)-1,2*limit((clientY-box.top)/box.height)-1);
      });
    },{passive:true});
    dialog.addEventListener('pointerleave',resetTilt);
    reduced.addEventListener('change',resetTilt);
    geometry.compactTouch.addEventListener('change',resetTilt);
    return {resetTilt,cancelTilt:()=>cancelAnimationFrame(pointerFrame)};
  }

  function bindPreview(dialog, surface, openers, tiltScale, afterOpen) {
    let closing;
    const glass = bindGlassTilt(dialog,surface,tiltScale,()=>Boolean(closing));
    function reset() {
      closing?.cancel();
      closing = null;
      glass.resetTilt();
    }
    function cue(open) {
      root.dispatchEvent(new CustomEvent('crt-dialog-toggle',{bubbles:true,detail:open}));
    }

    function dismiss(event) {
      event.preventDefault();
      if (!dialog.open || closing) return;
      glass.cancelTilt();
      cue(false);
      if (reduced.matches) {
        dialog.close();
        return;
      }
      closing = surface.animate([
        {clipPath:getComputedStyle(surface).clipPath,filter:'brightness(1)',opacity:1},
        {clipPath:'inset(49.3% 0)',filter:'brightness(2.3)',opacity:1,offset:.68},
        {clipPath:'inset(49.9% 46%)',filter:'brightness(2.5)',opacity:0}
      ],{duration:155*geometry.durationScale,easing:'ease-in',fill:'forwards'});
      closing.finished.then(()=>dialog.close(),()=>{});
    }
    function open() {
      if (dialog.open) return;
      reset();
      dialog.showModal();
      surface.scrollTop = 0;
      afterOpen?.();
      cue(true);
    }
    for (const opener of openers) opener.addEventListener('click',open);
    dialog.addEventListener('submit',dismiss);
    dialog.addEventListener('cancel',dismiss);
    dialog.addEventListener('click',event=>{
      if (event.target===dialog) dismiss(event);
    });
    dialog.addEventListener('close',()=>{
      if (!dialog.open) reset();
    });
    return open;
  }
  bindPreview(qqDialog,qqGlass,[qqButton],1,initializeQqDisplay);
  const entryWindow = find('#dossier-entry');
  const entryGlass = entryWindow?.querySelector('.preview-glass');
  if (entryGlass) {
    const entryTilt = bindGlassTilt(entryWindow,entryGlass,.72);
    entryWindow.addEventListener('close',entryTilt.resetTilt);
  }
  const dossierImage = find('#dossier-lightbox');
  const artworkBend = .52;
  window.bindDossierCurve(dossierReader,.20);
  window.bindDossierCurve(dossierImage,artworkBend);
  const inspector = find('#dossier-zoom');
  window.bindDossierCurve(inspector,.36);
  const inspectorTilt = bindGlassTilt(inspector,inspector.querySelector('.preview-glass'),.24);
  inspector.addEventListener('close',inspectorTilt.resetTilt);
  window.zoeaDossier.bindWindows(
    bindPreview(dossierReader,dossierReader.querySelector('.preview-glass'),[],.14),
    bindPreview(dossierImage,dossierImage.querySelector('.preview-glass'),[],.43)
  );
  const assetPanel = assetViewer.querySelector('.asset-viewport');
  const assetPhoto = new Image();
  const assetTabs = assetViewer.querySelector('.asset-tabs');
  const originalButton = assetViewer.querySelector('.asset-original');
  assetPanel.append(assetPhoto);
  let assetFigures = [], activeAsset = 0;

  function selectAsset(index) {
    activeAsset = index;
    const source = assetFigures[index].querySelector('img');
    assetPhoto.alt = source.alt;
    assetPhoto.src = source.currentSrc || source.src;
    assetPanel.setAttribute('aria-labelledby',assetTabs.children[index].id);
    for (const [i,tab] of Array.from(assetTabs.children).entries()) {
      tab.setAttribute('aria-selected',String(i===index));
      tab.tabIndex = i===index ? 0 : -1;
    }
  }

  function updateAssetLabels() {
    const {viewerKey,viewerTitle} = assetFigures[0].closest('.asset-example').dataset;
    assetViewer.querySelector('h2').textContent = window.zoeaLocale.text(viewerKey,viewerTitle);
    assetFigures.forEach((figure,i)=>{
      const number = String(i+1).padStart(2,'0');
      assetTabs.children[i].textContent = '['+number+'] '+figure.querySelector('figcaption').textContent;
    });
    selectAsset(activeAsset);
  }

  originalButton.addEventListener('click',()=>{
    const original = assetViewer.toggleAttribute('data-original');
    originalButton.setAttribute('aria-pressed',String(original));
  });
  assetViewer.addEventListener('keydown',event=>{
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const count = assetFigures.length;
    let next;
    switch (event.key) {
      case 'ArrowLeft': next = (activeAsset+count-1)%count; break;
      case 'ArrowRight': next = (activeAsset+1)%count; break;
      case 'Home': next = 0; break;
      case 'End': next = count-1; break;
      default: return;
    }
    event.preventDefault();
    selectAsset(next);
    assetTabs.children[next].focus({preventScroll:true});
  });
  document.addEventListener('zoea-language-change',()=>{
    if (assetViewer.open) updateAssetLabels();
  });
  const assetScreen = assetViewer.querySelector('.asset-screen');
  const assetCurve = find('#preview-screen-curve');
  function setAssetCurve() {
    const width = assetScreen.offsetWidth, height = assetScreen.offsetHeight;
    if (!width || !height) return;
    const longest = Math.max(width,height);
    const map = assetCurve.querySelector('feImage');
    assetCurve.setAttribute('width',width);
    assetCurve.setAttribute('height',height);
    map.setAttribute('width',width);
    map.setAttribute('height',height);
    // R/G encode the shared glassX/glassY offsets. Convert each axis to its own pixel extent.
    for (const [channel,size] of [['feFuncR',width],['feFuncG',height]]) {
      const slope = size/longest;
      const fn = assetCurve.querySelector(channel);
      fn.setAttribute('slope',slope);
      fn.setAttribute('intercept',(1-slope)/2);
    }
    assetCurve.querySelector('feDisplacementMap').setAttribute('scale',longest*.036*geometry.bend*artworkBend);
  }
  new ResizeObserver(setAssetCurve).observe(assetScreen);
  geometry.compactTouch.addEventListener('change',setAssetCurve);
  const openAssetViewer = bindPreview(assetViewer,assetViewer.querySelector('.asset-glass'),[],.82,setAssetCurve);
  for (const opener of root.querySelectorAll('.preview-thumb')) {
    opener.addEventListener('click',()=>{
      assetFigures = [...opener.closest('.asset-example').querySelectorAll('figure')];
      activeAsset = assetFigures.indexOf(opener.closest('figure'));
      assetTabs.replaceChildren(...assetFigures.map((figure,i)=>{
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.id = 'asset-tab-'+(i+1);
        tab.setAttribute('role','tab');
        tab.setAttribute('aria-controls',assetPanel.id);
        tab.addEventListener('click',()=>selectAsset(i));
        return tab;
      }));
      assetViewer.removeAttribute('data-original');
      originalButton.setAttribute('aria-pressed','false');
      updateAssetLabels();
      openAssetViewer();
    });
  }

  root.addEventListener('crt-view',event=>{
    if (assetViewer.open && event.detail!=='projects/tools/'+openFile?.dataset.fileId) assetViewer.close();
    if (event.detail!=='about' && qqDialog.open) {
      qqDialog.close();
    }
    if (event.detail==='projects/works/private') privateExpanded = true;
    else if (!worksUnlocked) privateExpanded = false;
    if (event.detail==='home') { window.zoeaEntry?.hide(); return; }
    const [,category,fileId] = event.detail.split('/');
    const previous = current, previousCategory = selected, previousFile = openFile;
    current = event.detail==='about' ? 'about' : 'project';
    if (category) selected = [...list.children].findIndex(button=>button.dataset.category===category);
    openFile = fileDetails.get(fileId) ?? null;
    if (openFile && category==='tools') {
      const tile = fileTiles.find(link=>link.hash==='#'+event.detail);
      const group = tile?.closest('.file-grid');
      disclosures.find(button=>button.getAttribute('aria-controls')===group?.id)?.setAttribute('aria-expanded','true');
    }
    if (previousFile!==openFile) window.scrollTo(0,0);
    updateContent();
    if (event.detail==='projects/works/private' && !worksUnlocked) window.zoeaEntry?.show();
    const changed = previous!==current || previousCategory!==selected || previousFile!==openFile;
    if (changed && root.crtEntryTime?.(performance.now()) < 0) refreshPanel();
  });
  for (const button of disclosures) {
    button.addEventListener('click',()=>{
      if (button===privateToggle) privateExpanded = !privateExpanded;
      else button.setAttribute('aria-expanded',String(button.getAttribute('aria-expanded')!=='true'));
      updateContent();
      if (button===privateToggle && !worksLock.hidden) window.zoeaEntry?.show();
    });
  }
  document.addEventListener('zoea-language-change',updateContent);
  root.addEventListener('dossier-lock',()=>{
    titleStamps.clear();
    worksUnlocked = false;
    updateContent();
    if (!worksLock.hidden) window.zoeaEntry?.show();
    worksPassword.focus();
  });
  root.addEventListener('dossier-entry-dismiss',()=>{
    privateExpanded = false;
    updateContent();
    privateToggle.focus({preventScroll:true});
  });
  window.zoeaDossier.restore().then(restored=>{
    if (!restored || worksUnlocked) return;
    worksUnlocked = true;
    updateContent();
  });
  let dossierRenderFrame = 0, revealCard = false;
  root.addEventListener('dossier-layout',event=>{
    revealCard ||= event.detail.reveal;
    if (dossierRenderFrame) return;
    dossierRenderFrame = requestAnimationFrame(()=>{
      dossierRenderFrame = 0;
      const reveal = revealCard;
      revealCard = false;
      if (worksReady.hidden || root.hidden || !worksReady.getClientRects().length) return;
      render();
      if (reveal && root.crtLive && labelLayout?.shelfBox) {
        const {left,top,width,height} = labelLayout.shelfBox;
        const w = display.clientWidth, h = display.clientHeight;
        root.crtLive.refreshPanel([left/w,top/h,(left+width)/w,(top+height)/h]);
      }
    });
  });
  document.addEventListener('zoea-input-change',()=>{
    find('.key-guide').hidden = document.documentElement.dataset.input!=='keyboard';
    if (!root.hidden) render();
  });
  root.querySelectorAll('[data-page]').forEach(button=>{
    button.addEventListener('click',()=>{location.hash=button.dataset.page==='about' ? 'about' : 'projects';});
  });
  [...list.children].forEach(button=>{
    button.addEventListener('click',()=>{
      location.hash='projects/'+button.dataset.category;
    });
  });
  function updateLabelHighlight(event) {
    if (root.hidden || !root.crtLive || !event.target.closest(controlSelector)) return;
    refreshLabels?.();
    root.crtLive.invalidate();
  }
  for (const event of ['focusin','focusout','pointerover','pointerout','crt-sound-change']) {
    root.addEventListener(event,updateLabelHighlight);
  }
  for (const img of contactImages) img.addEventListener('load',updateLabelHighlight);
  geometry.fullscreen.addEventListener('change',render);
  document.addEventListener('fullscreenchange',render);
  new ResizeObserver(()=>render()).observe(display);
  if (!root.crtLive) geometry.compactTouch.addEventListener('change',render);

})();
