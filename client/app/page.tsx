"use client";

import type { ChatMessage, UploadedFile } from "@prd-studio/contracts";
import {
  AlertCircle,
  Bot,
  Check,
  Clipboard,
  Download,
  FileText,
  LoaderCircle,
  Paperclip,
  PenLine,
  RotateCcw,
  Send,
  Sparkles,
  UserRound,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, ApiError } from "@/lib/api";
import { clearWorkspace, loadWorkspace, saveWorkspace } from "@/lib/storage";

const welcomeMessage: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Ceritakan ide produk yang ingin kamu bangun. Saya akan membantu mengubahnya menjadi kebutuhan yang tajam dan siap dikerjakan.",
  createdAt: "2026-01-01T00:00:00.000Z",
  choices: ["Saya ingin membuat aplikasi baru", "Saya ingin mengembangkan produk yang ada", "Saya punya ide, tetapi belum jelas"]
};

const maxContextMessages = 20;
const prdHeadingPattern = /^#{1,6}\s*1\.\s+Overview & Objective\b/im;
const prdSectionPattern = /^#{1,6}\s+\d+\.\s+/m;
const prdTitlePattern = /^#\s+(?!1\.\s+Overview & Objective\b)(.+)$/m;

type BusyState = "chat" | "upload" | "generate" | "reset" | null;
type RetryState =
  | { kind: "chat"; messages: ChatMessage[] }
  | { kind: "upload"; file: File }
  | { kind: "generate" }
  | null;

function createId() {
  return crypto.randomUUID();
}

function contextMessages(messages: ChatMessage[]) {
  return messages
    .filter((message) => message.id !== welcomeMessage.id)
    .slice(-maxContextMessages);
}

function isPrd(content: string) {
  return prdHeadingPattern.test(content) || (/\b(?:Product Requirements Document|PRD)\b/i.test(content) && prdSectionPattern.test(content));
}

function choiceCreatesPrd(content: string) {
  return /\b(?:buat|membuat|generate|hasilkan)\b.*\bprd\b|\bprd\b.*\b(?:lengkap|buat|generate)\b/i.test(content);
}

function titleFromPrd(content: string) {
  return prdTitlePattern.exec(content)?.[1]?.trim() || "PRD tanpa judul";
}

