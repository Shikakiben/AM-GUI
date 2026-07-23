// IPC surface verification: ensures every window.electronAPI.<method> called in
// renderer code is actually exposed by preload.js. Guarded optional calls
// (wrapped in `typeof window.electronAPI.x === 'function'`) are allowed to be
// absent. Catches typos and broken IPC bridges before runtime.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PRELOAD = path.join(ROOT, 'preload.js');
const RENDERER_DIR = path.join(ROOT, 'src', 'renderer');

function fail(msg) {
  console.error(`\u2717 ${msg}`);
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

// 1. Methods exposed by preload.js (keys in contextBridge.exposeInMainWorld object).
const preloadSrc = fs.readFileSync(PRELOAD, 'utf8');
const exposed = new Set();
// Match `name: (...` or `name: () =>` style entries.
const exposeRe = /(?:^|[\s{,])([a-zA-Z_$][\w$]*)\s*:\s*(?:\(|function|async)/g;
let m;
while ((m = exposeRe.exec(preloadSrc)) !== null) exposed.add(m[1]);

if (exposed.size === 0) fail('Could not parse any exposed methods from preload.js');

// 2. Every electronAPI.<method> used across renderer code.
const files = walk(RENDERER_DIR);
const used = new Map(); // method -> { file, guarded }
const useRe = /electronAPI[.?]*\.([a-zA-Z_$][\w$]*)/g;

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const guardedMethods = new Set();
  // Detect guarded usages: typeof window.electronAPI.x === 'function' / api.x
  const guardRe = /typeof\s+[\w.?]*electronAPI[.?]*\.([a-zA-Z_$][\w$]*)\s*===?\s*['"]function['"]/g;
  let g;
  while ((g = guardRe.exec(src)) !== null) guardedMethods.add(g[1]);

  let u;
  while ((u = useRe.exec(src)) !== null) {
    const method = u[1];
    if (!used.has(method)) {
      used.set(method, { file: path.relative(ROOT, file), guarded: guardedMethods.has(method) });
    } else if (guardedMethods.has(method)) {
      used.get(method).guarded = true;
    }
  }
}

// 3. Report unexposed, non-guarded usages as failures.
const problems = [];
for (const [method, info] of used) {
  if (!exposed.has(method) && !info.guarded) {
    problems.push(`  ${method}  (used in ${info.file}, not exposed by preload.js)`);
  }
}

if (problems.length) {
  fail(`electronAPI methods used but NOT exposed by preload.js:\n${problems.join('\n')}`);
}

console.log(`  OK: ${exposed.size} methods exposed by preload.js`);
console.log(`  OK: ${used.size} electronAPI usages all exposed or guarded`);
console.log('\n\u2714 IPC surface verified successfully.');
