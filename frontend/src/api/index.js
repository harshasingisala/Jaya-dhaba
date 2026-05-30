
import { API_BASE_URL, USE_DEV_CUSTOMER_FALLBACKS } from './config.js';
import { supabase } from '../supabaseClient.js';
import { pickFields } from '../utils/sanitize.js';
import { fetchWithRetry } from '../utils/retry.js';
import { clearAuthSession, getAccessToken, setAuthSession } from '../utils/authSession.js';

const BASE_URL = API_BASE_URL;
const SESSION_KEY = 'user';
let redirectingToLogin = false;
const pendingRequests = new Map();

const DEV_MENU_ITEMS = [
  {
    id: 'dev-biryani',
    name: 'Heritage Chicken Biryani',
    category: 'Biryani',
    description: 'Aromatic long-grain rice layered with slow-cooked chicken and house spices.',
    price_half: 180,
    price_full: 320,
    price: 320,
    img: '/chicken.png',
    available: true,
    dietary_tags: ['Halal'],
    spice_level: 3,
  },
  {
    id: 'dev-paneer',
    name: 'Paneer Butter Masala',
    category: 'Curries',
    description: 'Soft paneer simmered in a rich tomato and cashew gravy.',
    price_half: 160,
    price_full: 280,
    price: 280,
    img: '/paneer.png',
    available: true,
    dietary_tags: ['Veg'],
    spice_level: 2,
  },
  {
    id: 'dev-naan',
    name: 'Garlic Butter Naan',
    category: 'Breads',
    description: 'Tandoor-baked naan brushed with garlic butter.',
    price_full: 70,
    price: 70,
    img: '/naan.png',
    available: true,
    dietary_tags: ['Veg'],
    spice_level: 1,
  },
  {
    id: 'dev-lassi',
    name: 'Royal Sweet Lassi',
    category: 'Beverages',
    description: 'Chilled yogurt drink with a smooth, classic finish.',
    price_full: 90,
    price: 90,
    img: '/lassi.png',
    available: true,
    dietary_tags: ['Veg'],
    spice_level: 1,
  },
];

const dedupedFetch = async (url, options = {}) => {
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET') return fetchWithRetry(url, options);

  const key = `${method}:${url}`;
  if (pendingRequests.has(key)) {
    return (await pendingRequests.get(key)).clone();
  }

  const promise = fetchWithRetry(url, options).finally(() => pendingRequests.delete(key));
  pendingRequests.set(key, promise);
  return (await promise).clone();
};

const API_TO_UI_STATUS = {
  pending: 'Placed',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  served: 'Enjoying',
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
  return getAccessToken();
}

const getToken = getAuthToken;

class ApiRequestError extends Error {
  constructor(message, { status, payload, url } = {}) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.payload = payload;
    this.url = url;
  }
}

function logDevWarning(message, err) {
  if (import.meta.env.DEV) {
    console.warn(message, err);
  }
}

function handleExpiredSession() {
  if (redirectingToLogin) return;
  if (window.location.pathname.startsWith('/admin/login')) return;
  if (!sessionStorage.getItem(SESSION_KEY)) return;

  redirectingToLogin = true;
  clearAuthSession();
  window.location.href = '/admin/login';
}

export function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return (payload.exp - 10) * 1000 < Date.now();
  } catch (err) {
    logDevWarning('Unable to read admin session token.', err);
    return false;
  }
}

