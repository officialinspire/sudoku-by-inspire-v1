import { describe, test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createToastQueue } from './toast-queue.js';

const VISIBLE_MS = 1000;
const GAP_MS = 100;

let gate;
let events;
let queue;
beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] });
  gate = { open: true };
  events = [];
  queue = createToastQueue({
    canShow: () => gate.open,
    show: (ids) => events.push(['show', ids]),
    hide: (ids) => events.push(['hide', ids]),
    visibleMs: VISIBLE_MS,
    gapMs: GAP_MS,
    timers: { setTimeout, clearTimeout },
  });
});
afterEach(() => mock.timers.reset());

const shows = () => events.filter(([type]) => type === 'show').map(([, ids]) => ids);

describe('showing', () => {
  test('shows right away when allowed, and takes itself down after its time', () => {
    queue.enqueue(['a']);
    assert.deepEqual(events, [['show', ['a']]]);
    mock.timers.tick(VISIBLE_MS - 1);
    assert.equal(queue.isShowing(), true);
    mock.timers.tick(1);
    assert.deepEqual(events.at(-1), ['hide', ['a']]);
    assert.equal(queue.isShowing(), false);
  });

  test('an empty batch is nothing', () => {
    queue.enqueue([]);
    assert.deepEqual(events, []);
  });

  test('waits while not allowed, and shows once update() finds it allowed', () => {
    gate.open = false;
    queue.enqueue(['a']);
    mock.timers.tick(10_000);
    assert.deepEqual(events, []);
    gate.open = true;
    queue.update();
    assert.deepEqual(shows(), [['a']]);
  });
});

describe('batching and queueing', () => {
  test('everything that arrives while waiting becomes one toast, without repeats', () => {
    gate.open = false;
    queue.enqueue(['a', 'b']);
    queue.enqueue(['b', 'c']);
    gate.open = true;
    queue.update();
    assert.deepEqual(shows(), [['a', 'b', 'c']]);
  });

  test('one at a time: what arrives during a toast shows after it, after a short gap', () => {
    queue.enqueue(['a']);
    queue.enqueue(['b']);
    queue.enqueue(['c']);
    assert.deepEqual(shows(), [['a']]);
    mock.timers.tick(VISIBLE_MS);
    assert.deepEqual(shows(), [['a']], 'not during the gap');
    mock.timers.tick(GAP_MS);
    assert.deepEqual(shows(), [['a'], ['b', 'c']]);
  });

  test('never two at once: every show is followed by its own hide', () => {
    for (let i = 0; i < 20; i++) {
      queue.enqueue([`id-${i}`]);
      if (i % 3 === 0) queue.interrupt();
      if (i % 5 === 0) queue.dismiss();
      mock.timers.tick(i % 2 ? 50 : VISIBLE_MS + GAP_MS);
    }
    mock.timers.tick(100_000);
    const kinds = events.map(([type]) => type);
    for (let i = 0; i < kinds.length; i++) assert.equal(kinds[i], i % 2 === 0 ? 'show' : 'hide', `event ${i}`);
  });
});

describe('interruptions', () => {
  test('interrupt (something covered it): down now, back first in line once allowed again', () => {
    queue.enqueue(['a']);
    queue.enqueue(['b']);
    gate.open = false;
    queue.interrupt();
    assert.deepEqual(events.at(-1), ['hide', ['a']]);
    mock.timers.tick(10_000);
    gate.open = true;
    queue.update();
    assert.deepEqual(shows(), [['a'], ['a', 'b']]);
  });

  test('dismiss (the player moved on): down for good; the next one still comes', () => {
    queue.enqueue(['a']);
    queue.enqueue(['b']);
    queue.dismiss();
    mock.timers.tick(GAP_MS);
    assert.deepEqual(shows(), [['a'], ['b']]);
    mock.timers.tick(10_000);
    assert.deepEqual(shows(), [['a'], ['b']], 'a never comes back');
  });

  test('interrupt or dismiss with nothing showing does nothing', () => {
    queue.interrupt();
    queue.dismiss();
    assert.deepEqual(events, []);
  });
});
