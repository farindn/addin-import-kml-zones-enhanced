/* eslint-disable no-console */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const prepareSmokePage = require('./prepare-smoke-page');

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].find((candidate) => fs.existsSync(candidate));
const smokePage = prepareSmokePage();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Session {
  constructor(socket) {
    this.socket = socket;
    this.id = 0;
    this.pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`${method} timed out`));
        }
      }, 30000);
    });
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
    return response.result.value;
  }
}

async function checkViewport(width) {
  const port = 9800 + width;
  const profile = path.join(os.tmpdir(), `kml-responsive-${width}-${process.pid}`);
  const page = `file:///${smokePage.replace(/\\/g, '/')}`;
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--allow-file-access-from-files',
    '--no-first-run',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    'about:blank'
  ], { stdio: 'ignore' });

  let socket;
  try {
    let target;
    for (let attempt = 0; attempt < 60 && !target; attempt += 1) {
      await sleep(150);
      try {
        const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        target = targets.find((item) => item.type === 'page');
      } catch (error) {
        // Chrome is still starting.
      }
    }
    if (!target) throw new Error('Chrome did not expose a page target');

    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true });
    });

    const session = new Session(socket);
    await session.send('Page.enable');
    await session.send('Runtime.enable');
    await session.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });
    await session.send('Page.navigate', { url: page });
    await sleep(2200);
    await session.evaluate("document.getElementById('checkmateContent').style.left = '0px'");
    await sleep(100);

    const result = await session.evaluate(`(() => {
      const page = document.querySelector('.kml-page');
      const upload = document.querySelector('.dragAndDropUploader');
      const toolbarButton = document.querySelector('.kml-import-toolbar > button');
      const pageBox = page && page.getBoundingClientRect();
      const uploadBox = upload && upload.getBoundingClientRect();
      const buttonBox = toolbarButton && toolbarButton.getBoundingClientRect();
      const options = Array.from(document.querySelectorAll('button')).find((button) => {
        const box = button.getBoundingClientRect();
        return button.textContent.trim() === 'Options' && box.width > 0 && box.height > 0;
      });
      if (options) options.click();
      return new Promise((resolve) => setTimeout(() => resolve({
        viewport: window.innerWidth,
        pageWidth: pageBox && pageBox.width,
        uploadWidth: uploadBox && uploadBox.width,
        buttonWidth: buttonBox && buttonBox.width,
        hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        hasMobileSheet: Boolean(document.querySelector('.zen-mobile-sheet')),
        hasModal: Boolean(document.querySelector('.zen-modal'))
      }), 150));
    })()`);

    return result;
  } finally {
    if (socket) socket.close();
    chrome.kill();
    await sleep(200);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (error) {}
  }
}

if (!CHROME) {
  console.error('No Chrome or Edge found.');
  process.exit(2);
}

(async () => {
  let failed = 0;
  for (const width of [390, 1440]) {
    const result = await checkViewport(width);
    const checks = {
      pageFits: result.pageWidth <= result.viewport + 1,
      uploadFits: result.uploadWidth <= result.viewport + 1,
      noHorizontalOverflow: !result.hasHorizontalOverflow,
      optionsSheetAtMobile: width !== 390 || result.hasMobileSheet,
      optionsModalAtDesktop: width !== 1440 || result.hasModal
    };
    console.log(`\nViewport ${width}px`);
    Object.entries(checks).forEach(([name, passed]) => {
      if (!passed) failed += 1;
      console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}`);
    });
  }
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
