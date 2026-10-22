import { Link } from "react-router-dom";

export function PasswordToggle({ visible, onToggle }) {
  return <button className="auth-password-toggle" type="button" onClick={onToggle} aria-label={visible ? "Hide password" : "Show password"}>
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M2.5 12s3.2-6 9.5-6 9.5 6 9.5 6-3.2 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="2.7" stroke="currentColor" strokeWidth="1.7" />
      {visible && <path d="m4 4 16 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />}
    </svg>
  </button>;
}

export default function AuthLayout({ children }) {
  return <main className="auth-screen">
    <div className="auth-orb auth-orb-one" aria-hidden="true" />
    <div className="auth-orb auth-orb-two" aria-hidden="true" />
    <div className="auth-shell">
      <Link className="auth-brand" to="/login" aria-label="SmartHire AI home">
        <span className="auth-brand-mark" aria-hidden="true"><span>SH</span><i>AI</i></span>
        <span className="auth-brand-copy"><strong>SmartHire AI</strong><small>AI-powered interview practice</small></span>
      </Link>
      {children}
      <p className="auth-footnote"><span aria-hidden="true">⌑</span> Your interview practice, thoughtfully prepared.</p>
    </div>
  </main>;
}
