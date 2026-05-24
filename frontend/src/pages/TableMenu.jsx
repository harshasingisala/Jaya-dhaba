import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2, Minus, Plus, ShoppingCart, X } from 'lucide-react';
import api from '../api';

function formatMoney(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

function isVeg(item) {
  if (typeof item.is_veg === 'boolean') return item.is_veg;
  const tags = Array.isArray(item.dietary_tags) ? item.dietary_tags : [];
  const text = tags.join(' ').toLowerCase();
  return text.includes('veg') && !text.includes('non-veg') && !text.includes('non veg');
}

function itemImage(item) {
  return item.image_url || item.img || '/biryani.png';
}

export default function TableMenu() {
  const [searchParams] = useSearchParams();
  const tableParam = searchParams.get('table') || '';
  const tableToken = searchParams.get('table_token') || '';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState({ table: null, categories: [], items: [] });
  const [activeCategory, setActiveCategory] = useState('');
  const [cart, setCart] = useState({});
  const [cartOpen, setCartOpen] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const queryValue = tableToken || tableParam;
        if (!queryValue) {
          throw new Error('Table not found. Please scan the QR code again.');
        }
        const data = tableToken
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
  }, [tableParam, tableToken]);

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
    return Object.values(cart).filter((line) => line.qty > 0);
  }, [cart]);

  const subtotal = useMemo(() => {
    return cartLines.reduce((sum, line) => sum + Number(line.item.price || 0) * line.qty, 0);
  }, [cartLines]);

  const tax = Math.round(subtotal * 0.05);
  const total = subtotal + tax;
  const itemCount = cartLines.reduce((sum, line) => sum + line.qty, 0);
  const tableLabel = menu.table?.label || (tableParam ? `Table ${tableParam}` : 'Table');

  const changeQty = (item, delta) => {
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
        table_token: menu.table?.qr_token,
        guest_name: guestName.trim(),
        order_type: 'dine_in',
        source: 'customer',
        payment_method: 'cash',
        items: cartLines.map((line) => ({
          menu_item_id: line.item.id,
          qty: line.qty,
        })),
      };
      const created = await api.placeOrder(payload);
      setOrder(created);
      setCartOpen(false);
      setCart({});
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

  if (loading) {
    return (
      <main className="min-h-screen bg-amber-50 flex items-center justify-center px-6 text-amber-950">
        <div className="text-center">
          <Loader2 className="mx-auto animate-spin text-orange-600" size={42} />
          <p className="mt-4 font-serif italic text-2xl">Loading your table menu...</p>
        </div>
      </main>
    );
  }

  if (error && !menu.table) {
    return (
      <main className="min-h-screen bg-amber-50 flex items-center justify-center px-6 text-amber-950">
        <div className="max-w-sm rounded-[2rem] bg-white p-8 text-center shadow-xl border border-orange-100">
          <AlertCircle className="mx-auto text-orange-600" size={44} />
          <h1 className="mt-4 font-serif italic text-3xl">Table not found</h1>
          <p className="mt-3 text-sm leading-6 text-amber-950/65">Table not found. Please scan the QR code again.</p>
        </div>
      </main>
    );
  }

  if (order) {
    return (
      <main className="min-h-screen bg-amber-50 flex items-center justify-center px-6 text-amber-950">
        <div className="max-w-sm rounded-[2rem] bg-white p-8 text-center shadow-xl border border-green-100">
          <CheckCircle2 className="mx-auto text-green-600" size={52} />
          <h1 className="mt-5 font-serif italic text-4xl">Order Placed! 🎉</h1>
          <p className="mt-3 text-base leading-7 text-amber-950/70">{tableLabel} - your order is being prepared</p>
          <p className="mt-5 rounded-full bg-amber-100 px-4 py-3 text-xs font-black uppercase tracking-widest text-amber-900">
            Order #{order.order_number || String(order.id).slice(0, 8)}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-amber-50 pb-32 text-amber-950">
      <section className="sticky top-0 z-20 bg-gradient-to-br from-orange-700 via-amber-600 to-yellow-500 px-5 pb-5 pt-6 text-white shadow-lg">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-serif italic text-4xl leading-tight">Jaya Dhaba 🍛</h1>
              <p className="mt-1 text-sm font-semibold text-white/85">Fresh from the kitchen, ordered from your table.</p>
            </div>
            <div className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-black uppercase tracking-widest text-orange-700 shadow">
              {tableLabel}
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
          const qty = cart[item.id]?.qty || 0;
          const veg = isVeg(item);
          return (
            <article key={item.id} className="overflow-hidden rounded-[1.75rem] border border-orange-100 bg-white shadow-sm">
              <div className="aspect-[4/3] bg-amber-100">
                <img src={itemImage(item)} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`h-3 w-3 rounded-full ${veg ? 'bg-green-600' : 'bg-red-600'}`} />
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
                    {veg ? 'Veg' : 'Non-Veg'}
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
                <div key={line.item.id} className="flex items-center justify-between gap-3 rounded-2xl bg-amber-50 p-3">
                  <div>
                    <p className="font-bold text-amber-950">{line.item.name}</p>
                    <p className="text-sm text-amber-950/55">{formatMoney(line.item.price)} each</p>
                  </div>
                  <div className="flex items-center rounded-full bg-white text-orange-700 shadow-sm">
                    <button onClick={() => changeQty(line.item, -1)} className="grid h-10 w-10 place-items-center" aria-label={`Remove ${line.item.name}`}>
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
    </main>
  );
}
