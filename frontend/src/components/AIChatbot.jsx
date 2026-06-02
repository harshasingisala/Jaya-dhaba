import React, { useState, useEffect, useRef, useCallback, useMemo, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Loader2 } from 'lucide-react';
import { API_BASE_URL } from '../api/config';

// ── Constants & Enums ──────────────────────────────────────────────────
const UI_STATE = Object.freeze({ TOAST: 'toast', CHAT: 'chat', HIDDEN: 'hidden' });
const HISTORY_WINDOW = 6;
const INPUT_MAX_LEN = 500;
const TOAST_DELAY_MS = 6000;

const makeInitialMsg = (uid) => ({
  id: `init-${uid}`,
  role: 'model',
  text: "Namaste! I'm Jaya, your personal guide at Jaya Dhaba. Craving something? 🍛",
});

const sanitize = (raw) =>
  raw.trim().slice(0, INPUT_MAX_LEN).replace(/[<>{}[\]\\]/g, '').replace(/system\s*:/gi, '').replace(/ignore\s+previous/gi, '');

export default function AIChatbot({ language = 'en', menuItems = [], botOpen = false, setBotOpen = () => { } }) {
  const uid = useId();
  const [uiState, setUiState] = useState(UI_STATE.TOAST);
  const [messages, setMessages] = useState(() => [makeInitialMsg(uid)]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const scrollRef = useRef(null);
  const inFlight = useRef(false);
  const msgCounter = useRef(0);
  const inputRef = useRef(null);

  const sessionId = useMemo(() => `${uid}-${Date.now()}`, [uid]);

  // ── THE FIX: Atomic Append with Deduplication Guard ──────────────────────
  const appendMessage = useCallback((role, text) => {
    setMessages(prev => {
      // Prevents React 18 Strict Mode from double-appending the same message
      const lastMsg = prev[prev.length - 1];
      if (lastMsg?.role === role && lastMsg?.text === text) return prev;

      return [...prev, {
        id: `${uid}-${msgCounter.current++}-${Date.now()}`,
        role,
        text
      }];
    });
  }, [uid]);

  // ── Effects ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (uiState !== UI_STATE.TOAST) return;
    const t = setTimeout(() => setUiState(UI_STATE.HIDDEN), TOAST_DELAY_MS);
    return () => clearTimeout(t);
  }, [uiState]);

  useEffect(() => { if (botOpen) setUiState(UI_STATE.CHAT); }, [botOpen]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  useEffect(() => {
    if (uiState === UI_STATE.CHAT) {
      const t = setTimeout(() => inputRef.current?.focus(), 350);
      return () => clearTimeout(t);
    }
  }, [uiState]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (inFlight.current) return;
    const safe = sanitize(input);
    if (!safe) return;

    // Snapshot excludes the current message to avoid server-side duplication
    const historySnapshot = messages.slice(-HISTORY_WINDOW);

    inFlight.current = true;
    setInput('');
    setIsLoading(true);
    appendMessage('user', safe);

    try {
      const res = await fetch(`${API_BASE_URL}/api/jaya-concierge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: safe, history: historySnapshot, language }),
      });

      if (!res.ok) throw new Error();
      const { reply } = await res.json();
      appendMessage('model', reply);
    } catch (err) {
      appendMessage('model', "Namaste bro! The kitchen's buzzing. Try the Mutton Dum Biryani? 🍛");
    } finally {
      inFlight.current = false;
      setIsLoading(false);
    }
  }, [input, messages, sessionId, language, appendMessage]);

  return (
    <div className="fixed bottom-8 right-8 z-[1000] flex flex-col items-end gap-3 font-sans">
      <AnimatePresence>
        {uiState === UI_STATE.TOAST && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.92 }}
            className="relative bg-white rounded-2xl shadow-2xl border border-gray-100 p-5 pr-10 max-w-[260px] cursor-pointer"
            onClick={() => setUiState(UI_STATE.CHAT)}
          >
            <button onClick={(e) => { e.stopPropagation(); setUiState(UI_STATE.HIDDEN); }} className="absolute top-3 right-3 text-gray-300 hover:text-gray-500"><X size={15} /></button>
            <div className="absolute -top-3 -right-3 w-9 h-9 rounded-full flex items-center justify-center shadow-md border-2 border-white bg-[#2D0900] text-white text-sm font-bold">J</div>
            <p className="text-sm font-semibold text-gray-800 mb-1">Ask Jaya — AI Concierge</p>
            <p className="text-xs text-gray-400">Your personal guide at Jaya Dhaba.</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {uiState === UI_STATE.CHAT && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 40, scale: 0.9 }}
            className="w-[380px] h-[560px] bg-white rounded-[2rem] shadow-2xl border border-gray-100 flex flex-col overflow-hidden"
          >
            <div className="bg-[#2D0900] px-7 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#C9A050] rounded-xl flex items-center justify-center border-2 border-white/20 text-white font-bold text-lg">J</div>
                <div>
                  <h3 className="text-white font-semibold text-base leading-none mb-1">Ask Jaya</h3>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Live Concierge</span>
                </div>
              </div>
              <X className="text-white/40 cursor-pointer hover:text-white" onClick={() => setUiState(UI_STATE.HIDDEN)} size={18} />
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-4 bg-[#FAF9F6] no-scrollbar">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[82%] px-5 py-3.5 text-sm leading-relaxed rounded-2xl ${msg.role === 'user' ? 'bg-[#C9A050] text-white rounded-tr-sm' : 'bg-white text-gray-700 border border-gray-100 rounded-tl-sm'}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white px-5 py-3.5 rounded-2xl border border-gray-100 flex items-center gap-2">
                    <Loader2 size={13} className="animate-spin text-[#C9A050]" />
                    <span className="text-[11px] font-bold uppercase tracking-widest text-gray-300">Jaya is thinking…</span>
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-4 bg-white border-t border-gray-100 flex gap-3">
              <input
                ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask about the Biryani…" className="flex-1 bg-gray-50 border border-gray-200 rounded-full px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-[#C9A050]"
              />
              <button onClick={handleSend} disabled={isLoading || !input.trim()} className="w-10 h-10 rounded-full bg-[#2D0900] flex items-center justify-center text-white hover:bg-[#C9A050] transition-all disabled:opacity-40">
                <Send size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.93 }} onClick={() => setUiState(prev => prev === UI_STATE.CHAT ? UI_STATE.HIDDEN : UI_STATE.CHAT)}
        className="w-14 h-14 rounded-full bg-[#2D0900] shadow-2xl flex items-center justify-center border-2 border-white/30 text-white text-xl font-bold"
      >J</motion.button>
    </div>
  );
}
