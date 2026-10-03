// Runs the showcase's self test in headless Chrome and prints what it found.
//   npm run test:browser
// It builds nothing: run `npm run build:showcase` first. It needs Chrome installed.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium']
  .find(path => path && existsSync(path));
if (!CHROME) { console.error('Chrome was not found. Set CHROME to its path.'); process.exit(2); }
const PORT = 5197, DEBUG = 9333, wait = ms => new Promise(done => setTimeout(done, ms));
const profile = mkdtempSync(join(tmpdir(), 'mmde-chrome-'));
const preview = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${DEBUG}`, `--user-data-dir=${profile}`, '--window-size=1400,1100', 'about:blank'], { stdio: 'ignore' });
const stop = code => { preview.kill(); chrome.kill(); try { rmSync(profile, { recursive: true, force: true }); } catch { /* still in use */ } process.exit(code); };

try {
  let target;
  for (let i = 0; i < 100 && !target; i++) {
    await wait(100);
    try { target = (await (await fetch(`http://127.0.0.1:${DEBUG}/json`)).json()).find(one => one.type === 'page'); } catch { /* not up yet */ }
  }
  if (!target) throw new Error('Chrome did not start.');
  let served = false;
  for (let i = 0; i < 100 && !served; i++) { try { served = (await fetch(`http://127.0.0.1:${PORT}/`)).ok; } catch { await wait(100); } }
  if (!served) throw new Error('The showcase is not being served. Run npm run build:showcase first.');
  const socket = new WebSocket(target.webSocketDebuggerUrl), waiting = new Map(), logs = [];
  let next = 0;
  await new Promise((done, fail) => { socket.onopen = done; socket.onerror = fail; });
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') logs.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') logs.push(message.params.args.map(arg => arg.value ?? arg.description).join(' '));
    waiting.get(message.id)?.(message.result); waiting.delete(message.id);
  };
  const send = (method, params = {}) => new Promise(done => { const id = ++next; waiting.set(id, done); socket.send(JSON.stringify({ id, method, params })); });
  await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?selftest` });
  let text = '';
  for (let i = 0; i < 300 && !text.includes('RESULT:'); i++) {
    await wait(200);
    text = (await send('Runtime.evaluate', { expression: "document.querySelector('#selftest')?.textContent ?? ''" })).result?.value ?? '';
  }
  if (!text) text = `The self test printed nothing. The page: ${(await send('Runtime.evaluate', { expression: "location.href + ' | ' + document.body.innerText.slice(0, 300)" })).result?.value}`;
  console.log(text);
  if (logs.length) console.log(`\nErrors in the page:\n${[...new Set(logs)].join('\n')}`);
  stop(text.includes('RESULT: PASSED') ? 0 : 1);
} catch (error) { console.error(error.message); stop(1); }
