import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initGameAnalytics } from './game-analytics.js';
import { initGamePersistence } from './game-persistence.js';
import { startGame, selectCell, applyNumberInput, pauseGame, resumeGame, resetToIdle, getState } from './game-state.js';

test('existing puzzle transitions produce deduplicated anonymous events without changing play or saves', async () => {
  const fetchBefore = globalThis.fetch;
  const windowBefore = globalThis.window;
  const storageBefore = globalThis.localStorage;
  const requests = [];
  const storage = new Map();
  globalThis.window = { addEventListener() {} };
  globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
  globalThis.fetch = (_, options) => { requests.push(JSON.parse(options.body)); return Promise.reject(new Error('offline analytics')); };
  try {
    initGameAnalytics();
    initGameAnalytics();
    initGamePersistence();
    const solution = Array.from({ length: 81 }, (_, i) => (Math.floor(i / 9) * 3 + Math.floor(Math.floor(i / 9) / 3) + i % 9) % 9 + 1);
    const puzzle = solution.map((digit, i) => i < 9 ? 0 : digit);
    const result = { puzzle, solution, status: 'generated', attempts: 1, elapsedMs: 1, clueCount: 72 };
    startGame(result, 'easy', { autoStartTimer: false, runId: 'qa-run-000001' });
    pauseGame(); resumeGame();
    for (let i = 0; i < 9; i++) { selectCell(i); applyNumberInput(solution[i]); }
    assert.equal(getState().status, 'complete');
    assert.equal(storage.has('inspireSudoku:v1:activeGame'), false);
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(requests.filter(e => e.event === 'game_opened').length, 1);
    assert.equal(requests.filter(e => e.event === 'game_started').length, 1);
    assert.deepEqual(requests.filter(e => e.event === 'game_progress').map(e => e.properties.progress_percent), [25, 50, 75]);
    assert.equal(requests.filter(e => e.event === 'game_completed').length, 1);
    assert.equal(requests.filter(e => e.event === 'high_score_achieved').length, 1);
    const ids = requests.filter(e => e.event === 'achievement_unlocked').map(e => e.properties.achievement);
    assert.ok(ids.length > 0); assert.equal(new Set(ids).size, ids.length);
    assert.ok(requests.every(e => e.properties.$session_id === e.distinct_id && e.properties.$process_person_profile === false));
    assert.ok(!JSON.stringify(requests).includes('qa-run-000001'), 'persistent run ID stays local');
    // A restored/duplicated run is rejected by the existing completion ledger.
    startGame(result, 'easy', { autoStartTimer: false, runId: 'qa-run-000001' });
    for (let i = 0; i < 9; i++) { selectCell(i); applyNumberInput(solution[i]); }
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(requests.filter(e => e.event === 'game_completed').length, 1);
  } finally {
    resetToIdle();
    globalThis.fetch = fetchBefore; globalThis.window = windowBefore; globalThis.localStorage = storageBefore;
  }
});
