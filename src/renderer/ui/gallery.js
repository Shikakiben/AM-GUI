// Screenshot gallery for the details view, and the lightbox it opens into.
//
// Mirrors the gallery the PLA site builds in its app_page.js: previous/next
// buttons disabled at both ends, clickable dots, arrow keys, and the mouse
// wheel inside the lightbox. Every screenshot is preloaded so switching is
// immediate. No autoplay on purpose: the reader decides when to move on.
//
// It adds no translation keys of its own: the arrow labels reuse the ones the
// featured banner already ships (featured.prev / featured.next), the image alt
// is the app name, and the dots are mouse-only shortcuts (aria-hidden) since
// the arrows are the real controls.
(function registerGallery() {
  const ns = window.ui = window.ui || {};

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // options:
  //   t          → translation function
  //   isActive   → () => boolean, false pauses the arrow keys (details closed)
  //   document   → document (tests)
  //   lightbox   → lightbox node, defaults to #mdLightbox (tests)
  //   lightboxImg → lightbox image node, defaults to #mdLightboxImg (tests)
  function init(options = {}) {
    const t = typeof options.t === 'function' ? options.t : (key) => key;
    const documentRef = options.document || document;
    const isActive = typeof options.isActive === 'function' ? options.isActive : () => true;
    const lightbox = options.lightbox || documentRef.getElementById('mdLightbox');
    const lightboxImg = options.lightboxImg || documentRef.getElementById('mdLightboxImg');
    const lightboxButtons = lightbox
      ? Array.prototype.slice.call(lightbox.querySelectorAll('.md-lightbox-btn'))
      : [];

    // Screenshots already requested, so switching back and forth stays instant.
    const preloaded = new Set();
    // Screenshot currently displayed, kept outside the DOM so re-rendering the
    // description (language change, badge refresh) does not reset the gallery.
    let currentApp = null;
    let currentIndex = 0;
    // Gallery the lightbox is showing, so its arrows can keep browsing without
    // closing and reopening it (null for a plain description image).
    let lightboxGallery = null;
    let attachedContainer = null;
    let wheelLockedAt = 0;

    const label = (key, fallback) => {
      const translated = t(key);
      return translated && translated !== key ? translated : fallback;
    };

    // Builds the gallery markup, or '' when the app has no screenshot.
    // Buttons and dots are only emitted for more than one screenshot, which
    // leaves single-image apps untouched. No heading either: the images
    // obviously are screenshots of the app the reader just opened.
    // The whole block stays on a single line because the description is
    // rendered with white-space: pre-wrap.
    function html(sources, appName) {
      const list = Array.isArray(sources) ? sources.filter(Boolean) : [];
      const total = list.length;
      if (!total) return '';
      const img = `<img class="gallery-img" src="${escapeHtml(list[0])}" alt="${escapeHtml(appName || '')}">`;
      if (total < 2) {
        return `<div class="gallery" data-gallery-count="1" data-gallery-index="0">`
          + `<div class="gallery-inner">${img}</div></div>`;
      }
      const prev = `<button type="button" class="gallery-btn" data-gallery-dir="-1" disabled aria-label="${escapeHtml(label('featured.prev', 'Previous'))}">❮</button>`;
      const next = `<button type="button" class="gallery-btn" data-gallery-dir="1" aria-label="${escapeHtml(label('featured.next', 'Next'))}">❯</button>`;
      const dots = list
        .map((_, i) => `<button type="button" class="gallery-dot${i === 0 ? ' active' : ''}" data-gallery-dot="${i}" tabindex="-1" aria-hidden="true"></button>`)
        .join('');
      return `<div class="gallery" data-gallery-count="${total}" data-gallery-index="0" data-gallery-srcs='${escapeHtml(JSON.stringify(list))}'>`
        + `<div class="gallery-inner">${prev}${img}${next}</div>`
        + `<div class="gallery-dots">${dots}</div>`
        + '</div>';
    }

    function preload(sources) {
      if (typeof Image !== 'function') return;
      for (const src of sources) {
        if (!src || preloaded.has(src)) continue;
        preloaded.add(src);
        try { const img = new Image(); img.src = src; } catch (_) {}
      }
    }

    function sourcesOf(gallery) {
      try {
        const parsed = JSON.parse(gallery.getAttribute('data-gallery-srcs') || '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    }

    function galleryOf(node) {
      return (node && node.closest) ? node.closest('.gallery') : null;
    }

    // Shows the given screenshot: image, button states and active dot.
    function applyIndex(gallery, index) {
      if (!gallery) return;
      const total = Number(gallery.getAttribute('data-gallery-count')) || 0;
      if (!total || index < 0 || index >= total) return;
      const previous = Number(gallery.getAttribute('data-gallery-index'));
      gallery.setAttribute('data-gallery-index', String(index));
      currentIndex = index;

      const img = gallery.querySelector('.gallery-img');
      const sources = sourcesOf(gallery);
      const src = sources[index];
      if (img && src && (previous !== index || !img.getAttribute('src'))) {
        img.setAttribute('src', src);
        // Restart the fade-in. No timers involved, so rapid clicks are safe.
        img.classList.remove('gallery-fade');
        void img.offsetWidth;
        img.classList.add('gallery-fade');
      }

      gallery.querySelectorAll('.gallery-btn').forEach((btn) => {
        const dir = Number(btn.getAttribute('data-gallery-dir')) || 0;
        btn.disabled = dir < 0 ? index === 0 : index === total - 1;
      });
      gallery.querySelectorAll('.gallery-dot').forEach((dot) => {
        dot.classList.toggle('active', Number(dot.getAttribute('data-gallery-dot')) === index);
      });
      preload(sources);
    }

    function updateLightboxArrows() {
      const total = lightboxGallery ? Number(lightboxGallery.getAttribute('data-gallery-count')) || 0 : 0;
      const index = lightboxGallery ? Number(lightboxGallery.getAttribute('data-gallery-index')) || 0 : 0;
      const many = total > 1;
      if (lightbox) lightbox.classList.toggle('has-gallery', many);
      lightboxButtons.forEach((btn) => {
        const dir = Number(btn.getAttribute('data-lightbox-dir')) || 0;
        btn.setAttribute('aria-label', dir < 0 ? label('featured.prev', 'Previous') : label('featured.next', 'Next'));
        btn.disabled = !many || (dir < 0 ? index === 0 : index === total - 1);
      });
    }

    function openLightbox(src, gallery) {
      if (!lightbox || !lightboxImg) return;
      lightboxGallery = gallery || null;
      lightboxImg.src = src;
      lightbox.style.display = 'flex';
      updateLightboxArrows();
    }

    function closeLightbox() {
      if (!lightbox) return;
      lightbox.style.display = 'none';
      if (lightboxImg) lightboxImg.src = '';
      lightboxGallery = null;
      updateLightboxArrows();
    }

    // Moves one screenshot forward or back: in the gallery, or in the lightbox
    // when it is open. Returns true when something actually moved.
    function step(offset) {
      const lightboxOpen = !!lightbox && lightbox.style.display === 'flex';
      if (lightboxOpen && !lightboxGallery) return false;
      const gallery = lightboxOpen ? lightboxGallery : (attachedContainer ? attachedContainer.querySelector('.gallery') : null);
      if (!gallery) return false;
      const total = Number(gallery.getAttribute('data-gallery-count')) || 0;
      const index = Number(gallery.getAttribute('data-gallery-index')) || 0;
      const next = index + offset;
      // No wrapping, same as the buttons which get disabled at both ends.
      if (next < 0 || next >= total) return false;
      applyIndex(gallery, next);
      if (lightboxOpen && lightboxImg) {
        const shown = gallery.querySelector('.gallery-img');
        if (shown) lightboxImg.src = shown.src;
        updateLightboxArrows();
      }
      return true;
    }

    // Re-applies the screenshot the reader was looking at. To call after the
    // container content has been replaced (language change, badge refresh).
    function refresh(container, appRef) {
      const gallery = container ? container.querySelector('.gallery') : null;
      if (!gallery) {
        currentApp = null;
        currentIndex = 0;
        return;
      }
      const total = Number(gallery.getAttribute('data-gallery-count')) || 0;
      currentIndex = (currentApp === appRef) ? Math.min(currentIndex, Math.max(0, total - 1)) : 0;
      currentApp = appRef || null;
      applyIndex(gallery, currentIndex);
    }

    // Wires everything. Clicks are delegated: the caller replaces the container
    // content on every render, so listeners bound per element would be lost.
    function attach(container) {
      if (!container) return;
      attachedContainer = container;

      container.addEventListener('click', (event) => {
        const target = event.target;
        if (!target) return;
        const button = target.closest ? target.closest('.gallery-btn') : null;
        if (button) {
          const gallery = galleryOf(button);
          if (gallery) {
            const index = Number(gallery.getAttribute('data-gallery-index')) || 0;
            applyIndex(gallery, index + (Number(button.getAttribute('data-gallery-dir')) || 0));
          }
          return;
        }
        const dot = target.closest ? target.closest('.gallery-dot') : null;
        if (dot) {
          const gallery = galleryOf(dot);
          if (gallery) applyIndex(gallery, Number(dot.getAttribute('data-gallery-dot')));
          return;
        }
        if (target.tagName === 'IMG') openLightbox(target.src, galleryOf(target));
      });

      if (!lightbox || !lightboxImg) return;

      lightbox.addEventListener('click', (event) => {
        const arrow = event.target && event.target.closest ? event.target.closest('.md-lightbox-btn') : null;
        if (arrow) {
          // Clicking an arrow must never be read as "close the lightbox".
          if (!arrow.disabled) step(Number(arrow.getAttribute('data-lightbox-dir')) || 0);
          return;
        }
        closeLightbox();
      });

      // Wheel browsing, lightbox only. Throttled because a wheel (or a
      // trackpad) emits a burst of events that would fly through the gallery.
      lightbox.addEventListener('wheel', (event) => {
        if (lightbox.style.display !== 'flex' || !lightboxGallery) return;
        event.preventDefault();
        const dir = event.deltaY > 0 ? 1 : (event.deltaY < 0 ? -1 : 0);
        if (!dir) return;
        const now = Date.now();
        if (now - wheelLockedAt < 300) return;
        if (step(dir)) wheelLockedAt = now;
      }, { passive: false });

      // Arrow keys browse the gallery, in the details view and inside the
      // lightbox, but never while the reader is typing.
      documentRef.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        if (!isActive()) return;
        const el = event.target;
        const tag = el && el.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el && el.isContentEditable)) return;
        if (step(event.key === 'ArrowRight' ? 1 : -1)) event.preventDefault();
      });
    }

    return Object.freeze({ html, refresh, attach });
  }

  ns.gallery = Object.freeze({ init });
})();
