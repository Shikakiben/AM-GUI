// Inline SVG icons, taken from Lucide (https://lucide.dev) - ISC licence.
//
// Inline rather than an icon font or a runtime library: several views rebuild
// their HTML on every render (details, virtual list, gallery), so a
// createIcons() pass would have to be re-run after each one.
//
// Regenerate with: fetch
//   https://cdn.jsdelivr.net/npm/lucide-static@0.473.0/icons/<name>.svg
// and paste the content of the <svg> element below.
(function registerIcons() {
  const ns = window.ui = window.ui || {};

  // The icon carries its own size, the way an emoji glyph does. Without these
  // attributes an <svg> falls back to filling its container, which is exactly
  // what happened before: the icons looked enormous wherever a CSS rule did not
  // reach them.
  //
  // 1.15em rather than 1em: an emoji glyph paints roughly 1.19em of ink at any
  // given font size (Noto Color Emoji is drawn slightly above the em), while a
  // Lucide icon fills nearly its whole box. Matching the ink exactly would make
  // the icons look bigger than the emojis they replace, so this sits in between.
  const ICON_SIZE = '1.15em';
  const ICON_ATTRS = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' + ICON_SIZE + '" height="' + ICON_SIZE + '" '
    + 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" '
    + 'stroke-linejoin="round" aria-hidden="true"';

  const PATHS = {
    'book-open': "<path d=\"M12 7v14\" /> <path d=\"M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z\" />",
    'bot': "<path d=\"M12 8V4H8\" /> <rect width=\"16\" height=\"12\" x=\"4\" y=\"8\" rx=\"2\" /> <path d=\"M2 14h2\" /> <path d=\"M20 14h2\" /> <path d=\"M15 13v2\" /> <path d=\"M9 13v2\" />",
    'briefcase': "<path d=\"M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16\" /> <rect width=\"20\" height=\"14\" x=\"2\" y=\"6\" rx=\"2\" />",
    'chart-no-axes-column': "<line x1=\"18\" x2=\"18\" y1=\"20\" y2=\"10\" /> <line x1=\"12\" x2=\"12\" y1=\"20\" y2=\"4\" /> <line x1=\"6\" x2=\"6\" y1=\"20\" y2=\"14\" />",
    'circle-help': "<circle cx=\"12\" cy=\"12\" r=\"10\" /> <path d=\"M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3\" /> <path d=\"M12 17h.01\" />",
    'compass': "<path d=\"m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z\" /> <circle cx=\"12\" cy=\"12\" r=\"10\" />",
    'cpu': "<rect width=\"16\" height=\"16\" x=\"4\" y=\"4\" rx=\"2\" /> <rect width=\"6\" height=\"6\" x=\"9\" y=\"9\" rx=\"1\" /> <path d=\"M15 2v2\" /> <path d=\"M15 20v2\" /> <path d=\"M2 15h2\" /> <path d=\"M2 9h2\" /> <path d=\"M20 15h2\" /> <path d=\"M20 9h2\" /> <path d=\"M9 2v2\" /> <path d=\"M9 20v2\" />",
    'credit-card': "<rect width=\"20\" height=\"14\" x=\"2\" y=\"5\" rx=\"2\" /> <line x1=\"2\" x2=\"22\" y1=\"10\" y2=\"10\" />",
    'disc': "<circle cx=\"12\" cy=\"12\" r=\"10\" /> <circle cx=\"12\" cy=\"12\" r=\"2\" />",
    'dollar-sign': "<line x1=\"12\" x2=\"12\" y1=\"2\" y2=\"22\" /> <path d=\"M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6\" />",
    'file-text': "<path d=\"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z\" /> <path d=\"M14 2v4a2 2 0 0 0 2 2h4\" /> <path d=\"M10 9H8\" /> <path d=\"M16 13H8\" /> <path d=\"M16 17H8\" />",
    'film': "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" /> <path d=\"M7 3v18\" /> <path d=\"M3 7.5h4\" /> <path d=\"M3 12h18\" /> <path d=\"M3 16.5h4\" /> <path d=\"M17 3v18\" /> <path d=\"M17 7.5h4\" /> <path d=\"M17 16.5h4\" />",
    'folder': "<path d=\"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z\" />",
    'footprints': "<path d=\"M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z\" /> <path d=\"M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z\" /> <path d=\"M16 17h4\" /> <path d=\"M4 13h4\" />",
    'gamepad-2': "<line x1=\"6\" x2=\"10\" y1=\"11\" y2=\"11\" /> <line x1=\"8\" x2=\"8\" y1=\"9\" y2=\"13\" /> <line x1=\"15\" x2=\"15.01\" y1=\"12\" y2=\"12\" /> <line x1=\"18\" x2=\"18.01\" y1=\"10\" y2=\"10\" /> <path d=\"M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z\" />",
    'globe': "<circle cx=\"12\" cy=\"12\" r=\"10\" /> <path d=\"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20\" /> <path d=\"M2 12h20\" />",
    'graduation-cap': "<path d=\"M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z\" /> <path d=\"M22 10v6\" /> <path d=\"M6 12.5V16a6 3 0 0 0 12 0v-3.5\" />",
    'hard-drive': "<line x1=\"22\" x2=\"2\" y1=\"12\" y2=\"12\" /> <path d=\"M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z\" /> <line x1=\"6\" x2=\"6.01\" y1=\"16\" y2=\"16\" /> <line x1=\"10\" x2=\"10.01\" y1=\"16\" y2=\"16\" />",
    'joystick': "<path d=\"M21 17a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2Z\" /> <path d=\"M6 15v-2\" /> <path d=\"M12 15V9\" /> <circle cx=\"12\" cy=\"6\" r=\"3\" />",
    'key': "<path d=\"m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4\" /> <path d=\"m21 2-9.6 9.6\" /> <circle cx=\"7.5\" cy=\"15.5\" r=\"5.5\" />",
    'keyboard': "<path d=\"M10 8h.01\" /> <path d=\"M12 12h.01\" /> <path d=\"M14 8h.01\" /> <path d=\"M16 12h.01\" /> <path d=\"M18 8h.01\" /> <path d=\"M6 8h.01\" /> <path d=\"M7 16h10\" /> <path d=\"M8 12h.01\" /> <rect width=\"20\" height=\"16\" x=\"2\" y=\"4\" rx=\"2\" />",
    'layers': "<path d=\"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z\" /> <path d=\"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12\" /> <path d=\"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17\" />",
    'layout-grid': "<rect width=\"7\" height=\"7\" x=\"3\" y=\"3\" rx=\"1\" /> <rect width=\"7\" height=\"7\" x=\"14\" y=\"3\" rx=\"1\" /> <rect width=\"7\" height=\"7\" x=\"14\" y=\"14\" rx=\"1\" /> <rect width=\"7\" height=\"7\" x=\"3\" y=\"14\" rx=\"1\" />",
    'loader': "<path d=\"M12 2v4\" /> <path d=\"m16.2 7.8 2.9-2.9\" /> <path d=\"M18 12h4\" /> <path d=\"m16.2 16.2 2.9 2.9\" /> <path d=\"M12 18v4\" /> <path d=\"m4.9 19.1 2.9-2.9\" /> <path d=\"M2 12h4\" /> <path d=\"m4.9 4.9 2.9 2.9\" />",
    'lock': "<rect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\" ry=\"2\" /> <path d=\"M7 11V7a5 5 0 0 1 10 0v4\" />",
    'message-circle': "<path d=\"M7.9 20A9 9 0 1 0 4 16.1L2 22Z\" />",
    'monitor': "<rect width=\"20\" height=\"14\" x=\"2\" y=\"3\" rx=\"2\" /> <line x1=\"8\" x2=\"16\" y1=\"21\" y2=\"21\" /> <line x1=\"12\" x2=\"12\" y1=\"17\" y2=\"21\" />",
    'music': "<path d=\"M9 18V5l12-2v13\" /> <circle cx=\"6\" cy=\"18\" r=\"3\" /> <circle cx=\"18\" cy=\"16\" r=\"3\" />",
    'package': "<path d=\"M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z\" /> <path d=\"M12 22V12\" /> <polyline points=\"3.29 7 12 12 20.71 7\"/> <path d=\"m7.5 4.27 9 5.15\" />",
    'palette': "<circle cx=\"13.5\" cy=\"6.5\" r=\".5\" fill=\"currentColor\" /> <circle cx=\"17.5\" cy=\"10.5\" r=\".5\" fill=\"currentColor\" /> <circle cx=\"8.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\" /> <circle cx=\"6.5\" cy=\"12.5\" r=\".5\" fill=\"currentColor\" /> <path d=\"M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z\" />",
    'play': "<polygon points=\"6 3 20 12 6 21 6 3\" />",
    'search': "<circle cx=\"11\" cy=\"11\" r=\"8\" /> <path d=\"m21 21-4.3-4.3\" />",
    'settings': "<path d=\"M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z\" /> <circle cx=\"12\" cy=\"12\" r=\"3\" />",
    'smartphone': "<rect width=\"14\" height=\"20\" x=\"5\" y=\"2\" rx=\"2\" ry=\"2\" /> <path d=\"M12 18h.01\" />",
    'terminal': "<polyline points=\"4 17 10 11 4 5\" /> <line x1=\"12\" x2=\"20\" y1=\"19\" y2=\"19\" />",
    'user': "<path d=\"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2\" /> <circle cx=\"12\" cy=\"7\" r=\"4\" />",
    'wallet': "<path d=\"M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1\" /> <path d=\"M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4\" />",
    'wine': "<path d=\"M8 22h8\" /> <path d=\"M7 10h10\" /> <path d=\"M12 15v7\" /> <path d=\"M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z\" />",
    'wrench': "<path d=\"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z\" />",
    'zap': "<path d=\"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z\" />",
  };

  // Category key -> Lucide icon name (see CATEGORY_ICON_MAP for the emoji).
  const CATEGORY_ICONS = Object.freeze({
    'ai': 'bot',
    'am-utils': 'wrench',
    'android': 'smartphone',
    'appimage-on-the-fly': 'zap',
    'appimages': 'package',
    'audio': 'music',
    'autre': 'circle-help',
    'comic': 'book-open',
    'command-line': 'terminal',
    'communication': 'message-circle',
    'disk': 'hard-drive',
    'education': 'graduation-cap',
    'emulator': 'cpu',
    'file-manager': 'folder',
    'finance': 'dollar-sign',
    'game': 'gamepad-2',
    'gnome': 'footprints',
    'graphic': 'palette',
    'internet': 'globe',
    'kde': 'monitor',
    'metapackages': 'layers',
    'office': 'file-text',
    'password': 'key',
    'portable': 'briefcase',
    'portable-cli': 'keyboard',
    'portable-desktop': 'monitor',
    'steam': 'joystick',
    'system-monitor': 'chart-no-axes-column',
    'video': 'film',
    'virtual-machine': 'disc',
    'wallet': 'wallet',
    'web-app': 'layout-grid',
    'web-browser': 'compass',
    'wine': 'wine',
    'youtube': 'play'
  });

  function has(name) {
    return Object.prototype.hasOwnProperty.call(PATHS, name);
  }

  // Returns the SVG markup for an icon, or '' when the name is unknown.
  function icon(name, className) {
    if (!has(name)) return '';
    const cls = 'ui-icon' + (className ? ' ' + className : '');
    return '<svg class="' + cls + '" ' + ICON_ATTRS + '>' + PATHS[name] + '</svg>';
  }

  // True when the user picked the monochrome style in the settings.
  function preferred() {
    try {
      const prefs = window.services && window.services.preferences;
      return !!prefs && typeof prefs.getIconStyle === 'function' && prefs.getIconStyle() === 'mono';
    } catch (_) {
      return false;
    }
  }

  // The SVG when the monochrome style is active and the icon exists, the emoji
  // it replaces otherwise. This is what the views that build markup in JS call.
  function choose(name, emoji, className) {
    if (preferred()) {
      const svg = icon(name, className);
      if (svg) return svg;
    }
    return emoji;
  }

  function lucideNameForCategory(key) {
    return CATEGORY_ICONS[String(key || '').trim().toLowerCase()] || null;
  }

  // Fills every [data-icon] placeholder below root with its SVG, or puts the
  // emoji back when the emoji style is active. The emoji itself stays in
  // index.html, so it is the single source of truth and nothing is lost.
  function applyAll(root, style) {
    const scope = root || document;
    if (!scope.querySelectorAll) return;
    scope.querySelectorAll('[data-icon]').forEach((el) => {
      if (style === 'mono') {
        if (el.querySelector('svg')) return;
        const svg = icon(el.getAttribute('data-icon'));
        if (!svg) return; // unknown name: keep the emoji rather than blank it
        if (el.dataset.emoji === undefined) el.dataset.emoji = el.textContent.trim();
        el.innerHTML = svg;
      } else if (el.querySelector('svg')) {
        el.textContent = el.dataset.emoji || '';
      }
    });
  }

  ns.icons = Object.freeze({ has, icon, choose, preferred, lucideNameForCategory, applyAll });
})();
