(() => {
  const root = document.getElementById('zoea-archive');
  const directory = root.querySelector('.works-unlocked');
  const resume = directory.querySelector('.dossier-resume-launch');
  const byline = resume.querySelector('.dossier-byline');
  const projectGrid = directory.querySelector('#dossier-student-projects');
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
  const zh = () => !document.documentElement.lang.startsWith('en');
  const copy = (chinese, english) => zh() ? chinese : english;
  const read = value => zh() ? value.zh : value.en;
  let key, dossier, selectedId, profileWindow, imageWindow;
  let viewerPosition = 0, viewerOpener;
  let gridRevision = 0, viewerRevision = 0, filmRevision = 0;

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
    for (const toggle of directory.querySelectorAll('.dossier-group-toggle')) {
      setGroup(toggle,true);
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
    const profile = dossier.profile;
    byline.textContent = read(profile.name)+' · '+(profile.cardRole ? read(profile.cardRole) : copy('三维美术','3D Artist'));
    const revision = ++gridRevision;
    projectGrid.replaceChildren();
    for (const [index,work] of dossier.projects.entries()) {
      const item = work.cardCover || frames(work)[0];
      const title = read(work.title);
      const cardEl = el('article','dossier-card');
      cardEl.dataset.project = work.id;
      const corners = el('i','dossier-corners');
      corners.setAttribute('aria-hidden','true');

      const openBtn = el('button','dossier-card-open');
      openBtn.type = 'button';
      openBtn.dataset.dossierControl = '';
      openBtn.setAttribute('aria-haspopup','dialog');
      openBtn.setAttribute('aria-controls','dossier-lightbox');
      openBtn.setAttribute('aria-label',copy('查看作品','View artwork')+' · '+title+' · '+captionText(item));
      openBtn.setAttribute('aria-busy','true');

      const media = el('span','dossier-card-media');
      const copyBox = el('span','dossier-card-copy');
      const num = el('span','dossier-card-number',String(index+1).padStart(2,'0'));
      num.dataset.worksText = '';
      const tagText = work.tag ? read(work.tag) : (work.film?.duration || '');
      const tag = el('span','dossier-card-tag',tagText);
      tag.dataset.worksText = '';
      const name = el('strong','dossier-card-name',title);
      name.dataset.worksText = '';
      const kind = el('span','dossier-card-kind',read(work.subtitle || work.medium));
      kind.dataset.worksText = '';
      const pins = el('i','dossier-metal dossier-pins');
      pins.setAttribute('aria-hidden','true');
      copyBox.append(num,tag,name,kind,pins);

      const hit = el('span','dossier-surface-hit dossier-card-hit');
      hit.setAttribute('aria-hidden','true');
      openBtn.append(media,copyBox,hit);
      cardEl.append(corners,openBtn);

      openBtn.addEventListener('click',()=>{
        selectedId = work.id;
        openPicture(openBtn);
      });

      projectGrid.append(cardEl);
      if (viewer.open && selectedId===work.id) viewerOpener = openBtn;
      loadImage(item).then(image=>{
        if (revision!==gridRevision) return;
        openBtn.setAttribute('aria-busy','false');
        media.dataset.object = item.object;
        media.replaceChildren(image);
        notifyLayout();
      }).catch(()=>{
        if (revision!==gridRevision) return;
        openBtn.setAttribute('aria-busy','false');
        notifyLayout();
      });
    }
    notifyLayout(true);
  }

  function countText(position,total) {
    return String(position+1).padStart(2,'0')+' / '+String(total).padStart(2,'0');
  }

  function captionText(item) {
    return read(item.caption)+(item.time ? '　'+item.time : '');
  }

  async function loadImage(item) {
    const image = el('img');
    image.alt = read(item.caption);
    image.src = await resourceURL(item);
    await image.decode();
    return image;
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

  function changeFrame(step) {
    const work = project();
    if (!work) return;
    const total = frames(work).length;
    stopFilm();
    viewerPosition = (viewerPosition+step+total)%total;
    showViewerFrame();
  }

  function section(title,value) {
    const box = el('section','dossier-copy');
    box.append(el('h3','',title),el('p','',value));
    return box;
  }

  function renderProfile() {
    const p = dossier.profile;
    const heading = el('div','dossier-identity');
    heading.append(el('p','dossier-path','C:\\ZOEA\\RESUME>'),el('h3','dossier-title dossier-phosphor',read(p.name)),el('p','dossier-job',p.handle+' / '+read(p.direction)));
    const contacts = el('section','dossier-copy');
    const links = el('div','dossier-contacts');
    for (const [scheme,value] of [['tel:',p.phone],['mailto:',p.email]]) {
      const a = el('a','',value);
      a.href = scheme+value;
      links.append(a);
    }
    for (const portal of root.querySelectorAll('.archive-portals a')) {
      const link = el('a','',portal.getAttribute('aria-label')+' ↗');
      link.href = portal.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      links.append(link);
    }
    contacts.append(el('h3','',copy('联系方式与入口','Contact & links')),links);
    const years = zh() ? '（'+p.years+'）' : ' ('+p.years+')';
    if (p.software?.length) {
      const tools = el('p','dossier-software');
      tools.append(el('strong','',copy('常用软件','Software')),el('span','',p.software.join(' · ')));
      heading.append(tools);
    }
    profileContent.replaceChildren(heading,section(copy('教育背景','Education'),read(p.education)+years),
      section(copy('个人简介','Profile'),read(p.intro)));
    for (const [title,rows] of [
      [copy('核心管线','Core pipeline'),p.pipeline],
      [copy('代表作品与获奖','Selected work & awards'),p.highlights]
    ]) {
      if (!rows?.length) continue;
      const group = el('section','dossier-copy');
      const entries = el('ul','resume-entries');
      for (const row of rows) {
        const item = el('li');
        item.append(el('strong','',read(row.label)),document.createTextNode(copy('：',': ')+read(row.text)));
        entries.append(item);
      }
      group.append(el('h3','',title),entries);
      profileContent.append(group);
    }
    profileContent.append(contacts);
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
      if (moveFocus) details.focus({preventScroll:true});
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
  function openPicture(opener) {
    if (!dossier || viewer.open) return;
    viewerOpener = opener;
    viewerPosition = 0;
    imageWindow();
    setDetails(false);
    showViewerFrame();
  }
  original.addEventListener('click',()=>{
    if (original.getAttribute('aria-busy')==='true') return;
    if (!original.querySelector('img').hasAttribute('src')) showViewerFrame();
  });
  infoToggle.addEventListener('click',toggleDetails);
  for (const button of viewer.querySelectorAll('[data-step]')) button.addEventListener('click',()=>changeFrame(Number(button.dataset.step)));
  viewer.addEventListener('keydown',event=>{
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.target.closest('video,aside')) return;
    if (event.key!=='ArrowLeft' && event.key!=='ArrowRight') return;
    event.preventDefault();
    changeFrame(event.key==='ArrowRight' ? 1 : -1);
    root.dispatchEvent(new CustomEvent('dossier-action',{detail:'select'}));
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
    ++gridRevision;
    ++viewerRevision;
    if (profile.open) profile.close();
    if (viewer.open) viewer.close();
    stopFilm();
    key = dossier = selectedId = null;
    byline.textContent = '';
    projectGrid.replaceChildren();
    film.textContent = '';
    for (const element of root.querySelectorAll('.dossier-frame-count,.dossier-image-caption,#dossier-lightbox-title,.dossier-details-copy,.dossier-profile-content')) element.replaceChildren();
    viewerOpener = null;
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
