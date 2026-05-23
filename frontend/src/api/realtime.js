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
  let reconnectTimer = null;
  let retryDelay = 2000;

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

  const scheduleReconnect = () => {
    if (closed || reconnectTimer) return;
    const delay = retryDelay;
    retryDelay = Math.min(retryDelay * 2, 30000);
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  const connect = () => {
    if (closed || source) return;
    source = new EventSource(url, { withCredentials });
    source.addEventListener('open', () => {
      retryDelay = 2000;
      onStatus?.('connected');
    });
    source.addEventListener('ping', () => {
      retryDelay = 2000;
      onStatus?.('connected');
    });
    source.addEventListener('connected', () => {
      retryDelay = 2000;
      onStatus?.('connected');
    });
    events.forEach((eventName) => {
      source.addEventListener(eventName, () => requestRefresh(eventName));
    });
    source.onerror = () => {
      onStatus?.('reconnecting');
      requestRefresh('stream-error');
      source?.close();
      source = null;
      scheduleReconnect();
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
      window.clearTimeout(reconnectTimer);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
      source?.close();
      source = null;
    },
  };
}
