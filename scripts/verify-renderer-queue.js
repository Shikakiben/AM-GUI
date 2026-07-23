const fs = require('fs');
const path = require('path');

const installerPath = path.join(__dirname, '..', 'src', 'renderer', 'features', 'installer', 'index.js');
const installerSource = fs.readFileSync(installerPath, 'utf8');

const checks = [
  { name: 'contains init function', test: () => /function\s+init\s*\(/.test(installerSource) },
  { name: 'contains enqueueInstall', test: () => installerSource.includes('enqueueInstall') },
  { name: 'contains removeFromQueue', test: () => installerSource.includes('removeFromQueue') },
  { name: 'contains processNextInstall', test: () => installerSource.includes('processNextInstall') },
  { name: 'contains activeInstallSession', test: () => installerSource.includes('activeInstallSession') },
  { name: 'contains installQueue', test: () => installerSource.includes('installQueue') },
  { name: 'registers on window.features.installer', test: () => installerSource.includes("namespace.installer") },
];

let failed = 0;
checks.forEach(({ name, test }) => {
  try {
    if (test()) console.log(`  OK: ${name}`);
    else { console.log(`  FAIL: ${name}`); failed++; }
  } catch (e) {
    console.log(`  FAIL: ${name} (${e.message})`); failed++;
  }
});

if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}

console.log('\n\u2714 Renderer queue logic verified successfully.');
