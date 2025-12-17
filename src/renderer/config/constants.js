(function registerConstants(){
  const CATEGORY_ICON_MAP = Object.freeze({
    "android": "🤖",
    "appimages": "📦",
    "audio": "🎵",
    "comic": "📚",
    "command-line": "💻",
    "communication": "💬",
    "disk": "🖴",
    "education": "🎓",
    "file-manager": "🗂️",
    "finance": "💰",
    "game": "🎮",
    "gnome": "👣",
    "graphic": "🎨",
    "internet": "🌐",
    "kde": "🖥️",
    "office": "🗎",
    "password": "🔑",
    "steam": "🕹️",
    "system-monitor": "📊",
    "video": "🎬",
    "web-app": "🕸️",
    "web-browser": "🌍",
    "wine": "🍷",
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
