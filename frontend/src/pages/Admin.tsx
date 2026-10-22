"use client";
import { useEffect, useState } from "react";
import { authFetch, logout } from "../lib/client-auth";
import { ShieldCheck, Plus, LogOut, Sparkles } from "lucide-react";
export default function Admin() {
  const [roles, setRoles] = useState<any[]>([]),
    [email, setEmail] = useState(""),
    [message, setMessage] = useState(""),
    [allowed, setAllowed] = useState(false),
    [busy, setBusy] = useState(false);
  async function load() {
    const r = await authFetch("/api/roles");
    const b: any = await r.json();
    if (!r.ok) {
      setAllowed(false);
      setMessage(b.error || "Administrator access required");
      return;
    }
    setAllowed(true);
    setRoles(b.roles);
  }
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, []);
  async function add() {
    setBusy(true);
    try {
      const r = await authFetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const b: any = await r.json();
      if (!r.ok) throw Error(b.error);
      setEmail("");
      setMessage(
        "Recruiter authorized. They can sign in with this exact email.",
      );
      await load();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-page">
      <header>
        <a className="brand" href="/candidate">
          <span className="brandmark">
            <Sparkles size={20} />
          </span>
          SmartHire<span className="ai">AI</span>
        </a>
        <div className="portal-links">
          <a href="/candidate">Candidate portal</a>
          <a href="/candidate?view=Events">Manage events</a>
          <a href="/candidate?view=Jobs">Manage jobs</a>
          <a href="/recruiter">Recruiter portal</a>
          <button onClick={logout}>
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <main>
        <div className="eyebrow">ACCOUNT ADMINISTRATION</div>
        <h1>Authorize your recruiting team.</h1>
        <p>
          Recruiter accounts are assigned here. A candidate cannot become a
          recruiter by changing a URL or clicking a role switch.
        </p>
        {message && <div className="notice">{message}</div>}
        {allowed ? (
          <div className="panel permissions">
            <ShieldCheck className="large-icon" size={64} />
            <h2>Recruiter email allowlist</h2>
            <p>
              Adding an email authorizes the recruiter workspace. It does not
              grant candidate data: each candidate must grant access separately.
              No email is sent.
            </p>
            <label>
              Recruiter sign-in email
              <div className="input-action">
                <input
                  type="email"
                  value={email}
                  placeholder="recruiter@company.com"
                  onChange={(e) => setEmail(e.target.value)}
                />
                <button disabled={busy} className="primary" onClick={add}>
                  <Plus size={16} />
                  Authorize recruiter
                </button>
              </div>
            </label>
            {roles.map((r) => (
              <div className="activity-row" key={r.email}>
                <div>
                  <b>{r.email}</b>
                  <small>{r.role}</small>
                </div>
                {r.role === "recruiter" && (
                  <button
                    className="danger-text"
                    onClick={async () => {
                      const resp = await authFetch(
                        "/api/roles?email=" + encodeURIComponent(r.email),
                        { method: "DELETE" },
                      );
                      if (resp.ok) {
                        await load();
                        setMessage("Recruiter authorization removed.");
                      } else setMessage("Could not remove recruiter.");
                    }}
                  >
                    Remove recruiter access
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <a href="/login" className="primary">
            Go to login
          </a>
        )}
      </main>
    </div>
  );
}
