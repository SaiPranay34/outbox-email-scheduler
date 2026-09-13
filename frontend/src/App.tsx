import { useEffect, useState } from "react";
import { api } from "./api";
import type { User } from "./types";
import Login from "./Login";
import Dashboard from "./Dashboard";
import Compose from "./Compose";
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true);
  const [compose, setCompose] = useState(false),
    [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const error = new URLSearchParams(location.search).get("error");
    if (error) {
      setNotice(error);
      history.replaceState(null, "", "/");
    }
    api<User>("/auth/me")
      .then(setUser)
      .catch((e) => {
        if (e.message !== "Please log in.") setNotice(e.message);
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 7000);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
      setUser(null);
      setCompose(false);
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  return (
    <>
      {loading ? (
        <div className="grid min-h-screen place-items-center text-sm text-slate-400">Loading…</div>
      ) : !user ? (
        <Login />
      ) : compose ? (
        <Compose
          user={user}
          onClose={() => setCompose(false)}
          onError={setNotice}
          onSent={(count) => {
            setCompose(false);
            setRefresh((x) => x + 1);
            setNotice(`${count} emails scheduled.`);
          }}
        />
      ) : (
        <Dashboard
          user={user}
          refresh={refresh}
          onCompose={() => setCompose(true)}
          onLogout={logout}
          onError={setNotice}
          onUser={setUser}
        />
      )}
      {notice && (
        <div
          role="status"
          className="fixed right-5 bottom-5 z-50 flex max-w-sm items-center gap-4 rounded-lg bg-slate-800 px-5 py-4 text-sm text-white shadow-lg"
        >
          {notice}
          <button aria-label="Dismiss notification" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}
    </>
  );
}
