"use client";

import { useEffect, useRef, useState } from "react";

type MessageContent =
  | { type: "text"; text: string }
  | { type: "sticker"; packageId: string; stickerId: string };

interface ChatMessage {
  id: string;
  userId: string;
  direction: "incoming" | "outgoing";
  content: MessageContent;
  timestamp: number;
}

interface ConversationProfile {
  displayName: string;
  pictureUrl?: string;
}

interface ConversationSummary {
  userId: string;
  profile: ConversationProfile | null;
  lastMessage: ChatMessage;
}

interface BotInfo {
  displayName: string;
  pictureUrl?: string;
}

const POLL_INTERVAL_MS = 2500;
const STORAGE_KEY = "line-webchat-user-id";

/** Public CDN pattern LINE documents for rendering any sticker id as an image. */
function stickerImageUrl(stickerId: string): string {
  return `https://stickershop.line-scdn.net/stickershop/v1/sticker/${stickerId}/android/sticker.png`;
}

/** A handful of LINE's classic free stickers, used across LINE's own API docs/samples for testing. */
const STICKER_PICKER_OPTIONS = [
  "52002734",
  "52002735",
  "52002736",
  "52002737",
  "52002738",
  "52002739",
  "52002740",
  "52002741",
].map((stickerId) => ({ packageId: "11537", stickerId }));

function readSavedUserId(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STORAGE_KEY) ?? "";
}

