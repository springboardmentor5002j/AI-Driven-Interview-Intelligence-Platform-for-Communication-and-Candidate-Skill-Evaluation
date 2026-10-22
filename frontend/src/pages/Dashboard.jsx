import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/axios";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [interviews, setInterviews] = useState([]);
  const [error, setError] = useState("");
  const [shareIdentity, setShareIdentity] = useState("");
  const [sharedRecruiters, setSharedRecruiters] = useState([]);
  const [shareError, setShareError] = useState("");
  const [shareNotice, setShareNotice] = useState("");
  const [sharing, setSharing] = useState(false);
  const [revokingId, setRevokingId] = useState(null);
  const navigate = useNavigate();

  const loadSharedRecruiters = async () => {
    const response = await api.get("/auth/share/");
    setSharedRecruiters(Array.isArray(response.data) ? response.data : []);
  };

  useEffect(() => {
    let active = true;
    Promise.all([api.get("/auth/me/"), api.get("/interviews/")])
      .then(async ([profile, history]) => {
        if (!active) return;
        setUser(profile.data);
        setInterviews(Array.isArray(history.data) ? history.data : history.data.results || []);
        if (profile.data.role === "candidate") {
          try {
            const response = await api.get("/auth/share/");
            if (active) setSharedRecruiters(Array.isArray(response.data) ? response.data : []);
          } catch {
            if (active) setShareError("Could not load your recruiter sharing settings.");
          }
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err.response?.data?.detail || "Your session could not be loaded. Please sign in again.");
        if (err.response?.status === 401) navigate("/login", { replace: true });
      });
    return () => { active = false; };
  }, [navigate]);

  const logout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    navigate("/login", { replace: true });
  };

  const shareWithRecruiter = async (event) => {
    event.preventDefault();
    setShareError("");
    setShareNotice("");
    const identity = shareIdentity.trim();
    if (!identity) {
      setShareError("Enter the recruiter's username or email address.");
      return;
    }
    setSharing(true);
    try {
      await api.post("/auth/share/", { recruiter: identity });
      setShareIdentity("");
      setShareNotice("Your interview results are now shared with this recruiter.");
      await loadSharedRecruiters();
    } catch (err) {
      setShareError(err.response?.data?.detail || err.response?.data?.recruiter?.[0] || "Could not share results. Check the recruiter username or email.");
    } finally {
      setSharing(false);
    }
  };

  const revokeSharing = async (recruiterId) => {
    setShareError("");
    setShareNotice("");
    setRevokingId(recruiterId);
    try {
      await api.delete(`/auth/share/${recruiterId}/`);
      setSharedRecruiters((current) => current.filter((row) => row.recruiter_id !== recruiterId));
      setShareNotice("Recruiter access has been revoked.");
    } catch (err) {
      setShareError(err.response?.data?.detail || "Could not revoke this access.");
    } finally {
      setRevokingId(null);
    }
  };

  if (!user) return <div className="page">{error ? <p className="error-text">{error}</p> : <p className="muted">Loading your workspace…</p>}</div>;

  const analyzed = interviews.filter((item) => item.score?.overall_score != null);
  const average = analyzed.length ? (analyzed.reduce((sum, item) => sum + item.score.overall_score, 0) / analyzed.length).toFixed(1) : "—";

  return (
    <div className="page">
      <section className="card" style={{ background: "linear-gradient(125deg, #25245b, #5145e5)", color: "white", border: 0, padding: "clamp(1.5rem, 4vw, 2.5rem)" }}>
        <p style={{ color: "#d9d7ff", fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", fontSize: ".76rem" }}>SmartHire AI · Your interview workspace</p>
        <h1 style={{ color: "white", margin: ".4rem 0 .8rem" }}>Welcome back, {user.first_name || user.username}</h1>
        <p style={{ color: "#e5e7ff", maxWidth: 650, marginBottom: "1.25rem" }}>Practise with purpose. Review your results, identify your next steps, and build confidence one interview at a time.</p>
        <div className="btn-row" style={{ marginTop: 0 }}>
          {user.role === "candidate" && <><Link to="/interviews/generate"><button style={{ background: "white", color: "#4338ca", boxShadow: "none" }}>Start a mock interview →</button></Link><Link to="/resumes"><button className="secondary">Manage resumes</button></Link></>}
          {user.role === "recruiter" && <Link to="/recruiter/candidates"><button style={{ background: "white", color: "#4338ca", boxShadow: "none" }}>View candidate reports →</button></Link>}
          {user.role === "admin" && <Link to="/admin-dashboard"><button style={{ background: "white", color: "#4338ca", boxShadow: "none" }}>Open admin dashboard →</button></Link>}
          <button className="secondary" onClick={logout}>Log out</button>
        </div>
      </section>

      {user.role === "candidate" && <>
        <div className="score-grid">
          <div className="score-item"><div className="value">{interviews.length}</div><div className="label">Interviews attempted</div></div>
          <div className="score-item"><div className="value">{analyzed.length}</div><div className="label">Scored interviews</div></div>
          <div className="score-item"><div className="value">{average}</div><div className="label">Average overall score</div></div>
          <div className="score-item"><div className="value">{interviews.filter((item) => item.status === "in_progress").length}</div><div className="label">In progress</div></div>
        </div>
        <section className="card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}><h3 style={{ marginBottom: 0 }}>Your interview history</h3><Link to="/interviews/generate">New interview +</Link></div>
          {interviews.length === 0 ? <p className="muted">No interviews yet. Your first practice session will appear here.</p> : interviews.map((item) => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", padding: "1rem 0", borderBottom: "1px solid var(--border)" }}>
              <div><strong>{(item.interview_type || "Interview").toUpperCase()} · {item.difficulty}</strong><p className="muted" style={{ margin: ".25rem 0 0" }}>{item.domain || "General domain"} · Session #{item.id} · {(item.status || "unknown").replaceAll("_", " ")}</p></div>
              <div style={{ display: "flex", alignItems: "center", gap: ".8rem" }}>{item.score?.overall_score != null && <strong style={{ color: "var(--primary)" }}>{item.score.overall_score}/100</strong>}<Link to={`/interviews/${item.id}`}><button className="secondary">View results</button></Link></div>
            </div>
          ))}
        </section>
        <section className="card">
          <h3>Share results with a recruiter</h3>
          <p className="muted">Enter the username or email of a registered recruiter. Only recruiters you share with or an administrator assigns can view your eligible interview reports.</p>
          <form onSubmit={shareWithRecruiter} style={{ display: "flex", alignItems: "end", gap: ".75rem", flexWrap: "wrap" }}>
            <label style={{ flex: "1 1 260px", margin: 0 }}>Recruiter username or email
              <input value={shareIdentity} onChange={(e) => setShareIdentity(e.target.value)} placeholder="recruiter@example.com" autoComplete="off" />
            </label>
            <button type="submit" disabled={sharing}>{sharing ? "Sharing…" : "Share results"}</button>
          </form>
          {shareError && <p className="error-text" role="alert">{shareError}</p>}
          {shareNotice && <p role="status" style={{ color: "var(--success, #15803d)" }}>{shareNotice}</p>}
          <h4 style={{ marginTop: "1.25rem" }}>Recruiters with access</h4>
          {sharedRecruiters.length === 0 ? <p className="muted">You haven't shared your results with any recruiters yet.</p> : sharedRecruiters.map((row) => (
            <div key={row.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap", padding: ".75rem 0", borderBottom: "1px solid var(--border)" }}>
              <div><strong>{row.username}</strong><p className="muted" style={{ margin: ".2rem 0 0" }}>{row.email}{row.organization ? ` · ${row.organization}` : ""} · {row.source === "admin" ? "Assigned by admin" : "Shared by you"}</p></div>
              {row.source === "candidate" && <button type="button" className="secondary" disabled={revokingId === row.recruiter_id} onClick={() => revokeSharing(row.recruiter_id)}>{revokingId === row.recruiter_id ? "Revoking…" : "Revoke access"}</button>}
            </div>
          ))}
        </section>
      </>}
      {user.role === "recruiter" && <section className="card"><h3>Recruiter workspace</h3><p className="muted">Candidate reports are available only for candidates who have shared their results with you or have been assigned by an administrator.</p><Link to="/recruiter/candidates"><button>Open candidate reports</button></Link></section>}
      {user.role === "admin" && <section className="card"><h3>Platform administration</h3><p className="muted">Manage users, review platform activity, and monitor interview outcomes.</p><Link to="/admin-dashboard"><button>Open admin dashboard</button></Link><a href="http://localhost:8000/admin/" target="_blank" rel="noreferrer" style={{ marginLeft: ".75rem" }}><button className="secondary">Django admin</button></a></section>}
    </div>
  );
}