function documentOnly(content: string) {
  const firstHeading = content.search(/^#{1,6}\s+\S/m);
  return firstHeading >= 0 ? content.slice(firstHeading).trim() : content.trim();
}

export default function Home() {
  const [hydrated, setHydrated] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [productTitle, setProductTitle] = useState("");
  const [prdContent, setPrdContent] = useState("");
  const [isEditingPrd, setIsEditingPrd] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<BusyState>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState<RetryState>(null);
  const [copied, setCopied] = useState(false);
  const [health, setHealth] = useState<"checking" | "ok" | "degraded">("checking");
  const [mobilePanel, setMobilePanel] = useState<"chat" | "preview">("chat");
  const [clock, setClock] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const hydrationTimer = setTimeout(() => {
      const stored = loadWorkspace();
      if (stored) {
        const storedPrdContent = documentOnly(stored.prdContent);
        const chatPrd = stored.prdContent
          ? undefined
          : [...stored.messages].reverse().find((message) => message.role === "assistant" && isPrd(message.content));
        setSessionId(stored.sessionId);
        setMessages(
          chatPrd
            ? stored.messages.filter((message) => message.id !== chatPrd.id)
            : stored.messages.length
              ? stored.messages
              : [welcomeMessage]
        );
        setAttachments(stored.attachments);
        setProductTitle(stored.productTitle);
        setPrdContent(storedPrdContent || documentOnly(chatPrd?.content ?? ""));
        setIsEditingPrd(false);
        if (chatPrd) setMobilePanel("preview");
      } else {
        setSessionId(createId());
      }
      setClock(Date.now());
      setHydrated(true);
    }, 0);
    return () => clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    if (!hydrated || !sessionId) return;
    saveWorkspace({
      version: 1,
      sessionId,
      productTitle,
      messages,
      attachments,
      prdContent
    });
  }, [attachments, hydrated, messages, prdContent, productTitle, sessionId]);

  useEffect(() => {
    api
      .health()
      .then((result) => setHealth(result.status))
      .catch(() => setHealth("degraded"));
    const timer = setInterval(() => setClock(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const expiredIds = useMemo(
    () => new Set(attachments.filter((file) => Date.parse(file.expiresAt) <= clock).map((file) => file.id)),
    [attachments, clock]
  );
  const canGenerate =
    hydrated &&
    !busy &&
    messages.some((message) => message.role === "user") &&
    expiredIds.size === 0;
  const generateHint =
    !messages.some((message) => message.role === "user")
        ? "Kirim minimal satu pesan discovery terlebih dahulu."
        : expiredIds.size > 0
          ? "Hapus atau unggah ulang lampiran yang kedaluwarsa."
          : "";

  async function sendChat(messagesToSend?: ChatMessage[]) {
    if (busy || !sessionId) return;
    let nextMessages = messagesToSend;
    if (!nextMessages) {
      const content = input.trim();
      if (!content) return;
      const userMessage: ChatMessage = {
        id: createId(),
        role: "user",
        content,
        createdAt: new Date().toISOString()
      };
      nextMessages = [...messages, userMessage];
      setMessages(nextMessages);
      setInput("");
    }

    setBusy("chat");
    setError("");
    try {
      const response = await api.chat({
        messages: contextMessages(nextMessages),
        sessionId
      });
      if (isPrd(response.reply)) {
        const prdContent = documentOnly(response.reply);
        setPrdContent(prdContent);
        setIsEditingPrd(false);
        setProductTitle(titleFromPrd(prdContent));
        setMobilePanel("preview");
        setMessages([
          ...nextMessages,
          {
            id: createId(),
            role: "assistant",
            content: "PRD telah dibuat di Dokumen kerja. Kamu dapat melanjutkan discovery atau menyunting dokumennya secara langsung.",
            createdAt: new Date().toISOString(),
            choices: response.choices
          }
        ]);
      } else {
        setMessages([
          ...nextMessages,
          { id: createId(), role: "assistant", content: response.reply, createdAt: new Date().toISOString(), choices: response.choices }
        ]);
      }
      setRetry(null);
    } catch (requestError) {
      setError(messageFromError(requestError));
      setRetry({ kind: "chat", messages: nextMessages });
    } finally {
      setBusy(null);
    }
  }

  function chooseSuggestion(content: string) {
    const nextMessages: ChatMessage[] = [
      ...messages,
      { id: createId(), role: "user", content, createdAt: new Date().toISOString() }
    ];
    setMessages(nextMessages);
    if (choiceCreatesPrd(content)) {
      void generatePrd(nextMessages);
      return;
    }
    void sendChat(nextMessages);
  }

  async function uploadFile(file: File) {
    if (busy || !sessionId) return;
    setBusy("upload");
    setError("");
    try {
      const response = await api.upload(file, sessionId);
      setAttachments((current) => [...current, response.file].slice(-5));
      setRetry(null);
    } catch (requestError) {
      setError(messageFromError(requestError));
      setRetry({ kind: "upload", file });
    } finally {
      setBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function removeAttachment(file: UploadedFile) {
    setAttachments((current) => current.filter((item) => item.id !== file.id));
    if (expiredIds.has(file.id)) return;
    try {
      await api.deleteUpload(file.id, sessionId);
    } catch {
      // The local attachment is already removed; server TTL remains the fallback cleanup.
    }
  }

  async function resetWorkspace() {
    if (busy || !window.confirm("Mulai percakapan baru? Riwayat chat, lampiran, dan draf PRD akan dihapus.")) return;
    setBusy("reset");
    await Promise.all(attachments.map((file) => api.deleteUpload(file.id, sessionId).catch(() => undefined)));
    clearWorkspace();
    setSessionId(createId());
    setMessages([welcomeMessage]);
    setAttachments([]);
    setProductTitle("");
    setPrdContent("");
    setIsEditingPrd(false);
    setInput("");
    setError("");
    setRetry(null);
    setCopied(false);
    setMobilePanel("chat");
    setBusy(null);
  }

  async function generatePrd(messagesToUse = messages) {
    if (busy || !sessionId || expiredIds.size > 0 || !messagesToUse.some((message) => message.role === "user")) return;
    setBusy("generate");
    setError("");
    try {
      const response = await api.generatePrd({
        history: contextMessages(messagesToUse),
        sessionId,
        fileIds: attachments.map((file) => file.id)
      });
      setPrdContent(documentOnly(response.prdContent));
      setIsEditingPrd(false);
      setProductTitle(response.productTitle);
      setMobilePanel("preview");
      setRetry(null);
    } catch (requestError) {
      setError(messageFromError(requestError));
      setRetry({ kind: "generate" });
    } finally {
      setBusy(null);
    }
  }

  async function runRetry() {
    if (retry?.kind === "chat") await sendChat(retry.messages);
    if (retry?.kind === "upload") await uploadFile(retry.file);
    if (retry?.kind === "generate") await generatePrd();
  }

  async function copyPrd() {
    await navigator.clipboard.writeText(prdContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1_500);
  }

  function downloadPrd() {
    const blob = new Blob([prdContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const filename = productTitle.trim().toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
    anchor.href = url;
    anchor.download = `${filename || "product-requirements"}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="workshop-shell min-h-dvh p-0 md:h-dvh md:min-h-0 md:p-3 lg:p-4">
      <section className="brief-spine relative mx-auto flex min-h-dvh max-w-[1680px] flex-col overflow-hidden bg-[#f7f9fd] shadow-[0_24px_80px_rgba(23,33,58,0.12)] md:h-[calc(100dvh-24px)] md:min-h-0 md:rounded-[24px] md:border md:border-white lg:h-[calc(100dvh-32px)]">
        <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-[#d9e0ee] bg-white/85 px-4 backdrop-blur md:px-7">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-[13px] bg-[#17213a] text-white shadow-lg shadow-[#17213a]/15">
              <FileText size={19} strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[0.18em] text-[#3157d5] uppercase">AI Product Workshop</p>
              <h1 className="text-[17px] font-bold tracking-[-0.02em] text-[#17213a]">Ruang PRD</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span aria-label={health === "ok" ? "9Router online" : health === "degraded" ? "9Router offline" : "Memeriksa status 9Router"} className={`h-2.5 w-2.5 rounded-full ${health === "ok" ? "bg-emerald-500" : health === "degraded" ? "bg-red-500" : "animate-pulse bg-slate-400"}`} />
            <button type="button" aria-label="Mulai percakapan baru" onClick={() => void resetWorkspace()} disabled={!hydrated || Boolean(busy)} className="grid h-9 w-9 place-items-center rounded-lg border border-[#ccd5e5] bg-white text-[#66728b] shadow-sm transition hover:border-[#3157d5] hover:text-[#3157d5] disabled:cursor-not-allowed disabled:opacity-40" title="Mulai percakapan baru">
              <RotateCcw size={16} />
            </button>
          </div>
        </header>

        <nav className="grid shrink-0 grid-cols-2 border-b border-[#d9e0ee] bg-white p-1 md:hidden" aria-label="Panel workspace">
          <button className={`rounded-lg px-3 py-2 text-sm font-semibold ${mobilePanel === "chat" ? "bg-[#eaf0ff] text-[#3157d5]" : "text-[#66728b]"}`} onClick={() => setMobilePanel("chat")}>Discovery</button>
          <button className={`rounded-lg px-3 py-2 text-sm font-semibold ${mobilePanel === "preview" ? "bg-[#eaf0ff] text-[#3157d5]" : "text-[#66728b]"}`} onClick={() => setMobilePanel("preview")}>Dokumen</button>
        </nav>

        <div className="grid min-h-0 flex-1 md:grid-cols-[40%_60%]">
          <section className={`${mobilePanel === "chat" ? "flex" : "hidden"} min-h-0 flex-col bg-[#f4f7fd] md:flex`} aria-label="Percakapan discovery">
            <div className="scroll-slim flex-1 overflow-y-auto px-4 py-5 md:px-6">
              <div className="mx-auto flex max-w-2xl flex-col gap-4">
                {messages.map((message) => (
                  <article key={message.id} className={`workshop-enter flex gap-2.5 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    {message.role === "assistant" && <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#17213a] text-white"><Bot size={14} /></span>}
                    <div className="max-w-[84%]">
                      <div className={`rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${message.role === "user" ? "rounded-br-md bg-[#3157d5] text-white" : "rounded-bl-md border border-[#d9e0ee] bg-white text-[#33405a]"}`}>
                        {message.role === "assistant" ? (
                          <div className="chat-markdown">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                          </div>
                        ) : message.content}
                      </div>
                      {message.role === "assistant" && message.choices?.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {message.choices.map((choice) => (
                            <button key={choice} type="button" onClick={() => chooseSuggestion(choice)} disabled={Boolean(busy)} className="chat-suggestion rounded-full border border-[#ccd7ef] bg-white px-2.5 py-1 text-left font-semibold text-[#3157d5] transition hover:border-[#3157d5] hover:bg-[#eaf0ff] disabled:cursor-not-allowed disabled:opacity-40">
                              {choice}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {message.role === "user" && <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#cdd6e8] bg-white text-[#3157d5]"><UserRound size={14} /></span>}
                  </article>
                ))}
                {busy === "chat" && (
                  <div className="flex items-center gap-2.5 text-sm text-[#66728b]">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-[#17213a] text-white"><Bot size={14} /></span>
                    <span className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-[#d9e0ee] bg-white px-4 py-3"><LoaderCircle className="animate-spin" size={15} /> Menyusun pertanyaan…</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="border-t border-[#d9e0ee] bg-white/80 p-4 backdrop-blur md:p-5">
              {attachments.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {attachments.map((file) => {
                    const expired = expiredIds.has(file.id);
                    return (
                      <span key={file.id} className={`flex max-w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${expired ? "border-[#ef6d5b]/30 bg-[#ef6d5b]/8 text-[#a64035]" : "border-[#ccd7ef] bg-[#eaf0ff] text-[#3157d5]"}`}>
                        <Paperclip size={12} />
                        <span className="max-w-44 truncate">{file.filename}</span>
                        {expired && <strong>Kedaluwarsa</strong>}
                        <button aria-label={`Hapus ${file.filename}`} onClick={() => removeAttachment(file)} className="rounded p-0.5 hover:bg-black/5"><X size={12} /></button>
                      </span>
                    );
                  })}
                </div>
              )}

              {error && (
                <div role="alert" className="mb-3 flex items-start gap-2 rounded-xl border border-[#ef6d5b]/25 bg-[#fff1ef] p-3 text-xs leading-5 text-[#8e3d34]">
                  <AlertCircle className="mt-0.5 shrink-0" size={15} />
                  <span className="flex-1">{error}</span>
                  {retry && <button className="font-bold underline underline-offset-2" onClick={runRetry}>Coba lagi</button>}
                  <button aria-label="Tutup pesan error" onClick={() => setError("")}><X size={14} /></button>
                </div>
              )}

              <div className="rounded-2xl border border-[#cbd5e8] bg-white p-2 shadow-[0_10px_30px_rgba(23,33,58,0.08)] transition focus-within:border-[#3157d5] focus-within:ring-3 focus-within:ring-[#3157d5]/10">
                <textarea aria-label="Pesan discovery" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendChat(); } }} placeholder="Jelaskan masalah, pengguna, atau fitur utamanya…" rows={3} maxLength={20_000} className="block w-full resize-none bg-transparent px-2 py-1.5 text-sm leading-6 text-[#17213a] placeholder:text-[#8c96aa] focus:outline-none" />
                <div className="flex items-center justify-between border-t border-[#edf0f6] pt-2">
                  <div>
                    <input ref={fileInputRef} className="sr-only" type="file" accept=".pdf,.txt,.md,.markdown,.png,.jpg,.jpeg" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file); }} />
                    <button type="button" aria-label="Lampirkan file" disabled={Boolean(busy) || attachments.length >= 5} onClick={() => fileInputRef.current?.click()} className="grid h-9 w-9 place-items-center rounded-lg text-[#66728b] transition hover:bg-[#eaf0ff] hover:text-[#3157d5] disabled:opacity-40">
                      {busy === "upload" ? <LoaderCircle className="animate-spin" size={17} /> : <Paperclip size={17} />}
                    </button>
                  </div>
                  <button type="button" onClick={() => sendChat()} disabled={Boolean(busy) || !hydrated || !input.trim()} className="flex h-9 items-center gap-2 rounded-lg bg-[#17213a] px-3.5 text-xs font-bold text-white transition hover:bg-[#3157d5] disabled:cursor-not-allowed disabled:opacity-40">
                    Kirim <Send size={14} />
                  </button>
                </div>
              </div>

              <button type="button" onClick={() => void generatePrd()} disabled={!canGenerate} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#3157d5] px-4 py-3 text-sm font-bold text-white shadow-lg shadow-[#3157d5]/20 transition hover:-translate-y-0.5 hover:bg-[#284bc3] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40">
                {busy === "generate" ? <LoaderCircle className="animate-spin" size={17} /> : <Sparkles size={17} />}
                {busy === "generate" ? "Menyusun PRD…" : "Generate PRD"}
              </button>
              {generateHint && <p className="mt-2 text-center text-xs text-[#66728b]">{generateHint}</p>}
              {expiredIds.size > 0 && <p className="mt-2 text-center text-xs text-[#a64035]">Hapus dan unggah ulang lampiran yang kedaluwarsa.</p>}
            </div>
          </section>

          <section className={`${mobilePanel === "preview" ? "flex" : "hidden"} min-h-0 flex-col bg-[#e9eef7] md:flex`} aria-label="Preview PRD">
            <div className="flex h-[68px] shrink-0 items-center justify-between border-b border-[#d9e0ee] bg-[#f8faff] px-4 md:px-7">
              <div>
                <p className="text-[10px] font-bold tracking-[0.16em] text-[#66728b] uppercase">Dokumen kerja</p>
                <h2 className="mt-0.5 text-sm font-bold text-[#17213a]">{productTitle.trim() || "PRD belum diberi judul"}</h2>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setIsEditingPrd((current) => !current)} disabled={!prdContent} className="flex h-9 items-center gap-2 rounded-lg border border-[#ccd5e5] bg-white px-3 text-xs font-bold text-[#445069] shadow-sm transition hover:border-[#3157d5] hover:text-[#3157d5] disabled:opacity-40">
                  <PenLine size={14} /><span className="hidden sm:inline">{isEditingPrd ? "Selesai edit" : "Edit"}</span>
                </button>
                <button type="button" onClick={copyPrd} disabled={!prdContent} className="flex h-9 items-center gap-2 rounded-lg border border-[#ccd5e5] bg-white px-3 text-xs font-bold text-[#445069] shadow-sm transition hover:border-[#3157d5] hover:text-[#3157d5] disabled:opacity-40">
                  {copied ? <Check size={14} /> : <Clipboard size={14} />}<span className="hidden sm:inline">{copied ? "Tersalin" : "Salin"}</span>
                </button>
                <button type="button" onClick={downloadPrd} disabled={!prdContent} className="flex h-9 items-center gap-2 rounded-lg bg-[#17213a] px-3 text-xs font-bold text-white transition hover:bg-[#3157d5] disabled:opacity-40">
                  <Download size={14} /><span className="hidden sm:inline">Unduh .md</span>
                </button>
              </div>
            </div>

            <div className="scroll-slim flex-1 overflow-y-auto p-3 sm:p-5 md:p-7 lg:p-9">
              <article className="mx-auto min-h-full max-w-[900px] rounded-sm border border-[#d8deea] bg-[#fbfcff] px-5 py-7 shadow-[0_18px_50px_rgba(23,33,58,0.09)] sm:px-8 md:px-10 md:py-10 lg:px-14">
                {prdContent ? (
                  isEditingPrd ? (
                    <div className="workshop-enter">
                      <p className="mb-3 text-xs font-semibold text-[#66728b]">Mode edit aktif — perubahan tersimpan otomatis.</p>
                      <textarea aria-label="Editor PRD" value={prdContent} onChange={(event) => setPrdContent(event.target.value)} className="min-h-[62vh] w-full resize-y rounded-xl border border-[#d9e0ee] bg-white p-4 font-mono text-sm leading-6 text-[#27334b] outline-none transition focus:border-[#3157d5] focus:ring-3 focus:ring-[#3157d5]/10" />
                    </div>
                  ) : (
                    <div className="prd-markdown workshop-enter">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{prdContent}</ReactMarkdown>
                    </div>
                  )
                ) : (
                  <div className="grid min-h-[62vh] place-items-center text-center">
                    <div className="max-w-sm">
                      <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-[#ccd7ef] bg-[#eaf0ff] text-[#3157d5]"><FileText size={23} /></div>
                      <h3 className="text-lg font-bold tracking-[-0.02em] text-[#17213a]">Dokumen tumbuh dari percakapan</h3>
                      <p className="mt-2 text-sm leading-6 text-[#66728b]">Jawab pertanyaan discovery, tambahkan konteks bila perlu, lalu buat PRD siap implementasi.</p>
                      <div className="mt-6 grid grid-cols-2 gap-2 text-left text-[11px] font-semibold text-[#66728b]">
                        {["Overview & Objective", "User & Pain Points", "Functional Requirements", "Security & Architecture"].map((label) => <span key={label} className="rounded-lg border border-[#e0e5ef] bg-white px-2.5 py-2">{label}</span>)}
                      </div>
                    </div>
                  </div>
                )}
              </article>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function messageFromError(error: unknown) {
  if (error instanceof ApiError) return error.message;
  return "Tidak dapat terhubung ke server. Pastikan backend dan 9Router sedang berjalan.";
}
