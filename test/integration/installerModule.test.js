// Installer module structure test: verifies the install-queue logic lives in the
// installer feature module and exposes the expected surface. The behavioural
// queue tests live in test/renderer/queue.test.js (jsdom).

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const INSTALLER = path.join(__dirname, '..', '..', 'src', 'renderer', 'features', 'installer', 'index.js');

describe('installer module structure', () => {
  let src;
  before(() => { src = fs.readFileSync(INSTALLER, 'utf8'); });

  const markers = [
    ['init function', /function\s+init\s*\(/],
    ['enqueueInstall', /enqueueInstall/],
    ['removeFromQueue', /removeFromQueue/],
    ['processNextInstall', /processNextInstall/],
    ['activeInstallSession', /activeInstallSession/],
    ['installQueue', /installQueue/],
    ['registers on window.features.installer', /namespace\.installer/],
  ];

  for (const [name, re] of markers) {
    it(`contains ${name}`, () => {
      assert.ok(re.test(src), `installer module missing: ${name}`);
    });
  }
});
