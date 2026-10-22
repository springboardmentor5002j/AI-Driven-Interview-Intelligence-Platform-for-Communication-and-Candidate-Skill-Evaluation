import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";

export default function ResumeUpload() {
  const [resumes, setResumes] = useState([]);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");
  const [parsing, setParsing] = useState(null);

  const loadResumes = () => {
    api.get("/resumes/").then((res) => setResumes(res.data)).catch(() => {});
  };

  useEffect(() => { loadResumes(); }, []);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return setStatus("Please choose a PDF file first.");
    const formData = new FormData();
    formData.append("file", file);
    setStatus("Uploading...");
    try {
      await api.post("/resumes/upload/", formData);
      setStatus("Uploaded! Click 'Parse with AI' below to extract skills.");
      setFile(null);
      loadResumes();
    } catch (err) {
      const detail = err.response?.data?.file?.[0] || err.response?.data?.detail || "Upload failed. Check that the file is a valid PDF under 10 MB.";
      setStatus(detail);
    }
  };

  const handleParse = async (id) => {
    setParsing(id);
    try {
      await api.post(`/resumes/${id}/parse/`);
      loadResumes();
    } catch (err) {
      setStatus(err.response?.data?.detail || "Parsing failed. Try another text-based PDF or check your AI provider settings.");
    } finally {
      setParsing(null);
    }
  };

  return (
    <div className="page">
      <Link to="/dashboard" className="back-link">&larr; Back to Dashboard</Link>
      <h2>Upload Your Resume</h2>

      <div className="card">
        <form onSubmit={handleUpload}>
          <label>Resume (PDF)</label>
          <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files[0])} />
          <button type="submit">Upload</button>
        </form>
        {status && <p className="muted">{status}</p>}
      </div>

      <h3>Your Resumes</h3>
      {resumes.length === 0 && <p className="muted">No resumes uploaded yet.</p>}

      {resumes.map((r) => (
        <div key={r.id} className="card">
          <p>
            <strong>Resume #{r.id}</strong>{" "}
            <span className={`badge ${r.processed ? "success" : "pending"}`}>
              {r.processed ? "Parsed" : "Not parsed yet"}
            </span>
          </p>
          {!r.processed && (
            <button onClick={() => handleParse(r.id)} disabled={parsing === r.id}>
              {parsing === r.id ? "Parsing..." : "Parse with AI"}
            </button>
          )}
          {r.processed && (
            <div>
              <p><strong>Summary:</strong> {r.ai_summary}</p>
              <p><strong>Skills:</strong> {r.extracted_skills.join(", ") || "—"}</p>
              <p><strong>Technologies:</strong> {r.detected_technologies.join(", ") || "—"}</p>
              <Link to={`/interviews/generate?resume_id=${r.id}`}>
                <button className="secondary">Generate an interview from this resume →</button>
              </Link>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
