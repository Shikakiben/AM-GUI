(function registerConstants(){
  const CATEGORY_ICON_MAP = Object.freeze({
    "ai": "🧠",
    "am-utils": "🧰",
    "android": "🤖",
    "appimage-on-the-fly": "⚡",
    "appimages": "🧩",
    "audio": "🎵",
    "comic": "📚",
    "command-line": "💻",
    "communication": "💬",
    "disk": "💾",
    "education": "🎓",
    "emulator": "🎛️",
    "file-manager": "🗂️",
    "finance": "💰",
    "game": "🎮",
    "gnome": "👣",
    "graphic": "🎨",
    "internet": "🌐",
    "kde": "🖥️",
    "metapackages": "🧱",
    "office": "📄",
    "password": "🔑",
    "portable": "🧳",
    "portable-cli": "⌨️",
    "portable-desktop": "🖥️",
    "steam": "🕹️",
    "system-monitor": "📊",
    "video": "🎬",
    "virtual-machine": "💿",
    "wallet": "👛",
    "web-app": "🕸️",
    "web-browser": "🌍",
    "wine": "🍷",
    "youtube": "▶️",
    "autre": "❓"
  });

  const constants = Object.freeze({
    VISIBLE_COUNT: 50,
    CATEGORY_ICON_MAP
  });

  window.appConfig = window.appConfig || {};
  window.appConfig.constants = constants;
  window.constants = constants;
})();
