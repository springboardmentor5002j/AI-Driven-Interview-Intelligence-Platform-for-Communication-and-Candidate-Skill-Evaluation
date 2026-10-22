import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";

export default function RecruiterCandidates() {
  const [candidates, setCandidates] = useState([]);
  const [selected, setSelected] = useState([]);
  const [comparison, setComparison] = useState(null);
  const [error, setError] = useState("");
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    api.get("/interviews/recruiter/candidates/")
      .then((res) => setCandidates(res.data))
      .catch(() => setError("Could not load candidates. This page is for Recruiter accounts only."));
  }, []);

  const toggleSelect = (id) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const compare = async () => {
    if (selected.length < 2) return;
    setComparing(true);
    setError("");
    try {
      const { data } = await api.get("/interviews/recruiter/compare/", {
        params: { candidate_ids: selected.join(",") },
      });
      setComparison(data);
      if (!data.length) setError("No comparable scored interviews were found for the selected candidates.");
    } catch (err) {
      setError(err.response?.data?.detail || "Could not compare these candidates. Please try again.");
    } finally { setComparing(false); }
  };

  return (
    <div className="page">
      <Link to="/dashboard" className="back-link">&larr; Back to Dashboard</Link>
      <h2>Candidate Reports</h2>
      {error && <p className="error-text">{error}</p>}
      {candidates.length === 0 && !error && <p className="muted">No candidates have completed interviews yet.</p>}

      {candidates.map((c) => (
        <div key={c.candidate_id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p><strong>{c.username}</strong> — {c.email}</p>
            <p className="muted">
              {c.completed_interviews} completed interview(s)
              {c.latest_overall_score !== null && ` · Latest score: ${c.latest_overall_score}/100`}
            </p>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 400 }}>
            <input type="checkbox" style={{ width: "auto", margin: 0 }} checked={selected.includes(c.candidate_id)} onChange={() => toggleSelect(c.candidate_id)} />
            Compare
          </label>
        </div>
      ))}

      {candidates.length > 0 && (
        <button onClick={compare} disabled={selected.length < 2 || comparing}>{comparing ? "Comparing…" : `Compare Selected (${selected.length})`}</button>
      )}

      {comparison && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Comparison</h3>
          {comparison.map((c) => (
            <div key={c.candidate_id} className="score-grid" style={{ marginBottom: 16 }}>
              <div style={{ gridColumn: "1 / -1" }}><strong>{c.username}</strong></div>
              <div className="score-item"><div className="value">{c.overall_score}</div><div className="label">Overall</div></div>
              <div className="score-item"><div className="value">{c.technical_score}</div><div className="label">Technical</div></div>
              <div className="score-item"><div className="value">{c.communication_score}</div><div className="label">Communication</div></div>
              <div className="score-item"><div className="value">{c.confidence_score}</div><div className="label">Confidence</div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
