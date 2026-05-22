import { useEffect, useState } from 'react';
import { getSocket } from '../../lib/socket';

export function RTStatus() {
  const [status, setStatus] = useState('connecting');

  useEffect(() => {
    const socket = getSocket();
    const onConnect = () => setStatus('connected');
    const onDisconnect = () => setStatus(navigator.onLine ? 'polling' : 'offline');
    const onJoined = () => setStatus('connected');
    const onJoinFailed = () => setStatus(navigator.onLine ? 'polling' : 'offline');
    const onOnline = () => setStatus(socket.connected ? 'connected' : 'polling');
    const onOffline = () => setStatus('offline');

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('admin_joined', onJoined);
    socket.on('admin_join_failed', onJoinFailed);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    setStatus(socket.connected && socket.joined_admin ? 'connected' : navigator.onLine ? 'polling' : 'offline');

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('admin_joined', onJoined);
      socket.off('admin_join_failed', onJoinFailed);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const config = {
    connected: { color: '#16a34a', label: 'Live' },
    polling: { color: '#d97706', label: 'Polling' },
    offline: { color: '#dc2626', label: 'Offline' },
    connecting: { color: '#d97706', label: 'Connecting' },
  }[status];

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.35rem',
      color: config.color,
      fontSize: '0.75rem',
      fontWeight: 700,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '999px', background: config.color }} />
      {config.label}
    </span>
  );
}
