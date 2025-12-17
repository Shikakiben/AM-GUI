// js/ui/syncButton.js
// Module pour le bouton de synchronisation (refresh)
// Gère le rafraîchissement des apps et des catégories, l'i18n, et l'état du bouton


// Accès i18n global (window.translations)
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
    // Ajout d'une icône comme dans index.html
    btn.innerHTML = '<span class="icon" aria-hidden="true">↻</span>';
    btn.title = t('refresh.title') || 'Rafraîchir';
    btn.setAttribute('aria-label', t('refresh.aria') || 'Rafraîchir');

    // i18n dynamique
    onLanguageChange(() => {
        btn.innerHTML = '<span class="icon" aria-hidden="true">↻</span>';
        btn.title = t('refresh.title') || 'Rafraîchir';
        btn.setAttribute('aria-label', t('refresh.aria') || 'Rafraîchir');
    });

    btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.classList.add('loading');
        try {
            // Reset cache apps local avant reload
            if (window.electronAPI && typeof window.electronAPI.resetAppsCache === 'function') {
                await window.electronAPI.resetAppsCache();
            }
            // Supprimer le cache local des catégories pour forcer le reload depuis AM
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

