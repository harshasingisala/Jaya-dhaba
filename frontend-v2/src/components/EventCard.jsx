import React from 'react';
import { Calendar, MapPin, Ticket } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const EventCard = ({ event }) => {
  const navigate = useNavigate();
  const date = new Date(event.date || Date.now()).toLocaleString([], { 
    dateStyle: 'medium', 
    timeStyle: 'short' 
  });

  return (
    <div 
      onClick={() => navigate(`/event/${event._id}`)}
      className="group relative h-[380px] rounded-3xl overflow-hidden cursor-pointer transition-all duration-500 hover:scale-[1.02] hover:-translate-y-2 shadow-2xl hover:shadow-primary/20"
    >
      {/* Background Image with Overlay */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
        style={{ backgroundImage: `url(${event.banner || 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&q=80&w=1000'})` }}
      />
      <div className="absolute inset-0 z-10 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent opacity-90 group-hover:opacity-80 transition-opacity" />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-6 z-20 flex flex-col justify-end h-full">
        <div className="translate-y-4 group-hover:translate-y-0 transition-transform duration-500">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-3 py-1 rounded-full bg-primary/20 border border-primary/40 text-primary text-[10px] font-bold uppercase tracking-wider backdrop-blur-md">
              Live Booking
            </span>
          </div>

          <h3 className="text-2xl font-bold text-white mb-2 group-hover:text-primary transition-colors line-clamp-1 drop-shadow-lg">
            {event.title}
          </h3>
          
          <p className="text-slate-400 text-sm mb-6 line-clamp-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            {event.description || "Experience the next level of technical sessions with live demonstrations and deep dives."}
          </p>

          <div className="flex flex-col gap-2 mb-6">
            <div className="flex items-center text-slate-400 text-xs gap-2">
              <Calendar className="w-4 h-4 text-primary" /> {date}
            </div>
            <div className="flex items-center text-slate-400 text-xs gap-2">
              <MapPin className="w-4 h-4 text-primary" /> {event.location || "Auditorium"}
            </div>
          </div>

          <button className="w-full py-4 rounded-2xl bg-primary text-white font-bold text-sm tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-primary/30 group-hover:bg-primary-dim transition-all">
            <Ticket className="w-4 h-4" />
            SECURE YOUR SEAT
          </button>
        </div>
      </div>
    </div>
  );
};

export default EventCard;
