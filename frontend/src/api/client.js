import api from './index';

export const fetchMenu        = api.getMenu;
export const fetchMenuItems   = api.getMenu;
export const createOrder      = api.createOrder;
export const fetchOrders      = api.getOrders;
export const fetchOrder       = api.getOrder;          // ✅ now real
export const updateOrderStatus = api.updateOrderStatus;
export const createReservation = api.createReservation;
export const fetchStats       = api.getAdminStats;     // ✅ now real
export const trackEvent       = api.trackEvent;        // ✅ now real (fire-and-forget)
export const submitContact    = api.submitContact;
export const fetchContact     = api.getContact;

export default api;
