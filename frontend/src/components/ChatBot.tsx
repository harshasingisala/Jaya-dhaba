import React, { useEffect, useMemo, useRef, useState } from "react";
import { Copy, MessageCircle, Send, Trash2, X } from "lucide-react";
import { apiUrl } from "../api/config";

type Role = "user" | "assistant";
type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  streaming?: boolean;
  ts: string;
};

const QUICK_CHIPS = ["What's good today?", "Show me combos", "Veg options?", "How long will my food take?"];
const SESSION_KEY = "jaya_chat_messages";

function uuid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function renderMarkdown(input: string) {
  return input.split("\n").map((line, lineIndex) => {
    const content = line.replace(/^\s*-\s+/, "");
    const parts = content.split(/(\*\*.+?\*\*)/g).map((part, partIndex) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={partIndex}>{part.slice(2, -2)}</strong>;
      }
      return <React.Fragment key={partIndex}>{part}</React.Fragment>;
    });
    return (
      <React.Fragment key={`${line}-${lineIndex}`}>
        {lineIndex > 0 && <br />}
        {/^\s*-\s+/.test(line) ? <span>&bull; {parts}</span> : parts}
      </React.Fragment>
    );
  });
}

export default function ChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.error('Failed to restore chat session:', err);
      return [];
    }
  });
  const sessionId = useMemo(() => uuid(), []);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  useEffect(() => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(messages));
  }, [messages]);

  const appendUser = (content: string) => {
    setMessages((prev) => [...prev, { id: uuid(), role: "user", content, ts: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) }]);
  };

  const appendAssistantShell = () => {
    const id = uuid();
    setMessages((prev) => [...prev, { id, role: "assistant", content: "", streaming: true, ts: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) }]);
    return id;
  };

  const updateAssistant = (id: string, chunk: string, done = false) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === id
          ? { ...msg, content: `${msg.content}${chunk}`, streaming: done ? false : true }
          : msg
      )
    );
  };

  const sendMessage = async (preset?: string) => {
    const message = (preset ?? input).trim();
    if (!message || isStreaming) return;
    appendUser(message);
    setInput("");
    setIsStreaming(true);
    const assistantId = appendAssistantShell();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch(apiUrl('/api/chat'), {
        method: "POST",
        credentials: "include",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          session_id: sessionId,
          conversation_history: messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
        }),
      });
      if (!response.ok || !response.body) {
        throw new Error("Chat unavailable");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let splitIndex = buffer.indexOf("\n\n");
        while (splitIndex !== -1) {
          const rawEvent = buffer.slice(0, splitIndex).trim();
          buffer = buffer.slice(splitIndex + 2);
          if (rawEvent.startsWith("data:")) {
            const payload = rawEvent.replace(/^data:\s*/, "");
            try {
              const parsed = JSON.parse(payload);
              if (parsed.token) updateAssistant(assistantId, parsed.token, false);
              if (parsed.done) updateAssistant(assistantId, "", true);
              if (parsed.error) {
                updateAssistant(assistantId, `\n${parsed.message || "Chat failed."}`, true);
              }
            } catch (err) {
              console.error('Failed to parse chat response chunk:', err);
              // ignore malformed stream chunks
            }
          }
          splitIndex = buffer.indexOf("\n\n");
        }
      }
      updateAssistant(assistantId, "", true);
    } catch (err) {
      console.error('Failed to send chat message:', err);
      updateAssistant(assistantId, "Sorry, I couldn’t respond right now. Please try again in a moment.", true);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setIsStreaming(false);
    }
  };

  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-5 right-5 z-[1000] w-14 h-14 rounded-full bg-heritage-espresso text-white shadow-2xl flex items-center justify-center"
          aria-label="Open chat"
        >
          <MessageCircle size={22} />
        </button>
      )}
      {isOpen && (
        <div className={`fixed z-[1000] ${isMobile ? "inset-0" : "bottom-5 right-5 w-[380px] h-[560px]"}`}>
          <div className="w-full h-full bg-white border border-heritage-espresso/10 shadow-2xl rounded-3xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-6 duration-300">
            <div className="px-4 py-3 bg-heritage-espresso text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🍛</span>
                <div className="text-sm font-semibold">Jaya Concierge</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setMessages([])} className="p-1.5 rounded hover:bg-white/10" aria-label="Clear chat">
                  <Trash2 size={15} />
                </button>
                <button onClick={() => { abortRef.current?.abort(); setIsOpen(false); }} className="p-1.5 rounded hover:bg-white/10" aria-label="Close chat">
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-[#FAF9F6]">
              {messages.length === 0 && (
                <div className="flex flex-wrap gap-2">
                  {QUICK_CHIPS.map((chip) => (
                    <button key={chip} onClick={() => sendMessage(chip)} className="px-3 py-1.5 rounded-full bg-white border border-heritage-espresso/10 text-xs">
                      {chip}
                    </button>
                  ))}
                </div>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`${msg.role === "user" ? "bg-heritage-gold text-white" : "bg-white text-heritage-espresso border border-heritage-espresso/10"} max-w-[85%] rounded-2xl px-3 py-2`}>
                    <div className="text-sm leading-relaxed">{renderMarkdown(msg.content)}</div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[10px] opacity-70">
                      <span>{msg.ts}</span>
                      {msg.role === "assistant" && (
                        <button onClick={() => navigator.clipboard.writeText(msg.content)} className="inline-flex items-center gap-1">
                          <Copy size={11} /> Copy
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {isStreaming && messages[messages.length - 1]?.role === "assistant" && messages[messages.length - 1]?.content.length === 0 && (
                <div className="flex justify-start">
                  <div className="bg-white border border-heritage-espresso/10 rounded-2xl px-3 py-2 text-sm">
                    <span className="inline-flex gap-1">
                      <span className="animate-pulse">•</span>
                      <span className="animate-pulse [animation-delay:120ms]">•</span>
                      <span className="animate-pulse [animation-delay:240ms]">•</span>
                    </span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            <div className="p-3 border-t border-heritage-espresso/10 bg-white">
              <div className="flex gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  className="flex-1 resize-none rounded-2xl border border-heritage-espresso/10 px-3 py-2 text-sm outline-none"
                  placeholder="Ask Jaya anything..."
                  rows={2}
                />
                <button onClick={() => sendMessage()} disabled={isStreaming} className="w-10 h-10 rounded-full bg-heritage-espresso text-white flex items-center justify-center disabled:opacity-50">
                  <Send size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
