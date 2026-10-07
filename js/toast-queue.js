/**
 * One toast at a time, for js/ui/achievement-toasts.js. Pure scheduling
 * — the DOM side passes in `show`/`hide` and a `canShow()` gate, and
 * the timers are injectable so tests can drive it with a fake clock.
 *
 * Batching: a toast is a batch of IDs. Everything that arrives while one
 * is still waiting to be shown merges into that same waiting batch, so
 * several unlocks at once (or in a row, while the gate was closed) make
 * one toast, not a pile of them.
 *
 * Nothing shows while `canShow()` is false; call `update()` whenever its
 * answer may have changed. `interrupt()` takes a visible toast down and
 * puts it back at the front of the line (something covered it);
 * `dismiss()` takes it down for good (the player moved on).
 */
export function createToastQueue({ canShow, show, hide, visibleMs, gapMs, timers = globalThis }) {
  let visible = null;
  let waiting = null;
  let timer = null;

  function merge(first, second) {
    return [...new Set([...first, ...second])];
  }

  function pump() {
    if (visible !== null || timer !== null || waiting === null || !canShow()) return;
    visible = waiting;
    waiting = null;
    show(visible);
    timer = timers.setTimeout(expire, visibleMs);
  }

  // A short pause between toasts, so back-to-back ones read as two.
  function takeDown() {
    timers.clearTimeout(timer);
    hide(visible);
    visible = null;
    timer = timers.setTimeout(() => {
      timer = null;
      pump();
    }, gapMs);
  }

  function expire() {
    timer = null;
    takeDown();
  }

  return {
    enqueue(ids) {
      if (ids.length === 0) return;
      waiting = waiting === null ? [...new Set(ids)] : merge(waiting, ids);
      pump();
    },
    update: pump,
    interrupt() {
      if (visible === null) return;
      waiting = waiting === null ? visible : merge(visible, waiting);
      takeDown();
    },
    dismiss() {
      if (visible !== null) takeDown();
    },
    isShowing: () => visible !== null,
  };
}
