const fs = require('fs');
const path = require('path');
const vm = require('vm');

function extractQueueSnippet(fullSource) {
  const startMarker = 'let activeInstallSession = {';
  const endMarker = 'let syncBtn = null;';
  const start = fullSource.indexOf(startMarker);
  const end = fullSource.indexOf(endMarker);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Unable to locate install queue section in renderer.js');
  }
  return fullSource.slice(start, end);
}

function createDocumentStub() {
  const emptyArray = [];
  return {
    body: { classList: { toggle() {}, add() {}, remove() {} } },
    querySelectorAll() { return emptyArray; },
    querySelector() { return null; }
  };
}

function createButtonStub(name) {
  const attrs = { 'data-name': name };
  return {
    hidden: false,
    disabled: false,
    textContent: '',
    classList: { add() {}, remove() {} },
    setAttribute(key, value) { attrs[key] = value; },
    getAttribute(key) { return attrs[key]; }
  };
}

function createElementStub() {
  return {
    hidden: false,
    textContent: '',
    scrollTop: 0,
    scrollHeight: 0,
    dataset: {},
    classList: { add() {}, remove() {} },
    setAttribute() {},
    addEventListener() {}
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const rendererPath = path.join(__dirname, '..', 'src', 'renderer', 'renderer.js');
  const rendererSource = fs.readFileSync(rendererPath, 'utf8');
  const queueSnippet = extractQueueSnippet(rendererSource);
  const instrumentedSnippet = `${queueSnippet}\n globalThis.__queueTest = { installQueue, enqueueInstall, removeFromQueue, processNextInstall, activeInstallSession };`;

  const toastMessages = [];
  const queueIndicatorsUpdates = [];
  const startStreamingCalls = [];

  const sandboxLog = createElementStub();
  const sandboxLogToggle = createElementStub();
  const sandboxLogSection = createElementStub();
  const sandboxState = { info: {}, logBuffer: '', busy: false, currentApp: null };
  const sandboxRefreshBtn = createElementStub();
  const sandboxConfigureBtn = createElementStub();
  const sandboxDisableBtn = createElementStub();
  const sandboxInstallDepsBtn = createElementStub();
  const sandboxOpenBtn = createElementStub();
  const sandboxCloseBtn = createElementStub();
  const sandboxButtonStatus = createElementStub();
  const sandboxStatusBadge = createElementStub();
  const sandboxDepsAlert = createElementStub();
  const sandboxUnavailable = createElementStub();
  const sandboxInstallAppBtn = createElementStub();
  const sandboxCard = createElementStub();
  const sandboxModal = createElementStub();
  const sandboxForm = createElementStub();
  const sandboxCustomPathInput = createElementStub();
  sandboxCustomPathInput.value = '';
  const sandboxSummary = createElementStub();
  const sandboxSummaryList = createElementStub();
  const sandboxSummaryEmpty = createElementStub();
  const nonAppimageModal = createElementStub();
  const nonAppimageCloseBtn = createElementStub();
  const nonAppimageDismissBtn = createElementStub();
  const nonAppimageMessage = createElementStub();
  const SANDBOX_DIR_VALUES = ['desktop','documents','downloads','games','music','pictures','videos'];
  const SANDBOX_DIR_LABEL_KEYS = {
    desktop: 'sandbox.dir.desktop',
    documents: 'sandbox.dir.documents',
    downloads: 'sandbox.dir.downloads',
    games: 'sandbox.dir.games',
    music: 'sandbox.dir.music',
    pictures: 'sandbox.dir.pictures',
    videos: 'sandbox.dir.videos'
  };
  const SANDBOX_PREFS_KEY = 'sandboxSharePrefs';

  const context = {
    console,
    setTimeout,
    clearTimeout,
    CSS: { escape: (value) => value },
    Node: { TEXT_NODE: 3 },
    window: {
      electronAPI: {
        amAction: () => Promise.resolve()
      },
      addEventListener() {},
      removeEventListener() {}
    },
    document: createDocumentStub(),
    detailsInstallBtn: createButtonStub('alpha'),
    state: { viewMode: 'grid', installed: new Set(), filtered: [] },
    showToast(msg) { toastMessages.push(msg); },
    t(key, vars) {
      if (!vars) return key;
      return `${key}:${JSON.stringify(vars)}`;
    },
    startStreamingInstall(name) {
      startStreamingCalls.push(name);
      return Promise.resolve();
    },
    loadApps: () => Promise.resolve(),
    applySearch: () => {},
    refreshAllInstallButtons: () => {},
    refreshTileBadges: () => {},
    updateQueueIndicators: () => queueIndicatorsUpdates.push(Date.now()),
    sandboxLog,
    sandboxLogToggle,
    sandboxLogSection,
    sandboxState,
    sandboxRefreshBtn,
    sandboxConfigureBtn,
    sandboxDisableBtn,
    sandboxInstallDepsBtn,
    sandboxOpenBtn,
    sandboxCloseBtn,
    sandboxButtonStatus,
    sandboxStatusBadge,
    sandboxDepsAlert,
    sandboxUnavailable,
    sandboxInstallAppBtn,
    sandboxCard,
    sandboxModal,
    sandboxForm,
    sandboxCustomPathInput,
    sandboxSummary,
    sandboxSummaryList,
    sandboxSummaryEmpty,
    nonAppimageModal,
    nonAppimageCloseBtn,
    nonAppimageDismissBtn,
    nonAppimageMessage,
    SANDBOX_DIR_VALUES,
    SANDBOX_DIR_LABEL_KEYS,
    SANDBOX_PREFS_KEY
  };

  vm.createContext(context);
  vm.runInContext(instrumentedSnippet, context);

  const { installQueue, enqueueInstall, removeFromQueue, processNextInstall, activeInstallSession } = context.__queueTest || {};

  assert(Array.isArray(installQueue), 'installQueue array not exposed');

  activeInstallSession.id = null;
  activeInstallSession.done = true;
  enqueueInstall('alpha');
  assert(startStreamingCalls.includes('alpha'), 'Immediate install should start streaming');
  assert(installQueue.length === 0, 'Queue should be empty after starting install');

  activeInstallSession.id = 'session-1';
  activeInstallSession.name = 'alpha';
  activeInstallSession.done = false;
  enqueueInstall('beta');
  assert(installQueue.length === 1, 'Item should be queued while install active');

  const removed = removeFromQueue('beta');
  assert(removed === true, 'removeFromQueue should return true when entry existed');
  assert(installQueue.length === 0, 'Queue should be empty after removal');

  enqueueInstall('gamma');
  assert(installQueue.length === 1, 'Queue should contain gamma before processing');

  activeInstallSession.id = null;
  activeInstallSession.done = true;
  processNextInstall();
  assert(startStreamingCalls.includes('gamma'), 'processNextInstall should start gamma streaming');
  assert(queueIndicatorsUpdates.length >= 1, 'Queue indicators should update when queue changes');

  console.log('✔ Renderer queue logic verified successfully.');
})().catch((err) => {
  console.error('✖ Renderer queue verification failed:', err);
  process.exitCode = 1;
});
