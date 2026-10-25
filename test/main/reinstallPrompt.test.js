// A reinstall runs the same AM script as an install, so it can stop on a
// numbered menu ("which version?") or a free-form question. Without prompt
// detection the process waited forever and some apps never reinstalled.
//
// These tests check the wiring, not the detector itself (covered by
// promptDetector.test.js): the reinstall path must detect prompts and forward
// them to the renderer, and the answer must reach the right process.
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');

const repoRoot = path.resolve(__dirname, '..', '..');

describe('reinstall prompt wiring', () => {
  it('the updates module detects prompts during a reinstall', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'src/main/updates.js'), 'utf8');
    const start = src.indexOf("ipcMain.handle('updates-reinstall-bulk'");
    assert.ok(start > 0, 'reinstall handler found');
    const handler = src.slice(start, src.indexOf('module.exports'));

    assert.ok(/createPromptDetector/.test(handler), 'the reinstall path must create a prompt detector');
    assert.ok(/choice-prompt/.test(handler), 'detected prompts must be forwarded as choice-prompt');
    assert.ok(/prompts\.push/.test(handler), 'process output must be fed to the detector');
  });

  it('the answer handler can reach a reinstall process', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'src/main/install.js'), 'utf8');
    const start = src.indexOf("ipcMain.handle('install-send-choice'");
    const handler = src.slice(start, start + 900);
    assert.ok(
      /activeUpdates/.test(handler) && /reinstall-/.test(handler),
      'install-send-choice must also look in activeUpdates under the reinstall- prefix'
    );
  });

  it('the renderer forwards reinstall prompts to the shared dialog', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'src/renderer/features/updates/index.js'), 'utf8');
    const start = src.indexOf('onReinstallProgress');
    assert.ok(start > 0, 'reinstall listener found');
    const listener = src.slice(start, start + 1400);
    assert.ok(/choice-prompt/.test(listener), 'the reinstall listener must handle choice-prompt');
    assert.ok(/onChoicePrompt/.test(listener), 'it must hand the prompt to the shared dialog');
  });

  it('the renderer exposes the dialog for both flows', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'src/renderer/renderer.js'), 'utf8');
    assert.ok(/function showChoicePrompt/.test(src), 'the dialog is a reusable function');
    assert.ok(/ui\.choicePrompt/.test(src), 'it is exposed on window.ui');
    assert.ok(/onChoicePrompt:/.test(src), 'the updates module receives it');
  });

  it('answers reach the process through install-send-choice', () => {
    // The dialog always answers through this channel; the main process now
    // resolves both install and reinstall processes from it.
    const src = fs.readFileSync(path.join(repoRoot, 'src/renderer/renderer.js'), 'utf8');
    assert.ok(/installSendChoice/.test(src), 'the dialog sends the answer');
  });
});
