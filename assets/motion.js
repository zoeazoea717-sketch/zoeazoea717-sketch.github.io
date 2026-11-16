window.crtGeometry = (() => {
  const compactTouch = matchMedia([
    '(hover: none) and (pointer: coarse) and (max-width: 600px)',
    '(hover: none) and (pointer: coarse) and (max-height: 600px)'
  ].join(', '));
  const blend = (flat,curved,bend) => bend===1 ? curved : flat+(curved-flat)*bend;
  return {
    compactTouch,
    fullscreen:matchMedia('(display-mode: fullscreen)'),
    get bend() { return compactTouch.matches ? .28 : 1; },
    get tilt() { return compactTouch.matches ? .35 : 1; },
    blend,
    glassX: (x,y,bend) => blend(.5*x,.48*x*(1+.044*y*y+.022*x*x),bend),
    glassY: (x,y,bend) => blend(.5*y,.48*y*(1+.061*x*x+.018*y*y),bend)
  };
})();

window.createCrt = function createCrt(root,{closeup=false}={}) {
  const geometry = window.crtGeometry;
  const source = root.querySelector('.crt-signal');
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false });
  if (!gl) return;

  const vertex = '#version 300 es\nvoid main(){ vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2); gl_Position=vec4(p*2.-1.,0.,1.); }';
  const fragment = '#version 300 es\n' + [
    'precision highp float;',
    'out vec4 color;',
    'uniform vec2 size, viewport, pointer;',
    'uniform vec4 panel, entryCaret;',
    'uniform float elapsed, panelRefresh, power, pointerPresence, entryTime, bend;',
    'uniform bool home, closeup;',
    'uniform sampler2D signalTex;',
    'float bell(float x){return exp(-x*x);}',
    'float lineMark(float distance, float width){',
    '  float aa=max(.22,fwidth(distance)*.55);',
    '  return 1.-smoothstep(max(0.,width-aa),width+aa,distance);',
    '}',
    'float panelGraticule(vec2 p, vec2 extent){',
    '  vec2 inset=min(vec2(18.),extent*.07);',
    '  vec2 interior=max(vec2(1.),extent-2.*inset);',
    '  vec2 cell=interior/vec2(8.,6.);',
    '  vec2 centered=p-extent*.5;',
    '  vec2 grid=abs(fract(centered/cell+.5)-.5)*cell;',
    '  vec2 norm=abs(centered)/(interior*.5);',
    '  float envelope=exp(-1.45*dot(norm,norm));',
    '  float boundary=min(min(p.x-inset.x,p.y-inset.y),min(extent.x-inset.x-p.x,extent.y-inset.y-p.y));',
    '  float fade=smoothstep(0.,min(15.,min(cell.x,cell.y)*.30),boundary);',
    '  float divisions=max(lineMark(grid.x,.40),lineMark(grid.y,.40));',
    '  float axes=max(lineMark(abs(centered.x),.58),lineMark(abs(centered.y),.58));',
    '  vec2 minor=abs(fract(centered/(cell*.25)+.5)-.5)*cell*.25;',
    '  float ticks=max(lineMark(minor.x,.45)*(1.-smoothstep(2.,3.9,abs(centered.y))),',
    '    lineMark(minor.y,.45)*(1.-smoothstep(2.,3.9,abs(centered.x))));',
    '  return fade*envelope*(.089*divisions+.062*axes+.046*ticks);',
    '}',
    'vec2 archivePerspective(vec2 point){',
    '  float aspect=viewport.x/viewport.y;',
    '  vec2 angle=vec2(pointer.y*.063,-pointer.x*.080);',
    '  vec2 s=sin(angle), c=cos(angle);',
    '  vec3 right=vec3(c.y,0.,-s.y);',
    '  vec3 down=vec3(s.y*s.x,c.x,c.y*s.x);',
    '  vec3 normal=cross(right,down);',
    '  const float distance=2.3;',
    '  vec3 ray=vec3((point-.5)*vec2(aspect,1.),distance);',
    '  vec3 hit=ray*(distance*normal.z/dot(normal,ray))-vec3(0.,0.,distance);',
    '  return .5+vec2(dot(hit,right)/aspect,dot(hit,down));',
    '}',
    'vec4 phosphor(float value, float terrain){',
    '  vec3 amber=min(vec3(1.),vec3(328.,269.,209.)*pow(vec3(clamp(value,0.,1.)),vec3(.79,1.05,1.51))/255.);',
    '  float opacity=max(terrain,amber.r);',
    // Output premultiplied color for the browser compositor. Preserve the fade below the old normalization floor.
    '  return vec4(amber*min(1.,opacity/.001),opacity);',
    '}',
    'float entryAfterglow(vec2 point){',
    '  vec2 center=point*viewport*.5;',
    '  float dotTime=max(0.,entryTime-178.);',
    '  float dotSize=mix(2.4,1.,smoothstep(0.,50.,dotTime));',
    '  float dotGlow=.88*bell(length(center)/dotSize)+.17*bell(length(center)/7.);',
    '  float decay=smoothstep(171.,182.,entryTime)*exp(-dotTime/19.)',
    '    *(1.-smoothstep(222.,250.,entryTime));',
    '  float glow=dotGlow*decay;',
    '  if(home){',
    '    float lineAge=clamp((entryTime-150.)/32.,0.,1.);',
    '    float halfWidth=mix(.84,5./viewport.x,smoothstep(0.,1.,lineAge));',
    '    float lineMask=1.-smoothstep(halfWidth*.86,halfWidth,abs(point.x));',
    '    float line=(.75*bell(center.y/1.05)+.24*bell(center.y/4.2))*lineMask;',
    '    glow+=line*smoothstep(134.,154.,entryTime)*(1.-smoothstep(170.,184.,entryTime));',
    '  }',
    '  return glow;',
    '}',
    'void main(){',
    '  vec2 uv=vec2(gl_FragCoord.x/size.x,1.-gl_FragCoord.y/size.y);',
    '  vec2 n=uv*2.-1.;',
    '  vec2 screenN=n;',
    '  bool entering=entryTime>=0.;',
    '  float squeeze=1.-power;',
    '  float wide=1.-.91*pow(squeeze,3.);',
    '  float tall=max(.018,pow(power,1.75));',
    '  vec2 projected=n/vec2(wide,tall);',
    '  projected.y*=1.+squeeze*(.36+.42*bend*abs(projected.x));',
    '  projected.x*=1.+squeeze*.22*bend*min(1.,abs(projected.y));',
    '  float rasterMask=1.;',
    '  if(entering && home){',
    '    float collapse=smoothstep(45.,155.,entryTime);',
    '    float width=1.-.16*smoothstep(100.,155.,entryTime);',
    '    projected.x=n.x/width;',
    '    float bow=1.+.26*bend*collapse*projected.x*projected.x;',
    '    projected.y=n.y*bow/max(2./viewport.y,1.-collapse);',
    '    projected.x*=1.+.06*bend*collapse*min(1.,abs(projected.y));',
    '    rasterMask=(1.-smoothstep(.97,1.01,max(abs(projected.x),abs(projected.y))))',
    '      *(1.-smoothstep(136.,155.,entryTime));',
    '    if(rasterMask<=0.){color=phosphor(entryAfterglow(screenN),0.);return;}',
    '    projected=clamp(projected,-1.01,1.01);',
    '  } else if(any(greaterThan(abs(projected),vec2(1.)))){color=vec4(0.);return;}',
    '  n=projected;',
    '  float radius=dot(n,n);',
    '  vec2 glass=.48*n*(1.+vec2(.044,.061)*n.yx*n.yx+vec2(.022,.018)*n*n);',
    '  if(bend<1.) glass=mix(.5*n,glass,bend);',
    '  vec2 glassUV=.5+glass;',
    '  if(closeup) glassUV=mix(uv,glassUV,.38);',
    '  if(!home && !closeup) glassUV=archivePerspective(glassUV);',
    '  vec2 q=glassUV;',
    '  float depth=smoothstep(.56,1.,q.y);',
    '  if(home) q.x-=pointer.x*.003*depth;',
    '  float sharp=texture(signalTex,q).r;',
    '  float diffuse=textureLod(signalTex,q,home ? 2.8 : 1.75).r;',
    '  float halo=textureLod(signalTex,q,home ? 4.65 : 3.3).r;',
    '  float edge=(home ? .09 : .08)+.24*clamp((radius-.25)/1.4,0.,1.);',
    '  float emission=mix(sharp,diffuse,edge);',
    '  float lines=home ? min(232.,viewport.y/2.15) : min(180.,viewport.y/2.2);',
    '  float phase=fract(glassUV.y*lines+.5)-.5;',
    '  float packet=pow(.5+.5*sin(elapsed*10.5),2.);',
    '  float sweep=fract(elapsed*.24+(home ? pointer.x*.08 : 0.)-glassUV.x+.5)-.5;',
    '  float leading=bell(sweep/(.010+.025*packet));',
    '  float tail=exp(-max(0.,sweep)/.051)*smoothstep(-.005,.014,sweep);',
    '  float pulseArea=home ? 1.-.94*smoothstep(.46,.56,q.y) : 1.;',
    '  float scan=(leading*(.75+1.30*packet)+tail*.56)*pulseArea;',
    '  if(closeup) scan*=.52;',
    '  vec2 cursor=(uv-.5-pointer*.5)*vec2(5.0,6.2);',
    '  float response=home || closeup ? 0. : pointerPresence*exp(-dot(cursor,cursor));',
    '  float beam=.36+.64*bell(phase/(.20+.20*sqrt(emission)+.15*leading*packet*pulseArea));',
    '  float logoGlow=home ? bell((q.y-.32)/.18) : 0.;',
    '  float spread=diffuse*(.46+.52*logoGlow)+halo*(.34+.34*logoGlow);',
    '  if(closeup) spread*=.58;',
    '  float vignette=max(.56,1.-.075*radius-.061*radius*radius);',
    '  float value=(emission*beam*(1.+scan*.62+response*.85)',
    '    +spread*(1.+scan*1.40+response*1.85))*vignette;',
    '  value+=halo*leading*packet*pulseArea*.23*vignette;',
    '  float structure=0.;',
    '  if(!home && all(greaterThan(panel.zw,panel.xy))',
    '    && all(greaterThanEqual(q,panel.xy)) && all(lessThanEqual(q,panel.zw))){',
    '    vec2 p=(q-panel.xy)*viewport;',
    '    vec2 extent=(panel.zw-panel.xy)*viewport;',
    '    vec2 rim=min(p,extent-p);',
    '    float edgeDistance=min(rim.x,rim.y);',
    '    float horizontal=1.-smoothstep(.105,.145,rim.x/extent.x);',
    '    float vertical=1.-smoothstep(.075,.126,rim.y/extent.y);',
    '    float middle=1.-smoothstep(.043,.065,abs(p.x/extent.x-.5));',
    '    float frame=bell(rim.y/(1.12+.85*response))*max(horizontal,middle*.44)',
    '      +bell(rim.x/(1.12+.85*response))*vertical;',
    '    float frameLight=frame*(.19+.26*response);',
    '    float panelStructure=frameLight+panelGraticule(p,extent)*(1.+.35*response);',
    '    float frontier=mix(panel.x-.018,panel.z+.038,panelRefresh);',
    '    float gate=1.-smoothstep(frontier-.007,frontier,q.x);',
    '    float peak=.55+.45*pow(.5+.5*sin(panelRefresh*31.),2.);',
    '    float writeHead=bell((q.x-frontier+.013)/(.011+.021*peak));',
    '    float afterglow=bell((q.x-frontier+.052)/.053);',
    '    float writeGain=1.+writeHead*(.8+peak)+afterglow*.32;',
    '    float interior=smoothstep(9.,32.,edgeDistance);',
    '    float trace=writeHead*interior*beam*(.012+.026*peak);',
    '    if(!entering && panelRefresh<1.) value=value*gate*writeGain+trace;',
    '    structure=panelStructure*(.90+.10*bell(phase/.30));',
    '  }',
    '  value=clamp((value+structure)*(1.+squeeze*.85),0.,1.);',
    '  float gunTail=smoothstep(.52,.96,squeeze)*bell(projected.y/.20)*bell(projected.x/.86);',
    '  value=max(value,gunTail*.78);',
    '  if(entering){',
    '    if(home){',
    '      vec2 caretDistance=max(vec2(0.),abs((q-entryCaret.xy)*viewport)-entryCaret.zw);',
    '      float flash=smoothstep(0.,9.,entryTime)*(1.-smoothstep(23.,56.,entryTime));',
    '      float caret=bell(length(caretDistance)/1.3)*.83+bell(length(caretDistance)/6.)*.19;',
    '      value=(value*(1.+.36*smoothstep(96.,150.,entryTime))+caret*flash)*rasterMask;',
    '    } else {',
    '      float write=clamp((entryTime-192.)/222.,0.,1.);',
    '      float frontier=mix(-.045,1.11,write);',
    '      float age=frontier-q.x;',
    '      float gate=smoothstep(.007,.032,age);',
    '      float structureGate=smoothstep(-.017,.006,age);',
    '      float tail=gate*exp(-max(0.,age-.028)/.058);',
    '      float edgeLight=bell(age/.008)*(.022+.032*bell(phase/.27));',
    '      float envelope=smoothstep(.018,.09,q.y)*(1.-smoothstep(.92,.98,q.y));',
    '      value=max(0.,value-structure)*gate*(1.+.65*tail)',
    '        +structure*structureGate*(1.+.22*tail)+edgeLight*envelope;',
    '    }',
    '    value+=entryAfterglow(screenN);',
    '  }',
    '  float terrain=home ? smoothstep(.62,.79,q.y)*.94*power*rasterMask : 0.;',
    '  if(closeup) value=max(value*.88,sharp*.70);',
    '  color=phosphor(value,terrain);',
    '}'
  ].join('\n');

  function compile(kind, code) {
    const shader = gl.createShader(kind);
    gl.shaderSource(shader, code);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
    console.warn(gl.getShaderInfoLog(shader));
    return null;
  }

  const vs = compile(gl.VERTEX_SHADER, vertex);
  const fs = compile(gl.FRAGMENT_SHADER, fragment);
  if (!vs || !fs) return;
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  const uniforms = Object.fromEntries(
    ['size','viewport','pointer','pointerPresence','panel','panelRefresh','elapsed','power','home','closeup','signalTex','entryTime','entryCaret','bend']
      .map(name => [name, gl.getUniformLocation(program, name)])
  );
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(uniforms.signalTex, 0);
  const home = root.id === 'zoea-monitor';
  gl.uniform1i(uniforms.home, home ? 1 : 0);
  gl.uniform1i(uniforms.closeup, closeup ? 1 : 0);

  canvas.className = 'crt-live';
  canvas.setAttribute('aria-hidden', 'true');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let ready = false;
  let frame = 0, last = 0, seconds = 0;
  let x = 0, y = 0, targetX = 0, targetY = 0;
  let presence = 0, pointerInside = false;
  let renderScene, lastScene = -Infinity;
  let animateSignal = true, updateHitAreas;
  let panelBounds = [0,0,0,0], refreshStart = -Infinity;
  let entryCaret = [-1,-1,0,0];
  const cap = (n, min, max) => Math.max(min, Math.min(max, n));

  function draw(now) {
    frame = 0;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h || document.hidden || root.hidden) return;
    const dt = last ? (now-last)/1000 : 0;
    last = now;
    const entryTime = reduced.matches ? -1 : root.crtEntryTime?.(now) ?? -1;
    const holdHome = home && entryTime>=0;
    if (!holdHome) {
      if (!reduced.matches) seconds += dt;
      x += (targetX-x)*(1-Math.exp(-dt*10));
      y += (targetY-y)*(1-Math.exp(-dt*10));
      presence += (Number(pointerInside)-presence)*(1-Math.exp(-dt*14));
    }
    const bend = geometry.bend, tilt = geometry.tilt;
    const pointerX = x*tilt, pointerY = y*tilt;
    updateHitAreas?.(pointerX,pointerY,bend);
    const redraw = lastScene === -Infinity || (animateSignal && !reduced.matches && now-lastScene >= 15);
    if (renderScene && (holdHome ? !textureWidth : redraw)) {
      const still = reduced.matches;
      upload(renderScene(still ? 0 : seconds, pointerX, pointerY, still));
      lastScene = now;
    }
    const scale = Math.min(Math.max(1, devicePixelRatio), 2.5, Math.sqrt(7500000/(w*h)));
    const width = Math.round(w*scale), height = Math.round(h*scale);
    if (width !== canvas.width || height !== canvas.height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.uniform2f(uniforms.size, width, height);
    gl.uniform2f(uniforms.viewport, w, h);
    gl.uniform2f(uniforms.pointer, pointerX, pointerY);
    gl.uniform1f(uniforms.bend, bend);
    gl.uniform1f(uniforms.pointerPresence,presence);
    gl.uniform4fv(uniforms.panel,panelBounds);
    gl.uniform1f(uniforms.panelRefresh,reduced.matches ? 1 : cap((now-refreshStart)/570,0,1));
    gl.uniform1f(uniforms.power,reduced.matches ? 1 : root.crtPower?.() ?? 1);
    gl.uniform1f(uniforms.entryTime,entryTime);
    gl.uniform4fv(uniforms.entryCaret,entryCaret);
    gl.uniform1f(uniforms.elapsed, reduced.matches ? 0 : seconds);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!reduced.matches) schedule();
  }

  function schedule() {
    if (ready && !frame && !document.hidden && !root.hidden) frame = requestAnimationFrame(draw);
  }

  root.addEventListener('pointermove', event => {
    if (reduced.matches || event.pointerType === 'touch') return;
    pointerInside = true;
    const rect = root.getBoundingClientRect();
    targetX = cap((event.clientX-rect.left)/rect.width*2-1, -1, 1);
    targetY = cap((event.clientY-rect.top)/rect.height*2-1, -1, 1);
  });
  root.addEventListener('pointerleave', () => {
    pointerInside = false;
    targetX = targetY = 0;
  });
  root.addEventListener('crt-view',()=> {
    cancelAnimationFrame(frame);
    frame = last = 0;
    x = y = targetX = targetY = 0;
    presence = 0;
    pointerInside = false;
    schedule();
  });
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(frame);
    frame = last = 0;
    if (!document.hidden) schedule();
  });
  reduced.addEventListener('change', () => {
    if (reduced.matches) {
      x = y = targetX = targetY = 0;
      presence = 0;
      pointerInside = false;
      seconds = Math.max(seconds, .95);
    }
    lastScene = -Infinity;
    schedule();
  });
  geometry.compactTouch.addEventListener('change',()=>{
    lastScene = -Infinity;
    schedule();
  });

  let textureWidth = 0, textureHeight = 0;
  function upload(layer) {
    if (layer.width !== textureWidth || layer.height !== textureHeight) {
      textureWidth = layer.width;
      textureHeight = layer.height;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, layer);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, layer);
    }
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  root.crtLive = {
    setPanel(bounds) { panelBounds = bounds; },
    setHitAreaUpdater(update) { updateHitAreas = update; },
    setEntryCaret(bounds) { entryCaret = bounds; },
    present(now) {
      cancelAnimationFrame(frame);
      draw(now);
    },
    refreshPanel() { refreshStart = performance.now(); schedule(); },
    invalidate() {
      lastScene = -Infinity;
      schedule();
    },
    setScene(renderer, animated=true) {
      renderScene = renderer;
      animateSignal = animated;
      lastScene = -Infinity;
      if (!ready) {
        source.before(canvas);
        source.hidden = true;
        root.classList.add('crt-live-ready');
        ready = true;
        new ResizeObserver(schedule).observe(canvas);
      }
      schedule();
    }
  };
};
