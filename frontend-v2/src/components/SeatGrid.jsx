import React from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const SeatGrid = ({ section, lockedSeats, selectedSeat, onSelectSeat }) => {
  const generateSeats = (prefix, count) => {
    return Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`);
  };

  const getSeatStatus = (seatId) => {
    if (lockedSeats[seatId]) {
      return lockedSeats[seatId].status;
    }
    if (selectedSeat === seatId) {
      return 'selected';
    }
    return 'available';
  };

  const sectionSeats = generateSeats(section, 60);

  const sectionLabels = {
    A: { emoji: '🅰️', name: 'Section A (Entry Side)', badge: '⬅ ENTRY' },
    B: { emoji: '🅱️', name: 'Section B (🚺 Ladies Only)', badge: 'EXIT ➡' },
    C: { emoji: '🅲', name: 'Section C', badge: null },
    D: { emoji: '🅳', name: 'Section D', badge: null },
  };

  const info = sectionLabels[section] || { emoji: section, name: `Section ${section}`, badge: null };

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-bold text-slate-400 flex items-center gap-2">
          {info.emoji} {info.name}
        </span>
        {info.badge && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-white/10 font-bold tracking-wider">
            {info.badge}
          </span>
        )}
      </div>

      <div className="seat-grid">
        {sectionSeats.map(seatId => {
          const status = getSeatStatus(seatId);
          return (
            <button
              key={seatId}
              onClick={() => status !== 'locked' && status !== 'sold' && onSelectSeat(seatId)}
              disabled={status === 'locked' || status === 'sold'}
              className={`seat ${
                status === 'available' ? 'seat-available' :
                status === 'locked' ? 'seat-locked' :
                status === 'sold' ? 'seat-sold' :
                status === 'selected' ? 'seat-selected' : ''
              }`}
            >
              {seatId}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SeatGrid;
