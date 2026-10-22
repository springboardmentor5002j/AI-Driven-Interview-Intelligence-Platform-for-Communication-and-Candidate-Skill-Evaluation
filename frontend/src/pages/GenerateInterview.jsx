import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { generateInterview } from "../services/interviewApi";
import { getMyResumes } from "../services/resumeApi";

const typeDescriptions = {
  Technical: "Questions based on your technical skills and projects.",
  HR: "Questions focused on communication and workplace behavior.",
  Behavioral: "Questions about situations, teamwork, and problem solving.",
  Aptitude: "Logical and quantitative reasoning questions.",
};

function GenerateInterview() {
  const navigate = useNavigate();
  const location = useLocation();
  const [resumes, setResumes] = useState([]);
  const [resumeId, setResumeId] = useState(location.state?.resumeId ? String(location.state.resumeId) : "");
  const [interviewType, setInterviewType] = useState("Technical");
  const [difficulty, setDifficulty] = useState("Medium");
  const [loadingResumes, setLoadingResumes] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { navigate("/login"); return; }
    getMyResumes(token)
      .then((data) => { setResumes(data); if (!location.state?.resumeId && data.length) setResumeId(String(data[0].resume_id)); })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingResumes(false));
  }, [navigate, location.state]);

  const handleGenerate = async (event) => {
    event.preventDefault();
    setError("");
    if (!resumeId) { setError("Upload and select a resume before generating an interview."); return; }
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      await generateInterview(resumeId, interviewType, difficulty, token);
      navigate("/my-interviews");
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return <main className="page-shell">
    <PageHeader eyebrow="Practice" title="Generate Mock Interview" subtitle="Create a personalized interview based on your resume." />
    <section className="card generate-card">
      {loadingResumes ? <div className="loading-state">Loading your resumes…</div> : resumes.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon" aria-hidden="true">＋</span>
          <h3>Add a resume to get started</h3>
          <p className="muted">Your interview questions are tailored to your skills and experience.</p>
          <Link className="button" to="/resumes">Go to Resume Library</Link>
        </div>
      ) : <form className="form-grid" onSubmit={handleGenerate}>
        <div className="field">
          <label htmlFor="resume">Resume</label>
          <p className="field-help">Choose the experience you want to practice with.</p>
          <select id="resume" value={resumeId} onChange={(e) => setResumeId(e.target.value)} required>
            {resumes.map((resume) => <option key={resume.resume_id} value={resume.resume_id}>{resume.filename} · {resume.skills.length ? resume.skills.slice(0, 4).join(", ") : "Resume"}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="type">Interview Type</label>
          <select id="type" value={interviewType} onChange={(e) => setInterviewType(e.target.value)}>
            <option>Technical</option><option>HR</option><option>Behavioral</option><option>Aptitude</option>
          </select>
          <p className="select-option-description" aria-live="polite">{typeDescriptions[interviewType]}</p>
        </div>
        <div className="field">
          <label htmlFor="difficulty">Difficulty</label>
          <p className="field-help">Choose a comfortable level. You can increase it as you practice.</p>
          <select id="difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option>Easy</option><option>Medium</option><option>Hard</option>
          </select>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button generate-submit" type="submit" disabled={loading || loadingResumes}>
          {loading ? <><span className="button-spinner" aria-hidden="true" />Generating questions…</> : "Generate Interview"}
        </button>
      </form>}
    </section>
  </main>;
}

export default GenerateInterview;
