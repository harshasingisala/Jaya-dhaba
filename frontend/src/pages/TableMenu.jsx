import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowRight, BellRing, CheckCircle2, Clock3, Copy, Loader2, Minus, Plus, QrCode, ShoppingCart, X } from 'lucide-react';
import api from '../api';
import PageMeta from '../components/SEO/PageMeta';

function TableMenuMeta() {
  return (
    <PageMeta
      title="Table Ordering Menu"
      description="Order from your table at Jaya Dhaba."
      url="/menu"
      robots="noindex, nofollow"
    />
  );
}

function formatMoney(value) {
  return `Rs ${Number(value || 0).toLocaleString('en-IN')}`;
}

function isVeg(item) {
  const tags = Array.isArray(item.dietary_tags) ? item.dietary_tags : [];
  const tagText = tags.join(' ').toLowerCase();
  const nonVegPattern = /\b(non[\s-]?veg|chicken|chk|egg|mutton|fish|prawn|sea\s*food|seafood)\b/;
  const vegPattern = /\b(veg(?:etarian)?|paneer|mushroom|gobi|corn|potato|dal)\b/;
  if (nonVegPattern.test(tagText)) return false;
  if (vegPattern.test(tagText)) return true;

  const nameText = String(item.name || '').toLowerCase();
  if (nonVegPattern.test(nameText)) return false;
  if (vegPattern.test(nameText)) return true;

  const categoryText = String(item.category || item.category_name || '').toLowerCase();
  const hasNonVeg = /\bnon[\s-]?veg\b/.test(categoryText);
  const hasVeg = /\bveg(?:etarian)?\b/.test(categoryText.replace(/\bnon[\s-]?veg\b/g, ''));
  if (hasNonVeg && !hasVeg) return false;
  if (hasVeg && !hasNonVeg) return true;
  if (/\b(mutton|egg|fish|prawn|sea\s*food|seafood)\b/.test(categoryText)) return false;
  if (/\b(dal|roti|drink|ice\s*cream)\b/.test(categoryText)) return true;
  return null;
}

function itemImage(item) {
  return item.image_url || item.img || '/biryani.png';
}

const WAITER_REASONS = [
  { value: 'need_assistance', label: 'Need assistance' },
  { value: 'need_water', label: 'Need water' },
  { value: 'have_question', label: 'Have a question' },
  { value: 'requesting_bill', label: 'Request bill' },
];

