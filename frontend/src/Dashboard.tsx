import { useEffect, useState } from "react";
import { api } from "./api";
import type { User, Email } from "./types";
type Props = {
  user: User;
  refresh: number;
  onCompose: () => void;
  onLogout: () => void;
  onError: (message: string) => void;
  onUser: (user: User) => void;
};
export default function Dashboard({ user, refresh, onCompose, onLogout, onError, onUser }: Props) {
  const [tab, setTab] = useState("scheduled"),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState("");
  const [rows, setRows] = useState<Email[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [failed, setFailed] = useState(0),
    [reload, setReload] = useState(0);
  const [menu, setMenu] = useState(false),
    [selected, setSelected] = useState<Email | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api<{ emails: Email[]; hasMore: boolean; failed: number }>(
      `/emails?status=${tab}&q=${encodeURIComponent(search)}&page=${page}`,
    )
      .then((data) => {
        if (active) {
          setRows(data.emails);
          setMore(data.hasMore);
          setFailed(data.failed);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          onError(e.message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tab, search, page, refresh, reload, onError]);
  async function disconnect() {
    try {
      await api("/slack", { method: "DELETE" });
      onUser({ ...user, slack_team: undefined });
      setMenu(false);
    } catch (e) {
      onError((e as Error).message);
    }
  }
  return (
    <main className="flex min-h-screen flex-col sm:flex-row">
      <aside className="w-full shrink-0 p-4 sm:w-56">
        <div className="mb-4 text-2xl font-black tracking-tighter">ONB</div>
        <div className="relative">
          <button
            onClick={() => setMenu(!menu)}
            className="flex w-full items-center gap-2 rounded-lg bg-soft p-2 text-left"
          >
            {user.avatar ? (
              <img src={user.avatar} alt="" className="h-8 w-8 rounded-full" />
            ) : (
              <span className="grid h-8 w-8 place-items-center rounded-full bg-mint">{user.name[0]}</span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">{user.name}</span>
              <span className="block truncate text-[10px] text-slate-400">{user.email}</span>
            </span>
            <span>⌄</span>
          </button>
          {menu && (
            <div className="absolute top-full z-20 mt-1 w-64 rounded-lg border border-slate-100 bg-white p-3 text-xs shadow-lg">
              {user.slack_team ? (
                <button className="block p-2 text-left" onClick={disconnect}>
                  Disconnect Slack ({user.slack_team})
                </button>
              ) : (
                <a className="block p-2" href="/api/slack/connect">
                  Connect Slack
                </a>
              )}
              {user.admin && (
                <a className="block p-2" href="/admin/queues" target="_blank" rel="noreferrer">
                  Queue dashboard ↗
                </a>
              )}
              <button className="block p-2" onClick={onLogout}>
                Logout
              </button>
            </div>
          )}
        </div>
        <button className="outline-button mt-3 w-full" onClick={onCompose}>
          Compose New Email
        </button>
        <p className="mt-6 mb-2 px-2 text-[10px] tracking-wider text-slate-400">CORE</p>
        {["scheduled", "sent"].map((value) => (
          <button
            key={value}
            onClick={() => {
              setTab(value);
              setPage(0);
            }}
            className={`mb-1 block w-full rounded-lg px-3 py-2 text-left text-xs ${tab === value ? "bg-mint" : "hover:bg-soft"}`}
          >
            <span className="mr-2">{value === "scheduled" ? "◷" : "↗"}</span>
            {value === "scheduled" ? "Scheduled Emails" : "Sent Emails"}
          </button>
        ))}
      </aside>
      <section className="min-w-0 flex-1 px-4 py-5">
        <form
          className="mb-5 flex max-w-xl items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(query);
            setPage(0);
          }}
        >
          <input
            aria-label="Search emails"
            placeholder="Search emails"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!e.target.value) {
                setSearch("");
                setPage(0);
              }
            }}
            className="field rounded-full py-2"
          />
          <button type="submit" className="text-xs text-slate-500">
            Search
          </button>
          <button
            type="button"
            aria-label="Refresh emails"
            className="text-slate-400"
            onClick={() => setReload((x) => x + 1)}
          >
            ↻
          </button>
        </form>
        {failed > 0 && (
          <p className="mb-3 text-xs text-amber-700">
            {failed} delivery attempt(s) failed or have an uncertain result. They are not automatically
            resent.
          </p>
        )}
        {loading ? (
          <p className="py-20 text-center text-sm text-slate-400">Loading emails…</p>
        ) : error ? (
          <p className="py-20 text-center text-sm text-red-600">{error}</p>
        ) : !rows.length ? (
          <p className="py-20 text-center text-sm text-slate-400">
            {search ? "No emails match your search." : `No ${tab} emails yet.`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-3 pr-3">Recipient</th>
                  <th className="py-3 pr-3">{tab === "scheduled" ? "Scheduled time" : "Delivery"}</th>
                  <th className="py-3">Subject and body</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-50 hover:bg-soft">
                    <td className="w-48 whitespace-nowrap py-4 pr-3">To: {row.recipient}</td>
                    <td className="w-52 whitespace-nowrap pr-3">
                      <span
                        className={`rounded px-2 py-1 text-[10px] ${
                          tab === "scheduled"
                            ? "bg-orange-50 text-orange-600"
                            : row.status === "failed"
                              ? "bg-red-50 text-red-700"
                              : "bg-soft text-slate-500"
                        }`}
                      >
                        {tab === "scheduled"
                          ? new Date(row.scheduled_at).toLocaleString()
                          : `${row.status === "failed" ? "Failed" : "Sent"}${row.sent_at ? ` · ${new Date(row.sent_at).toLocaleString()}` : ""}`}
                      </span>
                    </td>
                    <td>
                      <button onClick={() => setSelected(row)} className="block max-w-xl truncate text-left">
                        <strong className="font-medium">{row.subject}</strong>
                        <span className="ml-2 text-slate-400">— {row.body}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !error && (page > 0 || more) && (
          <div className="mt-5 flex justify-end gap-4 text-xs">
            <button disabled={!page} onClick={() => setPage((x) => x - 1)}>
              Previous
            </button>
            <span>Page {page + 1}</span>
            <button disabled={!more} onClick={() => setPage((x) => x + 1)}>
              Next
            </button>
          </div>
        )}
      </section>
      {selected && (
        <div
          className="fixed inset-0 z-30 grid place-items-center bg-black/20 p-5"
          onClick={() => setSelected(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Email details"
            className="max-h-[85vh] w-full max-w-xl overflow-auto rounded-xl bg-white p-7 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelected(null)}
              className="float-right"
              aria-label="Close email details"
            >
              ×
            </button>
            <h2 className="pr-5 text-lg font-medium">{selected.subject}</h2>
            <p className="mt-3 text-xs text-slate-400">To: {selected.recipient}</p>
            <p className="my-6 whitespace-pre-wrap text-sm">{selected.body}</p>
            {selected.preview_url && (
              <a href={selected.preview_url} target="_blank" rel="noreferrer" className="text-sm text-brand">
                View in Ethereal ↗
              </a>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