export default function Home() {
  const [lineUserId, setLineUserId] = useState(readSavedUserId);
  const [conversations, setConversations] = useState<
    ConversationSummary[] | null
  >(null);
  const [botInfo, setBotInfo] = useState<BotInfo | null>(null);

  useEffect(() => {
    fetch("/api/bot-info")
      .then((res) => res.json())
      .then((data: { botInfo: BotInfo | null }) => setBotInfo(data.botInfo))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/conversations");
        if (!res.ok) throw new Error("Failed to fetch conversations");
        const data: { conversations: ConversationSummary[] } = await res.json();
        if (!cancelled) setConversations(data.conversations);
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
  }, []);

  // A userId remembered from a previous visit may no longer be a real,
  // known conversation (e.g. the in-memory store reset after a redeploy) —
  // drop it once the list loads so the chat can't be "open" with nobody
  // actually selected.
  useEffect(() => {
    if (conversations === null || !lineUserId) return;
    if (!conversations.some((c) => c.userId === lineUserId)) {
      selectUserId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations]);

  function selectUserId(value: string) {
    const next = value.trim();
    setLineUserId(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  const isValidSelection =
    lineUserId !== "" &&
    (conversations?.some((c) => c.userId === lineUserId) ?? false);

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div
        className="flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-lg md:flex-row"
        style={{ height: "min(720px, 90vh)" }}
      >
        <aside className="flex w-full flex-col border-b border-emerald-100 md:w-72 md:shrink-0 md:border-b-0 md:border-r">
          <header className="flex items-center gap-3 bg-emerald-600 px-4 py-3 text-white">
            {botInfo?.pictureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={botInfo.pictureUrl}
                alt=""
                className="h-9 w-9 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-emerald-600 font-bold">
                L
              </div>
            )}
            <div>
              <p className="font-semibold leading-tight">
                {botInfo?.displayName ?? "LINE Webchat"}
              </p>
              <p className="text-xs text-emerald-100 leading-tight">
                เชื่อมต่อกับ LINE Official Account
              </p>
            </div>
          </header>

          <ConversationList
            conversations={conversations}
            selectedUserId={lineUserId}
            onSelect={selectUserId}
          />
        </aside>

        <div className="flex flex-1 flex-col overflow-hidden">
          <ChatSession
            key={lineUserId}
            lineUserId={isValidSelection ? lineUserId : ""}
          />
        </div>
      </div>
    </div>
  );
}

function ConversationList({
  conversations,
  selectedUserId,
  onSelect,
}: {
  conversations: ConversationSummary[] | null;
  selectedUserId: string;
  onSelect: (userId: string) => void;
}) {
  if (!conversations || conversations.length === 0) {
    return (
      <p className="flex-1 px-4 py-6 text-center text-sm text-gray-400">
        ยังไม่มีคนทักเข้ามาใน LINE OA
      </p>
    );
  }

  return (
    <ul className="flex-1 overflow-y-auto">
      {conversations.map((c) => (
        <li key={c.userId}>
          <button
            onClick={() => onSelect(c.userId)}
            className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-emerald-50 ${
              c.userId === selectedUserId ? "bg-emerald-100" : ""
            }`}
          >
            {c.profile?.pictureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.profile.pictureUrl}
                alt=""
                className="h-9 w-9 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-200 text-sm font-semibold text-emerald-700">
                {(c.profile?.displayName ?? c.userId).slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-800">
                {c.profile?.displayName ?? c.userId}
              </p>
              <p className="truncate text-xs text-gray-400">
                {c.lastMessage.content.type === "text"
                  ? c.lastMessage.content.text
                  : "[สติกเกอร์]"}
              </p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ChatSession({ lineUserId }: { lineUserId: string }) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showStickers, setShowStickers] = useState(false);
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
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function sendContent(content: MessageContent) {
    if (!lineUserId || sending) return;

    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: lineUserId, content }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to send message");
      }
      const data: { message: ChatMessage } = await res.json();
      setMessages((prev) => [...prev, data.message]);
      lastIdRef.current = data.message.id;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  async function sendDraft() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    await sendContent({ type: "text", text });
  }

  async function sendSticker(packageId: string, stickerId: string) {
    setShowStickers(false);
    await sendContent({ type: "sticker", packageId, stickerId });
  }

  async function deleteMessage(id: string) {
    setError(null);
    try {
      const params = new URLSearchParams({ userId: lineUserId, id });
      const res = await fetch(`/api/messages?${params.toString()}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to delete message");
      }
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete message");
    }
  }

  return (
    <>
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto bg-[repeating-linear-gradient(0deg,#f0fdf4,#f0fdf4_40px)] px-4 py-4"
      >
        {!lineUserId && (
          <p className="mt-6 text-center text-sm text-gray-400">
            เลือกการสนทนาทางซ้ายเพื่อเริ่มแชท
          </p>
        )}
        {lineUserId && messages.length === 0 && (
          <p className="mt-6 text-center text-sm text-gray-400">
            ยังไม่มีข้อความ
          </p>
        )}
        {messages.map((m) => {
          const time = new Date(m.timestamp).toLocaleTimeString("th-TH", {
            hour: "2-digit",
            minute: "2-digit",
          });

          return (
            <div
              key={m.id}
              className={`group flex items-end gap-1.5 ${m.direction === "outgoing" ? "justify-end" : "justify-start"}`}
            >
              {m.direction === "outgoing" && (
                <button
                  onClick={() => deleteMessage(m.id)}
                  title="ลบออกจากเว็บนี้ (ไม่กระทบข้อความในแอป LINE ของคู่สนทนา)"
                  className="mb-1 hidden shrink-0 rounded-full px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-red-500 group-hover:inline-block"
                >
                  ลบ
                </button>
              )}

              {m.content.type === "sticker" ? (
                <div className="flex flex-col items-end">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={stickerImageUrl(m.content.stickerId)}
                    alt="sticker"
                    className="h-24 w-24"
                  />
                  <p className="mt-0.5 text-[10px] text-gray-400">{time}</p>
                </div>
              ) : (
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                    m.direction === "outgoing"
                      ? "bg-emerald-500 text-white rounded-br-sm"
                      : "bg-white text-gray-800 border border-gray-200 rounded-bl-sm"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">
                    {m.content.text}
                  </p>
                  <p
                    className={`mt-1 text-[10px] ${m.direction === "outgoing" ? "text-emerald-100" : "text-gray-400"}`}
                  >
                    {time}
                  </p>
                </div>
              )}

              {m.direction === "incoming" && (
                <button
                  onClick={() => deleteMessage(m.id)}
                  title="ลบออกจากเว็บนี้ (ไม่กระทบข้อความในแอป LINE ของคู่สนทนา)"
                  className="mb-1 hidden shrink-0 rounded-full px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-red-500 group-hover:inline-block"
                >
                  ลบ
                </button>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="px-4 pt-1 text-xs text-red-500">{error}</p>}

      {showStickers && (
        <div className="grid grid-cols-4 gap-2 border-t border-gray-200 bg-white p-3">
          {STICKER_PICKER_OPTIONS.map((s) => (
            <button
              key={s.stickerId}
              onClick={() => sendSticker(s.packageId, s.stickerId)}
              disabled={!lineUserId || sending}
              className="rounded-lg p-1 hover:bg-emerald-50 disabled:opacity-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={stickerImageUrl(s.stickerId)}
                alt="sticker"
                className="h-14 w-14"
              />
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-gray-200 bg-white p-3">
        <button
          onClick={() => setShowStickers((v) => !v)}
          disabled={!lineUserId}
          aria-label="สติกเกอร์"
          className={`shrink-0 rounded-full p-2 text-lg transition disabled:opacity-40 ${
            showStickers ? "bg-emerald-100" : "hover:bg-gray-100"
          }`}
        >
          😊
        </button>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendDraft()}
          placeholder="พิมพ์ข้อความ..."
          disabled={!lineUserId}
          className="flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-900 outline-none focus:border-emerald-500 disabled:bg-gray-50"
        />
        <button
          onClick={sendDraft}
          disabled={!lineUserId || !draft.trim() || sending}
          className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          ส่ง
        </button>
      </div>
    </>
  );
}