export default function TableMenu() {
  const [searchParams] = useSearchParams();
  const qrToken = searchParams.get('t') || '';
  const tableParam = searchParams.get('table') || '';
  const tableToken = searchParams.get('table_token') || '';
  const initialTableSession = searchParams.get('table_session') || '';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState({ table: null, categories: [], items: [] });
  const [tableSession, setTableSession] = useState(initialTableSession);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [activeCategory, setActiveCategory] = useState('');
  const [cart, setCart] = useState({});
  const [sharedCart, setSharedCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState(null);
  const [waiterOpen, setWaiterOpen] = useState(false);
  const [waiterBusy, setWaiterBusy] = useState(false);
  const [waiterMessage, setWaiterMessage] = useState('');
  const [waiterCooldownUntil, setWaiterCooldownUntil] = useState(0);
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitMode, setSplitMode] = useState('equal');
  const [splitPeople, setSplitPeople] = useState([{ name: 'Guest 1' }, { name: 'Guest 2' }]);
  const [splitAssignments, setSplitAssignments] = useState({});
  const [splitLinks, setSplitLinks] = useState([]);
  const [splitBusy, setSplitBusy] = useState(false);
  const [splitExpiresAt, setSplitExpiresAt] = useState('');
  const [splitNow, setSplitNow] = useState(Date.now());
  const useGroupCart = Boolean(tableSession);
  const addedBy = guestName.trim() || 'Guest';

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const queryValue = qrToken || initialTableSession || tableToken || tableParam;
        if (!queryValue) {
          throw new Error('Table not found. Please scan the QR code again.');
        }
        if (qrToken) {
          const verified = await api.verifyQrToken(qrToken);
          if (cancelled) return;
          const sessionId = verified.table_session || verified.session_id;
          if (!sessionId || !verified.table) {
            throw new Error('Table not found. Please scan the QR code again.');
          }
          setTableSession(sessionId);
          setMenu({ table: verified.table, categories: [], items: [] });
          setAwaitingConfirmation(true);
          setActiveCategory('');
          return;
        }
        const data = initialTableSession
          ? await api.getTableSessionMenu(initialTableSession)
          : tableToken
            ? await api.request(`/api/menu?table_token=${encodeURIComponent(tableToken)}`)
            : await api.getMenu(tableParam);
        if (cancelled) return;
        const nextMenu = {
          table: data.table || null,
          categories: Array.isArray(data.categories) ? data.categories : [],
          items: Array.isArray(data.items) ? data.items : [],
        };
        if (!nextMenu.table) {
          throw new Error('Table not found. Please scan the QR code again.');
        }
        setTableSession(initialTableSession);
        setAwaitingConfirmation(false);
        setMenu(nextMenu);
        setActiveCategory(nextMenu.categories[0]?.id || nextMenu.items[0]?.category_id || '');
      } catch (err) {
        if (!cancelled) {
          const message = err.status === 404
            ? 'Table not found. Please scan the QR code again.'
            : err.message || 'Table not found. Please scan the QR code again.';
          setError(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [initialTableSession, qrToken, tableParam, tableToken]);

  useEffect(() => {
    if (!useGroupCart || awaitingConfirmation || !menu.table || order) return undefined;
    let cancelled = false;
    async function syncCart() {
      try {
        const rows = await api.getGroupCart(tableSession);
        if (!cancelled) setSharedCart(rows);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Shared cart could not be synced.');
      }
    }
    syncCart();
    const interval = window.setInterval(syncCart, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [awaitingConfirmation, menu.table, order, tableSession, useGroupCart]);

  const categories = useMemo(() => {
    return menu.categories.filter((category) =>
      menu.items.some((item) => String(item.category_id) === String(category.id))
    );
  }, [menu.categories, menu.items]);

  const visibleItems = useMemo(() => {
    if (!activeCategory) return menu.items;
    return menu.items.filter((item) => String(item.category_id) === String(activeCategory));
  }, [activeCategory, menu.items]);

  const cartLines = useMemo(() => {
    if (useGroupCart) {
      return sharedCart
        .filter((line) => Number(line.quantity || 0) > 0)
        .map((line, index) => ({
          cart_key: `${line.item_id}-${line.added_by || 'Guest'}-${line.timestamp || index}`,
          added_by: line.added_by || 'Guest',
          qty: Number(line.quantity || 1),
          item: {
            ...(line.item || {}),
            id: line.item_id,
            name: line.name || line.item?.name || 'Menu item',
            price: Number(line.price ?? line.item?.price ?? 0),
            image_url: line.item?.image_url,
          },
        }));
    }
    return Object.values(cart).filter((line) => line.qty > 0);
  }, [cart, sharedCart, useGroupCart]);

  const cartQtyByItem = useMemo(() => {
    return cartLines.reduce((next, line) => {
      next[line.item.id] = (next[line.item.id] || 0) + line.qty;
      return next;
    }, {});
  }, [cartLines]);

  const subtotal = useMemo(() => {
    return cartLines.reduce((sum, line) => sum + Number(line.item.price || 0) * line.qty, 0);
  }, [cartLines]);

  const tax = Math.round(subtotal * 0.05);
  const total = subtotal + tax;
  const itemCount = cartLines.reduce((sum, line) => sum + line.qty, 0);
  const tableLabel = menu.table?.label || (tableParam ? `Table ${tableParam}` : 'Table');
  const trackingUrl = order?.public_token
    ? `/track?id=${encodeURIComponent(order.id)}&token=${encodeURIComponent(order.public_token)}`
    : '';

  const splitPeopleWithNames = splitPeople.map((person, index) => ({
    ...person,
    name: String(person.name || `Guest ${index + 1}`).trim() || `Guest ${index + 1}`,
  }));
  const splitEqualAmount = splitPeople.length ? Number(order?.total || 0) / splitPeople.length : 0;
  const splitItems = order?.items || [];
  const splitSubtotals = splitPeopleWithNames.map((person) => splitItems.reduce((sum, item) => (
    splitAssignments[item.item_id || item.id] === person.name
      ? sum + Number(item.price || item.unit_price || 0) * Number(item.qty || item.quantity || 1)
      : sum
  ), 0));
  const allSplitItemsAssigned = splitItems.length > 0 && splitItems.every((item) => splitAssignments[item.item_id || item.id]);
  const splitAllPaid = splitLinks.length > 0 && splitLinks.every((link) => link.status === 'paid');
  const splitRemainingSeconds = splitExpiresAt ? Math.max(0, Math.floor((new Date(splitExpiresAt).getTime() - splitNow) / 1000)) : 0;
  const splitCountdown = `${String(Math.floor(splitRemainingSeconds / 60)).padStart(2, '0')}:${String(splitRemainingSeconds % 60).padStart(2, '0')}`;

  useEffect(() => {
    if (!order || !splitLinks.length || splitAllPaid) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const status = await api.getSplitStatus(order.id, tableSession);
        const rows = status.splits || status.data || [];
        if (!cancelled) {
          setSplitLinks(rows);
          setSplitExpiresAt(rows[0]?.expires_at || splitExpiresAt);
        }
      } catch {
        // Split status must never interrupt the success screen.
      }
    };
    const interval = window.setInterval(poll, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [order, splitAllPaid, splitExpiresAt, splitLinks.length, tableSession]);

  useEffect(() => {
    if (!splitLinks.length) return undefined;
    const timer = window.setInterval(() => setSplitNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [splitLinks.length]);

  const changeQty = async (item, delta, owner = addedBy) => {
    if (useGroupCart) {
      if (!tableSession) return;
      setError('');
      try {
        const rows = delta > 0
          ? await api.addGroupCartItem({ tableSession, itemId: item.id, quantity: 1, addedBy })
          : await api.removeGroupCartItem({ tableSession, itemId: item.id, addedBy: owner || addedBy });
        setSharedCart(rows);
      } catch (err) {
        setError(err.message || 'Shared cart update failed.');
      }
      return;
    }
    setCart((prev) => {
      const current = prev[item.id]?.qty || 0;
      const qty = Math.max(0, current + delta);
      const next = { ...prev };
      if (qty === 0) {
        delete next[item.id];
      } else {
        next[item.id] = { item, qty };
      }
      return next;
    });
  };

  const placeOrder = async () => {
    if (!cartLines.length || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        table_id: menu.table?.id || menu.table?.table_id,
        table_session: tableSession,
        table_token: menu.table?.qr_token,
        group_cart: useGroupCart,
        guest_name: guestName.trim(),
        order_type: 'dine_in',
        source: 'customer',
        payment_method: 'cash',
        items: useGroupCart ? [] : cartLines.map((line) => ({
          menu_item_id: line.item.id,
          qty: line.qty,
        })),
      };
      const created = await api.placeOrder(payload);
      setOrder(created);
      setCartOpen(false);
      setCart({});
      setSharedCart([]);
    } catch (err) {
      if (err.status === 409) {
        setError('This table already has an active order. Please ask your server.');
      } else {
        setError(err.message || 'Order could not be placed. Please ask your server.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const confirmTable = async () => {
    if (!tableSession || loading) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.getTableSessionMenu(tableSession);
      const nextMenu = {
        table: data.table || null,
        categories: Array.isArray(data.categories) ? data.categories : [],
        items: Array.isArray(data.items) ? data.items : [],
      };
      if (!nextMenu.table) {
        throw new Error('Table not found. Please scan the QR code again.');
      }
      setMenu(nextMenu);
      setActiveCategory(nextMenu.categories[0]?.id || nextMenu.items[0]?.category_id || '');
      setAwaitingConfirmation(false);
    } catch (err) {
      setError(err.message || 'Table session expired. Please scan the QR code again.');
    } finally {
      setLoading(false);
    }
  };

  const callWaiter = async (reason) => {
    if (!tableSession || waiterBusy || Date.now() < waiterCooldownUntil) return;
    setWaiterBusy(true);
    setError('');
    try {
      await api.callWaiter({ tableSession, reason });
      setWaiterOpen(false);
      setWaiterMessage("Waiter called - we'll be right with you");
      setWaiterCooldownUntil(Date.now() + 120000);
      window.setTimeout(() => setWaiterMessage(''), 3000);
      window.setTimeout(() => setWaiterCooldownUntil(0), 120000);
    } catch (err) {
      setError(err.message || 'Could not call waiter. Please ask nearby staff.');
    } finally {
      setWaiterBusy(false);
    }
  };

  const updateSplitPersonCount = (count) => {
    const safeCount = Math.min(10, Math.max(2, Number(count) || 2));
    setSplitPeople((current) => Array.from({ length: safeCount }, (_, index) => current[index] || { name: `Guest ${index + 1}` }));
  };

  const updateSplitPersonName = (index, name) => {
    setSplitPeople((current) => current.map((person, i) => (i === index ? { ...person, name } : person)));
  };

  const generateSplitLinks = async () => {
    if (!order || !tableSession || splitBusy) return;
    setSplitBusy(true);
    setError('');
    try {
      const splits = splitMode === 'equal'
        ? splitPeopleWithNames.map((person) => ({ name: person.name, phone: person.phone || '' }))
        : splitPeopleWithNames.map((person) => ({
            name: person.name,
            phone: person.phone || '',
            item_ids: splitItems
              .filter((item) => splitAssignments[item.item_id || item.id] === person.name)
              .map((item) => item.item_id || item.id),
          }));
      const result = await api.createSplit(order.id, tableSession, splitMode, splits);
      const rows = result.splits || result.data?.splits || [];
      setSplitLinks(rows);
      setSplitExpiresAt(rows[0]?.expires_at || '');
    } catch (err) {
      setError(err.message || 'Split links could not be created.');
    } finally {
      setSplitBusy(false);
    }
  };

  const copySplitLink = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      setWaiterMessage('Payment link copied');
      window.setTimeout(() => setWaiterMessage(''), 2000);
    } catch {
      setError('Copy failed. Open the link and copy it from the address bar.');
    }
  };

  const waiterControl = tableSession && !awaitingConfirmation ? (
    <div className="fixed bottom-24 right-4 z-30 flex w-[min(18rem,calc(100vw-2rem))] flex-col items-end gap-2">
      {waiterMessage && (
        <div className="rounded-2xl bg-green-600 px-4 py-3 text-sm font-bold text-white shadow-xl">
          {waiterMessage}
        </div>
      )}
      {waiterOpen && (
        <div className="w-full rounded-2xl bg-white p-2 shadow-2xl ring-1 ring-orange-100">
          {WAITER_REASONS.map((reason) => (
            <button
              key={reason.value}
              onClick={() => callWaiter(reason.value)}
              disabled={waiterBusy || Date.now() < waiterCooldownUntil}
              className="block min-h-11 w-full rounded-xl px-3 text-left text-sm font-bold text-amber-950 hover:bg-amber-50 disabled:opacity-50"
            >
              {reason.label}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setWaiterOpen((value) => !value)}
        disabled={waiterBusy || Date.now() < waiterCooldownUntil}
        className="inline-flex min-h-12 items-center gap-2 rounded-full bg-amber-950 px-4 text-xs font-black uppercase tracking-widest text-white shadow-xl disabled:opacity-60"
      >
        {waiterBusy ? <Loader2 className="animate-spin" size={17} /> : <BellRing size={17} />}
        Call waiter
      </button>
    </div>
  ) : null;

  if (loading) {
    return (
      <>
        <TableMenuMeta />
        <main className="min-h-screen bg-amber-50 flex items-center justify-center px-6 text-amber-950">
          <div className="text-center">
            <Loader2 className="mx-auto animate-spin text-orange-600" size={42} />
            <p className="mt-4 font-serif italic text-2xl">Loading your table menu...</p>
          </div>
        </main>
      </>
    );
  }

  if (error && !menu.table) {
    return (
      <>
        <TableMenuMeta />
        <main className="min-h-screen bg-amber-50 flex items-center justify-center px-6 text-amber-950">
          <div className="max-w-sm rounded-[2rem] bg-white p-8 text-center shadow-xl border border-orange-100">
            <AlertCircle className="mx-auto text-orange-600" size={44} />
            <h1 className="mt-4 font-serif italic text-3xl">Table not found</h1>
            <p className="mt-3 text-sm leading-6 text-amber-950/65">Table not found. Please scan the QR code again.</p>
          </div>
        </main>
      </>
    );
  }

  if (awaitingConfirmation && menu.table) {
    return (
      <>
        <TableMenuMeta />
        <main className="min-h-screen bg-amber-50 flex items-center justify-center px-6 text-amber-950">
          <div className="w-full max-w-sm rounded-[2rem] bg-white p-8 text-center shadow-xl border border-orange-100">
            <CheckCircle2 className="mx-auto text-green-600" size={52} />
            <p className="mt-5 text-xs font-black uppercase tracking-[0.25em] text-orange-700">QR verified</p>
            <h1 className="mt-3 font-serif italic text-5xl">{tableLabel}</h1>
            <p className="mt-3 text-base leading-7 text-amber-950/70">Confirm this is your table before opening the live menu.</p>
            {error && (
              <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                {error}
              </p>
            )}
            <button
              onClick={confirmTable}
              className="mt-6 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-orange-700 px-5 text-sm font-black uppercase tracking-widest text-white shadow-lg"
            >
              Open table menu
              <ArrowRight size={18} />
            </button>
          </div>
        </main>
      </>
    );
  }

  if (order) {
    return (
      <>
        <TableMenuMeta />
        <main className="min-h-screen bg-amber-50 flex items-center justify-center px-6 text-amber-950">
          <div className="w-full max-w-sm rounded-[2rem] bg-white p-8 text-center shadow-xl border border-green-100">
            <CheckCircle2 className="mx-auto text-green-600" size={52} />
            <h1 className="mt-5 font-serif italic text-4xl">Order placed</h1>
            <p className="mt-3 text-base leading-7 text-amber-950/70">{tableLabel} - your order is now on the kitchen screen.</p>
            <p className="mt-5 rounded-full bg-amber-100 px-4 py-3 text-xs font-black uppercase tracking-widest text-amber-900">
              Order #{order.order_number || String(order.id).slice(0, 8)}
            </p>
            <div className="mt-5 grid gap-3 text-left">
              <div className="rounded-2xl bg-green-50 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-widest text-green-700">Kitchen</p>
                <p className="mt-1 text-sm font-semibold text-green-950/70">Staff can see your table and order instantly.</p>
              </div>
              <div className="rounded-2xl bg-orange-50 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-widest text-orange-700">Table</p>
                <p className="mt-1 text-sm font-semibold text-orange-950/70">This table stays busy until the order is served or cleared.</p>
              </div>
            </div>
            {trackingUrl && (
              <a
                href={trackingUrl}
                className="mt-6 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-orange-700 px-5 text-sm font-black uppercase tracking-widest text-white shadow-lg"
              >
                Track live order
                <ArrowRight size={18} />
              </a>
            )}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <button
                onClick={() => setSplitOpen((value) => !value)}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-amber-100 px-4 text-[10px] font-black uppercase tracking-widest text-amber-950"
              >
                Split bill
              </button>
              <button
                onClick={() => {
                  setOrder(null);
                  setSplitOpen(false);
                  setSplitLinks([]);
                }}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-orange-50 px-4 text-[10px] font-black uppercase tracking-widest text-orange-800"
              >
                Add more items
              </button>
            </div>
            {splitOpen && (
              <div className="mt-5 rounded-3xl border border-orange-100 bg-amber-50 p-4 text-left">
                {!splitLinks.length ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        ['equal', 'Split equally'],
                        ['by_item', 'Split by item'],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          onClick={() => setSplitMode(value)}
                          className={`min-h-11 rounded-2xl text-xs font-black uppercase tracking-widest ${splitMode === value ? 'bg-orange-700 text-white' : 'bg-white text-amber-950'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {splitMode === 'equal' ? (
                      <div className="space-y-3">
                        <label className="block">
                          <span className="text-[10px] font-black uppercase tracking-widest text-amber-950/45">People</span>
                          <input
                            type="number"
                            min="2"
                            max="10"
                            value={splitPeople.length}
                            onChange={(event) => updateSplitPersonCount(event.target.value)}
                            className="mt-2 min-h-11 w-full rounded-2xl border border-orange-100 bg-white px-4 font-black outline-none"
                          />
                        </label>
                        {splitPeople.map((person, index) => (
                          <input
                            key={index}
                            value={person.name}
                            onChange={(event) => updateSplitPersonName(index, event.target.value)}
                            placeholder={`Guest ${index + 1}`}
                            className="min-h-11 w-full rounded-2xl border border-orange-100 bg-white px-4 text-sm font-bold outline-none"
                          />
                        ))}
                        <p className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-orange-800">
                          Each person pays {formatMoney(splitEqualAmount)}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {splitPeople.map((person, index) => (
                          <input
                            key={index}
                            value={person.name}
                            onChange={(event) => updateSplitPersonName(index, event.target.value)}
                            placeholder={`Guest ${index + 1}`}
                            className="min-h-11 w-full rounded-2xl border border-orange-100 bg-white px-4 text-sm font-bold outline-none"
                          />
                        ))}
                        {splitItems.map((item) => {
                          const itemId = item.item_id || item.id;
                          return (
                            <div key={itemId} className="rounded-2xl bg-white p-3">
                              <p className="text-sm font-black text-amber-950">{item.qty || item.quantity || 1}x {item.name}</p>
                              <select
                                value={splitAssignments[itemId] || ''}
                                onChange={(event) => setSplitAssignments((current) => ({ ...current, [itemId]: event.target.value }))}
                                className="mt-2 min-h-10 w-full rounded-xl border border-orange-100 px-3 text-sm font-bold outline-none"
                              >
                                <option value="">Assign to...</option>
                                {splitPeopleWithNames.map((person) => (
                                  <option key={person.name} value={person.name}>{person.name}</option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                        <div className="grid gap-2">
                          {splitPeopleWithNames.map((person, index) => (
                            <div key={person.name} className="flex justify-between rounded-xl bg-white px-3 py-2 text-sm font-bold">
                              <span>{person.name}</span>
                              <span>{formatMoney(splitSubtotals[index])}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <button
                      onClick={generateSplitLinks}
                      disabled={splitBusy || (splitMode === 'by_item' && !allSplitItemsAssigned)}
                      className="flex min-h-12 w-full items-center justify-center rounded-full bg-orange-700 px-5 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50"
                    >
                      {splitBusy ? <Loader2 className="animate-spin" size={18} /> : 'Generate payment links'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-2xl bg-white px-4 py-3 text-center text-sm font-black text-amber-950">
                      {splitAllPaid ? 'All paid - enjoy your meal!' : `Links expire in ${splitCountdown}`}
                    </div>
                    {splitLinks.map((link) => (
                      <div key={link.id || link.short_url} className="rounded-2xl bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-black text-amber-950">{link.name}</p>
                            <p className="font-serif italic text-2xl text-orange-700">{formatMoney(link.amount)}</p>
                            <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${link.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'}`}>
                              {link.status || 'pending'}
                            </span>
                          </div>
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=96x96&data=${encodeURIComponent(link.short_url)}`}
                            alt={`${link.name} payment QR`}
                            className="h-24 w-24 rounded-xl bg-white p-1"
                          />
                        </div>
                        <button
                          onClick={() => copySplitLink(link.short_url)}
                          className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-amber-100 text-[10px] font-black uppercase tracking-widest text-amber-950"
                        >
                          <Copy size={14} />
                          Copy link
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => setSplitOpen(false)}
                      className="min-h-11 w-full rounded-full bg-amber-950 text-xs font-black uppercase tracking-widest text-white"
                    >
                      Done
                    </button>
                  </div>
                )}
              </div>
            )}
            {waiterControl}
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <TableMenuMeta />
      <main className="min-h-screen bg-amber-50 pb-32 text-amber-950">
      <section className="sticky top-0 z-20 bg-gradient-to-br from-orange-700 via-amber-600 to-yellow-500 px-5 pb-5 pt-6 text-white shadow-lg">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-serif italic text-4xl leading-tight">Jaya Dhaba</h1>
              <p className="mt-1 text-sm font-semibold text-white/85">Fresh from the kitchen, ordered from your table.</p>
            </div>
            <div className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-black uppercase tracking-widest text-orange-700 shadow">
              {tableLabel}
            </div>
          </div>
          <div className="mt-4 grid gap-2 text-xs font-bold text-white/90 sm:grid-cols-3">
            <div className="flex items-center gap-2 rounded-2xl bg-white/15 px-3 py-2">
              <CheckCircle2 size={15} />
              Table QR verified
            </div>
            <div className="flex items-center gap-2 rounded-2xl bg-white/15 px-3 py-2">
              <ShoppingCart size={15} />
              Sent to kitchen
            </div>
            <div className="flex items-center gap-2 rounded-2xl bg-white/15 px-3 py-2">
              <Clock3 size={15} />
              Live tracking after order
            </div>
          </div>
          <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                className={`shrink-0 rounded-full px-5 py-3 text-xs font-black uppercase tracking-widest transition ${
                  String(activeCategory) === String(category.id)
                    ? 'bg-white text-orange-700 shadow'
                    : 'bg-white/15 text-white'
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-4 py-5 sm:grid-cols-2 lg:grid-cols-3">
        {visibleItems.map((item) => {
          const qty = cartQtyByItem[item.id] || 0;
          const veg = isVeg(item);
          const dietColor = veg === true ? 'bg-green-600' : veg === false ? 'bg-red-600' : 'bg-amber-400';
          const dietLabel = veg === true ? 'Veg' : veg === false ? 'Non-Veg' : 'Ask staff';
          return (
            <article key={item.id} className="overflow-hidden rounded-[1.75rem] border border-orange-100 bg-white shadow-sm">
              <div className="aspect-[4/3] bg-amber-100">
                <img src={itemImage(item)} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`h-3 w-3 rounded-full ${dietColor}`} />
                      <h2 className="text-lg font-black leading-tight text-amber-950">{item.name}</h2>
                    </div>
                    <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-amber-950/60">{item.description || item.desc}</p>
                  </div>
                  <p className="shrink-0 font-serif italic text-xl text-orange-700">{formatMoney(item.price)}</p>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  {qty > 0 ? (
                    <div className="flex items-center rounded-full bg-orange-600 text-white shadow">
                      <button onClick={() => changeQty(item, -1)} className="grid h-11 w-11 place-items-center" aria-label={`Remove ${item.name}`}>
                        <Minus size={17} />
                      </button>
                      <span className="min-w-8 text-center text-sm font-black">{qty}</span>
                      <button onClick={() => changeQty(item, 1)} className="grid h-11 w-11 place-items-center" aria-label={`Add ${item.name}`}>
                        <Plus size={17} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => changeQty(item, 1)}
                      className="inline-flex min-h-11 items-center gap-2 rounded-full bg-amber-100 px-5 text-xs font-black uppercase tracking-widest text-orange-800"
                    >
                      <Plus size={15} />
                      Add
                    </button>
                  )}
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-950/35">
                    {dietLabel}
                  </span>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {error && (
        <div className="fixed bottom-24 left-4 right-4 z-30 mx-auto max-w-md rounded-2xl bg-red-600 px-4 py-3 text-sm font-bold text-white shadow-xl">
          {error}
        </div>
      )}

      {itemCount > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-4 left-4 right-4 z-30 mx-auto flex min-h-16 max-w-md items-center justify-between rounded-[1.5rem] bg-orange-700 px-5 text-white shadow-2xl"
        >
          <span className="flex items-center gap-3 text-sm font-black uppercase tracking-widest">
            <ShoppingCart size={20} />
            {itemCount} item{itemCount === 1 ? '' : 's'}
          </span>
          <span className="font-serif italic text-2xl">{formatMoney(subtotal)}</span>
        </button>
      )}

      {cartOpen && (
        <div className="fixed inset-0 z-40 bg-black/45">
          <button className="absolute inset-0 h-full w-full cursor-default" onClick={() => setCartOpen(false)} aria-label="Close cart" />
          <section className="absolute bottom-0 left-0 right-0 mx-auto max-h-[86vh] max-w-xl overflow-y-auto rounded-t-[2rem] bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="font-serif italic text-3xl text-amber-950">Your Cart</h2>
              <button onClick={() => setCartOpen(false)} className="grid h-11 w-11 place-items-center rounded-full bg-amber-100 text-amber-950">
                <X size={18} />
              </button>
            </div>
            <div className="mt-5 space-y-3">
              {cartLines.map((line) => (
                <div key={line.cart_key || line.item.id} className="flex items-center justify-between gap-3 rounded-2xl bg-amber-50 p-3">
                  <div>
                    <p className="font-bold text-amber-950">{line.item.name}</p>
                    <p className="text-sm text-amber-950/55">{formatMoney(line.item.price)} each</p>
                    {useGroupCart && (
                      <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-orange-700/60">
                        Added by {line.added_by || 'Guest'}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center rounded-full bg-white text-orange-700 shadow-sm">
                    <button
                      onClick={() => changeQty(line.item, -1, line.added_by)}
                      disabled={useGroupCart && (line.added_by || 'Guest') !== addedBy}
                      className="grid h-10 w-10 place-items-center disabled:opacity-30"
                      aria-label={`Remove ${line.item.name}`}
                    >
                      <Minus size={16} />
                    </button>
                    <span className="min-w-8 text-center text-sm font-black">{line.qty}</span>
                    <button onClick={() => changeQty(line.item, 1)} className="grid h-10 w-10 place-items-center" aria-label={`Add ${line.item.name}`}>
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <label className="mt-5 block">
              <span className="text-xs font-black uppercase tracking-widest text-amber-950/45">Name optional</span>
              <input
                value={guestName}
                onChange={(event) => setGuestName(event.target.value)}
                placeholder="Your name"
                className="mt-2 min-h-12 w-full rounded-2xl border border-orange-100 bg-amber-50 px-4 text-base outline-none focus:border-orange-500"
              />
            </label>
            <div className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(subtotal)}</span></div>
              <div className="flex justify-between"><span>Tax 5%</span><span>{formatMoney(tax)}</span></div>
              <div className="flex justify-between border-t border-orange-100 pt-3 font-serif italic text-2xl text-orange-700">
                <span>Total</span><span>{formatMoney(total)}</span>
              </div>
            </div>
            <button
              onClick={placeOrder}
              disabled={submitting || cartLines.length === 0}
              className="mt-5 flex min-h-14 w-full items-center justify-center rounded-full bg-orange-700 px-5 text-sm font-black uppercase tracking-widest text-white shadow-lg disabled:opacity-60"
            >
              {submitting ? <Loader2 className="animate-spin" size={20} /> : 'Place Order'}
            </button>
          </section>
        </div>
      )}
      {waiterControl}
      </main>
    </>
  );
}
