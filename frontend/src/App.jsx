import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import ResumeUpload from "./pages/ResumeUpload.jsx";
import InterviewGenerate from "./pages/InterviewGenerate.jsx";
import InterviewRoom from "./pages/InterviewRoom.jsx";
import InterviewDetail from "./pages/InterviewDetail.jsx";
import RecruiterCandidates from "./pages/RecruiterCandidates.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";

function PrivateRoute({ children }) {
  const token = localStorage.getItem("access_token");
  return token ? children : <Navigate to="/login" />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/resumes" element={<PrivateRoute><ResumeUpload /></PrivateRoute>} />
        <Route path="/interviews/generate" element={<PrivateRoute><InterviewGenerate /></PrivateRoute>} />
        <Route path="/interviews/:id/room" element={<PrivateRoute><InterviewRoom /></PrivateRoute>} />
        <Route path="/interviews/:id" element={<PrivateRoute><InterviewDetail /></PrivateRoute>} />
        <Route path="/recruiter/candidates" element={<PrivateRoute><RecruiterCandidates /></PrivateRoute>} />
        <Route path="/admin-dashboard" element={<PrivateRoute><AdminDashboard /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  );
}
