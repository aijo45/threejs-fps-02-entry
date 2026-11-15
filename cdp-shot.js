// Minimal CDP screenshot driver (Node 22 stdlib only): navigates to a URL, waits for
// window.__shotReady (or a timeout), captures a PNG screenshot, and prints console
// errors. Usage: node cdp-shot.js <url> <out.png> [waitMs]
const { execFile } = require('node:child_process');
const { writeFileSync } = require('node:fs');

const CHROME = '/opt/meta-chromium/chrome';
const POLICY = '/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/webgl-allowed-domains.txt';
const SHA = '8097045f0459c96c4cdc76e3a1af4e0f43f640b4b59c43d6db35e3641c0264c6';

const url = process.argv[2];
const out = process.argv[3];
const waitMs = Number(process.argv[4] ?? '20000');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(path) {
  const res = await fetch(`http://127.0.0.1:9222${path}`);
  return res.json();
}

async function main() {
  const child = execFile(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--allow-file-access-from-files',
    '--user-data-dir=/tmp/cdp-prof',
    '--use-angle=swiftshader',
    `--hatch-webgl-allowed-domains-file=${POLICY}`,
    `--hatch-webgl-allowed-domains-sha256=${SHA}`,
    '--window-size=1280,720',
    '--remote-debugging-port=9222',
    '--remote-allow-origins=*',
    url,
  ], { stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 40; i += 1) {
    try {
      const list = await getJson('/json/list');
      target = list.find((t) => t.type === 'page');
      if (target) break;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  if (!target) {
    child.kill();
    throw new Error('chrome devtools did not come up');
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let id = 0;
  const pending = new Map();
  const consoleErrors = [];
  function send(method, params = {}) {
    const messageId = ++id;
    return new Promise((resolve, reject) => {
      pending.set(messageId, { resolve, reject });
      ws.send(JSON.stringify({ id: messageId, method, params }));
    });
  }
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(`${data.error.message} (${data.error.code})`));
      else resolve(data.result);
    } else if (data.method === 'Runtime.exceptionThrown') {
      const detail = data.params.exceptionDetails;
      consoleErrors.push(`EXCEPTION: ${detail.text} ${detail.exception?.description ?? ''}`);
    } else if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') {
      consoleErrors.push(`CONSOLE ERROR: ${data.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
    }
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

  // The page is already loading from the launch argument; wait for it to settle.

  let ready = false;
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await sleep(500);
    try {
      const result = await send('Runtime.evaluate', { expression: 'window.__shotReady === true', returnByValue: true });
      if (result?.result?.value === true) {
        ready = true;
        break;
      }
    } catch { /* page still loading */ }
  }
  // One more paint for good measure.
  await sleep(300);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log(`ready=${ready} wrote ${out}`);
  if (consoleErrors.length > 0) {
    console.log('--- console errors ---');
    for (const line of consoleErrors.slice(0, 10)) console.log(line);
  }
  ws.close();
  child.kill();
  process.exit(0);
}

main().catch((error) => {
  console.error('FAILED:', error.message);
  process.exit(1);
});
