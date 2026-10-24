import { motion } from "framer-motion";
import Navbar from "./components/layout/NavBar";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  Inbox,
  LayoutDashboard,
  ListTodo,
  Lock,
  Mail,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
  UserPlus,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  ApiError,
  api,
  clearToken,
  getToken,
  type Action,
  type DashboardStats,
  type Document,
  type User,
} from "./lib/api";

type AuthMode = "login" | "register";

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) {
      return "Unable to connect to Laterlight. Check that the backend is running.";
    }

    if (error.status === 401) {
      return "Your session has expired. Please log in again.";
    }

    if (error.status === 409) {
      return "An account with this email may already exist. Try logging in.";
    }

    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

function formatDate(value: string | null): string {
  if (!value) return "No due date";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatAmount(
  amount: number | null,
  currency: string | null,
): string | null {
  if (amount === null || amount === undefined) return null;

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
    }).format(amount);
  } catch {
    return `${currency || ""} ${amount}`.trim();
  }
}

function getStatusClasses(status: string): string {
  const normalized = status.toLowerCase();

  if (
    normalized.includes("complete") ||
    normalized.includes("processed") ||
    normalized.includes("approved")
  ) {
    return "bg-teal-100 text-teal-900";
  }

  if (
    normalized.includes("error") ||
    normalized.includes("failed") ||
    normalized.includes("overdue")
  ) {
    return "bg-red-100 text-red-800";
  }

  if (
    normalized.includes("process") ||
    normalized.includes("pending") ||
    normalized.includes("review")
  ) {
    return "bg-amber-100 text-amber-900";
  }

  return "bg-slate-100 text-slate-700";
}

