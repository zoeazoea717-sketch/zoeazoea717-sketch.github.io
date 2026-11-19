(() => {
  const root = document.querySelector('#zoea-archive');
  const home = root.querySelector('#private-archive');
  const form = home.querySelector('.works-lock');
  const unlocked = home.querySelector('.works-unlocked');
  const dialog = document.createElement('dialog');
  dialog.id = 'dossier-entry';
  dialog.className = 'preview-dialog';
  dialog.setAttribute('aria-labelledby', 'dossier-entry-title');
  dialog.setAttribute('aria-describedby', 'zoea-works-access-hint');
  dialog.innerHTML = `
    <div class="preview-glass entry-glass"><div class="entry-sheet dossier-plane" data-popup-surface>
      <div class="entry-toolbar dossier-scanbar">
        <span class="entry-signature" lang="en">ZOEA<span>_</span></span>
        <span class="entry-toolbar-title"></span>
        <button class="entry-close preview-close" type="button"><span aria-hidden="true"></span></button>
      </div>
      <div class="entry-layout">
        <div class="entry-heading">
          <span class="entry-path" lang="en">C:\\ZOEA\\PROJECTS\\WORKS&gt;</span>
          <div class="entry-title-beam"><h2 id="dossier-entry-title" class="dossier-phosphor" tabindex="-1"></h2></div>
        </div>
        <div class="entry-landscape" aria-hidden="true">
          <svg class="entry-tones" width="0" height="0" focusable="false">
            <defs><filter id="entry-terrain-tone" color-interpolation-filters="sRGB">
              <feComponentTransfer result="amberTerrain">
                <feFuncR type="table" tableValues="0 .25 .43 .62 .79 .94 1 1 1"/>
                <feFuncG type="table" tableValues="0 .105 .21 .33 .46 .59 .72 .85 .99"/>
                <feFuncB type="table" tableValues="0 .038 .082 .145 .23 .34 .46 .58 .72"/>
              </feComponentTransfer>
              <!-- Keep the depth occlusion inside the renderer. Only its lit marks reach the glass. -->
              <feColorMatrix in="SourceGraphic" type="luminanceToAlpha"/>
              <feComponentTransfer result="ridgeInk">
                <feFuncA type="linear" slope="4" intercept="-.035"/>
              </feComponentTransfer>
              <feComposite in="amberTerrain" in2="ridgeInk" operator="in"/>
            </filter></defs>
          </svg>
          <canvas></canvas>
        </div>
        <div class="entry-form-slot"></div>
      </div>
    </div></div>`;
  root.append(dialog);

  const title = dialog.querySelector('h2');
  const toolbarTitle = dialog.querySelector('.entry-toolbar-title');
  const close = dialog.querySelector('.entry-close');
  const slot = dialog.querySelector('.entry-form-slot');
  const canvas = dialog.querySelector('.entry-landscape canvas');
  const password = form.querySelector('input[type="password"]');
  const passwordLabel = form.querySelector('label[for]');
  const field = document.createElement('div');
  field.className = 'entry-password-frame';
  field.setAttribute('data-dossier-curve-field', '');
  window.bindDossierCurve(dialog);

  function translate() {
    const english = document.documentElement.lang.toLowerCase().startsWith('en');
    title.textContent = english ? 'Private archive' : '个人档案';
    toolbarTitle.textContent = english ? 'Archive access' : '档案访问';
    close.setAttribute('aria-label', english ? 'Return to the directory' : '返回作品目录');
    close.title = close.getAttribute('aria-label');
  }

  const glyphs = '.,:+=/01257%#';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const ctx = canvas.getContext('2d');
  let geometry;
  let renderer;
  let rendererInitialized = false;
  let frame = 0, timer = 0, lastPaint = 0, elapsed = 0;

  function makeSprite(size, density) {
    const tile = Math.ceil(size * density * 2);
    const sheet = document.createElement('canvas');
    sheet.width = tile * glyphs.length;
    sheet.height = tile;
    const pen = sheet.getContext('2d');
    pen.font = size * density + 'px Consolas, monospace';
    pen.textAlign = 'center';
    pen.textBaseline = 'middle';
    pen.fillStyle = '#fff';
    for (let i = 0; i < glyphs.length; i++) pen.fillText(glyphs[i], (i + .5) * tile, tile / 2);
    return {canvas: sheet, tile, span: tile / density};
  }

  function stamp(gpu, sprite, index, x, y, opacity) {
    if (gpu) {
      gpu.glyph(sprite, index, x, y, opacity);
      return;
    }
    ctx.globalAlpha = opacity;
    ctx.drawImage(sprite.canvas, index * sprite.tile, 0, sprite.tile, sprite.tile, x, y, sprite.span, sprite.span);
    ctx.globalAlpha = 1;
  }

  // The camera looks across a continuous field. Each depth row extends past
  // the screen on both sides, just as it does on the home screen.
  function prepareGeometry() {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (width < 2 || height < 2 || !ctx) return null;
    const small = height < 250;
    const density = Math.min(devicePixelRatio || 1, small ? 1.6 : 1.5);
    if (geometry?.width === width && geometry.height === height && geometry.density === density) return geometry;
    canvas.width = Math.round(width * density);
    canvas.height = Math.round(height * density);
    ctx.setTransform(density, 0, 0, density, 0, 0);

    if (!rendererInitialized) {
      renderer = window.createTerrainRenderer?.();
      rendererInitialized = true;
    }
    const sprites = new Map(), rows = [];
    const center = width * .54;
    let seed = 71593;
    for (let line = 0; line < 94; line++) {
      const depth = 24 * Math.pow(.958, line) + .48;
      const perspective = height * .83 / depth;
      if (perspective > height * .76) break;
      const step = Math.max(small ? 2.4 : 2.65, Math.min(small ? 6.0 : 8.4, perspective * .068));
      const size = Math.round(Math.min(small ? 7.0 : 10.2, 3.1 + perspective * .055) * 2) / 2;
      if (!sprites.has(size)) sprites.set(size, makeSprite(size, density));
      const points = [];
      for (let px = -step; px < width + step * 1.5; px += step) {
        const x = (px - center) / perspective + .16;
        const valley = (px - center) / (width * .51);
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        points.push({
          x: px, worldX: x, grain: seed / 4294967296, pool: Math.exp(-valley * valley),
          backZ: 9.2 + .86 * Math.sin(x * .31) + .47 * Math.cos(x * .74 + .2),
          backHeight: 2.60 + .80 * Math.cos(x * .57 - .45) + .46 * Math.sin(x * 1.17 + .1) + .16 * Math.sin(x * 2.46),
          middleZ: 4.65 + .53 * Math.sin(x * .58 + .70),
          middleHeight: 1.43 + .53 * Math.cos(x * .79 + 1.2) + .25 * Math.sin(x * 1.66 - .65),
          nearZ: 2.55 + .38 * Math.cos(x * .77 + .2),
          nearHeight: .35 + .22 * Math.sin(x * .94 + .7), height: 0, y: 0, visible: false,
        });
      }
      rows.push({depth, perspective, step, size, sprite: sprites.get(size), points,
        distant: perspective < Math.max(13, height * .050)});
    }
    const gpu = renderer?.available && renderer.resize(width, height, density, rows) ? renderer : null;
    geometry = {width, height, density, small, rows, gpu, occlusion: new Float32Array(Math.ceil(width / 4))};
    return geometry;
  }

  function elevation(point, z, valleyAxis) {
    const x = point.worldX;
    // The four travelling harmonics and their central valley come from home.js.
    const wave = .39 * Math.sin(x * 1.72 + z * .73) + .26 * Math.cos(x * .75 - z * .54)
      + .115 * Math.sin(x * 3.96 - z * 1.3) + .043 * Math.cos(x * 8.3 + z * 2.1);
    const channel = (x - valleyAxis) / .96;
    const back = (z - point.backZ) / 1.59, middle = (z - point.middleZ) / 1.06, near = (z - point.nearZ) / .82;
    return wave * (1 - .64 * Math.exp(-channel * channel))
      + point.backHeight * Math.exp(-back * back)
      + point.middleHeight * Math.exp(-middle * middle)
      + point.nearHeight * Math.exp(-near * near);
  }

  function trace(gpu, a, b, opacity) {
    if (gpu) {
      gpu.trace(a, b, opacity);
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,' + opacity + ')';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  function paintTerrain(now) {
    frame = 0;
    if (!dialog.open || document.hidden) return;
    const layout = prepareGeometry();
    if (!layout) return;
    const still = reducedMotion.matches;
    if (!still && lastPaint) elapsed += Math.min((now - lastPaint) / 1000, .18);
    lastPaint = now;
    const time = still ? 0 : elapsed * 1.05 / window.crtGeometry.durationScale;
    const travel = .49 * Math.sin(time * .43) + .17 * Math.sin(time * .91);
    const {width, height, rows, occlusion} = layout;
    const horizon = height * .437;
    const gpu = layout.gpu?.available ? layout.gpu : null;

    occlusion.fill(Infinity);
    for (let index = rows.length - 1; index >= 0; index--) {
      const row = rows[index];
      const z = row.depth + travel, axis = .18 * Math.sin(z);
      row.visible = false;
      for (const point of row.points) {
        point.height = elevation(point, z, axis);
        point.y = horizon + (1.12 - point.height) * row.perspective;
      }
      // Near silhouettes occlude distant marks. Allow the full width of the
      // glyph and of the line preceding it when testing each screen interval.
      const extent = Math.max(row.step + 1, row.size * .5 + 1);
      for (let i = 1; i < row.points.length; i++) {
        const point = row.points[i];
        const first = Math.max(0, Math.floor((point.x - extent) / 4));
        const last = Math.min(occlusion.length - 1, Math.floor((point.x + extent) / 4));
        const top = Math.min(point.y - row.size * .52, row.points[i - 1].y - 1);
        point.visible = false;
        if (top > height + 3) continue;
        for (let slot = first; slot <= last; slot++) {
          if (top > occlusion[slot] + .8) continue;
          point.visible = row.visible = true;
          break;
        }
      }
      let i = 1;
      for (let slot = 0; slot < occlusion.length; slot++) {
        const left = slot * 4, right = Math.min(width, left + 4);
        while (row.points[i].x < left) i++;
        let a = row.points[i - 1], b = row.points[i];
        let bound = a.y + (b.y - a.y) * (left - a.x) / row.step;
        while (row.points[i].x < right) {
          bound = Math.max(bound, row.points[i].y);
          i++;
        }
        a = row.points[i - 1]; b = row.points[i];
        bound = Math.max(bound, a.y + (b.y - a.y) * (right - a.x) / row.step);
        occlusion[slot] = Math.min(occlusion[slot], bound);
      }
    }

    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = .75;
    gpu?.begin();
    for (const row of rows) {
      if (!row.visible) continue;
      const {points, perspective, sprite, step} = row;
      if (gpu) {
        for (let i = 1; i < points.length; i++) gpu.slope(points[i - 1], points[i], height + 3);
      } else {
        ctx.beginPath();
        ctx.moveTo(-step, height + 3);
        for (const point of points) ctx.lineTo(point.x, point.y);
        ctx.lineTo(width + step, height + 3);
        ctx.closePath();
        ctx.fillStyle = '#020202';
        ctx.fill();
      }
      const z = row.depth + travel;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], point = points[i];
        if (!point.visible) continue;
        const slope = (point.height - a.height) * perspective / step;
        const distance = (point.y - horizon) / (height * .24);
        const band = Math.sin(z * .44 + point.worldX * .24 - time * 1.6) / .20;
        const face = Math.max(-.19, Math.min(.24, slope * .18));
        const light = Math.max(.05, .21 + .18 * point.pool + .16 * Math.exp(-distance * distance)
          + face + .09 * point.height + .19 * Math.exp(-band * band));
        const intensity = Math.min(1, light * (.66 + .48 * point.grain));
        if (row.distant || step < 4.0 || point.grain > .80) {
          trace(gpu, a, point, intensity * (row.distant ? .78 : step < 4.0 ? .67 : .36));
        }
        if (row.distant || (step < 3.15 && point.grain < .31)) continue;
        const first = Math.floor(point.grain * glyphs.length);
        const tick = Math.floor(time * .67 + 1 - point.x / width);
        const glyph = (first + tick + glyphs.length) % glyphs.length;
        const x = point.x - sprite.span / 2, y = point.y - sprite.span / 2;
        stamp(gpu, sprite, glyph, x, y, intensity);
        if (step > 5.2 && point.grain > .46) {
          const echo = (glyphs.length - 1 - first + tick + glyphs.length) % glyphs.length;
          stamp(gpu, sprite, echo, x + .8, y + row.size * .65, intensity * .40);
        }
      }
    }
    gpu?.draw(ctx, width, height);
    if (!still && dialog.open && !document.hidden) {
      const interval = layout.small ? 1000 / 18 : 1000 / 27;
      timer = setTimeout(() => { timer = 0; frame = requestAnimationFrame(paintTerrain); },
        Math.max(0, interval - (performance.now() - now) - 7));
    }
  }

  function stopTerrain() {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    timer = frame = lastPaint = 0;
  }
  function requestDraw() {
    stopTerrain();
    if (dialog.open && !document.hidden) frame = requestAnimationFrame(paintTerrain);
  }
  new ResizeObserver(requestDraw).observe(canvas);
  reducedMotion.addEventListener('change', requestDraw);
  document.addEventListener('visibilitychange', requestDraw);

  document.addEventListener('zoea-language-change', () => {
    if (dialog.open) {
      translate();
      requestDraw();
    }
  });
  function restoreForm() {
    delete passwordLabel.dataset.dossierCurveLabel;
    if (field.contains(password)) field.replaceWith(password);
    if (slot.contains(form)) home.insertBefore(form, unlocked);
  }
  function dismiss() {
    root.dispatchEvent(new CustomEvent('dossier-entry-dismiss'));
  }
  close.addEventListener('click', dismiss);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    dismiss();
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.isComposing) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) dismiss();
    }
  }, true);
  dialog.addEventListener('close', () => {
    if (!dialog.open) {
      stopTerrain();
      restoreForm();
    }
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dismiss();
  });
  window.zoeaEntry = {
    show() {
      if (dialog.open) return;
      translate();
      slot.append(form);
      passwordLabel.dataset.dossierCurveLabel = '';
      if (!field.contains(password)) {
        password.before(field);
        field.append(password);
      }
      dialog.showModal();
      dialog.scrollTop = 0;
      if (matchMedia('(min-width: 730px) and (pointer: fine)').matches) {
        password.focus({preventScroll: true});
      } else {
        title.focus({preventScroll: true});
      }
      requestDraw();
    },
    hide() {
      stopTerrain();
      if (dialog.open) dialog.close();
      restoreForm();
    },
  };
})();
