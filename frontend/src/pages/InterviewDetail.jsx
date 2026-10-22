import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../api/axios";

const scoreLabel = (value) => value === null || value === undefined ? "Unavailable" : `${Math.round(value * 10) / 10}/100`;

export default function InterviewDetail() {
  const { id } = useParams();
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let active = true;
    api.get(`/interviews/${id}/`)
      .then((res) => { if (active) setSession(res.data); })
      .catch((err) => { if (active) setError(err.response?.data?.detail || "Could not load this interview session."); });
    return () => { active = false; };
  }, [id]);

  const retryAnalysis = async () => {
    setRetrying(true);
    setError("");
    try {
      const response = await api.post(`/interviews/${id}/complete/`);
      setSession(response.data);
      if (response.data.analysis_error) setError(response.data.analysis_error);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not retry analysis. Please try again shortly.");
    } finally { setRetrying(false); }
  };

  const downloadReport = async () => {
    setDownloading(true);
    setError("");
    try {
      const response = await api.get(`/interviews/${id}/report/`, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `smarthire-interview-${id}-report.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.detail || "The report is not ready yet.");
    } finally { setDownloading(false); }
  };

  if (error && !session) return <div className="page"><p className="error-text">{error}</p><Link to="/dashboard">Back to dashboard</Link></div>;
  if (!session) return <div className="page"><p className="muted">Loading interview report…</p></div>;

  const score = session.score;
  const components = [
    ["Communication", score?.communication_score],
    ["Confidence", score?.confidence_score],
    ["Technical relevance", score?.technical_score],
    ["Professionalism", score?.professionalism_score],
  ];

  return (
    <div className="page">
      <Link to="/dashboard" className="back-link">← Back to Dashboard</Link>
      <section className="card">
        <span className={`badge ${session.status === "analyzed" ? "success" : "pending"}`}>{session.status.replaceAll("_", " ")}</span>
        <h2 style={{ marginTop: ".85rem" }}>{session.interview_type.toUpperCase()} Interview</h2>
        <p className="muted">{session.domain || "General domain"} · {session.difficulty} difficulty · Session #{session.id}</p>
        {session.analysis_error && <p className="error-text">{session.analysis_error}</p>}
        <div className="btn-row">
          {score && <button onClick={downloadReport} disabled={downloading}>{downloading ? "Preparing report…" : "Download PDF report"}</button>}
          {!score && session.status === "completed" && <button onClick={retryAnalysis} disabled={retrying}>{retrying ? "Retrying analysis…" : "Retry analysis"}</button>}
        </div>
      </section>

      {score && (
        <section className="card">
          <h3>Assessment overview</h3>
          <div className="score-grid">
            <div className="score-item"><div className="value">{scoreLabel(score.overall_score)}</div><div className="label">Overall score</div></div>
            <div className="score-item"><div className="value" style={{ fontSize: "1.15rem" }}>{score.rating || "Not rated"}</div><div className="label">Performance band</div></div>
            {components.map(([label, value]) => <div className="score-item" key={label}><div className="value" style={{ fontSize: value == null ? ".95rem" : undefined }}>{scoreLabel(value)}</div><div className="label">{label}</div></div>)}
          </div>
          {score.is_partial && <p className="muted">This is a partial assessment. Some signals were unavailable and were not treated as zero. Missing: {(score.unavailable_components || []).join(", ") || "not specified"}.</p>}
          {score.strengths?.length > 0 && <><h3>Strengths</h3><ul>{score.strengths.map((item, i) => <li key={i}>{item}</li>)}</ul></>}
          {score.weaknesses?.length > 0 && <><h3>Areas to improve</h3><ul>{score.weaknesses.map((item, i) => <li key={i}>{item}</li>)}</ul></>}
          {score.improvement_suggestions?.length > 0 && <><h3>Action plan</h3><ul>{score.improvement_suggestions.map((item, i) => <li key={i}>{item}</li>)}</ul></>}
          {score.practice_recommendations?.length > 0 && <><h3>Practice recommendations</h3><ul>{score.practice_recommendations.map((item, i) => <li key={i}>{item}</li>)}</ul></>}
          {score.learning_resources?.length > 0 && <><h3>Learning topics</h3><ul>{score.learning_resources.map((item, i) => <li key={i}>{typeof item === "string" ? item : `${item.topic || item.title || "Topic"}${item.type ? ` · ${item.type}` : ""}${item.search_query ? ` — search: ${item.search_query}` : ""}`}</li>)}</ul></>}
        </section>
      )}

      <section className="card">
        <h3>Questions</h3>
        <ol>{session.questions.map((q) => <li key={q.id} style={{ marginBottom: "1rem" }}><strong>{q.question_text}</strong>{q.candidate_answer_transcript && <p className="muted"><em>Your answer:</em> {q.candidate_answer_transcript}</p>}</li>)}</ol>
      </section>

      {session.motion_metrics?.sample_count > 1 && (
        <section className="card">
          <h3>Camera motion summary</h3>
          <div className="score-grid">
            <div className="score-item"><div className="value">{session.motion_metrics.sample_count}</div><div className="label">Frames sampled</div></div>
            <div className="score-item"><div className="value">{Math.round((session.motion_metrics.motion_ratio || 0) * 100)}%</div><div className="label">Frames with pixel changes</div></div>
            <div className="score-item"><div className="value">{Number(session.motion_metrics.mean_delta || 0).toFixed(1)}</div><div className="label">Mean pixel change</div></div>
          </div>
          <p className="muted">This is a basic frame-difference motion indicator, not face tracking or emotion recognition. Lighting changes and camera movement can affect it; it is not used to calculate your assessment score.</p>
        </section>
      )}

      {(session.full_transcript || session.communication_notes || session.filler_word_count != null) && (
        <section className="card">
          <h3>Speech & communication</h3>
          <div className="score-grid">
            <div className="score-item"><div className="value">{session.word_count ?? "—"}</div><div className="label">Words transcribed</div></div>
            <div className="score-item"><div className="value">{session.filler_word_count ?? "—"}</div><div className="label">Filler words</div></div>
            <div className="score-item"><div className="value">{session.speaking_pace_wpm ?? "—"}</div><div className="label">Words per minute</div></div>
            <div className="score-item"><div className="value">{session.grammar_checked ? (session.grammar_issues?.length ?? 0) : "—"}</div><div className="label">Grammar notes{!session.grammar_checked ? " (not checked)" : ""}</div></div>
          </div>
          {session.filler_words_found?.length > 0 && <p><strong>Filler words found:</strong> {session.filler_words_found.join(", ")}</p>}
          {session.grammar_issues?.length > 0 && <><h3>Communication notes</h3><ul>{session.grammar_issues.map((item, i) => <li key={i}>{item}</li>)}</ul></>}
          {session.communication_notes && <p>{session.communication_notes}</p>}
          {session.full_transcript && <details><summary>View full transcript</summary><p style={{ whiteSpace: "pre-wrap" }}>{session.full_transcript}</p></details>}
        </section>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
