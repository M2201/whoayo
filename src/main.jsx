import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import {
  ArrowUp,
  ArrowUpRight,
  ArrowLeft,
  Archive,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Code2,
  Copy,
  Download,
  FileCode2,
  FileText,
  Fingerprint,
  Folder,
  FolderOpen,
  History,
  Layers3,
  Link2,
  LockKeyhole,
  LogOut,
  Menu,
  MessageSquare,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Square,
  X,
  AlertCircle,
  Activity,
  RefreshCw,
  Save,
  Network,
  CheckCircle2,
  Circle,
  Eye,
} from "lucide-react";
import "./style.css";
import ConceptProvenance from "./ConceptProvenance.jsx";
import PublicSite from "./PublicSite.jsx";
import TimestampPanel, { useTimestampStatus } from "./TimestampPanel.jsx";

let csrf = "";
async function api(path, body, signal) {
  const r = await fetch(`/api${path}`, {
    credentials: "same-origin",
    signal,
    headers: body
      ? { "Content-Type": "application/json", "X-CSRF-Token": csrf }
      : {},
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
  });
  const result = await r.json();
  if (!r.ok) {
    const error = new Error(result.error || "Request failed.");
    error.field = result.field;
    throw error;
  }
  return result;
}
const formatDate = (value) =>
  new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
const short = (value) =>
  value ? `${value.slice(0, 9)}...${value.slice(-6)}` : "";
