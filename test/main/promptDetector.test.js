// Interactive prompt detection, shared by install and reinstall.
// A reinstall runs the same AM script, so it stops on the same menus; without
// detection the process waited forever and some apps never reinstalled.
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const { createPromptDetector, stripDividers, collectOptions } = require(path.join(repoRoot, 'src/main/promptDetector'));

// A menu is only complete once AM stops printing, so the detector waits for the
// silence watch (or a chunk that is not another option). Give it that time.
async function collect(chunks, options = {}) {
  const prompts = [];
  const detector = createPromptDetector({
    silenceMs: options.silenceMs ?? 10,
    onPrompt: (p) => prompts.push(p)
  });
  for (const chunk of chunks) detector.push(chunk);
  if (options.settle !== false) await new Promise((r) => setTimeout(r, 40));
  detector.stop();
  return { prompts, detector };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe('numbered menus', () => {
  it('detects a menu and its options', async () => {
    const { prompts } = await collect([
      'Choose which version to install:\n',
      '1. latest\n',
      '2. 1.2.3\n',
      '3. nightly\n'
    ]);
    assert.strictEqual(prompts.length, 1, 'one prompt');
    assert.strictEqual(prompts[0].freeform, false);
    assert.deepStrictEqual(prompts[0].options, ['1. latest', '2. 1.2.3', '3. nightly']);
    // The block starts at the question and includes the options, so the user
    // sees exactly what AM printed.
    assert.match(prompts[0].prompt, /^Choose which version/);
    assert.match(prompts[0].prompt, /3\. nightly$/);
  });

  it('keeps the prompt verbatim so it stays in the user language', async () => {
    const { prompts } = await collect([
      'Quelle version voulez-vous ?\n',
      '1. dernière\n',
      '2. stable\n'
    ]);
    assert.match(prompts[0].prompt, /Quelle version voulez-vous/);
    assert.deepStrictEqual(prompts[0].options, ['1. dernière', '2. stable']);
    // Nothing is translated or rewritten by the detector.
    assert.ok(prompts[0].prompt.includes('dernière'));
  });

  it('does not fire twice for the same block', async () => {
    const { prompts } = await collect([
      'Pick one:\n1. a\n2. b\n',
      'Pick one:\n1. a\n2. b\n'
    ]);
    assert.strictEqual(prompts.length, 1, 'the same block must not open two dialogs');
  });

  it('treats a question with no options as a free-form prompt', async () => {
    // AM asking something without a numbered list ("Write the path:") waits for
    // typed input, so the dialog must appear once printing stops.
    const { prompts } = await collect(['Do you want to continue?\n']);
    assert.strictEqual(prompts.length, 1);
    assert.strictEqual(prompts[0].freeform, true);
    assert.deepStrictEqual(prompts[0].options, []);
  });
});

describe('free-form questions', () => {
  it('fires after a silence when the last line ends with a colon', async () => {
    const prompts = [];
    const detector = createPromptDetector({ silenceMs: 10, onPrompt: (p) => prompts.push(p) });
    detector.push('Where do you want to install the apps?\nWrite the path:\n');
    await wait(40);
    detector.stop();
    assert.strictEqual(prompts.length, 1);
    assert.strictEqual(prompts[0].freeform, true);
    assert.match(prompts[0].prompt, /Write the path/);
  });

  it('does not fire while the process is still printing', async () => {
    const prompts = [];
    const detector = createPromptDetector({ silenceMs: 30, onPrompt: (p) => prompts.push(p) });
    detector.push('Installing...\n');
    await wait(10);
    detector.push('still working\n');
    await wait(10);
    detector.push('done.\n');
    await wait(50);
    detector.stop();
    assert.strictEqual(prompts.length, 0, 'no dialog for ordinary output');
  });
});

describe('output handling', () => {
  it('keeps a partial line until it is complete', async () => {
    const { prompts } = await collect(['1. first\n2. sec'], { silenceMs: 50, settle: false });
    assert.strictEqual(prompts.length, 0, 'an incomplete menu is not fired yet');
  });

  it('handles options separated by pipes (AM table layout)', async () => {
    const { prompts } = await collect([
      'Select:\n',
      '| 1. am | 2. appman |\n'
    ]);
    assert.deepStrictEqual(prompts[0].options, ['1. am', '2. appman']);
  });

  it('strips AM divider lines from the shown block', () => {
    const lines = stripDividers(['====================', 'Pick one:', '1. a', '--------------------']);
    assert.deepStrictEqual(lines, ['Pick one:', '1. a']);
  });

  it('collects options with their continuation line', () => {
    const options = collectOptions(['Choose:', '1. the first option', '   which is long', '2. second'], 0);
    assert.deepStrictEqual(options, ['1. the first option which is long', '2. second']);
  });

  it('stop() cancels a pending silence timer', async () => {
    const prompts = [];
    const detector = createPromptDetector({ silenceMs: 20, onPrompt: (p) => prompts.push(p) });
    detector.push('Question:\n');
    detector.stop();
    await wait(50);
    assert.strictEqual(prompts.length, 0, 'a stopped detector must not fire');
  });
});
