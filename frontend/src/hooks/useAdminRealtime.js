import { useEffect } from 'react';
import { connectAdminSocket, disconnectAdminSocket } from '../lib/socket';

function getAdminToken() {
  try {
    const user = JSON.parse(sessionStorage.getItem('user') || 'null');
    return user?.access_token || user?.token || localStorage.getItem('adminToken') || '';
  } catch {
    return localStorage.getItem('adminToken') || '';
  }
}

export function useAdminRealtime(handlers = {}) {
  useEffect(() => {
    const token = getAdminToken();
    if (!token) return undefined;

    const socket = connectAdminSocket(token);

    const bind = (event, fn) => {
      if (fn) socket.on(event, fn);
    };
    const unbind = (event, fn) => {
      if (fn) socket.off(event, fn);
    };
    const onAuthError = () => disconnectAdminSocket();
    const onNewOrder = (data) => {
      handlers.onOrdersUpdate?.({ action: 'new_order', order: data?.order || data });
    };
    const onOrderUpdated = (data) => {
      const order = data?.order || null;
      handlers.onOrdersUpdate?.(order ? {
        action: 'status_changed',
        order_ids: [order.id],
        status: order.status,
        orders: [order],
      } : data);
    };
    const membershipTimer = window.setTimeout(() => {
      if (socket.connected && socket.joined_admin === false) {
        window.dispatchEvent(new CustomEvent('rt:membership', { detail: { joined: false } }));
      }
    }, 3000);

    bind('orders_update', handlers.onOrdersUpdate);
    bind('new_order', onNewOrder);
    bind('order_updated', onOrderUpdated);
    bind('reservations_update', handlers.onReservationsUpdate);
    bind('menu_update', handlers.onMenuUpdate);
    bind('analytics_update', handlers.onAnalyticsUpdate);
    bind('settings_update', handlers.onSettingsUpdate);
    bind('contact_update', handlers.onContactUpdate);
    socket.on('auth_error', onAuthError);

    return () => {
      unbind('orders_update', handlers.onOrdersUpdate);
      unbind('new_order', onNewOrder);
      unbind('order_updated', onOrderUpdated);
      unbind('reservations_update', handlers.onReservationsUpdate);
      unbind('menu_update', handlers.onMenuUpdate);
      unbind('analytics_update', handlers.onAnalyticsUpdate);
      unbind('settings_update', handlers.onSettingsUpdate);
      unbind('contact_update', handlers.onContactUpdate);
      socket.off('auth_error', onAuthError);
      window.clearTimeout(membershipTimer);
    };
  }, [
    handlers.onOrdersUpdate,
    handlers.onReservationsUpdate,
    handlers.onMenuUpdate,
    handlers.onAnalyticsUpdate,
    handlers.onSettingsUpdate,
    handlers.onContactUpdate,
  ]);
}
