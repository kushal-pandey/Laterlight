import {
  LogOut,
} from 'lucide-react'
import type { User } from '../../lib/api'

interface NavbarProps {
  user: User | null
  onLogin: () => void
  onRegister: () => void
  onLogout: () => void
}

export default function Navbar({
  user,
  onLogin,
  onRegister,
  onLogout,
}: NavbarProps) {
  return (
    <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
      <button
        type="button"
        className="flex items-center gap-3 text-left"
        onClick={() => {
          if (user) {
            window.scrollTo({ top: 0, behavior: 'smooth' })
          } else {
            onLogin()
          }
        }}
        aria-label="Laterlight home"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-midnight text-lg font-semibold text-white shadow-soft">
          L
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
            Laterlight
          </p>
          <p className="text-sm font-medium text-slate-700">
            Personal admin autopilot
          </p>
        </div>
      </button>

      {!user && (
        <nav className="hidden items-center gap-8 text-sm text-slate-600 md:flex">
          <a href="#features">Features</a>
          <a href="#workflow">Workflow</a>
          <a href="#security">Privacy</a>
        </nav>
      )}

      <div className="flex items-center gap-3">
        {user ? (
          <>
            <span className="hidden text-sm text-slate-600 sm:inline">
              {user.full_name}
            </span>

            <button
              type="button"
              className="btn-ghost"
              onClick={onLogout}
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn-ghost"
              onClick={onLogin}
            >
              Log in
            </button>

            <button
              type="button"
              className="btn-primary"
              onClick={onRegister}
            >
              Start free
            </button>
          </>
        )}
      </div>
    </header>
  )
}