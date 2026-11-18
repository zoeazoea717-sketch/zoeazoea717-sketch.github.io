(() => {
  const root = document.getElementById('zoea-archive');
  const directory = root.querySelector('.works-unlocked');
  const resume = directory.querySelector('.dossier-resume-launch');
  const projectList = directory.querySelector('.dossier-projects');
  const card = directory.querySelector('.dossier-card');
  const cardOpen = card.querySelector('.dossier-card-open');
  const cardMedia = card.querySelector('.dossier-card-media');
  const playCard = card.querySelector('.dossier-card-play');
  const profile = document.getElementById('dossier-reader');
  const profileContent = profile.querySelector('.dossier-profile-content');
  const viewer = document.getElementById('dossier-lightbox');
  const original = viewer.querySelector('.dossier-original');
  const enlarge = viewer.querySelector('.dossier-zoom-toggle');
  const details = document.getElementById('dossier-details');
  const infoToggle = viewer.querySelector('.dossier-toggle-info');
  const film = viewer.querySelector('.dossier-film');
  const player = viewer.querySelector('.dossier-player');
  const download = profile.querySelector('.dossier-download');
  const base = new URL('./assets/dossier/', document.baseURI);
  const sessionName = 'zoea.private.dossier.v1';
  const resources = new Map();
  const cardPositions = new Map();
  const zh = () => !document.documentElement.lang.startsWith('en');
  const copy = (chinese, english) => zh() ? chinese : english;
  const read = value => zh() ? value.zh : value.en;
  let key, dossier, selectedId, profileWindow, imageWindow;
  let viewerPosition = 0, viewerOpener;
  let cardRevision = 0, viewerRevision = 0, filmRevision = 0;
  let swipe, suppressClick = false, tapFallback;

  function el(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value) node.textContent = value;
    return node;
  }

  async function fetchBytes(file) {
    const url = new URL(file, base);
    url.searchParams.set('v','university-index');
    const response = await fetch(url, {cache:'no-cache'});
    if (response.status !== 200) throw new Error('Archive unavailable');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < (file==='catalog.bin' ? 44 : 28)) throw new Error('Incomplete archive');
    return bytes;
  }

  function decrypt(cipherKey, bytes) {
    return crypto.subtle.decrypt({name:'AES-GCM', iv:bytes.subarray(0, 12)}, cipherKey, bytes.subarray(12));
  }

  async function activate(raw, index) {
    const candidate = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    const decoded = JSON.parse(new TextDecoder().decode(await decrypt(candidate, index.subarray(16))));
    key = candidate;
    dossier = decoded;
    selectedId = decoded.projects[0]?.id;
    cardPositions.clear();
    for (const toggle of directory.querySelectorAll('.dossier-group-toggle')) {
      setGroup(toggle,toggle.getAttribute('aria-controls')==='dossier-student-projects');
    }
    buildIndex();
  }

  async function unlock(password) {
    const index = await fetchBytes('catalog.bin');
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const raw = new Uint8Array(await crypto.subtle.deriveBits(
      {name:'PBKDF2', hash:'SHA-256', iterations:600000, salt:index.subarray(0, 16)}, material, 256));
    await activate(raw, index);
    try { sessionStorage.setItem(sessionName, btoa(String.fromCharCode(...raw))); } catch {}
    raw.fill(0);
  }

  async function restore() {
    try {
      const cached = sessionStorage.getItem(sessionName);
      if (!cached) return false;
      const raw = Uint8Array.from(atob(cached), char => char.charCodeAt(0));
      await activate(raw, await fetchBytes('catalog.bin'));
      raw.fill(0);
      return true;
    } catch {
      try { sessionStorage.removeItem(sessionName); } catch {}
      return false;
    }
  }

  function resourceURL(item) {
    if (!key || !/^[a-f0-9]{32}\.bin$/.test(item.object)) return Promise.reject(new Error('Locked'));
    if (resources.has(item.object)) return resources.get(item.object);
    const activeKey = key;
    const promise = (async () => {
      const data = await decrypt(activeKey, await fetchBytes(item.object));
      if (key !== activeKey) throw new Error('Locked');
      return URL.createObjectURL(new Blob([data], {type:item.type}));
    })();
    resources.set(item.object, promise);
    promise.catch(() => { if (resources.get(item.object) === promise) resources.delete(item.object); });
    return promise;
  }

  function project() {
    return dossier?.projects.find(item=>item.id===selectedId);
  }

  function frames(work) {
    const entries = [work.cover,work.hero,...(work.gallery || []),work.awardImage].filter(Boolean);
    return [...new Map(entries.map(image=>[image.object,image])).values()];
  }

  function filmFor(work,position) {
    return work && (frames(work)[position]?.film || work.film);
  }

  function notifyLayout(reveal=false) {
    root.dispatchEvent(new CustomEvent('dossier-layout',{detail:{reveal}}));
  }

  function setGroup(toggle,open) {
    toggle.setAttribute('aria-expanded',String(open));
    toggle.querySelector('.dossier-marker').textContent = open ? '▾' : '▸';
    document.getElementById(toggle.getAttribute('aria-controls')).hidden = !open;
  }

  for (const toggle of directory.querySelectorAll('.dossier-group-toggle')) {
    toggle.addEventListener('click',()=>{
      setGroup(toggle,toggle.getAttribute('aria-expanded')!=='true');
      notifyLayout(toggle.getAttribute('aria-controls')==='dossier-student-projects' && toggle.getAttribute('aria-expanded')==='true');
    });
  }

  function buildIndex() {
    projectList.replaceChildren();
    projectList.hidden = dossier.projects.length<2;
    for (const work of dossier.projects) {
      const button = el('button','dossier-project',read(work.title));
      button.type = 'button';
      button.dataset.project = work.id;
      button.dataset.dossierControl = '';
      button.dataset.worksText = '';
      button.addEventListener('click',()=>{
        if (selectedId===work.id) return;
        selectedId = work.id;
        showCard(true);
      });
      projectList.append(button);
    }
    showCard();
  }

  function countText(position,total) {
    return String(position+1).padStart(2,'0')+' / '+String(total).padStart(2,'0');
  }

  function captionText(item,includeTitle=false) {
    const title = includeTitle && item.title ? read(item.title)+' · ' : '';
    return title+read(item.caption)+(item.time ? '　'+item.time : '');
  }

  async function loadImage(item) {
    const image = el('img');
    image.alt = read(item.caption);
    image.src = await resourceURL(item);
    await image.decode();
    return image;
  }

  function showCard(reveal=false) {
    const work = project();
    if (!work) return;
    const items = frames(work);
    const position = cardPositions.get(work.id) || 0;
    const item = position===0 && work.cardCover ? work.cardCover : items[position];
    const title = read(work.title);
    card.dataset.project = work.id;
    card.toggleAttribute('data-portrait',item.height>item.width);
    card.querySelector('.dossier-card-name').textContent = title;
    card.querySelector('.dossier-card-kind').textContent = read(work.medium);
    const caption = captionText(item,item===work.cardCover);
    card.querySelector('.dossier-card-caption').textContent = caption;
    card.querySelector('.dossier-frame-count').textContent = countText(position,items.length);
    cardOpen.setAttribute('aria-label',copy('查看原图','View original')+' · '+title+' · '+caption);
    const clip = filmFor(work,position);
    playCard.hidden = !clip;
    playCard.querySelector('.dossier-duration').textContent = clip?.duration || '';
    if (clip) {
      playCard.querySelector('.dossier-play-label').textContent = clipLabel(clip);
      playCard.setAttribute('aria-label',playLabel(clip)+' · '+title);
    }
    else playCard.removeAttribute('aria-label');
    for (const button of projectList.children) button.setAttribute('aria-pressed',String(button.dataset.project===work.id));
    for (const button of card.querySelectorAll('[data-step]')) button.disabled = items.length<2;
    const revision = ++cardRevision;
    cardOpen.setAttribute('aria-busy','true');
    if (cardMedia.dataset.object!==item.object) {
      cardMedia.replaceChildren();
      delete cardMedia.dataset.object;
    }
    loadImage(item).then(image=>{
      if (revision!==cardRevision) return;
      cardOpen.setAttribute('aria-busy','false');
      cardMedia.dataset.object = item.object;
      cardMedia.replaceChildren(image);
      notifyLayout(reveal);
    }).catch(()=>{
      if (revision!==cardRevision) return;
      cardOpen.setAttribute('aria-busy','false');
      card.querySelector('.dossier-card-caption').textContent = copy('封面未载入，点击重试','Cover unavailable. Click to retry.');
      notifyLayout();
    });
    notifyLayout();
  }

  function showViewerFrame() {
    const work = project();
    if (!work || !viewer.open) return;
    const items = frames(work);
    const item = items[viewerPosition];
    if (player.hidden) viewer.style.setProperty('--art-ratio',item.width/item.height);
    enlarge.disabled = true;
    viewer.querySelector('h2').textContent = read(work.title);
    viewer.querySelector('.dossier-frame-count').textContent = countText(viewerPosition,items.length);
    viewer.querySelector('.dossier-image-caption').textContent = captionText(item);
    for (const button of viewer.querySelectorAll('[data-step]')) button.disabled = items.length<2;
    const clip = filmFor(work,viewerPosition);
    film.hidden = !clip;
    if (clip && player.hidden && !film.disabled) film.textContent = '▶　'+playLabel(clip);
    updateInfoLabels();
    updateDetails();
    const revision = ++viewerRevision;
    original.setAttribute('aria-busy','true');
    loadImage(item).then(image=>{
      if (revision!==viewerRevision || !viewer.open) return;
      image.dataset.object = item.object;
      original.querySelector('img').replaceWith(image);
      original.setAttribute('aria-busy','false');
      enlarge.disabled = false;
    }).catch(()=>{
      if (revision!==viewerRevision || !viewer.open) return;
      original.querySelector('img').removeAttribute('src');
      original.setAttribute('aria-busy','false');
      viewer.querySelector('.dossier-image-caption').textContent = copy('画面未载入，点击原图重试','Image unavailable. Select the image to retry.');
    });
  }

  function changeFrame(owner,step) {
    const work = project();
    if (!work) return;
    const total = frames(work).length;
    if (owner===viewer) {
      stopFilm();
      viewerPosition = (viewerPosition+step+total)%total;
      showViewerFrame();
    } else {
      cardPositions.set(work.id,((cardPositions.get(work.id)||0)+step+total)%total);
      showCard(true);
    }
  }

  function section(title,value) {
    const box = el('section','dossier-copy');
    box.append(el('h3','',title),el('p','',value));
    return box;
  }

  function renderProfile() {
    const p = dossier.profile;
    const heading = el('div','dossier-identity');
    heading.append(el('p','dossier-path','C:\\ZOEA\\PROFILE>'),el('h3','dossier-title dossier-phosphor',read(p.name)),el('p','dossier-job',p.handle+'　/　'+read(p.direction)));
    const contacts = el('section','dossier-copy');
    const links = el('div','dossier-contacts');
    for (const [scheme,value] of [['tel:',p.phone],['mailto:',p.email]]) {
      const a = el('a','',value);
      a.href = scheme+value;
      links.append(a);
    }
    contacts.append(el('h3','',copy('联系方式','Contact')),links);
    profileContent.replaceChildren(heading,section(copy('教育经历','Education'),read(p.education)+'　'+p.years),section(copy('学生时期','Student work'),read(p.intro)),contacts);
    profile.querySelector('.dossier-status').textContent = '';
    profile.dispatchEvent(new Event('dossier-selection'));
  }

  function updateDetails() {
    const work = project();
    if (!work) return;
    const pane = details.querySelector('.dossier-details-copy');
    const frame = frames(work)[viewerPosition];
    const introduction = el('div','dossier-copy');
    introduction.append(el('p','',read(work.description)));
    pane.replaceChildren(el('p','dossier-kind',read(work.medium)),el('h3','dossier-work-title',read(frame.title || frame.caption)),el('p','dossier-meta',read(work.meta)),
      introduction,section(copy('我的分工','My contribution'),read(work.role)));
    if (work.awards?.length) {
      const awards = el('section','dossier-copy');
      const list = el('ul');
      for (const award of work.awards) list.append(el('li','',read(award)));
      awards.append(el('h3','',copy('团队获奖','Team awards')),list);
      pane.append(awards);
    }
  }

  function updateInfoLabels() {
    const open = viewer.hasAttribute('data-details');
    const action = open ? copy('收起介绍','Hide details') : copy('作品介绍','Project details');
    infoToggle.textContent = action+(open ? '　×' : '　→');
    infoToggle.setAttribute('aria-expanded',String(open));
    original.setAttribute('aria-expanded',String(open));
    original.setAttribute('aria-label',open ? copy('点击原图收起介绍','Click image to hide details') : copy('点击原图查看作品介绍','Click image for project details'));
    original.title = original.getAttribute('aria-label');
  }

  function setDetails(open,moveFocus=false) {
    viewer.toggleAttribute('data-details',open);
    details.inert = !open;
    details.setAttribute('aria-hidden',String(!open));
    updateInfoLabels();
    if (open) {
      details.scrollTop = 0;
      if (getComputedStyle(details).position==='relative') {
        const body = details.parentElement;
        body.scrollTop = Math.max(0,details.offsetTop - body.clientHeight*.45);
      }
      if (moveFocus) details.querySelector('button').focus({preventScroll:true});
    } else {
      details.parentElement.scrollTop = 0;
      if (moveFocus) infoToggle.focus({preventScroll:true});
    }
  }

  function toggleDetails() {
    const open = !viewer.hasAttribute('data-details');
    setDetails(open,document.documentElement.dataset.input==='keyboard');
    root.dispatchEvent(new CustomEvent('dossier-action',{detail:open ? 'expand' : 'collapse'}));
  }

  function clipLabel(clip) {
    return clip.kind==='model' ? copy('播放展示','Play study') : copy('播放短片','Play film');
  }

  function playLabel(clip) {
    return clipLabel(clip)+'　'+clip.duration;
  }

  function stopFilm() {
    ++filmRevision;
    const video = player.querySelector('video');
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    player.replaceChildren();
    player.hidden = true;
    original.hidden = false;
    film.disabled = false;
    viewer.removeAttribute('data-playing');
    const work = project();
    if (work && viewer.open) {
      const frame = frames(work)[viewerPosition];
      if (frame) viewer.style.setProperty('--art-ratio',frame.width/frame.height);
      const clip = filmFor(work,viewerPosition);
      if (clip) film.textContent = '▶　'+playLabel(clip);
    }
  }

  async function playFilm() {
    const work = project();
    const clip = filmFor(work,viewerPosition);
    if (!clip || !viewer.open) return;
    const revision = ++filmRevision;
    setDetails(false);
    viewer.setAttribute('data-playing','');
    viewer.style.setProperty('--art-ratio',16/9);
    original.hidden = true;
    player.hidden = false;
    const loading = el('p','dossier-player-status',copy('正在载入短片…','Loading film…'));
    loading.setAttribute('role','status');
    player.replaceChildren(loading);
    film.disabled = true;
    film.textContent = copy('正在载入…','Loading…');
    try {
      const url = await resourceURL(clip);
      if (revision!==filmRevision || !viewer.open || !dossier) return;
      const video = el('video');
      video.controls = true;
      video.playsInline = true;
      video.addEventListener('loadedmetadata',()=>{
        if (revision===filmRevision && video.videoHeight) viewer.style.setProperty('--art-ratio',video.videoWidth/video.videoHeight);
      },{once:true});
      video.src = url;
      video.setAttribute('aria-label',read(work.title));
      player.replaceChildren(video);
      film.disabled = false;
      film.textContent = copy('返回原图','Back to image');
      video.play().catch(()=>{});
      video.focus({preventScroll:true});
    } catch {
      if (revision!==filmRevision) return;
      stopFilm();
      film.textContent = copy('重试播放','Retry film');
    }
  }
  film.addEventListener('click',()=>{
    if (player.hidden) playFilm();
    else stopFilm();
  });

  resume.addEventListener('click',()=>{
    if (!dossier) return;
    profileWindow();
    renderProfile();
    profileContent.scrollTop = 0;
  });
  function openPicture(opener=cardOpen) {
    if (!dossier || viewer.open) return;
    viewerOpener = opener;
    viewerPosition = cardPositions.get(selectedId) || 0;
    imageWindow();
    setDetails(false);
    showViewerFrame();
    if (opener===playCard) playFilm();
  }
  cardOpen.addEventListener('click',()=>{
    clearTimeout(tapFallback);
    if (suppressClick) { suppressClick = false; return; }
    if (!cardMedia.dataset.object && cardOpen.getAttribute('aria-busy')==='false') { showCard(); return; }
    openPicture();
  });
  playCard.addEventListener('click',()=>openPicture(playCard));
  original.addEventListener('click',()=>{
    if (original.getAttribute('aria-busy')==='true') return;
    if (!original.querySelector('img').hasAttribute('src')) showViewerFrame();
    else toggleDetails();
  });
  infoToggle.addEventListener('click',toggleDetails);
  details.querySelector('.dossier-hide-info').addEventListener('click',()=>{
    setDetails(false,true);
    root.dispatchEvent(new CustomEvent('dossier-action',{detail:'collapse'}));
  });
  for (const owner of [card,viewer]) {
    for (const button of owner.querySelectorAll('[data-step]')) button.addEventListener('click',()=>changeFrame(owner,Number(button.dataset.step)));
    owner.addEventListener('keydown',event=>{
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.target.closest('video,aside')) return;
      if (event.key!=='ArrowLeft' && event.key!=='ArrowRight') return;
      event.preventDefault();
      changeFrame(owner,event.key==='ArrowRight' ? 1 : -1);
      root.dispatchEvent(new CustomEvent('dossier-action',{detail:'select'}));
    });
  }
  document.addEventListener('pointerdown',()=>clearTimeout(tapFallback),{capture:true,passive:true});
  cardOpen.addEventListener('pointerdown',event=>{
    suppressClick = false;
    if (event.isPrimary && event.button===0) swipe = {id:event.pointerId,x:event.clientX,y:event.clientY};
  });
  cardOpen.addEventListener('pointercancel',()=>{swipe=null;});
  cardOpen.addEventListener('pointerup',event=>{
    if (swipe?.id!==event.pointerId) return;
    const dx = event.clientX-swipe.x, dy = event.clientY-swipe.y;
    swipe = null;
    if (event.pointerType==='touch' && Math.hypot(dx,dy)<10) {
      // Let the compatibility click finish on the card before a native dialog covers it.
      // Some touch browsers omit that click immediately after a horizontal swipe.
      const tapped = cardMedia.dataset.object;
      tapFallback = setTimeout(()=>{
        if (dossier && !viewer.open && cardOpen.getClientRects().length && tapped===cardMedia.dataset.object) openPicture();
      },450);
      return;
    }
    if (Math.abs(dx)<45 || Math.abs(dx)<Math.abs(dy)*1.5) return;
    suppressClick = true;
    changeFrame(card,dx<0 ? 1 : -1);
    root.dispatchEvent(new CustomEvent('dossier-action',{detail:'select'}));
    setTimeout(()=>{suppressClick=false;},400);
  });

  viewer.addEventListener('cancel',event=>{
    if (document.fullscreenElement) return;
    if (!player.hidden || viewer.hasAttribute('data-details')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!player.hidden) { stopFilm(); film.focus({preventScroll:true}); }
      else setDetails(false,true);
      root.dispatchEvent(new CustomEvent('dossier-action',{detail:'collapse'}));
    }
  });
  viewer.addEventListener('close',()=>{
    if (viewer.open) return;
    ++viewerRevision;
    stopFilm();
    setDetails(false);
    const image = original.querySelector('img');
    image.removeAttribute('src');
    image.removeAttribute('data-object');
    image.alt = '';
    details.querySelector('.dossier-details-copy').replaceChildren();
    if (!directory.hidden && dossier && !root.hidden) viewerOpener?.focus({preventScroll:true});
    viewerOpener = null;
  });
  profile.addEventListener('close',()=>{
    if (profile.open) return;
    profileContent.replaceChildren();
    if (!directory.hidden && dossier && !root.hidden) resume.focus({preventScroll:true});
  });
  download.addEventListener('click',async()=>{
    const active = dossier;
    if (!active) return;
    download.disabled = true;
    try {
      const url = await resourceURL(active.pdf);
      if (dossier!==active || !profile.open) return;
      const link = el('a');
      link.href = url; link.download = active.pdf.filename;
      profile.append(link);
      link.click();
      link.remove();
    } catch { profile.querySelector('.dossier-status').textContent = copy('下载失败，请重试。','Download failed. Please retry.'); }
    finally { download.disabled = false; }
  });

  function lock() {
    clearTimeout(tapFallback);
    ++cardRevision;
    ++viewerRevision;
    if (profile.open) profile.close();
    if (viewer.open) viewer.close();
    stopFilm();
    key = dossier = selectedId = null;
    cardPositions.clear();
    projectList.replaceChildren();
    cardMedia.replaceChildren();
    delete cardMedia.dataset.object;
    playCard.hidden = true;
    playCard.removeAttribute('aria-label');
    playCard.querySelector('.dossier-duration').textContent = '';
    film.textContent = '';
    for (const element of root.querySelectorAll('.dossier-card-name,.dossier-card-kind,.dossier-card-caption,.dossier-frame-count,.dossier-image-caption,#dossier-lightbox-title,.dossier-details-copy,.dossier-profile-content')) element.replaceChildren();
    cardOpen.removeAttribute('aria-label');
    card.removeAttribute('data-project');
    card.removeAttribute('data-portrait');
    cardOpen.removeAttribute('aria-busy');
    for (const promise of resources.values()) promise.then(url=>URL.revokeObjectURL(url)).catch(()=>{});
    resources.clear();
    try { sessionStorage.removeItem(sessionName); } catch {}
    notifyLayout();
  }
  directory.querySelector('.dossier-lock').addEventListener('click',()=>{
    lock();
    root.dispatchEvent(new Event('dossier-lock'));
  });
  root.addEventListener('crt-view',()=>{
    if (viewer.open) viewer.close();
    if (profile.open) profile.close();
  });
  document.addEventListener('zoea-language-change',()=>{
    if (!dossier) return;
    buildIndex();
    if (profile.open) renderProfile();
    if (viewer.open) showViewerFrame();
  });
  window.zoeaDossier = {unlock,restore,lock,bindWindows(showProfile,showImage) { profileWindow=showProfile; imageWindow=showImage; }};
})();
