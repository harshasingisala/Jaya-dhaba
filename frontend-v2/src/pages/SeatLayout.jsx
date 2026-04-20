import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import SeatGrid from '../components/SeatGrid';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import { Monitor, ChevronLeft } from 'lucide-react';
import emailjs from 'emailjs-com';

const SeatLayout = () => {
    const { id: eventId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [selectedSeat, setSelectedSeat] = useState(null);
    const [lockedSeats, setLockedSeats] = useState({});
    const [onlineCount, setOnlineCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const socketRef = useRef(null);

    const [formData, setFormData] = useState({
        name: user?.name || '',
        email: user?.email || '',
        branch: '',
        year: '',
        pin: ''
    });

    useEffect(() => {
        // Initialize Socket
        socketRef.current = io(import.meta.env.VITE_API_URL || 'http://localhost:3000');
        const socket = socketRef.current;

        socket.emit("requestSeats", eventId);

        socket.on("update-online-users", (count) => setOnlineCount(count));
        
        socket.on("initSeats", (seats) => setLockedSeats(seats));
        
        socket.on("seatLocked", ({ seatId, eventId: eId }) => {
            if (eId === eventId) {
                setLockedSeats(prev => ({ ...prev, [seatId]: { status: 'locked' } }));
            }
        });

        socket.on("seatUnlocked", ({ seatId, eventId: eId }) => {
            if (eId === eventId) {
                setLockedSeats(prev => {
                    const newLocks = { ...prev };
                    delete newLocks[seatId];
                    return newLocks;
                });
            }
        });

        socket.on("seatTaken", ({ seatId, eventId: eId }) => {
            if (eId === eventId && selectedSeat === seatId) {
                setSelectedSeat(null);
                alert("Oops! Someone else just grabbed this seat ⏳");
            }
        });

        socket.on("seatSold", ({ seatId, eventId: eId }) => {
            if (eId === eventId) {
                setLockedSeats(prev => ({ ...prev, [seatId]: { status: 'sold' } }));
            }
        });

        return () => {
            if (selectedSeat) {
                socket.emit("unlockSeat", { seatId: selectedSeat, eventId });
            }
            socket.disconnect();
        };
    }, [eventId, selectedSeat]);

    const handleSelectSeat = (seatId) => {
        if (selectedSeat === seatId) {
            setSelectedSeat(null);
            socketRef.current.emit("unlockSeat", { seatId, eventId });
        } else {
            // Logic to switch seat
            const prevSeat = selectedSeat;
            setSelectedSeat(seatId);
            socketRef.current.emit("lockSeat", { seatId, eventId });
            if (prevSeat) {
                socketRef.current.emit("unlockSeat", { seatId: prevSeat, eventId });
            }
        }
    };

    const handleFormChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value.toUpperCase() });
    };

    const handleStartPayment = async () => {
        setLoading(true);
        try {
            // 1. Create Order
            const order = await api.post('/api/booking/create-order', { seat: selectedSeat, eventId });
            
            // 2. Fetch Razorpay Key
            const config = await api.get('/api/booking/config');

            const options = {
                key: config.razorpay_key_id,
                amount: order.amount,
                currency: "INR",
                name: "FEEDX 2026",
                description: `Seat ${selectedSeat} Booking`,
                order_id: order.id,
                handler: async (response) => {
                    const verify = await api.post('/api/booking/verify-payment', {
                        ...response,
                        seat: selectedSeat,
                        eventId,
                        ...formData
                    });

                    if (verify.success && verify.bookingId) {
                        socketRef.current.emit("seatSold", { seatId: selectedSeat, eventId });
                        
                        emailjs.send("service_71voqhh", "template_b36qc68", {
                            to_name: formData.name,
                            to_email: formData.email,
                            user_pin: formData.pin,
                            pass_link: `${window.location.origin}/pass/${verify.bookingId}`,
                            qr_data: verify.bookingId || "CONFIRMED"
                        }, "lRZiR_b9CdRtPU7EN").catch(err => console.error("Emailjs error:", err));

                        navigate(`/pass/${verify.bookingId}`);
                    } else {
                        console.error("Payment verification succeeded but no bookingId was returned.", verify);
                        alert("Booking confirmed but failed to load the pass immediately. Please check your dashboard.");
                        navigate('/dashboard');
                    }
                },
                prefill: {
                    name: formData.name,
                    email: formData.email
                },
                theme: { color: "#6C5CE7" }
            };

            const rzp = new window.Razorpay(options);
            rzp.open();
        } catch (err) {
            alert(err.response?.data?.error || 'Payment failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col overflow-hidden">
            <Navbar onlineCount={onlineCount} />
            
            <main className="flex-1 flex gap-8 p-8 overflow-hidden">
                {/* Seat Map Area */}
                <section className="flex-1 bg-slate-900/40 rounded-[40px] border border-white/5 overflow-hidden flex flex-col relative shadow-2xl backdrop-blur-3xl">
                    
                    {/* Header with Navigation */}
                    <div className="px-8 py-6 flex items-center justify-between border-b border-white/5 bg-slate-900/20">
                        <button 
                            onClick={() => navigate('/dashboard')}
                            className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors group"
                        >
                            <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                            <span className="text-xs uppercase font-bold tracking-widest leading-none mt-0.5">Return to Events</span>
                        </button>
                        
                        <div className="flex items-center gap-4 bg-slate-950/50 px-4 py-2 rounded-2xl border border-white/5 shadow-inner">
                            <Monitor className="w-4 h-4 text-primary" />
                            <span className="text-[10px] text-slate-300 font-bold uppercase tracking-[0.2em] leading-none mt-0.5">VIGNAN VEDIKA AUDITORIUM</span>
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto p-12 flex flex-col items-center custom-scrollbar">
                        {/* Screen Indicator (Curved) */}
                        <div className="w-[700px] mb-12 relative flex justify-center">
                            <div className="screen-curve" />
                            <span className="absolute -top-6 text-[#00F3FF] font-bold tracking-[0.4em] text-sm uppercase">🎬 SCREEN</span>
                        </div>

                        {/* Seat Layout Grid */}
                        <div className="grid grid-cols-2 gap-x-20 gap-y-12 relative animate-fade-in pb-20">
                            <SeatGrid section="A" lockedSeats={lockedSeats} selectedSeat={selectedSeat} onSelectSeat={handleSelectSeat} />
                            <SeatGrid section="B" lockedSeats={lockedSeats} selectedSeat={selectedSeat} onSelectSeat={handleSelectSeat} />
                            <SeatGrid section="C" lockedSeats={lockedSeats} selectedSeat={selectedSeat} onSelectSeat={handleSelectSeat} />
                            <SeatGrid section="D" lockedSeats={lockedSeats} selectedSeat={selectedSeat} onSelectSeat={handleSelectSeat} />
                        </div>
                    </div>

                    {/* Ground Gradient Decoration */}
                    <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-slate-950 to-transparent pointer-events-none opacity-50" />
                </section>

                <Sidebar 
                    selectedSeat={selectedSeat}
                    onClearSeat={() => setSelectedSeat(null)}
                    onStartPayment={handleStartPayment}
                    formData={formData}
                    onFormChange={handleFormChange}
                    loading={loading}
                />
            </main>
        </div>
    );
};

export default SeatLayout;
