const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');

const originalExec = childProcess.exec;
let tempDir = null;
let success = false;

(async () => {
  let execInvocations = 0;
  let fakeCommandState = 'am';

  childProcess.exec = (command, callback = () => {}) => {
    const isAmLookup = /command -v am\b/.test(command);
    const isAppmanLookup = /command -v appman\b/.test(command);
    setImmediate(() => {
      if (isAmLookup) {
        execInvocations += 1;
        if (fakeCommandState === 'am') return callback(null, '/usr/bin/am');
        return callback(new Error('am not found'));
      }
      if (isAppmanLookup) {
        execInvocations += 1;
        if (fakeCommandState === 'appman') return callback(null, '/usr/bin/appman');
        return callback(new Error('appman not found'));
      }
      execInvocations += 1;
      callback(new Error(`unsupported command: ${command}`));
    });
  };

  try {
    const { detectPackageManager, invalidatePackageManagerCache } = require('../src/main/packageManager');
    const { createIconCacheManager } = require('../src/main/iconCache');

    const pmFirst = await detectPackageManager();
    if (pmFirst !== 'am') throw new Error(`Expected first detection to return "am", got ${pmFirst}`);
    const pmSecond = await detectPackageManager();
    if (pmSecond !== 'am') throw new Error('Cache should preserve initial detection result');
    if (execInvocations !== 1) throw new Error(`Expected 1 exec invocation, got ${execInvocations}`);

    invalidatePackageManagerCache();
    fakeCommandState = 'appman';
    const pmThird = await detectPackageManager();
    if (pmThird !== 'appman') throw new Error(`Expected refreshed detection to return "appman", got ${pmThird}`);
    if (execInvocations !== 3) throw new Error('Refresh should trigger two extra exec calls (am + appman).');

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-gui-icon-test-'));
    const cacheDir = path.join(tempDir, 'icons-cache');
    const fakeApp = {
      getPath(name) {
        if (name === 'userData') return tempDir;
        throw new Error(`Unexpected path request: ${name}`);
      }
    };

    const protocol = {
      handler: null,
      registerFileProtocol(scheme, handler) {
        if (scheme !== 'appicon') throw new Error(`Unexpected scheme: ${scheme}`);
        this.handler = handler;
      }
    };

    const iconManager = createIconCacheManager(fakeApp);
    iconManager.registerProtocol(protocol);
    if (typeof protocol.handler !== 'function') throw new Error('Protocol handler was not registered');

    const blankPath = path.join(cacheDir, '__blank.png');
    if (!fs.existsSync(blankPath)) throw new Error('Blank icon was not created');

    const resolvedBlank = await new Promise((resolve) => {
      protocol.handler({ url: 'appicon://__blank.png' }, resolve);
    });
    if (!resolvedBlank || !fs.existsSync(resolvedBlank)) throw new Error('Blank icon resolution failed');

    const fakeIconPath = path.join(cacheDir, 'dummy.png');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(fakeIconPath, Buffer.alloc(512, 1));
    const purgeResult = await iconManager.purgeCache();
    if (!purgeResult || purgeResult.removed < 1) throw new Error('Purge cache did not report removed files');
    if (fs.existsSync(fakeIconPath)) throw new Error('Purge cache did not delete dummy icon');

    success = true;
    console.log('✔ Main-process modules verified successfully.');
  } catch (err) {
    console.error('✖ Verification failed:', err);
    process.exitCode = 1;
  } finally {
    try {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (cleanupErr) {
      console.warn('Warning: failed to clean temporary directory:', cleanupErr.message);
    }
    childProcess.exec = originalExec;
    if (success) {
      process.exitCode = 0;
    }
  }
})();
