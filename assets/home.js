(() => {
  const root = document.getElementById('zoea-monitor');
  window.createCrt(root);
  const terrainRenderer = root.crtLive && window.createTerrainRenderer?.();
  const screen = root.querySelector('.screen');
  const canvas = root.querySelector('.crt-signal');
  const ctx = canvas.getContext('2d',{alpha:false});
  if (!ctx) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const glyphs = '.,:+=/01257%#';
  const logoGlyphs = '0122334577789x+%#';
  const clamp = value => Math.max(0,Math.min(1,value));
  const bell = value => Math.exp(-value*value);
  let frame = 0;
  let seed = 71593;
  let logoMask;
  let layers;
  let terrainGrid;
  let background;
  const terminal = root.querySelector('.terminal');
  const terminalLabel = terminal.querySelector('.terminal-label');
  const terminalCaret = terminal.querySelector('.terminal-caret');
  let terminalLayout;
  let terminalX = 0, terminalY = 0;
  const portalIcons = [...root.querySelectorAll('.portals [data-platform]')].map(control=>({
    control, image:control.querySelector('img'), mask:null, dx:0, dy:0
  }));
  let portalLayout;
  const terrainSprites = new Map();
  const strokeLevels = 16;
  const ink = Array.from({length:strokeLevels+1},(_,i)=>'rgba(255,255,255,'+i/strokeLevels+')');

  function getTerrainSprites(size,scale) {
    const key = size+'@'+scale;
    if (terrainSprites.has(key)) return terrainSprites.get(key);
    const tile = Math.ceil(size*scale*2);
    const atlas = makeLayer(tile*glyphs.length,tile);
    atlas.font = size*scale+'px Consolas, monospace';
    atlas.textAlign = 'center';
    atlas.textBaseline = 'middle';
    atlas.fillStyle = '#fff';
    let inkAbove = 0, inkWidth = 0;
    for (let i=0;i<glyphs.length;i++) {
      const glyph = glyphs[i];
      const bounds = atlas.measureText(glyph);
      inkAbove = Math.max(inkAbove,bounds.actualBoundingBoxAscent);
      inkWidth = Math.max(inkWidth,bounds.actualBoundingBoxLeft,bounds.actualBoundingBoxRight);
      atlas.fillText(glyph,(i+.5)*tile,tile/2);
    }
    const sprite = {canvas:atlas.canvas,tile,span:tile/scale,ascent:inkAbove/scale+1,radius:inkWidth/scale+2};
    terrainSprites.set(key,sprite);
    return sprite;
  }

  function prepareTerrain(w,h,scale) {
    if (terrainGrid?.w===w && terrainGrid.h===h && terrainGrid.scale===scale) return terrainGrid.rows;
    terrainSprites.clear();
    const rows = [];
    const center = w*.51;
    for (let row=0;row<116;row++) {
      const depth = 30*Math.pow(.964,row)+.46;
      const perspective = h*.86/depth;
      if (perspective>h*.75) break;
      const step = Math.max(2.6,Math.min(8.4,perspective*.052));
      const size = Math.min(w/h>1.3?10.3:8.4,3.1+perspective*.049);
      const points = [];
      for (let px=-step;px<w+step;px+=step) {
        points.push({x:px, worldX:(px-center)/perspective+.16, pool:bell((px-center)/(w*.32)), y:0, height:0});
      }
      const unresolved = perspective<Math.max(32,h*.053);
      rows.push({depth,perspective,step,size,points,unresolved,sprite:getTerrainSprites(size,scale),
        strokes:Array.from({length:strokeLevels+1},()=>[])});
    }
    const renderer = terrainRenderer?.available && terrainRenderer.resize(w,h,scale,rows) ? terrainRenderer : null;
    terrainGrid = {w,h,scale,rows,renderer};
    return rows;
  }
  function paint(surface) {
    ctx.putImageData(surface,0,0);
  }

  function random() {
    seed = (Math.imul(seed,1664525)+1013904223)>>>0;
    return seed/4294967296;
  }

  function makeLayer(w,h,readback=false) {
    const layer = document.createElement('canvas');
    layer.width = w;
    layer.height = h;
    return layer.getContext('2d',{willReadFrequently:readback});
  }

  function drawBackground(target,w,h,scale) {
    if (background?.w!==w || background.h!==h || background.scale!==scale) {
      const layer = makeLayer(Math.round(w*scale),Math.round(h*scale));
      const pitch = w<420 ? 4 : 5.5;
      layer.scale(scale,scale);
      layer.font = '700 '+pitch*1.37+'px Consolas, monospace';
      layer.textAlign = 'center';
      layer.textBaseline = 'middle';
      for (let y=pitch*.5;y<h*.64;y+=pitch*1.15) {
        const floor = .008+.045*bell((y/h-.64)/.37);
        const fade = 1-clamp((y/h-.54)/.10);
        for (let x=pitch*.5;x<w;x+=pitch) {
          const value = Math.sin(x*127.1+y*311.7)*43758.5453;
          const light = floor+(value-Math.floor(value)-.5)*.10;
          const index = Math.round(light*12);
          if (index<1) continue;
          layer.fillStyle = 'rgba(255,255,255,'+(.16+light*1.36)*fade+')';
          layer.fillText(index===1 ? '.' : ':',x,y);
        }
      }
      background = {w,h,scale,canvas:layer.canvas};
    }
    target.drawImage(background.canvas,0,0,w,h);
  }

  function fillGlow(target,x,y,rx,ry,opacity) {
    target.save();
    target.translate(x,y);
    target.scale(rx,ry);
    const grad = target.createRadialGradient(0,0,0,0,0,1);
    grad.addColorStop(0,'rgba(255,255,255,'+opacity+')');
    grad.addColorStop(.17,'rgba(255,255,255,'+opacity*.58+')');
    grad.addColorStop(1,'rgba(255,255,255,0)');
    target.fillStyle = grad;
    target.fillRect(-1,-1,2,2);
    target.restore();
  }

  function getLogoMask(logoWidth,logoHeight) {
    if (logoMask?.width === logoWidth && logoMask.height === logoHeight) return logoMask.alpha;
    const mask = makeLayer(logoWidth,logoHeight,true);
    mask.font = '900 160px "Arial Black","Arial",sans-serif';
    const metrics = mask.measureText('ZOEA');
    const ascent = metrics.actualBoundingBoxAscent || 115;
    const descent = metrics.actualBoundingBoxDescent || 0;
    const inkWidth = metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight || metrics.width;
    mask.scale(logoWidth/inkWidth,logoHeight/(ascent+descent));
    mask.fillText('ZOEA',metrics.actualBoundingBoxLeft || 0,ascent);
    const alpha = mask.getImageData(0,0,logoWidth,logoHeight).data;
    logoMask = {width:logoWidth,height:logoHeight,alpha};
    return alpha;
  }

  function foregroundTransform(w,h,x,y) {
    return new DOMMatrix([1,x*.020,y*.026,1,
      x*w*.010-y*.026*h*.32,y*h*.009-x*.020*w*.5]);
  }

  function glassSample(x,y,w,h) {
    const nx = x/w*2-1, ny = y/h*2-1;
    return [
      (.5+.48*nx*(1+.044*ny*ny+.022*nx*nx))*w,
      (.5+.48*ny*(1+.061*nx*nx+.018*ny*ny))*h
    ];
  }

  function screenPoint(x,y,w,h,transform,px,py) {
    const moved = transform.transformPoint({x,y});
    for (let i=0;i<4;i++) {
      const [u,v] = glassSample(px,py,w,h);
      px += moved.x-u;
      py += moved.y-v;
    }
    return [px,py];
  }

  function drawTerminal(target,w,h,time,still,transform) {
    if (terminalLayout?.w!==w || terminalLayout.h!==h) {
      const origin = screen.getBoundingClientRect();
      const label = terminalLabel.getBoundingClientRect();
      const caret = terminalCaret.getBoundingClientRect();
      const left = label.left-origin.left-terminalX;
      const top = label.top-origin.top-terminalY;
      const [x,y] = glassSample(left,top,w,h);
      const style = getComputedStyle(terminalLabel);
      const mask = makeLayer(Math.ceil(label.width*2),Math.ceil(label.height*2),true);
      mask.scale(2,2);
      mask.font = '700 '+style.fontSize+' '+style.fontFamily;
      mask.textBaseline = 'middle';
      mask.fillText('enter',0,label.height/2);
      const width = mask.canvas.width;
      const pixels = mask.getImageData(0,0,width,mask.canvas.height).data;
      const cells = [];
      for (let row=1;row<mask.canvas.height;row+=3) {
        for (let col=1;col<width;col+=3) {
          const opacity = pixels[(row*width+col)*4+3];
          if (opacity>90) cells.push([col/2,row/2,opacity/255]);
        }
      }
      const [cx,cy] = glassSample(caret.left-origin.left-terminalX,caret.top-origin.top-terminalY,w,h);
      terminalLayout = {w,h,left,top,x,y,cells,cx,cy,cw:caret.width,ch:caret.height};
      root.crtLive.setEntryCaret([(cx+caret.width/2)/w,(cy+caret.height/2)/h,caret.width/2,caret.height/2]);
    }
    const layout = terminalLayout;
    const highlighted = terminal.matches(':hover,:focus-visible');
    target.fillStyle = '#fff';
    for (const [x,y,alpha] of layout.cells) {
      target.globalAlpha = alpha*(highlighted ? .96 : .76);
      target.fillRect(layout.x+x,layout.y+y,1.17,1.14);
    }
    if (still || time%1.35<.675) {
      target.globalAlpha = highlighted ? 1 : .91;
      target.fillRect(layout.cx,layout.cy,layout.cw,layout.ch);
    }
    target.globalAlpha = 1;
    const [px,py] = screenPoint(layout.x,layout.y,w,h,transform,layout.left,layout.top);
    const dx = px-layout.left, dy = py-layout.top;
    if (Math.abs(terminalX-dx)>.10 || Math.abs(terminalY-dy)>.10) {
      terminalX = dx;
      terminalY = dy;
      terminal.style.setProperty('--terminal-x',dx+'px');
      terminal.style.setProperty('--terminal-y',dy+'px');
    }
    root.classList.add('crt-terminal-ready');
  }

  function drawPortals(target,w,h,transform) {
    if (portalLayout?.w!==w || portalLayout.h!==h) {
      if (portalIcons.some(({image})=>!image.complete || !image.naturalWidth)) return;
      const origin = screen.getBoundingClientRect();
      const icons = portalIcons.map(portal=>{
        const box = portal.image.getBoundingClientRect();
        const x = box.left-origin.left+box.width/2-portal.dx;
        const y = box.top-origin.top+box.height/2-portal.dy;
        const [sx,sy] = glassSample(x,y,w,h);
        return {portal,x,y,sx,sy,width:box.width,height:box.height};
      });
      portalLayout = {w,h,icons};
    }
    for (const {portal,x,y,sx,sy,width,height} of portalLayout.icons) {
      const {control,image} = portal;
      if (!portal.mask) {
        const mask = makeLayer(72,72);
        mask.drawImage(image,0,0,72,72);
        mask.globalCompositeOperation = 'source-in';
        mask.fillStyle = '#fff';
        mask.fillRect(0,0,72,72);
        portal.mask = mask.canvas;
      }
      const bright = control.matches(':hover, :focus-visible');
      target.globalAlpha = bright ? .98 : .72;
      target.drawImage(portal.mask,sx-width/2,sy-height/2,width,height);

      // Align each native hit area with the rendered icon after projection.
      const [px,py] = screenPoint(sx,sy,w,h,transform,x,y);
      const dx = px-x, dy = py-y;
      if (Math.abs(dx-portal.dx)>.08 || Math.abs(dy-portal.dy)>.08) {
        portal.dx = dx;
        portal.dy = dy;
        control.style.setProperty('--portal-x',dx+'px');
        control.style.setProperty('--portal-y',dy+'px');
      }
    }
    target.globalAlpha = 1;
    root.classList.add('crt-portals-ready');
  }

  function drawLogo(target,w,h,time,pointerX,pointerY,still,live) {
    const wide = w/h>1.3;
    const logoWidth = Math.round(w*(wide?.76:.84));
    const logoHeight = Math.round(h*(wide?.255:.197));
    const left = (w-logoWidth)/2;
    const top = h*.445-logoHeight;
    const alpha = getLogoMask(logoWidth,logoHeight);
    const rows = wide ? 21 : 15;
    const pitchY = logoHeight/rows;
    const columns = Math.round(logoWidth/(pitchY*.83));
    const pitchX = logoWidth/columns;

    target.save();
    target.font = '700 '+(pitchY*1.03)+'px Consolas, monospace';
    target.textAlign = 'center';
    target.textBaseline = 'middle';
    const transform = foregroundTransform(w,h,pointerX,pointerY);
    target.transform(transform.a,transform.b,transform.c,transform.d,transform.e,transform.f);
    for (let row=0;row<rows;row++) {
      const y = (row+.5)*pitchY;
      for (let column=0;column<columns;column++) {
        const x = (column+.5)*pitchX;
        const coverage = alpha[(Math.floor(y)*logoWidth+Math.floor(x))*4+3]/255;
        if (coverage<.36) continue;
        const grain = random();
        const initial = Math.floor(random()*logoGlyphs.length);
        const phase = time*.24+pointerX*.08-(left+x)/w;
        const localClock = time*(.32+.23*grain)+grain*17;
        const refresh = still ? 0 : Math.floor(localClock)-Math.floor(grain*17);
        const cycle = still ? 0 : Math.floor(phase)+1;
        const sweep = still ? 0 : bell((phase-Math.round(phase))/.085);
        const focus = bell((x/logoWidth-.5-pointerX*.53)/.20)
          *bell((y/logoHeight-.5-pointerY*.7)/.50);
        const afterglow = still ? 0 : .18*Math.exp(-7*(localClock%1));
        const brightness = Math.min(1,(.78+.22*grain)*(1+.24*sweep+.16*focus*Math.hypot(pointerX,pointerY)+afterglow))*coverage;
        target.fillStyle = 'rgba(255,255,255,'+brightness+')';
        const index = initial+cycle*(1+Math.floor(grain*6))+refresh*5;
        target.fillText(logoGlyphs[((index%logoGlyphs.length)+logoGlyphs.length)%logoGlyphs.length],left+x,top+y);
      }
    }
    if (live) {
      drawTerminal(target,w,h,time,still,transform);
      drawPortals(target,w,h,transform);
    }
    target.restore();
  }

  function elevation(x,z) {
    const ridge = Math.sin(x*1.72+z*.73)*.39 + Math.cos(x*.75-z*.54)*.26
      + Math.sin(x*3.96-z*1.3)*.115 + Math.cos(x*8.3+z*2.1)*.043;
    const valley = .36+.64*(1-bell((x-.18*Math.sin(z))/.96));
    return ridge*valley;
  }

  function drawTerrain(target,w,h,horizon,time,pointerX,pointerY,still,scale) {
    const travel = still ? 0 : .49*Math.sin(time*.43)+.17*Math.sin(time*.91);
    target.textAlign = 'center';
    target.textBaseline = 'middle';
    const sweep = time*.24+pointerX*.08;
    const rows = prepareTerrain(w,h,scale);
    const renderer = terrainGrid.renderer?.available ? terrainGrid.renderer : null;
    renderer?.begin();
    for (const {depth,perspective,points} of rows) {
      const worldZ = depth+travel;
      for (const point of points) {
        const x = point.worldX+pointerX*.30;
        const height = elevation(x,worldZ);
        point.height = height;
        point.y = horizon+(1.16-height)*perspective;
      }
    }

    // The opaque slopes in front already cover these marks. Keep a conservative
    // horizon per screen interval, including the full footprint of each glyph.
    const interval = 4;
    const occlusion = terrainGrid.occlusion ??= new Float32Array(Math.ceil(w/interval));
    occlusion.fill(Infinity);
    for (let row=rows.length-1;row>=0;row--) {
      const terrainRow = rows[row];
      const {points,step,sprite} = terrainRow;
      terrainRow.visible = false;
      const extent = Math.max(step+1,sprite.radius);
      for (let i=1;i<points.length;i++) {
        const point = points[i];
        const first = Math.max(0,Math.floor((point.x-extent)/interval));
        const end = Math.min(occlusion.length-1,Math.floor((point.x+extent)/interval));
        const top = Math.min(point.y-sprite.ascent,points[i-1].y-1);
        point.visible = false;
        for (let slot=first;slot<=end;slot++) {
          if (top<=occlusion[slot]+1) {
            point.visible = true;
            terrainRow.visible = true;
            break;
          }
        }
      }
      let i = 1;
      for (let slot=0;slot<occlusion.length;slot++) {
        const left = slot*interval;
        const right = Math.min(w,left+interval);
        while (points[i].x<left) i++;
        const previous = points[i-1];
        const next = points[i];
        let bound = previous.y+(next.y-previous.y)*(left-previous.x)/step;
        while (points[i].x<right) {
          bound = Math.max(bound,points[i].y);
          i++;
        }
        const a = points[i-1], b = points[i];
        bound = Math.max(bound,a.y+(b.y-a.y)*(right-a.x)/step);
        occlusion[slot] = Math.min(occlusion[slot],bound);
      }
    }

    for (const {depth,step,size:glyphSize,points,unresolved,sprite,strokes,visible} of rows) {
      const worldZ = depth+travel;
      if (!visible) {
        // Keep the same deterministic character choices in the rows in front.
        for (let i=1;i<points.length;i++) random();
        continue;
      }

      if (renderer) {
        for (let i=1;i<points.length;i++) renderer.slope(points[i-1],points[i],h+3);
      } else {
        target.beginPath();
        target.moveTo(-step,h+3);
        for (const point of points) target.lineTo(point.x,point.y);
        target.lineTo(w+step,h+3);
        target.closePath();
        target.fillStyle = '#020202';
        target.fill();
      }

      target.lineWidth = .75;
      const {canvas,tile,span} = sprite;
      for (const bucket of strokes) bucket.length = 0;
      for (let i=1;i<points.length;i++) {
        const point = points[i];
        const grain = random();
        if (!point.visible || point.y>h+5) continue;
        const x = point.worldX+pointerX*.30;
        const slope = (elevation(x+.065,worldZ)-point.height)/.065;
        const depthLight = bell((point.y-horizon)/(h*.16));
        const trace = still ? 0 : bell(Math.sin(worldZ*.44+x*.24-time*1.6)/.17);
        const spot = bell((point.x/w-.5-pointerX*.45)/.2)*Math.abs(pointerY);
        const light = clamp(.25+point.pool*(.11+depthLight*.37)+slope*.14+point.height*.21+.18*trace+.11*spot);
        const intensity = clamp(light*(.65+grain*.53));
        point.intensity = intensity;
        point.grain = grain;
        if (step<4.1 || grain>.78) {
          const strength = unresolved ? .94 : step<4.1 ? .85 : .37;
          strokes[Math.round(strokeLevels*intensity*strength)].push(i);
        }
      }
      for (let level=1;level<strokes.length;level++) {
        if (!strokes[level].length) continue;
        if (renderer) {
          for (const i of strokes[level]) renderer.trace(points[i-1],points[i],level/strokeLevels);
          continue;
        }
        target.strokeStyle = ink[level];
        target.beginPath();
        for (const i of strokes[level]) {
          target.moveTo(points[i-1].x,points[i-1].y);
          target.lineTo(points[i].x,points[i].y);
        }
        target.stroke();
      }
      if (unresolved) continue;
      for (let i=1;i<points.length;i++) {
        const point = points[i];
        if (!point.visible || point.y>h+5) continue;
        const {grain,intensity} = point;
        const initial = Math.floor(grain*glyphs.length);
        const tick = still ? 0 : Math.floor(sweep-point.x/w)+1;
        if (step>=3.15 || grain>.36) {
          const index = ((initial+tick)%glyphs.length+glyphs.length)%glyphs.length;
          if (renderer) renderer.glyph(sprite,index,point.x-span/2,point.y-span/2,intensity);
          else {
            target.globalAlpha = intensity;
            target.drawImage(canvas,index*tile,0,tile,tile,point.x-span/2,point.y-span/2,span,span);
          }
          if (step>5.6 && grain>.42) {
            const secondary = ((glyphs.length-1-initial+tick)%glyphs.length+glyphs.length)%glyphs.length;
            const x = point.x+1-span/2, y = point.y+glyphSize*.67-span/2;
            if (renderer) renderer.glyph(sprite,secondary,x,y,intensity*.41);
            else {
              target.globalAlpha = intensity*.41;
              target.drawImage(canvas,secondary*tile,0,tile,tile,x,y,span,span);
            }
          }
          if (!renderer) target.globalAlpha = 1;
        }
      }
    }
    renderer?.draw(target,w,h);
  }

  function buildSignal(w,h,scale=1,time=0,pointerX=0,pointerY=0,still=true,live=false) {
    seed = 71593;
    const width = Math.round(w*scale), height = Math.round(h*scale);
    if (layers?.[0].canvas.width !== width || layers[0].canvas.height !== height) {
      layers = Array.from({length:3},()=>makeLayer(width,height));
    }
    const [signal,diffuse,halo] = layers;
    signal.setTransform(scale,0,0,scale,0,0);
    signal.fillStyle = '#000';
    signal.fillRect(0,0,w,h);
    if (!live) drawBackground(signal,w,h,scale);
    const horizon = h*(.555+pointerY*.012);

    for (let i=0;i<180;i++) {
      const x = w*(.065+.87*random()-pointerX*.003);
      const y = h*(.10+.48*random()-pointerY*.003);
      const intensity = Math.pow(random(),3);
      const size = 1+intensity*.78;
      if (intensity<.12) continue;
      const light = still ? 1 : .84+.16*Math.cos(time*1.35+i*.71);
      signal.fillStyle = 'rgba(255,255,255,'+(.12+intensity*.48)*light+')';
      signal.fillRect(x,y,size,size);
      if (intensity>.90) {
        signal.fillRect(x-2,y+.55,5.8,.68);
        signal.fillRect(x+.55,y-2,.68,5.8);
      }
    }

    drawTerrain(signal,w,h,horizon,time,pointerX,pointerY,still,scale);
    signal.globalCompositeOperation = 'screen';
    const lightX = w*(.51+pointerX*.047);
    const light = still ? 1 : 1+.08*Math.sin(time*1.15);
    fillGlow(signal,lightX,horizon+h*.059,w*.39,h*.084,.46*light);
    fillGlow(signal,lightX,horizon+h*.052,w*.23,h*.016,.51*light);
    signal.globalCompositeOperation = 'source-over';
    drawLogo(signal,w,h,time,pointerX,pointerY,still,live);
    if (live) return signal.canvas;

    diffuse.filter = 'blur('+Math.max(2.3,h*.0075)*scale+'px)';
    diffuse.globalCompositeOperation = 'copy';
    diffuse.drawImage(signal.canvas,0,0);
    halo.filter = 'blur('+Math.max(7,h*.031)*scale+'px)';
    halo.globalCompositeOperation = 'copy';
    halo.drawImage(signal.canvas,0,0);
    return [signal.canvas,diffuse.canvas,halo.canvas];
  }

  const tone = Array.from({length:1024},(_,index)=>{
    const light = index/1023;
    return [
      Math.min(255,6+328*Math.pow(light,.79)),
      Math.min(255,4+269*Math.pow(light,1.05)),
      Math.min(255,3+209*Math.pow(light,1.51))
    ];
  });

  function project(w,h) {
    const [signal,diffuse,halo] = buildSignal(w,h)
      .map(layer=>layer.getContext('2d').getImageData(0,0,w,h).data);
    const surface = ctx.createImageData(w,h);
    const glass = new Uint8ClampedArray(surface.data.length);
    const final = new Uint8ClampedArray(surface.data.length);
    const scanPitch = Math.max(2.15,h/232);
    const centerX = w/2, centerY = h/2;
    for (let y=0;y<h;y++) {
      const dy = (y+.5-centerY)/centerY;
      for (let x=0;x<w;x++) {
        const dx = (x+.5-centerX)/centerX;
        const idx = (y*w+x)*4;
        const radius = dx*dx+dy*dy;
        // Inverse mapping makes the tube's center bulge out toward the viewer.
        const sx = ((dx*(1+.044*dy*dy+.022*dx*dx)*.96)+1)*centerX-.5;
        const sy = ((dy*(1+.061*dx*dx+.018*dy*dy)*.96)+1)*centerY-.5;
        const vignette = Math.max(.57,1-(.065*dx*dx+.083*dy*dy+.059*radius*radius));
        const grain = random()-.5;
        const reflected = .075*bell((dx+.50)/.79)*bell((dy+.56-.20*dx)/.43)
          + .035*bell((dx-.24)/.91)*bell((dy-.52)/.63);
        const base = clamp((reflected+.018+grain*.015)*vignette);
        const back = tone[Math.round(base*1023)];
        glass[idx] = back[0];
        glass[idx+1] = back[1];
        glass[idx+2] = back[2];
        glass[idx+3] = 255;
        const u = Math.max(0,Math.min(w-1.001,sx));
        const v = Math.max(0,Math.min(h-1.001,sy));
        const sampleX = Math.floor(u);
        const sampleY = Math.floor(v);
        const partX = u-sampleX;
        const partY = v-sampleY;
        const sample = (sampleY*w+sampleX)*4;
        const top = signal[sample]*(1-partX)+signal[sample+4]*partX;
        const bottom = signal[sample+w*4]*(1-partX)+signal[sample+w*4+4]*partX;
        const sharp = (top*(1-partY)+bottom*partY)/255;
        const edgeSoftness = .09+.24*clamp((radius-.25)/1.4);
        const luminance = sharp*(1-edgeSoftness)+diffuse[sample]/255*edgeSoftness;
        const phase = sy/scanPitch-Math.round(sy/scanPitch);
        const beamWidth = .20+.20*Math.sqrt(luminance);
        const beam = .36+.64*bell(phase/beamWidth);
        const phosphor = .94+.06*Math.cos(2*Math.PI*sx/2.75);
        const logoLight = bell((v/h-.32)/.18);
        const bloom = diffuse[sample]/255*(.43+.56*logoLight)
          + halo[sample]/255*(.37+.35*logoLight);
        const intensity = clamp(base*(.91+.09*beam)+(luminance*beam*phosphor+bloom)*vignette);
        const color = tone[Math.round(intensity*1023)];
        final[idx] = color[0];
        final[idx+1] = color[1];
        final[idx+2] = color[2];
        final[idx+3] = 255;
      }
    }
    return {surface,glass,final};
  }

  let dimensions = '';
  function render() {
    const width = screen.clientWidth;
    const height = screen.clientHeight;
    if (width < 2 || height < 2) return;
    const density = devicePixelRatio || 1;
    const size = width+'x'+height+'@'+density;
    if (size===dimensions) return;
    const first = !dimensions;
    dimensions = size;
    cancelAnimationFrame(frame);
    if (root.crtLive) {
      const scale = Math.min(Math.max(1,density),2.5,Math.sqrt(7500000/(width*height)));
      root.crtLive.setScene((time,x,y,still)=>buildSignal(width,height,scale,time,x,y,still,true));
      return;
    }
    const scale = Math.min(1.35,1140/width,1000/height);
    const w = Math.round(width*scale);
    const h = Math.round(height*scale);
    canvas.width = w;
    canvas.height = h;
    const {surface,glass,final} = project(w,h);
    screen.classList.add('ready');
    if (!first || reduced.matches) {
      surface.data.set(final);
      paint(surface);
      return;
    }

    let started;
    function expose(now) {
      started ??= now;
      const time = clamp((now-started)/920);
      if (time === 1) {
        surface.data.set(final);
      } else {
        for (let row=0;row<h;row++) {
          const y = row/h;
          const exposure = .13+.87*clamp((time*1.56-y*.70)/.38);
          const streak = .055*bell((y-time*1.25)/.055);
          const firstIndex = row*w*4;
          const logoBand = y>.17 && y<.46;
          const drift = logoBand ? Math.round(Math.sin(row*.27+time*15)*w*.048*(1-clamp(time/.78))**2) : 0;
          for (let column=0;column<w;column++) {
            const i = firstIndex+column*4;
            const sample = firstIndex+Math.max(0,Math.min(w-1,column+drift))*4;
            surface.data[i] = glass[i]+(final[sample]-glass[sample])*exposure+streak*160;
            surface.data[i+1] = glass[i+1]+(final[sample+1]-glass[sample+1])*exposure+streak*91;
            surface.data[i+2] = glass[i+2]+(final[sample+2]-glass[sample+2])*exposure;
            surface.data[i+3] = 255;
          }
        }
      }
      paint(surface);
      if (time < 1) frame = requestAnimationFrame(expose);
    }
    frame = requestAnimationFrame(expose);
  }

  new ResizeObserver(render).observe(screen);
  render();

  for (const {control,image} of portalIcons) {
    image.addEventListener('load',()=>root.crtLive?.invalidate());
    for (const event of ['focus','blur','pointerenter','pointerleave']) {
      control.addEventListener(event,()=>root.crtLive?.invalidate());
    }
  }
  for (const event of ['focus','blur','pointerenter','pointerleave']) {
    terminal.addEventListener(event,()=>root.crtLive?.invalidate());
  }
})();
