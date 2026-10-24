
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  Lock,
  ShieldCheck,
  Sparkles,
  UserPlus,
} from "lucide-react";
import type { FormEvent, RefObject } from "react";

export type AuthMode = "login" | "register";

interface AuthLandingProps {
  authMode: AuthMode;
  fullName: string;
  email: string;
  password: string;
  isSubmitting: boolean;
  errorMessage: string;
  authCardRef: RefObject<HTMLDivElement | null>;
  onFullNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onAuthSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSwitchAuthMode: (mode: AuthMode) => void;
  onRegister: () => void;
}

export default function AuthLanding({
  authMode,
  fullName,
  email,
  password,
  isSubmitting,
  errorMessage,
  authCardRef,
  onFullNameChange,
  onEmailChange,
  onPasswordChange,
  onAuthSubmit,
  onSwitchAuthMode,
  onRegister,
}: AuthLandingProps) {
  return (
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
              onClick={onRegister}
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
          className="card-surface scroll-mt-8 p-5"
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

            <form className="space-y-4" onSubmit={onAuthSubmit}>
              {authMode === "register" && (
                <label className="block text-sm text-slate-600">
                  Full name
                  <input
                    autoComplete="name"
                    required
                    minLength={2}
                    value={fullName}
                    onChange={(event) => onFullNameChange(event.target.value)}
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
                  onChange={(event) => onEmailChange(event.target.value)}
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
                  onChange={(event) => onPasswordChange(event.target.value)}
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
                  onSwitchAuthMode(
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
  );
}
