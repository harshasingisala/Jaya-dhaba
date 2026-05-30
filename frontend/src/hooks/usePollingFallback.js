import { useEffect, useRef } from 'react';
import { getSocket } from '../lib/socket';

export function usePollingFallback(fetchFn, intervalMs = 15000) {
  const timer = useRef(null);
  const fetchRef = useRef(fetchFn);
  fetchRef.current = fetchFn;

  useEffect(() => {
    const socket = getSocket();
    const jitter = () => Math.floor(Math.random() * Math.min(5000, Math.max(1000, intervalMs / 3)));
    const getPollingInterval = () => {
      if (document.hidden) return Math.max(60000, intervalMs * 3) + jitter();
      if (document.hasFocus()) return intervalMs + jitter();
      return Math.max(30000, intervalMs * 2) + jitter();
    };
    const stop = () => {
      window.clearInterval(timer.current);
      timer.current = null;
    };
    const start = () => {
      stop();
      window.setTimeout(() => fetchRef.current(), jitter());
      timer.current = window.setInterval(() => fetchRef.current(), getPollingInterval());
    };
    const restart = () => {
      if (timer.current) start();
    };
    const evaluateMembership = () => {
      if (socket.connected && socket.joined_admin === false) {
        start();
      }
    };
    const onConnect = () => {
      window.setTimeout(evaluateMembership, 3000);
    };

    if (socket.connected && socket.joined_admin !== false) {
      stop();
    } else {
      start();
    }

    socket.on('connect', onConnect);
    socket.on('admin_joined', stop);
    socket.on('admin_join_failed', start);
    socket.on('disconnect', start);
    document.addEventListener('visibilitychange', restart);
    window.addEventListener('focus', restart);
    window.addEventListener('blur', restart);
    window.addEventListener('rt:membership', evaluateMembership);

    return () => {
      stop();
      socket.off('connect', onConnect);
      socket.off('admin_joined', stop);
      socket.off('admin_join_failed', start);
      socket.off('disconnect', start);
      document.removeEventListener('visibilitychange', restart);
      window.removeEventListener('focus', restart);
      window.removeEventListener('blur', restart);
      window.removeEventListener('rt:membership', evaluateMembership);
    };
  }, [intervalMs]);
}
