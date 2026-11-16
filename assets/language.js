(() => {
  const preference = 'zoea.language';
  const english = {
    home: 'ZOEA home',
    homeSignal: 'The ZOEA wordmark and rolling terrain made of amber characters on a slightly curved CRT display',
    platforms: 'Social links',
    douyin: 'Douyin',
    xiaohongshu: 'Xiaohongshu',
    enter: 'Enter the portfolio',
    archive: 'ZOEA portfolio',
    backHome: 'Return to ZOEA home',
    navigation: 'Portfolio navigation',
    projects: 'Projects',
    about: 'About',
    aboutHeading: 'About ZOEA',
    portfolio: 'Portfolio',
    portfolioTitle: 'Portfolio · ZOEA',
    archiveSignal: 'Amber CRT content',
    aboutContent: 'About ZOEA',
    bio: 'Hey, I’m ZOEA. I work on 3D models and build environments in Unreal Engine (UE). Outside of work, I like taking photos, building plugins and game mods, and making games of my own.',
    commissions: 'Custom Models & Environments',
    commissionsCopy: 'Have a model or environment in mind? Drop me a message through one of the platforms linked on the homepage and we can talk through your idea.',
    courses: 'UE & Modeling Courses',
    coursesCopy: 'I also teach UE and 3D modeling. Classes are taught in Chinese. If you’d like to know more, come say hi on QQ.',
    contact: 'Contact',
    showQq: 'Show QQ contact QR code',
    qqCode: 'QQ contact QR code',
    closeQq: 'Close QR code',
    categories: 'Project categories',
    works: 'Works',
    worksLocked: 'Works are locked',
    worksPassword: 'Access password',
    worksUnlock: 'Unlock',
    worksAccessHint: 'Please ask the author for access to the Works page.',
    worksUnlocked: 'Works are unlocked',
    worksIncorrect: 'Incorrect password. Try again.',
    worksPasswordUnavailable: 'Open the site over HTTPS to unlock Works.',
    plugins: 'Plugins',
    filmScanHelper: 'Film Scan Helper',
    fileDetails: 'File Details',
    fileGeneral: 'General',
    fileName: 'Filename',
    fileVersion: 'Version',
    filmScanVersion: 'v2.6 beta',
    fileRequires: 'Requires',
    fileDescription: 'Description',
    filmScanIntro: 'I made this Photoshop plugin for camera scans of 35 mm black-and-white negatives shot in a film holder. Choose a folder for a roll and it straightens and crops the frames, inverts the negatives, and sets the black and white points.',
    filmScanOutput: 'It works with RAW and JPEG. Export finished JPEGs or keep editable layered PSDs. You can also add film borders, make a preview of the whole roll, or fix individual frames when the automatic settings miss.',
    filmScanFeedback: 'This is a beta, so you may run into bugs or rough edges. If something goes wrong or you have an idea, I’d love to hear from you through one of the links on the homepage.',
    backToPlugins: 'Back to Plugins',
    gwentFinder: 'Gwent Finder',
    gwentVersion: '3.0 offline beta',
    gwentChecked: 'Checked on',
    gwentSystem: 'Windows x64 · The Witcher 3 Next-Gen 5.01',
    gwentIntro: 'I made this tool to help track down missing Gwent cards in The Witcher 3. It checks your latest save and lists missing cards by region. You can search by name, filter by region or expansion, and export the list. It covers the base game, Hearts of Stone, and Blood and Wine.',
    gwentOffline: 'Unzip the download and run the included EXE. With the game closed, add cards one at a time or add one of each card you’re missing. The tool creates a new manual save and leaves your original intact. Load the copy when you restart the game. Offline editing works without a companion mod or the console.',
    gwentFeedback: 'This is a beta. The tool can read back its new saves, and loading them in the game is still untested. Try one card first and keep your original save. Adding cards may leave quests and achievements unchanged. If you run into trouble or have an idea, message me through one of the links on the homepage.',
    backToMods: 'Back to MOD',
    githubDownload: 'Download via GitHub ↗',
    baiduDownload: 'Download via Baidu ↗',
    mute: 'Mute',
    enableSound: 'Turn on sound',
    disableSound: 'Turn off sound'
  };
  const button = document.querySelector('.crt-language');
  const label = button?.querySelector('.crt-language-label');
  const entries = [
    ...[...document.querySelectorAll('[data-i18n]')].map(element=>({
      key:element.dataset.i18n, chinese:element.textContent,
      update:value=>{element.textContent=value;}
    })),
    ...[...document.querySelectorAll('[data-i18n-label]')].map(element=>({
      key:element.dataset.i18nLabel, chinese:element.getAttribute('aria-label'),
      update:value=>{element.setAttribute('aria-label',value);}
    }))
  ];
  let language = 'zh-CN';
  try {
    if (localStorage.getItem(preference)==='en') language = 'en';
  } catch {
    // Language switching is available even when storage is disabled.
  }

  function text(key,chinese) {
    return language==='en' ? english[key] ?? chinese : chinese;
  }

  function apply() {
    document.documentElement.lang = language;
    for (const entry of entries) entry.update(text(entry.key,entry.chinese));
    if (!button) return;
    label.textContent = language==='en' ? 'CN' : 'EN';
    button.title = language==='en' ? 'Switch to Chinese' : '切换到英文';
    button.setAttribute('aria-label',button.title);
  }

  window.zoeaLocale = {text};
  apply();
  if (button) {
    button.hidden = false;
    button.addEventListener('click',()=>{
      language = language==='en' ? 'zh-CN' : 'en';
      try {
        localStorage.setItem(preference,language);
      } catch {
        // Keep the current choice for this visit.
      }
      apply();
      document.dispatchEvent(new Event('zoea-language-change'));
    });
  }
})();
