import { useRef, useState } from "react";
import { api } from "./api";
import type { User } from "./types";
export default function Compose({
  user,
  onClose,
  onSent,
  onError,
}: {
  user: User;
  onClose: () => void;
  onSent: (count: number) => void;
  onError: (message: string) => void;
}) {
  const [subject, setSubject] = useState(""),
    [body, setBody] = useState(""),
    [recipients, setRecipients] = useState<string[]>([]);
  const [delay, setDelay] = useState(2),
    [hourly, setHourly] = useState(200),
    [start, setStart] = useState(""),
    [busy, setBusy] = useState(false);
  const previous = useRef({ body: "", id: "" });
  async function upload(file?: File) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      onError("CSV must be smaller than 2 MB.");
      return;
    }
    try {
      const text = await file.text();
      // Assignment CSV: extract email addresses from cells, ignoring names and headers.
      const emails = [
        ...new Set(
          (text.match(/[A-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []).map((x) =>
            x.toLowerCase(),
          ),
        ),
      ];
      if (emails.length > 10000) {
        onError("Maximum 10,000 recipients per upload.");
        return;
      }
      setRecipients(emails);
      if (!emails.length) onError("No valid email addresses found.");
    } catch {
      onError("Could not read the CSV.");
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!recipients.length) {
      onError("Upload a CSV containing recipient emails.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        subject,
        body,
        recipients,
        startTime: new Date(start).toISOString(),
        delayMs: delay * 1000,
        hourlyLimit: hourly,
      };
      const content = JSON.stringify(payload);
      if (previous.current.body !== content) previous.current = { body: content, id: crypto.randomUUID() };
      const result = await api<{ count: number }>("/emails", {
        method: "POST",
        body: JSON.stringify({ ...payload, requestId: previous.current.id }),
      });
      onSent(result.count);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="min-h-screen p-5">
      <header className="flex items-center justify-between">
        <button type="button" disabled={busy} onClick={onClose} className="text-sm">
          ← Compose New Email
        </button>
        <button disabled={busy} className="outline-button">
          {busy ? "Scheduling…" : "Send Later"}
        </button>
      </header>
      <fieldset disabled={busy} className="mx-auto mt-10 max-w-4xl space-y-5">
        <div className="flex items-center gap-5 text-xs">
          <span className="w-12">From</span>
          <span className="rounded bg-soft px-3 py-2">{user.email}</span>
        </div>
        <div className="flex items-center gap-5 border-b border-slate-100 pb-3 text-xs">
          <span className="w-12">To</span>
          <span className="flex-1 text-slate-400">
            {recipients.length ? `${recipients.length} unique emails detected` : "Upload recipients from CSV"}
          </span>
          <label className="cursor-pointer text-brand">
            ↥ Upload List
            <input
              aria-label="Upload recipients CSV"
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="sr-only"
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {recipients.length > 0 && (
          <div className="flex flex-wrap gap-2 pl-17">
            {recipients.slice(0, 5).map((email) => (
              <span key={email} className="rounded-full bg-mint px-2 py-1 text-[10px]">
                {email}
              </span>
            ))}
            {recipients.length > 5 && (
              <span className="text-xs text-slate-400">+{recipients.length - 5} more</span>
            )}
          </div>
        )}
        <label className="flex items-center gap-5 border-b border-slate-100 pb-2 text-xs">
          <span className="w-12">Subject</span>
          <input
            required
            maxLength={200}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="flex-1 p-2 outline-none"
          />
        </label>
        <div className="flex flex-wrap gap-5 text-xs">
          <label className="flex items-center gap-2">
            Delay between emails (seconds)
            <input
              type="number"
              min="0"
              max="86400"
              required
              value={delay}
              onChange={(e) => setDelay(Number(e.target.value))}
              className="w-20 rounded border border-slate-200 p-2"
            />
          </label>
          <label className="flex items-center gap-2">
            Hourly limit
            <input
              type="number"
              min="1"
              required
              value={hourly}
              onChange={(e) => setHourly(Number(e.target.value))}
              className="w-20 rounded border border-slate-200 p-2"
            />
          </label>
          <label className="flex items-center gap-2">
            Start time
            <input
              type="datetime-local"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="rounded border border-slate-200 p-2"
            />
          </label>
        </div>
        <textarea
          aria-label="Email body"
          required
          maxLength={100000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type your email…"
          className="field min-h-80 resize-y bg-[#fafafa] sm:min-h-[430px]"
        />
      </fieldset>
    </form>
  );
}
