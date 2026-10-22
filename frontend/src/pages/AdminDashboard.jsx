import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [accessRows, setAccessRows] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savingUserId, setSavingUserId] = useState(null);
  const [selectedRecruiter, setSelectedRecruiter] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState("");
  const [savingAccess, setSavingAccess] = useState(false);
  const [deletingAccessId, setDeletingAccessId] = useState(null);

  const loadAll = async () => {
    try {
      const [statsResponse, usersResponse, sessionsResponse, accessResponse] = await Promise.all([
        api.get("/auth/admin/stats/"),
        api.get("/auth/admin/users/"),
        api.get("/interviews/admin/sessions/"),
        api.get("/auth/admin/access/"),
      ]);
      setStats(statsResponse.data);
      setUsers(Array.isArray(usersResponse.data) ? usersResponse.data : []);
      setSessions(Array.isArray(sessionsResponse.data) ? sessionsResponse.data : []);
      setAccessRows(Array.isArray(accessResponse.data) ? accessResponse.data : []);
      setError("");
    } catch (err) {
      setError(err.response?.data?.detail || "Could not load admin data. Check that you are signed in with an Admin account.");
    }
  };

  useEffect(() => { loadAll(); }, []);

  const changeRole = async (userId, newRole) => {
    setError("");
    setNotice("");
    setSavingUserId(userId);
    try {
      await api.patch(`/auth/admin/users/${userId}/role/`, { role: newRole });
      setNotice("User role updated.");
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not update role.");
    } finally {
      setSavingUserId(null);
    }
  };

  const assignCandidate = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!selectedRecruiter || !selectedCandidate) {
      setError("Choose both a recruiter and a candidate.");
      return;
    }
    setSavingAccess(true);
    try {
      await api.post("/auth/admin/access/", {
        recruiter_id: Number(selectedRecruiter),
        candidate_id: Number(selectedCandidate),
      });
      setNotice("Candidate assigned successfully. The recruiter can now see eligible scored interview reports.");
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not assign this candidate to the recruiter.");
    } finally {
      setSavingAccess(false);
    }
  };

  const removeAssignment = async (accessId) => {
    setError("");
    setNotice("");
    setDeletingAccessId(accessId);
    try {
      await api.delete(`/auth/admin/access/${accessId}/`);
      setAccessRows((current) => current.filter((row) => row.id !== accessId));
      setNotice("Assignment removed.");
    } catch (err) {
      setError(err.response?.data?.detail || "Could not remove this assignment.");
    } finally {
      setDeletingAccessId(null);
    }
  };

  const recruiters = users.filter((u) => u.role === "recruiter" && u.is_active !== false);
  const candidates = users.filter((u) => u.role === "candidate" && u.is_active !== false);

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <Link to="/dashboard" className="back-link">&larr; Back to Dashboard</Link>
      <h2>Admin Dashboard</h2>
      {error && <p className="error-text" role="alert">{error}</p>}
      {notice && <p role="status" style={{ color: "var(--success, #15803d)" }}>{notice}</p>}

      {stats && (
        <div className="card">
          <h3>Platform Overview</h3>
          <div className="score-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            <div className="score-item"><div className="value">{stats.total_users}</div><div className="label">Total Users</div></div>
            <div className="score-item"><div className="value">{stats.total_candidates}</div><div className="label">Candidates</div></div>
            <div className="score-item"><div className="value">{stats.total_recruiters}</div><div className="label">Recruiters</div></div>
            <div className="score-item"><div className="value">{stats.total_admins}</div><div className="label">Admins</div></div>
            <div className="score-item"><div className="value">{stats.total_resumes}</div><div className="label">Resumes</div></div>
            <div className="score-item"><div className="value">{stats.total_interviews}</div><div className="label">Interviews</div></div>
            <div className="score-item"><div className="value">{stats.completed_interviews}</div><div className="label">Completed</div></div>
          </div>
        </div>
      )}

      <section className="card">
        <h3>Assign candidates to recruiters</h3>
        <p className="muted">Assignments give the selected recruiter access to this candidate's eligible completed interview reports. Only active recruiter and candidate accounts are listed.</p>
        {recruiters.length === 0 || candidates.length === 0 ? <p className="muted">Create or promote at least one recruiter and one candidate account to make an assignment.</p> : (
          <form onSubmit={assignCandidate} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: ".75rem", alignItems: "end" }}>
            <label style={{ margin: 0 }}>Recruiter
              <select value={selectedRecruiter} onChange={(e) => setSelectedRecruiter(e.target.value)} style={{ marginBottom: 0 }}>
                <option value="">Select recruiter</option>
                {recruiters.map((u) => <option key={u.id} value={u.id}>{u.username}{u.email ? ` (${u.email})` : ""}</option>)}
              </select>
            </label>
            <label style={{ margin: 0 }}>Candidate
              <select value={selectedCandidate} onChange={(e) => setSelectedCandidate(e.target.value)} style={{ marginBottom: 0 }}>
                <option value="">Select candidate</option>
                {candidates.map((u) => <option key={u.id} value={u.id}>{u.username}{u.email ? ` (${u.email})` : ""}</option>)}
              </select>
            </label>
            <button type="submit" disabled={savingAccess}>{savingAccess ? "Assigning…" : "Assign candidate"}</button>
          </form>
        )}
        <h4 style={{ marginTop: "1.5rem" }}>Current access assignments</h4>
        {accessRows.length === 0 ? <p className="muted">No assignments yet. Candidate-initiated shares will also appear here.</p> : accessRows.map((row) => (
          <div key={row.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap", padding: ".7rem 0", borderBottom: "1px solid var(--border)" }}>
            <div><strong>{row.candidate_username}</strong> <span className="muted">→</span> <strong>{row.recruiter_username}</strong><p className="muted" style={{ margin: ".2rem 0 0" }}>{row.source === "admin" ? "Admin assignment" : "Shared by candidate"} · {row.created_at ? new Date(row.created_at).toLocaleString() : ""}</p></div>
            <button type="button" className="secondary" disabled={deletingAccessId === row.id} onClick={() => removeAssignment(row.id)}>{deletingAccessId === row.id ? "Removing…" : "Remove access"}</button>
          </div>
        ))}
      </section>

      <div className="card">
        <h3>Manage Users</h3>
        {users.map((u) => (
          <div key={u.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: ".75rem", flexWrap: "wrap", padding: "0.6rem 0", borderBottom: "1px solid var(--border)" }}>
            <div><strong>{u.username}</strong> <span className="muted">({u.email})</span></div>
            <select value={u.role} disabled={savingUserId === u.id} onChange={(e) => changeRole(u.id, e.target.value)} style={{ width: "auto", margin: 0 }}>
              <option value="candidate">Candidate</option>
              <option value="recruiter">Recruiter</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Recent Interview Sessions (system-wide)</h3>
        {sessions.length === 0 && <p className="muted">No interview sessions yet.</p>}
        {sessions.map((s) => (
          <div key={s.id} style={{ padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
            <strong>{s.candidate_username}</strong> — {s.interview_type} ({s.difficulty}){" "}
            <span className={`badge ${s.status === "completed" || s.status === "analyzed" ? "success" : "pending"}`}>{s.status}</span>
            {s.overall_score !== null && <span className="muted"> · Score: {s.overall_score}/100</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
