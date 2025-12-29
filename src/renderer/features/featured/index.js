(function registerFeatured(){
  const namespace = window.features = window.features || {};

  // helper: determine if a hex color is light
  function hexToRgb(hex) {
    if (!hex) return null;
    hex = hex.replace('#','');
    if (hex.length === 3) hex = hex.split('').map(c=>c+c).join('');
    const int = parseInt(hex,16);
    return { r: (int>>16)&255, g: (int>>8)&255, b: int&255 };
  }
  function luminance(r,g,b){
    const a = [r,g,b].map(v=>{
      v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4);
    });
    return 0.2126*a[0] + 0.7152*a[1] + 0.0722*a[2];
  }
  function isLight(hex){
    const rgb = hexToRgb(hex);
    if (!rgb) return false;
    return luminance(rgb.r,rgb.g,rgb.b) > 0.6; // threshold tuned for readability
  }

  // Cache for extracted colors per URL/name to avoid repeated work
  const _colorCache = new Map();
  function rgbToHex(r,g,b){
    return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
  }
  // Extract a simple average color from an image URL (uses canvas). Returns hex or null.
  function extractDominantColor(url){
    if (!url) return Promise.resolve(null);
    if (_colorCache.has(url)) return Promise.resolve(_colorCache.get(url));
    return new Promise(resolve => {
      try {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.src = url;
        img.onload = () => {
          try {
            const size = 32;
            const canvas = document.createElement('canvas');
            canvas.width = size; canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, size, size);
            const data = ctx.getImageData(0,0,size,size).data;
            let r=0,g=0,b=0,count=0;
            for (let i=0;i<data.length;i+=4){
              const alpha = data[i+3];
              if (alpha < 32) continue; // skip mostly transparent
              r += data[i]; g += data[i+1]; b += data[i+2]; count++;
            }
            if (!count) { _colorCache.set(url,null); resolve(null); return; }
            r = Math.round(r/count); g = Math.round(g/count); b = Math.round(b/count);
            const hex = rgbToHex(r,g,b);
            _colorCache.set(url, hex);
            resolve(hex);
          } catch(e){ _colorCache.set(url,null); resolve(null); }
        };
        img.onerror = () => { _colorCache.set(url,null); resolve(null); };
      } catch(e){ resolve(null); }
    });
  }

  function renderItem(item, container) {
    const html = `
      <div class="featured-item" role="group" aria-label="${item.title}">
        <div class="featured-visual">
          <img class="featured-icon" src="${getIconUrl(item.name||'')}" alt="${item.title}" onerror="this.onerror=null;this.src='https://raw.githubusercontent.com/Portable-Linux-Apps/Portable-Linux-Apps.github.io/main/icons/blank.png'"/>
        </div>
        <div class="featured-body">
          <div class="featured-title">${item.title}</div>
          <div class="featured-desc">${item.desc}</div>
        </div>
      </div>`;
    container.innerHTML = html;
  }

  function init(options = {}) {
    const container = options.container || document.getElementById('featuredBanner');
    const state = options.state || {};
    const DEFAULT_ITEMS = [
      { name: 'code', title: 'Visual Studio Code', desc: 'A lightweight but powerful source code editor.', color: '#007ACC' },
      { name: 'vlc', title: 'VLC', desc: 'A free and open source cross-platform multimedia player.', color: '#E02525' },
      { name: 'jellyfin', title: 'Jellyfin', desc: 'A personal media server that puts you in control.', color: '#F58A25' }
    ];
    // allow passing a static featured config; fallback to DEFAULT_ITEMS if not provided
    const featuredConfig = (Array.isArray(options.featuredConfig) && options.featuredConfig.length)
      ? options.featuredConfig
      : DEFAULT_ITEMS;
    let items = [];
    // initialize empty to avoid flash of static items; updateFromState will later populate
    if (!container) return null;
    container.innerHTML = `
      <div class="featured-inner">
        <div class="featured-controls">
          <button class="featured-prev" aria-label="Previous">◀</button>
          <div class="featured-slot"></div>
          <button class="featured-next" aria-label="Next">▶</button>
        </div>
        <div class="featured-dots" aria-hidden="true"></div>
      </div>`;

    const slot = container.querySelector('.featured-slot');
    const prev = container.querySelector('.featured-prev');
    const next = container.querySelector('.featured-next');
    const dots = container.querySelector('.featured-dots');

    let idx = 0;
    let timer = null;

    function updateDots() {
      dots.innerHTML = items.map((_, i) => `<button class="dot" data-idx="${i}" aria-label="${i+1}"></button>`).join('');
      const btns = dots.querySelectorAll('.dot');
      btns.forEach(b => b.addEventListener('click', () => { goTo(parseInt(b.dataset.idx,10)); }));
    }

    function show(index) {
      if (!items || !items.length) { slot.innerHTML = ''; return; }
      idx = (index + items.length) % items.length;
      renderItem(items[idx], slot);
      const featuredInnerEl = container.querySelector('.featured-inner');
      const item = items[idx];
      // apply color to entire banner if provided, otherwise try to extract from the icon
      async function applyColorHex(hex){
        if (hex) {
          featuredInnerEl.style.background = `linear-gradient(90deg, rgba(0,0,0,0.14), rgba(0,0,0,0.10)), linear-gradient(90deg, ${hex}44, ${hex}33)`;
          featuredInnerEl.classList.add('has-color');
          if (isLight(hex)) { featuredInnerEl.classList.add('light-text'); featuredInnerEl.classList.remove('dark-text'); }
          else { featuredInnerEl.classList.add('dark-text'); featuredInnerEl.classList.remove('light-text'); }
        } else {
          featuredInnerEl.style.background = '';
          featuredInnerEl.classList.remove('has-color','light-text','dark-text');
        }
      }
      if (item && item.color) {
        applyColorHex(item.color);
      } else {
        // try extracting from icon; do not block render
        const iconUrl = getIconUrl(item.name||'');
        applyColorHex(null); // clear first
        extractDominantColor(iconUrl).then(hex => {
          if (!hex) return;
          applyColorHex(hex);
        }).catch(()=>{});
      }
      const btns = dots.querySelectorAll('.dot');
      btns.forEach((b,i)=> b.classList.toggle('active', i===idx));
      // add click handler on slot to open details
      const itemEl = slot.querySelector('.featured-item');
      if (itemEl) {
        itemEl.style.cursor = 'pointer';
        itemEl.onclick = () => { if (typeof showDetails === 'function') showDetails(item.name); };
      }
    }

    function goTo(i) { show(i); resetTimer(); }
    function nextItem() {
      // if we're at the last item, pick a new random subset and start from the beginning
      if (!items || items.length === 0) return;
      if (idx === items.length - 1) {
        const newItems = computeItemsFromState();
        if (Array.isArray(newItems) && newItems.length) {
          // remember current page in history before replacing
          pushHistory(items);
          updateItems(newItems);
          return; // updateItems calls show(0)
        }
      }
      show(idx+1);
    }
    function prevItem() {
      // if at first item, try restoring previous page from history
      if (idx === 0) {
        const prev = popHistory();
        if (Array.isArray(prev) && prev.length) {
          // restore previous items and show the last entry
          updateItems(prev, { resetIndex: true, index: prev.length - 1 });
          return;
        }
      }
      show(idx-1);
    }
    function resetTimer() { if (timer) { clearInterval(timer); } timer = setInterval(nextItem, 6000); }

    prev.addEventListener('click', () => { prevItem(); resetTimer(); });
    next.addEventListener('click', () => { nextItem(); resetTimer(); });

    updateDots();
    show(0);
    resetTimer();

    // Accessibility: keyboard
    container.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { prevItem(); resetTimer(); }
      if (e.key === 'ArrowRight') { nextItem(); resetTimer(); }
    });

    // history stack to allow restoring previous pages (max HISTORY_LIMIT)
    const HISTORY_LIMIT = 10;
    let history = [];
    function pushHistory(arr){
      try{
        if (!Array.isArray(arr) || !arr.length) return;
        history.push(arr.slice());
        if (history.length > HISTORY_LIMIT) history.shift();
      }catch(e){}
    }
    function popHistory(){
      try{ return history.length ? history.pop() : null; }catch(e){ return null; }
    }

    function updateItems(newItems, opts = { resetIndex: true, index: 0 }) {
      items = (Array.isArray(newItems) && newItems.length) ? newItems : DEFAULT_ITEMS;
      updateDots();
      if (opts && opts.resetIndex) show(opts.index || 0);
      resetTimer();
    }

    function computeItemsFromState() {
      try {
        const active = (state && (state.categoryOverride && (state.categoryOverride.norm || state.categoryOverride.name || state.categoryOverride.category))) || (state && state.activeCategory) || 'all';
        // Build candidates
        let candidates = [];
        if (active === 'all') {
          candidates = (Array.isArray(state.filtered) && state.filtered.length) ? state.filtered : (state.allApps || []);
        } else if (active === 'installed') {
          candidates = (state.allApps || []).filter(a => a && a.installed);
        } else {
          const norm = s => (s && typeof s === 'string') ? s.trim().toLowerCase() : '';
          candidates = (state.allApps || []).filter(a => a && norm(a.category) === norm(active));
        }
        const source = (Array.isArray(state.filtered) && state.filtered.length) ? state.filtered : candidates;
        const arr = (source || []).filter(app => app && app.name);
        // shuffle and pick subset
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1)); const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
        }
        const picked = a.slice(0, 5);
        const mapped = picked.map(app => ({ name: app.name, title: app.name ? (app.name.charAt(0).toUpperCase()+app.name.slice(1)) : (app?.title||app?.name||''), desc: app?.desc || app?.short || '', color: (featuredConfig.find(f => f.name === app.name) || {}).color || '' }));
        // fallback: only if apps are loaded return static featured
        if (mapped && mapped.length) return mapped;
        if (Array.isArray(state.allApps) && state.allApps.length > 0) return (featuredConfig.length ? featuredConfig : DEFAULT_ITEMS);
        return [];
      } catch (e) { return []; }
    }

    function updateFromState() {
      try {
        // clear history when state changes (new category) to avoid mixing contexts
        history = [];
        const newItems = computeItemsFromState();
        updateItems(newItems);
        // decide visibility: show if items and category allowed and not details and no active search
        const bannerEl = container;
        if (!bannerEl) return newItems;
        const searchEl = document.getElementById('searchInput');
        const q = (searchEl && String(searchEl.value || '').trim()) || '';
        // determine if search is active (either search feature reports searchMode OR input currently focused)
        let searchActive = false;
        try {
          const searchApi = window.features?.search;
          const stateInfo = typeof searchApi?.getSearchState === 'function' ? searchApi.getSearchState() : null;
          if (stateInfo && stateInfo.searchMode) searchActive = true;
        } catch (e) {}
        if (searchEl && document.activeElement === searchEl) searchActive = true;
        const isDetails = document.body.classList.contains('details-mode');
        const isAllowedCategory = !!(state && (state.activeCategory === 'all' || state.categoryOverride));
        // Only hide when BOTH: search is active AND there is non-empty query text.
        const hideBecauseOfSearch = searchActive && q.length > 0;
        bannerEl.hidden = !(newItems && newItems.length && isAllowedCategory && !isDetails && !hideBecauseOfSearch);
        return newItems;
      } catch (e) { return []; }
    }

    return Object.freeze({ show, goTo, updateItems, updateFromState, destroy() { clearInterval(timer); } });
  }

  namespace.featured = Object.freeze({ init });
})();