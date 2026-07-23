// IPC surface integration test: ensures every window.electronAPI.<method> called
// in renderer code is actually exposed by preload.js. Guarded optional calls
// (wrapped in `typeof window.electronAPI.x === 'function'`) are allowed to be
// absent. Catches typos and broken IPC bridges before runtime.

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PRELOAD = path.join(ROOT, 'preload.js');
const RENDERER_DIR = path.join(ROOT, 'src', 'renderer');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

describe('IPC surface (preload vs renderer usage)', () => {
  let exposed;
  let used;

  before(() => {
    // Methods exposed by preload.js.
    const preloadSrc = fs.readFileSync(PRELOAD, 'utf8');
    exposed = new Set();
    const exposeRe = /(?:^|[\s{,])([a-zA-Z_$][\w$]*)\s*:\s*(?:\(|function|async)/g;
    let m;
    while ((m = exposeRe.exec(preloadSrc)) !== null) exposed.add(m[1]);

    // Every electronAPI.<method> used across renderer code, with guard detection.
    used = new Map();
    const useRe = /electronAPI[.?]*\.([a-zA-Z_$][\w$]*)/g;
    for (const file of walk(RENDERER_DIR)) {
      const src = fs.readFileSync(file, 'utf8');
      const guarded = new Set();
      const guardRe = /typeof\s+[\w.?]*electronAPI[.?]*\.([a-zA-Z_$][\w$]*)\s*===?\s*['"]function['"]/g;
      let g;
      while ((g = guardRe.exec(src)) !== null) guarded.add(g[1]);
      let u;
      while ((u = useRe.exec(src)) !== null) {
        const method = u[1];
        if (!used.has(method)) used.set(method, { file: path.relative(ROOT, file), guarded: guarded.has(method) });
        else if (guarded.has(method)) used.get(method).guarded = true;
      }
    }
  });

  it('parses exposed methods from preload.js', () => {
    assert.ok(exposed.size > 0, 'Could not parse any exposed methods from preload.js');
  });

  it('exposes every non-guarded electronAPI method used in the renderer', () => {
    const problems = [];
    for (const [method, info] of used) {
      if (!exposed.has(method) && !info.guarded) {
        problems.push(`${method} (used in ${info.file})`);
      }
    }
    assert.deepStrictEqual(problems, [], `electronAPI methods used but NOT exposed by preload.js:\n${problems.join('\n')}`);
  });
});
