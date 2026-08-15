(function registerConstants(){
  const CATEGORY_ICON_MAP = Object.freeze({
    "ai": "bot",
    "am-utils": "wrench",
    "android": "smartphone",
    "appimage-on-the-fly": "zap",
    "appimages": "package",
    "audio": "music",
    "comic": "book-open",
    "command-line": "terminal",
    "communication": "message-circle",
    "disk": "hard-drive",
    "education": "graduation-cap",
    "emulator": "cpu",
    "file-manager": "folder",
    "finance": "dollar-sign",
    "game": "gamepad-2",
    "gnome": "footprints",
    "graphic": "palette",
    "internet": "globe",
    "kde": "monitor",
    "metapackages": "layers",
    "office": "file-text",
    "password": "key",
    "portable": "briefcase",
    "portable-cli": "keyboard",
    "portable-desktop": "monitor",
    "steam": "joystick",
    "system-monitor": "bar-chart-2",
    "video": "film",
    "virtual-machine": "disc",
    "wallet": "wallet",
    "web-app": "layout-grid",
    "web-browser": "compass",
    "wine": "wine",
    "youtube": "play",
    "autre": "help-circle"
  });

  const constants = Object.freeze({
    VISIBLE_COUNT: 50,
    CATEGORY_ICON_MAP
  });

  window.appConfig = window.appConfig || {};
  window.appConfig.constants = constants;
  window.constants = constants;
})();
