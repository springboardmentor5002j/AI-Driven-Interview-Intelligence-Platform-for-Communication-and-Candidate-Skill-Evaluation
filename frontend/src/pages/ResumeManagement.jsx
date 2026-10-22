import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { getMyResumes, uploadResume } from "../services/resumeApi";

export default function ResumeManagement() {
  const navigate = useNavigate();
  const [resumes, setResumes] = useState([]);
  const [file, setFile] = useState(null);
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [libraryWarning, setLibraryWarning] = useState("");

  const refresh = useCallback(async (token) => {
    const result = await getMyResumes(token);
    setResumes(result);
    setLibraryWarning("");
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    getMyResumes(token)
      .then(setResumes)
      .catch((err) => setLibraryWarning(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleUpload = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!file) { setError("Please select a PDF file."); return; }
    const hasPdfExtension = file.name.toLowerCase().endsWith(".pdf");
    const hasPdfType = !file.type || file.type === "application/pdf" || file.type === "application/octet-stream";
    if (!hasPdfExtension || !hasPdfType) {
      setError("Please select a PDF file."); return;
    }
    if (file.size >= 10 * 1024 * 1024) { setError("File size must be less than 10 MB."); return; }
    setUploading(true);
    const token = localStorage.getItem("token");
    try {
      await uploadResume(file, token);
    } catch (err) {
      setError(err.message);
      setUploading(false);
      return;
    }

    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setError("");
    setNotice("Resume uploaded successfully.");
    try {
      await refresh(token);
    } catch (err) {
      setLibraryWarning(`Resume uploaded successfully, but the resume list could not be refreshed: ${err.message}`);
    }
    setUploading(false);
  };

  return <main className="page-shell">
    <PageHeader
      eyebrow="Candidate workspace"
      title="Resume Library"
      subtitle="Upload and manage your resumes for personalized interview generation."
      actions={<Link className="button" to="/generate-interview">Generate an interview</Link>}
    />

    <form className="card resume-upload" onSubmit={handleUpload}>
      <div className="file-field">
        <div><h2>Upload Resume</h2><p className="muted small">PDF files only · Maximum 10 MB</p></div>
        <input ref={fileInputRef} aria-label="Choose resume PDF" type="file" accept="application/pdf,.pdf" onChange={(e) => { setFile(e.target.files?.[0] || null); setError(""); setNotice(""); }} disabled={uploading} />
        {file && <p className="muted small">Selected: <strong>{file.name}</strong></p>}
      </div>
      <button className="button" type="submit" disabled={uploading || !file}>
        {uploading ? <><span className="button-spinner" aria-hidden="true" />Uploading…</> : "Upload Resume"}
      </button>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}
    </form>

    <div className="section-heading">
      <h2>Your Resumes</h2>
      {!loading && <span className="count-pill">{resumes.length} {resumes.length === 1 ? "resume" : "resumes"}</span>}
    </div>
    {libraryWarning && resumes.length > 0 && <p className="muted small" role="status">{libraryWarning}</p>}
    {loading ? <section className="card loading-state" aria-live="polite">Loading your resume library…</section> : libraryWarning && resumes.length === 0 ? <section className="card empty-state" role="status">{libraryWarning}</section> : resumes.length === 0 ? (
      <section className="card empty-state">
        <span className="empty-icon" aria-hidden="true">↑</span>
        <h3>No resumes uploaded yet</h3>
        <p className="muted">Upload your first resume to start generating personalized interviews.</p>
      </section>
    ) : <div className="stack">{resumes.map((resume) => (
      <article key={resume.resume_id} className="card resume-card">
        <div className="resume-card-head">
          <div>
            <h3 className="resume-filename">{resume.filename}</h3>
            <div className="resume-file-meta">
              <span>Resume ID <strong>#{resume.resume_id}</strong></span>
              <span>Uploaded {resume.uploaded_at ? new Date(resume.uploaded_at).toLocaleDateString() : "recently"}</span>
              <span>{resume.text_length.toLocaleString()} characters extracted</span>
            </div>
          </div>
          <button className="button button-quiet" onClick={() => navigate("/generate-interview", { state: { resumeId: resume.resume_id } })}>Use for interview</button>
        </div>
        {resume.summary && <div className="resume-summary"><strong>Summary</strong><p>{resume.summary}</p></div>}
        <details className="resume-details">
          <summary>View extracted details</summary>
          <div className="resume-detail-grid">
            <div className="resume-detail"><strong>Skills</strong><p>{resume.skills.length ? resume.skills.join(" · ") : "No recognized skills found."}</p></div>
            <div className="resume-detail"><strong>Education</strong><p>{resume.education || "No education section found."}</p></div>
            <div className="resume-detail"><strong>Experience</strong><p>{resume.experience || "No experience section found."}</p></div>
          </div>
        </details>
      </article>
    ))}</div>}
  </main>;
}
