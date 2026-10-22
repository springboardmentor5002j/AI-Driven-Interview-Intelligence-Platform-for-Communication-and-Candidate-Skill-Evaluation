import { BrowserRouter, Link, Navigate, NavLink, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import MyInterviews from "./pages/MyInterviews";
import InterviewResult from "./pages/InterviewResult";
import Interview from "./pages/Interview";
import GenerateInterview from "./pages/GenerateInterview";
import ResumeManagement from "./pages/ResumeManagement";

function ProtectedLayout() {
  const navigate = useNavigate();
  if (!localStorage.getItem("token")) return <Navigate to="/login" replace />;
  const logout = () => { localStorage.removeItem("token"); navigate("/login"); };
  return <>
    <header className="app-nav">
      <div className="nav-inner">
        <Link className="brand" to="/resumes"><span className="brand-mark" aria-hidden="true">S</span><span>SmartHire AI</span></Link>
        <nav className="nav-links" aria-label="Main navigation">
          <NavLink className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} to="/resumes">Resumes</NavLink>
          <NavLink className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} to="/generate-interview">Generate</NavLink>
          <NavLink className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} to="/my-interviews">My Interviews</NavLink>
          <button className="nav-logout" onClick={logout}>Log out</button>
        </nav>
      </div>
    </header>
    <Outlet />
  </>;
}

function App() {
  return <BrowserRouter><Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="/" element={<Navigate to={localStorage.getItem("token") ? "/resumes" : "/login"} replace />} />
    <Route element={<ProtectedLayout />}>
      <Route path="/resumes" element={<ResumeManagement />} />
      <Route path="/generate-interview" element={<GenerateInterview />} />
      <Route path="/my-interviews" element={<MyInterviews />} />
      <Route path="/interview/:interviewId" element={<Interview />} />
      <Route path="/interview-result/:interviewId" element={<InterviewResult />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></BrowserRouter>;
}

export default App;
