import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getInterviewResult } from "../services/interviewApi";
import PageHeader from "../components/PageHeader";

const scoreRows = [
  ["Communication", "communication"],
  ["Confidence indicators", "confidence"],
  ["Technical relevance", "technical_relevance"],
  ["Professionalism", "professionalism"],
];

function formatDuration(seconds) {
  if (!seconds) return "—";
  const totalSeconds = Math.round(seconds);
  return `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`;
}

function InterviewResult() {
  const { interviewId } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadResult = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) { navigate("/login"); return; }
        setResult(await getInterviewResult(interviewId, token));
      } catch (err) { setError(err.message); }
      finally { setLoading(false); }
    };
    loadResult();
  }, [interviewId, navigate]);

  if (loading) return <main className="page-shell"><section className="card loading-state">Loading your assessment…</section></main>;
  if (error) return <main className="page-shell"><section className="card error-state" role="alert"><h2>Couldn’t load this result</h2><p>{error}</p><button className="button button-secondary" onClick={() => navigate("/my-interviews")}>Back to My Interviews</button></section></main>;
  if (!result) return <main className="page-shell"><section className="card empty-state">No result found.</section></main>;

  const scores = result.scores;
  const communicationAnalysis = result.communication_analysis;
  const improvementAreas = scoreRows.filter(([, key]) => Number(scores[key]) < 70);
  return <main className="page-shell">
    <PageHeader eyebrow="Interview assessment" title="Interview Result" subtitle={`Assessment for interview #${result.interview_id}.`} />
    <section className="result-hero" aria-label="Overall score">
      <div className="score-ring" aria-label={`Overall score ${scores.overall} out of 100`}>{scores.overall}</div>
      <div><p className="eyebrow">Overall score</p><h2>Assessment complete</h2><p>Your results are ready. Use the breakdown below to focus your next practice session.</p><span className="rating-pill">{scores.rating}</span></div>
      <span className="status-badge status-completed">Completed</span>
    </section>

    <div className="section-heading"><h2>Score Breakdown</h2><span className="muted small">Scores out of 100</span></div>
    <section className="score-grid" aria-label="Score breakdown">
      {scoreRows.map(([label, key]) => {
        const value = Math.max(0, Math.min(100, Number(scores[key]) || 0));
        return <article className="card score-card" key={key}>
          <div className="score-card-head"><span>{label}</span><span className="score-value">{scores[key]}</span></div>
          <div className="score-track" role="progressbar" aria-label={label} aria-valuemin="0" aria-valuemax="100" aria-valuenow={value}><span style={{ width: `${value}%` }} /></div>
        </article>;
      })}
    </section>

    <section className="card communication-analysis-card">
      <div className="section-heading"><div><p className="eyebrow">Speech-to-text indicators</p><h2>Communication Analysis</h2></div>{communicationAnalysis?.available && <span className="rating-pill">Speech analysis</span>}</div>
      {communicationAnalysis?.available ? <>
        <div className="communication-metrics">
          <article><span>Total spoken words</span><strong>{communicationAnalysis.word_count}</strong></article>
          <article><span>Speaking duration</span><strong>{formatDuration(communicationAnalysis.duration_seconds)}</strong></article>
          <article><span>Average speaking rate</span><strong>{communicationAnalysis.speaking_rate_wpm ?? "—"} <small>WPM</small></strong></article>
          <article><span>Filler words</span><strong>{communicationAnalysis.filler_count}</strong></article>
          <article><span>Communication score</span><strong>{communicationAnalysis.communication_score ?? scores.communication}<small>/100</small></strong></article>
        </div>
        <p className="communication-feedback">{communicationAnalysis.feedback}</p>
        <div className="transcript-list">
          {communicationAnalysis.answers.map((item) => <article className="transcript-item" key={item.question_number}>
            <h3>Question {item.question_number} transcript</h3><blockquote>{item.transcript}</blockquote>
            <p>{item.word_count} words · {item.duration_seconds ? `${item.duration_seconds.toFixed(1)} seconds` : "duration unavailable"} · {item.speaking_rate_wpm ?? "—"} WPM · {item.filler_count} filler words</p>
            <p className="transcript-filler">Detected: {Object.keys(item.filler_words || {}).length ? Object.entries(item.filler_words).map(([word, count]) => `${word} (${count})`).join(", ") : "None"}</p>
            <p className="muted small">{item.feedback}</p>
          </article>)}
        </div>
      </> : <p className="muted">No voice recordings were submitted. Communication was scored using the existing answer-text heuristic.</p>}
      <p className="muted small analysis-note">These are rule-based transcript indicators. They do not measure confidence, emotion, or personality.</p>
    </section>

    <section className="card feedback-card">
      <p className="eyebrow">Personalized feedback</p><h2>AI Feedback</h2>
      <p className="feedback-copy">{result.feedback || "No written feedback is available for this assessment."}</p>
    </section>

    <section className="card feedback-card">
      <h2>Areas to Improve</h2>
      {improvementAreas.length ? <ul className="improvement-list">{improvementAreas.map(([label, key]) => <li key={key}><strong>{label}</strong><span>Consider focusing on this area in your next practice session.</span></li>)}</ul> : <p className="muted">Every score is at least 70. Keep practicing to maintain your progress.</p>}
    </section>

    <div className="result-actions">
      <Link className="button button-secondary" to="/my-interviews">Back to My Interviews</Link>
      <Link className="button" to="/generate-interview">Take Another Interview</Link>
    </div>
  </main>;
}

export default InterviewResult;
