
import { menuItems as fallbackMenu } from '../data/menu.js';
import { API_BASE_URL } from './config.js';
import { supabase } from '../supabaseClient.js';

const BASE_URL = API_BASE_URL;
const SESSION_KEY = 'user';
let redirectingToLogin = false;

const API_TO_UI_STATUS = {
  pending: 'Placed',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  served: 'Served',
  cancelled: 'Cancelled',
};

const UI_TO_API_STATUS = {
  Placed: 'pending',
  Confirmed: 'confirmed',
  Preparing: 'preparing',
  Ready: 'ready',
  Served: 'served',
  Enjoying: 'served',
  Cancelled: 'cancelled',
};

function getCsrfToken() {
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'csrf_token') return decodeURIComponent(value);
  }
  return null;
}

function getAuthToken() {
  try {
    const user = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    return user?.access_token || user?.token || '';
  } catch {
    return '';
  }
}

function handleExpiredSession() {
  if (redirectingToLogin) return;
  if (window.location.pathname.startsWith('/admin/login')) return;
  if (!localStorage.getItem(SESSION_KEY)) return;

  redirectingToLogin = true;
  localStorage.removeItem(SESSION_KEY);
  window.location.href = '/admin/login';
}

function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return (payload.exp - 10) * 1000 < Date.now();
  } catch {
    return false;
  }
}

async function ensureCsrfToken() {
  const existing = getCsrfToken();
  if (existing) return existing;
  const res = await fetch(`${BASE_URL}/api/csrf-token`, {
    method: 'GET',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Unable to prepare secure request.');
  const data = await res.json();
  return data?.data?.csrfToken || data?.csrfToken || getCsrfToken();
}

async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const token = getAuthToken();
  if (token && isTokenExpired(token)) {
    handleExpiredSession();
    throw new Error('Session expired');
  }
  if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !headers['X-CSRF-Token']) {
    headers['X-CSRF-Token'] = await ensureCsrfToken();
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    method,
    credentials: 'include',
    headers,
  });
  const payload = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 422) {
    handleExpiredSession();
  }
  if (!res.ok) {
    throw new Error(payload.msg || payload.message || payload.error || `Request failed (${res.status})`);
  }
  return payload?.data ?? payload;
}

function normalizeMenuItem(item) {
  const price = item.price ?? item.price_full ?? item.price_half ?? 0;
  const isAvailable = item.is_available ?? item.available ?? true;

  return {
    ...item,
    price,
    price_full: item.price_full ?? price,
    available: isAvailable,
    is_available: isAvailable,
    img: item.img || item.image_url || item.image || '/biryani.png',
    desc: item.desc || item.description || '',
  };
}

function normalizeOrder(order) {
  if (!order) return order;
  const rawStatus = String(order.status || 'pending');
  const status = API_TO_UI_STATUS[rawStatus.toLowerCase()] || rawStatus;
  const total = Number(order.total || order.total_amount || 0);
  const subtotal = Number(order.subtotal || 0);
  const tax = Number(order.tax || 0);
  return {
    ...order,
    status,
    customer_name: order.customer_name || order.guest_name || 'Guest',
    customer: order.customer || order.guest_name || 'Guest',
    table: order.table || order.table_number || order.table_id || 'Guest',
    time: order.time || (order.created_at ? new Date(order.created_at).toLocaleString('en-IN') : ''),
    total,
    subtotal,
    tax,
    items: Array.isArray(order.items) ? order.items.map((item) => ({
      ...item,
      price: Number(item.price ?? item.unit_price ?? 0),
    })) : [],
  };
}

function sanitizeOrderItem(item) {
  const rawId = item.id ?? item.menu_item_id;
  const qty = Math.max(1, parseInt(item.qty ?? item.quantity ?? 1, 10) || 1);
  const cleanItem = {
    menu_item_id: String(rawId || ''),
    qty,
    special_note: String(item.instructions ?? item.special_note ?? ''),
  };

  return cleanItem;
}

function normalizeCustomerName(value) {
  return String(value ?? 'Guest').trim().slice(0, 100) || 'Guest';
}

