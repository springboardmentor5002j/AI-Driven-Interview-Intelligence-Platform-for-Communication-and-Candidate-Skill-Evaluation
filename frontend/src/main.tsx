import { createRoot } from "react-dom/client";
import Workspace from "./Workspace";
import Login from "./pages/Login";
import Admin from "./pages/Admin";
import "./styles.css";
import "./dashboard.css";
const path = location.pathname;
const screen =
  path === "/admin" ? (
    <Admin />
  ) : path === "/candidate" ? (
    <Workspace initialRole="Candidate" />
  ) : path === "/recruiter" ? (
    <Workspace initialRole="Recruiter" />
  ) : (
    <Login />
  );
createRoot(document.getElementById("root")!).render(screen);
