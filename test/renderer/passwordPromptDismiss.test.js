// The proxy password dialog can be closed by the main process when it stops
// waiting (two minutes without an answer). Two things matter:
//   - the window really closes and the waiting promise settles;
//   - a proxy timeout must never close a sudo prompt, which has no timeout.
'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SOURCE = fs.readFileSync(path.join(__dirname, '../../src/renderer/ui/passwordPrompt.js'), 'utf8');

let dom = null;

function setup() {
  dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost',
    runScripts: 'dangerously'
  });
  dom.window.eval(SOURCE);
  return dom.window;
}

afterEach(() => {
  try { dom?.window?.close?.(); } catch (_) {}
  dom = null;
});

const isOpen = (window) => {
  const modal = window.document.getElementById('passwordPromptModal');
  return !!modal && modal.style.display !== 'none';
};

describe('proxy password dialog dismissal', () => {
  it('closes the window and settles the promise', async () => {
    const window = setup();
    let settled = 'pending';
    window.ui.passwordPrompt.promptPassword({ kind: 'proxy', withUsername: true })
      .then((answer) => { settled = answer; });

    await new Promise((r) => setImmediate(r));
    assert.strictEqual(isOpen(window), true, 'the dialog is shown');

    assert.strictEqual(window.ui.passwordPrompt.dismiss('proxy'), true);
    assert.strictEqual(isOpen(window), false, 'the dialog is hidden');
    await new Promise((r) => setImmediate(r));
    assert.strictEqual(settled, null, 'the caller gets "cancelled", not a pending promise');
  });

  it('never closes a sudo prompt', async () => {
    // A sudo prompt has no timeout. If a proxy timeout closed it, the user would
    // lose a password dialog they were still filling in.
    const window = setup();
    window.ui.passwordPrompt.promptPassword();
    await new Promise((r) => setImmediate(r));
    assert.strictEqual(isOpen(window), true);

    assert.strictEqual(window.ui.passwordPrompt.dismiss('proxy'), false, 'refused');
    assert.strictEqual(isOpen(window), true, 'the sudo prompt is still there');
  });

  it('does nothing when no dialog is open', () => {
    const window = setup();
    assert.strictEqual(window.ui.passwordPrompt.dismiss('proxy'), false);
  });

  it('keeps working after a dismissal', async () => {
    // The state must not be left half-closed: the next challenge has to be able
    // to open a fresh dialog.
    const window = setup();
    window.ui.passwordPrompt.promptPassword({ kind: 'proxy', withUsername: true });
    await new Promise((r) => setImmediate(r));
    window.ui.passwordPrompt.dismiss('proxy');

    let answer = 'pending';
    window.ui.passwordPrompt.promptPassword({ kind: 'proxy', withUsername: true })
      .then((a) => { answer = a; });
    await new Promise((r) => setImmediate(r));
    assert.strictEqual(isOpen(window), true, 'a new dialog opens');

    window.document.getElementById('passwordPromptUser').value = 'alice';
    window.document.getElementById('passwordPromptInput').value = 's3cret';
    window.document.getElementById('passwordPromptOk').click();
    await new Promise((r) => setImmediate(r));
    // The object comes from the jsdom realm, so compare its fields rather than
    // its prototype.
    assert.strictEqual(answer.username, 'alice');
    assert.strictEqual(answer.password, 's3cret');
    assert.strictEqual(answer.remember, false);
  });
});
