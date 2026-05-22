import { io } from 'socket.io-client';
import { API_BASE_URL } from '../api/config';

const SOCKET_URL = String(import.meta.env.VITE_SOCKET_URL || API_BASE_URL || '').replace(/\/+$/, '');
let socketInstance = null;

export function getSocket() {
  if (!SOCKET_URL) {
    throw new Error('VITE_SOCKET_URL or VITE_API_URL is required for admin realtime.');
  }
  if (!socketInstance) {
    socketInstance = io(SOCKET_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      transports: ['polling', 'websocket'],
    });
    socketInstance.joined_admin = false;
    socketInstance.on('admin_joined', () => {
      socketInstance.joined_admin = true;
      window.dispatchEvent(new CustomEvent('rt:membership', { detail: { joined: true } }));
    });
    socketInstance.on('admin_join_failed', () => {
      socketInstance.joined_admin = false;
      window.dispatchEvent(new CustomEvent('rt:membership', { detail: { joined: false } }));
    });
    socketInstance.on('disconnect', () => {
      socketInstance.joined_admin = false;
      window.dispatchEvent(new CustomEvent('rt:membership', { detail: { joined: false } }));
    });
  }
  return socketInstance;
}

export function connectAdminSocket(token) {
  const socket = getSocket();
  socket.joined_admin = false;
  const join = () => socket.emit('join_admin', { token });
  if (socket.connected) {
    join();
  } else {
    socket.connect();
    socket.once('connect', join);
  }
  return socket;
}

export function disconnectAdminSocket() {
  if (socketInstance?.connected) {
    socketInstance.disconnect();
  }
}