const api = {
  request,

  getMenu: async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/menu`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.items && Array.isArray(data.items)) return data.items.map(normalizeMenuItem);
      }
    } catch (err) {
      console.warn('Flask menu fetch failed:', err);
    }

    if (import.meta.env.DEV) {
      return fallbackMenu.map(normalizeMenuItem);
    }

    throw new Error('Menu service unavailable.');
  },

  addMenuItem: async (...args) => {
    const item = args.length > 1 ? args[1] : args[0];
    const payload = {
      category_id: item.category_id,
      name: item.name,
      price: parseInt(item.price_full ?? item.price ?? 0, 10),
      description: item.description || '',
      available: item.is_available ?? item.available ?? true,
    };
    const data = await request('/api/admin/menu', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return normalizeMenuItem(data?.item || data);
  },

  updateMenuItem: async (itemId, updates) => {
    const payload = { ...updates };
    if (payload.price_full !== undefined && payload.price === undefined) {
      payload.price = parseInt(payload.price_full, 10);
      delete payload.price_full;
    }
    if (payload.is_available !== undefined && payload.available === undefined) {
      payload.available = payload.is_available;
      delete payload.is_available;
    }
    const data = await request(`/api/admin/menu/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return normalizeMenuItem(data?.item || data);
  },

  deleteMenuItem: async (itemId) => {
    await request(`/api/admin/menu/${itemId}`, { method: 'DELETE' });
    return true;
  },

  getOrders: async () => {
    const data = await request('/api/admin/orders');
    return (Array.isArray(data) ? data : []).map(normalizeOrder);
  },

  getOrder: async (id, token = '') => {
    if (!id) throw new Error('Order ID is required');
    const isNumeric = /^\d+$/.test(String(id).trim());
    const suffix = token ? `?token=${encodeURIComponent(token)}` : '';
    const data = await request(isNumeric ? `/api/orders/by-number/${id}${suffix}` : `/api/orders/${id}${suffix}`);
    return normalizeOrder(data);
  },

  createOrder: async (orderPayload) => {
    const cleanItems = (orderPayload.items || []).map(sanitizeOrderItem);
    const payload = {
      guest_name: normalizeCustomerName(orderPayload.customer_name ?? orderPayload.guest_name ?? orderPayload.name),
      guest_phone: String(orderPayload.guest_phone ?? orderPayload.phone ?? '').trim(),
      order_type: orderPayload.order_type ?? (orderPayload.table_number === 'Parcel' ? 'pickup' : 'dine_in'),
      items: cleanItems,
    };
    if (orderPayload.table_id) payload.table_id = orderPayload.table_id;
    if (orderPayload.table_token) payload.table_token = orderPayload.table_token;
    const idempotencyKey = orderPayload.idempotency_key || crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const data = await request('/api/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ ...payload, idempotency_key: idempotencyKey }),
    });
    return normalizeOrder(data);
  },

  updateOrderStatus: async (orderId, status) => {
    const data = await request(`/api/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: UI_TO_API_STATUS[status] || status }),
    });
    return normalizeOrder(data);
  },

  bulkUpdateOrderStatus: async (orderIds, status) => {
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return [];
    }
    const results = await Promise.all(orderIds.map((id) => api.updateOrderStatus(id, status)));
    return results;
  },

  getAdminStats: async () => {
    const stats = await request('/api/admin/stats');
    return {
      ...stats,
      revenue: Number(stats.revenue || 0),
      orders: Number(stats.orders || stats.total_orders || 0),
    };
  },

  getSettings: async () => {
    return request('/api/admin/settings');
  },

  updateSettings: async (...args) => {
    const updates = args.length > 1 ? args[1] : args[0];
    return request('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  createReservation: async (payload) => {
    const idempotencyKey = payload.idempotency_key || crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    return request('/api/reservations', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(payload),
    });
  },

  submitContact: async (payload) => {
    const csrfToken = await ensureCsrfToken();
    const res = await fetch(`${BASE_URL}/api/contact`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Contact submission failed');
    return res.json();
  },

  trackEvent: async (eventName, properties = {}) => {
    if (import.meta.env.DEV) console.debug('[trackEvent skipped]', eventName, properties);
  },

  applyCoupon: async () => {
    throw new Error('Code not recognized by the vault.');
  },

  supabase,
};

export default api;
