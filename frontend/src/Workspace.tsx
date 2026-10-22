"use client";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  FileText,
  Mic,
  ClipboardCheck,
  Activity,
  ShieldCheck,
  Users,
  ArrowUpRight,
  ArrowRight,
  Upload,
  Check,
  ChevronRight,
  Video,
  VideoOff,
  MicOff,
  Maximize,
  Square,
  Play,
  Download,
  Search,
  Bell,
  Briefcase,
  LogOut,
  Plus,
  Sparkles,
  Target,
  Clock,
  TrendingUp,
  X,
  BookOpen,
  CalendarDays,
  GraduationCap,
  Map,
  Settings,
  UserRound,
  UserPen,
  Trophy,
  Menu,
  Flame,
  Code2,
  Volume2,
} from "lucide-react";
import { assess, questions, interviewQuestions } from "./lib/assessment";
import { authFetch, logout } from "./lib/client-auth";
import Hub from "./Hub";
import { CatalogItem, HubAccount, hubApi } from "./lib/hub-client";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
type Row = {
  id: string;
  owner: string;
  kind: string;
  created: string;
  data: any;
};
const hubPages = [
  "Courses",
  "Career paths",
  "Events",
  "Jobs",
  "Leaderboard",
  "My profile",
  "Edit profile",
  "Settings",
  "Interview prep",
];
const nav = [
  ["Overview", LayoutDashboard],
  ["Resume studio", FileText],
  ["Mock tests", ClipboardCheck],
  ["Mock interview", Mic],
  ["Activity", Activity],
  ["Recruiter access", ShieldCheck],
] as const;
const fileUrl = (key: string) => "/api/files?key=" + encodeURIComponent(key);
export default function Workspace({
  initialRole = "Candidate",
}: {
  initialRole?: "Candidate" | "Recruiter";
}) {
  const [page, setPage] = useState(
      () => new URLSearchParams(location.search).get("view") || "Overview",
    ),
    [role] = useState(initialRole),
    [records, setRecords] = useState<Row[]>([]),
    [grants, setGrants] = useState<any[]>([]),
    [user, setUser] = useState({ name: "Your workspace", email: "" }),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [auth, setAuth] = useState(false),
    [denied, setDenied] = useState(false),
    [accountRole, setAccountRole] = useState("candidate");
  const [hubAccount, setHubAccount] = useState<HubAccount | null>(null),
    [catalog, setCatalog] = useState<CatalogItem[]>([]),
    [hubLoading, setHubLoading] = useState(true),
    [hubError, setHubError] = useState(""),
    [hubSearch, setHubSearch] = useState(""),
    [notifications, setNotifications] = useState(false),
    [mobileMenu, setMobileMenu] = useState(false);
  async function loadHub() {
    setHubLoading(true);
    try {
      const [c, a] = await Promise.all([hubApi("catalog"), hubApi("account")]);
      setCatalog(c.items);
      setHubAccount(a);
      setHubError("");
    } catch (e: any) {
      setHubError(e.message);
    } finally {
      setHubLoading(false);
    }
  }
  useEffect(() => {
    if (auth) loadHub();
  }, [auth]);
  const [text, setText] = useState(""),
    [jd, setJd] = useState("Java Spring Boot SQL Git Docker REST APIs"),
    [resume, setResume] = useState<File | null>(null),
    [email, setEmail] = useState(""),
    [selected, setSelected] = useState<Row | null>(null),
    [filter, setFilter] = useState("");
  const [test, setTest] = useState(false),
    [answers, setAnswers] = useState<number[]>([]),
    [domain, setDomain] = useState("Java backend"),
    [type, setType] = useState("Technical"),
    [level, setLevel] = useState("Intermediate");
  const [room, setRoom] = useState(false),
    [recording, setRecording] = useState(false),
    [mic, setMic] = useState(true),
    [cam, setCam] = useState(true),
    [transcript, setTranscript] = useState(""),
    [interimTranscript, setInterimTranscript] = useState(""),
    [lastTranscriptLatency, setLastTranscriptLatency] = useState<number | null>(null),
    [index, setIndex] = useState(0),
    [seconds, setSeconds] = useState(0),
    [sessionQ, setSessionQ] = useState<string[]>([]),
    [pending, setPending] = useState<Blob | null>(null),
    [preview, setPreview] = useState("");
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    recorder = useRef<MediaRecorder | null>(null),
    recognition = useRef<any>(null),
    chunks = useRef<Blob[]>([]),
    roomEl = useRef<HTMLDivElement>(null),
    transcriptRef = useRef("");
  const lastSpeechStart = useRef<number | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState("");
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const narration = useRef(false);
  const listening = useRef(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function resumeListening() {
    if (listening.current && !narration.current) {
      try { recognition.current?.start(); } catch {}
    }
  }
  function cancelQuestion(resume = true) {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    if (utterance.current) {
      utterance.current.onend = null;
      utterance.current.onerror = null;
      utterance.current = null;
      window.speechSynthesis?.cancel();
    }
    narration.current = false;
    setSpeaking(false);
    if (resume) resumeTimer.current = setTimeout(resumeListening, 350);
  }
  function speakQuestion(question: string) {
    cancelQuestion(false);
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      setVoiceMessage("Voice is unavailable in this browser. You can read the question below.");
      return;
    }
    if (!question) return;
    setVoiceMessage("");
    narration.current = true;
    setSpeaking(true);
    recognition.current?.abort();
    const u = new SpeechSynthesisUtterance(question);
    u.lang = "en-IN";
    const voices = window.speechSynthesis.getVoices();
    u.voice = voices.find(v => v.lang === "en-IN") || voices.find(v => v.lang.startsWith("en")) || null;
    u.rate = 0.95;
    utterance.current = u;
    const finish = () => {
      if (utterance.current !== u) return;
      utterance.current = null;
      narration.current = false;
      setSpeaking(false);
      resumeTimer.current = setTimeout(resumeListening, 350);
    };
    u.onend = finish;
    u.onerror = () => {
      finish();
      setVoiceMessage("Voice could not play. Select Replay question to try again.");
    };
    try { window.speechSynthesis.speak(u); }
    catch { finish(); setVoiceMessage("Voice could not play. Select Replay question to try again."); }
  }
  useEffect(() => {
    if (room && !pending) speakQuestion(sessionQ[index]);
    return () => cancelQuestion(false);
  }, [room, index, sessionQ, pending]);
  async function api(url: string, options?: RequestInit) {
    const r = await authFetch(url, options);
    const b: any = await r.json().catch(() => ({ error: "Request failed" }));
    if (!r.ok) throw Error(b.error || "Request failed");
    return b;
  }
  async function load() {
    try {
      const b = await api(
        "/api/data" + (role === "Recruiter" ? "?recruiter=1" : ""),
      );
      setRecords(b.records);
      setGrants(b.grants);
      setUser(b.user);
      setAccountRole(b.user.role);
      setAuth(true);
      setDenied(false);
    } catch (e: any) {
      setAuth(false);
      setDenied(true);
      setRecords([]);
      setMessage(e.message);
    }
  }
  useEffect(() => {
    load();
  }, [role]);
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);
  useEffect(() => {
    if (room && video.current && stream.current)
      video.current.srcObject = stream.current;
  }, [room]);
  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((t) => t.stop());
      listening.current = false;
      recognition.current?.stop();
    },
    [],
  );
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);
  async function save(kind: string, data: any) {
    await api("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        data: { ...data, candidate: user.name, email: user.email },
      }),
    });
    await load();
  }
  async function upload(file: File) {
    const form = new FormData();
    form.append("file", file);
    return api("/api/files", { method: "POST", body: form });
  }
  async function analyze() {
    if (text.trim().length < 100) {
      setMessage(
        "Paste at least 100 characters of resume text. For scanned PDFs, paste the text manually.",
      );
      return;
    }
    setBusy(true);
    try {
      const f = resume ? await upload(resume) : null;
      await save("resume", {
        name: resume?.name || "Resume analysis",
        text,
        jd,
        key: f?.key,
        assessment: assess(text, jd),
      });
      setMessage("Resume analyzed and saved.");
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function startRoom() {
    try {
      if (!auth) throw Error("Sign in before recording an interview.");
      if (!navigator.mediaDevices || !window.MediaRecorder)
        throw Error("Camera recording requires a supported browser and HTTPS.");
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setSessionQ(
        interviewQuestions(
          domain,
          type,
          level,
          latest?.data.assessment.found || [],
        ),
      );
      setTranscript("");
      setInterimTranscript("");
      setLastTranscriptLatency(null);
      setInterimTranscript("");
      setLastTranscriptLatency(null);
      setSeconds(0);
      setIndex(0);
      setPending(null);
      setRoom(true);
      setMic(true);
      setCam(true);
    } catch (e: any) {
      setMessage("Could not open interview: " + e.message);
    }
  }
  function begin() {
    listening.current = mic;
    chunks.current = [];
    const mime = ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].find(
      (m) => MediaRecorder.isTypeSupported(m),
    );
    recorder.current = new MediaRecorder(
      stream.current!,
      mime ? { mimeType: mime } : undefined,
    );
    recorder.current.ondataavailable = (e) => {
      if (e.data.size) {
        chunks.current.push(e.data);
        if (chunks.current.reduce((n, b) => n + b.size, 0) > 70 * 1024 * 1024) {
          stop();
          setMessage(
            "Recording reached the file limit. Review and submit it now.",
          );
        }
      }
    };
    recorder.current.onstop = () => {
      const b = new Blob(chunks.current, { type: recorder.current!.mimeType });
      setPending(b);
      setPreview(URL.createObjectURL(b));
    };
    recorder.current.start(1000);
    setRecording(true);
    const Speech =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (Speech) {
      const r = new Speech();
      r.continuous = true;
      r.interimResults = true;
      r.lang = "en-IN";
      r.onspeechstart = () => { lastSpeechStart.current = performance.now(); };
      r.onresult = (e: any) => {
        if (narration.current || !listening.current) return;
        let finalText = "";
        let partialText = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const phrase = e.results[i][0]?.transcript || "";
          if (e.results[i].isFinal) finalText += phrase + " ";
        }
        for (let i = 0; i < e.results.length; i++) {
          if (!e.results[i].isFinal) partialText += e.results[i][0]?.transcript || "";
        }
        if (finalText) setTranscript((t) => t + finalText);
        setInterimTranscript(partialText);
        if (lastSpeechStart.current !== null && (finalText || partialText)) {
          setLastTranscriptLatency(Math.round(performance.now() - lastSpeechStart.current));
          lastSpeechStart.current = null;
        }
      };
      r.onend = () => {
        if (listening.current && !narration.current)
          resumeTimer.current = setTimeout(resumeListening, 350);
      };
      r.onerror = (e: any) => {
        if (e.error === "aborted") return;
        listening.current = false;
        setMessage(
          "Live transcription unavailable. You can edit the transcript before submitting.",
        );
      };
      recognition.current = r;
      if (!narration.current && mic) r.start();
    } else
      setMessage(
        "Speech transcription is not supported in this browser. Enter your answers manually.",
      );
  }
  function stop() {
    listening.current = false;
    cancelQuestion(false);
    if (recorder.current?.state === "recording") recorder.current.stop();
    recognition.current?.stop();
    setInterimTranscript("");
    setRecording(false);
    stream.current?.getTracks().forEach((t) => t.stop());
  }
  async function submitInterview() {
    if (!pending) return;
    setBusy(true);
    try {
      const f = await upload(
        new File(
          [pending],
          "interview." + (pending.type.includes("mp4") ? "mp4" : "webm"),
          { type: pending.type.split(";")[0] },
        ),
      );
      const words = transcript.trim().split(/\s+/).filter(Boolean).length;
      const fillers = (
        transcript.match(/\b(um|uh|like|actually|basically)\b/gi) || []
      ).length;
      await save("interview", {
        name: type + " · " + domain,
        key: f.key,
        transcript,
        questions: sessionQ,
        duration: seconds,
        words,
        fillers,
        pace: seconds ? Math.round((words * 60) / seconds) : 0,
        feedback:
          words < 100
            ? "Expand your responses with a specific example, your contribution, and the result."
            : "Use structured answers and review technical accuracy. Confidence and eye contact were not assessed.",
      });
      setRoom(false);
      if (document.fullscreenElement) await document.exitFullscreen();
      setPage("Activity");
      setMessage("Interview recording and transcript saved in Activity.");
    } catch (e: any) {
      setMessage(e.message + " — recording retained. Retry submit.");
    } finally {
      setBusy(false);
    }
  }
  const resumes = records.filter((r) => r.kind === "resume"),
    latest = resumes[0],
    sessions = records.filter((r) => r.kind === "interview"),
    tests = records.filter((r) => r.kind === "test"),
    avg = tests.length
      ? Math.round(tests.reduce((s, r) => s + r.data.score, 0) / tests.length)
      : 0;
  const go = (p: string) => {
    setPage(p);
    setSelected(null);
    setMobileMenu(false);
    setHubSearch("");
  };
  function exportReport() {
    const b = new Blob(
      [
        JSON.stringify(
          {
            candidate: user,
            records,
            profile: hubAccount?.profile,
            preferences: hubAccount?.preferences,
            learning: hubAccount?.actions,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = "smarthire-report.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  const displayName = hubAccount?.profile.name || user.name;
  const learningPoints =
    catalog
      .filter((c) => c.kind === "course")
      .reduce(
        (n, c) =>
          n +
          (c.data.lessons || []).filter((l) =>
            hubAccount?.actions.some(
              (a) => a.kind === "lesson" && a.item === c.id + ":" + l.id,
            ),
          ).length *
            10,
        0,
      ) +
    Math.max(
      0,
      ...tests
        .filter((r) => role === "Candidate" || r.owner === hubAccount?.id)
        .map((r) => Number(r.data.score) || 0),
    );
  const completedDates = new Set(
    [
      ...records
        .filter((r) => role === "Candidate" || r.owner === hubAccount?.id)
        .map((r) => r.created),
      ...(hubAccount?.actions || []).map((a) => a.created),
    ].map((d) => new Date(d).toLocaleDateString("en-CA")),
  );
  let streak = 0;
  const streakDay = new Date();
  if (!completedDates.has(streakDay.toLocaleDateString("en-CA")))
    streakDay.setDate(streakDay.getDate() - 1);
  while (completedDates.has(streakDay.toLocaleDateString("en-CA"))) {
    streak++;
    streakDay.setDate(streakDay.getDate() - 1);
  }
  const groups =
    role === "Candidate"
      ? [
          {
            label: "WORKSPACE",
            items: [
              ["Overview", "Dashboard", LayoutDashboard],
              ["Activity", "My activity", Activity],
              ["Events", "Events", CalendarDays],
              ["Leaderboard", "Leaderboard", Trophy],
            ],
          },
          {
            label: "CATALOG",
            items: [
              ["Career paths", "Career paths", Map],
              ["Courses", "Courses", BookOpen],
              ["Mock interview", "Mock interview", Mic],
              ["Resume studio", "Resume prep", FileText],
              ["Mock tests", "Mock test", ClipboardCheck],
              ["Interview prep", "Interview prep", GraduationCap],
              ["Jobs", "Jobs", Briefcase],
            ],
          },
          {
            label: "ACCOUNT",
            items: [
              ["My profile", "My profile", UserRound],
              ["Edit profile", "Edit profile", UserPen],
              ["Settings", "Settings", Settings],
              ["Recruiter access", "Recruiter access", ShieldCheck],
            ],
          },
        ]
      : [
          {
            label: "RECRUITING",
            items: [
              ["Overview", "Dashboard", LayoutDashboard],
              ["Candidates", "Candidates", Users],
              ["Interview templates", "Interview templates", ClipboardCheck],
              ["Jobs", "Jobs", Briefcase],
              ["Events", "Events", CalendarDays],
            ],
          },
          {
            label: "ACCOUNT",
            items: [
              ["My profile", "My profile", UserRound],
              ["Edit profile", "Edit profile", UserPen],
              ["Settings", "Settings", Settings],
            ],
          },
        ];
  return (
    <div className={"app dashboard-app " + (mobileMenu ? "nav-open" : "")}>
      <header className="global-header">
        <a
          className="brand"
          href={role === "Candidate" ? "/candidate" : "/recruiter"}
        >
          <span className="brandmark">
            <Sparkles size={22} />
          </span>
          SmartHire<span className="ai">AI</span>
          <span className="brand-chevron">
            <ChevronRight size={13} />
          </span>
        </a>
        <button
          className="mobile-toggle icon-btn"
          aria-label="Toggle navigation"
          onClick={() => setMobileMenu((v) => !v)}
        >
          <Menu size={21} />
        </button>
        <div className="global-tools">
          <div className="global-search">
            <Search size={19} />
            <input
              aria-label="Search learning and opportunities"
              placeholder="Search your workspace"
              value={hubSearch}
              onChange={(e) => setHubSearch(e.target.value)}
            />
            {hubSearch && (
              <div className="search-results">
                {catalog
                  .filter((c) =>
                    [c.data.title, c.data.topic]
                      .join(" ")
                      .toLowerCase()
                      .includes(hubSearch.toLowerCase()),
                  )
                  .slice(0, 6)
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        const q = c.data.title;
                        go(
                          c.kind === "course"
                            ? "Courses"
                            : c.kind === "event"
                              ? "Events"
                              : c.kind === "job"
                                ? "Jobs"
                                : "Career paths",
                        );
                        setHubSearch(q);
                      }}
                    >
                      <span>{c.data.title}</span>
                      <small>{c.kind}</small>
                    </button>
                  ))}
                {!catalog.some((c) =>
                  c.data.title.toLowerCase().includes(hubSearch.toLowerCase()),
                ) && <p>Try a course, skill or opportunity.</p>}
                <button onClick={() => setHubSearch("")}>Clear search</button>
              </div>
            )}
          </div>
          <button
            className="header-prep"
            onClick={() =>
              go(role === "Candidate" ? "Interview prep" : "Candidates")
            }
          >
            <Sparkles size={16} />
            {role === "Candidate" ? "Interview prep" : "Talent workspace"}
          </button>
          <div
            className="header-counter"
            title="Consecutive days with saved activity"
          >
            <Flame size={17} />
            <b>{streak}</b>
            <span>day streak</span>
          </div>
          <div
            className="header-counter"
            title="Completed lessons and best mock-test score"
          >
            <Target size={17} />
            <b>{learningPoints}</b>
            <span>points</span>
          </div>
          <div className="notification-wrap">
            <button
              className="icon-btn"
              aria-label="Recent activity"
              onClick={() => setNotifications((v) => !v)}
            >
              <Bell size={21} />
              {records.length > 0 && <span className="notification-dot" />}
            </button>
            {notifications && (
              <div className="notification-menu">
                <h3>Recent activity</h3>
                {records.slice(0, 3).map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      go(role === "Candidate" ? "Activity" : "Candidates");
                      setSelected(r);
                      setNotifications(false);
                    }}
                  >
                    <b>{r.data.name || r.kind}</b>
                    <small>{new Date(r.created).toLocaleDateString()}</small>
                  </button>
                ))}
                {!records.length && (
                  <p>Your completed preparation will appear here.</p>
                )}
              </div>
            )}
          </div>
          <button
            className="avatar small profile-button"
            onClick={() => go("My profile")}
            aria-label="My profile"
          >
            {displayName.slice(0, 1).toUpperCase()}
          </button>
        </div>
      </header>
      <aside className="workspace-sidebar">
        <div className="portal-badge">
          <ShieldCheck size={14} />
          {role} portal
        </div>
        {accountRole === "admin" && (
          <a className="admin-link" href="/admin">
            Manage recruiter accounts <ArrowUpRight size={14} />
          </a>
        )}
        <nav>
          {groups.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="workspace-label">{group.label}</div>
              {group.items.map(([destination, label, Icon]: any) => (
                <button
                  key={destination}
                  className={page === destination ? "chosen" : ""}
                  aria-current={page === destination ? "page" : undefined}
                  onClick={() => go(destination)}
                >
                  <Icon size={18} />
                  {label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-user">
          <span className="avatar">
            {displayName.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <b>{displayName}</b>
            <small>{role} workspace</small>
          </div>
          <button onClick={logout} aria-label="Sign out">
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <section className="main">
        <main>
          {message && (
            <div className="notice" role="status">
              {message}
              {!auth && <a href="/login">Sign in</a>}
              <button aria-label="Dismiss" onClick={() => setMessage("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {denied ? (
            <div className="panel permissions">
              <ShieldCheck size={36} />
              <h2>
                {role === "Recruiter"
                  ? "Recruiter access required"
                  : "Sign in to your candidate workspace"}
              </h2>
              <p>
                {role === "Recruiter"
                  ? "Ask your administrator to authorize your exact sign-in email. Candidate data also requires an explicit candidate grant."
                  : "Your resumes, tests and recordings belong to your account."}
              </p>
              <a className="primary" href="/login">
                Go to login
              </a>
              <a className="secondary" href="/candidate">
                Candidate portal
              </a>
            </div>
          ) : (
            <>
              {!(page === "Overview" && role === "Candidate") && (
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">
                      {role === "Candidate"
                        ? "BUILD YOUR NEXT CHAPTER"
                        : "MAKE INFORMED CONNECTIONS"}
                    </div>
                    <h1>
                      {page === "Overview"
                        ? role === "Candidate"
                          ? "Your career, moving forward."
                          : "Discover potential. Build your team."
                        : page}
                    </h1>
                    <p>
                      {role === "Candidate"
                        ? "Prepare with purpose. See your progress. Show your potential."
                        : "Review only the candidates who have granted you access."}
                    </p>
                  </div>
                  <button className="secondary" onClick={exportReport}>
                    <Download size={16} /> Export report
                  </button>
                </div>
              )}
              {(hubPages.includes(page) ||
                (page === "Overview" && role === "Candidate")) && (
                <Hub
                  page={page}
                  go={go}
                  catalog={catalog}
                  account={hubAccount}
                  reload={loadHub}
                  role={accountRole}
                  email={user.email}
                  records={records}
                  search={hubSearch}
                  loading={hubLoading}
                  error={hubError}
                />
              )}
              {page === "Resume studio" && (
                <>
                  <div className="studio-banner">
                    <span className="pill">
                      RESUME STUDIO <Sparkles size={14} />
                    </span>
                    <h2>Build a resume that opens doors.</h2>
                    <p>
                      Match your experience to the job. Understand your
                      strengths and discover what’s missing.
                    </p>
                  </div>
                  <div className="studio-grid">
                    <div className="panel">
                      <h3>Your resume</h3>
                      <label className="upload">
                        <Upload size={27} />
                        <b>{resume ? resume.name : "Upload your resume"}</b>
                        <span>PDF or TXT · up to 80 MB</span>
                        <input
                          type="file"
                          accept=".pdf,.txt"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              if (f.size > 80 * 1024 * 1024) {
                                setMessage(
                                  "Resume must be smaller than 80 MB.",
                                );
                                return;
                              }
                              setResume(f);
                              setBusy(true);
                              try {
                                if (f.type === "text/plain") {
                                  setText(await f.text());
                                } else {
                                  const pdfjs = await import("pdfjs-dist");
                                  pdfjs.GlobalWorkerOptions.workerSrc =
                                    pdfWorkerUrl;
                                  const task = pdfjs.getDocument({
                                    data: new Uint8Array(await f.arrayBuffer()),
                                  });
                                  const doc = await task.promise;
                                  let extracted = "";
                                  for (let p = 1; p <= doc.numPages; p++) {
                                    const page = await doc.getPage(p);
                                    const content = await page.getTextContent();
                                    extracted +=
                                      content.items
                                        .map((item: any) => item.str || "")
                                        .join(" ") + "\n";
                                  }
                                  await task.destroy();
                                  setText(extracted);
                                  setMessage(
                                    extracted.trim().length < 100
                                      ? "This PDF may be scanned. Paste the resume text for analysis."
                                      : "PDF text extracted. Add the job description and analyze.",
                                  );
                                }
                              } catch (e: any) {
                                setMessage(
                                  "Could not extract PDF text. Paste the resume text manually: " +
                                    e.message,
                                );
                              } finally {
                                setBusy(false);
                              }
                            }
                          }}
                        />
                      </label>
                      <label>
                        Resume text
                        <textarea
                          placeholder="PDF text appears here after upload. You can edit it before analysis."
                          value={text}
                          onChange={(e) => setText(e.target.value)}
                        />
                      </label>
                      <label>
                        Target job description
                        <textarea
                          value={jd}
                          onChange={(e) => setJd(e.target.value)}
                        />
                      </label>
                      <button
                        className="primary wide"
                        disabled={busy}
                        onClick={analyze}
                      >
                        <Sparkles size={16} />
                        {busy ? "Analyzing…" : "Analyze & save resume"}
                      </button>
                      <p className="fine">
                        Rule-based estimate: keyword match 50%, section coverage
                        25%, quantified impact 25%. This is not an employer’s
                        ATS score.
                      </p>
                      <h4>Saved resumes</h4>
                      {resumes.map((r) => (
                        <button
                          key={r.id}
                          className="saved-resume"
                          onClick={() => setSelected(r)}
                        >
                          <FileText size={15} />
                          {r.data.name}
                          <span>{r.data.assessment.score}</span>
                        </button>
                      ))}
                    </div>
                    <div>
                      {(selected?.kind === "resume" ? selected : latest) ? (
                        <ResumeResult
                          row={
                            (selected?.kind === "resume" ? selected : latest)!
                          }
                        />
                      ) : (
                        <div className="panel blank-analysis">
                          <span className="large-icon">
                            <FileText size={40} />
                          </span>
                          <h2>Give your experience a closer look.</h2>
                          <p>
                            Upload your resume, add its text and a job
                            description to see your score, skills and
                            improvement suggestions.
                          </p>
                          <div className="preview-metrics">
                            <span>Keyword match</span>
                            <span>Resume structure</span>
                            <span>Content & impact</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
              {page === "Mock tests" && (
                <div className="panel test-panel">
                  {!test ? (
                    <>
                      <span className="large-icon">
                        <ClipboardCheck size={35} />
                      </span>
                      <h2>A quick check of your fundamentals.</h2>
                      <p>
                        5 questions · Java, REST APIs, SQL and problem solving
                      </p>
                      <div className="test-info">
                        <span>
                          <Clock size={17} /> Self-paced
                        </span>
                        <span>
                          <Target size={17} /> Immediate results
                        </span>
                      </div>
                      <button
                        className="primary"
                        onClick={() => {
                          setAnswers([]);
                          setTest(true);
                        }}
                      >
                        Start technical assessment <ArrowRight size={16} />
                      </button>
                      {tests.map((r) => (
                        <div key={r.id} className="activity-row">
                          <b>{r.data.name}</b>
                          <span className="badge">{r.data.score}%</span>
                          <small>
                            {new Date(r.created).toLocaleDateString()}
                          </small>
                        </div>
                      ))}
                    </>
                  ) : (
                    <>
                      <h2>Technical fundamentals</h2>
                      <p>
                        {answers.filter((a) => a !== undefined).length} of{" "}
                        {questions.length} answered
                      </p>
                      {questions.map((q, i) => (
                        <div className="question" key={q.q}>
                          <b>
                            {i + 1}. {q.q}
                          </b>
                          <div className="options">
                            {q.options.map((o, j) => (
                              <button
                                key={o}
                                className={answers[i] === j ? "picked" : ""}
                                onClick={() =>
                                  setAnswers((a) => {
                                    const n = [...a];
                                    n[i] = j;
                                    return n;
                                  })
                                }
                              >
                                <span>{String.fromCharCode(65 + j)}</span>
                                {o}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                      <button
                        className="primary"
                        disabled={
                          busy ||
                          answers.filter((a) => a !== undefined).length !==
                            questions.length
                        }
                        onClick={async () => {
                          setBusy(true);
                          try {
                            const score =
                              answers.reduce(
                                (s, a, i) =>
                                  s + (a === questions[i].answer ? 1 : 0),
                                0,
                              ) * 20;
                            await save("test", {
                              name: "Technical fundamentals",
                              score,
                              answers,
                              review: questions.map((q, i) => ({
                                question: q.q,
                                correct: answers[i] === q.answer,
                                answer: q.options[q.answer],
                                explanation: q.explain,
                              })),
                            });
                            setTest(false);
                            setMessage(
                              "Assessment saved. Score: " +
                                score +
                                "%. Review your answers in Activity.",
                            );
                          } catch (e: any) {
                            setMessage(e.message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Submit assessment
                      </button>
                    </>
                  )}
                </div>
              )}
              {page === "Mock interview" && (
                <div className="interview-setup">
                  <div className="panel">
                    <span className="pill">
                      <Mic size={14} /> INTERVIEW PRACTICE
                    </span>
                    <h2>
                      Your space to practice,
                      <br />
                      learn and grow.
                    </h2>
                    <p>
                      Choose your focus. Record your responses. Reflect on your
                      progress.
                    </p>
                    <div className="setup-selects">
                      <label>
                        Interview type
                        <select
                          value={type}
                          onChange={(e) => setType(e.target.value)}
                        >
                          {["Technical", "HR", "Behavioral"].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Domain
                        <select
                          value={domain}
                          onChange={(e) => setDomain(e.target.value)}
                        >
                          {[
                            "Java backend",
                            "Frontend development",
                            "Python development",
                            "Test automation",
                            "Data science",
                          ].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Difficulty
                        <select
                          value={level}
                          onChange={(e) => setLevel(e.target.value)}
                        >
                          {["Beginner", "Intermediate", "Advanced"].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <button className="primary" onClick={startRoom}>
                      <Video size={18} /> Enter interview room{" "}
                      <ArrowRight size={17} />
                    </button>
                    <p className="fine">
                      Camera and microphone permission required. Recordings
                      start only when you press Record. Browser speech
                      recognition may send audio to its speech service.
                    </p>
                  </div>
                  <div className="setup-preview">
                    <div className="camera-placeholder">
                      <Video size={45} />
                      <span>
                        A little practice.
                        <br />A lot more confidence.
                      </span>
                    </div>
                    <div className="setup-check">
                      <Check size={17} /> 5 role-based practice questions
                    </div>
                    <div className="setup-check">
                      <Check size={17} /> Camera & microphone controls
                    </div>
                    <div className="setup-check">
                      <Check size={17} /> Saved recording and editable
                      transcript
                    </div>
                    <p className="fine">
                      Questions use resume skills and curated templates. AI
                      evaluation, eye tracking and speaker identity detection
                      are not enabled.
                    </p>
                  </div>
                </div>
              )}
              {page === "Recruiter access" && (
                <div className="panel permissions">
                  <span className="large-icon">
                    <ShieldCheck size={33} />
                  </span>
                  <h2>Choose who can see your progress.</h2>
                  <p>
                    Grant access to a recruiter’s exact sign-in email. They can
                    view all your saved resumes, tests, interview transcripts
                    and recordings. Revoke future access at any time.
                  </p>
                  <label>
                    Recruiter email
                    <div className="input-action">
                      <input
                        type="email"
                        placeholder="recruiter@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await api("/api/data", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ kind: "grant", email }),
                            });
                            setEmail("");
                            await load();
                            setMessage("Access granted.");
                          } catch (e: any) {
                            setMessage(e.message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <Plus size={16} /> Grant access
                      </button>
                    </div>
                  </label>
                  <div className="fine">
                    Only administrator-authorized recruiter emails can receive a
                    grant. No email notification is sent.
                  </div>
                  {grants.map((g) => (
                    <div className="activity-row" key={g.id}>
                      <span className="avatar">
                        <Users size={18} />
                      </span>
                      <div>
                        <b>{g.email}</b>
                        <small>
                          Granted {new Date(g.created).toLocaleDateString()}
                        </small>
                      </div>
                      <button
                        className="danger-text"
                        onClick={async () => {
                          try {
                            await api("/api/data?id=" + g.id, {
                              method: "DELETE",
                            });
                            await load();
                          } catch (e: any) {
                            setMessage(e.message);
                          }
                        }}
                      >
                        Revoke access
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {page === "Activity" &&
                role === "Candidate" &&
                hubAccount &&
                hubAccount.actions.length > 0 && (
                  <div className="panel hub-activity">
                    <div className="section-head">
                      <h3>Learning and opportunities</h3>
                      <span className="badge">
                        {hubAccount.actions.length} saved actions
                      </span>
                    </div>
                    {hubAccount.actions.map((a) => (
                      <button
                        className="activity-row"
                        key={a.id}
                        onClick={() =>
                          go(
                            a.kind === "job"
                              ? "Jobs"
                              : a.kind === "event"
                                ? "Events"
                                : a.kind === "path"
                                  ? "Career paths"
                                  : "Courses",
                          )
                        }
                      >
                        <span className="tiny-icon">
                          {a.kind === "event" ? (
                            <CalendarDays size={18} />
                          ) : a.kind === "job" ? (
                            <Briefcase size={18} />
                          ) : (
                            <BookOpen size={18} />
                          )}
                        </span>
                        <div>
                          <b>{a.data.name}</b>
                          <small>
                            {a.kind === "lesson"
                              ? "Lesson completed"
                              : a.kind === "enroll"
                                ? "Course enrolled"
                                : a.kind === "event"
                                  ? "Event interest registered"
                                  : a.kind === "job"
                                    ? "Job saved"
                                    : "Career path followed"}
                          </small>
                        </div>
                        <small>
                          {new Date(a.created).toLocaleDateString()}
                        </small>
                        <ArrowRight size={16} />
                      </button>
                    ))}
                  </div>
                )}
              {(page === "Activity" ||
                page === "Candidates" ||
                (page === "Overview" && role === "Recruiter")) && (
                <>
                  <div className="stats">
                    <div className="stat">
                      <div className="stat-label">
                        {role === "Recruiter"
                          ? "Shared candidates"
                          : "Saved activities"}
                        <Users size={18} />
                      </div>
                      <strong>
                        {role === "Recruiter"
                          ? new Set(records.map((r) => r.owner)).size
                          : records.length}
                      </strong>
                      <p>
                        {role === "Recruiter"
                          ? "Explicitly shared with your account"
                          : "Your preparation history"}
                      </p>
                    </div>
                    <div className="stat">
                      <div className="stat-label">
                        Resumes
                        <FileText size={18} />
                      </div>
                      <strong>{resumes.length}</strong>
                      <p>Resume reports and skill profiles</p>
                    </div>
                    <div className="stat">
                      <div className="stat-label">
                        Interviews
                        <Video size={18} />
                      </div>
                      <strong>{sessions.length}</strong>
                      <p>Recordings and transcripts</p>
                    </div>
                  </div>
                  <div className="panel">
                    <div className="section-head">
                      <h3>
                        {role === "Recruiter"
                          ? "Candidate activity & comparison"
                          : "Your activity"}
                      </h3>
                      <div className="search">
                        <Search size={16} />
                        <input
                          placeholder="Search name or activity"
                          value={filter}
                          onChange={(e) => setFilter(e.target.value)}
                        />
                      </div>
                    </div>
                    {!records.length && (
                      <div className="empty-small">
                        <Users size={32} />
                        <h3>
                          {role === "Recruiter"
                            ? "No shared candidates yet"
                            : "No activity yet"}
                        </h3>
                        <p>
                          {role === "Recruiter"
                            ? "Ask candidates to grant access to " + user.email
                            : "Your completed preparation appears here."}
                        </p>
                      </div>
                    )}
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>
                              {role === "Recruiter" ? "Candidate" : "Activity"}
                            </th>
                            <th>Type</th>
                            <th>Date</th>
                            <th>Score</th>
                            <th>Report</th>
                          </tr>
                        </thead>
                        <tbody>
                          {records
                            .filter((r) =>
                              JSON.stringify([r.data.name, r.data.candidate])
                                .toLowerCase()
                                .includes(filter.toLowerCase()),
                            )
                            .map((r) => (
                              <tr key={r.id}>
                                <td>
                                  <b>
                                    {role === "Recruiter"
                                      ? r.data.candidate
                                      : r.data.name}
                                  </b>
                                  {role === "Recruiter" && (
                                    <small>{r.data.email}</small>
                                  )}
                                </td>
                                <td>
                                  <span className="type-badge">{r.kind}</span>
                                </td>
                                <td>
                                  {new Date(r.created).toLocaleDateString()}
                                </td>
                                <td>
                                  {r.data.assessment?.score ??
                                    r.data.score ??
                                    "Not assessed"}
                                </td>
                                <td>
                                  <button
                                    className="text-btn"
                                    onClick={() => setSelected(r)}
                                  >
                                    View <ArrowUpRight size={15} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {selected && (
                    <div className="panel detail">
                      <div className="section-head">
                        <h3>{selected.data.name}</h3>
                        <button
                          className="icon-btn"
                          onClick={() => setSelected(null)}
                          aria-label="Close report"
                        >
                          <X size={18} />
                        </button>
                      </div>
                      {selected.kind === "resume" ? (
                        <ResumeResult row={selected} />
                      ) : selected.kind === "interview" ? (
                        <>
                          <PrivateVideo fileKey={selected.data.key} />
                          <div className="stats">
                            <div>
                              <b>{selected.data.duration}s</b>
                              <p>Duration</p>
                            </div>
                            <div>
                              <b>{selected.data.pace} words/min</b>
                              <p>Estimated pace</p>
                            </div>
                            <div>
                              <b>{selected.data.fillers}</b>
                              <p>Filler words</p>
                            </div>
                          </div>
                          <h4>Candidate transcript</h4>
                          <p className="transcript-read">
                            {selected.data.transcript ||
                              "No transcript captured."}
                          </p>
                          <h4>Practice feedback</h4>
                          <p>{selected.data.feedback}</p>
                          <PrivateDownload
                            fileKey={selected.data.key}
                            label="Download recording"
                          />
                        </>
                      ) : selected.kind === "test" ? (
                        <>
                          {selected.data.review.map((q: any, i: number) => (
                            <div className="question" key={i}>
                              <b>
                                {q.correct ? "✓" : "✕"} {q.question}
                              </b>
                              <p>
                                {q.answer} — {q.explanation}
                              </p>
                            </div>
                          ))}
                        </>
                      ) : (
                        <p>{selected.data.questions}</p>
                      )}
                    </div>
                  )}
                </>
              )}
              {page === "Interview templates" && (
                <div className="panel">
                  <h2>Create your interview guide</h2>
                  <p>Save a question template for future candidate sessions.</p>
                  <label>
                    Template title
                    <input
                      id="template-title"
                      placeholder="Java backend interview"
                    />
                  </label>
                  <label>
                    Questions
                    <textarea
                      id="template-questions"
                      placeholder="One question per line"
                    />
                  </label>
                  <button
                    className="primary"
                    onClick={async () => {
                      const name = (
                        document.getElementById(
                          "template-title",
                        ) as HTMLInputElement
                      ).value;
                      const q = (
                        document.getElementById(
                          "template-questions",
                        ) as HTMLTextAreaElement
                      ).value;
                      if (!name || !q) {
                        setMessage("Enter a title and questions.");
                        return;
                      }
                      try {
                        await save("template", { name, questions: q });
                        setMessage("Template saved.");
                      } catch (e: any) {
                        setMessage(e.message);
                      }
                    }}
                  >
                    Save template
                  </button>
                  <p className="fine">Templates are private to your account.</p>
                </div>
              )}
            </>
          )}
          <footer>
            <span>SmartHire AI</span> A little more prepared. A little closer to
            your next opportunity.<span>Made for your growth ↗</span>
          </footer>
        </main>
      </section>
      {room && (
        <div className="room" ref={roomEl}>
          <div className="room-header">
            <b>
              <Sparkles size={20} /> SmartHire Interview Room
            </b>
            <span className="record-status">
              {recording ? "● Recording" : "Ready"} · {Math.floor(seconds / 60)}
              :{String(seconds % 60).padStart(2, "0")}
            </span>
            <button
              className="secondary"
              onClick={() =>
                roomEl.current
                  ?.requestFullscreen()
                  .catch(() => setMessage("Fullscreen unavailable."))
              }
            >
              <Maximize size={16} /> Full screen
            </button>
            <button
              className="icon-btn"
              aria-label="Close room"
              onClick={() => {
                stop();
                setRoom(false);
              }}
            >
              <X />
            </button>
          </div>
          {message && (
            <div className="notice">
              {message}
              <button onClick={() => setMessage("")}>Dismiss</button>
            </div>
          )}
          <div className="room-body">
            <div>
              <div className="video-stage">
                <video ref={video} autoPlay muted playsInline />
                <span className="video-label">
                  You · {cam ? "Camera on" : "Camera off"}
                </span>
              </div>
              <div className="media-controls">
                <button
                  onClick={() => {
                    stream.current
                      ?.getAudioTracks()
                      .forEach((t) => (t.enabled = !mic));
                    listening.current = !mic && recording;
                    if (mic) recognition.current?.stop();
                    else if (recording && !narration.current) {
                      try {
                        recognition.current?.start();
                      } catch {}
                    }
                    setMic(!mic);
                  }}
                >
                  {mic ? <Mic /> : <MicOff />}
                </button>
                <button
                  onClick={() => {
                    stream.current
                      ?.getVideoTracks()
                      .forEach((t) => (t.enabled = !cam));
                    setCam(!cam);
                  }}
                >
                  {cam ? <Video /> : <VideoOff />}
                </button>
                {!recording && !pending && (
                  <button className="primary" onClick={begin}>
                    <Play size={18} /> Record answers
                  </button>
                )}
                {recording && (
                  <button className="stop" onClick={stop}>
                    <Square size={17} /> Finish recording
                  </button>
                )}
                {pending && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={submitInterview}
                  >
                    {busy ? "Saving…" : "Submit & save interview"}
                  </button>
                )}
              </div>
              {pending && (
                <video className="review-video" controls src={preview} />
              )}
            </div>
            <div className="room-question">
              <div className="eyebrow">
                {type.toUpperCase()} · {level.toUpperCase()}
              </div>
              <span className="pill">
                Question {index + 1} of {sessionQ.length}
              </span>
              <h2>{sessionQ[index]}</h2>
              <div className="media-controls">
                <button className="secondary" disabled={!!pending}
                  onClick={() => speakQuestion(sessionQ[index])}>
                  <Volume2 size={17} /> Replay question
                </button>
                <button className="secondary" disabled={!speaking}
                  onClick={() => cancelQuestion()}>
                  <Square size={17} /> Stop voice
                </button>
              </div>
              <p className="fine" role="status" aria-live="polite">
                {voiceMessage || (speaking ? "Interviewer speaking… Answer after the voice finishes." : "Questions are read aloud automatically. Use Replay question if needed.")}
              </p>
              <p>Take a moment. Structure your answer. Use a real example.</p>
              <button
                className="secondary"
                disabled={!!pending || index === sessionQ.length - 1}
                onClick={() => {
                  setTranscript(
                    (t) => t + "\n\n[Question " + (index + 2) + "]\n",
                  );
                  setIndex((i) => i + 1);
                }}
              >
                Next question <ArrowRight size={16} />
              </button>
              <h4>
                <Mic size={15} /> Candidate transcript
              </h4>
              {interimTranscript && <p className="live-interim" aria-live="polite"><strong>Hearing now:</strong> {interimTranscript}</p>}
              <p className="fine" aria-live="polite">{lastTranscriptLatency === null ? "Waiting for speech…" : `Last speech-to-first-transcript event: ${lastTranscriptLatency} ms (browser estimate, not network STT latency)`}</p>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Your speech appears here where supported. You can correct or type your answer."
              />
              <p className="fine">
                Live transcription pauses while the interviewer speaks. Use headphones to reduce microphone echo. Speaker
                verification and confidence analysis are not enabled. Save
                limit: 80 MB.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function ResumeResult({ row }: { row: Row }) {
  const a = row.data.assessment;
  return (
    <>
      <div className="panel score-panel">
        <div className="section-head">
          <h3>Overall resume readiness</h3>
          <span className="badge">
            {a.score >= 75 ? "Strong foundation" : "Room to grow"}
          </span>
        </div>
        <div className="score-layout">
          <div
            className="score-ring"
            style={{
              background: `conic-gradient(#13b98b ${a.score * 3.6}deg,#edf2f5 0)`,
            }}
          >
            <div>
              <b>{a.score}</b>
              <small>out of 100</small>
            </div>
          </div>
          <div className="score-bars">
            {[
              ["Keyword match", a.keyword, "purple"],
              ["Content & impact", a.impact, "green"],
              ["Section coverage", a.structure, "blue"],
            ].map(([title, n, c]: any) => (
              <div key={title}>
                <div>
                  <span>{title}</span>
                  <b>{n}/100</b>
                </div>
                <div className="bar">
                  <i className={c} style={{ width: n + "%" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <hr />
        <h4>Resume summary</h4>
        <p>
          {row.data.text.slice(0, 400)}
          {row.data.text.length > 400 ? "…" : ""}
        </p>
        {row.data.key && (
          <PrivateDownload
            fileKey={row.data.key}
            label="Download uploaded resume"
          />
        )}
      </div>
      <div className="result-grid">
        <div className="panel">
          <h3>
            <span className="dot red" /> Missing keywords
          </h3>
          <div className="tags">
            {a.missing.length ? (
              a.missing.map((s: string) => (
                <span className="missing" key={s}>
                  {s}
                </span>
              ))
            ) : (
              <p>All target skills detected.</p>
            )}
          </div>
          <p className="fine">
            Add a keyword only if it reflects your experience.
          </p>
        </div>
        <div className="panel">
          <h3>
            <span className="dot green" /> Detected skills
          </h3>
          <div className="tags">
            {a.found.map((s: string) => (
              <span key={s}>{s}</span>
            ))}
          </div>
        </div>
        <div className="panel">
          <h3>Areas for improvement</h3>
          <ul>
            {a.structure < 100 && (
              <li>
                Add clear Education, Experience, Skills and Projects headings.
              </li>
            )}
            {a.impact < 75 && (
              <li>
                Describe your contribution with measurable, verified outcomes.
              </li>
            )}
            <li>Connect project experience to the target role.</li>
            <li>Use a simple text-based layout with clear headings.</li>
          </ul>
        </div>
        <div className="panel">
          <h3>Interview preparation topics</h3>
          <ul>
            {a.found.slice(0, 4).map((s: string) => (
              <li key={s}>
                {s}: fundamentals, project decisions and practical examples
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

function PrivateVideo({ fileKey }: { fileKey: string }) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let blobUrl = "",
      live = true;
    authFetch(fileUrl(fileKey))
      .then(async (r) => {
        if (!r.ok) throw Error("Recording access denied or unavailable");
        blobUrl = URL.createObjectURL(await r.blob());
        if (live) setUrl(blobUrl);
        else URL.revokeObjectURL(blobUrl);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [fileKey]);
  return error ? (
    <p>{error}</p>
  ) : url ? (
    <video controls src={url} className="playback" />
  ) : (
    <p>Loading private recording…</p>
  );
}
function PrivateDownload({
  fileKey,
  label,
}: {
  fileKey: string;
  label: string;
}) {
  const [error, setError] = useState("");
  return (
    <>
      <button
        className="secondary"
        onClick={async () => {
          try {
            const r = await authFetch(fileUrl(fileKey));
            if (!r.ok) throw Error("File access denied or unavailable");
            const b = await r.blob(),
              url = URL.createObjectURL(b),
              a = document.createElement("a");
            a.href = url;
            a.download =
              "smarthire-file." +
              (b.type.includes("pdf")
                ? "pdf"
                : b.type.includes("text")
                  ? "txt"
                  : b.type.includes("mp4")
                    ? "mp4"
                    : "webm");
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch (e: any) {
            setError(e.message);
          }
        }}
      >
        {label}
        <Download size={15} />
      </button>
      {error && <p>{error}</p>}
    </>
  );
}
