// js/ui/syncButton.js
// Module for the sync button (refresh)
// Handles app and category refresh, i18n, and button state


// Access global i18n (window.translations)
var t = window.t;
if (!t) {
    t = function(key) {
        const lang = (window.getLangPref && window.getLangPref()) || 'fr';
        const translations = window.translations || {};
        return (translations[lang] && translations[lang][key]) || key;
    };
}
var onLanguageChange = window.onLanguageChange || (()=>{});


function createSyncButton({ onSync }) {
    const btn = document.createElement('button');
    btn.id = 'syncBtn';
    btn.className = 'btn btn-outline btn-refresh sync-btn';
    btn.type = 'button';
    // Add an icon like in index.html
    btn.innerHTML = '<span class="icon" aria-hidden="true">↻</span>';
    btn.title = t('refresh.title') || 'Refresh list';
    btn.setAttribute('aria-label', t('refresh.aria') || 'Refresh');

    // i18n dynamique
    onLanguageChange(() => {
        btn.innerHTML = '<span class="icon" aria-hidden="true">↻</span>';
        btn.title = t('refresh.title') || 'Refresh list';
        btn.setAttribute('aria-label', t('refresh.aria') || 'Refresh');
    });

    btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.classList.add('loading');
        try {
            // Delete local category cache to force reload from AM
            if (window.electronAPI && typeof window.electronAPI.deleteCategoriesCache === 'function') {
                await window.electronAPI.deleteCategoriesCache();
            }
            await onSync();
        } finally {
            btn.disabled = false;
            btn.classList.remove('loading');
        }
    });
    return btn;
}

function replaceSyncButton(newBtn) {
    const oldBtn = document.getElementById('refreshBtn') || document.getElementById('syncBtn');
    if (oldBtn && oldBtn.parentNode) {
        oldBtn.parentNode.replaceChild(newBtn, oldBtn);
    }
}

// Export global pour usage via <script>
window.syncButton = {
  createSyncButton,
  replaceSyncButton
};