function makeDraftContent(action: Action, fullName: string): string {
  return `Hello${action.counterparty ? ` ${action.counterparty}` : ""},

I'm following up regarding "${action.title}".

${action.description}

${action.due_date ? `The relevant due date is ${formatDate(action.due_date)}. ` : ""}Please let me know if you need any additional information or documentation.

Best regards,
${fullName}`;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [dashboard, setDashboard] = useState<DashboardStats | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [processingDocumentId, setProcessingDocumentId] = useState<
    number | null
  >(null);
  const [processingError, setProcessingError] = useState("");
  const [draftActionId, setDraftActionId] = useState<number | null>(null);
  const [draftContent, setDraftContent] = useState("");
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftMessage, setDraftMessage] = useState("");
  const [draftError, setDraftError] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const authCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      if (!getToken()) {
        setIsCheckingSession(false);
        return;
      }

      try {
        const currentUser = await api.me();

        if (!cancelled) {
          setUser(currentUser);
        }
      } catch {
        clearToken();
      } finally {
        if (!cancelled) {
          setIsCheckingSession(false);
        }
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const loadDashboard = useCallback(async () => {
    setIsDashboardLoading(true);
    setDashboardError("");

    try {
      const [stats, fetchedActions, fetchedDocuments] = await Promise.all([
        api.dashboard(),
        api.listActions(),
        api.listDocuments(),
      ]);

      setDashboard(stats);
      setActions(fetchedActions);
      setDocuments(fetchedDocuments);

      setDraftActionId((currentId) => {
        if (
          currentId !== null &&
          fetchedActions.some((action) => action.id === currentId)
        ) {
          return currentId;
        }

        return fetchedActions[0]?.id ?? null;
      });

      setDraftContent((currentContent) => {
        if (currentContent.trim()) return currentContent;

        const firstAction = fetchedActions[0];
        return firstAction && user
          ? makeDraftContent(firstAction, user.full_name)
          : "";
      });
    } catch (error) {
      setDashboardError(getErrorMessage(error));

      if (error instanceof ApiError && error.status === 401) {
        clearToken();
        setUser(null);
      }
    } finally {
      setIsDashboardLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      void loadDashboard();
    } else {
      setDashboard(null);
      setActions([]);
      setDocuments([]);
    }
  }, [user, loadDashboard]);

  function switchAuthMode(mode: AuthMode) {
    setAuthMode(mode);
    setErrorMessage("");
    setPassword("");
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      if (authMode === "register") {
        await api.register({
          email: email.trim(),
          password,
          full_name: fullName.trim(),
        });

        await api.login({
          email: email.trim(),
          password,
        });
      } else {
        await api.login({
          email: email.trim(),
          password,
        });
      }

      const currentUser = await api.me();
      setUser(currentUser);
      setPassword("");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleLogout() {
    clearToken();
    setUser(null);
    setPassword("");
    setFullName("");
    setAuthMode("login");
    setErrorMessage("");
    setDashboardError("");
    setUploadError("");
    setProcessingError("");
    setDraftError("");
    setDraftMessage("");
    setDraftContent("");
    setDraftActionId(null);
  }

  function openRegistration() {
    switchAuthMode("register");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openLogin() {
    switchAuthMode("login");

    requestAnimationFrame(() => {
      authCardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }

  async function handleUploadChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setUploadError("");
    setIsUploading(true);

    try {
      await api.uploadDocument(file);
      await loadDashboard();
    } catch (error) {
      setUploadError(getErrorMessage(error));
    } finally {
      setIsUploading(false);
    }
  }

  async function handleProcessDocument(document: Document) {
    setProcessingError("");
    setDraftError("");
    setDraftMessage("");
    setProcessingDocumentId(document.id);

    try {
      const result = await api.processDocument(document.id);

      if (result.result.follow_up_draft) {
        setDraftContent(result.result.follow_up_draft);

        const actionToDraft = result.action ?? result.actions[0];

        if (actionToDraft) {
          setDraftActionId(actionToDraft.id);
        }
      }

      await loadDashboard();
    } catch (error) {
      setProcessingError(
        `Could not process "${document.filename}": ${getErrorMessage(error)}`,
      );
    } finally {
      setProcessingDocumentId(null);
    }
  }

  function handleDraftActionChange(actionId: number) {
    setDraftActionId(actionId);
    setDraftMessage("");
    setDraftError("");

    const action = actions.find((item) => item.id === actionId);

    if (action && user) {
      setDraftContent(makeDraftContent(action, user.full_name));
    }
  }

  async function handleCreateDraft() {
    const action = actions.find((item) => item.id === draftActionId);

    if (!action) {
      setDraftError("Select an action before creating a draft.");
      return;
    }

    if (!draftContent.trim()) {
      setDraftError("Draft content cannot be empty.");
      return;
    }

    setIsSavingDraft(true);
    setDraftError("");
    setDraftMessage("");

    try {
      await api.createDraft(action.id, {
        content: draftContent.trim(),
      });

      setDraftMessage("Draft saved successfully.");
    } catch (error) {
      setDraftError(getErrorMessage(error));
    } finally {
      setIsSavingDraft(false);
    }
  }

  const selectedDraftAction = actions.find(
    (action) => action.id === draftActionId,
  );

  const metricCards = dashboard
    ? [
        { label: "Documents", value: dashboard.total_documents, icon: Inbox },
        {
          label: "Action queue",
          value: dashboard.total_actions,
          icon: ListTodo,
        },
        { label: "Due soon", value: dashboard.due_soon, icon: Clock3 },
        { label: "Overdue", value: dashboard.overdue, icon: CheckCircle2 },
      ]
    : [];

  return (
    <div className="min-h-screen bg-ivory text-midnight">
      <Navbar
        user={user}
        onLogin={openLogin}
        onRegister={openRegistration}
        onLogout={handleLogout}
      />

      {isCheckingSession ? (
        <main className="mx-auto flex min-h-[60vh] max-w-7xl items-center justify-center px-6">
          <div className="text-center">
            <div
              className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-teal-700"
              aria-label="Loading"
            />
            <p className="mt-4 text-sm text-slate-500">
              Restoring your secure session...
            </p>
          </div>
        </main>
      ) : !user ? (
        <main>
          <section className="mx-auto grid max-w-7xl items-center gap-10 px-6 pb-20 pt-8 lg:grid-cols-[1.15fr_0.85fr] lg:pt-16">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55 }}
            >
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-sm text-teal-900">
                <Sparkles className="h-4 w-4" />
                AI-powered admin flow
              </div>

              <h1 className="max-w-xl text-5xl font-semibold tracking-tight text-midnight md:text-6xl">
                Turn paperwork into decisions you can finish.
              </h1>

              <p className="mt-6 max-w-xl text-lg text-slate-600">
                Upload invoices, notices, and contracts. Laterlight extracts the
                essentials, flags the urgency, drafts follow-ups, and keeps the
                important work in one trusted action queue.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={openRegistration}
                >
                  Start free <ArrowRight className="h-4 w-4" />
                </button>
                <a href="#workflow" className="btn-secondary">
                  Explore the workflow
                </a>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {[
                  { label: "Actions in queue", value: "Organized" },
                  { label: "Priority tracking", value: "Deadline-aware" },
                  { label: "Review workflow", value: "Human-led" },
                ].map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-soft"
                  >
                    <div className="text-lg font-semibold">{metric.value}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      {metric.label}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-6 text-sm text-slate-500">
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-teal-700" />
                  Open-weight AI with human review
                </span>
                <span className="inline-flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-amber-700" />
                  Priority-by-deadline workflow
                </span>
              </div>
            </motion.div>

            <motion.div
              ref={authCardRef}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.45 }}
              className="card-surface p-5 scroll-mt-8"
            >
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      {authMode === "login"
                        ? "Secure sign in"
                        : "Get started securely"}
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold">
                      {authMode === "login"
                        ? "Welcome back"
                        : "Create your account"}
                    </h2>
                  </div>
                  <div className="rounded-full bg-amber-100 p-2 text-amber-700">
                    {authMode === "login" ? (
                      <Lock className="h-5 w-5" />
                    ) : (
                      <UserPlus className="h-5 w-5" />
                    )}
                  </div>
                </div>

                <form className="space-y-4" onSubmit={handleAuthSubmit}>
                  {authMode === "register" && (
                    <label className="block text-sm text-slate-600">
                      Full name
                      <input
                        autoComplete="name"
                        required
                        minLength={2}
                        value={fullName}
                        onChange={(event) => setFullName(event.target.value)}
                        placeholder="Your full name"
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-teal-500 focus:bg-white"
                      />
                    </label>
                  )}

                  <label className="block text-sm text-slate-600">
                    Email
                    <input
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-teal-500 focus:bg-white"
                    />
                  </label>

                  <label className="block text-sm text-slate-600">
                    Password
                    <input
                      type="password"
                      autoComplete={
                        authMode === "login"
                          ? "current-password"
                          : "new-password"
                      }
                      required
                      minLength={8}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="At least 8 characters"
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none transition focus:border-teal-500 focus:bg-white"
                    />
                    {authMode === "register" && (
                      <span className="mt-1 block text-xs text-slate-500">
                        Use at least 8 characters.
                      </span>
                    )}
                  </label>

                  {errorMessage && (
                    <div
                      role="alert"
                      className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
                    >
                      {errorMessage}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting
                      ? authMode === "login"
                        ? "Signing in..."
                        : "Creating account..."
                      : authMode === "login"
                        ? "Continue to dashboard"
                        : "Create account"}
                    {!isSubmitting && <ArrowRight className="h-4 w-4" />}
                  </button>
                </form>

                <div className="mt-5 flex items-center justify-between gap-3 text-sm text-slate-500">
                  <span>
                    {authMode === "login"
                      ? "New to Laterlight?"
                      : "Already have an account?"}
                  </span>
                  <button
                    type="button"
                    className="font-medium text-midnight underline-offset-4 hover:underline"
                    onClick={() =>
                      switchAuthMode(
                        authMode === "login" ? "register" : "login",
                      )
                    }
                  >
                    {authMode === "login" ? "Create account" : "Log in"}
                  </button>
                </div>

                <p className="mt-5 text-xs leading-5 text-slate-500">
                  Your account is protected by authenticated API access. Review
                  extracted information before taking action.
                </p>
              </div>
            </motion.div>
          </section>

          <section id="features" className="mx-auto max-w-7xl px-6 pb-20">
            <div className="mb-8">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">
                Core workflow
              </p>
              <h2 className="mt-2 text-3xl font-semibold">
                Upload. Extract. Verify. Act.
              </h2>
            </div>

            <div id="workflow" className="grid gap-4 md:grid-cols-3">
              {[
                [
                  "Upload",
                  "Drop PDFs, plain text, and renewal notices into your secure inbox.",
                ],
                [
                  "Extract",
                  "Identify dates, amounts, counterparties, and next steps with structured AI output.",
                ],
                [
                  "Approve",
                  "Review evidence, tweak the draft, and move the work into a priority queue.",
                ],
              ].map(([title, description]) => (
                <div key={title} className="card-surface p-5">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-midnight text-white">
                    {title === "Upload" ? (
                      <FileText className="h-5 w-5" />
                    ) : title === "Extract" ? (
                      <Sparkles className="h-5 w-5" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5" />
                    )}
                  </div>
                  <h3 className="text-xl font-semibold">{title}</h3>
                  <p className="mt-3 text-slate-600">{description}</p>
                </div>
              ))}
            </div>

            <div
              id="security"
              className="mt-8 flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/70 p-5"
            >
              <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-teal-700" />
              <div>
                <h3 className="font-semibold">Review before you act</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Laterlight helps organize paperwork and suggested next steps.
                  Check extracted details and drafts before relying on them.
                </p>
              </div>
            </div>
          </section>
        </main>
      ) : (
        <main className="mx-auto max-w-7xl px-6 py-8">
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">
                Workspace
              </p>
              <h1 className="mt-2 text-3xl font-semibold">
                Welcome, {user.full_name}
              </h1>
              <p className="mt-1 text-sm text-slate-500">{user.email}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => void loadDashboard()}
                disabled={isDashboardLoading}
              >
                <RefreshCw
                  className={`h-4 w-4 ${isDashboardLoading ? "animate-spin" : ""}`}
                />
                Refresh
              </button>

              <button
                type="button"
                className="btn-ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                <Upload className="h-4 w-4" />
                {isUploading ? "Uploading..." : "Upload document"}
              </button>

              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.txt,.doc,.docx,.png,.jpg,.jpeg"
                onChange={(event) => void handleUploadChange(event)}
                aria-label="Choose a document to upload"
              />
            </div>
          </div>

          {dashboardError && (
            <div
              role="alert"
              className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            >
              <span>{dashboardError}</span>
              <button
                type="button"
                className="font-semibold underline"
                onClick={() => void loadDashboard()}
              >
                Try again
              </button>
            </div>
          )}

          {uploadError && (
            <div
              role="alert"
              className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            >
              {uploadError}
            </div>
          )}

          {isDashboardLoading && !dashboard ? (
            <div
              role="status"
              className="card-surface flex min-h-56 flex-col items-center justify-center p-8 text-center"
            >
              <div className="h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-teal-700" />
              <p className="mt-4 font-medium">Loading your workspace...</p>
              <p className="mt-1 text-sm text-slate-500">
                Fetching your documents and action queue.
              </p>
            </div>
          ) : (
            <>
              {dashboard?.demo_mode && (
                <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Demo mode is enabled by the backend. Some processing results
                  may be simulated.
                </div>
              )}

              <section className="grid gap-4 md:grid-cols-4">
                {metricCards.map(({ label, value, icon: Icon }) => (
                  <div key={label} className="card-surface p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <span className="text-sm text-slate-500">{label}</span>
                      <Icon className="h-5 w-5 text-teal-700" />
                    </div>
                    <div className="text-3xl font-semibold">{value}</div>
                  </div>
                ))}
              </section>

              <section className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="card-surface p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                        Priority queue
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold">
                        Action queue
                      </h2>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                      {actions.length}{" "}
                      {actions.length === 1 ? "action" : "actions"}
                    </span>
                  </div>

                  {processingError && (
                    <div
                      role="alert"
                      className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                    >
                      {processingError}
                    </div>
                  )}

                  {actions.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
                      <ListTodo className="mx-auto h-8 w-8 text-slate-400" />
                      <p className="mt-3 font-medium">No actions yet</p>
                      <p className="mt-1 text-sm text-slate-500">
                        Upload and process a document to start building your
                        action queue.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {actions.map((action) => {
                        const amount = formatAmount(
                          action.amount,
                          action.currency,
                        );

                        return (
                          <div
                            key={action.id}
                            className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <div className="text-lg font-medium">
                                  {action.title}
                                </div>
                                <p className="mt-1 text-sm text-slate-600">
                                  {action.description}
                                </p>
                                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                                  <span>
                                    {action.due_date
                                      ? `Due ${formatDate(action.due_date)}`
                                      : "No due date"}
                                  </span>
                                  {amount && <span>{amount}</span>}
                                  {action.category && (
                                    <span>{action.category}</span>
                                  )}
                                  <span
                                    className={`rounded-full px-2 py-1 text-xs ${getStatusClasses(action.priority)}`}
                                  >
                                    {action.priority}
                                  </span>
                                </div>
                              </div>

                              <span
                                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${getStatusClasses(action.status)}`}
                              >
                                {action.status}
                              </span>
                            </div>

                            <button
                              type="button"
                              className="mt-3 text-sm font-semibold text-teal-800 underline-offset-4 hover:underline"
                              onClick={() => {
                                handleDraftActionChange(action.id);
                                document
                                  .getElementById("follow-up-draft")
                                  ?.scrollIntoView({ behavior: "smooth" });
                              }}
                            >
                              Draft follow-up
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="card-surface p-5">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                        Document inbox
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold">
                        Your documents
                      </h2>
                    </div>
                    <LayoutDashboard className="h-5 w-5 text-slate-500" />
                  </div>

                  {documents.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
                      <FileText className="mx-auto h-8 w-8 text-slate-400" />
                      <p className="mt-3 font-medium">No documents yet</p>
                      <p className="mt-1 text-sm text-slate-500">
                        Upload an invoice, notice, or contract to get started.
                      </p>
                      <button
                        type="button"
                        className="btn-primary mt-4"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                      >
                        <Upload className="h-4 w-4" />
                        Upload a document
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {documents.map((document) => (
                        <div
                          key={document.id}
                          className="rounded-2xl border border-slate-200 bg-white p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="break-all font-medium">
                              {document.filename}
                            </div>
                            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                              {document.content_type || "File"}
                            </span>
                          </div>

                          <p className="mt-2 text-sm text-slate-600">
                            {document.summary || "No summary available yet."}
                          </p>

                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            <span
                              className={`rounded-full px-2 py-1 text-xs ${getStatusClasses(document.status)}`}
                            >
                              {document.status}
                            </span>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-sm font-semibold text-teal-800 underline-offset-4 hover:underline disabled:opacity-50"
                              onClick={() =>
                                void handleProcessDocument(document)
                              }
                              disabled={
                                processingDocumentId !== null || isUploading
                              }
                            >
                              {processingDocumentId === document.id
                                ? "Processing..."
                                : "Process document"}
                              {processingDocumentId !== document.id && (
                                <ArrowRight className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section id="follow-up-draft" className="mt-8 card-surface p-5">
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Evidence review
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold">
                      Follow-up draft
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Review and edit the message before saving it.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void handleCreateDraft()}
                    disabled={
                      isSavingDraft ||
                      !selectedDraftAction ||
                      !draftContent.trim()
                    }
                  >
                    <Mail className="h-4 w-4" />
                    {isSavingDraft ? "Saving draft..." : "Save draft"}
                  </button>
                </div>

                {actions.length > 0 && (
                  <label className="mb-4 block text-sm text-slate-600">
                    Action
                    <select
                      value={draftActionId ?? ""}
                      onChange={(event) =>
                        handleDraftActionChange(Number(event.target.value))
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-teal-500"
                    >
                      {actions.map((action) => (
                        <option key={action.id} value={action.id}>
                          {action.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {draftError && (
                  <div
                    role="alert"
                    className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                  >
                    {draftError}
                  </div>
                )}

                {draftMessage && (
                  <div
                    role="status"
                    className="mb-4 rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900"
                  >
                    {draftMessage}
                  </div>
                )}

                {selectedDraftAction ? (
                  <textarea
                    aria-label="Follow-up draft content"
                    value={draftContent}
                    onChange={(event) => {
                      setDraftContent(event.target.value);
                      setDraftMessage("");
                    }}
                    rows={9}
                    className="w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700 outline-none transition focus:border-teal-500 focus:bg-white"
                  />
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
                    <Mail className="mx-auto h-8 w-8 text-slate-400" />
                    <p className="mt-3 font-medium">No action selected</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Process a document or create an action to prepare a
                      follow-up draft.
                    </p>
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      )}
    </div>
  );
}

export default App;
