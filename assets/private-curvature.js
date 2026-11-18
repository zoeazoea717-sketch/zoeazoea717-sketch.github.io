(() => {
  'use strict';

  const namespace = 'http://www.w3.org/2000/svg';
  const controls = 'button:not(:disabled), a[href], label[data-dossier-curve-label][for]';
  const strength = .036;
  const bindings = new WeakMap();
  const maps = new Map();
  let filterSerial = 0;

  function readMap(url) {
    if (!maps.has(url)) {
      const request = (async () => {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d', {willReadFrequently:true});
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, canvas.width, canvas.height);
      })();
      maps.set(url, request);
      request.catch(() => { if (maps.get(url) === request) maps.delete(url); });
    }
    return maps.get(url);
  }

  function installStyle() {
    if (document.getElementById('dossier-curve-input-style')) return;
    const style = document.createElement('style');
    style.id = 'dossier-curve-input-style';
    style.textContent = `
      [data-dossier-curve-target], [data-dossier-curve-target] * { pointer-events:none !important; }
      [data-dossier-curve-static] { position:relative; }
      [data-dossier-curve-target] > [data-dossier-curve-hit] {
        display:block !important; position:fixed !important; z-index:1 !important; inset:auto; margin:0 !important;
        padding:0 !important; border:0 !important; min-width:0 !important; min-height:0 !important;
        max-width:none !important; max-height:none !important; transform:none !important;
        opacity:0 !important; pointer-events:auto !important; background:none !important;
      }
      [data-dossier-curve-target] > [data-dossier-curve-hit="scroll"] { position:absolute !important; z-index:2 !important; }
      [data-dossier-curve-target] > [data-dossier-curve-hit][hidden] { display:none !important; }
    `;
    document.head.append(style);
  }

  function makeFilter(dialog) {
    const template = document.getElementById('preview-screen-curve');
    if (!template) return null;
    const svg = document.createElementNS(namespace, 'svg');
    const defs = document.createElementNS(namespace, 'defs');
    const filter = template.cloneNode(true);
    filter.id = 'dossier-screen-curve-'+(++filterSerial);
    // A CSS outer shadow expands the default object-bounding-box filter. Pixels outside the map
    // then read R=G=0 and duplicate the right/bottom controls. Match the plane's own border box.
    filter.setAttribute('filterUnits','userSpaceOnUse');
    filter.setAttribute('primitiveUnits','userSpaceOnUse');
    filter.setAttribute('x',0);
    filter.setAttribute('y',0);
    for (const [key,value] of Object.entries({width:0,height:0,'aria-hidden':'true',focusable:'false'})) {
      svg.setAttribute(key,value);
    }
    svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;overflow:hidden';
    defs.append(filter);
    svg.append(defs);
    // The original filter belongs to another dialog, which normally has display:none.
    dialog.append(svg);
    const source = filter.querySelector('feImage');
    const xChannel = filter.querySelector('feFuncR');
    const yChannel = filter.querySelector('feFuncG');
    const displacement = filter.querySelector('feDisplacementMap');
    const url = new URL(source.getAttribute('href'), source.baseURI).href;
    return {
      svg, id:filter.id, url,
      resize(w,h,bend) {
        filter.setAttribute('width',w);
        filter.setAttribute('height',h);
        source.setAttribute('x',0);
        source.setAttribute('y',0);
        source.setAttribute('width',w);
        source.setAttribute('height',h);
        const longest = Math.max(w,h);
        for (const [channel,size] of [[xChannel,w],[yChannel,h]]) {
          const slope = size/longest;
          channel.setAttribute('slope',slope);
          channel.setAttribute('intercept',(1-slope)/2);
        }
        displacement.setAttribute('scale',longest*strength*bend);
      }
    };
  }

  function sampleDisplacement(u,v,map) {
    const gx=Math.max(0,Math.min(map.width-1,u*map.width-.5));
    const gy=Math.max(0,Math.min(map.height-1,v*map.height-.5));
    const x0=Math.floor(gx), y0=Math.floor(gy);
    const x1=Math.min(x0+1,map.width-1), y1=Math.min(y0+1,map.height-1);
    const i00=4*(y0*map.width+x0), i10=4*(y0*map.width+x1);
    const i01=4*(y1*map.width+x0), i11=4*(y1*map.width+x1);
    const fx=gx-x0, fy=gy-y0;
    const channel=c=>(
      (map.data[i00+c]*(1-fx)+map.data[i10+c]*fx)*(1-fy)+
      (map.data[i01+c]*(1-fx)+map.data[i11+c]*fx)*fy
    )/255-.5;
    return [channel(0),channel(1)];
  }

  function projectSource(sx,sy,w,h,bend,map) {
    const su=sx/w, sv=sy/h;
    let u=su, v=sv;
    for (let step=0; step<5; step++) {
      // feDisplacementMap looks backwards. Invert its actual bilinearly sampled R/G offsets.
      const [dx,dy]=sampleDisplacement(u,v,map);
      u=su-strength*bend*dx;
      v=sv-strength*bend*dy;
    }
    return [u*w,v*h];
  }

  function warpedOutline(rect, plane, bend, map) {
    const l=rect.left-plane.left, t=rect.top-plane.top;
    const w=rect.right-rect.left, h=rect.bottom-rect.top;
    const nx=Math.max(1,Math.ceil(w/65)), ny=Math.max(1,Math.ceil(h/65));
    const points=[];
    const point=(x,y)=>points.push(projectSource(x,y,plane.width,plane.height,bend,map));
    for (let i=0;i<nx;i++) point(l+w*i/nx,t);
    for (let i=0;i<ny;i++) point(l+w,t+h*i/ny);
    for (let i=nx;i>0;i--) point(l+w*i/nx,t+h);
    for (let i=ny;i>0;i--) point(l,t+h*i/ny);
    return points;
  }

  function intersect(a,b) {
    return {left:Math.max(a.left,b.left),right:Math.min(a.right,b.right),
      top:Math.max(a.top,b.top),bottom:Math.min(a.bottom,b.bottom)};
  }

  function visibleBounds(control,plane,bounds,cache) {
    const parent=control.parentElement;
    if (!parent || parent===plane) return bounds;
    if (cache.has(parent)) return cache.get(parent);
    const outer=visibleBounds(parent,plane,bounds,cache);
    const style=getComputedStyle(parent);
    const clipX=style.overflowX!=='visible', clipY=style.overflowY!=='visible';
    if (!clipX && !clipY) { cache.set(parent,outer); return outer; }
    const box=parent.getBoundingClientRect();
    const x=box.left+parent.clientLeft, y=box.top+parent.clientTop;
    const clip=intersect(outer,{
      left:clipX?x:-Infinity,right:clipX?x+parent.clientWidth:Infinity,
      top:clipY?y:-Infinity,bottom:clipY?y+parent.clientHeight:Infinity
    });
    clip.scrollable=outer.scrollable || /auto|scroll/.test(style.overflowX+' '+style.overflowY);
    cache.set(parent,clip);
    return clip;
  }

  function createHit(target,kind) {
    // Fixed surfaces can reach warped pixels past a scroll viewport's original rectangular clip.
    // Their absolute counterpart keeps the browser's native pan/wheel route inside the scroller.
    const element=document.createElement('span');
    element.dataset.dossierCurveHit=kind;
    element.setAttribute('aria-hidden','true');
    element.style.cssText='left:0px;top:0px;width:0px;height:0px';
    target.append(element);
    return {element,left:0,top:0};
  }

  function updateHit(hit,points,originX,originY) {
    const xs=points.map(point=>point[0]), ys=points.map(point=>point[1]);
    const l=Math.min(...xs), t=Math.min(...ys), w=Math.max(...xs)-l, h=Math.max(...ys)-t;
    const round=n=>Math.round(n*100)/100;
    hit.left=round(l-originX);
    hit.top=round(t-originY);
    const polygon=points.map(([x,y])=>round(x-l)+'px '+round(y-t)+'px').join(',');
    Object.assign(hit.element.style,{left:hit.left+'px',top:hit.top+'px',
      width:round(w)+'px',height:round(h)+'px',clipPath:'polygon('+polygon+')'});
  }

  window.bindDossierCurve = function bindDossierCurve(dialog,curveScale=1) {
    if (!dialog) return null;
    if (bindings.has(dialog)) return bindings.get(dialog);
    const targets=new Map();
    const nativeFields=new Map();
    let plane,glass,filter,map,teardown,frame=0,active=false,epoch=0,dimensions='';
    let oldFilter='',sizes,changes,nativeSpace;
    const observed=new Set();
    installStyle();

    function schedule() {
      if (active && map && dialog.open && !dialog.hidden && !frame) frame=requestAnimationFrame(measure);
    }

    function removeTarget(target) {
      for (const hit of targets.get(target) || []) hit.element.remove();
      target.removeAttribute('data-dossier-curve-target');
      target.removeAttribute('data-dossier-curve-static');
      targets.delete(target);
    }

    function measure() {
      frame=0;
      if (!active || !dialog.open || dialog.hidden || !map || !plane.isConnected) return;
      // Get unwarped geometry once per layout change. The native outer CSS transform handles tilt.
      const saved=glass.style.getPropertyValue('transform');
      const priority=glass.style.getPropertyPriority('transform');
      const transition=glass.style.getPropertyValue('transition-property');
      const transitionPriority=glass.style.getPropertyPriority('transition-property');
      const currentTransform=getComputedStyle(glass).transform;
      glass.style.setProperty('transition-property','none','important');
      glass.style.setProperty('transform','none','important');
      try {
        const bounds=plane.getBoundingClientRect();
        if (bounds.width<1 || bounds.height<1) return;
        const bend=(window.crtGeometry?.bend ?? 1)*curveScale;
        const signature=[bounds.width,bounds.height,bend].join('/');
        if (signature!==dimensions) {
          filter.resize(bounds.width,bounds.height,bend);
          dimensions=signature;
        }
        const current=new Set([...plane.querySelectorAll(controls)].filter(target=>!target.closest('[hidden],[inert]')));
        for (const target of targets.keys()) if (!current.has(target)) removeTarget(target);
        const fields=[...plane.querySelectorAll('[data-dossier-curve-field]')];
        if (fields.length) {
          const outer=dialog.getBoundingClientRect(), surface=glass.getBoundingClientRect();
          const [ox,oy]=getComputedStyle(glass).transformOrigin.split(' ').map(parseFloat);
          nativeSpace={width:bounds.width,height:bounds.height,bend,
            originX:surface.left-bounds.left+ox,originY:surface.top-bounds.top+oy,
            left:bounds.left-outer.left+dialog.scrollLeft,top:bounds.top-outer.top+dialog.scrollTop};
        } else nativeSpace=null;
        const resizeNodes=new Set([plane,...current,...fields,...plane.querySelectorAll('details,img,video')]);
        for (const item of observed) if (!resizeNodes.has(item)) { sizes.unobserve(item); observed.delete(item); }
        for (const item of resizeNodes) if (!observed.has(item)) { sizes.observe(item); observed.add(item); }

        const clipCache=new Map(), pending=[];
        for (const target of current) {
          const clip=visibleBounds(target,plane,bounds,clipCache);
          const kinds=clip.scrollable ? ['surface','scroll'] : ['surface'];
          if (!clip.scrollable) target.removeAttribute('data-dossier-curve-static');
          else if (getComputedStyle(target).position==='static') target.dataset.dossierCurveStatic='';
          const pieces=[...target.getClientRects()].map(r=>intersect(r,clip))
            .filter(r=>r.right-r.left>.5 && r.bottom-r.top>.5);
          // Updating a native label with textContent can remove our span without replacing its button.
          const hits=(targets.get(target) || []).filter(hit=>hit.element.parentElement===target);
          if (hits.some((hit,i)=>hit.element.dataset.dossierCurveHit!==kinds[i%kinds.length])) {
            while (hits.length) hits.pop().element.remove();
          }
          const count=pieces.length*kinds.length;
          while (hits.length>count) hits.pop().element.remove();
          while (hits.length<count) hits.push(createHit(target,kinds[hits.length%kinds.length]));
          targets.set(target,hits);
          target.dataset.dossierCurveTarget='';
          for (let index=0;index<pieces.length;index++) {
            const points=warpedOutline(pieces[index],bounds,bend,map);
            for (let k=0;k<kinds.length;k++) {
              const hit=hits[index*kinds.length+k], origin=hit.element.getBoundingClientRect();
              pending.push([hit,points,origin.left-bounds.left-hit.left,origin.top-bounds.top-hit.top]);
            }
          }
        }
        for (const change of pending) updateHit(...change);
        // A native input must receive real pointer events for caret placement, selection
        // and the touch keyboard. Its frame gives it transparent padding around the ink;
        // clip that same input's hit box to the displaced outline of the visible frame.
        for (const [field,input] of nativeFields) {
          if (fields.includes(field)) continue;
          delete field.dataset.dossierNativeActive;
          input.style.removeProperty('--dossier-native-clip');
          nativeFields.delete(field);
        }
        for (const field of fields) {
          const input=field.querySelector('input');
          if (!input || !field.getClientRects().length) continue;
          nativeFields.set(field,input);
          field.dataset.dossierNativeActive='';
          const clip=intersect(field.getBoundingClientRect(),visibleBounds(field,plane,bounds,clipCache));
          if (clip.right<=clip.left || clip.bottom<=clip.top) {
            input.style.setProperty('--dossier-native-clip','inset(50%)');
            continue;
          }
          const origin=input.getBoundingClientRect();
          const points=warpedOutline(clip,bounds,bend,map).map(([x,y])=>
            (x+bounds.left-origin.left).toFixed(2)+'px '+(y+bounds.top-origin.top).toFixed(2)+'px');
          input.style.setProperty('--dossier-native-clip','polygon('+points.join(',')+')');
        }
      } finally {
        // Resume the site's pointer tilt from the exact on-screen matrix, including a transition in flight.
        glass.style.setProperty('transform',currentTransform,'important');
        glass.getBoundingClientRect();
        if (saved) glass.style.setProperty('transform',saved,priority);
        else glass.style.removeProperty('transform');
        if (transition) glass.style.setProperty('transition-property',transition,transitionPriority);
        else glass.style.removeProperty('transition-property');
      }
    }

    function nativeOffset(event,input) {
      // Convert the tilted screen point to plane space, look up the actual source pixel,
      // then let the browser resolve the character in its own password font and scroll position.
      const s=nativeSpace;
      if (!s) return null;
      const outer=dialog.getBoundingClientRect(), transform=getComputedStyle(glass).transform;
      const m=new DOMMatrixReadOnly(transform==='none' ? undefined : transform);
      const ox=outer.left-dialog.scrollLeft+s.left+s.originX, oy=outer.top-dialog.scrollTop+s.top+s.originY;
      const x=event.clientX-ox, y=event.clientY-oy;
      const a=m.m11-x*m.m14, b=m.m21-x*m.m24, c=m.m12-y*m.m14, d=m.m22-y*m.m24;
      const det=a*d-b*c;
      if (Math.abs(det)<.00001) return null;
      const tx=x*m.m44-m.m41, ty=y*m.m44-m.m42;
      const u=(d*tx-b*ty)/det, v=(a*ty-c*tx)/det;
      const [dx,dy]=sampleDisplacement((u+s.originX)/s.width,(v+s.originY)/s.height,map);
      const px=u+dx*strength*s.bend*s.width, py=v+dy*strength*s.bend*s.height;
      const w=m.m14*px+m.m24*py+m.m44;
      const caret=document.caretPositionFromPoint(ox+(m.m11*px+m.m21*py+m.m41)/w,oy+(m.m12*px+m.m22*py+m.m42)/w);
      return caret?.offsetNode===input ? caret.offset : null;
    }

    function bindNativeSelection(signal) {
      if (!document.caretPositionFromPoint || !window.DOMMatrixReadOnly) return;
      let gesture=null, queued=0;
      const options={capture:true,passive:true,signal};
      function clear() { cancelAnimationFrame(queued); gesture=null; }
      function place(event,state) {
        if (document.activeElement!==state.input) return;
        const offset=nativeOffset(event,state.input);
        if (offset===null) return;
        const anchor=state.dragged || state.extending ? state.anchor : offset;
        state.input.setSelectionRange(Math.min(anchor,offset),Math.max(anchor,offset),offset<anchor?'backward':'forward');
      }
      dialog.addEventListener('pointerdown',event=>{
        clear();
        const input=event.target;
        if (event.button!==0 || !input.matches('input') || !input.parentElement?.hasAttribute('data-dossier-native-active')) return;
        const initial=nativeOffset(event,input);
        if (initial===null) return;
        const anchor=event.shiftKey ? (input.selectionDirection==='backward' ? input.selectionEnd : input.selectionStart) : initial;
        gesture={input,anchor,extending:event.shiftKey,id:event.pointerId,x:event.clientX,y:event.clientY,dragged:false};
      },options);
      dialog.addEventListener('pointermove',event=>{
        if (!gesture || event.pointerId!==gesture.id || !(event.buttons&1)) return;
        if (Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)<3 && !gesture.dragged) return;
        gesture.dragged=true;
        if (event.pointerType==='touch') return;
        const state=gesture;
        cancelAnimationFrame(queued);
        queued=requestAnimationFrame(()=>place(event,state));
      },options);
      dialog.addEventListener('pointerup',event=>{
        if (!gesture || event.pointerId!==gesture.id || !gesture.dragged || event.pointerType==='touch') return;
        const state=gesture;
        cancelAnimationFrame(queued);
        queued=requestAnimationFrame(()=>place(event,state));
      },options);
      dialog.addEventListener('click',event=>{
        if (!gesture) return;
        const state=gesture;
        clear();
        if (event.target===state.input && event.detail===1 && !(event.pointerType==='touch' && state.dragged)) place(event,state);
      },options);
      for (const type of ['pointercancel','dragstart','input']) dialog.addEventListener(type,clear,options);
      dialog.addEventListener('focusout',event=>{ if (gesture?.input===event.target) clear(); },options);
      signal.addEventListener('abort',clear,{once:true});
    }

    async function start() {
      if (active || !dialog.open || dialog.hidden) return;
      plane=dialog.querySelector('.dossier-plane');
      glass=plane?.closest('.preview-glass');
      if (!plane || !glass) return;
      filter ||= makeFilter(dialog);
      if (!filter) return;
      active=true;
      const token=++epoch;
      try {
        const decoded=await readMap(filter.url);
        if (!active || !dialog.open || dialog.hidden || token!==epoch) return;
        map=decoded;
      } catch {
        if (token===epoch) stop();
        return;
      }
      oldFilter=plane.style.filter;
      plane.style.filter='url(#'+filter.id+')';
      teardown=new AbortController();
      if (plane.querySelector('[data-dossier-curve-field]')) bindNativeSelection(teardown.signal);
      const events={capture:true,passive:true,signal:teardown.signal};
      for (const type of ['scroll','load','loadedmetadata','toggle','transitionend','animationend']) {
        plane.addEventListener(type,schedule,events);
      }
      window.addEventListener('resize',schedule,events);
      window.crtGeometry?.compactTouch?.addEventListener('change',schedule,{signal:teardown.signal});
      document.fonts?.addEventListener('loadingdone',schedule,{signal:teardown.signal});
      sizes=new ResizeObserver(schedule);
      changes=new MutationObserver(records=>{
        const external=records.some(record=>{
          if (record.type!=='childList') return true;
          const nodes=[...record.addedNodes,...record.removedNodes];
          if (nodes.some(node=>node.nodeType!==1 || !node.hasAttribute('data-dossier-curve-hit'))) return true;
          // A caller may also empty a button whose only child was the hit surface.
          return [...record.removedNodes].some(node=>(targets.get(record.target) || [])
            .some(hit=>hit.element===node && node.parentElement!==record.target));
        });
        if (external) schedule();
      });
      changes.observe(plane,{childList:true,subtree:true,characterData:true,attributes:true,
        attributeFilter:['href','disabled','hidden','inert','open','class','aria-expanded','src','width','height']});
      schedule();
    }

    function stop() {
      if (!active) return;
      active=false;
      ++epoch;
      cancelAnimationFrame(frame);
      frame=0;
      teardown?.abort();
      changes?.disconnect();
      sizes?.disconnect();
      observed.clear();
      for (const target of [...targets.keys()]) removeTarget(target);
      for (const [field,input] of nativeFields) {
        delete field.dataset.dossierNativeActive;
        input.style.removeProperty('--dossier-native-clip');
      }
      nativeFields.clear();
      nativeSpace=null;
      if (map) plane.style.filter=oldFilter;
      map=null;
      dimensions='';
    }

    const sync=()=>{ if (dialog.open && !dialog.hidden) start(); else stop(); };
    const opened=new MutationObserver(sync);
    opened.observe(dialog,{attributes:true,attributeFilter:['open','hidden']});
    dialog.addEventListener('close',sync);
    const binding={refresh:schedule,destroy() {
      stop(); opened.disconnect(); dialog.removeEventListener('close',sync);
      filter?.svg.remove(); bindings.delete(dialog);
    }};
    bindings.set(dialog,binding);
    sync();
    return binding;
  };
})();
