import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { describeError } from "../api/errors";

export default function Signup() {
  const [form, setForm] = useState({ username: "", email: "", password: "", role: "candidate" });
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await api.post("/auth/register/", form);
      navigate("/login");
    } catch (err) {
      setError(describeError(err, "Could not create account."));
    }
  };

  return (
    <div className="auth-box">
      <h2>Create your account</h2>
      {error && <p className="error-text">{error}</p>}
      <form onSubmit={handleSubmit}>
        <label>Username</label>
        <input name="username" onChange={handleChange} />
        <label>Email</label>
        <input name="email" onChange={handleChange} />
        <label>Password (8+ characters, not too common)</label>
        <input name="password" type="password" onChange={handleChange} />
        <label>I am a</label>
        <select name="role" onChange={handleChange} value={form.role}>
          <option value="candidate">Candidate</option>
          <option value="recruiter">Recruiter</option>
        </select>
        <p className="muted" style={{ marginTop: -4 }}>
          Admin accounts can't be created here for security. An existing admin creates them.
        </p>
        <button type="submit" style={{ width: "100%" }}>Sign Up</button>
      </form>
      <p className="auth-switch">Already have an account? <Link to="/login">Log in</Link></p>
    </div>
  );
}
