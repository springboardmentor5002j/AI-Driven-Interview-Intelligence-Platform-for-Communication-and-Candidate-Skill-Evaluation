import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Code2,
  ExternalLink,
  Flame,
  GraduationCap,
  MapPin,
  Plus,
  Search,
  Settings,
  Target,
  Trash2,
  Trophy,
  Users,
  X,
} from "lucide-react";
import {
  CatalogItem,
  HubAccount,
  Preferences,
  Profile,
  hubApi,
} from "./lib/hub-client";

type Props = {
  page: string;
  go: (page: string) => void;
  catalog: CatalogItem[];
  account: HubAccount | null;
  reload: () => Promise<void>;
  role: string;
  email: string;
  records: any[];
  search: string;
  loading: boolean;
  error: string;
};
const isLink = (url?: string) => {
  try {
    return !!url && new URL(url).protocol === "https:";
  } catch {
    return false;
  }
};
export default function Hub({
  page,
  go,
  catalog,
  account,
  reload,
  role,
  email,
  records,
  search,
  loading,
  error,
}: Props) {
  const [query, setQuery] = useState(""),
    [topic, setTopic] = useState("All"),
    [opened, setOpened] = useState<string | null>(null),
    [lessonIndex, setLessonIndex] = useState(0),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [showListing, setShowListing] = useState(false),
    [board, setBoard] = useState<any[]>([]),
    [boardLoading, setBoardLoading] = useState(false);
  const [skillText, setSkillText] = useState(""),
    [profile, setProfile] = useState<Profile>({ name: "" }),
    [preferences, setPreferences] = useState<Preferences>({});
  const courses = catalog.filter((x) => x.kind === "course"),
    paths = catalog.filter((x) => x.kind === "path"),
    events = catalog
      .filter((x) => x.kind === "event")
      .sort((a, b) => (a.data.date || "").localeCompare(b.data.date || "")),
    jobs = catalog.filter((x) => x.kind === "job");
  const actions = account?.actions || [],
    has = (kind: string, item: string) =>
      actions.some((a) => a.kind === kind && a.item === item),
    progress = (c: CatalogItem) =>
      (c.data.lessons || []).filter((l) => has("lesson", c.id + ":" + l.id))
        .length;
  const filtered = (items: CatalogItem[]) =>
    items.filter(
      (c) =>
        (topic === "All" || c.data.topic === topic) &&
        [
          c.data.title,
          c.data.description,
          c.data.topic,
          c.data.organization,
          c.data.location,
        ]
          .join(" ")
          .toLowerCase()
          .includes((query || search).toLowerCase()),
    );
  useEffect(() => {
    setOpened(null);
    setQuery("");
    setTopic("All");
    setMessage("");
    setShowListing(false);
  }, [page]);
  useEffect(() => {
    if (account) {
      setProfile(account.profile);
      setSkillText((account.profile.skills || []).join(", "));
      setPreferences(account.preferences);
    }
  }, [account]);
  useEffect(() => {
    if (page !== "Leaderboard") return;
    let live = true;
    setBoardLoading(true);
    hubApi("leaderboard")
      .then((d) => {
        if (live) setBoard(d.entries);
      })
      .catch((e) => {
        if (live) {
          setBoard([]);
          setMessage(e.message);
        }
      })
      .finally(() => {
        if (live) setBoardLoading(false);
      });
    return () => {
      live = false;
    };
  }, [page, account]);
  async function run(fn: () => Promise<any>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      await reload();
      setMessage(success);
      return true;
    } catch (e: any) {
      setMessage(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function action(kind: string, item: string, lesson?: string) {
    return run(
      () => hubApi("actions", "POST", { kind, item, lesson }),
      "Saved to your workspace.",
    );
  }
  async function undo(kind: string, item: string) {
    return run(
      () =>
        hubApi(
          "actions?kind=" +
            encodeURIComponent(kind) +
            "&item=" +
            encodeURIComponent(item),
          "DELETE",
        ),
      "Removed from your workspace.",
    );
  }
  const active = courses.find((c) => c.id === opened),
    lessons = active?.data.lessons || [],
    currentLesson = lessons[lessonIndex];
  const completed = courses.filter(
    (c) => progress(c) === (c.data.lessons?.length || 0) && progress(c) > 0,
  ).length;
  const resumes = records.filter((r) => r.kind === "resume"),
    tests = records.filter((r) => r.kind === "test"),
    interviews = records.filter((r) => r.kind === "interview");
  const bestTest = Math.max(
    0,
    ...records
      .filter((r) => r.kind === "test")
      .map((r) => Number(r.data.score) || 0),
  );
  const recommended = [...courses].sort(
    (a, b) =>
      Number(b.data.topic === preferences.preferred_topic) -
        Number(a.data.topic === preferences.preferred_topic) ||
      Number((profile.skills || []).includes(b.data.topic || "")) -
        Number((profile.skills || []).includes(a.data.topic || "")),
  );
  function CourseCard({ item }: { item: CatalogItem }) {
    const done = progress(item),
      total = item.data.lessons?.length || 0;
    return (
      <button
        className={"learning-card theme-" + item.data.theme}
        onClick={() => {
          setOpened(item.id);
          setLessonIndex(0);
        }}
      >
        <span className="level-pill">{item.data.level}</span>
        <div className="course-symbol">
          {item.data.tag === "REACT" ? (
            <span className="react-symbol">⚛</span>
          ) : (
            <Code2 size={39} />
          )}
          <strong>{item.data.tag}</strong>
        </div>
        <div className="learning-card-bottom">
          <div>
            <h3>{item.data.title}</h3>
            <small>
              {done
                ? `${done} of ${total} lessons completed`
                : `${total} lessons · Self-paced`}
            </small>
          </div>
          <span className="round-arrow">
            <ArrowRight size={21} />
          </span>
        </div>
        {done > 0 && (
          <div className="course-progress">
            <i style={{ width: (done / total) * 100 + "%" }} />
          </div>
        )}
      </button>
    );
  }
  function CourseReader() {
    if (!active || !currentLesson) return null;
    return (
      <section className="course-reader">
        <button className="text-btn" onClick={() => setOpened(null)}>
          <ChevronLeft size={17} />
          Back to {page === "Overview" ? "dashboard" : "courses"}
        </button>
        <div className="reader-layout">
          <aside className="lesson-sidebar">
            <span className="eyebrow">YOUR LEARNING SPACE</span>
            <h2>{active.data.title}</h2>
            <p>
              {progress(active)} of {lessons.length} lessons completed
            </p>
            {lessons.map((l, i) => (
              <button
                className={i === lessonIndex ? "active" : ""}
                key={l.id}
                onClick={() => setLessonIndex(i)}
              >
                {has("lesson", active.id + ":" + l.id) ? (
                  <CheckCircle2 size={18} />
                ) : (
                  <span className="lesson-number">{i + 1}</span>
                )}
                {l.title}
              </button>
            ))}
            <button
              className="secondary"
              disabled={busy || has("enroll", active.id)}
              onClick={() => action("enroll", active.id)}
            >
              {has("enroll", active.id) ? "Enrolled" : "Enroll in course"}
            </button>
          </aside>
          <article className="lesson-content">
            <span className="pill">
              LESSON {lessonIndex + 1} OF {lessons.length}
            </span>
            <h1>{currentLesson.title}</h1>
            <p>{currentLesson.body}</p>
            <h3>Try it yourself</h3>
            <p>{currentLesson.exercise}</p>
            <p className="fine">
              Complete the exercise before marking this lesson complete.
              Progress tracks your practice; it is not a certification.
            </p>
            <div className="lesson-actions">
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  has("lesson", active.id + ":" + currentLesson.id)
                    ? undo("lesson", active.id + ":" + currentLesson.id)
                    : action("lesson", active.id, currentLesson.id)
                }
              >
                <Check size={17} />
                {has("lesson", active.id + ":" + currentLesson.id)
                  ? "Completed · undo"
                  : "Mark lesson complete"}
              </button>
              <button
                className="secondary"
                disabled={lessonIndex === lessons.length - 1}
                onClick={() => setLessonIndex((i) => i + 1)}
              >
                Next lesson
                <ArrowRight size={17} />
              </button>
            </div>
          </article>
        </div>
      </section>
    );
  }
  function EventCard({ item }: { item: CatalogItem }) {
    const past =
        !!item.data.date &&
        item.data.date < new Date().toLocaleDateString("en-CA"),
      registered = has("event", item.id);
    return (
      <article className="event-card">
        <div className="event-cover">
          <span>{item.data.topic || "COMMUNITY"}</span>
          <CalendarDays size={35} />
          <h3>{item.data.title}</h3>
        </div>
        <div className="event-info">
          <h3>{item.data.title}</h3>
          <p>{item.data.description}</p>
          <div className="listing-meta">
            <span>
              <CalendarDays size={14} />
              {item.data.date}
            </span>
            <span>
              <MapPin size={14} />
              {item.data.location}
            </span>
          </div>
          <div className="event-host">
            <span className="avatar">
              {item.data.organization?.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <b>{item.data.organization}</b>
              <small>Event organizer</small>
            </div>
          </div>
          <button
            className={registered ? "secondary wide" : "primary wide"}
            disabled={busy || (!registered && past)}
            onClick={() =>
              registered ? undo("event", item.id) : action("event", item.id)
            }
          >
            {registered
              ? "Registered · cancel"
              : past
                ? "Registration closed"
                : "Register interest"}
          </button>
          {isLink(item.data.url) && (
            <a
              className="text-btn listing-link"
              href={item.data.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Organizer website
              <ExternalLink size={14} />
            </a>
          )}
          <small className="registration-note">
            Registration saves your interest here. Follow organizer instructions
            for tickets.
          </small>
          {(role === "admin" ||
            (role === "recruiter" && item.author === account?.id)) && (
            <button
              className="danger-text"
              disabled={busy}
              onClick={() =>
                run(
                  () =>
                    hubApi(
                      "catalog?id=" + encodeURIComponent(item.id),
                      "DELETE",
                    ),
                  "Event removed.",
                )
              }
            >
              <Trash2 size={14} />
              Remove listing
            </button>
          )}
        </div>
      </article>
    );
  }
  const canPublish = ["recruiter", "admin"].includes(role);
  if (loading && !account)
    return (
      <div className="panel empty-hub">
        <BookOpen size={35} />
        <h2>Loading your workspace</h2>
      </div>
    );
  if (error)
    return (
      <div className="panel empty-hub">
        <Settings size={35} />
        <h2>Learning workspace needs setup</h2>
        <p>{error}</p>
        <p>
          Run supabase/dashboard-migration.sql in your Supabase SQL editor after
          installing the base schema, then refresh.
        </p>
        <button className="secondary" onClick={() => reload()}>
          Try again
        </button>
      </div>
    );
  return (
    <div
      className={"hub " + (preferences.compact_cards ? "compact-cards" : "")}
    >
      {message && (
        <div className="notice" role="status">
          {message}
          <button onClick={() => setMessage("")} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}
      {active ? (
        <CourseReader />
      ) : page === "Overview" ? (
        <>
          <div className="hub-welcome">
            <div>
              <span className="eyebrow">YOUR CAREER WORKSPACE</span>
              <h1>Keep learning. Keep moving forward.</h1>
              <p>
                Welcome, {profile.name || account?.profile.name || "candidate"}.
                Your next step starts here.
              </p>
            </div>
            <button className="secondary" onClick={() => go("Career paths")}>
              <Target size={17} />
              Explore career paths
            </button>
          </div>
          <div className="hub-section">
            <div className="section-head">
              <div>
                <h2>Recommended for you</h2>
                <p>Build skills that support your next opportunity</p>
              </div>
              <button className="text-btn" onClick={() => go("Courses")}>
                View all
                <ArrowRight size={15} />
              </button>
            </div>
            <div className="horizontal-cards">
              {filtered(recommended).map((c) => (
                <CourseCard key={c.id} item={c} />
              ))}
            </div>
          </div>
          <div className="hub-section">
            <div className="section-head">
              <div>
                <h2>Upcoming events</h2>
                <p>Find workshops and opportunities from your community</p>
              </div>
              <button className="text-btn" onClick={() => go("Events")}>
                View all
                <ArrowRight size={15} />
              </button>
            </div>
            {events.filter(
              (e) =>
                !e.data.date ||
                e.data.date >= new Date().toLocaleDateString("en-CA"),
            ).length ? (
              <div className="horizontal-cards event-carousel">
                {events
                  .filter(
                    (e) =>
                      !e.data.date ||
                      e.data.date >= new Date().toLocaleDateString("en-CA"),
                  )
                  .map((e) => (
                    <EventCard key={e.id} item={e} />
                  ))}
              </div>
            ) : (
              <div className="event-empty">
                <div className="event-empty-art">
                  <CalendarDays size={45} />
                  <span>LET’S CONNECT</span>
                </div>
                <div>
                  <h3>Your next opportunity is on its way</h3>
                  <p>
                    Workshops and community events appear here when an
                    authorized recruiter or administrator publishes them.
                  </p>
                  <button className="text-btn" onClick={() => go("Events")}>
                    {["admin", "recruiter"].includes(role)
                      ? "Publish an event"
                      : "Explore events"}
                    <ArrowRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="hub-section">
            <div className="section-head">
              <div>
                <h2>Your preparation toolkit</h2>
                <p>Practice with purpose and review your progress</p>
              </div>
            </div>
            <div className="quick-tools">
              {[
                [
                  "Resume studio",
                  "Resume prep",
                  "Find keyword gaps and improve your resume.",
                ],
                [
                  "Mock interview",
                  "Mock interview",
                  "Record answers with video and live transcription.",
                ],
                [
                  "Mock tests",
                  "Mock test",
                  "Check Java, API and SQL fundamentals.",
                ],
              ].map(([dest, title, desc], i) => (
                <button key={dest} onClick={() => go(dest)}>
                  <span className="tiny-icon">
                    {i === 0 ? (
                      <BookOpen size={21} />
                    ) : i === 1 ? (
                      <Users size={21} />
                    ) : (
                      <Target size={21} />
                    )}
                  </span>
                  <h3>{title}</h3>
                  <p>{desc}</p>
                  <span className="text-btn">
                    Get started
                    <ArrowRight size={16} />
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="preparation-summary">
            <button onClick={() => go("Resume studio")}>
              <span>Resume readiness</span>
              <strong>
                {resumes[0]?.data.assessment?.score ?? "—"}
                <small>/100</small>
              </strong>
              <p>
                View your resume report
                <ArrowRight size={14} />
              </p>
            </button>
            <button onClick={() => go("Mock tests")}>
              <span>Mock test average</span>
              <strong>
                {tests.length
                  ? Math.round(
                      tests.reduce((sum, r) => sum + r.data.score, 0) /
                        tests.length,
                    ) + "%"
                  : "—"}
              </strong>
              <p>
                Review your assessments
                <ArrowRight size={14} />
              </p>
            </button>
            <button onClick={() => go("Activity")}>
              <span>Interviews completed</span>
              <strong>{interviews.length}</strong>
              <p>
                Watch saved recordings
                <ArrowRight size={14} />
              </p>
            </button>
          </div>
          <div className="learning-summary">
            <div>
              <GraduationCap size={22} />
              <strong>{completed}</strong>
              <span>Courses completed</span>
            </div>
            <div>
              <BookOpen size={22} />
              <strong>
                {actions.filter((a) => a.kind === "enroll").length}
              </strong>
              <span>Courses enrolled</span>
            </div>
            <div>
              <CalendarDays size={22} />
              <strong>
                {actions.filter((a) => a.kind === "event").length}
              </strong>
              <span>Registered events</span>
            </div>
            <div>
              <Bookmark size={22} />
              <strong>{actions.filter((a) => a.kind === "job").length}</strong>
              <span>Saved jobs</span>
            </div>
          </div>
        </>
      ) : page === "Courses" ? (
        <>
          <div className="catalog-toolbar">
            <div className="search">
              <Search size={17} />
              <input
                aria-label="Search courses"
                placeholder="Search courses or skills"
                value={query || search}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <select
              aria-label="Course topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            >
              {["All", ...new Set(courses.map((c) => c.data.topic || ""))].map(
                (t) => (
                  <option key={t}>{t}</option>
                ),
              )}
            </select>
          </div>
          <div className="course-grid">
            {filtered(courses).map((c) => (
              <div key={c.id}>
                <CourseCard item={c} />
                <p className="course-description">{c.data.description}</p>
                <button
                  className="text-btn"
                  disabled={busy || has("enroll", c.id)}
                  onClick={() => action("enroll", c.id)}
                >
                  {has("enroll", c.id) ? (
                    <>
                      <CheckCircle2 size={16} />
                      Enrolled
                    </>
                  ) : (
                    <>
                      Enroll in course
                      <Plus size={16} />
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
          {!filtered(courses).length && (
            <Empty
              title="No matching courses"
              text="Try a different search or topic."
            />
          )}
        </>
      ) : page === "Career paths" ? (
        <div className="path-grid">
          {filtered(paths).map((path) => (
            <article className="panel path-card" key={path.id}>
              <span className="tiny-icon">
                <Target size={25} />
              </span>
              <span className="pill">{path.data.topic}</span>
              <h2>{path.data.title}</h2>
              <p>{path.data.description}</p>
              <ol>
                {path.data.courses?.map((id) => {
                  const c = courses.find((c) => c.id === id);
                  return (
                    c && (
                      <li key={id}>
                        <button
                          onClick={() => {
                            setOpened(id);
                            setLessonIndex(0);
                          }}
                        >
                          <span>{c.data.title}</span>
                          <small>
                            {progress(c)}/{c.data.lessons?.length} lessons
                          </small>
                          <ArrowRight size={16} />
                        </button>
                      </li>
                    )
                  );
                })}
              </ol>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  has("path", path.id)
                    ? undo("path", path.id)
                    : action("path", path.id)
                }
              >
                {has("path", path.id)
                  ? "Following · unfollow"
                  : "Follow this path"}
              </button>
              <button className="text-btn" onClick={() => go("Mock interview")}>
                Practice an interview
                <ArrowRight size={15} />
              </button>
            </article>
          ))}
        </div>
      ) : page === "Events" || page === "Jobs" ? (
        <>
          <div className="catalog-toolbar">
            <div className="search">
              <Search size={17} />
              <input
                aria-label={"Search " + page}
                placeholder={"Search " + page.toLowerCase()}
                value={query || search}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {canPublish && (
              <button
                className="primary"
                onClick={() => setShowListing((s) => !s)}
              >
                <Plus size={17} />
                {page === "Events" ? "Publish event" : "Post job"}
              </button>
            )}
          </div>
          {showListing && (
            <ListingForm
              event={page === "Events"}
              busy={busy}
              close={() => setShowListing(false)}
              publish={async (draft) => {
                if (
                  await run(
                    () => hubApi("catalog", "POST", draft),
                    "Listing published.",
                  )
                )
                  setShowListing(false);
              }}
            />
          )}
          {page === "Events" ? (
            <div className="event-grid">
              {filtered(events).map((e) => (
                <EventCard key={e.id} item={e} />
              ))}
            </div>
          ) : (
            <div className="job-grid">
              {filtered(jobs).map((j) => (
                <article className="panel job-card" key={j.id}>
                  <div className="section-head">
                    <span className="avatar">
                      {j.data.organization?.slice(0, 2).toUpperCase()}
                    </span>
                    <button
                      className="icon-btn"
                      aria-label={has("job", j.id) ? "Unsave job" : "Save job"}
                      disabled={busy}
                      onClick={() =>
                        has("job", j.id)
                          ? undo("job", j.id)
                          : action("job", j.id)
                      }
                    >
                      <Bookmark
                        size={21}
                        fill={has("job", j.id) ? "currentColor" : "none"}
                      />
                    </button>
                  </div>
                  <small>{j.data.organization}</small>
                  <h2>{j.data.title}</h2>
                  <div className="listing-meta">
                    <span>
                      <MapPin size={15} />
                      {j.data.location}
                    </span>
                    <span>{j.data.topic}</span>
                  </div>
                  <p>{j.data.description}</p>
                  {isLink(j.data.url) ? (
                    <a
                      className="primary"
                      href={j.data.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Apply on employer site
                      <ExternalLink size={16} />
                    </a>
                  ) : (
                    <p className="fine">
                      Application instructions are in the job description.
                    </p>
                  )}
                  {(role === "admin" ||
                    (role === "recruiter" && j.author === account?.id)) && (
                    <button
                      className="danger-text"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            hubApi(
                              "catalog?id=" + encodeURIComponent(j.id),
                              "DELETE",
                            ),
                          "Job removed.",
                        )
                      }
                    >
                      <Trash2 size={15} />
                      Remove listing
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
          {!filtered(page === "Events" ? events : jobs).length && (
            <Empty
              title={"No " + page.toLowerCase() + " listed yet"}
              text={
                page === "Events"
                  ? "Authorized recruiters and administrators can publish workshops, meetups and community events."
                  : "Authorized recruiters and administrators can publish job opportunities."
              }
            />
          )}
          <p className="fine">
            Listings are supplied by your workspace. External applications and
            event tickets are managed by the organizer or employer.
          </p>
        </>
      ) : page === "Leaderboard" ? (
        <>
          <div className="leaderboard-intro">
            <span className="large-icon">
              <Trophy size={31} />
            </span>
            <div>
              <h2>A little progress every day</h2>
              <p>
                10 points per completed lesson, plus your best mock-test score.
                Lesson completion is self-reported.
              </p>
              <button className="text-btn" onClick={() => go("Settings")}>
                {preferences.leaderboard_opt_in
                  ? "Manage your public alias"
                  : "Join with a public alias"}
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
          {boardLoading ? (
            <Empty
              title="Loading leaderboard"
              text="Fetching participation scores."
            />
          ) : board.length ? (
            <div className="panel table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Public alias</th>
                    <th>Lessons</th>
                    <th>Best test</th>
                    <th>Points</th>
                  </tr>
                </thead>
                <tbody>
                  {board.map((b, i) => (
                    <tr key={i}>
                      <td>
                        <span className="rank-number">
                          {i + 1}
                          {i < 3 && <Trophy size={15} />}
                        </span>
                      </td>
                      <td>
                        <b>{b.alias}</b>
                      </td>
                      <td>{b.lessons}</td>
                      <td>{b.best_test}/100</td>
                      <td>
                        <strong>{b.points}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="Be the first to join"
              text="Enable leaderboard participation in Settings. Private profiles and emails are never shown."
            />
          )}
          <p className="fine">
            This is a practice participation board, not a hiring rank or
            verified skill certification. Your current best test is {bestTest}
            /100.
          </p>
        </>
      ) : page === "My profile" ? (
        <div className="panel profile-view">
          <span className="profile-avatar">
            {profile.name?.slice(0, 1).toUpperCase() || "U"}
          </span>
          <h1>{profile.name || "Your profile"}</h1>
          <p>{profile.headline || "Add your professional headline"}</p>
          <small>{email}</small>
          <div className="listing-meta">
            <span>
              <MapPin size={15} />
              {profile.location || "Location not added"}
            </span>
          </div>
          <p className="profile-bio">
            {profile.bio || "Tell your story by editing your profile."}
          </p>
          <h3>Skills</h3>
          <div className="tags">
            {profile.skills?.map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
          <h3>Career goal</h3>
          <p>{profile.goal || "Choose your next role."}</p>
          <div className="profile-links">
            {isLink(profile.github) && (
              <a
                className="secondary"
                href={profile.github}
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
                <ExternalLink size={15} />
              </a>
            )}
            {isLink(profile.linkedin) && (
              <a
                className="secondary"
                href={profile.linkedin}
                target="_blank"
                rel="noopener noreferrer"
              >
                LinkedIn
                <ExternalLink size={15} />
              </a>
            )}
            <button className="primary" onClick={() => go("Edit profile")}>
              Edit profile
              <ArrowRight size={16} />
            </button>
          </div>
          <p className="fine">
            This profile is private to you. Assessment sharing is managed
            separately in Recruiter access.
          </p>
        </div>
      ) : page === "Edit profile" ? (
        <form
          className="panel profile-form"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () =>
                hubApi("profile", "POST", {
                  ...profile,
                  skills: skillText
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                }),
              "Profile saved.",
            );
          }}
        >
          <h2>Your professional profile</h2>
          <p>
            Your sign-in email and account role are managed by Google and your
            administrator.
          </p>
          <div className="form-grid">
            {(
              [
                "name",
                "headline",
                "location",
                "goal",
                "github",
                "linkedin",
              ] as const
            ).map((key) => (
              <label key={key}>
                {
                  {
                    name: "Full name",
                    headline: "Professional headline",
                    location: "Location",
                    goal: "Career goal",
                    github: "GitHub URL",
                    linkedin: "LinkedIn URL",
                  }[key]
                }
                <input
                  required={key === "name"}
                  maxLength={
                    key === "name" || key === "location"
                      ? 100
                      : key === "headline" || key === "goal"
                        ? 160
                        : 300
                  }
                  type={key === "github" || key === "linkedin" ? "url" : "text"}
                  value={profile[key] || ""}
                  onChange={(e) =>
                    setProfile({ ...profile, [key]: e.target.value })
                  }
                />
              </label>
            ))}
          </div>
          <label>
            About you
            <textarea
              maxLength={2000}
              value={profile.bio || ""}
              onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
            />
          </label>
          <label>
            Skills separated by commas
            <input
              value={skillText}
              onChange={(e) => setSkillText(e.target.value)}
            />
          </label>
          <button className="primary" disabled={busy}>
            Save profile
            <Check size={16} />
          </button>
        </form>
      ) : page === "Settings" ? (
        <form
          className="panel settings-form"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => hubApi("preferences", "POST", preferences),
              "Settings saved.",
            );
          }}
        >
          <h2>Make this workspace yours</h2>
          <label>
            Preferred learning topic
            <select
              value={preferences.preferred_topic || ""}
              onChange={(e) =>
                setPreferences({
                  ...preferences,
                  preferred_topic: e.target.value,
                })
              }
            >
              <option value="">All topics</option>
              {[...new Set(courses.map((c) => c.data.topic || ""))].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="toggle-row">
            <div>
              <b>Compact learning cards</b>
              <p>Show more course cards in the catalog.</p>
            </div>
            <input
              type="checkbox"
              checked={!!preferences.compact_cards}
              onChange={(e) =>
                setPreferences({
                  ...preferences,
                  compact_cards: e.target.checked,
                })
              }
            />
          </label>
          <label className="toggle-row">
            <div>
              <b>Join the leaderboard</b>
              <p>
                Share only your alias, completed lesson count and best test
                score.
              </p>
            </div>
            <input
              type="checkbox"
              checked={!!preferences.leaderboard_opt_in}
              onChange={(e) =>
                setPreferences({
                  ...preferences,
                  leaderboard_opt_in: e.target.checked,
                })
              }
            />
          </label>
          <label>
            Public leaderboard alias
            <input
              maxLength={40}
              required={preferences.leaderboard_opt_in}
              value={preferences.public_alias || ""}
              onChange={(e) =>
                setPreferences({ ...preferences, public_alias: e.target.value })
              }
            />
          </label>
          <button className="primary" disabled={busy}>
            Save settings
            <Check size={16} />
          </button>
          <h3>Privacy and account</h3>
          <p>
            Your email is {email}. Google controls your identity; the
            administrator controls recruiter authorization.
          </p>
          <button
            type="button"
            className="text-btn"
            onClick={() => go("Recruiter access")}
          >
            Manage assessment sharing
            <ArrowRight size={16} />
          </button>
        </form>
      ) : page === "Interview prep" ? (
        <div className="prep-grid">
          <article className="panel">
            <span className="tiny-icon">
              <Users size={24} />
            </span>
            <h2>Prepare your next conversation</h2>
            <p>
              Explain a project, practice a behavioral answer and review a
              recording before the real interview.
            </p>
            <button
              className="primary"
              onClick={() => {
                setOpened("interview-skills");
                setLessonIndex(0);
              }}
            >
              Start communication lessons
              <ArrowRight size={16} />
            </button>
            <button className="secondary" onClick={() => go("Mock interview")}>
              Open mock interview
            </button>
          </article>
          <article className="panel">
            <h3>Your preparation checklist</h3>
            {[
              [
                "Resume reviewed",
                records.some((r) => r.kind === "resume"),
                "Resume studio",
              ],
              [
                "Mock test completed",
                records.some((r) => r.kind === "test"),
                "Mock tests",
              ],
              [
                "Interview recorded",
                records.some((r) => r.kind === "interview"),
                "Mock interview",
              ],
              [
                "Communication course complete",
                courses.some(
                  (c) =>
                    c.id === "interview-skills" &&
                    progress(c) === c.data.lessons?.length,
                ),
                "Courses",
              ],
            ].map(([title, done, dest]) => (
              <button
                className="prep-check"
                key={String(title)}
                onClick={() => go(String(dest))}
              >
                {done ? <CheckCircle2 size={19} /> : <Clock size={19} />}
                <span>{String(title)}</span>
                <ArrowRight size={16} />
              </button>
            ))}
          </article>
        </div>
      ) : null}
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="panel empty-hub">
      <Search size={31} />
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}

function ListingForm({
  event,
  busy,
  close,
  publish,
}: {
  event: boolean;
  busy: boolean;
  close: () => void;
  publish: (draft: any) => Promise<void>;
}) {
  const [draft, setDraft] = useState({
    title: "",
    description: "",
    organization: "",
    location: "",
    url: "",
    date: "",
    topic: "",
    level: "All levels",
  });
  return (
    <form
      className="panel listing-form"
      onSubmit={(e) => {
        e.preventDefault();
        publish({
          ...draft,
          kind: event ? "event" : "job",
          date: draft.date || null,
        });
      }}
    >
      <div className="section-head">
        <h3>{event ? "Publish an event" : "Post a job"}</h3>
        <button
          type="button"
          className="icon-btn"
          onClick={close}
          aria-label="Close listing form"
        >
          <X size={18} />
        </button>
      </div>
      <div className="form-grid">
        {(["title", "organization", "location", "topic"] as const).map(
          (key) => (
            <label key={key}>
              {key.charAt(0).toUpperCase() + key.slice(1)}
              <input
                required={key !== "topic"}
                minLength={key === "title" ? 3 : 2}
                maxLength={key === "title" ? 150 : key === "topic" ? 60 : 100}
                value={draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            </label>
          ),
        )}
        {event && (
          <label>
            Event date
            <input
              type="date"
              required
              min={new Date().toLocaleDateString("en-CA")}
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            />
          </label>
        )}
        <label>
          {event ? "Organizer link" : "Application link"}
          <input
            type="url"
            placeholder="https://..."
            maxLength={500}
            value={draft.url}
            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
          />
        </label>
      </div>
      <label>
        Description
        <textarea
          required
          minLength={10}
          maxLength={4000}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </label>
      <button className="primary" disabled={busy}>
        Publish listing
        <ArrowRight size={17} />
      </button>
    </form>
  );
}
