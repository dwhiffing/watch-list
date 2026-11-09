import { useEffect, useState } from "react";
import type { SessionInfo } from "../../shared/types";
import { api } from "../api";

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [who, setWho] = useState<number | "new" | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.session().then(
      (s) => {
        setInfo(s);
        if (s.members.length === 0) setWho("new");
      },
      (err: Error) => setError(err.message),
    );
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (who === null) return;
    setBusy(true);
    setError(null);
    try {
      await api.login(password, who === "new" ? { name } : { memberId: who });
      onSignedIn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const ready = who !== null && password.length > 0 && (who !== "new" || name.trim().length > 0);

  return (
    <div className="pt-safe mx-auto flex h-full max-w-sm flex-col justify-center px-6">
      <img src="/icon.svg" alt="" className="mx-auto mb-4 h-16 w-16" />
      <h1 className="mb-6 text-center text-2xl font-bold">Watch List</h1>

      {info && !info.configured ? (
        <p className="text-center text-muted">Set the APP_PASSWORD secret to turn on sign-in. The README has the steps.</p>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <div>
            <div className="mb-2 text-sm text-muted">Who's this?</div>
            <div className="flex flex-wrap gap-2">
              {info?.members.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => setWho(m.id)}
                  className={`rounded-full border px-4 py-2 ${who === m.id ? "border-accent bg-accent/15 text-accent" : "border-line"}`}
                >
                  {m.name}
                </button>
              ))}
              {info && info.members.length > 0 && (
                <button
                  type="button"
                  onClick={() => setWho("new")}
                  className={`rounded-full border px-4 py-2 ${who === "new" ? "border-accent bg-accent/15 text-accent" : "border-line text-muted"}`}
                >
                  Someone new
                </button>
              )}
            </div>
            {who === "new" && (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoComplete="given-name"
                autoFocus
                className="mt-3 w-full rounded-xl border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
              />
            )}
          </div>

          {/* Ask for the password only once you've picked who you are */}
          {who !== null && (
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              autoFocus={who !== "new"}
              className="w-full rounded-xl border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
            />
          )}

          {error && <p className="text-sm text-pass">{error}</p>}

          {who !== null && (
            <>
              <button type="submit" disabled={!ready || busy} className="w-full rounded-xl bg-accent py-3 font-semibold text-black disabled:opacity-40">
                {busy ? "Signing in…" : "Sign in"}
              </button>
              <p className="text-center text-xs text-muted">You'll stay signed in on this device.</p>
            </>
          )}
        </form>
      )}
    </div>
  );
}
