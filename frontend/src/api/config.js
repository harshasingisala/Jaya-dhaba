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

export const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_URL || '');
export const USE_DEV_CUSTOMER_FALLBACKS =
  import.meta.env.DEV &&
  API_BASE_URL &&
  ['localhost', '127.0.0.1', '::1'].includes(new URL(API_BASE_URL).hostname);

export function apiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}
