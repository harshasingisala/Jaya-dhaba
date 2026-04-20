import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import Navbar from '../components/Navbar';
import { Calendar, MapPin, Ticket, ShieldCheck, ChevronRight, Info } from 'lucide-react';
import { motion } from 'framer-motion';

const Event = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [event, setEvent] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchEvent = async () => {
            try {
                const data = await api.get(`/api/events/${id}`);
                setEvent(data);
            } catch (err) {
                console.error('Failed to fetch event:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchEvent();
    }, [id]);

    if (loading) return <div className="h-screen w-screen flex items-center justify-center bg-slate-950 text-primary animate-pulse font-headline uppercase tracking-widest text-sm">Initializing Session...</div>;

    if (!event) return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-950 text-slate-500 gap-8">
            <p className="text-sm font-bold uppercase tracking-widest">Target event not found in database.</p>
            <button onClick={() => navigate('/dashboard')} className="px-8 h-12 bg-primary text-white rounded-2xl font-bold uppercase tracking-widest shadow-xl shadow-primary/20">Return Home</button>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col overflow-x-hidden">
            <Navbar />

            <main className="flex-1 max-w-[1200px] mx-auto w-full p-8 md:p-12">
                <div className="flex flex-col lg:flex-row gap-16 items-start">
                    
                    {/* Left: Event Banner & Quick Stats */}
                    <motion.div 
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="w-full lg:w-1/2 space-y-10"
                    >
                        <div className="relative aspect-[4/5] rounded-[60px] overflow-hidden border border-white/10 shadow-2xl group">
                            <img 
                                src={event.banner || 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&q=80&w=1000'} 
                                alt={event.title}
                                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent" />
                            
                            {/* Live Badge */}
                            <div className="absolute top-8 right-8 flex items-center gap-2 px-4 py-2 bg-emerald-500/20 border border-emerald-500/40 rounded-full backdrop-blur-md">
                                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                <span className="text-[10px] text-emerald-400 font-black uppercase tracking-widest mt-0.5">Registration Open</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="p-6 rounded-3xl bg-slate-900/40 border border-white/5 flex flex-col gap-2">
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Entry Fee</span>
                                <span className="text-2xl font-black text-white">₹{event.price || 'FREE'}</span>
                            </div>
                            <div className="p-6 rounded-3xl bg-slate-900/40 border border-white/5 flex flex-col gap-2">
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Availability</span>
                                <span className="text-2xl font-black text-primary">LIVE NOW</span>
                            </div>
                        </div>
                    </motion.div>

                    {/* Right: Content & Action */}
                    <motion.div 
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="w-full lg:w-1/2 space-y-12 lg:pt-10"
                    >
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 bg-slate-950/50 border border-white/5 px-4 py-1.5 rounded-full w-fit">
                                <ShieldCheck className="w-4 h-4 text-primary" />
                                <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-0.5">Official University Event</span>
                            </div>
                            <h1 className="text-5xl font-black font-headline text-white tracking-tight leading-[1.1]">
                                {event.title}
                            </h1>
                        </div>

                        <div className="space-y-6">
                            <div className="flex items-center gap-6 p-6 rounded-3xl bg-slate-900/20 border border-white/5 group hover:border-primary/20 transition-all cursor-default">
                                <div className="w-12 h-12 bg-slate-950 rounded-2xl flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                    <Calendar className="w-6 h-6" />
                                </div>
                                <div>
                                    <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Date & Time</h4>
                                    <p className="text-lg font-bold text-white uppercase tracking-tight">{new Date(event.date).toLocaleString([], { dateStyle: 'full' })}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-6 p-6 rounded-3xl bg-slate-900/20 border border-white/5 group hover:border-primary/20 transition-all cursor-default">
                                <div className="w-12 h-12 bg-slate-950 rounded-2xl flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                    <MapPin className="w-6 h-6" />
                                </div>
                                <div>
                                    <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Location</h4>
                                    <p className="text-lg font-bold text-white uppercase tracking-tight">{event.location || 'College Auditorium'}</p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-8 pt-8">
                            <div className="flex flex-col gap-2">
                                <h4 className="flex items-center gap-3 text-[10px] text-slate-500 font-black uppercase tracking-widest leading-none">
                                    <Info className="w-3.5 h-3.5" /> About this session
                                </h4>
                                <p className="text-slate-400 leading-relaxed text-base italic font-serif">
                                    "{event.description || 'This exclusive session covers the foundational and advanced aspects of our subject, with industry experts providing real-world context and hands-on demonstrations.'}"
                                </p>
                            </div>

                            <div className="flex flex-col gap-4">
                                <button 
                                    onClick={() => navigate(`/seats/${event._id}`)}
                                    className="w-full h-20 bg-primary text-white rounded-[28px] font-black text-lg uppercase tracking-[0.2em] shadow-2xl shadow-primary/30 hover:bg-primary-dim hover:shadow-primary/50 transition-all duration-300 flex items-center justify-center gap-4 group"
                                >
                                    <Ticket className="w-6 h-6 group-hover:scale-110 transition-transform" />
                                    Choose Your Seat
                                    <ChevronRight className="w-5 h-5 group-hover:translate-x-1.5 transition-transform" />
                                </button>
                                <p className="text-center text-[9px] text-slate-600 uppercase font-black tracking-widest animate-fade-in">
                                    Finalizing seat locks in 250ms...
                                </p>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </main>
        </div>
    );
};

export default Event;
