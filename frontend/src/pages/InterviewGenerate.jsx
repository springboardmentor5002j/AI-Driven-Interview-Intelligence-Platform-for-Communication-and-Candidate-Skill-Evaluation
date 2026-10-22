import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/axios";

export default function InterviewGenerate() {
  const [searchParams] = useSearchParams();
  const resumeId = searchParams.get("resume_id") || "";
  const navigate = useNavigate();

  const [interviewType, setInterviewType] = useState("technical");
  const [difficulty, setDifficulty] = useState("medium");
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleGenerate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/interviews/generate/", {
        interview_type: interviewType, difficulty, domain,
        resume_id: resumeId || null, question_count: 5,
      });
      navigate(`/interviews/${data.id}/room`);
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't generate interview. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <Link to="/dashboard" className="back-link">&larr; Back to Dashboard</Link>
      <h2>Generate a Mock Interview</h2>
      <div className="card">
        {resumeId && <p className="muted">Using resume #{resumeId}</p>}
        <form onSubmit={handleGenerate}>
          <label>Interview Type</label>
          <select value={interviewType} onChange={(e) => setInterviewType(e.target.value)}>
            <option value="technical">Technical</option>
            <option value="hr">HR</option>
            <option value="behavioral">Behavioral</option>
            <option value="aptitude">Aptitude</option>
          </select>
          <label>Difficulty</label>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
          <label>Domain (optional)</label>
          <input placeholder='e.g. "Backend", "Data Science"' value={domain} onChange={(e) => setDomain(e.target.value)} />
          <button type="submit" disabled={loading}>
            {loading ? "Generating..." : "Generate Interview & Start"}
          </button>
        </form>
        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}
