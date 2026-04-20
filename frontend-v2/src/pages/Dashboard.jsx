import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import EventCard from '../components/EventCard';
import api from '../utils/api';
import { Ticket, ExternalLink, ShieldCheck, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';

const Dashboard = () => {
  const [events, setEvents] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [onlineCount, setOnlineCount] = useState(0);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const eventsData = await api.get('/api/events');
        setEvents(eventsData);
      } catch (err) {
        console.error('Events loading failed:', err);
      }
    };

    const fetchBookings = async () => {
      try {
        const bookingsData = await api.get('/api/booking/user/bookings');
        setBookings(bookingsData);
      } catch (err) {
        console.error('Bookings loading failed:', err);
      }
    };

    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchEvents(), fetchBookings()]);
      setLoading(false);
    };

    loadData();
  }, []);

  if (loading) return <div className="h-screen w-screen flex items-center justify-center bg-slate-950 text-primary animate-pulse">LOADING DASHBOARD...</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-primary/30 custom-scrollbar">
      <Navbar onlineCount={onlineCount} />

      <main className="max-w-[1400px] mx-auto px-8 py-10">
        <div className="flex flex-col lg:flex-row gap-12">
          {/* Events Section */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-8">
              <div className="flex flex-col">
                <h2 className="text-3xl font-bold font-headline text-white drop-shadow-sm tracking-tight flex items-center gap-3">
                  <span className="w-1.5 h-8 bg-primary rounded-full" />
                   Upcoming Events
                </h2>
                <p className="text-slate-500 text-sm mt-1 ml-4">Secure your spot for the next session</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in">
              {events.length > 0 ? (
                events.map(event => (
                  <EventCard key={event._id} event={event} />
                ))
              ) : (
                <div className="col-span-full p-12 rounded-3xl border border-white/5 bg-slate-900/20 text-center">
                  <p className="text-slate-500 italic">No upcoming events scheduled yet.</p>
                </div>
              )}
            </div>
          </div>

          {/* Bookings Section */}
          <div className="w-full lg:w-[400px]">
            <div className="flex items-center mb-8">
              <h2 className="text-2xl font-bold font-headline text-white drop-shadow-sm tracking-tight flex items-center gap-3">
                <span className="w-1.5 h-6 bg-secondary rounded-full" />
                 Your Passes
              </h2>
            </div>

            <div className="flex flex-col gap-4 animate-fade-in">
              {bookings.length > 0 ? (
                bookings.map(booking => (
                  <motion.div 
                    key={booking._id} 
                    whileHover={{ scale: 1.02 }}
                    className="p-5 rounded-3xl border border-white/10 bg-slate-900/40 backdrop-blur-md relative overflow-hidden group hover:border-primary/30 transition-all cursor-pointer shadow-xl"
                    onClick={() => navigate(`/pass/${booking._id}`)}
                  >
                    {/* Status Badge */}
                    <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400 font-bold text-[9px] uppercase tracking-widest leading-none mt-0.5">Confirmed</span>
                    </div>

                    <div className="flex flex-col gap-3">
                      <h4 className="font-bold text-white text-lg pr-20 leading-snug group-hover:text-primary transition-colors">
                        {booking.eventId?.title || "Event Booking"}
                      </h4>
                      
                      <div className="flex items-center justify-between mt-2 pt-4 border-t border-white/5">
                        <div className="flex flex-col">
                          <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Secured Seat</span>
                          <span className="text-primary font-mono font-bold text-xl drop-shadow-[0_0_10px_rgba(108,92,231,0.2)] mt-0.5">{booking.seatId}</span>
                        </div>
                        
                        <div className="flex flex-col items-end">
                           <span className="text-slate-300 text-xs font-semibold flex items-center gap-1.5 group-hover:text-primary transition-colors">
                              View Ticket <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                           </span>
                        </div>
                      </div>
                    </div>

                    {/* Gradient Accent */}
                    <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-gradient-to-r from-primary/50 via-primary to-primary/50 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
                  </motion.div>
                ))
              ) : (
                <div className="p-8 rounded-3xl border border-white/5 bg-slate-900/20 text-center flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center">
                    <Ticket className="w-6 h-6 text-slate-600" />
                  </div>
                  <p className="text-slate-500 text-sm max-w-[200px]">You haven't booked any seats yet. Ready to join an event?</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
