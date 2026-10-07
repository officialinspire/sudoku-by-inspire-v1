import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRunId,
  isValidRunId,
  emptyRunCounters,
  isValidRunCounters,
  legacyRunTracking,
  normalizeRunTracking,
  classifyCompletedRun,
} from './run-tracking.js';

const puzzle = [...Array(81)].map((_, i) => i % 10);

describe('createRunId', () => {
  test('uses crypto.randomUUID when available; IDs are valid and distinct', () => {
    const ids = new Set(Array.from({ length: 200 }, () => createRunId()));
    assert.equal(ids.size, 200);
    for (const id of ids) assert.ok(isValidRunId(id), id);
  });

  test('falls back to getRandomValues outside secure contexts (no randomUUID)', () => {
    const id = createRunId({ getRandomValues: (bytes) => bytes.fill(171) });
    assert.equal(id, 'ab'.repeat(16));
    assert.ok(isValidRunId(id));
  });

  test('falls back to time + Math.random with no crypto at all', () => {
    const id = createRunId(undefined);
    assert.ok(isValidRunId(id), id);
    assert.notEqual(createRunId(null), id);
  });
});

describe('validation', () => {
  test('run IDs: 8-64 letters, digits and dashes only', () => {
    for (const bad of [null, 42, '', 'short', 'has space in it', 'x'.repeat(65), '<script>alert(1)</script>']) {
      assert.equal(isValidRunId(bad), false, String(bad));
    }
  });

  test('run counters: every counter a non-negative integer', () => {
    assert.ok(isValidRunCounters(emptyRunCounters()));
    for (const bad of [null, {}, { mistakes: 0, hints: 0, undos: 0 }, { mistakes: -1, hints: 0, undos: 0, notes: 0 }, { mistakes: 0.5, hints: 0, undos: 0, notes: 0 }]) {
      assert.equal(isValidRunCounters(bad), false, JSON.stringify(bad));
    }
  });
});

describe('legacy saves (from before run tracking)', () => {
  test('get a deterministic ID — every load of the same save agrees', () => {
    const save = { puzzle, difficulty: 'easy', mistakes: 2, hintsUsed: 1 };
    const a = legacyRunTracking(save);
    assert.equal(a.runId, legacyRunTracking({ ...save }).runId);
    assert.ok(isValidRunId(a.runId));
    assert.notEqual(a.runId, legacyRunTracking({ ...save, difficulty: 'insane' }).runId);
  });

  test('keep the displayed counts as a floor and are never eligible for perfect/no-hint', () => {
    const tracking = normalizeRunTracking({ puzzle, difficulty: 'easy', mistakes: 0, hintsUsed: 0 });
    assert.deepEqual(tracking.runCounters, { mistakes: 0, hints: 0, undos: 0, notes: 0 });
    assert.equal(tracking.runCountersComplete, false);
    assert.deepEqual(classifyCompletedRun(tracking), { perfect: false, noHint: false, noNotes: false, noUndo: false, heavyNotes: false, comeback: false });
  });

  test('a save that already has valid tracking keeps it as-is', () => {
    const tracked = { puzzle, difficulty: 'easy', runId: 'abcdef12-run', runCounters: { mistakes: 1, hints: 0, undos: 3, notes: 9 }, runCountersComplete: true };
    assert.deepEqual(normalizeRunTracking(tracked), {
      runId: 'abcdef12-run',
      runCounters: { mistakes: 1, hints: 0, undos: 3, notes: 9 },
      runCountersComplete: true,
    });
  });
});

describe('classifyCompletedRun', () => {
  const run = (counters) => ({ runCounters: { ...emptyRunCounters(), ...counters }, runCountersComplete: true });

  test('perfect = no mistakes and no hints; undos and notes don\'t matter', () => {
    assert.deepEqual(classifyCompletedRun(run({ undos: 5, notes: 40 })), { perfect: true, noHint: true, noNotes: false, noUndo: false, heavyNotes: true, comeback: false });
  });

  test('a mistake (even one later undone) ends perfect but not no-hint', () => {
    assert.deepEqual(classifyCompletedRun(run({ mistakes: 1, undos: 1 })), { perfect: false, noHint: true, noNotes: true, noUndo: false, heavyNotes: false, comeback: false });
  });

  test('a hint ends both', () => {
    assert.deepEqual(classifyCompletedRun(run({ hints: 1 })), { perfect: false, noHint: false, noNotes: true, noUndo: true, heavyNotes: false, comeback: false });
  });
});
