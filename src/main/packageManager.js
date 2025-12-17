const { exec } = require('child_process');

const PM_CACHE_TTL_MS = 60 * 1000;
let cachedPackageManager = null;
let cachedPmTimestamp = 0;

async function detectPackageManager(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedPmTimestamp && now - cachedPmTimestamp < PM_CACHE_TTL_MS) {
    return cachedPackageManager;
  }

  const pm = await new Promise((resolve) => {
    exec('command -v am', (err) => {
      if (!err) return resolve('am');
      exec('command -v appman', (err2) => {
        if (!err2) return resolve('appman');
        resolve(null);
      });
    });
  });

  cachedPackageManager = pm;
  cachedPmTimestamp = Date.now();
  return pm;
}

function invalidatePackageManagerCache() {
  cachedPackageManager = null;
  cachedPmTimestamp = 0;
}

module.exports = {
  detectPackageManager,
  invalidatePackageManagerCache
};
