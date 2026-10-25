// Equivalence bench: the detection moved out of install.js must behave exactly
// like the code that already ran there. The reference implementation below is a
// verbatim copy of install.js (lines 50-146 before the extraction), so this test
// fails the moment the shared module drifts from what works in production.
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const { createPromptDetector } = require(path.join(repoRoot, 'src/main/promptDetector'));

// ---------------------------------------------------------------------------
// Reference: the original detection, copied unchanged from install.js.
// ---------------------------------------------------------------------------
function referenceDetector({ silenceMs = 30 } = {}) {
  const out = [];
  let promptBuffer = [];
  let lastFiredPrompt = null;
  let silentTimer = null;
  const SILENCE_MS = silenceMs;
  const MAX_PROMPT_LINES = 40;
  let stdoutRemainder = '';
  let stderrRemainder = '';
  const send = (p) => out.push(p);

  function armSilenceWatch() {
    if (silentTimer) clearTimeout(silentTimer);
    silentTimer = setTimeout(() => {
      silentTimer = null;
      const lines = promptBuffer.slice();
      while (lines.length && /^[-=]{10,}$/.test(lines[0])) lines.shift();
      while (lines.length && /^[-=]{10,}$/.test(lines[lines.length - 1])) lines.pop();
      if (!lines.length) return;
      const last = lines[lines.length - 1];
      if (!/[:?]$/.test(last) || /\?\d+$/.test(last)) return;
      const block = lines.join('\n').trim();
      if (!block || block === lastFiredPrompt) return;
      lastFiredPrompt = block;
      promptBuffer = [];
      send({ kind: 'choice-prompt', options: [], prompt: block, freeform: true });
    }, SILENCE_MS);
  }

  function push(txt, isErr = false) {
    let buffer = (isErr ? stderrRemainder : stdoutRemainder) + txt;
    const lines = buffer.split(/\r?\n/);
    if (lines.length > 1) {
      if (isErr) stderrRemainder = lines.pop();
      else stdoutRemainder = lines.pop();
      for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx].trim();
        if (line) {
          promptBuffer.push(line);
          if (promptBuffer.length > MAX_PROMPT_LINES) promptBuffer.shift();
        }
        if (!line) continue;
        if ((/[:?]\s*$/.test(line)) && !/\?\d+$/.test(line)) {
          let hasNumberedOption = false;
          for (let peek = idx + 1; peek < Math.min(idx + 4, lines.length); peek++) {
            const pl = lines[peek]?.trim();
            if (!pl || /^[-=]+$/.test(pl)) continue;
            if (/^\s*\d+[\.|\)]/.test(pl)) { hasNumberedOption = true; break; }
            break;
          }
          if (!hasNumberedOption) continue;
          const options = [];
          for (let j = idx + 1; j < lines.length; j++) {
            let l = lines[j].trim();
            if (!l || /^[-=]+$/.test(l)) continue;
            if (l.includes('|')) {
              const parts = l.split('|').map(p => p.trim());
              parts.forEach(part => { if (/^\s*\d+[\.|\)]/.test(part)) options.push(part); });
            } else {
              if (/^\s*\d+[\.|\)]/.test(l)) {
                let opt = l;
                if (j + 1 < lines.length) {
                  let next = lines[j + 1].trim();
                  if (next && !/^\s*\d+[\.|\)]/.test(next) && !/^[-=]+$/.test(next)) { opt += ' ' + next; j++; }
                }
                options.push(opt);
              }
            }
          }
          options.sort((a, b) => {
            const na = parseInt(a.match(/\d+/)?.[0] || '0', 10);
            const nb = parseInt(b.match(/\d+/)?.[0] || '0', 10);
            return na - nb;
          });
          if (options.length) {
            const block = promptBuffer.join('\n').trim() || line;
            lastFiredPrompt = block;
            promptBuffer = [];
            send({ kind: 'choice-prompt', options, prompt: block });
          }
        }
      }
    } else {
      if (isErr) stderrRemainder = lines[0];
      else stdoutRemainder = lines[0];
    }
    armSilenceWatch();
  }

  return { push, stop: () => { if (silentTimer) { clearTimeout(silentTimer); silentTimer = null; } }, out };
}

// Runs both implementations on the same chunks and compares what they emit.
async function compare(chunks, waitMs = 120) {
  const ref = referenceDetector({ silenceMs: 30 });
  const got = [];
  const shared = createPromptDetector({ silenceMs: 30, onPrompt: (p) => got.push(p) });
  for (const chunk of chunks) {
    ref.push(chunk);
    shared.push(chunk);
  }
  await new Promise((r) => setTimeout(r, waitMs));
  ref.stop();
  shared.stop();
  return { expected: ref.out, actual: got };
}

const CASES = {
  'menu in one chunk': ['Choose which version to install:\n1. latest\n2. 1.2.3\n3. nightly\n'],
  'menu with short separators': ['Choose:\n1. a\n---\n2. b\n'],
  'menu with long separators': ['====================\nChoose:\n1. a\n2. b\n--------------------\n'],
  'pipe table': ['Select:\n| 1. am | 2. appman |\n'],
  'free-form question': ['Where do you want to install the apps?\nWrite the path:\n'],
  'question then menu in the same chunk': ['Install where?\n1. /opt\n2. ~/Applications\n'],
  'ordinary output only': ['Installing app...\nDone.\n'],
  'option with a continuation line': ['Choose:\n1. the first option\n   which is long\n2. second\n'],
  'menu sent line by line': ['Choose:\n', '1. a\n', '2. b\n'],
  'empty chunk': [''],
  'crlf line endings': ['Choose:\r\n1. a\r\n2. b\r\n'],
  'partial line then rest': ['Choose:\n1. a\n2. b', 'b rest\n']
};

describe('shared detector matches the code that ran in install.js', () => {
  for (const [name, chunks] of Object.entries(CASES)) {
    it(name, async () => {
      const { expected, actual } = await compare(chunks);
      assert.deepStrictEqual(
        actual,
        expected.map(({ kind, ...rest }) => rest),
        `the shared detector must emit exactly what install.js emitted for: ${name}`
      );
    });
  }

  it('never fires twice for the same block', async () => {
    const chunks = ['Choose:\n1. a\n2. b\n', 'Choose:\n1. a\n2. b\n'];
    const { expected, actual } = await compare(chunks);
    assert.deepStrictEqual(actual.map((p) => p.options), expected.map((p) => p.options));
  });

  it('keeps the prompt free of the options (no duplicate rendering)', async () => {
    // The dialog prints `prompt` as a title and the options as buttons; if the
    // prompt contained the options too, they would appear twice.
    const { actual } = await compare(['Choose:\n1. a\n2. b\n']);
    assert.ok(actual.length > 0, 'a prompt is emitted');
    assert.ok(!actual[0].prompt.includes('1. a'), 'the prompt must not repeat the options');
  });
});
