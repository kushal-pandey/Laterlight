import Navbar from "./components/layout/NavBar";
import AuthLanding, { type AuthMode } from "./components/auth/AuthLanding";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  Inbox,
  LayoutDashboard,
  ListTodo,
  Mail,
  RefreshCw,
  Upload,
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
        <AuthLanding
          authMode={authMode}
          fullName={fullName}
          email={email}
          password={password}
          isSubmitting={isSubmitting}
          errorMessage={errorMessage}
          authCardRef={authCardRef}
          onFullNameChange={setFullName}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onAuthSubmit={handleAuthSubmit}
          onSwitchAuthMode={switchAuthMode}
          onRegister={openRegistration}
        />
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
