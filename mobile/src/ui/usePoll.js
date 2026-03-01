import React from 'react';

export function usePoll(fn, { enabled = true, intervalMs = 4000 } = {}) {
  const fnRef = React.useRef(fn);
  fnRef.current = fn;

  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer = null;

    async function tick() {
      try {
        await fnRef.current();
      } catch {
        // ignore polling errors
      }
      if (cancelled) return;
      timer = setTimeout(tick, intervalMs);
    }

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, intervalMs]);
}