function download(name, value, type = "application/json") {
  const url = URL.createObjectURL(
    new Blob(
      [
        typeof value === "string" || ArrayBuffer.isView(value)
          ? value
          : JSON.stringify(value, null, 2),
      ],
      { type },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function IconButton({ icon: Icon, label, ...props }) {
  return (
    <button className="icon-button" title={label} aria-label={label} {...props}>
      <Icon size={17} />
    </button>
  );
}
function Button({ icon: Icon, children, variant = "", ...props }) {
  return (
    <button className={`button ${variant}`} {...props}>
      {Icon && <Icon size={16} />}
      <span>{children}</span>
    </button>
  );
}
function Badge({ children, tone = "" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function Markdown({ children }) {
  return (
    <ReactMarkdown
      components={{
        img: () => null,
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
function Modal({
  title,
  children,
  close,
  wide = false,
  error = "",
  canClose = true,
}) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      onCancel={(e) => {
        e.preventDefault();
        if (canClose) close();
      }}
      onClick={(e) => {
        if (canClose && e.target === ref.current) close();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <IconButton
          icon={X}
          label="Close dialog"
          onClick={close}
          disabled={!canClose}
        />
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {children}
    </dialog>
  );
}
function Auth({
  setSession,
  notice,
  signedIn = false,
  identity,
  localRegistration = true,
}) {
  const recoveryTrigger = useRef(null);
  const [mode, setMode] = useState(
      notice || !localRegistration ? "login" : "register",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null),
    [recovery, setRecovery] = useState(false);
  const closeRecovery = () => {
    setRecovery(false);
    requestAnimationFrame(() =>
      recoveryTrigger.current?.focus({ preventScroll: true }),
    );
  };
  const showAccount = (nextMode) => {
    if (busy) return;
    setMode(nextMode);
    setError(null);
    requestAnimationFrame(() => {
      document.getElementById("account")?.scrollIntoView();
      document.getElementById("join-title")?.focus({ preventScroll: true });
    });
  };
  useEffect(() => {
    if (notice) document.getElementById("account")?.scrollIntoView();
  }, [notice]);
  const fieldError = (field) =>
    error?.field === field && (
      <p id={`auth-${field}-error`} role="alert" className="auth-field-error">
        {error.message}
      </p>
    );
  const inputAccessibility = (field, hint) => ({
    "aria-invalid": error?.field === field || undefined,
    "aria-describedby":
      [hint, error?.field === field && `auth-${field}-error`]
        .filter(Boolean)
        .join(" ") || undefined,
  });
  const submit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError(null);
    try {
      const data = Object.fromEntries(new FormData(form));
      const result = await api(`/${mode}`, data);
      csrf = result.csrf;
      if (new URLSearchParams(location.search).get("view") === "welcome")
        history.replaceState(null, "", "/");
      setSession(result);
      window.scrollTo(0, 0);
    } catch (e) {
      const field = ["name", "username", "password"].includes(e.field)
        ? e.field
        : undefined;
      setError({ message: e.message, field });
      if (field) form.elements.namedItem(field)?.focus();
    } finally {
      setBusy(false);
    }
  };
  const managedSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api("/identity/start", {});
      const destination = new URL(result.redirect);
      if (destination.protocol !== "https:")
        throw new Error("The invited sign-in destination is unavailable.");
      location.assign(destination.href);
    } catch (e) {
      setError({ message: e.message });
      setBusy(false);
    }
  };
  return (
    <PublicSite signedIn={signedIn} onAccount={showAccount}>
      <div className="auth site-auth">
        <div className="auth-symbol">
          <LockKeyhole size={26} />
        </div>
        <h3>
          {mode === "register" ? "Create your local account" : "Welcome back."}
        </h3>
        <p className="muted">
          {mode === "register"
            ? "Start with your first idea record."
            : "Continue with your existing ideas and projects."}
        </p>
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
        {identity?.enabled && (
          <>
            <Button
              type="button"
              variant="primary managed-signin"
              disabled={busy}
              icon={ShieldCheck}
              onClick={managedSignIn}
            >
              {busy
                ? "Opening secure sign-in..."
                : "Continue with invited account"}
            </Button>
            <div className="auth-divider" role="separator">
              <span>Local account access</span>
            </div>
          </>
        )}
        <form
          key={mode}
          onSubmit={submit}
          noValidate
          onChange={(e) => {
            if (!error?.field || error.field === e.target.name) setError(null);
          }}
        >
          {mode === "register" && localRegistration && (
            <div className="auth-field">
              <label htmlFor="auth-name">Your name</label>
              <input
                id="auth-name"
                name="name"
                autoComplete="name"
                maxLength={100}
                required
                {...inputAccessibility("name")}
              />
              {fieldError("name")}
            </div>
          )}
          <div className="auth-field">
            <label htmlFor="auth-username">Email or username</label>
            <input
              id="auth-username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              minLength={3}
              maxLength={254}
              required
              {...inputAccessibility(
                "username",
                mode === "register" ? "auth-username-hint" : undefined,
              )}
            />
            {mode === "register" && (
              <p id="auth-username-hint" className="auth-hint">
                Email is a sign-in name here, not a verified recovery address.
              </p>
            )}
            {fieldError("username")}
          </div>
          <div className="auth-field">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              name="password"
              type="password"
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
              minLength={mode === "register" ? 12 : undefined}
              maxLength={256}
              required
              placeholder={mode === "register" ? "At least 12 characters" : ""}
              {...inputAccessibility(
                "password",
                mode === "register" ? "auth-password-hint" : undefined,
              )}
            />
            {mode === "register" && (
              <p id="auth-password-hint" className="auth-hint">
                12-256 characters. Save it in your password manager; password
                reset is not available in this local version.
              </p>
            )}
            {fieldError("password")}
          </div>
          {error && !error.field && (
            <p role="alert" className="error">
              {error.message}
            </p>
          )}
          <Button
            variant="primary"
            disabled={busy}
            icon={mode === "register" ? ArrowUpRight : LockKeyhole}
          >
            {busy
              ? "Opening workspace..."
              : mode === "register" && localRegistration
                ? "Create local account"
                : "Sign in"}
          </Button>
        </form>
        <div className="auth-actions">
          {localRegistration && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setMode(mode === "register" ? "login" : "register");
                setError(null);
              }}
            >
              {mode === "register"
                ? "Already have an account? Sign in"
                : "Create an account"}
            </button>
          )}
          <button
            className="text-button"
            disabled={busy}
            ref={recoveryTrigger}
            onClick={() => setRecovery(true)}
          >
            Forgot password?
          </button>
        </div>
        {recovery && (
          <Modal title="Account recovery" close={closeRecovery}>
            {identity?.enabled ? (
              <>
                <p>
                  Invited accounts use the verified recovery and MFA flow on the
                  managed sign-in screen. Return here after recovery to continue
                  into the same WHOAYO account.
                </p>
                <p className="notice">
                  A matching email address never links or replaces a local
                  account. Existing local work remains separate.
                </p>
              </>
            ) : (
              <>
                <p>
                  Password reset is not available in this local version. No
                  reset email can be sent.
                </p>
                <p>
                  Check your password manager for WHOAYO or 127.0.0.1. If the
                  password is not saved, keep your existing account and
                  workspace intact while we arrange a verified recovery method.
                </p>
                <p className="notice">
                  A new account will not restore access to an existing account's
                  projects. AWS sign-in and backup recovery keys cannot reset
                  this password.
                </p>
              </>
            )}
            <Button icon={ArrowLeft} onClick={closeRecovery}>
              Back to account form
            </Button>
          </Modal>
        )}
        <div className="auth-note">
          <ShieldCheck size={16} />
          <span>Encrypted on this Mac. External AI is off by default.</span>
        </div>
        <p className="fine">
          Local evaluation release. Verified email and password recovery are not
          connected.
        </p>
      </div>
    </PublicSite>
  );
}

function App() {
  const publicView =
    new URLSearchParams(location.search).get("view") === "welcome";
  const [session, setSession] = useState(null),
    [sessionNotice, setSessionNotice] = useState(() =>
      new URLSearchParams(location.search).get("identity") === "failed"
        ? "Invited sign-in did not complete. Start again; no account was changed."
        : "",
    ),
    [loading, setLoading] = useState(true),
    [projects, setProjects] = useState([]),
    [project, setProject] = useState(null),
    [view, setView] = useState(() =>
      new URLSearchParams(location.search).has("billing")
        ? "security"
        : "projects",
    ),
    [search, setSearch] = useState(""),
    [modal, setModal] = useState(null),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [mobile, setMobile] = useState(false),
    [archived, setArchived] = useState(false),
    [folder, setFolder] = useState(null),
    [rail, setRail] = useState(true),
    [security, setSecurity] = useState(null);
  const refreshList = async () => {
    const list = await api("/projects");
    setProjects(list);
    return list;
  };
  useEffect(() => {
    api("/session")
      .then((s) => {
        csrf = s.csrf || s.loginCsrf || "";
        setSession(s);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (session?.user && !publicView)
      refreshList().catch((e) => setError(e.message));
    else {
      setProject(null);
      setProjects([]);
    }
  }, [session?.user?.id, publicView]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (view === "security" && session?.user) {
      let live = true;
      const load = () =>
        api("/security")
          .then((s) => {
            if (live) setSecurity(s);
          })
          .catch((e) => setError(e.message));
      load();
      const t = setInterval(load, 60000);
      return () => {
        live = false;
        clearInterval(t);
      };
    }
  }, [view, session?.user?.id]);
  async function run(fn) {
    setError("");
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const choose = async (id) =>
    run(async () => {
      setProject(await api(`/projects/${id}`));
      setView("workbench");
      setMobile(false);
    });
  const saveProject = async (p) => {
    setProject(p);
    await refreshList();
  };
  const action = async (input) => {
    const p = await api(`/projects/${project.id}/action`, {
      revision: project.revision,
      ...input,
    });
    await saveProject(p);
    return p;
  };
  const exportProject = () =>
    run(async () => {
      const result = await api(`/projects/${project.id}/preserve`, {
        revision: project.revision,
      });
      download(
        `origin-${project.id}-r${result.manifest.revision}.json`,
        result,
      );
      setToast("Private evidence snapshot preserved and downloaded.");
    });
  if (loading)
    return (
      <div className="boot">
        <Fingerprint size={32} />
        <span>Opening WHOAYO</span>
      </div>
    );
  if (!session?.user || publicView)
    return (
      <Auth
        setSession={setSession}
        notice={sessionNotice}
        signedIn={Boolean(session?.user)}
        identity={session?.identity}
        localRegistration={session?.localRegistration !== false}
      />
    );
  const filtered = projects.filter(
    (p) =>
      p.archived === archived &&
      (folder === null || (p.folder || "") === folder) &&
      `${p.title} ${p.description}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const folders = [
    ...new Set(projects.map((p) => p.folder).filter(Boolean)),
  ].sort();
  const current =
    project && !["projects", "security", "connections"].includes(view);
  return (
    <div className="app">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <div className="brand">
          <Fingerprint size={27} />
          <strong>WHOAYO</strong>
          <IconButton
            icon={X}
            label="Close navigation"
            className="icon-button mobile-only"
            onClick={() => setMobile(false)}
          />
        </div>
        <button
          className="workspace-switch"
          onClick={() => {
            setView("projects");
            setMobile(false);
          }}
        >
          <span className="avatar">
            {session.user.name.slice(0, 1).toUpperCase()}
          </span>
          <span>
            <strong>Personal workspace</strong>
            <small>
              {session.deployment === "invited-hosted"
                ? "Invited workspace"
                : "Local development"}
            </small>
          </span>
          <ChevronDown size={14} />
        </button>
        <Button
          icon={Plus}
          variant="new-project"
          onClick={() => setModal({ type: "capture" })}
        >
          New idea
        </Button>
        <nav>
          <button
            className={view === "projects" ? "selected" : ""}
            onClick={() => {
              setView("projects");
              setMobile(false);
            }}
          >
            <Layers3 size={17} />
            Ideas & projects
            <span>{projects.filter((p) => !p.archived).length}</span>
          </button>
          <button
            className={view === "security" ? "selected" : ""}
            onClick={() => {
              setView("security");
              setMobile(false);
            }}
          >
            <ShieldCheck size={17} />
            Security
          </button>
          <button
            className={view === "connections" ? "selected" : ""}
            onClick={() => {
              setView("connections");
              setMobile(false);
            }}
          >
            <Network size={17} />
            Model connections
          </button>
        </nav>
        <div className="sidebar-label">
          PROJECTS
          <IconButton
            icon={Plus}
            label="Record a new idea"
            onClick={() => setModal({ type: "capture" })}
          />
        </div>
        <div className="sidebar-projects">
          {projects
            .filter((p) => !p.archived)
            .map((p) => (
              <button
                key={p.id}
                className={current && project.id === p.id ? "active" : ""}
                onClick={() => choose(p.id)}
              >
                <Folder size={16} />
                <span>{p.title}</span>
                {p.sample && <small>Sample</small>}
              </button>
            ))}
          {projects.length === 0 && (
            <span className="sidebar-empty">No projects yet</span>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="local-state">
            <span className="status-dot" />
            Private workspace
            <LockKeyhole size={13} />
          </div>
          <button
            className="profile"
            title="Sign out"
            onClick={() =>
              run(async () => {
                const result = await api("/logout", {});
                csrf = "";
                if (result.redirect) {
                  location.assign(result.redirect);
                  return;
                }
                setSession(null);
              })
            }
          >
            <span className="avatar">{session.user.name.slice(0, 1)}</span>
            <span>{session.user.name}</span>
            <LogOut size={16} />
          </button>
          <a
            className="fine"
            href="https://github.com/M2201/whoayo"
            target="_blank"
            rel="noopener noreferrer"
          >
            Source code · AGPL-3.0
          </a>
        </div>
      </aside>
      {mobile && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="shell">
        <header className="topbar">
          <div className="breadcrumb">
            <IconButton
              icon={Menu}
              label="Open navigation"
              className="icon-button mobile-only"
              onClick={() => setMobile(true)}
            />
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>
              {current
                ? project.title
                : view === "security"
                  ? "Security"
                  : view === "connections"
                    ? "Model connections"
                    : "Ideas & projects"}
            </strong>
          </div>
          <div className="topbar-actions">
            <Badge tone="green">
              <LockKeyhole size={12} />
              Private
            </Badge>
            {current && (
              <>
                <IconButton
                  icon={Download}
                  label="Export project evidence"
                  onClick={exportProject}
                />
                <IconButton
                  className="icon-button rail-toggle"
                  icon={rail ? PanelRightClose : PanelRightOpen}
                  label={rail ? "Hide project details" : "Show project details"}
                  onClick={() => setRail(!rail)}
                />
              </>
            )}
          </div>
        </header>
        {error && (
          <div role="alert" className="error-banner">
            <AlertCircle size={17} />
            <span>{error}</span>
            <IconButton
              icon={RefreshCw}
              label="Refresh project"
              onClick={() =>
                run(async () => {
                  if (project) setProject(await api(`/projects/${project.id}`));
                  else await refreshList();
                })
              }
            />
            <IconButton
              icon={X}
              label="Dismiss error"
              onClick={() => setError("")}
            />
          </div>
        )}
        {!current && view !== "security" && view !== "connections" && (
          <main className="project-page">
            <div className="page-title">
              <div>
                <span className="eyebrow">WHOAYO</span>
                <h1>Your ideas should be yours.</h1>
                <p className="workspace-purpose">
                  Create evidence before you build with AI. Preserve your words,
                  track revisions and keep AI contributions distinct.
                </p>
              </div>
              <Button
                icon={Plus}
                variant="primary"
                onClick={() => setModal({ type: "capture" })}
              >
                Record an idea
              </Button>
            </div>
            <ConceptProvenance />
            <div className="list-tools">
              <div className="search">
                <Search size={16} />
                <input
                  aria-label="Search projects"
                  placeholder="Search your projects"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select
                aria-label="Filter by folder"
                value={JSON.stringify(folder)}
                onChange={(e) => setFolder(JSON.parse(e.target.value))}
              >
                <option value="null">All folders</option>
                <option value={'""'}>Unfiled</option>
                {folders.map((name) => (
                  <option key={name} value={JSON.stringify(name)}>
                    {name}
                  </option>
                ))}
              </select>
              <button
                className="text-button"
                onClick={() => setArchived(!archived)}
              >
                <Archive size={15} />
                {archived ? "Show active" : "Archived"}
              </button>
            </div>
            {filtered.length ? (
              <div className="project-table">
                <div className="table-head">
                  <span>Idea / project</span>
                  <span>Records</span>
                  <span>Updated</span>
                </div>
                {filtered.map((p) => (
                  <button
                    className="project-row"
                    key={p.id}
                    onClick={() => choose(p.id)}
                  >
                    <div className="project-name">
                      <span className="project-icon">
                        <FolderOpen size={21} />
                      </span>
                      <span>
                        <strong>{p.title}</strong>
                        <small>
                          {p.folder || "Unfiled"} ·{" "}
                          {p.ideas
                            ? "Idea recorded locally"
                            : "No idea recorded"}
                        </small>
                      </span>
                      {p.sample && <Badge>Sample</Badge>}
                    </div>
                    <span>
                      {p.ideas + p.artifacts + (p.businessRecords || 0)}
                    </span>
                    <time>{formatDate(p.updated)}</time>
                    <ArrowUpRight size={16} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-workspace">
                <Fingerprint size={42} />
                <h2>
                  {search
                    ? "No matching projects"
                    : archived
                      ? "No archived projects"
                      : folder !== null
                        ? "No ideas in this folder"
                        : "Start with the idea. The project follows."}
                </h2>
                {!search && !archived && (
                  <div className="empty-actions">
                    <Button
                      icon={Plus}
                      variant="primary"
                      onClick={() => setModal({ type: "capture" })}
                    >
                      {projects.length
                        ? "Record another idea"
                        : "Record your first idea"}
                    </Button>
                    <Button
                      icon={FolderOpen}
                      onClick={() =>
                        run(async () => {
                          const p = await api("/sample", {});
                          await saveProject(p);
                          setView("workbench");
                        })
                      }
                    >
                      Explore sample
                    </Button>
                  </div>
                )}
              </div>
            )}
            <div className="workspace-foot">
              <LockKeyhole size={14} />
              Encrypted local records
              <span>
                Evidence of what you recorded, not a guarantee of ownership.
              </span>
            </div>
          </main>
        )}
        {view === "connections" && (
          <Connections
            providers={session.providers}
            refresh={() =>
              run(async () => {
                const s = await api("/session");
                csrf = s.csrf;
                setSession(s);
              })
            }
          />
        )}
        {view === "security" && (
          <Security
            report={security}
            busy={busy}
            managed={session.user.authentication === "managed"}
            billingAction={(kind, tier) =>
              run(async () => {
                const result = await api(
                  `/payments/${kind}`,
                  tier ? { tier } : {},
                );
                const target = new URL(result.redirect);
                const host =
                  kind === "checkout"
                    ? "checkout.stripe.com"
                    : "billing.stripe.com";
                if (
                  target.protocol !== "https:" ||
                  target.host !== host ||
                  target.username ||
                  target.password
                )
                  throw new Error(
                    "Billing returned an unexpected destination.",
                  );
                location.assign(target.href);
              })
            }
            revoke={() => {
              setError("");
              setModal({ type: "sessions" });
            }}
            scan={() =>
              run(async () => {
                setSecurity(await api("/security"));
                setToast("Security review completed.");
              })
            }
            choose={choose}
          />
        )}
        {current && (
          <>
            <div className="project-heading">
              <div className="project-heading-title">
                <span className="project-icon">
                  <FolderOpen size={23} />
                </span>
                <div>
                  <h1>{project.title}</h1>
                  <p>
                    {project.description || "Private research and development"}
                  </p>
                  {project.ideas.length > 0 && (
                    <span className="record-state">
                      <Fingerprint size={13} />
                      Idea preserved locally · Version {project.ideas.length}
                    </span>
                  )}
                </div>
                {project.sample && <Badge>Sample</Badge>}
                {project.archived && <Badge tone="amber">Archived</Badge>}
              </div>
              <div className="project-heading-actions">
                <Button
                  icon={Folder}
                  disabled={project.archived || busy}
                  onClick={() => setModal({ type: "folder" })}
                >
                  {project.folder || "Move to folder"}
                </Button>
                <Button
                  icon={Archive}
                  onClick={() =>
                    run(() =>
                      action({
                        action: "project.archive",
                        archived: !project.archived,
                      }),
                    )
                  }
                >
                  {project.archived ? "Restore" : "Archive"}
                </Button>
              </div>
            </div>
            <div className="tabbar">
              {[
                ["workbench", "Workbench", MessageSquare],
                ["ideas", "Ideas", Fingerprint],
                ["business", "Business", Activity],
                ["files", "Files", FileCode2],
                ["references", "References", BookOpen],
                ["evidence", "Evidence", History],
              ].map(([key, label, Icon]) => (
                <button
                  className={view === key ? "active" : ""}
                  key={key}
                  onClick={() => setView(key)}
                >
                  <Icon size={16} />
                  {label}
                  {key === "files" && <span>{project.artifacts.length}</span>}
                </button>
              ))}
            </div>
            <div
              className={`project-body ${rail && view === "workbench" ? "with-rail" : ""}`}
            >
              <main className="project-main">
                {view === "workbench" && (
                  <Workbench
                    error={error}
                    key={project.id}
                    project={project}
                    providers={session.providers}
                    skills={session.skills || []}
                    openModels={() => setModal({ type: "connections" })}
                    saveProject={saveProject}
                    action={action}
                    run={run}
                    setModal={setModal}
                    setToast={setToast}
                    busy={busy}
                  />
                )}
                {view === "ideas" && (
                  <Ideas
                    project={project}
                    record={() => setModal({ type: "idea" })}
                  />
                )}
                {view === "business" && (
                  <Business
                    key={project.id}
                    project={project}
                    action={action}
                    run={run}
                    busy={busy}
                    setToast={setToast}
                  />
                )}
                {view === "files" && (
                  <Files
                    key={project.id}
                    project={project}
                    action={action}
                    run={run}
                    busy={busy}
                    setModal={setModal}
                    setToast={setToast}
                  />
                )}
                {view === "references" && (
                  <References
                    project={project}
                    add={() => setModal({ type: "reference" })}
                  />
                )}
                {view === "evidence" && (
                  <Evidence
                    project={project}
                    saveProject={saveProject}
                    busy={busy}
                    run={run}
                    exportProject={exportProject}
                    setToast={setToast}
                  />
                )}
              </main>
              {rail && view === "workbench" && (
                <aside className="context-rail">
                  <div className="rail-heading">
                    <h3>Project context</h3>
                    <IconButton
                      icon={PanelRightClose}
                      label="Hide project details"
                      onClick={() => setRail(false)}
                    />
                  </div>
                  <div className="rail-section">
                    <span className="eyebrow">IDEA RECORD</span>
                    {project.ideas.length ? (
                      <>
                        <h4>{project.ideas.at(-1).title}</h4>
                        <Badge tone="green">
                          <Check size={12} />
                          Recorded locally
                        </Badge>
                        <p className="fine">
                          Version {project.ideas.length} ·{" "}
                          {formatDate(
                            project.ideas.at(-1).receipt.manifest.createdAt,
                          )}
                        </p>
                        <button
                          className="text-button"
                          onClick={() => setView("ideas")}
                        >
                          View idea
                          <ArrowUpRight size={14} />
                        </button>
                      </>
                    ) : (
                      <Button
                        icon={Fingerprint}
                        onClick={() => setModal({ type: "idea" })}
                      >
                        Record an idea
                      </Button>
                    )}
                  </div>
                  <div className="rail-section">
                    <div className="rail-label">
                      <span className="eyebrow">PROJECT FILES</span>
                      <span>{project.artifacts.length}</span>
                    </div>
                    {project.artifacts.slice(0, 5).map((a) => (
                      <button
                        className="file-link"
                        key={a.id}
                        onClick={() => setView("files")}
                      >
                        <FileText size={16} />
                        <span>{a.name}</span>
                      </button>
                    ))}
                    <button
                      className="text-button"
                      onClick={() => {
                        setView("files");
                        setModal({ type: "file" });
                      }}
                    >
                      <Plus size={14} />
                      Add file
                    </button>
                  </div>
                  <div className="rail-section">
                    <span className="eyebrow">DISCLOSURE BOUNDARY</span>
                    <div className="boundary-visual">
                      <span>
                        <LockKeyhole size={18} />
                        Vault
                      </span>
                      <span className="boundary-line" />
                      <span>
                        <Eye size={18} />
                        Review
                      </span>
                      <span className="boundary-line" />
                      <span>
                        <Sparkles size={18} />
                        Model
                      </span>
                    </div>
                    <p className="fine">
                      Only the context in your approved request is sent.
                      Provider retention may apply.
                    </p>
                    <button
                      className="text-button"
                      onClick={() => setView("evidence")}
                    >
                      Disclosure history
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                  <div className="rail-note">
                    <ShieldCheck size={17} />
                    <span>
                      Local receipts
                      <br />
                      <small>Independent timestamp not connected</small>
                    </span>
                  </div>
                </aside>
              )}
            </div>
          </>
        )}
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          {toast}
        </div>
      )}
      {modal?.type === "connections" && (
        <Modal
          title="Model connections"
          wide
          close={() => setModal(null)}
          error={error}
        >
          <Connections
            compact
            providers={session.providers}
            refresh={() =>
              run(async () => {
                const s = await api("/session");
                csrf = s.csrf;
                setSession(s);
              })
            }
          />
        </Modal>
      )}
      {modal?.type === "sessions" && (
        <Modal
          title="Sign out everywhere"
          error={error}
          close={() => setModal(null)}
        >
          <p>
            End every session for your account, including this one. Requests
            already sent to a provider cannot be recalled.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const password = new FormData(e.currentTarget).get("password");
              run(async () => {
                const result = await api("/sessions/revoke-all", {
                  password,
                });
                csrf = "";
                setModal(null);
                setSecurity(null);
                if (result.redirect) {
                  location.assign(result.redirect);
                  return;
                }
                setSessionNotice(
                  "All your sessions have ended. Sign in to continue.",
                );
                setSession(null);
              });
            }}
          >
            {session.user.authentication === "local" ? (
              <label>
                Current password
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  maxLength={256}
                  required
                  autoFocus
                />
              </label>
            ) : (
              <p className="notice">
                This will revoke every WHOAYO application session and continue
                to the managed provider's sign-out page.
              </p>
            )}
            <Button icon={LogOut} variant="primary" disabled={busy}>
              {busy ? "Signing out..." : "Confirm sign out everywhere"}
            </Button>
          </form>
        </Modal>
      )}
      {modal?.type === "capture" && (
        <IdeaComposer
          busy={busy}
          error={error}
          close={() => setModal(null)}
          save={(data) =>
            run(async () => {
              const p = await api("/ideas", data);
              setProject(p);
              setView("workbench");
              setMobile(false);
              setModal(null);
              setToast("Idea preserved locally. Your project is ready.");
              await refreshList();
            })
          }
        />
      )}
      {modal?.type === "folder" && (
        <Modal
          title="Move to folder"
          error={error}
          close={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = Object.fromEntries(new FormData(e.currentTarget));
              run(async () => {
                await action({ action: "project.organize", ...data });
                setModal(null);
              });
            }}
          >
            <label>
              Folder
              <input
                name="folder"
                list="project-folders"
                defaultValue={project.folder || ""}
                placeholder="Unfiled"
                maxLength={80}
                autoFocus
              />
            </label>
            <datalist id="project-folders">
              {folders.map((name) => (
                <option value={name} key={name} />
              ))}
            </datalist>
            <p className="fine">
              The original idea and its evidence stay unchanged.
            </p>
            <div className="modal-foot">
              <Button type="button" onClick={() => setModal(null)}>
                Cancel
              </Button>
              <Button icon={Folder} variant="primary" disabled={busy}>
                Save folder
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {modal?.type === "idea" && (
        <IdeaComposer
          project={project}
          busy={busy}
          error={error}
          close={() => setModal(null)}
          save={(data) =>
            run(async () => {
              await action({ action: "idea.record", ...data });
              setModal(null);
              setToast("New idea version recorded locally.");
            })
          }
        />
      )}
      {modal?.type === "file" && (
        <Modal
          title="Add a file"
          error={error}
          wide
          close={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = Object.fromEntries(new FormData(e.currentTarget));
              run(async () => {
                await action({
                  action: "artifact.save",
                  ...data,
                  messageId: modal.messageId,
                });
                setModal(null);
                setView("files");
                setToast("File saved with a version receipt.");
              });
            }}
          >
            <label>
              Filename
              <input
                name="name"
                autoFocus
                required
                maxLength={160}
                defaultValue={modal.name || "notes.md"}
              />
            </label>
            <label>
              Content
              <textarea
                className="code-input"
                name="content"
                rows={12}
                maxLength={500000}
                defaultValue={modal.content || ""}
              />
            </label>
            <div className="modal-foot">
              <Badge>
                {modal.messageId ? "AI assisted" : "Human authored"}
              </Badge>
              <Button variant="primary" icon={Save} disabled={busy}>
                Save file
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {modal?.type === "reference" && (
        <Modal
          title="Add a reference"
          error={error}
          close={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = Object.fromEntries(new FormData(e.currentTarget));
              run(async () => {
                await action({ action: "reference.add", ...data });
                setModal(null);
                setToast("Reference saved.");
              });
            }}
          >
            <label>
              Title
              <input name="title" maxLength={200} autoFocus required />
            </label>
            <label>
              Source URL
              <input
                name="url"
                type="url"
                maxLength={2000}
                required
                placeholder="https://"
              />
            </label>
            <label>
              Research notes
              <textarea name="notes" maxLength={20000} rows={5} />
            </label>
            <p className="fine">
              Saved privately. Adding a URL does not fetch or verify its
              contents.
            </p>
            <div className="modal-foot">
              <Button variant="primary" icon={Plus} disabled={busy}>
                Add reference
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Workbench({
  error,
  project,
  providers,
  skills,
  openModels,
  saveProject,
  action,
  run,
  setModal,
  setToast,
  busy,
}) {
  const [threadId, setThreadId] = useState(project.threads[0].id),
    [text, setText] = useState(""),
    [selection, setSelection] = useState("local"),
    [mode, setMode] = useState("plan"),
    [skillId, setSkillId] = useState(""),
    [includeIdea, setIncludeIdea] = useState(false),
    [context, setContext] = useState([]),
    [businessContext, setBusinessContext] = useState([]),
    [history, setHistory] = useState(false),
    [preview, setPreview] = useState(null),
    [approved, setApproved] = useState(false),
    [sending, setSending] = useState(false),
    [contextOpen, setContextOpen] = useState(false);
  const abort = useRef(null),
    bottom = useRef(null);
  const thread =
    project.threads.find((t) => t.id === threadId) || project.threads[0];
  const modelOptions = providers.flatMap((p) =>
    p.models.map((model) => ({
      value: JSON.stringify([p.id, model]),
      provider: p,
      model,
    })),
  );
  const selected = modelOptions.find((option) => option.value === selection);
  const selectedSkill = skills.find((skill) => skill.id === skillId);
  const latestIdea = project.ideas.at(-1);
  const business = project.business || {
    profile: null,
    records: [],
    scenarios: [],
  };
  const businessOptions = [
    ...(business.profile?.versions?.length
      ? [
          {
            id: "profile",
            label: `Profile · ${business.profile.versions.at(-1).name}`,
          },
        ]
      : []),
    ...business.records.map((record) => ({
      id: `record:${record.id}`,
      label: `${businessTypeLabels[record.type]} · ${record.versions.at(-1).title}`,
    })),
    ...business.scenarios.map((scenario) => ({
      id: `scenario:${scenario.id}`,
      label: `Financial scenario · ${scenario.versions.at(-1).title}`,
    })),
  ];
  const chooseSkill = (id) => {
    setSkillId(id);
    const skill = skills.find((s) => s.id === id);
    if (skill) setMode(skill.mode);
  };
  const isNote = selection === "local";
  const [timestampStatus, refreshTimestamp] = useTimestampStatus(project, api);
  const canSubmit =
    isNote || (!!selected?.provider.enabled && !!timestampStatus?.ready);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [thread.messages.length]);
  const submit = () =>
    run(async () => {
      if (!canSubmit)
        throw new Error(
          "A verified timestamp and an available model are required. You can still save a private note.",
        );
      if (isNote) {
        await action({
          action: "note.add",
          threadId: thread.id,
          content: text,
        });
        setText((current) => (current === text ? "" : current));
        setToast("Note saved privately. No model was contacted.");
      } else {
        const r = await api(`/projects/${project.id}/prepare`, {
          revision: project.revision,
          threadId: thread.id,
          provider: selected.provider.id,
          model: selected.model,
          mode,
          skillId,
          ideaId: includeIdea ? latestIdea?.id : undefined,
          artifactIds: context,
          businessIds: businessContext,
          includeHistory: history,
          content: text,
        });
        await saveProject(r.project);
        setPreview(r.preview);
        setApproved(false);
      }
    });
  const send = async () => {
    setSending(true);
    abort.current = new AbortController();
    await run(async () => {
      try {
        const p = await api(
          `/projects/${project.id}/send`,
          {
            revision: project.revision,
            approvalToken: preview.approvalToken,
            digest: preview.digest,
            approved: true,
          },
          abort.current.signal,
        );
        await saveProject(p);
        setText((current) => (current === preview.content ? "" : current));
      } finally {
        setPreview(null);
        await saveProject(await api(`/projects/${project.id}`));
      }
    });
    setSending(false);
  };
  return (
    <div className="workbench">
      <div className="conversation-tools">
        <div className="select-wrap">
          <MessageSquare size={15} />
          <select
            aria-label="Conversation"
            value={thread.id}
            onChange={(e) => setThreadId(e.target.value)}
          >
            {project.threads.map((t) => (
              <option value={t.id} key={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
        <IconButton
          icon={Plus}
          label="New conversation"
          onClick={() =>
            run(async () => {
              const p = await action({
                action: "thread.create",
                title: `Conversation ${project.threads.length + 1}`,
              });
              setThreadId(p.threads.at(-1).id);
            })
          }
        />
      </div>
      <div className="messages">
        {thread.messages.length === 0 && (
          <div className="chat-empty">
            <span className="empty-fingerprint">
              <Fingerprint size={35} />
            </span>
            <h2>
              {latestIdea
                ? "Your idea is recorded. What comes next?"
                : "Where should we begin?"}
            </h2>
            <div className="suggestions">
              {skills.map((skill) => (
                <button
                  key={skill.id}
                  aria-pressed={skillId === skill.id}
                  onClick={() => chooseSkill(skill.id)}
                  disabled={busy || sending}
                >
                  <Sparkles size={18} />
                  <span>{skill.title}</span>
                  <ArrowUpRight size={15} />
                </button>
              ))}
            </div>
          </div>
        )}
        {thread.messages.map((m) => (
          <article className={`message ${m.role}`} key={m.id}>
            <div className="message-avatar">
              {m.role === "assistant" ? <Sparkles size={17} /> : <span>Y</span>}
            </div>
            <div className="message-body">
              <div className="message-byline">
                <strong>{m.role === "assistant" ? m.provider : "You"}</strong>
                <span>
                  {m.local
                    ? "Private note"
                    : m.role === "assistant"
                      ? m.model
                      : "Recorded before disclosure"}
                </span>
                <time>{formatDate(m.created)}</time>
              </div>
              <div className="markdown">
                <Markdown>{m.content}</Markdown>
              </div>
              {m.failed && (
                <p className="error">
                  Provider outcome unresolved. This message will not be included
                  automatically in future history.
                </p>
              )}
              {m.truncated && (
                <p className="notice">
                  Response reached the provider's output limit and may be
                  incomplete.
                </p>
              )}
              <div className="message-actions">
                <IconButton
                  icon={Copy}
                  label="Copy message"
                  onClick={() =>
                    run(async () => {
                      await navigator.clipboard.writeText(m.content);
                      setToast("Message copied.");
                    })
                  }
                />
                {m.role === "assistant" && (
                  <button
                    className="text-button"
                    onClick={() =>
                      setModal({
                        type: "file",
                        name: "assistant-draft.md",
                        content: m.content,
                        messageId: m.id,
                      })
                    }
                  >
                    <FileText size={14} />
                    Save as file
                  </button>
                )}
                <span>
                  <Fingerprint size={12} />
                  Receipt recorded
                </span>
              </div>
            </div>
          </article>
        ))}
        <div ref={bottom} />
      </div>
      <div className="composer-area">
        {project.archived ? (
          <p className="notice">Restore this project to continue working.</p>
        ) : (
          <>
            <TimestampPanel
              project={project}
              status={timestampStatus}
              api={api}
              saveProject={saveProject}
              refresh={refreshTimestamp}
              Button={Button}
              Modal={Modal}
              download={download}
              disabled={busy || sending}
            />
            <div className="model-toolbar">
              <label className="model-select">
                <span>Model</span>
                <select
                  aria-label="AI model"
                  value={selection}
                  disabled={busy || sending}
                  onChange={(e) => {
                    setSelection(e.target.value);
                    setPreview(null);
                    setApproved(false);
                  }}
                >
                  <option value="local">Private note (no AI)</option>
                  {providers.map((p) => (
                    <optgroup key={p.id} label={p.name}>
                      {p.models.length ? (
                        p.models.map((model) => (
                          <option
                            key={model}
                            value={JSON.stringify([p.id, model])}
                            disabled={!p.enabled}
                          >
                            {model}
                            {p.enabled ? "" : ` - ${p.disabledReason}`}
                          </option>
                        ))
                      ) : (
                        <option disabled value={`unconfigured:${p.id}`}>
                          Setup required
                        </option>
                      )}
                    </optgroup>
                  ))}
                  {!isNote && !selected && (
                    <option value={selection} disabled>
                      Selected model is no longer available
                    </option>
                  )}
                </select>
              </label>
              <IconButton
                icon={Settings2}
                label="Model connections"
                onClick={openModels}
                disabled={busy || sending}
              />
            </div>
            <div className="composer">
              {(context.length > 0 || businessContext.length > 0) && (
                <div className="context-chips">
                  {context.map((id) => (
                    <button
                      key={id}
                      onClick={() =>
                        setContext(context.filter((x) => x !== id))
                      }
                    >
                      <FileText size={12} />
                      {project.artifacts.find((a) => a.id === id)?.name}
                      <X size={12} />
                    </button>
                  ))}
                  {businessContext.map((id) => (
                    <button
                      key={id}
                      onClick={() =>
                        setBusinessContext(
                          businessContext.filter((value) => value !== id),
                        )
                      }
                    >
                      <Activity size={12} />
                      {businessOptions.find((item) => item.id === id)?.label}
                      <X size={12} />
                    </button>
                  ))}
                </div>
              )}
              <textarea
                aria-label="Message or private note"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  isNote
                    ? "Write a private note..."
                    : "Ask about your project..."
                }
                maxLength={40000}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    (e.metaKey || e.ctrlKey) &&
                    text.trim() &&
                    !busy &&
                    canSubmit &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
              <div className="composer-controls">
                <div className="composer-options">
                  <IconButton
                    icon={Paperclip}
                    label="Select project context"
                    onClick={() => setContextOpen(!contextOpen)}
                  />
                  <select
                    aria-label="Skill"
                    value={skillId}
                    disabled={busy || sending}
                    onChange={(e) => chooseSkill(e.target.value)}
                  >
                    <option value="">No skill</option>
                    {skills.map((skill) => (
                      <option key={skill.id} value={skill.id}>
                        {skill.title}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Work mode"
                    value={mode}
                    disabled={!!selectedSkill || busy || sending}
                    onChange={(e) => setMode(e.target.value)}
                  >
                    <option value="plan">Plan</option>
                    <option value="build">Build</option>
                    <option value="research">Research</option>
                  </select>
                </div>
                <button
                  className="send-button"
                  title={isNote ? "Save private note" : "Review disclosure"}
                  aria-label={
                    isNote ? "Save private note" : "Review disclosure"
                  }
                  disabled={!text.trim() || busy || !canSubmit}
                  onClick={submit}
                >
                  {busy ? (
                    <RefreshCw className="spinning" size={18} />
                  ) : (
                    <ArrowUp size={19} />
                  )}
                </button>
              </div>
            </div>
            {selectedSkill && (
              <details className="skill-instructions">
                <summary>
                  {selectedSkill.title} · Built-in skill v
                  {selectedSkill.version}
                </summary>
                <p>{selectedSkill.instructions}</p>
                <p className="fine">
                  {isNote
                    ? "Private note selected. No skill or model will run."
                    : "Prompt instructions only. No code execution or automatic changes."}
                </p>
              </details>
            )}
            {latestIdea && (
              <label className="check-label idea-context">
                <input
                  type="checkbox"
                  checked={includeIdea}
                  disabled={isNote || busy || sending}
                  onChange={(e) => setIncludeIdea(e.target.checked)}
                />
                Include recorded idea (version {project.ideas.length}) in this
                AI request
              </label>
            )}
            {contextOpen && (
              <div className="context-picker">
                <strong>Context for the next request</strong>
                {project.artifacts.length ? (
                  project.artifacts.map((a) => (
                    <label className="check-label" key={a.id}>
                      <input
                        type="checkbox"
                        checked={context.includes(a.id)}
                        onChange={(e) =>
                          setContext(
                            e.target.checked
                              ? [...context, a.id]
                              : context.filter((id) => id !== a.id),
                          )
                        }
                      />
                      <FileText size={14} />
                      {a.name}
                    </label>
                  ))
                ) : (
                  <p className="fine">No files in this project.</p>
                )}
                <strong className="context-subheading">Business records</strong>
                {businessOptions.length ? (
                  businessOptions.map((item) => (
                    <label className="check-label" key={item.id}>
                      <input
                        type="checkbox"
                        checked={businessContext.includes(item.id)}
                        onChange={(e) =>
                          setBusinessContext(
                            e.target.checked
                              ? [...businessContext, item.id]
                              : businessContext.filter((id) => id !== item.id),
                          )
                        }
                      />
                      <Activity size={14} />
                      {item.label}
                    </label>
                  ))
                ) : (
                  <p className="fine">No business records in this project.</p>
                )}
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={history}
                    onChange={(e) => setHistory(e.target.checked)}
                  />
                  Include up to 12 earlier messages
                </label>
              </div>
            )}
            <div className="composer-foot">
              <LockKeyhole size={12} />
              <span>
                {isNote
                  ? "Saved locally. No AI request."
                  : canSubmit
                    ? `${selected.provider.name} - external processing`
                    : "Selected model unavailable"}
              </span>
              <span className="desktop-only">
                {context.length} files · {businessContext.length} business
                records
              </span>
            </div>
          </>
        )}
      </div>
      {preview && (
        <Modal
          title="Review disclosure"
          error={error}
          wide
          close={() => {
            if (!sending) setPreview(null);
          }}
        >
          <div className="disclosure-summary">
            <div>
              <span className="eyebrow">RECIPIENT</span>
              <strong>{preview.providerName}</strong>
              <small>{preview.model}</small>
              <small className="recipient-endpoint">{preview.endpoint}</small>
            </div>
            <div>
              <span className="eyebrow">CONTEXT</span>
              <strong>
                {preview.context.length} files ·{" "}
                {preview.businessContext?.length || 0} business records ·{" "}
                {preview.historyMessages} messages
              </strong>
              <small>
                {preview.idea
                  ? `Idea: ${preview.idea.title}`
                  : "No idea record included"}
              </small>
              <small>
                {preview.skill
                  ? `Skill: ${preview.skill.title} v${preview.skill.version}`
                  : "No skill selected"}
              </small>
              <small>Plus your message and system instructions</small>
            </div>
          </div>
          <p className="notice">{preview.retention}</p>
          {preview.spendQuote ? (
            <p className="notice">
              Up to {"$"}
              {preview.spendQuote.maximumReservedUsd} will be reserved before
              this request. The reconciled amount is an application estimate,
              not a provider invoice. Catalog:{" "}
              {preview.spendQuote.catalogVersion}.
            </p>
          ) : (
            <p className="fine">
              Application dollar guard is off; the daily request-attempt limit
              still applies.
            </p>
          )}
          <details>
            <summary>Exact request payload</summary>
            <pre className="request-preview">
              {JSON.stringify(preview.request, null, 2)}
            </pre>
          </details>
          <p className="fingerprint">SHA-256 {preview.digest}</p>
          <label className="check-label approval">
            <input
              type="checkbox"
              checked={approved}
              onChange={(e) => setApproved(e.target.checked)}
              disabled={sending}
            />
            I approve sending this request to {preview.providerName}.
          </label>
          <div className="modal-foot">
            {sending ? (
              <Button icon={Square} onClick={() => abort.current?.abort()}>
                Stop waiting
              </Button>
            ) : (
              <Button onClick={() => setPreview(null)}>Keep private</Button>
            )}
            <Button
              icon={ArrowUpRight}
              variant="primary"
              disabled={!approved || sending}
              onClick={send}
            >
              {sending ? "Waiting for model..." : "Approve and send"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function EvidenceMeaning() {
  return (
    <details className="evidence-meaning">
      <summary>What the evidence does and does not establish</summary>
      <ol className="evidence-path">
        <li>Private description</li>
        <li>Saved package</li>
        <li>Fingerprint</li>
        <li>Timestamp proof</li>
      </ol>
      <p>
        <strong>Evidence of existence:</strong> a verified independent timestamp
        links an exact saved package to a time by which it existed. A local
        receipt or pending submission is not that verification.
      </p>
      <p>
        <strong>Evaluation of the idea:</strong> clarity, originality,
        ownership, patentability, and legal defensibility are separate
        questions. Neither a timestamp nor an AI review establishes them.
      </p>
      <p>
        The abstract can stay private; it does not need to be minted publicly.
        Keep the exact private package and proof together. A fingerprint alone
        cannot reconstruct the idea. A vague description remains vague evidence.
      </p>
    </details>
  );
}

function IdeaComposer({ project, busy, error, close, save }) {
  const latest = project?.ideas.at(-1);
  const [title, setTitle] = useState(latest?.title || "");
  const [content, setContent] = useState(latest?.content || "");
  const [origin, setOrigin] = useState(
    latest?.receipt.manifest.origin || "human",
  );
  const [connection, setConnection] = useState(null);
  const [review, setReview] = useState(null);
  const [reviewError, setReviewError] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [consent, setConsent] = useState(false);
  const request = useRef(null);
  useEffect(() => {
    if (!project) return;
    const controller = new AbortController();
    api("/local-review", undefined, controller.signal)
      .then(setConnection)
      .catch(() => {
        if (!controller.signal.aborted)
          setConnection({
            configured: false,
            message:
              "Local model configuration could not be checked. The private checklist remains available.",
          });
      });
    return () => {
      controller.abort();
      request.current?.abort();
    };
  }, []);
  const edit = (setter, value) => {
    request.current?.abort();
    request.current = null;
    setReviewing(false);
    setReview(null);
    setReviewError("");
    setConsent(false);
    setter(value);
  };
  const check = async (mode) => {
    const controller = new AbortController();
    request.current = controller;
    setReviewing(true);
    setReview(null);
    setReviewError("");
    try {
      const result = await api(
        `/projects/${project.id}/description-review`,
        { title, content, revision: project.revision, mode, consent },
        controller.signal,
      );
      if (request.current === controller) setReview(result);
    } catch (e) {
      if (!controller.signal.aborted && request.current === controller)
        setReviewError(e.message);
    } finally {
      if (request.current === controller) {
        request.current = null;
        setReviewing(false);
      }
    }
  };
  const labels = {
    "mention-found": "Mention found; check detail",
    "check-needed": "Check needed",
    addressed: "Model found detail; confirm it",
    "needs-detail": "More detail suggested",
    "not-found": "Not found by model",
  };
  return (
    <Modal
      title={project ? "Record an idea" : "Start with your idea"}
      error={error}
      wide
      close={close}
    >
      {!project && (
        <p className="capture-intro">
          Preserve your words before the first AI request. This record becomes a
          private project for the work that follows.
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save({ title, content, origin });
        }}
      >
        <label>
          Title
          <input
            autoFocus
            required
            maxLength={project ? 160 : 120}
            value={title}
            onChange={(e) => edit(setTitle, e.target.value)}
          />
        </label>
        <label>
          Your concept
          <textarea
            rows={project ? 10 : 7}
            maxLength={100000}
            required
            value={content}
            onChange={(e) => edit(setContent, e.target.value)}
            placeholder="Describe the problem, your approach, and what makes it different."
          />
        </label>
        <label>
          Contribution
          <select
            aria-label="Contribution"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
          >
            <option value="human">Human authored</option>
            <option value="ai-assisted">Human + AI assisted</option>
          </select>
        </label>
        <EvidenceMeaning />
        {project && (
          <section
            className="description-review"
            aria-label="Description review"
          >
            <h3>Description review</h3>
            <p className="fine">
              Completeness and supporting detail, not a legal verdict. Your
              words remain unchanged; review is optional.
            </p>
            <div className="review-actions">
              <Button
                type="button"
                icon={CheckCheck}
                disabled={reviewing || !title.trim() || !content.trim()}
                onClick={() => check("checklist")}
              >
                Check description
              </Button>
              <Button
                type="button"
                icon={Sparkles}
                disabled={
                  reviewing ||
                  !connection?.configured ||
                  !consent ||
                  !title.trim() ||
                  !content.trim()
                }
                onClick={() => check("model")}
              >
                Review with local model
              </Button>
            </div>
            <p className="fine">
              {connection?.message || "Checking local model configuration..."}{" "}
              No cloud fallback.
            </p>
            {connection?.configured && (
              <label className="local-review-consent">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                I agree to send this draft to {connection.model} running on this
                Mac.
              </label>
            )}
            {reviewing && <p role="status">Reviewing this draft...</p>}
            {reviewError && (
              <p className="error" role="alert">
                {reviewError}
              </p>
            )}
            {review && (
              <div aria-live="polite">
                <p className="fine">
                  {review.method === "local-rules-not-ai"
                    ? "Local checklist, not AI. Word matches are prompts for your review, not a completeness score."
                    : "Local AI suggestions, not verified findings. Confirm each excerpt and judgment."}
                </p>
                <ul className="review-findings">
                  {review.checks.map((c) => (
                    <li key={c.id}>
                      <div>
                        <strong>{c.title}</strong>
                        <Badge>{labels[c.status]}</Badge>
                      </div>
                      <p>{c.question}</p>
                      {c.quote && <blockquote>{c.quote}</blockquote>}
                    </li>
                  ))}
                </ul>
                <p className="fine">
                  Not automatically saved or timestamped. Editing the draft
                  clears this review. Independent research and qualified
                  professional review are still separate.
                </p>
                <Button
                  type="button"
                  icon={Download}
                  onClick={() =>
                    download(`description-review-${project.id}.json`, review)
                  }
                >
                  Download review
                </Button>
              </div>
            )}
          </section>
        )}
        <p className="fine">
          Recording creates a new version with a local integrity receipt.
          Earlier records stay unchanged. AI-written additions should be labeled
          Human + AI assisted.
        </p>
        <div className="modal-foot">
          <Button type="button" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={Fingerprint}
            disabled={busy || reviewing}
          >
            {project ? "Record version" : "Preserve & start project"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Ideas({ project, record }) {
  return (
    <section className="content-section">
      <div className="section-title">
        <div>
          <h2>Idea record</h2>
          <p>Original thinking, with every version preserved.</p>
        </div>
        <Button
          icon={Plus}
          variant="primary"
          onClick={record}
          disabled={project.archived}
        >
          {project.ideas.length ? "New version" : "Record an idea"}
        </Button>
      </div>
      {project.ideas.length ? (
        [...project.ideas].reverse().map((idea, i) => (
          <article className="idea-entry" key={idea.id}>
            <div className="record-meta">
              <Badge>Version {project.ideas.length - i}</Badge>
              <Badge tone="green">Recorded locally</Badge>
              <span>
                {idea.receipt.manifest.origin === "human"
                  ? "Human authored"
                  : "AI assisted"}
              </span>
              <time>{formatDate(idea.receipt.manifest.createdAt)}</time>
            </div>
            <h3>{idea.title}</h3>
            <div className="markdown">
              <Markdown>{idea.content}</Markdown>
            </div>
            <div className="fingerprint">
              <Fingerprint size={14} />
              {short(idea.receipt.commitment)}
              <span>Independent receipts tracked separately</span>
            </div>
          </article>
        ))
      ) : (
        <Empty
          icon={Fingerprint}
          title="Your idea comes first."
          button="Record an idea"
          onClick={record}
        />
      )}
    </section>
  );
}

const businessTypeLabels = {
  assumption: "Assumption",
  experiment: "Experiment / result",
  metric: "Metric",
  decision: "Decision",
  action: "Action",
  milestone: "Milestone",
};
const businessClassificationLabels = {
  "supplied-fact": "Supplied fact",
  estimate: "Estimate",
  "unverified-assumption": "Unverified assumption",
  "observed-result": "Observed result",
  decision: "Decision",
  "planned-action": "Planned action",
};
const businessStatuses = [
  "open",
  "planned",
  "in-progress",
  "testing",
  "supported",
  "weakened",
  "invalidated",
  "completed",
  "blocked",
  "stopped",
  "decided",
];
const formatMoney = (currency, value) => `${currency} ${value}`;

function BusinessProfileEditor({ current, busy, close, save }) {
  return (
    <Modal title="Business profile" close={close} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save({
            action: "business.profile.save",
            ...Object.fromEntries(new FormData(e.currentTarget)),
          });
        }}
      >
        <div className="business-form-grid">
          <label>
            Business or initiative name
            <input
              name="name"
              defaultValue={current?.name || ""}
              maxLength={160}
              required
              autoFocus
            />
          </label>
          <label>
            Stage
            <select name="stage" defaultValue={current?.stage || "idea"}>
              <option value="idea">Idea</option>
              <option value="discovery">Discovery</option>
              <option value="validation">Validation</option>
              <option value="building">Building</option>
              <option value="operating">Operating</option>
            </select>
          </label>
        </div>
        <label>
          What it is
          <textarea
            name="summary"
            rows={3}
            maxLength={4000}
            defaultValue={current?.summary || ""}
            placeholder="Describe the proposed value without presenting assumptions as facts."
          />
        </label>
        <label>
          Target customers
          <textarea
            name="targetCustomers"
            rows={3}
            maxLength={4000}
            defaultValue={current?.targetCustomers || ""}
            placeholder="Who may benefit, buy, use or influence the decision?"
          />
        </label>
        <div className="business-form-grid three">
          <label>
            Known facts
            <textarea
              name="knownFacts"
              rows={5}
              maxLength={8000}
              defaultValue={current?.knownFacts || ""}
              placeholder="Only facts you can support."
            />
          </label>
          <label>
            Unverified assumptions
            <textarea
              name="assumptions"
              rows={5}
              maxLength={8000}
              defaultValue={current?.assumptions || ""}
              placeholder="Beliefs that still need evidence."
            />
          </label>
          <label>
            Constraints
            <textarea
              name="constraints"
              rows={5}
              maxLength={8000}
              defaultValue={current?.constraints || ""}
              placeholder="Budget, time, policy or capability boundaries."
            />
          </label>
        </div>
        <label>
          Contribution
          <select
            name="origin"
            defaultValue={current?.receipt?.manifest?.origin || "human"}
          >
            <option value="human">Human authored</option>
            <option value="ai-assisted">Human + AI assisted</option>
          </select>
        </label>
        <p className="fine">
          Saving creates a new profile version. Existing versions remain in the
          evidence history; nothing is sent to a model automatically.
        </p>
        <div className="modal-foot">
          <Button type="button" onClick={close}>
            Cancel
          </Button>
          <Button icon={Save} variant="primary" disabled={busy}>
            Save profile version
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function BusinessRecordEditor({ record, busy, close, save }) {
  const current = record?.versions.at(-1);
  return (
    <Modal
      title={record ? "Edit business record" : "Add business record"}
      close={close}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save({
            action: "business.record.save",
            id: record?.id,
            ...Object.fromEntries(new FormData(e.currentTarget)),
          });
        }}
      >
        <div className="business-form-grid three">
          <label>
            Record type
            <select
              name="type"
              defaultValue={current?.type || "assumption"}
              disabled={Boolean(record)}
            >
              {Object.entries(businessTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {record && <input type="hidden" name="type" value={record.type} />}
          </label>
          <label>
            Evidence class
            <select
              name="classification"
              defaultValue={current?.classification || "unverified-assumption"}
            >
              {Object.entries(businessClassificationLabels).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            Status
            <select name="status" defaultValue={current?.status || "open"}>
              {businessStatuses.map((status) => (
                <option key={status} value={status}>
                  {status.replaceAll("-", " ")}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Title
          <input
            name="title"
            defaultValue={current?.title || ""}
            maxLength={200}
            required
            autoFocus
          />
        </label>
        <label>
          Statement
          <textarea
            name="statement"
            rows={4}
            maxLength={12000}
            defaultValue={current?.statement || ""}
            required
            placeholder="State the assumption, hypothesis, metric, decision, action or milestone precisely."
          />
        </label>
        <div className="business-form-grid">
          <label>
            Supporting evidence
            <textarea
              name="evidence"
              rows={4}
              maxLength={12000}
              defaultValue={current?.evidence || ""}
              placeholder="Describe the source or observation; add links separately in References."
            />
          </label>
          <label>
            Observed outcome
            <textarea
              name="outcome"
              rows={4}
              maxLength={12000}
              defaultValue={current?.outcome || ""}
              placeholder="Leave blank until an outcome has actually been observed."
            />
          </label>
        </div>
        <div className="business-form-grid three">
          <label>
            Measure or threshold
            <input
              name="measure"
              defaultValue={current?.measure || ""}
              maxLength={2000}
            />
          </label>
          <label>
            Owner
            <input
              name="owner"
              defaultValue={current?.owner || ""}
              maxLength={200}
            />
          </label>
          <label>
            Due date
            <input
              name="dueDate"
              type="date"
              defaultValue={current?.dueDate || ""}
            />
          </label>
        </div>
        <label>
          Contribution
          <select
            name="origin"
            defaultValue={current?.receipt?.manifest?.origin || "human"}
          >
            <option value="human">Human authored</option>
            <option value="ai-assisted">Human + AI assisted</option>
          </select>
        </label>
        <p className="fine">
          Classification is explicit because estimates and assumptions must not
          look like verified facts. Editing adds a new version.
        </p>
        <div className="modal-foot">
          <Button type="button" onClick={close}>
            Cancel
          </Button>
          <Button icon={Save} variant="primary" disabled={busy}>
            Save record version
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function FinancialScenarioEditor({ scenario, busy, close, save }) {
  const current = scenario?.versions.at(-1);
  return (
    <Modal
      title={scenario ? "Edit financial scenario" : "Add financial scenario"}
      close={close}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save({
            action: "business.scenario.save",
            id: scenario?.id,
            ...Object.fromEntries(new FormData(e.currentTarget)),
          });
        }}
      >
        <div className="business-form-grid three">
          <label>
            Scenario name
            <input
              name="title"
              defaultValue={current?.title || "Base case"}
              maxLength={200}
              required
              autoFocus
            />
          </label>
          <label>
            Input classification
            <select
              name="classification"
              defaultValue={current?.classification || "estimate"}
            >
              <option value="supplied-fact">Supplied facts</option>
              <option value="estimate">Estimates</option>
              <option value="unverified-assumption">
                Unverified assumptions
              </option>
            </select>
          </label>
          <label>
            Currency
            <input
              name="currency"
              defaultValue={current?.currency || "USD"}
              pattern="[A-Za-z]{3}"
              maxLength={3}
              required
            />
          </label>
        </div>
        <div className="business-form-grid four">
          <label>
            Price per unit
            <input
              name="pricePerUnit"
              inputMode="decimal"
              defaultValue={current?.inputs?.pricePerUnit || "0.00"}
              pattern="[0-9]+(?:\\.[0-9]{1,2})?"
              required
            />
          </label>
          <label>
            Units per month
            <input
              name="unitsPerMonth"
              inputMode="numeric"
              defaultValue={current?.inputs?.unitsPerMonth || "0"}
              pattern="[0-9]+"
              required
            />
          </label>
          <label>
            Variable cost / unit
            <input
              name="variableCostPerUnit"
              inputMode="decimal"
              defaultValue={current?.inputs?.variableCostPerUnit || "0.00"}
              pattern="[0-9]+(?:\\.[0-9]{1,2})?"
              required
            />
          </label>
          <label>
            Fixed monthly cost
            <input
              name="fixedMonthlyCost"
              inputMode="decimal"
              defaultValue={current?.inputs?.fixedMonthlyCost || "0.00"}
              pattern="[0-9]+(?:\\.[0-9]{1,2})?"
              required
            />
          </label>
        </div>
        <label>
          Assumption notes
          <textarea
            name="notes"
            rows={4}
            maxLength={8000}
            defaultValue={current?.notes || ""}
            placeholder="Explain where each input came from and what still needs validation."
          />
        </label>
        <label>
          Contribution
          <select
            name="origin"
            defaultValue={current?.receipt?.manifest?.origin || "human"}
          >
            <option value="human">Human authored</option>
            <option value="ai-assisted">Human + AI assisted</option>
          </select>
        </label>
        <p className="fine">
          WHOAYO performs exact server-side decimal arithmetic from these
          inputs. It does not invent prices, demand, costs or forecasts.
        </p>
        <div className="modal-foot">
          <Button type="button" onClick={close}>
            Cancel
          </Button>
          <Button icon={Save} variant="primary" disabled={busy}>
            Calculate and save version
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Business({ project, action, run, busy, setToast }) {
  const [editor, setEditor] = useState(null);
  const business = project.business || {
    profile: null,
    records: [],
    scenarios: [],
  };
  const profile = business.profile?.versions.at(-1);
  const save = (input, message) =>
    run(async () => {
      await action(input);
      setEditor(null);
      setToast(message);
    });
  return (
    <section className="content-section business-workspace">
      <div className="section-title business-heading">
        <div>
          <h2>Business development</h2>
          <p>
            Facts, assumptions, experiments, decisions and execution
            records—kept distinct and versioned.
          </p>
        </div>
        <div className="business-actions">
          <Button
            icon={Plus}
            onClick={() => setEditor({ kind: "record" })}
            disabled={project.archived}
          >
            Add record
          </Button>
          <Button
            icon={Plus}
            onClick={() => setEditor({ kind: "scenario" })}
            disabled={project.archived}
          >
            Add scenario
          </Button>
        </div>
      </div>

      <article className="business-profile-card">
        <div className="business-card-heading">
          <div>
            <span className="eyebrow">PROJECT-SCOPED CONTEXT</span>
            <h3>{profile?.name || "Add a business profile"}</h3>
          </div>
          <Button
            icon={Settings2}
            onClick={() => setEditor({ kind: "profile" })}
            disabled={project.archived}
          >
            {profile ? "New profile version" : "Create profile"}
          </Button>
        </div>
        {profile ? (
          <>
            <div className="record-meta">
              <Badge>{profile.stage}</Badge>
              <Badge tone="green">
                Version {business.profile.versions.length}
              </Badge>
              <span>
                {profile.receipt.manifest.origin === "human"
                  ? "Human authored"
                  : "AI assisted"}
              </span>
              <time>{formatDate(profile.receipt.manifest.createdAt)}</time>
            </div>
            <p className="business-summary">{profile.summary}</p>
            <div className="business-profile-grid">
              <div>
                <strong>Target customers</strong>
                <p>{profile.targetCustomers || "Not recorded"}</p>
              </div>
              <div>
                <strong>Known facts</strong>
                <p>{profile.knownFacts || "None recorded"}</p>
              </div>
              <div>
                <strong>Unverified assumptions</strong>
                <p>{profile.assumptions || "None recorded"}</p>
              </div>
              <div>
                <strong>Constraints</strong>
                <p>{profile.constraints || "None recorded"}</p>
              </div>
            </div>
          </>
        ) : (
          <p className="fine">
            Skills can use this profile only when you explicitly select it as
            context in the Workbench.
          </p>
        )}
      </article>

      <div className="business-section-title">
        <div>
          <h3>Evidence and execution records</h3>
          <p>Every edit creates a new attributed version.</p>
        </div>
      </div>
      {business.records.length ? (
        <div className="business-record-grid">
          {[...business.records].reverse().map((record) => {
            const current = record.versions.at(-1);
            return (
              <article className="business-record-card" key={record.id}>
                <div className="business-card-heading">
                  <div>
                    <Badge>{businessTypeLabels[record.type]}</Badge>
                    <h3>{current.title}</h3>
                  </div>
                  <IconButton
                    icon={Settings2}
                    label={`Edit ${current.title}`}
                    onClick={() => setEditor({ kind: "record", record })}
                    disabled={project.archived}
                  />
                </div>
                <div className="record-meta">
                  <Badge
                    tone={
                      current.classification === "supplied-fact" ||
                      current.classification === "observed-result"
                        ? "green"
                        : "amber"
                    }
                  >
                    {businessClassificationLabels[current.classification]}
                  </Badge>
                  <span>{current.status.replaceAll("-", " ")}</span>
                  <span>v{record.versions.length}</span>
                </div>
                <p className="business-statement">{current.statement}</p>
                {current.measure && (
                  <p className="fine">
                    <strong>Measure:</strong> {current.measure}
                  </p>
                )}
                {current.evidence && (
                  <details>
                    <summary>Supporting evidence</summary>
                    <p>{current.evidence}</p>
                  </details>
                )}
                {current.outcome && (
                  <div className="business-outcome">
                    <strong>Observed outcome</strong>
                    <p>{current.outcome}</p>
                  </div>
                )}
                {(current.owner || current.dueDate) && (
                  <p className="fine">
                    {current.owner ? `Owner: ${current.owner}` : "No owner"}
                    {current.dueDate ? ` · Due ${current.dueDate}` : ""}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          icon={Activity}
          title="Record the assumptions and actions behind the idea."
          button="Add a business record"
          onClick={() => setEditor({ kind: "record" })}
        />
      )}

      <div className="business-section-title">
        <div>
          <h3>Financial scenarios</h3>
          <p>Deterministic arithmetic from explicitly classified inputs.</p>
        </div>
      </div>
      {business.scenarios.length ? (
        <div className="business-record-grid scenario-grid">
          {[...business.scenarios].reverse().map((scenario) => {
            const current = scenario.versions.at(-1);
            return (
              <article className="business-record-card" key={scenario.id}>
                <div className="business-card-heading">
                  <div>
                    <Badge tone="amber">
                      {businessClassificationLabels[current.classification]}
                    </Badge>
                    <h3>{current.title}</h3>
                  </div>
                  <IconButton
                    icon={Settings2}
                    label={`Edit ${current.title}`}
                    onClick={() => setEditor({ kind: "scenario", scenario })}
                    disabled={project.archived}
                  />
                </div>
                <dl className="scenario-results">
                  <div>
                    <dt>Monthly revenue</dt>
                    <dd>
                      {formatMoney(
                        current.currency,
                        current.outputs.monthlyRevenue,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Contribution</dt>
                    <dd>
                      {formatMoney(
                        current.currency,
                        current.outputs.monthlyContribution,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Operating result</dt>
                    <dd>
                      {formatMoney(
                        current.currency,
                        current.outputs.monthlyOperatingResult,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Break-even units</dt>
                    <dd>{current.outputs.breakEvenUnits ?? "Unavailable"}</dd>
                  </div>
                </dl>
                <p className="fine">
                  Contribution margin:{" "}
                  {current.outputs.contributionMarginPercent ?? "—"}% · v
                  {scenario.versions.length}
                </p>
                {current.notes && (
                  <p className="business-statement">{current.notes}</p>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="fine business-empty-copy">
          No scenarios yet. WHOAYO will calculate only from values you enter.
        </p>
      )}

      {editor?.kind === "profile" && (
        <BusinessProfileEditor
          current={profile}
          busy={busy}
          close={() => setEditor(null)}
          save={(input) => save(input, "Business profile version saved.")}
        />
      )}
      {editor?.kind === "record" && (
        <BusinessRecordEditor
          record={editor.record}
          busy={busy}
          close={() => setEditor(null)}
          save={(input) => save(input, "Business record version saved.")}
        />
      )}
      {editor?.kind === "scenario" && (
        <FinancialScenarioEditor
          scenario={editor.scenario}
          busy={busy}
          close={() => setEditor(null)}
          save={(input) =>
            save(input, "Financial scenario calculated and saved.")
          }
        />
      )}
    </section>
  );
}

function Empty({ icon: Icon, title, button, onClick }) {
  return (
    <div className="empty-panel">
      <Icon size={32} />
      <h3>{title}</h3>
      {button && (
        <Button icon={Plus} onClick={onClick}>
          {button}
        </Button>
      )}
    </div>
  );
}
function Files({ project, action, run, busy, setModal, setToast }) {
  const [selected, setSelected] = useState(project.artifacts[0]?.id || ""),
    [content, setContent] = useState(""),
    [name, setName] = useState(""),
    [version, setVersion] = useState(-1),
    [preview, setPreview] = useState(false);
  const input = useRef(null);
  const file = project.artifacts.find((a) => a.id === selected);
  useEffect(() => {
    if (file) {
      const v = version < 0 ? file.versions.at(-1) : file.versions[version];
      setContent(v?.content || "");
      setName(file.name);
    }
  }, [selected, project.revision, version]);
  const dirty =
    file && (content !== file.versions.at(-1).content || name !== file.name);
  const choose = (id) => {
    if (dirty && !confirm("Discard unsaved file edits?")) return;
    setSelected(id);
    setVersion(-1);
  };
  const upload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    await run(async () => {
      if (f.size > 500000)
        throw new Error("Text files must be smaller than 500 KB.");
      const text = await f.text();
      if (text.includes("\0"))
        throw new Error(
          "This release supports text and source files. Binary uploads are not connected.",
        );
      const p = await action({
        action: "artifact.save",
        name: f.name,
        content: text,
      });
      setSelected(p.artifacts.at(-1).id);
      setVersion(-1);
      setToast("File imported and recorded.");
    });
    e.target.value = "";
  };
  return (
    <section className="files-workspace">
      <div className="files-list">
        <div className="rail-heading">
          <h3>Files</h3>
          <IconButton
            icon={Plus}
            label="New file"
            onClick={() => setModal({ type: "file" })}
          />
        </div>
        {project.artifacts.map((a) => (
          <button
            className={selected === a.id ? "active" : ""}
            key={a.id}
            onClick={() => choose(a.id)}
          >
            <FileCode2 size={16} />
            <span>{a.name}</span>
            <small>v{a.versions.length}</small>
          </button>
        ))}
        <button className="file-import" onClick={() => input.current.click()}>
          <Paperclip size={15} />
          Import text file
        </button>
        <input type="file" ref={input} onChange={upload} hidden />
      </div>
      {file ? (
        <div className="file-editor">
          <div className="editor-toolbar">
            <input
              aria-label="Filename"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={160}
            />
            <select
              aria-label="File version"
              value={version}
              onChange={(e) => {
                if (!dirty || confirm("Discard unsaved file edits?"))
                  setVersion(Number(e.target.value));
              }}
            >
              <option value={-1}>Latest · v{file.versions.length}</option>
              {file.versions.slice(0, -1).map((v, i) => (
                <option key={v.id} value={i}>
                  Version {i + 1}
                </option>
              ))}
            </select>
            <IconButton
              icon={preview ? Code2 : Eye}
              label={preview ? "Edit source" : "Preview Markdown"}
              onClick={() => setPreview(!preview)}
            />
            <IconButton
              icon={Download}
              label="Download file"
              onClick={() => download(name, content, "text/plain")}
            />
            <IconButton
              icon={Save}
              label="Save new file version"
              disabled={!dirty || busy || version >= 0 || project.archived}
              onClick={() =>
                run(async () => {
                  await action({
                    action: "artifact.save",
                    id: file.id,
                    name,
                    content,
                  });
                  setToast("New file version saved.");
                })
              }
            />
          </div>
          {preview ? (
            <div className="file-preview markdown">
              <Markdown>{content}</Markdown>
            </div>
          ) : (
            <textarea
              className="code-editor"
              aria-label="File content"
              spellCheck={false}
              value={content}
              readOnly={version >= 0 || project.archived}
              onChange={(e) => setContent(e.target.value)}
              maxLength={500000}
            />
          )}
          <div className="editor-foot">
            <span>
              {dirty
                ? "Unsaved changes"
                : version >= 0
                  ? "Historical version · Read only"
                  : "Saved locally"}
            </span>
            <span>
              {content.split("\n").length} lines ·{" "}
              {content.length.toLocaleString()} characters
            </span>
          </div>
        </div>
      ) : (
        <Empty
          icon={FileCode2}
          title="Keep the work with the idea."
          button="Create a file"
          onClick={() => setModal({ type: "file" })}
        />
      )}
    </section>
  );
}
function References({ project, add }) {
  return (
    <section className="content-section">
      <div className="section-title">
        <div>
          <h2>Reference library</h2>
          <p>Sources and research notes for this project.</p>
        </div>
        <Button
          icon={Plus}
          variant="primary"
          disabled={project.archived}
          onClick={add}
        >
          Add reference
        </Button>
      </div>
      {project.references.length ? (
        project.references.map((r) => (
          <article className="reference-entry" key={r.id}>
            <div className="reference-icon">
              <BookOpen size={21} />
            </div>
            <div>
              <a href={r.url} target="_blank" rel="noopener noreferrer">
                <h3>
                  {r.title}
                  <ArrowUpRight size={16} />
                </h3>
              </a>
              <p className="source-url">{r.url}</p>
              <p className="reference-notes">{r.notes}</p>
              <Badge>User supplied · Not verified</Badge>
            </div>
          </article>
        ))
      ) : (
        <Empty
          icon={BookOpen}
          title="Every good question has a starting point."
          button="Add a reference"
          onClick={add}
        />
      )}
    </section>
  );
}
function Evidence({
  project,
  run,
  exportProject,
  setToast,
  saveProject,
  busy,
}) {
  const [timestampStatus, refreshTimestamp] = useTimestampStatus(project, api);
  const [events, setEvents] = useState([]),
    [proof, setProof] = useState(null),
    [snapshots, setSnapshots] = useState([]),
    [timestamp, setTimestamp] = useState(null),
    [preserving, setPreserving] = useState(false);
  useEffect(() => {
    let live = true;
    setProof(null);
    setSnapshots([]);
    setTimestamp(null);
    run(async () => {
      const e = await api(`/projects/${project.id}/events`);
      const p = await api(`/projects/${project.id}/verify`);
      const s = await api(`/projects/${project.id}/snapshots`);
      if (live) {
        setEvents(e);
        setProof(p);
        setSnapshots(s);
      }
    });
    return () => {
      live = false;
    };
  }, [project.id, project.revision]);
  const preserve = () =>
    run(async () => {
      setPreserving(true);
      try {
        await api(`/projects/${project.id}/preserve`, {
          revision: project.revision,
        });
        setSnapshots(await api(`/projects/${project.id}/snapshots`));
        setToast("Current revision preserved locally.");
      } finally {
        setPreserving(false);
      }
    });
  const bitcoinStatus = snapshots[0]?.timestampStatus;
  return (
    <section className="content-section">
      <div className="section-title">
        <div>
          <h2>Evidence trail</h2>
          <p>What was created, what was shared, and what changed.</p>
        </div>
        <Button icon={Download} onClick={exportProject}>
          Export package
        </Button>
      </div>
      <div className="evidence-stats">
        <div>
          <Fingerprint size={19} />
          <strong>{proof?.records ?? "—"}</strong>
          <span>Content receipts</span>
        </div>
        <div>
          <History size={19} />
          <strong>{events.length}</strong>
          <span>Recorded events</span>
        </div>
        <div>
          <ArrowUpRight size={19} />
          <strong>{project.disclosures.length}</strong>
          <span>Provider attempts</span>
        </div>
        <div>
          <LockKeyhole size={19} />
          <strong>
            {bitcoinStatus === "bitcoin-proof-complete"
              ? "Complete"
              : bitcoinStatus === "pending-bitcoin-confirmation"
                ? "Pending"
                : "Local"}
          </strong>
          <span>Bitcoin status</span>
        </div>
      </div>
      <div className="integrity-line">
        <CheckCheck size={18} />
        <span>
          {proof
            ? `Local chain verified · ${formatDate(proof.checkedAt)}`
            : "Verification pending"}
        </span>
        <Button
          icon={RefreshCw}
          onClick={() =>
            run(async () => {
              setProof(null);
              setProof(await api(`/projects/${project.id}/verify`));
              setSnapshots(await api(`/projects/${project.id}/snapshots`));
              setToast("Local integrity verification passed.");
            })
          }
        >
          Verify
        </Button>
      </div>
      <p className="fine">
        Local receipts detect content changes. They do not establish independent
        time, verified identity, or ownership.
      </p>
      <EvidenceMeaning />
      <TimestampPanel
        project={project}
        status={timestampStatus}
        api={api}
        saveProject={saveProject}
        refresh={refreshTimestamp}
        Button={Button}
        Modal={Modal}
        download={download}
        disabled={busy}
      />
      <div className="preservation-section">
        <div className="section-title">
          <div>
            <h3>Preserved packages</h3>
            <p>Encrypted on this Mac. Separate-device backup not configured.</p>
          </div>
          <Button
            icon={Save}
            disabled={preserving || snapshots[0]?.revision === project.revision}
            onClick={preserve}
          >
            {preserving
              ? "Preserving..."
              : snapshots[0]?.revision === project.revision
                ? "Current revision saved"
                : "Preserve current revision"}
          </Button>
        </div>
        <p className="fine">
          Automatic snapshots: ideas, files, notes, references, and AI
          disclosure milestones. Older packages remain unchanged.
        </p>
        {!snapshots.length && (
          <p className="fine">No preserved packages yet.</p>
        )}
        <div className="preserved-list">
          {snapshots.map((s) => (
            <div className="preserved-row" key={s.id}>
              <div>
                <strong>Revision {s.revision}</strong>
                <time>{formatDate(s.createdAt)}</time>
                <small>
                  {s.timestampStatus === "bitcoin-proof-complete"
                    ? "Bitcoin proof complete"
                    : s.timestampStatus === "pending-bitcoin-confirmation"
                      ? "Bitcoin confirmation pending"
                      : "Bitcoin timestamp: not submitted"}
                </small>
              </div>
              <div className="preserved-actions">
                <IconButton
                  icon={Download}
                  label={`Download private package for revision ${s.revision}`}
                  onClick={() =>
                    run(async () => {
                      const pkg = await api(
                        `/projects/${project.id}/snapshot?snapshot=${s.id}`,
                      );
                      download(`origin-${project.id}-r${s.revision}.json`, pkg);
                      setToast(
                        "Private package downloaded. It contains project content.",
                      );
                    })
                  }
                />
                <Button
                  icon={Fingerprint}
                  onClick={() =>
                    run(async () =>
                      setTimestamp(
                        await api(
                          `/projects/${project.id}/timestamp-preparation?snapshot=${s.id}`,
                        ),
                      ),
                    )
                  }
                >
                  {s.timestampStatus === "bitcoin-proof-complete"
                    ? "Bitcoin proof"
                    : s.timestampStatus === "pending-bitcoin-confirmation"
                      ? "Bitcoin receipt"
                      : "Prepare Bitcoin timestamp"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {timestamp && (
        <Modal
          title={
            timestamp.completion
              ? "Completed Bitcoin proof"
              : timestamp.submission
                ? "Timestamp receipt"
                : "Independent timestamp preparation"
          }
          close={() => setTimestamp(null)}
        >
          <Badge tone={timestamp.completion ? "green" : "amber"}>
            {timestamp.completion
              ? "Proof complete · public explorer checked"
              : timestamp.submission
                ? "Bitcoin confirmation pending"
                : "Not submitted"}
          </Badge>
          <p className="fine">
            Revision {timestamp.revision}.{" "}
            {timestamp.completion
              ? `Completed ${formatDate(timestamp.completion.completedAt)}. Earliest attested Bitcoin block time: ${formatDate(timestamp.completion.earliestBlockTime)}.`
              : timestamp.submission
                ? `Submitted ${formatDate(timestamp.submission.recordedAt)}. Not yet independently verified on Bitcoin.`
                : "No external request has been made."}
          </p>
          <dl className="timestamp-details">
            <dt>Proposed service</dt>
            <dd>OpenTimestamps public calendars</dd>
            <dt>Network</dt>
            <dd>Bitcoin</dd>
            <dt>Published data</dt>
            <dd>
              Salted fingerprint only. No idea text, names, or private JSON.
            </dd>
            <dt>Service fee</dt>
            <dd>$0; no wallet required</dd>
            {timestamp.completion && (
              <>
                <dt>Verification</dt>
                <dd>
                  Completed OTS proof; public Bitcoin explorer cross-check
                </dd>
                <dt>Local Bitcoin node</dt>
                <dd>Not used</dd>
              </>
            )}
          </dl>
          <label>
            Fingerprint file contents
            <pre className="fingerprint-value">{timestamp.payload}</pre>
          </label>
          <p className="fine">
            {timestamp.completion
              ? "The proof shows this exact fingerprint existed no later than the earliest attested block time. It does not establish originality, ownership, identity, or legal rights. The cross-check used a public explorer, not your own Bitcoin node."
              : "The service can observe network metadata. Blockchain anchoring may be permanent. A pending receipt is not a verified Bitcoin timestamp and does not establish ownership."}
          </p>
          <p className="fine">
            {timestamp.completion
              ? "The completed proof was stored separately. The original pending receipt remains preserved unchanged. Keep both proofs, the fingerprint file, and the private package together."
              : timestamp.submission
                ? "Receipt imported from the official OpenTimestamps client. Keep the proof, fingerprint file, and private JSON together. Confirmation checks are not automatic yet."
                : "Automatic submission and proof verification are not connected in this release. The private JSON and fingerprint file must be retained together."}
          </p>
          {timestamp.submission && (
            <p className="fine">
              Pending calendars:{" "}
              {timestamp.submission.calendars
                .map((c) => new URL(c).hostname)
                .join(", ")}
            </p>
          )}
          {timestamp.completion && (
            <div className="timestamp-verified">
              <strong>Public Bitcoin anchors</strong>
              <ul>
                {timestamp.completion.anchors.map((anchor) => (
                  <li key={anchor.height}>
                    Block {anchor.height} · {formatDate(anchor.blockTime)} ·{" "}
                    <a
                      href={anchor.transactionUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      view transaction
                    </a>
                  </li>
                ))}
              </ul>
              <p className="fine">
                Explorer links open only when you choose them and may reveal
                network metadata to that service.
              </p>
            </div>
          )}
          <div className="preserved-actions">
            {timestamp.completion && (
              <Button
                icon={Download}
                onClick={() =>
                  run(async () => {
                    const r = await api(
                      `/projects/${project.id}/timestamp-completion-receipt?snapshot=${timestamp.snapshotId}`,
                    );
                    const bytes = Uint8Array.from(atob(r.proofBase64), (c) =>
                      c.charCodeAt(0),
                    );
                    download(
                      `${timestamp.filename}.completed.ots`,
                      bytes,
                      "application/octet-stream",
                    );
                  })
                }
              >
                Download completed proof
              </Button>
            )}
            {timestamp.submission && (
              <Button
                icon={Download}
                onClick={() =>
                  run(async () => {
                    const r = await api(
                      `/projects/${project.id}/timestamp-receipt?snapshot=${timestamp.snapshotId}`,
                    );
                    const bytes = Uint8Array.from(atob(r.proofBase64), (c) =>
                      c.charCodeAt(0),
                    );
                    download(
                      `${timestamp.filename}.ots`,
                      bytes,
                      "application/octet-stream",
                    );
                  })
                }
              >
                {timestamp.completion
                  ? "Download original pending receipt"
                  : "Download timestamp proof"}
              </Button>
            )}
            <Button
              icon={Download}
              onClick={() =>
                download(timestamp.filename, timestamp.payload, "text/plain")
              }
            >
              Download fingerprint
            </Button>
            <Button
              icon={Download}
              onClick={() =>
                run(async () => {
                  const pkg = await api(
                    `/projects/${project.id}/snapshot?snapshot=${timestamp.snapshotId}`,
                  );
                  download(
                    `origin-${project.id}-r${timestamp.revision}.json`,
                    pkg,
                  );
                })
              }
            >
              Download private package
            </Button>
          </div>
        </Modal>
      )}
      {project.disclosures.length > 0 && (
        <>
          <h3 className="subheading">Provider disclosures</h3>
          {[...project.disclosures].reverse().map((d) => (
            <details className="disclosure-entry" key={d.id}>
              <summary>
                <span>
                  {d.provider} · {d.model}
                </span>
                <Badge tone={d.status === "completed" ? "green" : "amber"}>
                  {d.status}
                </Badge>
              </summary>
              <p className="fine">
                {formatDate(d.at)} · {d.durationMs ?? "—"} ms · Input{" "}
                {d.usage?.inputTokens ?? "unreported"} / output{" "}
                {d.usage?.outputTokens ?? "unreported"} tokens
              </p>
              <p className="fine">{d.retention}</p>
              <p className="fine">
                {d.spend?.status === "estimated"
                  ? "Application cost estimate: $" +
                    d.spend.estimatedUsd +
                    " · reserved maximum $" +
                    d.spend.reservedUsd +
                    ". Not a provider invoice."
                  : d.spend?.status === "outcome-unknown"
                    ? "Cost outcome unknown · $" +
                      d.spend.reservedUsd +
                      " remains counted until operator reconciliation."
                    : "Billed cost: not available."}
              </p>
              <pre className="request-preview">
                {JSON.stringify(d.request, null, 2)}
              </pre>
            </details>
          ))}
        </>
      )}
      <h3 className="subheading">Activity</h3>
      <div className="timeline">
        {[...events].reverse().map((e) => (
          <div className="timeline-row" key={e.seq}>
            <span className="timeline-dot" />
            <div>
              <strong>{e.type.replaceAll(".", " / ")}</strong>
              <small>{short(e.hash)}</small>
            </div>
            <time>{formatDate(e.at)}</time>
          </div>
        ))}
      </div>
    </section>
  );
}
function Security({
  report,
  scan,
  choose,
  revoke,
  busy,
  managed,
  billingAction,
}) {
  return (
    <main className="settings-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">WORKSPACE SECURITY</span>
          <h1>Visibility, with boundaries.</h1>
        </div>
        <Button icon={RefreshCw} onClick={scan}>
          Run review
        </Button>
      </div>
      <div className="security-status">
        <ShieldCheck size={28} />
        <div>
          <h2>
            {report
              ? report.findings.length
                ? `${report.findings.length} findings to review`
                : "No findings in the latest local checks"
              : "Checking local controls..."}
          </h2>
          <p>
            {report?.checkedAt
              ? `Reviewed ${formatDate(report.checkedAt)} · ${report.projects ?? 0} projects · ${report.records ?? 0} receipts`
              : "Checks run every 60 seconds while this server is running."}
          </p>
        </div>
        <Badge>Rule-based monitor</Badge>
      </div>
      {report?.findings.map((f, i) => (
        <div className="finding" key={i}>
          <ShieldAlert size={19} />
          <span>{f.message}</span>
          {f.projectId && (
            <Button onClick={() => choose(f.projectId)}>Review project</Button>
          )}
        </div>
      ))}
      <section className="settings-section">
        <h3>Sessions</h3>
        <Button icon={LogOut} onClick={revoke}>
          Sign out everywhere
        </Button>
      </section>
      {report?.payments?.enabled && (
        <BillingSettings
          status={report.payments}
          busy={busy}
          managed={managed}
          act={billingAction}
          refresh={scan}
        />
      )}
      <section className="settings-section">
        <h3>Active controls</h3>
        {Object.entries(report?.controls || {}).map(([k, v]) => (
          <div className="setting-row" key={k}>
            <strong>
              {
                {
                  storage: "Project storage",
                  authentication: "Account access",
                  monitoring: "Security monitor",
                  keyCustody: "Key custody",
                  publicAnchoring: "Independent timestamps",
                  execution: "Agent execution",
                  paymentAccess: "Plan access",
                  deployment: "Network boundary",
                }[k]
              }
            </strong>
            <span>{v}</span>
          </div>
        ))}
      </section>
      <section className="settings-section">
        <h3>AI disclosure guard</h3>
        <div className="setting-row">
          <strong>Requests today</strong>
          <span>
            {report?.usage?.attempts ?? 0} / {report?.usage?.dailyLimit ?? 20}
          </span>
        </div>
        <div className="setting-row">
          <strong>Credential screening</strong>
          <span>Known patterns blocked before disclosure</span>
        </div>
        <div className="setting-row">
          <strong>External connections</strong>
          <span>
            {report?.providers?.filter((p) => p.enabled).length ?? 0} enabled
          </span>
        </div>
        <div className="setting-row">
          <strong>Monetary spend guard</strong>
          <span>
            {report?.spend?.enabled
              ? "$" +
                report.spend.account.countedUsd +
                " / $" +
                report.spend.account.limitUsd +
                " this month"
              : "Off · request-count limit only"}
          </span>
        </div>
        {report?.spend?.enabled && (
          <div className="setting-row">
            <strong>Uncertain cost reservations</strong>
            <span>{report.spend.account.uncertainReservations}</span>
          </div>
        )}
      </section>
      <div className="notice">
        These checks cover evidence integrity, known credential patterns, and
        unresolved requests. They are not an intrusion detection service or an
        independent security audit.
      </div>
    </main>
  );
}
function BillingSettings({ status, busy, managed, act, refresh }) {
  const [tier, setTier] = useState(status.tiers[0] || "");
  const account = status.account;
  const billingReturn = new URLSearchParams(location.search).get("billing");
  const labels = {
    active: "Active",
    trialing: "Trial",
    past_due: "Payment needs attention",
    unpaid: "Unpaid",
    incomplete: "Payment incomplete",
    canceled: "Canceled",
    incomplete_expired: "Payment expired",
    paused: "Paused",
    "no-subscription": "No plan yet",
    "period-expired": "Waiting for renewal confirmation",
    "unknown-price": "Plan needs support review",
    "catalog-mismatch": "Plan needs support review",
    "multiple-active-subscriptions": "Subscriptions need support review",
    "reconciliation-required": "Billing needs reconciliation",
    "mode-mismatch": "Billing configuration needs support review",
  };
  return (
    <section className="settings-section">
      <h3>Plan & billing</h3>
      {status.mode === "test" && (
        <p className="notice">
          Test billing is enabled. Use Stripe test payment details only; real
          payments are unavailable.
        </p>
      )}
      {billingReturn === "processing" && !account?.entitled && (
        <p role="status">
          Your checkout is being confirmed. Refresh the status before starting
          another checkout.
        </p>
      )}
      {billingReturn === "cancelled" && (
        <p role="status">
          You returned from checkout. Your plan has not changed here.
        </p>
      )}
      <div className="setting-row">
        <strong>Plan</strong>
        <span>{account?.tier || "None"}</span>
      </div>
      <div className="setting-row">
        <strong>Billing status</strong>
        <span>{labels[account?.status] || "No plan yet"}</span>
      </div>
      <div className="setting-row">
        <strong>Hosted AI access</strong>
        <span>
          {account?.entitled
            ? "Available within your plan allowance"
            : "Inactive"}
        </span>
      </div>
      {account?.currentPeriodEnd && (
        <p className="fine">
          {account.cancelAtPeriodEnd
            ? "Scheduled to end"
            : "Current period ends"}
          : {formatDate(account.currentPeriodEnd)}
        </p>
      )}
      {!managed ? (
        <p>Use your invited managed account to access hosted billing.</p>
      ) : (
        <div className="billing-actions">
          {!account?.entitled && !account?.conflict && (
            <>
              <label>
                Plan for checkout
                <select
                  value={tier}
                  onChange={(event) => setTier(event.target.value)}
                  disabled={busy}
                >
                  {status.tiers.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                disabled={busy || !tier}
                onClick={() => act("checkout", tier)}
              >
                Open test checkout
              </Button>
            </>
          )}
          {account?.customerPortalAvailable && (
            <Button disabled={busy} onClick={() => act("portal")}>
              Manage test subscription
            </Button>
          )}
          <Button icon={RefreshCw} disabled={busy} onClick={refresh}>
            Refresh billing status
          </Button>
        </div>
      )}
      <p className="fine">
        Checkout shows the configured price before confirmation. Your saved
        projects and evidence exports remain available when AI access is
        inactive.
      </p>
    </section>
  );
}
function Connections({ providers, refresh, compact = false }) {
  return (
    <section className={compact ? "model-settings-dialog" : "settings-page"}>
      <div className="page-title">
        {!compact && (
          <div>
            <span className="eyebrow">AI PROVIDERS</span>
            <h1>Model connections</h1>
          </div>
        )}
        <Button icon={RefreshCw} onClick={refresh}>
          Refresh
        </Button>
      </div>
      {!compact && (
        <img
          className="privacy-flow-image"
          src="/privacy-flow.png"
          width="1440"
          height="240"
          alt="Data path: encrypted private project, exact disclosure review, selected model under its provider terms, and recorded contribution evidence."
        />
      )}
      <div className="provider-list">
        {providers.map((p) => (
          <article className="provider-entry" key={p.id}>
            <div className="provider-head">
              <span className="provider-symbol">
                <Sparkles size={24} />
              </span>
              <div>
                <h2>{p.name}</h2>
                <p>
                  {p.models.length} configured{" "}
                  {p.models.length === 1 ? "model" : "models"}
                </p>
              </div>
              <Badge tone={p.enabled ? "green" : ""}>
                {p.enabled ? "Configured" : "Unavailable"}
              </Badge>
            </div>
            <p className="connection-status">
              {p.enabled
                ? "Live access not verified by this catalog"
                : p.disabledReason}
            </p>
            {p.models.length > 0 && (
              <ul className="configured-models" aria-label={`${p.name} models`}>
                {p.models.map((model) => (
                  <li key={model}>
                    <code>{model}</code>
                  </li>
                ))}
              </ul>
            )}
            <p>{p.retention}</p>
            <a
              className="text-button"
              href={p.policyUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              Provider data policy
              <ArrowUpRight size={14} />
            </a>
            <details>
              <summary>Server configuration</summary>
              <div className="config-names">
                <code>ORIGIN_EXTERNAL_AI=1</code>
                {Object.values(p.configNames).map((name) => (
                  <code key={name}>{name}</code>
                ))}
              </div>
              <p className="fine">
                Credentials belong in the server environment. Restart the server
                after configuration. Do not paste keys into project content.
              </p>
            </details>
          </article>
        ))}
      </div>
      <div className="notice">
        <LockKeyhole size={17} />
        <span>
          Each external request requires approval of its exact content. A
          configured API key does not verify provider retention or contractual
          terms.
        </span>
      </div>
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);
