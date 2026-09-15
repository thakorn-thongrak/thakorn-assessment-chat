"use client";

import { useEffect, useRef, useState } from "react";

interface ChatMessage {
  id: string;
  userId: string;
  direction: "incoming" | "outgoing";
  text: string;
  timestamp: number;
}

const POLL_INTERVAL_MS = 2500;
const STORAGE_KEY = "line-webchat-user-id";

function readSavedUserId(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STORAGE_KEY) ?? "";
}

export default function Home() {
  const [lineUserId, setLineUserId] = useState(readSavedUserId);

  function handleUserIdChange(value: string) {
    const next = value.trim();
    setLineUserId(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-lg" style={{ height: "min(720px, 90vh)" }}>
        <header className="flex items-center gap-3 bg-emerald-600 px-4 py-3 text-white">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-emerald-600 font-bold">
            L
          </div>
          <div>
            <p className="font-semibold leading-tight">LINE Webchat</p>
            <p className="text-xs text-emerald-100 leading-tight">เชื่อมต่อกับ LINE Official Account</p>
          </div>
        </header>

        <div className="border-b border-emerald-100 bg-emerald-50 px-4 py-2">
          <label className="block text-xs font-medium text-emerald-800 mb-1">
            LINE userId ที่จะคุยด้วย
          </label>
          <input
            type="text"
            defaultValue={lineUserId}
            onChange={(e) => handleUserIdChange(e.target.value)}
            placeholder="เช่น U1234567890abcdef..."
            className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-sm text-gray-900 outline-none focus:border-emerald-500"
          />
        </div>

        <ChatSession key={lineUserId} lineUserId={lineUserId} />
      </div>
    </div>
  );
}

function ChatSession({ lineUserId }: { lineUserId: string }) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!lineUserId) return;

    let cancelled = false;

    async function poll() {
      try {
        const params = new URLSearchParams({ userId: lineUserId });
        if (lastIdRef.current) params.set("after", lastIdRef.current);

        const res = await fetch(`/api/messages?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch messages");
        const data: { messages: ChatMessage[] } = await res.json();

        if (cancelled || data.messages.length === 0) return;

        setMessages((prev) => [...prev, ...data.messages]);
        lastIdRef.current = data.messages[data.messages.length - 1].id;
      } catch {
        // Silently retry on the next poll tick.
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [lineUserId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    const text = draft.trim();
    if (!text || !lineUserId || sending) return;

    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: lineUserId, text }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to send message");
      }
      const data: { message: ChatMessage } = await res.json();
      setMessages((prev) => [...prev, data.message]);
      lastIdRef.current = data.message.id;
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-[repeating-linear-gradient(0deg,#f0fdf4,#f0fdf4_40px)] px-4 py-4">
        {!lineUserId && (
          <p className="mt-6 text-center text-sm text-gray-400">
            กรอก LINE userId ด้านบนเพื่อเริ่มแชท
          </p>
        )}
        {lineUserId && messages.length === 0 && (
          <p className="mt-6 text-center text-sm text-gray-400">ยังไม่มีข้อความ</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.direction === "outgoing" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                m.direction === "outgoing"
                  ? "bg-emerald-500 text-white rounded-br-sm"
                  : "bg-white text-gray-800 border border-gray-200 rounded-bl-sm"
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{m.text}</p>
              <p className={`mt-1 text-[10px] ${m.direction === "outgoing" ? "text-emerald-100" : "text-gray-400"}`}>
                {new Date(m.timestamp).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="px-4 pt-1 text-xs text-red-500">{error}</p>}

      <div className="flex items-center gap-2 border-t border-gray-200 bg-white p-3">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="พิมพ์ข้อความ..."
          disabled={!lineUserId}
          className="flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-900 outline-none focus:border-emerald-500 disabled:bg-gray-50"
        />
        <button
          onClick={sendMessage}
          disabled={!lineUserId || !draft.trim() || sending}
          className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          ส่ง
        </button>
      </div>
    </>
  );
}
