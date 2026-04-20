import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000',
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add interceptor to attach JWT token to every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Optional: Add response interceptor to handle 401 Unauthorized
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('API Error:', {
      url: error.config?.url,
      status: error.response?.status,
      message: error.response?.data || error.message
    });
    if (error.response && error.response.status === 401) {
      const authRoutes = ['/api/auth/', '/api/admin/login'];
      const isAuthRoute = authRoutes.some(route => error.config?.url?.includes(route));
      
      if (!isAuthRoute) {
        console.warn(`[API] 401 Unauthorized at ${error.config?.url} - Session invalidated`);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        
        if (!window.location.pathname.includes('/login')) {
          console.info('[API] Redirecting to security gate...');
          window.location.href = '/login';
        }
      } else {
        console.debug('[API] 401 on Auth route - Handled by AuthContext');
      }
    }
    return Promise.reject(error);
  }
);

export default api;
