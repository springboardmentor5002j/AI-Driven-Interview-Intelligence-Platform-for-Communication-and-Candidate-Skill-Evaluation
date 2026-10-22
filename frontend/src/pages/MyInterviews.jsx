import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getMyInterviews } from "../services/interviewApi";
import PageHeader from "../components/PageHeader";

const dateLabel = (value) => value ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";

function MyInterviews() {
  const [interviews, setInterviews] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const loadInterviews = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) { navigate("/login"); return; }
        setInterviews(await getMyInterviews(token));
      } catch (err) { setError(err.message); }
      finally { setLoading(false); }
    };
    loadInterviews();
  }, [navigate]);

  const openInterview = (id) => navigate(`/interview/${id}`);
  const openResult = (id) => navigate(`/interview-result/${id}`);

  return <main className="page-shell">
    <PageHeader eyebrow="Practice history" title="My Interviews" subtitle="Track your mock interview practice and performance."
      actions={<Link className="button" to="/generate-interview">＋ New Interview</Link>} />
    {loading ? <section className="card loading-state">Loading your interviews…</section> : error ? <section className="card error-state" role="alert">{error}</section> : interviews.length === 0 ? (
      <section className="card empty-state">
        <span className="empty-icon" aria-hidden="true">✦</span>
        <h3>Your practice starts here</h3>
        <p className="muted">Generate your first interview and build confidence one question at a time.</p>
        <Link className="button" to="/generate-interview">Generate an Interview</Link>
      </section>
    ) : <div className="interview-list">{interviews.map((interview) => {
      const status = ["completed", "started", "created"].includes(interview.status) ? interview.status : "created";
      return <article className="card interview-card" key={interview.id}>
        <div>
          <div className="interview-title-row"><h2>{interview.interview_type} Interview</h2><span className={`status-badge status-${status}`}>{status}</span></div>
          <div className="interview-meta">
            <span><strong>Difficulty</strong> {interview.difficulty}</span>
            <span><strong>Date</strong> {dateLabel(interview.completed_at || interview.created_at)}</span>
            <span><strong>Interview</strong> #{interview.id}</span>
          </div>
        </div>
        <div className="interview-action">
          {status === "created" && <button className="button interview-action" onClick={() => openInterview(interview.id)}>Start Interview</button>}
          {status === "started" && <button className="button interview-action" onClick={() => openInterview(interview.id)}>Continue Interview</button>}
          {status === "completed" && <button className="button button-secondary interview-action" onClick={() => openResult(interview.id)}>View Result</button>}
        </div>
      </article>;
    })}</div>}
  </main>;
}

export default MyInterviews;
