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

// Runs "<pm> translate <lang>" so AM/AppMan CLI output follows AM-GUI's
// language. Non-interactive (code passed as argument) and best-effort.
async function translatePackageManagerLocale(lang) {
  const code = String(lang || '').slice(0, 2).toLowerCase();
  if (!/^[a-z]{2}$/.test(code)) return { ok: false, error: 'Invalid locale code' };
  const { pm } = await detectPackageManager();
  if (!pm) return { ok: false, error: 'No package manager found' };
  const e = require('child_process').exec;
  return new Promise((resolve) => {
    e(`${pm} translate ${code}`, { timeout: 60000 }, (err, stdout, stderr) => {
      const output = `${stdout || ''}${stderr || ''}`.trim();
      if (err) return resolve({ ok: false, error: output || err.message });
      resolve({ ok: true, pm, lang: code, output });
    });
  });
}

module.exports = {
  detectPackageManager,
  invalidatePackageManagerCache,
  translatePackageManagerLocale
};
