import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { languageMap } from "../data/menu";
import { trackEvent } from "../api/client";
import api from "../api/client";

const AppContext = createContext(null);
const TABLE_CONTEXT_KEY = "jd_table_context";

const load = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (Array.isArray(fallback) && !Array.isArray(parsed)) return fallback;
    return parsed ?? fallback;
  } catch (err) {
    console.error('Failed to load saved cart:', err);
    localStorage.removeItem(key);
    return fallback;
  }
};

const loadSession = (key, fallback) => {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    sessionStorage.removeItem(key);
    return fallback;
  }
};

export function AppProvider({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [restaurantId] = useState(params.get("restaurant") || "jaya-dhaba");

  const [cart, setCart] = useState(() => load("jd_cart", []));
  const [cartOpen, setCartOpen] = useState(false);
  const [favorites, setFavorites] = useState(() => load("jd_favorites", []));
  const [orders, setOrders] = useState(() => load("jd_orders", []));
  const [language, setLanguage] = useState(() => localStorage.getItem("jd_lang") || "en");
  const [theme, setTheme] = useState(() => localStorage.getItem("jd_theme") || "ember");
  const [botOpen, setBotOpen] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [points, setPoints] = useState(() => Number(localStorage.getItem("jd_points") || 0));
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [syncQueue, setSyncQueue] = useState(() => load("jd_sync_queue", []));
  const [menuItems, setMenuItems] = useState([]);
  const [menuError, setMenuError] = useState(null);
  const [menuUnavailable, setMenuUnavailable] = useState(false);
  const [ordersPaused, setOrdersPaused] = useState(false);
  const [tableOrderContext, setTableOrderContext] = useState(() => loadSession(TABLE_CONTEXT_KEY, null));

  useEffect(() => localStorage.setItem("jd_cart", JSON.stringify(cart)), [cart]);
  useEffect(() => localStorage.setItem("jd_favorites", JSON.stringify(favorites)), [favorites]);
  useEffect(() => localStorage.setItem("jd_orders", JSON.stringify(orders)), [orders]);
  useEffect(() => localStorage.setItem("jd_lang", language), [language]);
  useEffect(() => {
    localStorage.setItem("jd_theme", theme);
    document.body.dataset.theme = theme;
  }, [theme]);
  useEffect(() => localStorage.setItem("jd_points", String(points)), [points]);
  useEffect(() => localStorage.setItem("jd_sync_queue", JSON.stringify(syncQueue)), [syncQueue]);
  useEffect(() => {
    if (tableOrderContext) sessionStorage.setItem(TABLE_CONTEXT_KEY, JSON.stringify(tableOrderContext));
    else sessionStorage.removeItem(TABLE_CONTEXT_KEY);
  }, [tableOrderContext]);

  useEffect(() => {
    if (location.pathname !== "/menu") return;
    const query = new URLSearchParams(location.search);
    const qrToken = query.get("t");
    const tableSession = query.get("table_session");
    const tableToken = query.get("table_token");
    const tableNumber = query.get("table");
    if (!qrToken && !tableSession && !tableToken && !tableNumber) return;

    let cancelled = false;
    async function captureTableContext() {
      try {
        if (qrToken) {
          const verified = await api.verifyQrToken(qrToken);
          if (cancelled) return;
          setTableOrderContext({
            table_session: verified.table_session || verified.session_id || "",
            table: verified.table || null,
            source: "qr",
          });
        } else if (tableSession) {
          const data = await api.getTableSessionMenu(tableSession);
          if (cancelled) return;
          setTableOrderContext({
            table_session: tableSession,
            table: data.table || null,
            source: "table_session",
          });
        } else if (tableToken) {
          setTableOrderContext({
            table_token: tableToken,
            source: "table_token",
          });
        } else {
          const table = await api.resolveTable(tableNumber);
          if (cancelled) return;
          setTableOrderContext({
            table_id: table?.id,
            table: table || null,
            table_number: tableNumber,
            source: "table_number",
          });
        }
      } catch (error) {
        console.error("Failed to capture QR table context:", error);
        if (!cancelled) setTableOrderContext(null);
      } finally {
        if (!cancelled) navigate("/menu", { replace: true });
      }
    }

    captureTableContext();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search, navigate]);

  // Fetch menu items from backend
  useEffect(() => {
    const shouldSyncMenu = location.pathname === "/menu" || cart.length > 0 || favorites.length > 0;
    if (!shouldSyncMenu) return undefined;

    const fetchMenu = async () => {
      try {
        const data = await api.getMenu();
        setMenuItems(data);
        setMenuError(null);
        setMenuUnavailable(false);
        
        const liveIds = new Set(
          data.flatMap((item) => [
            String(item.id),
            `${item.id}-half`,
            `${item.id}-full`,
          ])
        );

        // Drop stale cart entries from older deployments so checkout never posts a missing menu item.
        setCart(prevCart => {
          return prevCart.filter(cartItem => {
            const id = String(cartItem.id || cartItem.menu_item_id || '');
            return liveIds.has(id);
          });
        });
      } catch (error) {
        console.error('Failed to fetch menu:', error);
        setMenuError({ at: Date.now() });
        setMenuItems([]);
        window.setTimeout(async () => {
          try {
            const retryData = await api.getMenu();
            setMenuItems(retryData);
            setMenuError(null);
            setMenuUnavailable(false);
          } catch (retryError) {
            console.error('Failed to fetch menu after cold-start retry:', retryError);
            setMenuUnavailable(true);
          }
        }, 8000);
      }
    };
    fetchMenu();
    api.getOrderPauseStatus().then((data) => setOrdersPaused(!!data.paused)).catch(() => {});
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") fetchMenu();
    }, 60000);
    const pauseTimer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      api.getOrderPauseStatus().then((data) => setOrdersPaused(!!data.paused)).catch(() => {});
    }, 60000);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(pauseTimer);
    };
  }, [restaurantId, location.pathname, cart.length, favorites.length]);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const vibrate = (pattern = 10) => {
    if (navigator.vibrate) navigator.vibrate(pattern);
  };

  const addToCart = (item, qty = 1, spiceLevel = "", addons = [], instructions = "") => {
    const finalInstructions = [item.instructions, instructions].filter(Boolean).join(" | ");
    setCart((prev) => {
      // Find index based on exact customization match
      const idx = prev.findIndex((x) =>
        x.id === item.id &&
        x.portion === item.portion &&
        x.spiceLevel === spiceLevel &&
        JSON.stringify(x.addons) === JSON.stringify(addons) &&
        x.instructions === finalInstructions
      );

      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + qty };
        return copy;
      }

      return [
        ...prev,
        {
          ...item,
          qty,
          spiceLevel,
          addons,
          instructions: finalInstructions,
          _key: `${item.id}-${Date.now()}`
        }
      ];
    });
    setCartOpen(true);
    vibrate(15);
    trackEvent("add_to_cart", { restaurantId, item: item.id, qty, spiceLevel }).catch((err) => {
      console.error('Failed to track add-to-cart event:', err);
    });
  };

  const addItemsToCart = (items) => {
    setCart((prev) => {
      let newCart = [...prev];
      items.forEach(({ item, qty = 1, spiceLevel = "", addons = [], instructions = "" }) => {
        const finalInstructions = [item.instructions, instructions].filter(Boolean).join(" | ");
        const idx = newCart.findIndex((x) =>
          x.id === item.id &&
          x.portion === item.portion &&
          x.spiceLevel === spiceLevel &&
          JSON.stringify(x.addons) === JSON.stringify(addons) &&
          x.instructions === finalInstructions
        );

        if (idx >= 0) {
          newCart[idx] = { ...newCart[idx], qty: newCart[idx].qty + qty };
        } else {
          newCart.push({
            ...item,
            qty,
            spiceLevel,
            addons,
            instructions: finalInstructions,
            _key: `${item.id}-${Date.now()}-${Math.random()}`
          });
        }
      });
      return newCart;
    });
    setCartOpen(true);
  };

  const removeFromCart = (_key) => setCart((prev) => prev.filter((x) => x._key !== _key));
  const setItemQty = (_key, qty) => setCart((prev) => prev.map((x) => (x._key === _key ? { ...x, qty } : x)).filter((x) => x.qty > 0));
  const clearCart = () => setCart([]);

  const toggleFavorite = (itemId) => setFavorites((prev) => prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]);
  const addOrder = (order) => {
    setOrders((prev) => [order, ...prev].slice(0, 50));
    setPoints(p => p + Math.floor(order.total || 0) * 5);
  };

  const subtotal = useMemo(() => cart.reduce((s, i) => s + (Number(i.price) || 0) * i.qty, 0), [cart]);
  const tax = Math.round(subtotal * 0.05);
  const total = subtotal + tax;
  const t = (key) => languageMap[language]?.[key] || languageMap.en[key] || key;
  const isAdminRoute = () => location.pathname.startsWith("/admin");

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const toggleDrawer = () => setIsDrawerOpen(!isDrawerOpen);

  const value = {
    restaurantId, cart, cartOpen, setCartOpen, favorites, orders, language, theme, botOpen, setBotOpen,
    favoritesOpen, setFavoritesOpen, points, addToCart, addItemsToCart, removeFromCart, setItemQty,
    clearCart, toggleFavorite, addOrder, setLanguage, setTheme, subtotal, tax, total, t, isAdminRoute, menuItems,
    getTotal: () => subtotal,
    items: cart, // Alias for CartContext compatibility
    cartCount: cart.reduce((acc, item) => acc + item.qty, 0),
    cartTotal: total,
    isDrawerOpen,
    toggleDrawer,
    isOffline,
    vibrate,
    syncQueue,
    menuError,
    menuUnavailable,
    ordersPaused,
    tableOrderContext,
    clearTableOrderContext: () => setTableOrderContext(null),
    setSyncQueue
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => useContext(AppContext);
