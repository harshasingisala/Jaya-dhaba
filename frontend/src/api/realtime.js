const DEFAULT_REFRESH_MS = 1500;

export function createManagedEventSource(url, options = {}) {
  const {
    events = [],
    onRefresh,
    onStatus,
    minRefreshMs = DEFAULT_REFRESH_MS,
    withCredentials = true,
  } = options;

  let source = null;
  let closed = false;
  let lastRefreshAt = 0;
  let refreshTimer = null;

  const requestRefresh = (reason) => {
    if (!onRefresh || closed) return;
    const now = Date.now();
    const delay = Math.max(0, minRefreshMs - (now - lastRefreshAt));
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      if (closed) return;
      lastRefreshAt = Date.now();
      onRefresh(reason);
    }, delay);
  };

  const connect = () => {
    if (closed || source) return;
    source = new EventSource(url, { withCredentials });
    source.addEventListener('open', () => onStatus?.('connected'));
    source.addEventListener('ping', () => onStatus?.('connected'));
    source.addEventListener('connected', () => onStatus?.('connected'));
    events.forEach((eventName) => {
      source.addEventListener(eventName, () => requestRefresh(eventName));
    });
    source.onerror = () => {
      onStatus?.('reconnecting');
      requestRefresh('stream-error');
    };
  };

  const handleOnline = () => {
    requestRefresh('online');
    if (source?.readyState === EventSource.CLOSED) {
      source.close();
      source = null;
      connect();
    }
  };

  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      requestRefresh('visible');
    }
  };

  window.addEventListener('online', handleOnline);
  document.addEventListener('visibilitychange', handleVisibility);
  connect();

  return {
    close() {
      closed = true;
      window.clearTimeout(refreshTimer);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
      source?.close();
      source = null;
    },
  };
}
