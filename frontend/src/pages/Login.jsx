import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { describeError } from "../api/errors";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const googleButtonRef = useRef(null);
  const navigate = useNavigate();
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

  useEffect(() => {
    if (!googleClientId || !googleButtonRef.current) return undefined;
    let cancelled = false;
    const render = () => {
      if (cancelled || !window.google?.accounts?.id || !googleButtonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response) => {
          setError("");
          try {
            const result = await api.post("/auth/google/", { credential: response.credential });
            localStorage.setItem("access_token", result.data.access);
            localStorage.setItem("refresh_token", result.data.refresh);
            navigate("/dashboard");
          } catch (err) {
            setError(describeError(err, "Google sign-in failed."));
          }
        },
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline", size: "large", shape: "rectangular", text: "continue_with", width: 320,
      });
    };
    if (window.google?.accounts?.id) render();
    else {
      let script = document.querySelector('script[data-smarthire-google="true"]');
      if (!script) {
        script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.dataset.smarthireGoogle = "true";
        document.head.appendChild(script);
      }
      script.addEventListener("load", render);
    }
    return () => { cancelled = true; };
  }, [googleClientId, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const { data } = await api.post("/auth/login/", { username, password });
      localStorage.setItem("access_token", data.access);
      localStorage.setItem("refresh_token", data.refresh);
      navigate("/dashboard");
    } catch (err) {
      setError(describeError(err, "Could not log in."));
    }
  };

  return (
    <div className="auth-box">
      <h2>Log in to SmartHire AI</h2>
      {error && <p className="error-text">{error}</p>}
      <form onSubmit={handleSubmit}>
        <label>Username</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} />
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit" style={{ width: "100%" }}>Log In</button>
      </form>
      {googleClientId && <>
        <div className="muted" style={{ textAlign: "center", margin: "1rem 0" }}>or</div>
        <div ref={googleButtonRef} style={{ display: "flex", justifyContent: "center" }} />
      </>}
      <p className="auth-switch">No account? <Link to="/signup">Sign up</Link></p>
    </div>
  );
}
