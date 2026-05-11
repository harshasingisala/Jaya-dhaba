import React, { useState, useEffect } from 'react';
import { ShoppingBag, CreditCard, MapPin, Phone, ArrowLeft, Loader2, Sparkles, CheckCircle2, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import api from '../api';
import { apiUrl } from '../api/config';

export default function Checkout() {
  const { cart, getTotal, clearCart, isOffline } = useApp();
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('idle');
  const [orderComplete, setOrderComplete] = useState(null);
  const [checkoutError, setCheckoutError] = useState(null);
  const [paymentMode, setPaymentMode] = useState('Online');
  const [details, setDetails] = useState({
    name: '',
    phone: '',
    address: 'East Marredpally, Secunderabad',
    type: 'Dine-in',
    occasion: 'None'
  });
  const [coupon, setCoupon] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const token = (() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || 'null');
      return u?.access_token || u?.token || '';
    } catch { return ''; }
  })();
  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  })();
  const setError = (message) => setCheckoutError(message);
  const fetchWithRetry = async (url, options) => {
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await fetch(apiUrl(url), { ...options, credentials: 'include' });
      } catch (err) {
        lastError = err;
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }
    throw lastError;
  };
  const resolveCsrfToken = async () => {
    const csrf = await fetch(apiUrl('/api/csrf-token'), {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    if (!csrf.ok) throw new Error('Unable to prepare secure checkout.');
    const data = await csrf.json();
    return data?.data?.csrfToken || data?.csrfToken;
  };

  async function handlePayment(actualOrderId, ourOrderId, amount, publicToken) {
    setStatus('loading')
    try {
      const amountValue = Number(amount)
      const csrfToken = await resolveCsrfToken()
      const res = await fetchWithRetry('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({
          order_id: actualOrderId,
          order_number: ourOrderId,
          amount: amountValue,
          total: amountValue,
          customer_name: details.name || user?.name || ''
        })
      })
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(errorBody.message || errorBody.error || 'Unable to create Razorpay order.');
      }
      const { razorpay_order_id, amount: razorpayAmount, currency, key_id } = await res.json()
      if (typeof window.Razorpay === 'undefined')
        throw new Error('Payment system loading. Please wait 2 seconds and try again. Call 73861 85823 if this persists.')
      const rzp = new window.Razorpay({
        key: key_id, amount: razorpayAmount, currency, order_id: razorpay_order_id,
        name: 'Jaya Dhaba', description: 'Heritage Kitchen · East Marredpally, Hyderabad',
        image: '/logo.png', prefill: { name: user?.name || '', contact: user?.phone || '' },
        theme: { color: '#B8860B' },
        handler: async (resp) => {
          const verifyCsrfToken = await resolveCsrfToken()
          const vRes = await fetchWithRetry('/api/payments/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'X-CSRF-Token': verifyCsrfToken },
            body: JSON.stringify({ ...resp, our_order_id: ourOrderId })
          })
          if (vRes.ok) {
            clearCart();
            navigate(`/track?id=${actualOrderId}&token=${encodeURIComponent(publicToken || '')}`)
          }
          else {
            const errorBody = await vRes.json().catch(() => ({}));
            setError(errorBody.message || 'Payment response received, but server verification failed. Please contact the restaurant before retrying payment.')
          }
          setStatus('idle')
        },
        modal: { ondismiss: () => { setStatus('idle'); setError('Payment cancelled.') } }
      })
      rzp.on('payment.failed', (r) => { setError(`Payment failed: ${r.error.description}`); setStatus('idle') })
      rzp.open()
    } catch (e) { setError(e.message || 'Payment unavailable. Please call us.'); setStatus('idle') }
  }

  useEffect(() => {
    let timer;
    if (orderComplete) {
      timer = setTimeout(() => {
        navigate(`/track?id=${orderComplete.id}&token=${encodeURIComponent(orderComplete.public_token || '')}`);
      }, 3000);
    }
    return () => clearTimeout(timer);
  }, [orderComplete, navigate]);

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    setCheckoutError(null);
    try {
      if (isOffline || !navigator.onLine) {
        throw new Error('You are offline. This order has not been sent; your cart is saved on this device. Reconnect and try again.');
      }
      const orderData = {
        items: cart,
        customer_name: details.name,
        table_number: details.type,
        payment_mode: paymentMode,
        total: Math.round((getTotal() - (appliedCoupon?.discount || 0)) * 1.05),
        notes: details.occasion !== 'None' ? details.occasion : '',
      };

      const res = await api.createOrder(orderData);
      if (paymentMode === 'Online') {
        if (!res.order_number) throw new Error('Order number missing for payment. Please retry.');
        const orderAmount = Number(res.total ?? res.total_amount ?? orderData.total ?? 0)
        if (!orderAmount || Number.isNaN(orderAmount)) throw new Error('Order total missing for payment. Please retry.');
        await handlePayment(res.id, res.order_number, orderAmount, res.public_token);
      } else {
        setOrderComplete(res);
        clearCart();
      }
    } catch (err) {
      setCheckoutError(err.message || 'The culinary gates are temporarily closed. Please try calling us directly at 73861 85823.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (orderComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center p-10 heritage-stone-bg relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-tr from-heritage-terracotta/5 via-transparent to-heritage-gold/5 pointer-events-none" />
        <div className="max-w-2xl w-full bg-white/40 backdrop-blur-3xl p-16 rounded-[4rem] border border-heritage-espresso/5 shadow-2xl text-center space-y-10 animate-in fade-in slide-in-from-bottom-10 duration-700">
          <div className="w-24 h-24 bg-heritage-accent/10 rounded-full flex items-center justify-center mx-auto text-heritage-accent group">
            <CheckCircle2 size={48} className="group-hover:scale-110 transition-transform" />
          </div>
          <div className="space-y-4">
            <p className="text-heritage-gold font-black uppercase tracking-[0.6em] text-[10px]">Order Masterpiece Confirmed</p>
            <h2 className="text-5xl font-serif italic text-heritage-espresso">Initiating Live Tracking</h2>
            <p className="text-sm font-medium text-heritage-espresso/60 leading-relaxed italic max-sm mx-auto">
              Redirecting you to the kitchen monitor in 3 seconds... Your journey ID is #{orderComplete.order_number || orderComplete.id}
            </p>
          </div>
          <div className="bg-heritage-stone/40 p-8 rounded-3xl border border-heritage-espresso/5 flex items-center justify-between">
            <div className="text-left">
              <p className="text-[9px] font-black uppercase tracking-widest text-heritage-espresso/30">Order Heritage ID</p>
              <p className="text-sm font-bold text-heritage-espresso">#{orderComplete.order_number || orderComplete.id}</p>
            </div>
            <button
              onClick={() => navigate(`/track?id=${orderComplete.id}&token=${encodeURIComponent(orderComplete.public_token || '')}`)}
              className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-heritage-gold hover:text-heritage-espresso transition-colors"
            >
              Go Now →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen heritage-stone-bg relative overflow-hidden py-20 px-6">
      <div className="absolute inset-0 bg-gradient-to-tr from-heritage-terracotta/5 via-transparent to-heritage-gold/5 pointer-events-none" />

      <div className="max-w-7xl mx-auto">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.5em] text-heritage-espresso/30 hover:text-heritage-gold transition-all mb-12 group"
        >
          <ArrowLeft size={14} className="group-hover:-translate-x-2 transition-transform" /> Back to Heritage
        </button>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-16 items-start">

          {/* LEFT: ORDERING FORM */}
          <div className="xl:col-span-7 space-y-12 animate-in fade-in slide-in-from-left-8 duration-1000">
            <div>
              <h1 className="text-6xl font-serif italic text-heritage-espresso leading-[0.9]">Finalizing <br /> <span className="text-heritage-gold">The Journey</span></h1>
              <p className="text-sm font-medium text-heritage-espresso/40 italic mt-6 max-w-sm">Provide your details to initiate the culinary craftsmanship at our Secunderabad kitchen.</p>
            </div>

            <div className="bg-white/40 backdrop-blur-2xl p-10 md:p-14 rounded-[4rem] border border-heritage-espresso/5 shadow-2xl space-y-10">
              <form onSubmit={handlePlaceOrder} className="space-y-10">
                <div className="space-y-10">
                  <div className="relative group">
                    <label className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/40 pl-6 mb-2 block">Guest Identification</label>
                    <div className="relative">
                      <Sparkles size={16} className="absolute left-6 top-1/2 -translate-y-1/2 text-heritage-espresso/20" />
                      <input
                        required
                        placeholder="Enter your name"
                        className="w-full bg-white/50 border border-heritage-espresso/5 pl-14 pr-8 py-5 rounded-3xl outline-none focus:bg-white focus:border-heritage-gold transition-all font-bold text-heritage-espresso text-sm"
                        value={details.name}
                        onChange={e => setDetails({ ...details, name: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="relative group">
                    <label className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/40 pl-6 mb-2 block">Contact Line</label>
                    <div className="relative">
                      <Phone size={16} className="absolute left-6 top-1/2 -translate-y-1/2 text-heritage-espresso/20" />
                      <input
                        required
                        placeholder="10-digit phone number"
                        className="w-full bg-white/50 border border-heritage-espresso/5 pl-14 pr-8 py-5 rounded-3xl outline-none focus:bg-white focus:border-heritage-gold transition-all font-bold text-heritage-espresso text-sm"
                        value={details.phone}
                        onChange={e => setDetails({ ...details, phone: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/40 pl-6 block">Order Type & Occasion</label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => setDetails({ ...details, type: 'Dine-in' })}
                        className={`p-6 rounded-3xl border font-black text-[9px] uppercase tracking-widest transition-all ${details.type === 'Dine-in' ? 'bg-heritage-espresso text-white border-heritage-espresso shadow-lg' : 'bg-white/50 border-heritage-espresso/5 text-heritage-espresso/40'}`}
                      >
                        🍽️ Dine-in
                      </button>
                      <button
                        type="button"
                        onClick={() => setDetails({ ...details, type: 'Parcel' })}
                        className={`p-6 rounded-3xl border font-black text-[9px] uppercase tracking-widest transition-all ${details.type === 'Parcel' ? 'bg-heritage-espresso text-white border-heritage-espresso shadow-lg' : 'bg-white/50 border-heritage-espresso/5 text-heritage-espresso/40'}`}
                      >
                        📦 Parcel
                      </button>
                    </div>
                    <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                      {['None', 'Birthday', 'Anniversary', 'Promotion'].map(occ => (
                        <button
                          key={occ}
                          type="button"
                          onClick={() => setDetails({ ...details, occasion: occ })}
                          className={`px-8 py-4 rounded-full border text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${details.occasion === occ ? 'bg-heritage-gold text-white border-heritage-gold shadow-lg' : 'bg-white/50 border-heritage-espresso/5 text-heritage-espresso/40'}`}
                        >
                          {occ === 'None' ? '🍃 Normal' : occ === 'Birthday' ? '🎂 Birthday' : occ === 'Anniversary' ? '💑 Anniversary' : '🎉 Promotion'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4 p-8 bg-heritage-stone/30 rounded-[3rem] border border-heritage-espresso/5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/40 pl-2 block">Settlement Method</label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => setPaymentMode('Online')}
                        className={`p-6 rounded-3xl border font-black text-[9px] uppercase tracking-widest transition-all ${paymentMode === 'Online' ? 'bg-heritage-gold text-white border-heritage-gold shadow-lg' : 'bg-white/50 border-heritage-espresso/5 text-heritage-espresso/40'}`}
                      >
                        💳 Online Payment
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMode('Cash')}
                        className={`p-6 rounded-3xl border font-black text-[9px] uppercase tracking-widest transition-all ${paymentMode === 'Cash' ? 'bg-heritage-gold text-white border-heritage-gold shadow-lg' : 'bg-white/50 border-heritage-espresso/5 text-heritage-espresso/40'}`}
                      >
                        💵 Cash on Counter
                      </button>
                    </div>
                  </div>

                  {checkoutError && (
                    <div className="p-6 bg-red-50 border border-red-200 rounded-[2rem] flex items-start gap-4 animate-in fade-in slide-in-from-top-4">
                      <Info size={20} className="text-red-500 mt-1 shrink-0" />
                      <div className="space-y-1 text-left">
                        <p className="text-[10px] font-black uppercase tracking-widest text-red-600 font-sans">Kitchen Communication Error</p>
                        <p className="text-xs font-bold text-red-700/60 leading-relaxed font-sans">{checkoutError}</p>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  disabled={isProcessing || status === 'loading' || cart.length === 0}
                  className="w-full py-6 bg-heritage-terracotta text-white rounded-[2.5rem] font-black text-[10px] uppercase tracking-[0.5em] shadow-xl hover:bg-heritage-espresso transition-all active:scale-95 flex items-center justify-center gap-4 disabled:opacity-50"
                >
                  {isProcessing || status === 'loading' ? <Loader2 size={16} className="animate-spin" /> : 'Confirm Order & Pay →'}
                </button>
              </form>
            </div>
          </div>

          {/* RIGHT: BASKET SUMMARY */}
          <div className="xl:col-span-5 space-y-10 animate-in fade-in slide-in-from-right-8 duration-1000 delay-300">
            <div className="bg-heritage-espresso rounded-[4rem] p-12 text-white shadow-2xl space-y-10 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 blur-3xl" />
              <div className="flex justify-between items-center relative z-10">
                <h3 className="text-2xl font-serif italic">Your Selection</h3>
                <span className="text-[10px] font-black uppercase tracking-widest text-white/30">{cart.length} Masterpieces</span>
              </div>

              <div className="space-y-6 relative z-10 max-h-[400px] overflow-y-auto no-scrollbar pr-2">
                {cart.map((item, i) => (
                  <div key={`${item.id}-${i}`} className="flex justify-between items-center border-b border-white/5 pb-6 last:border-0 last:pb-0">
                    <div className="flex items-center gap-6">
                      <div className="w-16 h-16 rounded-2xl bg-white/10 overflow-hidden border border-white/10 shrink-0">
                        <img src={item.image || '/biryani.png'} className="w-full h-full object-cover" alt={item.name} />
                      </div>
                      <div>
                        <p className="font-serif italic text-lg">{item.name}</p>
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Qty: {item.qty} × ₹{item.price}</p>
                      </div>
                    </div>
                    <p className="font-serif italic text-heritage-gold">₹{item.price * item.qty}</p>
                  </div>
                ))}
                {cart.length === 0 && (
                  <div className="py-10 text-center opacity-30 italic font-serif text-xl font-medium">Your basket is waiting for a story.</div>
                )}
              </div>

              <div className="pt-10 border-t border-white/10 space-y-6 relative z-10">
                {/* COUPON INPUT */}
                <div className="relative">
                  <input
                    placeholder="Heritage Code (e.g. JAYA20)"
                    className="w-full bg-white/5 border border-white/10 pl-6 pr-24 py-4 rounded-2xl outline-none focus:bg-white/10 focus:border-heritage-gold transition-all font-bold text-white text-[10px] uppercase tracking-widest"
                    value={coupon}
                    onChange={e => setCoupon(e.target.value.toUpperCase())}
                  />
                  <button
                    onClick={async () => {
                      setIsApplying(true);
                      try {
                        const res = await api.applyCoupon(coupon, getTotal());
                        setAppliedCoupon(res);
                        alert(`Masterpiece Code Applied: ${res.title}`);
                      } catch (e) {
                        alert(e.message || "Code not recognized by the vault.");
                      } finally {
                        setIsApplying(false);
                      }
                    }}
                    disabled={isApplying || !coupon}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-heritage-gold text-white rounded-xl text-[8px] font-black uppercase tracking-widest disabled:opacity-50"
                  >
                    {isApplying ? '...' : 'Apply'}
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center text-white/40">
                    <span className="text-[10px] font-black uppercase tracking-widest">Kitchen Subtotal</span>
                    <span className="text-sm font-bold">₹{getTotal()}</span>
                  </div>
                  {appliedCoupon && (
                    <div className="flex justify-between items-center text-heritage-gold">
                      <span className="text-[10px] font-black uppercase tracking-widest">Masterpiece Discount</span>
                      <span className="text-sm font-bold">-₹{appliedCoupon.discount}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-white/40">
                    <span className="text-[10px] font-black uppercase tracking-widest">Heritage Tax (GST)</span>
                    <span className="text-sm font-bold">₹{Math.round((getTotal() - (appliedCoupon?.discount || 0)) * 0.05)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-6 border-t border-white/20">
                    <span className="text-sm font-black uppercase tracking-[0.3em]">Grand Total</span>
                    <span className="text-3xl font-serif italic text-heritage-gold">₹{Math.round((getTotal() - (appliedCoupon?.discount || 0)) * 1.05)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-heritage-stone/40 p-10 rounded-[4rem] border border-heritage-espresso/5 shadow-xl space-y-6">
              <div className="flex items-center gap-4 text-heritage-espresso/40">
                <MapPin size={18} />
                <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed">Secunderabad Space: East Marredpally, East Nehru Nagar</p>
              </div>
              <div className="flex items-center gap-4 text-heritage-espresso/40">
                <CreditCard size={18} />
                <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed">Secure Digital Transaction • Encrypted Heritage Records</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
