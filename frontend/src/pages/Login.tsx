"use client";
import { useEffect, useState } from "react";
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Users,
  Briefcase,
} from "lucide-react";
import { authClient, authFetch } from "../lib/client-auth";
export default function Login() {
  const [configured, setConfigured] = useState<boolean | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [portal, setPortal] = useState<"candidate" | "recruiter" | "admin">(
      "candidate",
    );
  async function finish(choice: string) {
    const r = await authFetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portal: choice }),
    });
    const b: any = await r.json();
    if (r.status === 401) return false;
    sessionStorage.removeItem("smarthire-login-portal");
    if (!r.ok) {
      const { client } = await authClient();
      if (client) await client.auth.signOut();
      throw Error(b.error);
    }
    location.replace(b.redirect);
    return true;
  }
  useEffect(() => {
    (async () => {
      try {
        const { configured } = await authClient();
        setConfigured(configured);
        const choice = sessionStorage.getItem("smarthire-login-portal");
        if (choice && ["candidate", "recruiter", "admin"].includes(choice)) {
          setPortal(choice as any);
          await finish(choice);
        }
        const params = new URLSearchParams(location.search);
        if (params.has("error"))
          setMessage(
            params.get("error_description") ||
              "Google sign-in failed. Check Supabase Auth logs.",
          );
      } catch (e: any) {
        setMessage(e.message);
      }
    })();
  }, []);
  async function login() {
    setBusy(true);
    setMessage("");
    try {
      sessionStorage.setItem("smarthire-login-portal", portal);
      if (await finish(portal)) return;
      const { client } = await authClient();
      if (!client)
        throw Error(
          "Configure SUPABASE_URL and SUPABASE_ANON_KEY in the backend .env and restart FastAPI.",
        );
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: location.origin + "/login",
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
    } catch (e: any) {
      setMessage(e.message);
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <a className="brand" href="/">
        <span className="brandmark">
          <Sparkles size={24} />
        </span>
        SmartHire<span className="ai">AI</span>
      </a>
      <div className="login-card">
        <span className="pill">YOUR NEXT CHAPTER STARTS HERE</span>
        <h1>
          How will you use
          <br />
          SmartHire?
        </h1>
        <p>Choose your workspace before signing in.</p>
        <div className="login-choices">
          {(["candidate", "recruiter"] as const).map((p) => (
            <button
              key={p}
              className={portal === p ? "selected" : ""}
              disabled={busy}
              onClick={() => {
                setPortal(p);
                setMessage("");
              }}
            >
              {p === "candidate" ? (
                <Users size={25} />
              ) : (
                <Briefcase size={25} />
              )}
              <b>{p === "candidate" ? "Candidate Login" : "Recruiter Login"}</b>
              <span>
                {p === "candidate"
                  ? "Prepare, practice and grow"
                  : "For admin-authorized recruiters"}
              </span>
            </button>
          ))}
        </div>
        <button
          className="google-button"
          disabled={busy || !configured}
          onClick={login}
        >
          <b className="google-g">{configured ? "G" : "↗"}</b>
          {busy
            ? "Connecting…"
            : configured
              ? "Continue with Google"
              : "Configure Supabase to continue"}
          <ArrowRight size={17} />
        </button>
        {configured === false && (
          <p className="fine">
            Google login activates after Supabase is configured.
          </p>
        )}
        {message && (
          <div className="notice" role="alert">
            {message}
          </div>
        )}
        <div className="login-note">
          <ShieldCheck size={18} />
          <span>
            {portal === "recruiter"
              ? "Only emails added by the administrator can enter the recruiter portal. Candidates must also grant access to their details."
              : portal === "admin"
                ? "Administrator login is restricted to the configured administrator account."
                : "Candidate accounts cannot grant themselves recruiter access."}
          </span>
        </div>
        <button
          className="text-btn admin-login-choice"
          disabled={busy}
          onClick={() => {
            setPortal("admin");
            setMessage("Administrator login selected. Continue above.");
          }}
        >
          Administrator login
        </button>
      </div>
    </div>
  );
}
