import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createUpdateFlow } from './sw-register.js';

// Minimal stand-ins for the ServiceWorkerContainer / Registration /
// ServiceWorker objects — just the events and fields the flow reads.
class FakeWorker extends EventTarget {
  constructor(state = 'installing') {
    super();
    this.state = state;
    this.messages = [];
  }
  postMessage(message) {
    this.messages.push(message);
  }
  becomes(state) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

class FakeRegistration extends EventTarget {
  installing = null;
  waiting = null;
  startUpdate(worker) {
    this.installing = worker;
    this.dispatchEvent(new Event('updatefound'));
  }
}

class FakeContainer extends EventTarget {
  controller = null;
  changeController(worker) {
    this.controller = worker;
    this.dispatchEvent(new Event('controllerchange'));
  }
}

function setup({ controlled = true } = {}) {
  const container = new FakeContainer();
  if (controlled) container.controller = new FakeWorker('activated');
  const calls = { banner: 0, reload: 0 };
  const flow = createUpdateFlow(container, {
    showBanner: () => calls.banner++,
    reload: () => calls.reload++,
  });
  return { container, flow, calls, registration: new FakeRegistration() };
}

describe('service-worker update flow', () => {
  test('first install: no banner, and its clients.claim() does not reload the page', () => {
    const { container, flow, calls, registration } = setup({ controlled: false });
    flow.track(registration);
    const worker = new FakeWorker();
    registration.startUpdate(worker);
    worker.becomes('installed');
    container.changeController(worker); // clients.claim() on first activation
    assert.deepEqual(calls, { banner: 0, reload: 0 });
  });

  test('an update that finishes installing shows the banner but does not take over', () => {
    const { flow, calls, registration } = setup();
    flow.track(registration);
    const worker = new FakeWorker();
    registration.startUpdate(worker);
    worker.becomes('installed');
    assert.equal(calls.banner, 1);
    assert.equal(calls.reload, 0);
    assert.deepEqual(worker.messages, []);
  });

  test('an update already installing or waiting when the page registers is still announced', () => {
    const installing = setup();
    installing.registration.installing = new FakeWorker();
    installing.flow.track(installing.registration);
    installing.registration.installing.becomes('installed');
    assert.equal(installing.calls.banner, 1);

    const waiting = setup();
    waiting.registration.waiting = new FakeWorker('installed');
    waiting.flow.track(waiting.registration);
    assert.equal(waiting.calls.banner, 1);
  });

  test('Refresh asks the waiting worker to activate, then reloads exactly once', () => {
    const { container, flow, calls, registration } = setup();
    const waiting = new FakeWorker('installed');
    registration.waiting = waiting;
    flow.track(registration);

    flow.applyUpdate();
    assert.deepEqual(waiting.messages, [{ type: 'SKIP_WAITING' }]);
    assert.equal(calls.reload, 0, 'not before the new worker has actually taken over');

    container.changeController(waiting);
    container.changeController(waiting);
    assert.equal(calls.reload, 1);
  });

  test('Refresh with nothing waiting (another tab already updated) just reloads', () => {
    const { flow, calls, registration } = setup();
    flow.track(registration);
    flow.applyUpdate();
    assert.equal(calls.reload, 1);
  });
});
