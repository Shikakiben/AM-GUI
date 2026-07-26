const PM_CACHE_TTL_MS = 60 * 1000;
let cachedResult = null;
let cachedPmTimestamp = 0;

async function detectPackageManager(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedPmTimestamp && now - cachedPmTimestamp < PM_CACHE_TTL_MS) {
    return cachedResult;
  }

  const e = require('child_process').exec;
  const [hasAm, hasAppman] = await Promise.all([
    new Promise((resolve) => {
      e('command -v am', (err) => resolve(!err));
    }),
    new Promise((resolve) => {
      e('command -v appman', (err) => resolve(!err));
    })
  ]);

  let pm = null;
  if (hasAm) pm = 'am';
  else if (hasAppman) pm = 'appman';

  cachedResult = { pm, bothFound: hasAm && hasAppman };
  cachedPmTimestamp = Date.now();
  return cachedResult;
}

function invalidatePackageManagerCache() {
  cachedResult = null;
  cachedPmTimestamp = 0;
}

module.exports = {
  detectPackageManager,
  invalidatePackageManagerCache
};
