(function registerLightbox() {
  const ns = window.ui = window.ui || {};

  var lightbox, lightboxImage, lightboxCaption, lightboxPrev, lightboxNext, lightboxClose;
  var state = { images: [], index: 0, originApp: null };

  function applyLightboxImage() {
    if (!lightboxImage) return;
    var src = state.images[state.index];
    lightboxImage.src = src;
    if (lightboxCaption) {
      lightboxCaption.textContent = state.originApp + ' \u2013 ' + (state.index + 1) + '/' + state.images.length;
    }
    updateLightboxNav();
  }

  function updateLightboxNav() {
    if (lightboxPrev) lightboxPrev.disabled = state.index <= 0;
    if (lightboxNext) lightboxNext.disabled = state.index >= state.images.length - 1;
    if (lightboxPrev) lightboxPrev.style.visibility = state.images.length > 1 ? 'visible' : 'hidden';
    if (lightboxNext) lightboxNext.style.visibility = state.images.length > 1 ? 'visible' : 'hidden';
  }

  function closeLightbox() {
    if (lightbox) lightbox.hidden = true;
  }

  function openLightbox(images, index, captionBase) {
    if (!lightbox || !lightboxImage) return;
    state.images = images || [];
    state.index = index || 0;
    state.originApp = captionBase;
    applyLightboxImage();
    lightbox.hidden = false;
    if (lightboxClose) setTimeout(function () { lightboxClose.focus(); }, 30);
  }

  function isOpen() {
    return lightbox && !lightbox.hidden;
  }

  function handleKeyboard(e) {
    if (!lightbox || lightbox.hidden) return;
    if (e.key === 'Escape') {
      closeLightbox();
      e.stopImmediatePropagation();
      return;
    }
    if (e.key === 'ArrowLeft') {
      if (state.index > 0) { state.index--; applyLightboxImage(); }
      return;
    }
    if (e.key === 'ArrowRight') {
      if (state.index < state.images.length - 1) { state.index++; applyLightboxImage(); }
    }
  }

  function init(opts) {
    opts = opts || {};
    lightbox = document.getElementById(opts.lightboxId || 'lightbox');
    lightboxImage = document.getElementById(opts.lightboxImageId || 'lightboxImage');
    lightboxCaption = document.getElementById(opts.lightboxCaptionId || 'lightboxCaption');
    lightboxPrev = document.getElementById(opts.lightboxPrevId || 'lightboxPrev');
    lightboxNext = document.getElementById(opts.lightboxNextId || 'lightboxNext');
    lightboxClose = document.getElementById(opts.lightboxCloseId || 'lightboxClose');

    lightboxPrev && lightboxPrev.addEventListener('click', function () {
      if (state.index > 0) { state.index--; applyLightboxImage(); }
    });
    lightboxNext && lightboxNext.addEventListener('click', function () {
      if (state.index < state.images.length - 1) { state.index++; applyLightboxImage(); }
    });
    lightboxClose && lightboxClose.addEventListener('click', function () { closeLightbox(); });
    lightbox && lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox) closeLightbox();
    });

    window.addEventListener('keydown', handleKeyboard, { capture: true });
  }

  ns.lightbox = { init: init, openLightbox: openLightbox, isOpen: isOpen, closeLightbox: closeLightbox };
})();
