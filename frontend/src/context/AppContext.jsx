import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { languageMap } from "../data/menu";
import { trackEvent } from "../api/client";
import api from "../api/client";

const AppContext = createContext(null);

const load = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.error('[JAYA_DEBUG] Caught error in load:', err);
    return fallback;
  }
};

export function AppProvider({ children }) {
  const location = useLocation();
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

  // Fetch menu items from backend
  useEffect(() => {
    const fetchMenu = async () => {
      try {
        const data = await api.getMenu(restaurantId);
        setMenuItems(data);
        setMenuError(null);
        setMenuUnavailable(false);
        
        // Update cart items to ensure they have correct integer IDs
        setCart(prevCart => {
          return prevCart.map(cartItem => {
            // If cart item has string ID, try to find matching menu item
            if (typeof cartItem.id === 'string') {
              const menuItem = data.find(item => item.id === Number(cartItem.id) || item.client_id === cartItem.id);
              if (menuItem) {
                return { ...cartItem, id: menuItem.id };
              }
            }
            return cartItem;
          });
        });
      } catch (error) {
        console.error('Failed to fetch menu:', error);
        setMenuError({ at: Date.now() });
        setMenuItems([]);
        window.setTimeout(async () => {
          try {
            const retryData = await api.getMenu(restaurantId);
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
    const timer = window.setInterval(fetchMenu, 10000);
    const pauseTimer = window.setInterval(() => {
      api.getOrderPauseStatus().then((data) => setOrdersPaused(!!data.paused)).catch(() => {});
    }, 10000);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(pauseTimer);
    };
  }, [restaurantId]);

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

  const addToCart = (item, qty = 1, spiceLevel = "Medium", addons = [], instructions = "") => {
    setCart((prev) => {
      // Find index based on exact customization match
      const idx = prev.findIndex((x) =>
        x.id === item.id &&
        x.spiceLevel === spiceLevel &&
        JSON.stringify(x.addons) === JSON.stringify(addons) &&
        x.instructions === instructions
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
          instructions,
          _key: `${item.id}-${Date.now()}`
        }
      ];
    });
    setCartOpen(true);
    vibrate(15);
    trackEvent("add_to_cart", { restaurantId, item: item.id, qty, spiceLevel }).catch((err) => {
      console.error('[JAYA_DEBUG] Caught error in addToCart trackEvent:', err);
    });
  };

  const addItemsToCart = (items) => {
    setCart((prev) => {
      let newCart = [...prev];
      items.forEach(({ item, qty = 1, spiceLevel = "Medium", addons = [], instructions = "" }) => {
        const idx = newCart.findIndex((x) =>
          x.id === item.id &&
          x.spiceLevel === spiceLevel &&
          JSON.stringify(x.addons) === JSON.stringify(addons) &&
          x.instructions === instructions
        );

        if (idx >= 0) {
          newCart[idx] = { ...newCart[idx], qty: newCart[idx].qty + qty };
        } else {
          newCart.push({
            ...item,
            qty,
            spiceLevel,
            addons,
            instructions,
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
    setSyncQueue
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => useContext(AppContext);
