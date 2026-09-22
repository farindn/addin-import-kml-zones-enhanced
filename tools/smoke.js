/* eslint-disable no-console */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const prepareSmokePage = require('./prepare-smoke-page');

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].find((candidate) => fs.existsSync(candidate));

if (!CHROME) {
  console.error('No Chrome or Edge found.');
  process.exit(2);
}

const root = path.resolve(__dirname, '..');
const smokePage = prepareSmokePage();
const page = `file:///${smokePage.replace(/\\/g, '/')}`;
const dumpPath = path.join(root, 'tools', 'smoke.dom.html');
const shotPath = path.join(root, 'tools', 'smoke.png');
const profilePath = path.join(root, 'tools', '.smoke-profile');

const args = [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--allow-file-access-from-files',
  '--hide-scrollbars',
  '--window-size=1440,1000',
  '--virtual-time-budget=8000',
  `--user-data-dir=${profilePath}`,
  `--screenshot=${shotPath}`,
  '--dump-dom',
  page
];

let dom = '';
try {
  dom = execFileSync(CHROME, args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']
  });
} catch (error) {
  dom = String(error.stdout || '');
}

fs.writeFileSync(dumpPath, dom);

const dumpMatch = dom.match(/<pre id="smokeDump"[^>]*>([\s\S]*?)<\/pre>/);
const decode = (value) => value
  .replace(/&quot;/g, '"')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>');

let report;
try {
  if (!dumpMatch) throw new Error('smokeDump element is missing.');
  report = JSON.parse(decode(dumpMatch[1]));
} catch (error) {
  report = { checks: {}, errors: [`Could not parse smoke report: ${error.message}`] };
}

let failed = 0;
console.log('');
const requiredChecks = ['zenith', 'header', 'corridor', 'points', 'route', 'upload', 'options', 'imported'];
requiredChecks.forEach((name) => {
  const passed = report.checks && report.checks[name] === true;
  if (!passed) failed += 1;
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}`);
});
(report.errors || []).forEach((message) => {
  failed += 1;
  console.log(`FAIL  browser error: ${message}`);
});

const statusMatch = dom.match(/<div id="smokeResult"[^>]*>([\s\S]*?)<\/div>/);
if (statusMatch && /BOOT FAILED/.test(statusMatch[1])) {
  failed += 1;
  console.log('FAIL  browser boot');
}

console.log('');
console.log(`DOM dump  : ${dumpPath}`);
console.log(`Screenshot: ${shotPath}`);
console.log(failed ? `${failed} smoke check(s) failed.` : 'Smoke test passed.');
process.exit(failed ? 1 : 0);
