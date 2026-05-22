import { useEffect, useRef } from 'react';
import { getSocket } from '../lib/socket';

export function usePollingFallback(fetchFn, intervalMs = 5000) {
  const timer = useRef(null);
  const fetchRef = useRef(fetchFn);
  fetchRef.current = fetchFn;

  useEffect(() => {
    const socket = getSocket();
    const stop = () => {
      window.clearInterval(timer.current);
      timer.current = null;
    };
    const start = () => {
      if (timer.current) return;
      fetchRef.current();
      timer.current = window.setInterval(() => fetchRef.current(), intervalMs);
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
    window.addEventListener('rt:membership', evaluateMembership);

    return () => {
      stop();
      socket.off('connect', onConnect);
      socket.off('admin_joined', stop);
      socket.off('admin_join_failed', start);
      socket.off('disconnect', start);
      window.removeEventListener('rt:membership', evaluateMembership);
    };
  }, [intervalMs]);
}
