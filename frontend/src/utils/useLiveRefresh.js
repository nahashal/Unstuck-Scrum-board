import { useEffect, useRef } from 'react';

// Keeps a page in step with changes other people make: calls `refresh` every `interval` ms while the
// browser tab is visible, and right away when the user returns to the tab. Skipped while `paused`
// (e.g. during a save) so a background refresh never races the user's own change.
// `refresh` should update state quietly — no loading spinner, no error banner.
export default function useLiveRefresh(refresh, { interval = 15000, paused = false } = {}) {
  const refreshRef = useRef(refresh);
  const pausedRef = useRef(paused);
  refreshRef.current = refresh;
  pausedRef.current = paused;

  useEffect(() => {
    const tick = () => {
      if (pausedRef.current || document.visibilityState !== 'visible') return;
      Promise.resolve(refreshRef.current()).catch(() => { /* next tick tries again */ });
    };
    const timer = setInterval(tick, interval);
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', tick);
    };
  }, [interval]);
}
