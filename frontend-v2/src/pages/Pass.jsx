import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import Navbar from '../components/Navbar';
import { QRCodeSVG } from 'qrcode.react';
import { Download, ChevronLeft, ShieldCheck, Printer } from 'lucide-react';
import { motion } from 'framer-motion';

const Pass = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth(); // Added missing user from context
    const [booking, setBooking] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchPass = async () => {
            if (!id) {
                setError("No Pass ID provided.");
                setLoading(false);
                return;
            }

            try {
                console.log('🔍 Fetching pass for ID:', id);
                const data = await api.get(`/api/booking/user/pass/${id}`); 
                if (!data) {
                    throw new Error("Pass data is empty.");
                }
                console.log('✅ Successfully fetched booking data:', data);
                setBooking(data);
            } catch (err) {
                console.error('❌ Failed to fetch pass:', err);
                const errorMsg = err.response?.data?.error || err.message || "Failed to retrieve pass data.";
                setError(errorMsg);
            } finally {
                setLoading(false);
            }
        };
        fetchPass();
    }, [id]);

    const handlePrint = () => {
        window.print();
    };

    if (loading) {
        return <div className="h-screen w-screen flex items-center justify-center bg-slate-950 text-primary animate-pulse font-headline uppercase tracking-widest">Verifying Pass...</div>;
    }

    if (error || !booking) {
        return (
            <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-950 text-slate-400 gap-6 px-10 text-center">
                <div className="w-16 h-16 rounded-3xl bg-red-500/10 flex items-center justify-center border border-red-500/20 mb-2">
                    <ShieldCheck className="w-8 h-8 text-red-500/60" />
                </div>
                <h2 className="text-xl font-bold text-white uppercase tracking-widest">Access Denied</h2>
                <p className="max-w-xs">{error || "Pass not found or you don't have permission to view it."}</p>
                <button 
                    onClick={() => navigate('/dashboard')} 
                    className="mt-4 px-8 h-12 bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl text-white font-bold text-xs uppercase tracking-widest transition-all"
                >
                    Return to Dashboard
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col overflow-x-hidden print:bg-white">
            <div className="print:hidden">
                <Navbar />
            </div>

            <main className="flex-1 flex flex-col items-center justify-center p-8 relative">
                {/* Background Glows (Hidden in Print) */}
                <div className="absolute top-1/4 -left-20 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] print:hidden" />
                <div className="absolute bottom-1/4 -right-20 w-[500px] h-[500px] bg-secondary/5 rounded-full blur-[120px] print:hidden" />

                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full max-w-md z-10 print:max-w-none print:m-0"
                >
                    {/* Back Button (Hidden in Print) */}
                    <button 
                        onClick={() => navigate('/dashboard')}
                        className="mb-8 flex items-center gap-2 text-slate-500 hover:text-white transition-colors group print:hidden"
                    >
                        <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                        <span className="text-[10px] uppercase font-bold tracking-widest leading-none mt-0.5">Dashboard</span>
                    </button>

                    {/* Pass Card */}
                    <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/10 rounded-[48px] p-10 text-center relative overflow-hidden shadow-2xl print:bg-white print:border-slate-200 print:shadow-none print:text-black">
                        {/* Top Accent */}
                        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50 print:bg-primary" />

                        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full mb-8 print:border-emerald-500">
                             <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 print:text-emerald-600" />
                             <span className="text-emerald-400 font-black text-[9px] uppercase tracking-[0.2em] leading-none mt-0.5 print:text-emerald-600">Verified Delegate</span>
                        </div>

                        <h1 className="text-4xl font-black font-headline text-white mb-2 tracking-tight print:text-slate-900">Official Pass</h1>
                        <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mb-10 print:text-slate-500">
                            {booking.eventId?.title || "Event Access"}
                        </p>

                        {/* QR Code Section */}
                        <div className="relative inline-block mb-10">
                            <div className="bg-white p-5 rounded-[32px] shadow-2xl shadow-primary/20 relative z-10">
                                <QRCodeSVG 
                                    value={booking.qrData || booking._id} 
                                    size={180}
                                    level="H"
                                    includeMargin={false}
                                />
                            </div>
                            {/* Decorative Frame */}
                            <div className="absolute -inset-4 border border-white/5 rounded-[40px] print:hidden" />
                            <span className="absolute -bottom-8 left-0 right-0 text-[9px] font-black text-slate-600 uppercase tracking-[0.3em] print:text-slate-400">Scan at Entry</span>
                        </div>

                        {/* Details Grid */}
                        <div className="border-t border-white/5 mt-6 pt-10 grid grid-cols-2 gap-8 text-left print:border-slate-100">
                            <div className="flex flex-col gap-1">
                                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Attendee</span>
                                <span className="text-slate-100 text-sm font-bold print:text-slate-900 truncate">{booking.userId?.name || user?.name}</span>
                            </div>
                            <div className="flex flex-col gap-1 items-end">
                                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Secured Seat</span>
                                <span className="text-primary font-black font-headline text-3xl leading-none">{booking.seatId}</span>
                            </div>
                        </div>

                        <div className="mt-10 pt-4 border-t border-white/5 flex flex-col items-center print:border-slate-100">
                            <span className="text-[8px] font-mono text-slate-600 uppercase tracking-widest">Pass ID</span>
                            <span className="text-[10px] font-mono text-slate-400 font-bold mt-1 uppercase print:text-slate-500">
                                FX-{booking.paymentId?.substring(0, 8).toUpperCase() || booking._id.substring(0, 8).toUpperCase()}
                            </span>
                        </div>
                    </div>

                    {/* Actions (Hidden in Print) */}
                    <div className="mt-8 flex gap-4 print:hidden">
                        <button 
                            onClick={handlePrint}
                            className="flex-1 h-14 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl flex items-center justify-center gap-3 text-slate-300 font-bold text-xs uppercase tracking-widest transition-all"
                        >
                            <Printer className="w-4 h-4" /> Print Pass
                        </button>
                        <button 
                            onClick={handlePrint}
                            className="flex-1 h-14 bg-primary text-white rounded-2xl flex items-center justify-center gap-3 font-bold text-xs uppercase tracking-widest shadow-xl shadow-primary/20 hover:bg-primary-dim transition-all"
                        >
                            <Download className="w-4 h-4" /> Save PDF
                        </button>
                    </div>
                    <p className="text-center text-[10px] text-slate-600 mt-8 uppercase font-bold tracking-[0.2em] print:hidden">
                        © 2026 GEI Department of Electronics
                    </p>
                </motion.div>
            </main>
        </div>
    );
};

export default Pass;
