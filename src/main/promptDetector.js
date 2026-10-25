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
      // Fallback for a menu AM wrote line by line (a real pty does this): the
      // per-chunk scan below only sees one line at a time, so the question never
      // finds its options. When nothing more comes, look at the whole buffer.
      // This runs ONLY after the silence, so the normal path is untouched.
      if (fireMenuFromBuffer()) return;
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

  // Looks for a question followed by numbered options anywhere in the buffer.
  // Same rules as the per-chunk scan, applied to everything collected so far.
  //
  // Deliberately narrow. The old detection fired only when the question and its
  // options arrived in the SAME chunk, so the fallback must not fire on anything
  // broader than what AM actually prints when it waits for input:
  //   - at least TWO numbered options (one entry is not a choice);
  //   - the last option must be the last meaningful line: if ordinary text
  //     follows, AM was describing something, not waiting for an answer.
  // Verified against the old detection on ordinary output ("Download these
  // files:" + list, "Installed version:", error codes): all stay silent.
  function fireMenuFromBuffer() {
    for (let idx = 0; idx < promptBuffer.length; idx++) {
      const line = promptBuffer[idx];
      if (!/[:?]\s*$/.test(line) || /\?\d+$/.test(line)) continue;
      const options = [];
      let lastOptionIndex = -1;
      for (let j = idx + 1; j < promptBuffer.length; j++) {
        let l = promptBuffer[j].trim();
        if (!l || /^[-=]+$/.test(l)) continue;
        if (l.includes('|')) {
          const parts = l.split('|').map(p => p.trim());
          let found = false;
          parts.forEach(part => { if (/^\s*\d+[\.|\)]/.test(part)) { options.push(part); found = true; } });
          if (found) lastOptionIndex = j;
        } else if (/^\s*\d+[\.|\)]/.test(l)) {
          let opt = l;
          let consumed = j;
          // Merge a continuation line only when it cannot be a trailing sentence:
          // a continuation is indented or ends with nothing sentence-like. In
          // "2. b.tar.gz\nDone." the "Done." line is output, not a continuation.
          if (j + 1 < promptBuffer.length) {
            const next = promptBuffer[j + 1].trim();
            const isLast = !promptBuffer.slice(j + 2).some((x) => x.trim() && !/^[-=]+$/.test(x.trim()));
            const looksLikeContinuation = next && !/^\s*\d+[\.|\)]/.test(next) && !/^[-=]+$/.test(next)
              && /[.!?]$/.test(next) === false;
            if (next && isLast && looksLikeContinuation) {
              opt += ' ' + next;
              consumed = j + 1;
            }
          }
          options.push(opt);
          lastOptionIndex = consumed;
          j = consumed;
        }
      }
      // A real menu offers a choice: one option is not a menu.
      if (options.length < 2) continue;
      // Anything meaningful after the last option means this was prose, not a
      // prompt (e.g. a numbered list followed by "Done.").
      let trailing = false;
      for (let k = lastOptionIndex + 1; k < promptBuffer.length; k++) {
        const t = promptBuffer[k].trim();
        if (t && !/^[-=]+$/.test(t)) { trailing = true; break; }
      }
      if (trailing) continue;
      // Show the question, not the whole buffer: the dialog prints `prompt` as a
      // title and the options as buttons, so including them would show them twice.
      const block = line;
      if (!block || block === lastFiredPrompt) return false;
      lastFiredPrompt = block;
      promptBuffer = [];
      onPrompt({ options, prompt: block });
      return true;
    }
    return false;
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