async function ensureCsrfToken(forceRefresh = false) {
  const existing = getCsrfToken();
  if (existing && !forceRefresh) return existing;
  const res = await dedupedFetch(`${BASE_URL}/api/csrf-token`, {
    method: 'GET',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Unable to prepare secure request.');
  const data = await res.json();
  return data?.data?.csrfToken || data?.csrfToken || getCsrfToken();
}

export async function refreshSession() {
  const csrfToken = await ensureCsrfToken(true);
  const res = await fetchWithRetry(`${BASE_URL}/api/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
    },
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    clearAuthSession();
    return null;
  }
  const data = payload?.data || payload;
  if (!data?.user || !data?.access_token) return null;
  return {
    user: setAuthSession(data.user, data.access_token),
    accessToken: data.access_token,
  };
}

export async function request(path, options = {}) {
  const { rawResponse = false, ...fetchOptions } = options;
  const method = (fetchOptions.method || 'GET').toUpperCase();
  const headers = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers || {}),
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

  const url = `${BASE_URL}${path}`;
  const makeFetch = async () => {
    const response = await dedupedFetch(url, {
      ...fetchOptions,
      method,
      credentials: 'include',
      headers,
    });
    return response;
  };
  let res = await makeFetch();
  const payload = await res.json().catch((err) => {
    logDevWarning('Unable to parse API response JSON.', err);
    return {};
  });
  if (
    res.status === 403 &&
    method !== 'GET' &&
    String(payload.message || '').toLowerCase().includes('csrf')
  ) {
    headers['X-CSRF-Token'] = await ensureCsrfToken(true);
    res = await makeFetch();
    const retryPayload = await res.json().catch((err) => {
      logDevWarning('Unable to parse retried API response JSON.', err);
      return {};
    });
    if (!res.ok) {
      throw new ApiRequestError(
        retryPayload.msg || retryPayload.message || retryPayload.error || `Request failed (${res.status})`,
        { status: res.status, payload: retryPayload, url },
      );
    }
    if (rawResponse) return retryPayload;
    return retryPayload?.data ?? retryPayload;
  }
  if (res.status === 401 || res.status === 422) {
    handleExpiredSession();
  }
  if (!res.ok) {
    throw new ApiRequestError(
      payload.msg || payload.message || payload.error || `Request failed (${res.status})`,
      { status: res.status, payload, url },
    );
  }
  if (rawResponse) return payload;
  return payload?.data ?? payload;
}

async function blobRequest(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = {
    ...(options.headers || {}),
  };
  const token = getAuthToken();
  if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !headers['X-CSRF-Token']) {
    headers['X-CSRF-Token'] = await ensureCsrfToken();
  }
  const res = await fetchWithRetry(`${BASE_URL}${path}`, {
    ...options,
    method,
    credentials: 'include',
    headers,
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new ApiRequestError(payload.message || payload.error || `Request failed (${res.status})`, {
      status: res.status,
      payload,
      url: `${BASE_URL}${path}`,
    });
  }
  return res.blob();
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

async function resolveCategoryId(categoryValue) {
  const categoryText = String(categoryValue || '').trim();
  if (!categoryText) return '';
  const menuPayload = await request('/api/menu');
  const categories = Array.isArray(menuPayload?.categories) ? menuPayload.categories : [];
  const match = categories.find((category) =>
    String(category.id) === categoryText ||
    String(category.name || '').toLowerCase() === categoryText.toLowerCase()
  );
  if (!match?.id) {
    throw new Error(`Category "${categoryText}" was not found. Use an existing menu category.`);
  }
  return match.id;
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
    table: order.table_label || order.table || order.table_number || order.table_id || 'Guest',
    table_label: order.table_label || order.table || order.table_number || '',
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

function normalizeReservation(reservation) {
  if (!reservation) return reservation;
  const rawStatus = String(reservation.status || 'confirmed').toLowerCase();
  const statusMap = {
    confirmed: 'Confirmed',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  const reservedAt = reservation.reserved_at || reservation.time || '';
  return {
    ...reservation,
    name: reservation.name || reservation.guest_name || 'Guest',
    tableNo: reservation.tableNo || reservation.table_id || 'TBD',
    time: reservedAt ? new Date(reservedAt).toLocaleString('en-IN') : '',
    guests: reservation.guests || reservation.party_size,
    partySize: reservation.partySize || reservation.party_size,
    status: statusMap[rawStatus] || 'New',
  };
}

function normalizeReservationPayload(payload = {}) {
  const date = String(payload.date || '').trim();
  const time = String(payload.time || '19:00').trim();
  const reservedAt = payload.reserved_at || (date ? `${date}T${time || '19:00'}:00+05:30` : '');
  const partySize = parseInt(payload.party_size ?? payload.guests ?? payload.partySize ?? 1, 10);

  return {
    table_id: payload.table_id || null,
    party_size: Number.isFinite(partySize) ? partySize : 1,
    reserved_at: reservedAt,
    duration_minutes: parseInt(payload.duration_minutes ?? 90, 10) || 90,
    guest_name: String(payload.guest_name ?? payload.name ?? '').trim(),
    guest_phone: String(payload.guest_phone ?? payload.phone ?? '').trim(),
    notes: String(payload.notes ?? payload.note ?? '').trim(),
  };
}

const api = {
  request,
  refreshSession,

  getMenu: async (tableParam = '') => {
    if (USE_DEV_CUSTOMER_FALLBACKS && !tableParam) return DEV_MENU_ITEMS.map(normalizeMenuItem);
    const query = tableParam ? `?table=${encodeURIComponent(tableParam)}` : '';
    let data;
    try {
      data = await request(`/api/menu${query}`);
    } catch (err) {
      if (!tableParam) return DEV_MENU_ITEMS.map(normalizeMenuItem);
      throw err;
    }
    if (tableParam) {
      return {
        ...data,
        table: data.table || null,
        categories: Array.isArray(data.categories) ? data.categories : [],
        items: Array.isArray(data.items) ? data.items.map(normalizeMenuItem) : [],
      };
    }
    if (data.items && Array.isArray(data.items)) return data.items.map(normalizeMenuItem);
    return [];
  },

  verifyQrToken: async (token) => {
    const data = await request('/api/qr/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    return data?.data || data;
  },

  getTableSessionMenu: async (tableSession) => {
    const data = await request(`/api/menu?table_session=${encodeURIComponent(tableSession)}`);
    return {
      ...data,
      table: data.table || null,
      categories: Array.isArray(data.categories) ? data.categories : [],
      items: Array.isArray(data.items) ? data.items.map(normalizeMenuItem) : [],
    };
  },

  resolveTable: async (tableNumber) => {
    const data = await request(`/api/tables/resolve?table=${encodeURIComponent(tableNumber)}`);
    return data.table || data;
  },

  placeOrder: async (payload) => {
    return api.createOrder(payload);
  },

  getAdminMenu: async () => {
    const data = await request('/api/admin/menu');
    if (data.items && Array.isArray(data.items)) return data.items.map(normalizeMenuItem);
    return [];
  },

  addMenuItem: async (...args) => {
    const item = args.length > 1 ? args[1] : args[0];
    const categoryId = item.category_id || await resolveCategoryId(item.category);
    const payload = {
      category_id: categoryId,
      name: item.name,
      price: parseInt(item.price_full ?? item.price ?? 0, 10),
      description: item.description || '',
      available: item.is_available ?? item.available ?? true,
    };
    const data = await request('/api/admin/menu', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const created = data?.item || data;
    if (created?.id) {
      const menu = await api.getAdminMenu();
      return normalizeMenuItem(menu.find((menuItem) => String(menuItem.id) === String(created.id)) || created);
    }
    return normalizeMenuItem(created);
  },

  updateMenuItem: async (itemId, updates) => {
    const payload = pickFields(updates, [
      'category',
      'category_id',
      'name',
      'description',
      'price',
      'price_full',
      'image_url',
      'dietary_tags',
      'available',
      'is_available',
      'chef_note',
      'ingredients',
      'spice_level',
      'calories',
      'protein_g',
      'carbs_g',
      'fat_g',
      'model_url',
    ]);
    if (payload.category && payload.category_id === undefined) {
      payload.category_id = await resolveCategoryId(payload.category);
      delete payload.category;
    }
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
    const updated = data?.item || data;
    if (!updated?.id) {
      const menu = await api.getAdminMenu();
      return normalizeMenuItem(menu.find((item) => String(item.id) === String(itemId)) || { id: itemId, ...updates });
    }
    return normalizeMenuItem(updated);
  },

  deleteMenuItem: async (itemId) => {
    await request(`/api/admin/menu/${itemId}`, { method: 'DELETE' });
    return true;
  },

  toggleMenuAvailability: async (itemId, available) => {
    const data = await request(`/api/admin/menu/${itemId}/availability`, {
      method: 'PATCH',
      body: JSON.stringify({ available: !!available }),
    });
    if (data?.item) return normalizeMenuItem(data.item);
    return { id: itemId, available: !!available, is_available: !!available };
  },

  getOrders: async () => {
    const data = await request('/api/admin/orders');
    return (Array.isArray(data) ? data : []).map(normalizeOrder);
  },

  getAdminOrders: async () => {
    return api.getOrders();
  },

  getOrderStats: async () => {
    return request('/api/admin/orders/stats');
  },

  getAdminTables: async () => {
    const data = await request('/api/admin/tables');
    return Array.isArray(data) ? data : data.tables || [];
  },

  bulkCreateTables: async (count, capacity = 4) => {
    const data = await request('/api/admin/tables/bulk', {
      method: 'POST',
      body: JSON.stringify({ count: Number(count), capacity: Number(capacity) }),
    });
    return Array.isArray(data) ? data : data.tables || [];
  },

  getTableQRCode: async (tableId) => {
    return blobRequest(`/api/admin/tables/${tableId}/qr-code`, { method: 'GET' });
  },

  downloadAllQRs: async () => {
    return blobRequest('/api/admin/tables/qr-codes', { method: 'POST' });
  },

  clearTable: async (tableId) => {
    return request(`/api/admin/tables/${tableId}/clear`, { method: 'PATCH' });
  },

  updateTable: async (tableId, updates) => {
    const data = await request(`/api/admin/tables/${tableId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    return data.table || data;
  },

  getOrderArchive: async (date = '') => {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    const data = await request(`/api/admin/orders/archive${query}`);
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
    // Cash/manual orders still use the existing DB-first order path; Razorpay orders use createPaymentOrder + verifyPayment.
    const cleanItems = (orderPayload.items || []).map(sanitizeOrderItem);
    const payload = {
      guest_name: normalizeCustomerName(orderPayload.customer_name ?? orderPayload.guest_name ?? orderPayload.name),
      guest_phone: String(orderPayload.guest_phone ?? orderPayload.phone ?? '').trim(),
      order_type: orderPayload.order_type ?? (orderPayload.table_number === 'Parcel' ? 'pickup' : 'dine_in'),
      source: orderPayload.source || 'customer',
      payment_method: orderPayload.payment_method || '',
      items: cleanItems,
    };
    if (orderPayload.table_id) payload.table_id = orderPayload.table_id;
    if (orderPayload.table_token) payload.table_token = orderPayload.table_token;
    if (orderPayload.table_session) payload.table_session = orderPayload.table_session;
    const idempotencyKey = orderPayload.idempotency_key || crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const data = await request('/api/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ ...payload, idempotency_key: idempotencyKey }),
    });
    return normalizeOrder(data);
  },

  createPaymentOrder: async (orderPayload) => {
    const idempotencyKey = orderPayload.idempotency_key || crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const cleanItems = (orderPayload.items || []).map(sanitizeOrderItem);
    const intentPayload = {
      guest_name: normalizeCustomerName(orderPayload.customer_name ?? orderPayload.guest_name ?? orderPayload.name),
      guest_phone: String(orderPayload.guest_phone ?? orderPayload.phone ?? '').trim(),
      order_type: orderPayload.order_type ?? (orderPayload.table_number === 'Parcel' ? 'pickup' : 'dine_in'),
      source: orderPayload.source || 'customer',
      payment_method: 'razorpay',
      items: cleanItems,
      idempotency_key: idempotencyKey,
    };
    if (orderPayload.table_id) intentPayload.table_id = orderPayload.table_id;
    if (orderPayload.table_token) intentPayload.table_token = orderPayload.table_token;
    if (orderPayload.table_session) intentPayload.table_session = orderPayload.table_session;
    const intent = await request('/api/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': intentPayload.idempotency_key },
      body: JSON.stringify(intentPayload),
    });
    return request('/api/payments/create-order', {
      method: 'POST',
      body: JSON.stringify({
        pending_intent: intent.pending_intent,
        customer_name: intentPayload.guest_name,
      }),
    });
  },

  verifyPayment: async (payload) => {
    return request('/api/payments/verify', {
      method: 'POST',
      rawResponse: true,
      body: JSON.stringify(payload),
    });
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
    return request('/api/admin/orders/bulk-status', {
      method: 'PATCH',
      body: JSON.stringify({
        order_ids: orderIds,
        status: UI_TO_API_STATUS[status] || status,
      }),
    });
  },

  bulkArchiveOrders: async (orderIds) => {
    return request('/api/admin/orders/bulk-archive', {
      method: 'PATCH',
      body: JSON.stringify({ order_ids: orderIds }),
    });
  },

  clearServedOrders: async () => {
    return request('/api/admin/orders/clear-served', { method: 'PATCH' });
  },

  archiveAllOrders: async () => {
    return request('/api/admin/orders/archive-all', { method: 'PATCH' });
  },

  submitOrderFeedback: async ({ orderNumber, rating, comment = '' }) => {
    return request('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({
        order_id: Number(orderNumber),
        rating: Number(rating),
        comment,
      }),
    });
  },

  getAdminStats: async () => {
    const stats = await request('/api/admin/stats');
    return {
      ...stats,
      revenue: Number(stats.revenue || 0),
      orders: Number(stats.orders || stats.total_orders || 0),
    };
  },

  getStats: async () => {
    return api.getAdminStats();
  },

  getRevenue: async (opts = {}) => {
    const params = new URLSearchParams();
    if (opts.from_date) params.append('from_date', opts.from_date);
    if (opts.to_date) params.append('to_date', opts.to_date);
    const query = params.toString();
    return request(`/api/admin/revenue${query ? `?${query}` : ''}`);
  },

  exportAnalytics: async () => {
    return request('/api/admin/analytics/export');
  },

  getDailyReport: async (date) => {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    return request(`/api/admin/daily-report${query}`);
  },

  flushStats: async () => {
    return request('/api/admin/flush', { method: 'POST' });
  },

  getSettings: async () => {
    return request('/api/admin/settings');
  },

  updateSettings: async (...args) => {
    const updates = args.length > 1 ? args[1] : args[0];
    const payload = pickFields(updates, [
      'name',
      'tagline',
      'hours',
      'contact',
      'status',
      'address',
      'taxRate',
      'currency',
      'upi_id',
      'upi',
    ]);
    return request('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  getContact: async () => {
    if (USE_DEV_CUSTOMER_FALLBACKS) {
      return {
        phone: '07386185821',
        address: 'East Marredpally, Secunderabad',
        hours: '11 AM - 11 PM',
      };
    }
    return request('/api/contact');
  },

  getContactSubmissions: async () => {
    const token = getToken();
    const url = `${BASE_URL}/api/admin/contact-submissions`;
    const res = await dedupedFetch(url, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiRequestError(payload.message || payload.error || `Request failed (${res.status})`, {
        status: res.status,
        payload,
        url
      });
    }
    return payload;
  },

  markSubmissionRead: async (id) => {
    const token = getToken();
    const url = `${BASE_URL}/api/admin/contact-submissions/${id}/read`;
    const res = await fetchWithRetry(url, {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiRequestError(payload.message || payload.error || `Request failed (${res.status})`, {
        status: res.status,
        payload,
        url
      });
    }
    return payload;
  },

  deleteSubmission: async (id) => {
    const token = getToken();
    const url = `${BASE_URL}/api/admin/contact-submissions/${id}`;
    const res = await fetchWithRetry(url, {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiRequestError(payload.message || payload.error || `Request failed (${res.status})`, {
        status: res.status,
        payload,
        url
      });
    }
    return payload;
  },

  createReservation: async (payload) => {
    const idempotencyKey = payload.idempotency_key || crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    return request('/api/reservations', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(normalizeReservationPayload(payload)),
    });
  },

  getReservations: async () => {
    const data = await request('/api/admin/reservations');
    const reservations = Array.isArray(data) ? data : data?.reservations || [];
    return reservations.map(normalizeReservation);
  },

  updateReservation: async (id, status) => {
    const statusMap = {
      New: 'confirmed',
      Confirmed: 'confirmed',
      Completed: 'completed',
      Cancelled: 'cancelled',
    };
    const data = await request(`/api/admin/reservations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: statusMap[status] || String(status).toLowerCase() }),
    });
    return normalizeReservation(data);
  },

  deleteReservation: async (id) => {
    return request(`/api/admin/reservations/${id}`, { method: 'DELETE' });
  },

  getOrderPauseStatus: async () => {
    if (USE_DEV_CUSTOMER_FALLBACKS) return { paused: false };
    return request('/api/orders/status');
  },

  getAdminOrderPauseStatus: async () => {
    return request('/api/admin/pause-orders');
  },

  setOrderPauseStatus: async (paused) => {
    return request('/api/admin/pause-orders', {
      method: 'POST',
      body: JSON.stringify({ paused }),
    });
  },

  submitContact: async (payload) => {
    if (USE_DEV_CUSTOMER_FALLBACKS) {
      return { success: true, data: { ...payload, offlinePreview: true } };
    }
    const csrfToken = await ensureCsrfToken();
    const idempotencyKey = payload.idempotency_key || crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const res = await fetchWithRetry(`${BASE_URL}/api/contact`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
        ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
      },
      body: JSON.stringify(payload),
    });
    const responsePayload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiRequestError(
        responsePayload.msg || responsePayload.message || responsePayload.error || 'Contact submission failed',
        { status: res.status, payload: responsePayload, url: `${BASE_URL}/api/contact` },
      );
    }
    return responsePayload;
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
