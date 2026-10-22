import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthLayout, { PasswordToggle } from "../components/AuthLayout";

const REMEMBERED_EMAIL_KEY = "smarthire-remembered-email";

function Login() {
  const [email, setEmail] = useState(() => localStorage.getItem(REMEMBERED_EMAIL_KEY) || "");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(Boolean(localStorage.getItem(REMEMBERED_EMAIL_KEY)));
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");
    setInfo("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("http://127.0.0.1:8000/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ username: email.trim(), password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Unable to sign in. Please try again.");
      localStorage.setItem("token", data.access_token);
      if (rememberMe) localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim());
      else localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      navigate("/resumes");
    } catch (err) {
      setError(err.message === "Invalid email or password" ? err.message : (err instanceof TypeError ? "Could not connect to SmartHire AI. Check that the server is running." : err.message));
    } finally {
      setLoading(false);
    }
  };

  return <AuthLayout>
      <section className="auth-card" aria-labelledby="login-title">
        <div className="auth-card-emblem" aria-hidden="true"><span>✦</span></div>
        <p className="auth-eyebrow">Your next step starts here</p>
        <h1 id="login-title">Welcome back <span aria-hidden="true">👋</span></h1>
        <p className="auth-subtitle">Sign in to continue your interview practice.</p>

        {location.state?.registered && <p className="auth-message auth-message-success" role="status">Your account is ready. Sign in to get started.</p>}
        {info && <p className="auth-message auth-message-info" role="status">{info}</p>}
        <form className="auth-form" onSubmit={handleLogin} noValidate>
          <div className="auth-field">
            <label htmlFor="login-email">Email address</label>
            <div className="auth-input-wrap"><span className="auth-input-icon" aria-hidden="true">@</span><input id="login-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></div>
          </div>
          <div className="auth-field">
            <label htmlFor="login-password">Password</label>
            <div className="auth-input-wrap"><span className="auth-input-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none"><rect x="4" y="10" width="16" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.7" /><path d="M8 10V7a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="1.7" /></svg></span><input id="login-password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required /><PasswordToggle visible={showPassword} onToggle={() => setShowPassword((visible) => !visible)} /></div>
          </div>
          <div className="auth-form-options">
            <label className="auth-checkbox"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} /><span>Remember me</span></label>
            <button className="auth-text-link" type="button" onClick={() => { setError(""); setInfo("Password reset is not available yet. Please contact your SmartHire AI administrator."); }}>Forgot password?</button>
          </div>
          {error && <p className="auth-message auth-message-error" role="alert">{error}</p>}
          <button className="auth-submit" type="submit" disabled={loading}>{loading ? <><span className="button-spinner" aria-hidden="true" />Signing in…</> : <>Sign In <span aria-hidden="true">→</span></>}</button>
        </form>
        <div className="auth-divider"><span>New to SmartHire AI?</span></div>
        <p className="auth-switch">Don’t have an account? <Link to="/register">Sign up</Link></p>
      </section>
  </AuthLayout>;
}

export default Login;
