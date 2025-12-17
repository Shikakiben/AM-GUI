(function initVirtualListModule(globalScope) {
  const scope = globalScope || (window.ui = window.ui || {});

  function initVirtualList(options = {}) {
    const state = options.state || {};
    const appsDiv = options.appsDiv || document.getElementById('apps');
    const scrollShell = options.scrollShell || document.querySelector('.scroll-shell');
    const visibleCount = typeof options.visibleCount === 'number' ? options.visibleCount : 50;
    const getIconUrl = options.getIconUrl || ((name) => `appicon://${name}.png`);
    const t = options.t || ((key) => key);
    const getQueuePosition = options.getQueuePosition || (() => -1);
    const getActiveInstallSession = options.getActiveInstallSession || (() => ({ id: null }));
    const showDetails = options.showDetails || (() => {});
    const documentRef = options.document || document;
    const windowRef = options.window || window;

    const loadedIcons = new Set();
    let appListVirtual = [];
    let currentEndVirtual = visibleCount;
    let lastTileObserver = null;
    let iconObserver = null;
    let skeletonObserver = null;

    function setAppList(list) {
      appListVirtual = Array.isArray(list) ? list : [];
      currentEndVirtual = visibleCount;
      if (scrollShell) scrollShell.scrollTop = 0;
      renderVirtualList();
    }

    function renderVirtualList() {
      if (!appsDiv) return;
      appsDiv.innerHTML = '';
      const useSkeleton = appListVirtual.length > 50;
      if (useSkeleton) {
        const viewClass = 'view-' + (state.viewMode || 'grid');
        const fragment = documentRef.createDocumentFragment();
        for (let i = 0; i < appListVirtual.length; i++) {
          const skel = documentRef.createElement('div');
          skel.className = 'app-tile-skeleton ' + viewClass;
          skel.dataset.index = i;
          fragment.appendChild(skel);
        }
        appsDiv.appendChild(fragment);
        if (skeletonObserver) skeletonObserver.disconnect();
        skeletonObserver = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting && !entry.target.classList.contains('hydrated')) {
              const idx = parseInt(entry.target.dataset.index, 10);
              const realTile = buildTile(appListVirtual[idx]);
              realTile.classList.add('hydrated');
              entry.target.replaceWith(realTile);
              if (skeletonObserver) skeletonObserver.observe(realTile);
            }
          });
        }, { root: scrollShell, threshold: 0.1 });
        const tiles = appsDiv.querySelectorAll('.app-tile-skeleton');
        tiles.forEach(tile => skeletonObserver && skeletonObserver.observe(tile));
        return;
      }

      const end = Math.min(currentEndVirtual, appListVirtual.length);
      const fragment = documentRef.createDocumentFragment();
      for (let i = 0; i < end; i++) {
        fragment.appendChild(buildTile(appListVirtual[i]));
      }
      appsDiv.appendChild(fragment);
      if (lastTileObserver) lastTileObserver.disconnect();
      if (end < appListVirtual.length) {
        const tiles = appsDiv.querySelectorAll('.app-tile');
        const toObserve = Array.from(tiles).slice(-3);
        if (toObserve.length) {
          try {
            lastTileObserver = new IntersectionObserver((entries) => {
              if (entries.some(e => e.isIntersecting)) {
                lastTileObserver.disconnect();
                currentEndVirtual = Math.min(currentEndVirtual + visibleCount, appListVirtual.length);
                renderVirtualList();
              }
            }, { root: scrollShell, threshold: 0.1 });
            toObserve.forEach(tile => lastTileObserver.observe(tile));
          } catch (_) {}
        }
      }
      let spacer = appsDiv.querySelector('.app-list-spacer');
      if (!spacer) {
        spacer = documentRef.createElement('div');
        spacer.className = 'app-list-spacer';
        spacer.style.width = '100%';
        spacer.style.pointerEvents = 'none';
        appsDiv.appendChild(spacer);
      }
      let tileHeight = 120;
      const firstTile = appsDiv.querySelector('.app-tile');
      if (firstTile) {
        tileHeight = firstTile.offsetHeight || tileHeight;
      }
      const missing = appListVirtual.length - end;
      spacer.style.height = (missing > 0 ? (missing * tileHeight) : 0) + 'px';
    }

    function buildTile(item) {
      const { name, installed, desc } = typeof item === 'string' ? { name: item, installed: false, desc: null } : item;
      const label = name.charAt(0).toUpperCase() + name.slice(1);
      const version = item?.version ? String(item.version) : null;
      const session = getActiveInstallSession() || {};
      let shortDesc = desc || (installed ? 'Déjà présente localement.' : 'Disponible pour installation.');
      if (shortDesc.length > 110) shortDesc = shortDesc.slice(0,107).trim() + '…';
      let actionsHTML = '';
      if (state.viewMode === 'list') {
        if (!installed) {
          let btnLabel = 'Installer';
          let actionAttr = 'install';
          let disabledAttr = '';
          if (session.id && !session.done && session.name === name) {
            btnLabel = 'Installation… ✕';
            actionAttr = 'cancel-install';
          } else {
            const pos = getQueuePosition(name);
            if (pos !== -1) { btnLabel = 'En file (#'+pos+') ✕'; actionAttr='remove-queue'; }
          }
          actionsHTML = `<div class="actions"><button class="inline-action install" data-action="${actionAttr}" data-app="${name}"${disabledAttr}>${btnLabel}</button></div>`;
        } else {
          actionsHTML = `<div class="actions"><button class="inline-action uninstall" data-action="uninstall" data-app="${name}">${t('details.uninstall')}</button></div>`;
        }
      }

      let stateBadge = '';
      if (state.viewMode !== 'list' && !installed) {
        if (session.id && !session.done && session.name === name) {
          stateBadge = ' <span class="install-state-badge installing" data-state="installing">Installation…<button class="queue-remove-badge inline-action" data-action="cancel-install" data-app="'+name+'" title="Annuler" aria-label="Annuler">✕</button></span>';
        } else {
          const pos = getQueuePosition(name);
          if (pos !== -1) stateBadge = ' <span class="install-state-badge queued" data-state="queued">En file (#'+pos+')<button class="queue-remove-badge inline-action" data-action="remove-queue" data-app="'+name+'" title="Retirer de la file" aria-label="Retirer">✕</button></span>';
        }
      }
      const tile = documentRef.createElement('div');
      tile.className = 'app-tile';
      tile.setAttribute('data-app', name);
      const badgeHTML = installed ? '<span class="installed-badge" aria-label="Installée" title="Installée" style="position:absolute;top:2px;right:2px;">✓</span>' : '';
      tile.innerHTML = `
        <div class="tile-icon" style="position:relative;display:inline-block;">
          <img data-src="${getIconUrl(name)}" alt="${label}" loading="lazy" decoding="async"${state.viewMode==='icons' ? ' class="icon-mode"' : ''}>
          ${badgeHTML}
        </div>
        <div class="tile-text">
          <div class="tile-name">${label}${version? ` <span class="tile-version">${version}</span>`: ''}${stateBadge}</div>
          <div class="tile-short">${shortDesc}</div>
        </div>
        ${actionsHTML ? actionsHTML : ''}`;

      const img = tile.querySelector('img');
      if (img) {
        const iconUrl = img.getAttribute('data-src');
        if (iconUrl && loadedIcons.has(iconUrl)) {
          img.src = iconUrl;
          img.removeAttribute('data-src');
        } else if (iconUrl) {
          img.classList.add('img-loading');
          img.addEventListener('load', () => {
            img.classList.remove('img-loading');
            loadedIcons.add(iconUrl);
          }, { once:true });
          img.addEventListener('error', () => { img.classList.remove('img-loading'); }, { once:true });
          observeIcon(img, iconUrl);
          if (buildTile._count === undefined) buildTile._count = 0;
          if (buildTile._count < 48) {
            try { img.setAttribute('fetchpriority','high'); } catch(_){ }
          }
          buildTile._count++;
        }
      }
      tile.tabIndex = 0;
      tile.addEventListener('click', (ev) => {
        if (ev.target.closest('.inline-action')) return;
        showDetails(name);
      });
      tile.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          if (ev.target.closest('.inline-action')) return;
          ev.preventDefault();
          showDetails(name);
        }
      });
      return tile;
    }

    function observeIcon(img, iconUrl) {
      if (!img) return;
      if (iconObserver) {
        iconObserver.observe(img);
      } else {
        img.src = iconUrl || img.getAttribute('data-src');
        img.removeAttribute('data-src');
      }
    }

    function initIconObserver() {
      if ('IntersectionObserver' in windowRef && !iconObserver) {
        iconObserver = new IntersectionObserver(entries => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const img = entry.target;
              const data = img.getAttribute('data-src');
              if (data) {
                img.src = data;
                img.removeAttribute('data-src');
              }
              iconObserver.unobserve(img);
            }
          });
        }, { rootMargin: '1600px' });
      }
      return iconObserver;
    }

    function prefetchPreloadImages(limit = 200, concurrency = 6) {
      if (iconObserver) return;
      const imgs = Array.from(documentRef.querySelectorAll('img[data-src]'));
      if (!imgs.length) return;
      const toLoad = imgs.slice(0, Math.min(limit, imgs.length));
      let idx = 0;
      let active = 0;
      let scheduled = false;

      const scheduleNext = () => {
        if (typeof windowRef.requestIdleCallback === 'function') {
          windowRef.requestIdleCallback(pump);
        } else {
          setTimeout(pump, 0);
        }
      };

      const pump = () => {
        while (active < concurrency && idx < toLoad.length) {
          const img = toLoad[idx++];
          active++;
          queueMicrotask(() => {
            try {
              const dataSrc = img.getAttribute('data-src');
              if (dataSrc) {
                img.src = dataSrc;
                img.removeAttribute('data-src');
              }
            } catch (_) {}
            active--;
            if (idx < toLoad.length) scheduleNext();
          });
        }
        if (!scheduled && idx < toLoad.length) {
          scheduled = true;
          scheduleNext();
        }
      };

      setTimeout(() => pump(), 180);
    }

    return {
      setAppList,
      renderVirtualList,
      initIconObserver,
      observeIcon,
      prefetchPreloadImages,
      resetLoadedIcons: () => loadedIcons.clear(),
      getLoadedIcons: () => loadedIcons,
      getList: () => appListVirtual.slice()
    };
  }

  scope.virtualList = { init: initVirtualList };
})(window.ui = window.ui || {});
