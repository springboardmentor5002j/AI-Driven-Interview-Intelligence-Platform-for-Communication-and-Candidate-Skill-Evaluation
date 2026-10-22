import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout, { PasswordToggle } from "../components/AuthLayout";

function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState("Candidate");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const redirectTimeout = useRef(null);

  useEffect(() => () => window.clearTimeout(redirectTimeout.current), []);

  const handleRegister = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!name.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Please enter a password.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("http://127.0.0.1:8000/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password, role }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (String(data.detail || "").toLowerCase().includes("already registered")) {
          throw new Error("Email is already registered.");
        }
        if (Array.isArray(data.detail)) {
          if (data.detail.some((item) => item.loc?.includes("email") || String(item.type || "").includes("email"))) {
            throw new Error("Please enter a valid email address.");
          }
          throw new Error(data.detail.map((item) => item.msg || "Please check the information entered.").join(" "));
        }
        if (response.status >= 500) throw new Error("SmartHire AI couldn’t create your account right now. Please try again.");
        throw new Error(data.detail || "We couldn’t create your account. Please try again.");
      }
      setSuccess("Account created successfully. Redirecting you to sign in…");
      redirectTimeout.current = window.setTimeout(() => navigate("/login", { state: { registered: true } }), 1500);
    } catch (err) {
      setError(err instanceof TypeError ? "Could not connect to SmartHire AI. Check that the server is running." : err.message);
    } finally {
      setLoading(false);
    }
  };

  return <AuthLayout>
    <section className="auth-card auth-card-register" aria-labelledby="register-title">
      <div className="auth-card-emblem" aria-hidden="true"><span>✦</span></div>
      <p className="auth-eyebrow">Build your next opportunity</p>
      <h1 id="register-title">Create your SmartHire AI account</h1>
      <p className="auth-subtitle">Start practicing smarter with AI-powered mock interviews.</p>

      {success && <p className="auth-message auth-message-success" role="status">{success}</p>}
      {error && <p className="auth-message auth-message-error" role="alert">{error}</p>}
      <form className="auth-form" onSubmit={handleRegister} noValidate>
        <div className="auth-field">
          <label htmlFor="register-name">Full name</label>
          <div className="auth-input-wrap"><span className="auth-input-icon" aria-hidden="true">♙</span><input id="register-name" type="text" autoComplete="name" maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" required /></div>
        </div>
        <div className="auth-field">
          <label htmlFor="register-email">Email address</label>
          <div className="auth-input-wrap"><span className="auth-input-icon" aria-hidden="true">@</span><input id="register-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></div>
        </div>
        <div className="auth-field">
          <label htmlFor="register-password">Password</label>
          <div className="auth-input-wrap"><span className="auth-input-icon" aria-hidden="true">⌑</span><input id="register-password" type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Create a password" required /><PasswordToggle visible={showPassword} onToggle={() => setShowPassword((visible) => !visible)} /></div>
        </div>
        <div className="auth-field">
          <label htmlFor="register-confirm-password">Confirm password</label>
          <div className="auth-input-wrap"><span className="auth-input-icon" aria-hidden="true">⌑</span><input id="register-confirm-password" type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter your password again" required /><PasswordToggle visible={showConfirmPassword} onToggle={() => setShowConfirmPassword((visible) => !visible)} /></div>
        </div>
        <div className="auth-field">
          <label htmlFor="register-role">Role</label>
          <div className="auth-select-wrap"><select id="register-role" value={role} onChange={(event) => setRole(event.target.value)}><option value="Candidate">Candidate</option><option value="Recruiter">Recruiter</option></select><span aria-hidden="true">⌄</span></div>
        </div>
        <button className="auth-submit" type="submit" disabled={loading || Boolean(success)}>{loading ? <><span className="button-spinner" aria-hidden="true" />Creating account…</> : <>Create Account <span aria-hidden="true">→</span></>}</button>
      </form>
      <div className="auth-divider"><span>Already part of SmartHire AI?</span></div>
      <p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>
    </section>
  </AuthLayout>;
}

export default Register;
