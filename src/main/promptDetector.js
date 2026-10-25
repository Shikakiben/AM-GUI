// Interactive prompt detection for AM/AppMan, shared by install and reinstall.
//
// AM sometimes stops and waits for an answer: a numbered menu ("which version?")
// or a free-form question ("Where do you want to install the apps? ... Write the
// path:"). The GUI has to notice and show a dialog, otherwise the process waits
// forever and the operation looks stuck.
//
// Text cannot be matched: `am translate` changes every sentence. So the shape is
// used instead, and the block is forwarded verbatim so it stays in the user's
// language:
//   - a numbered menu: a line ending in ':' or '?' followed by "1. ..." entries;
//   - a free-form prompt: nothing printed for a while and the last line ends
//     with ':' or '?'.
const SILENCE_MS = 2500;
const MAX_PROMPT_LINES = 40;
const DIVIDER = /^[-=]{10,}$/;

function stripDividers(lines) {
  const out = lines.slice();
  while (out.length && DIVIDER.test(out[0])) out.shift();
  while (out.length && DIVIDER.test(out[out.length - 1])) out.pop();
  return out;
}

// Collects the numbered options that follow a prompt line.
function collectOptions(lines, startIdx) {
  const options = [];
  for (let j = startIdx + 1; j < lines.length; j++) {
    const l = lines[j].trim();
    if (!l || DIVIDER.test(l)) continue;
    if (l.includes('|')) {
      l.split('|').map((p) => p.trim()).forEach((part) => {
        if (/^\s*\d+[.|)]/.test(part)) options.push(part);
      });
    } else if (/^\s*\d+[.|)]/.test(l)) {
      let opt = l;
      if (j + 1 < lines.length) {
        const next = lines[j + 1].trim();
        if (next && !/^\s*\d+[.|)]/.test(next) && !DIVIDER.test(next)) {
          opt += ' ' + next;
          j++;
        }
      }
      options.push(opt);
    }
  }
  options.sort((a, b) => {
    const na = parseInt(a.match(/\d+/)?.[0] || '0', 10);
    const nb = parseInt(b.match(/\d+/)?.[0] || '0', 10);
    return na - nb;
  });
  return options;
}

function hasNumberedOptionBelow(lines, idx) {
  for (let peek = idx + 1; peek < Math.min(idx + 4, lines.length); peek++) {
    const pl = lines[peek]?.trim();
    if (!pl || DIVIDER.test(pl)) continue;
    return /^\s*\d+[.|)]/.test(pl);
  }
  return false;
}

// Creates a detector bound to one process. Feed it chunks with push(); it calls
// onPrompt({ options, prompt, freeform }) when the process is waiting for input.
function createPromptDetector({ onPrompt, silenceMs = SILENCE_MS, maxLines = MAX_PROMPT_LINES } = {}) {
  let promptBuffer = [];
  let lastFiredPrompt = null;
  let silentTimer = null;
  let stderrRemainder = '';
  let stdoutRemainder = '';
  let pendingMenu = -1; // a menu whose options are still arriving

  function emit(options, block, freeform) {
    if (!block || block === lastFiredPrompt) return;
    lastFiredPrompt = block;
    promptBuffer = [];
    onPrompt({ options, prompt: block, freeform });
  }

  function armSilenceWatch() {
    if (silentTimer) clearTimeout(silentTimer);
    silentTimer = setTimeout(() => {
      silentTimer = null;
      // Silence means AM has stopped printing: a pending menu is now complete.
      if (pendingMenu >= 0 && detectMenu(true)) return;
      const lines = stripDividers(promptBuffer);
      if (!lines.length) return;
      const last = lines[lines.length - 1];
      if (!/[:?]$/.test(last) || /\?\d+$/.test(last)) return;
      emit([], lines.join('\n').trim(), true);
    }, silenceMs);
  }

  function push(chunk, isErr = false) {
    const txt = String(chunk);
    const buffer = (isErr ? stderrRemainder : stdoutRemainder) + txt;
    const lines = buffer.split(/\r?\n/);
    if (lines.length > 1) {
      if (isErr) stderrRemainder = lines.pop();
      else stdoutRemainder = lines.pop();
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line) {
          promptBuffer.push(line);
          if (promptBuffer.length > maxLines) promptBuffer.shift();
        }
      }
      // Scan the whole buffer, not just this chunk: AM often prints the question
      // and its numbered options in separate writes, so the question would never
      // see its options if each chunk were analysed on its own.
      if (detectMenu()) return;
    } else if (isErr) {
      stderrRemainder = lines[0];
    } else {
      stdoutRemainder = lines[0];
    }
    armSilenceWatch();
  }

  // Looks for a question line followed by numbered options in the collected
  // buffer. Returns true when a prompt was emitted.
  //
  // AM prints a menu line by line, so a question followed by "1. latest" is not
  // yet a complete menu: the rest is still coming. The menu is only considered
  // finished when the line after the last option is not another numbered entry,
  // i.e. when a following chunk brought something else (or nothing more came).
  function detectMenu(final = false) {
    for (let idx = 0; idx < promptBuffer.length; idx++) {
      const line = promptBuffer[idx];
      if (!/[:?]$/.test(line) || /\?\d+$/.test(line)) continue;
      const options = collectOptions(promptBuffer, idx);
      if (!options.length) continue;
      const lastOptionLine = promptBuffer[promptBuffer.length - 1];
      const lastIsOption = /^\s*\d+[.|)]/.test(lastOptionLine);
      if (lastIsOption && !final) {
        // Options are still arriving: wait for the next chunk.
        pendingMenu = idx;
        return false;
      }
      // The block shown to the user starts at the question, not at everything
      // that was printed before it.
      const block = promptBuffer.slice(idx).join('\n').trim();
      pendingMenu = -1;
      emit(options, block, false);
      return true;
    }
    return false;
  }

  function stop() {
    if (silentTimer) {
      clearTimeout(silentTimer);
      silentTimer = null;
    }
  }

  // Text that never ended with a newline, for the final output.
  function remainder(isErr = false) {
    return isErr ? stderrRemainder : stdoutRemainder;
  }

  return { push, stop, remainder };
}

module.exports = { createPromptDetector, stripDividers, collectOptions, SILENCE_MS };
