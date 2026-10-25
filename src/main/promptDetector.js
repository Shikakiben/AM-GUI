// Interactive prompt detection for AM/AppMan, shared by install and reinstall.
//
// This is the detection that already ran in install.js and that works in
// practice, moved here unchanged so both flows use the same code. The logic is
// deliberately NOT improved: a reinstall runs the same AM script, so it must
// behave exactly like an install.
//
// AM sometimes stops and waits for an answer: a numbered menu ("which version?")
// or a free-form question ("Where do you want to install the apps? ... Write the
// path:"). The GUI has to notice and show a dialog, otherwise the process waits
// forever.
//
// Text cannot be matched: `am translate` changes every sentence. So the shape is
// used instead, and the block is forwarded verbatim so it stays in the user's
// language.
const SILENCE_MS = 2500;
const MAX_PROMPT_LINES = 40;

// Creates a detector bound to one process. Feed it chunks with push(); it calls
// onPrompt({ options, prompt, freeform }) when the process is waiting for input.
function createPromptDetector({ onPrompt, silenceMs = SILENCE_MS, maxLines = MAX_PROMPT_LINES } = {}) {
  let promptBuffer = [];
  let lastFiredPrompt = null;
  let silentTimer = null;
  let stderrRemainder = '';
  let stdoutRemainder = '';

  function armSilenceWatch() {
    if (silentTimer) clearTimeout(silentTimer);
    silentTimer = setTimeout(() => {
      silentTimer = null;
      // AM frames its messages with divider lines; drop those at the edges so
      // the block shown to the user starts and ends on real text.
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
      onPrompt({ options: [], prompt: block, freeform: true });
    }, silenceMs);
  }

  function push(chunk, isErr) {
    const txt = chunk.toString();
    let buffer = (isErr ? stderrRemainder : stdoutRemainder) + txt;
    const lines = buffer.split(/\r?\n/);
    if (lines.length > 1) {
      if (isErr) stderrRemainder = lines.pop();
      else stdoutRemainder = lines.pop();
      for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx].trim();
        if (line) {
          promptBuffer.push(line);
          if (promptBuffer.length > maxLines) promptBuffer.shift();
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
          // No numbered options below: not a menu. Leave it to the silence
          // watchdog so we never pop a dialog while AM is still printing.
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
            onPrompt({ options, prompt: block });
          }
        }
      }
    } else {
      if (isErr) stderrRemainder = lines[0];
      else stdoutRemainder = lines[0];
    }
    armSilenceWatch();
  }

  function stop() {
    if (silentTimer) {
      clearTimeout(silentTimer);
      silentTimer = null;
    }
  }

  // The text that never ended with a newline, so the caller can flush it to the
  // UI when the process exits.
  function remainder(isErr = false) {
    return isErr ? stderrRemainder : stdoutRemainder;
  }

  return { push, stop, remainder };
}

module.exports = { createPromptDetector, SILENCE_MS };
