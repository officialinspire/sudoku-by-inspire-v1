import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { observe, verify } from './analytics-browser-helpers.mjs';

const root = process.cwd();
const subpath = '/sudoku-by-inspire-v1/';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!pathname.startsWith(subpath)) throw new Error('outside scope');
    const file = path.resolve(root, pathname.slice(subpath.length) || 'index.html');
    if (!file.startsWith(root + path.sep)) throw new Error('outside root');
    const info = await stat(file);
    const headers = { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range) {
      const start = Number(range[1] || 0), end = range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${info.size}`, 'Content-Length': end-start+1 });
      createReadStream(file, { start, end }).pipe(res);
    } else { res.writeHead(200, { ...headers, 'Content-Length': info.size }); createReadStream(file).pipe(res); }
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}${subpath}`;
const browser = await chromium.launch();
try {
  for (const failure of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await observe(context, failure);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
    await page.goto(url);
    await page.locator('#screen-start').click();
    // Exercise the real skip/menu flow without waiting for the whole intro.
    await page.locator('#skip-intro-btn').click();
    await page.locator('#btn-new-game').click();
    await page.locator('#difficulty-dialog input[value="easy"]').check();
    await page.locator('#difficulty-dialog button[value="start"]').click();
    await page.waitForFunction(async () => (await import('./js/game-state.js')).getState().status === 'playing');
    const state = await page.evaluate(async () => (await import('./js/game-state.js')).getState());
    assert.equal(state.difficulty, 'easy');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.keyboard.press('Escape');
    await page.locator('#btn-resume').click();
    // Use real board and number-pad controls; read the generated solution only in QA.
    const fill = async (indices) => {
      for (const index of indices) {
        await page.locator(`#board [data-index="${index}"]`).click();
        await page.locator(`#number-pad [data-digit="${state.solution[index]}"]`).click();
      }
    };
    const empty = state.puzzle.map((digit, i) => digit === 0 ? i : -1).filter(i => i !== -1);
    await fill(empty.slice(0, 2));
    await page.waitForTimeout(600);
    const savedBefore = await page.evaluate(() => localStorage.getItem('inspireSudoku:v1:activeGame'));
    assert.ok(savedBefore, 'autosave exists');
    await page.evaluate(async () => {
      const { loadActiveGame } = await import('./js/active-game-store.js');
      const { restoreGame, resumeGame } = await import('./js/game-state.js');
      restoreGame(loadActiveGame()); resumeGame();
    });
    await fill(empty.slice(2));
    await page.waitForFunction(() => document.querySelector('#completion-dialog').open);
    assert.equal(await page.evaluate(() => localStorage.getItem('inspireSudoku:v1:activeGame')), null);
    await verify(page, 'sudoku-by-inspire-v1', true, !failure);
    // Installed app reloads and starts a new puzzle with all modules offline.
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('#screen-start');
    assert.equal(await page.evaluate(async () => { const state = await import('./js/game-state.js'); return state.getState().status; }), 'idle');
    const media = await page.evaluate(async () => {
      const response = await fetch('./Logic Flow.mp3', { headers: { Range: 'bytes=0-1023' } });
      return { status: response.status, bytes: (await response.arrayBuffer()).byteLength };
    });
    assert.deepEqual(media, { status: 206, bytes: 1024 });
    assert.deepEqual(errors, []);
    console.log(`PASS Sudoku gameplay/mobile/save/restore/achievements/offline/audio range with analytics ${failure ? 'rejected' : 'available'}`);
    await context.close();
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
