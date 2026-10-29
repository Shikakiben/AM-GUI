// The password modal is a single element in the DOM, so two prompts cannot share
// it. Measured before the fix: a proxy challenge arriving while a sudo prompt was
// waiting replaced the first dialog, and the sudo promise never settled — the
// install then hung until its ten-minute kill timer.
'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SOURCE = fs.readFileSync(path.join(__dirname, '../../src/renderer/ui/passwordPrompt.js'), 'utf8');

let dom = null;
function setup() {
  dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost', runScripts: 'dangerously' });
  dom.window.eval(SOURCE);
  return dom.window;
}
afterEach(() => {
  try { dom?.window?.close?.(); } catch (_) {}
  dom = null;
});

const modalOpen = (w) => {
  const m = w.document.getElementById('passwordPromptModal');
  return !!m && m.style.display !== 'none';
};

describe('two prompts at once', () => {
  it('shows the second prompt only after the first is answered', async () => {
    const window = setup();
    const settled = { sudo: 'pending', proxy: 'pending' };

    window.ui.passwordPrompt.promptPassword().then((v) => { settled.sudo = v; });
    await new Promise((r) => setImmediate(r));
    window.ui.passwordPrompt.promptPassword({ kind: 'proxy', withUsername: true })
      .then((v) => { settled.proxy = v; });
    await new Promise((r) => setImmediate(r));

    // The sudo prompt must be the one on screen: no username field.
    assert.strictEqual(window.document.getElementById('passwordPromptUser'), null, 'the sudo prompt is shown first');

    window.document.getElementById('passwordPromptInput').value = 'rootpw';
    window.document.getElementById('passwordPromptOk').click();
    await new Promise((r) => setImmediate(r));
    assert.strictEqual(settled.sudo, 'rootpw', 'the first prompt is answered, not lost');

    // Now the proxy prompt gets its turn.
    assert.strictEqual(modalOpen(window), true, 'the second prompt is now shown');
    assert.ok(window.document.getElementById('passwordPromptUser'), 'it is the proxy one');
  });

  it('cancels a prompt that is still waiting its turn', async () => {
    // Otherwise a proxy prompt would pop up minutes after the app gave up on it.
    const window = setup();
    const settled = { sudo: 'pending', proxy: 'pending' };

    window.ui.passwordPrompt.promptPassword().then((v) => { settled.sudo = v; });
    await new Promise((r) => setImmediate(r));
    window.ui.passwordPrompt.promptPassword({ kind: 'proxy', withUsername: true })
      .then((v) => { settled.proxy = v; });
    await new Promise((r) => setImmediate(r));

    assert.strictEqual(window.ui.passwordPrompt.dismiss('proxy'), true, 'the queued prompt is cancelled');
    await new Promise((r) => setImmediate(r));
    assert.strictEqual(settled.proxy, null, 'its caller is released with "cancelled"');
    assert.strictEqual(modalOpen(window), true, 'the sudo prompt is untouched');

    window.document.getElementById('passwordPromptInput').value = 'rootpw';
    window.document.getElementById('passwordPromptOk').click();
    await new Promise((r) => setImmediate(r));
    assert.strictEqual(settled.sudo, 'rootpw');
    assert.strictEqual(modalOpen(window), false, 'nothing else pops up afterwards');
  });
});
