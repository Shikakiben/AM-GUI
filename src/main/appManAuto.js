const fs = require('fs');
const os = require('os');
const path = require('path');
const { fetch } = require('undici');

const APPMAN_URL = 'https://raw.githubusercontent.com/ivan-hc/AM/main/APP-MANAGER';
const USER_AGENT = 'AM-GUI';

async function installAppManAuto() {
  const home = os.homedir();
  const bindir = process.env.XDG_BIN_HOME || path.join(home, '.local', 'bin');
  fs.mkdirSync(bindir, { recursive: true });
  const res = await fetch(APPMAN_URL, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Téléchargement échoué (HTTP ${res.status})`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const target = path.join(bindir, 'appman');
  fs.writeFileSync(target, buffer, { mode: 0o755 });
  const configDir = path.join(home, '.config', 'appman');
  fs.mkdirSync(configDir, { recursive: true });
  const configPath = path.join(configDir, 'appman-config');
  if (!fs.existsSync(configPath)) {
    const defaultDir = path.join(home, 'Applications');
    fs.mkdirSync(defaultDir, { recursive: true });
    fs.writeFileSync(configPath, defaultDir);
  }
  return { target, bindir };
}

module.exports = { installAppManAuto };
