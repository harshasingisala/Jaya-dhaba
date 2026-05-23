import React, { useState, useEffect } from 'react';
import { Search, Package, ChefHat, CheckSquare, House, ArrowRight, Loader2, Sparkles, Info, ShoppingBag, PartyPopper, Star } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../api';
import { apiUrl } from '../api/config';
import { createManagedEventSource } from '../api/realtime';

const statusSteps = [
   { id: 'Placed', label: 'Order Placed', icon: <Package size={18} />, desc: 'Harvesting ingredients at Secunderabad' },
   { id: 'Confirmed', label: 'Payment Confirmed', icon: <CheckSquare size={18} />, desc: 'The order is secured in the kitchen ledger' },
   { id: 'Preparing', label: 'In the Fire', icon: <ChefHat size={18} />, desc: 'Slow-cooking in our heritage tandoors' },
   { id: 'Plating', label: 'Plating Art', icon: <Sparkles size={18} />, desc: 'Final garnish and heritage aesthetics' },
   { id: 'Ready', label: 'Quality Check', icon: <CheckSquare size={18} />, desc: 'Final verification before serving' },
   { id: 'Served', label: 'Enjoying', icon: <House size={18} />, desc: 'Served with ancestral hospitality' },
];

export default function Track() {
   const [orderIdInput, setOrderIdInput] = useState('');
   const [order, setOrder] = useState(null);
   const [isLoading, setIsLoading] = useState(false);
   const [error, setError] = useState(null);
   const [showThankYou, setShowThankYou] = useState(false);
   const [rating, setRating] = useState(5);
   const [ratingComment, setRatingComment] = useState('');
   const [ratingStatus, setRatingStatus] = useState('');
   const [ratingOpen, setRatingOpen] = useState(false);
   const location = useLocation();
   const navigate = useNavigate();

   useEffect(() => {
      const params = new URLSearchParams(location.search);
      const id = params.get('id');
      const token = params.get('token') || '';
      if (id) {
         setOrderIdInput(id);
         fetchOrder(id, token);
      }
   }, [location]);

   useEffect(() => {
      if (!order) return;

      const params = new URLSearchParams(location.search);
      const token = params.get('token') || '';
      const streamUrl = apiUrl(`/api/orders/${order.id}/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`);
      const stream = createManagedEventSource(streamUrl, {
         events: ['order.created', 'order.updated'],
         onRefresh: () => fetchOrder(order.id, token, { preserveCurrent: true }),
      });

      return () => stream.close();
   }, [order?.id, location.search]);

   useEffect(() => {
      if (order?.status !== 'Served') return undefined;
      setShowThankYou(true);
      const timer = window.setTimeout(() => setShowThankYou(false), 5000);
      return () => window.clearTimeout(timer);
   }, [order?.status]);

   const fetchOrder = async (id, token = '', options = {}) => {
      if (!options.preserveCurrent) setIsLoading(true);
      setError(null);
      if (!options.preserveCurrent) setOrder(null);
      try {
         const res = await api.getOrder(id, token);
         setOrder(res);
      } catch (err) {
         console.error('[JAYA_DEBUG] Caught error in fetchOrder:', err);
         setError('This secure tracking link is invalid or expired. Please use the link from your order confirmation.');
      } finally {
         setIsLoading(false);
      }
   };

   const handleSearch = (e) => {
      e.preventDefault();
      if (orderIdInput) {
         navigate(`/track?id=${orderIdInput}`);
         fetchOrder(orderIdInput);
      }
   };

   const shareReceipt = () => {
      if (!order) return;
      const lines = [
         'Jaya Dhaba Receipt',
         `Order: #${order.order_number || order.id}`,
         `Guest: ${order.customer_name || order.guest_name || 'Guest'}`,
         `Status: ${order.status}`,
         `Payment: ${order.payment_method || 'Not recorded'}`,
         '',
         'Items:',
         ...(order.items || []).map((item) => {
            const qty = item.qty || item.quantity || 1;
            const price = Number(item.price || item.unit_price || 0);
            return `- ${qty} x ${item.name} = Rs ${price * qty}`;
         }),
         '',
         `Subtotal: Rs ${order.subtotal || order.total || 0}`,
         order.tax ? `Tax: Rs ${order.tax}` : '',
         `Total: Rs ${order.total || 0}`,
         '',
         'Thank you for coming to Jaya Dhaba. What a wonderful experience it was serving you.',
      ].filter(Boolean);
      window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener,noreferrer');
   };

   const submitRating = async () => {
      if (!order?.order_number) {
         setRatingStatus('Order number missing. Please refresh the tracking link.');
         return;
      }
      setRatingStatus('Saving...');
      try {
         await api.submitOrderFeedback({
            orderNumber: order.order_number,
            rating,
            comment: ratingComment,
         });
         setRatingStatus('Thank you. Your experience has been recorded.');
         setRatingOpen(false);
      } catch {
         setRatingStatus('Rating could not be saved. Please try again.');
      }
   };

   const foundStepIndex = statusSteps.findIndex(s => s.id === order?.status);
   const currentStepIndex = foundStepIndex >= 0 ? foundStepIndex : 0;

   return (
      <div className="min-h-screen heritage-stone-bg relative overflow-hidden py-20 px-6">
         <div className="absolute inset-0 bg-gradient-to-tr from-heritage-terracotta/5 via-transparent to-heritage-gold/5 pointer-events-none" />
         {showThankYou && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-heritage-espresso/45 backdrop-blur-sm px-6 animate-in fade-in duration-300">
               <div className="bg-white rounded-[3rem] border border-heritage-gold/30 shadow-2xl max-w-lg w-full p-10 text-center space-y-5">
                  <div className="w-20 h-20 mx-auto rounded-[2rem] bg-heritage-gold text-white flex items-center justify-center shadow-xl">
                     <PartyPopper size={38} />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.45em] text-heritage-gold">Enjoying</p>
                  <h2 className="text-4xl font-serif italic text-heritage-espresso leading-tight">Thank you for coming to Jaya Dhaba</h2>
                  <p className="text-sm font-bold text-heritage-espresso/45">We hope this meal feels like a wonderful memory already.</p>
               </div>
            </div>
         )}

         <div className="max-w-4xl mx-auto space-y-16 relative z-10">

            <div className="text-center space-y-6">
               <span className="text-heritage-gold font-black uppercase tracking-[0.6em] text-[10px] block animate-in fade-in duration-700">Live Journey Tracking</span>
               <h1 className="text-6xl font-serif italic text-heritage-espresso leading-none">The Path to <br /> <span className="text-heritage-gold">Your Feast</span></h1>
            </div>

            {/* SEARCH BAR */}
            <div className="max-w-xl mx-auto">
               <form onSubmit={handleSearch} className="relative group">
                  <Search size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-heritage-espresso/20 group-focus-within:text-heritage-gold transition-colors" />
                  <input
                     placeholder="Enter your Heritage Order ID..."
                     className="w-full bg-white/40 backdrop-blur-xl border border-heritage-espresso/5 pl-16 pr-40 py-6 rounded-[2.5rem] outline-none focus:bg-white focus:border-heritage-gold transition-all font-bold text-heritage-espresso text-sm shadow-xl"
                     value={orderIdInput}
                     onChange={e => setOrderIdInput(e.target.value)}
                  />
                  <button
                     disabled={isLoading}
                     className="absolute right-3 top-1/2 -translate-y-1/2 px-8 py-3 bg-heritage-espresso text-white rounded-full text-[9px] font-black uppercase tracking-widest hover:bg-heritage-gold transition-all flex items-center gap-3"
                  >
                     {isLoading ? <Loader2 size={12} className="animate-spin" /> : 'Locate'}
                     {!isLoading && <ArrowRight size={12} />}
                  </button>
               </form>
            </div>

            {order ? (
               <div className="space-y-10 animate-in fade-in slide-in-from-bottom-10 duration-1000">
                  {/* TRACKING CARD */}
                  <div className="bg-white/40 backdrop-blur-2xl p-12 md:p-16 rounded-[4rem] border border-heritage-espresso/5 shadow-2xl space-y-16">
                     <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-10 border-b border-heritage-espresso/5">
                        <div className="space-y-1">
                           <p className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/30">Order Heritage ID</p>
                           <h3 className="text-3xl font-serif italic text-heritage-espresso">#{order.order_number || order.id}</h3>
                        </div>
                        <div className="text-right">
                           <p className="text-[10px] font-black uppercase tracking-widest text-heritage-gold mb-1">Live Status</p>
                           <span className="px-6 py-2 bg-heritage-espresso text-white rounded-full text-[9px] font-black uppercase tracking-widest">
                              {order.status}
                           </span>
                        </div>
                     </div>

                     {/* ETA ESTIMATOR */}
                     {order.status !== 'Served' && (
                        <div className="bg-heritage-gold/5 p-6 rounded-3xl border border-heritage-gold/10 flex justify-between items-center">
                           <div className="flex gap-4 items-center">
                              <div className="w-10 h-10 rounded-full bg-heritage-gold flex items-center justify-center text-white">
                                 <Loader2 size={16} className="animate-spin" />
                              </div>
                              <div>
                                 <p className="text-[9px] font-black uppercase tracking-widest text-heritage-espresso/40">Estimated Arrival</p>
                                 <p className="text-xl font-serif italic text-heritage-espresso">
                                    {order.status === 'Placed' ? '15-20 mins' :
                                       order.status === 'Preparing' ? '8-12 mins' :
                                          order.status === 'Plating' ? '3-5 mins' : 'Imminent'}
                                 </p>
                              </div>
                           </div>
                           <div className="text-right">
                              <p className="text-[8px] font-black uppercase tracking-widest text-heritage-gold">Kitchen Intensity</p>
                              <p className="text-[10px] font-bold text-heritage-espresso">Stable (Optimal Flow)</p>
                           </div>
                        </div>
                     )}

                     {/* TIMELINE */}
                     <div className="grid grid-cols-1 md:grid-cols-4 gap-12 relative">
                        {/* Connector Line (Desktop) */}
                        <div className="hidden md:block absolute top-10 left-10 right-10 h-0.5 bg-heritage-espresso/5 -z-10" />
                        <div
                           className="hidden md:block absolute top-10 left-10 h-0.5 bg-heritage-gold transition-all duration-1000 -z-10"
                           style={{ width: `${(currentStepIndex / Math.max(1, statusSteps.length - 1)) * 85}%` }}
                        />

                        {statusSteps.map((step, index) => {
                           const isActive = index <= currentStepIndex;
                           const isCurrent = index === currentStepIndex;

                           return (
                              <div key={step.id} className="relative space-y-6 text-center group">
                                 <div className={`w-20 h-20 rounded-[2rem] mx-auto flex items-center justify-center transition-all duration-700 ${isActive ? 'bg-heritage-espresso text-heritage-gold shadow-2xl scale-110' : 'bg-heritage-stone text-heritage-espresso/20'}`}>
                                    {step.icon}
                                    {isCurrent && (
                                       <div className="absolute inset-0 rounded-[2.2rem] border-2 border-heritage-gold animate-ping opacity-20" />
                                    )}
                                 </div>
                                 <div className="space-y-2">
                                    <p className={`text-[10px] font-black uppercase tracking-widest ${isActive ? 'text-heritage-espresso' : 'text-heritage-espresso/20'}`}>{step.label}</p>
                                    <p className="text-[9px] font-medium text-heritage-espresso/40 italic leading-relaxed">{step.desc}</p>
                                 </div>
                              </div>
                           );
                        })}
                     </div>
                  </div>

                  {/* ORDER SUMMARY PREVIEW */}
                  <div className="bg-heritage-espresso rounded-[4rem] p-12 text-white shadow-2xl flex flex-col md:flex-row justify-between items-center gap-10 overflow-hidden relative group">
                     <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 blur-3xl" />
                     <div className="flex gap-8 items-center relative z-10">
                        <div className="w-20 h-20 rounded-3xl bg-white/10 flex items-center justify-center text-heritage-gold relative shrink-0">
                           <Sparkles size={32} />
                           <div className="absolute -top-1 -right-1 w-6 h-6 bg-heritage-terracotta rounded-full flex items-center justify-center text-[10px] font-black text-white">{order.items?.length || 0}</div>
                        </div>
                        <div>
                           <p className="text-xl font-serif italic">Culinary Investment</p>
                           <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Secured via Digital Ledger</p>
                        </div>
                     </div>
                     <div className="text-right relative z-10 transition-transform group-hover:translate-x-[-20px]">
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1">Total Valuation</p>
                        <p className="text-4xl font-serif italic text-heritage-gold leading-none">₹{order.total || 0}</p>
                     </div>
                  </div>

                  {/* POST-SERVICE ACTIONS */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <button
                        onClick={shareReceipt}
                        className="bg-white/40 backdrop-blur-xl p-8 rounded-3xl border border-heritage-espresso/5 flex items-center justify-center gap-4 text-[10px] font-black uppercase tracking-widest text-heritage-espresso hover:bg-white transition-all shadow-xl"
                     >
                        <ShoppingBag size={18} className="text-heritage-gold" />
                        Share WhatsApp Receipt
                     </button>
                     {order.status === 'Served' && (
                        <button onClick={() => setRatingOpen(true)} className="bg-heritage-gold text-white p-8 rounded-3xl flex items-center justify-center gap-4 text-[10px] font-black uppercase tracking-widest hover:bg-heritage-espresso transition-all shadow-xl shadow-heritage-gold/20">
                           <Sparkles size={18} />
                           Rate Your Experience
                        </button>
                     )}
                  </div>

                  {ratingOpen && (
                     <div className="bg-white rounded-[3rem] border border-heritage-espresso/5 p-8 shadow-xl space-y-5">
                        <div>
                           <p className="text-[10px] font-black uppercase tracking-widest text-heritage-gold">Guest feedback</p>
                           <h3 className="text-3xl font-serif italic text-heritage-espresso">Rate your experience</h3>
                        </div>
                        <div className="flex gap-2">
                           {[1, 2, 3, 4, 5].map((value) => (
                              <button
                                 key={value}
                                 onClick={() => setRating(value)}
                                 className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${rating >= value ? 'bg-heritage-gold text-white border-heritage-gold' : 'bg-white text-heritage-espresso/25 border-heritage-espresso/10'}`}
                              >
                                 <Star size={20} fill="currentColor" />
                              </button>
                           ))}
                        </div>
                        <textarea
                           value={ratingComment}
                           onChange={(event) => setRatingComment(event.target.value)}
                           maxLength={500}
                           placeholder="Anything we should remember for next time?"
                           className="w-full min-h-[110px] rounded-3xl border border-heritage-espresso/10 p-5 text-sm outline-none focus:border-heritage-gold"
                        />
                        <div className="flex flex-wrap items-center gap-3">
                           <button onClick={submitRating} className="px-6 py-4 rounded-full bg-heritage-espresso text-white text-[10px] font-black uppercase tracking-widest">Submit Rating</button>
                           <button onClick={() => setRatingOpen(false)} className="px-6 py-4 rounded-full bg-heritage-stone text-heritage-espresso text-[10px] font-black uppercase tracking-widest">Cancel</button>
                           {ratingStatus && <span className="text-xs font-bold text-heritage-espresso/45">{ratingStatus}</span>}
                        </div>
                     </div>
                  )}

                  <p className="text-center text-[10px] font-black uppercase tracking-widest text-heritage-espresso/20 italic">
                     Questions about your journey? Sunil Behera is ready at +91 73861 85821.
                  </p>
               </div>
            ) : error ? (
               <div className="py-20 text-center animate-in fade-in duration-700">
                  <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center mx-auto text-red-500 mb-8">
                     <Info size={32} />
                  </div>
                  <p className="text-xl font-serif italic text-heritage-espresso mb-4">Identification Error</p>
                  <p className="text-sm font-medium text-heritage-espresso/40 max-w-md mx-auto">{error}</p>
               </div>
            ) : !isLoading && (
               <div className="py-20 text-center animate-in fade-in duration-1000">
                  <div className="w-24 h-24 bg-heritage-stone/40 rounded-full flex items-center justify-center mx-auto text-heritage-espresso/10 mb-8">
                     <Package size={32} />
                  </div>
                  <p className="text-2xl font-serif italic text-heritage-espresso/20 italic">Enter your identification to track the flow of heritage.</p>
               </div>
            )}

         </div>

      </div>
   );
}
