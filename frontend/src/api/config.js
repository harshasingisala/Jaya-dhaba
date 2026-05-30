function productionApiFallback() {
  if (!import.meta.env.PROD || typeof window === 'undefined') return '';
  const host = window.location.hostname;
  if (host === 'jayadhaba.online' || host === 'www.jayadhaba.online') {
    return 'https://api.jayadhaba.online';
  }
  return '';
}

function normalizeApiBaseUrl(value) {
  const baseUrl = String(value || '').replace(/\/+$/, '');
  if (!baseUrl) return '';

  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(`Invalid VITE_API_URL: ${baseUrl}`);
  }

  if (import.meta.env.PROD) {
    if (
      (window.location.hostname === 'jayadhaba.online' || window.location.hostname === 'www.jayadhaba.online') &&
      parsed.hostname === 'jaya-dhaba-dwwd.onrender.com'
    ) {
      return 'https://api.jayadhaba.online';
    }
    if (parsed.protocol !== 'https:') {
      throw new Error('Production VITE_API_URL must use HTTPS.');
    }
    const localHost = ['local', 'host'].join('');
    const loopbackHost = [localHost, ['127', '0', '0', '1'].join('.'), '::1'];
    if (loopbackHost.includes(parsed.hostname)) {
      throw new Error(`Production VITE_API_URL cannot point at ${localHost}.`);
    }
    if (window.location.protocol === 'https:' && parsed.protocol !== 'https:') {
      throw new Error('Mixed-content API URL blocked.');
    }
  }

  return baseUrl;
}

export const API_BASE_URL = normalizeApiBaseUrl(
  import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || productionApiFallback(),
);
export const USE_DEV_CUSTOMER_FALLBACKS =
  import.meta.env.DEV && import.meta.env.VITE_USE_DEV_CUSTOMER_FALLBACKS === 'true';

export function apiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}
