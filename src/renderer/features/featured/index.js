(function registerFeatured(){
  const namespace = window.features = window.features || {};

  function renderItem(item, container) {
    const html = `
      <div class="featured-item" role="group" aria-label="${item.title}">
        <div class="featured-visual" style="background:${item.color || 'var(--primary)'}">
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
    const items = options.items || (window?.require ? (window.require('./config/featured') || []) : []);
    if (!container) return null;
    container.innerHTML = `
      <div class="featured-inner">
        <button class="featured-prev" aria-label="Previous">◀</button>
        <div class="featured-slot"></div>
        <button class="featured-next" aria-label="Next">▶</button>
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
      const btns = dots.querySelectorAll('.dot');
      btns.forEach((b,i)=> b.classList.toggle('active', i===idx));
      // add click handler on slot to open details
      const item = items[idx];
      const itemEl = slot.querySelector('.featured-item');
      if (itemEl) {
        itemEl.style.cursor = 'pointer';
        itemEl.onclick = () => { if (typeof showDetails === 'function') showDetails(item.name); };
      }
    }

    function goTo(i) { show(i); resetTimer(); }
    function nextItem() { show(idx+1); }
    function prevItem() { show(idx-1); }
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

    return Object.freeze({ show, goTo, destroy() { clearInterval(timer); } });
  }

  namespace.featured = Object.freeze({ init });
})();