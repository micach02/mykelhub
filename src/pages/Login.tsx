import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Cloud, Eye, EyeOff, HardDrive, Loader2 } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Field, TextInput } from '../components/ui/Field'
import { toast } from '../components/ui/Toast'
import { BrandMark, Splash } from '../components/layout/BrandMark'
import { useCloudSync } from '../lib/cloudSync'
import { checkAnonKey, configSource, readConfig, tidyUrl, urlLooksValid } from '../lib/cloud'
import { useStore } from '../store/useStore'

/**
 * The way in. Email and password open the store and keep it in step with the
 * cloud. A device that has never seen the project is asked for it first, once,
 * and anyone without a cloud project can carry on with this device alone.
 */
export function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const state = useCloudSync((s) => s.state)
  const email = useCloudSync((s) => s.email)
  const message = useCloudSync((s) => s.message)
  const localOnly = useCloudSync((s) => s.localOnly)
  const configure = useCloudSync((s) => s.configure)
  const disconnect = useCloudSync((s) => s.disconnect)
  const signIn = useCloudSync((s) => s.signIn)
  const signUp = useCloudSync((s) => s.signUp)
  const chooseLocalOnly = useCloudSync((s) => s.chooseLocalOnly)
  const storeName = useStore((s) => s.settings.storeName)

  const [mode, setMode] = useState<'sign-in' | 'create'>('sign-in')
  const [emailInput, setEmailInput] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)

  const [url, setUrl] = useState('')
  const [anonKey, setAnonKey] = useState('')
  const [urlError, setUrlError] = useState('')
  const [keyError, setKeyError] = useState('')

  if (state === 'starting') return <Splash />
  // Already signed in: straight through to where they were going.
  if (email && state !== 'off') return <Navigate to={from} replace />

  const needsProject = state === 'off'
  const source = configSource()
  const host = readConfig()?.url.replace(/^https:[/][/]/, '') ?? ''
  const creating = mode === 'create'

  async function connect(e: FormEvent) {
    e.preventDefault()
    const next = { url: tidyUrl(url), anonKey: anonKey.trim() }
    const urlOk = urlLooksValid(next.url)
    const key = checkAnonKey(next.anonKey)
    setUrlError(urlOk ? '' : 'Expected something like https://abcdefgh.supabase.co')
    setKeyError(key.ok ? '' : key.reason)
    if (!urlOk || !key.ok) return
    setBusy(true)
    await configure(next)
    setBusy(false)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const address = emailInput.trim()
    if (!address || !password) return
    setBusy(true)
    const ok = creating ? await signUp(address, password) : await signIn(address, password)
    setBusy(false)
    if (!ok) return
    setPassword('')
    toast.success(
      creating ? 'Account created. Your store is syncing.' : 'Signed in. Your store is syncing.',
    )
    navigate(from, { replace: true })
  }

  function workLocally() {
    chooseLocalOnly()
    navigate('/', { replace: true })
  }

  // Only what failed to sign in belongs here, not a sync note from earlier.
  const problem = state === 'signed-out' || state === 'error' ? message : null

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-[26rem]">
        <div className="mb-7 flex flex-col items-center text-center">
          <BrandMark size="lg" />
          <h1 className="mt-5 text-[26px] leading-tight font-semibold text-ink">
            {needsProject ? 'Connect your store' : creating ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-muted">
            {needsProject
              ? 'Tell this device which cloud project holds your store. You only do this once per device.'
              : creating
                ? 'One account for the store. Sign in with it on your phone and your computer.'
                : `Sign in to open ${storeName} and keep it in sync on every device.`}
          </p>
        </div>

        <div className="rounded-3xl border border-(--edge) bg-surface p-6 shadow-(--shadow-card) backdrop-blur-xl sm:p-7">
          {needsProject ? (
            <form onSubmit={connect} className="flex flex-col gap-4" noValidate>
              <Field
                label="Project URL"
                required
                error={urlError}
                hint="Supabase, Settings, Data API."
              >
                {(id) => (
                  <TextInput
                    id={id}
                    autoFocus
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://abcdefgh.supabase.co"
                  />
                )}
              </Field>
              <Field
                label="Public key"
                required
                error={keyError}
                hint="Supabase, Settings, API Keys. The publishable or anon key, never a secret one."
              >
                {(id) => (
                  <TextInput
                    id={id}
                    value={anonKey}
                    onChange={(e) => setAnonKey(e.target.value)}
                    placeholder="sb_publishable_… or eyJhbGciOi…"
                  />
                )}
              </Field>
              <Button type="submit" variant="primary" size="lg" disabled={busy} className="mt-1 w-full justify-center">
                {busy ? <Loader2 size={17} className="animate-spin" aria-hidden /> : null}
                {busy ? 'Connecting…' : 'Continue'}
                {busy ? null : <ArrowRight size={17} aria-hidden />}
              </Button>
            </form>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <Field label="Email">
                {(id) => (
                  <TextInput
                    id={id}
                    type="email"
                    name="email"
                    autoComplete="username"
                    autoFocus
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="you@example.com"
                  />
                )}
              </Field>
              <Field label="Password">
                {(id) => (
                  <div className="relative">
                    <TextInput
                      id={id}
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      autoComplete={creating ? 'new-password' : 'current-password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={creating ? 'At least six characters' : ''}
                      className="pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted transition-colors hover:text-ink"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                )}
              </Field>

              {problem ? (
                <p
                  role="alert"
                  className="rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink"
                  style={{
                    background: 'color-mix(in srgb, var(--status-critical) 12%, transparent)',
                  }}
                >
                  {problem}
                </p>
              ) : null}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={busy || !emailInput.trim() || !password}
                className="mt-1 w-full justify-center"
              >
                {busy ? <Loader2 size={17} className="animate-spin" aria-hidden /> : null}
                {busy
                  ? creating
                    ? 'Creating the account…'
                    : 'Signing in…'
                  : creating
                    ? 'Create account'
                    : 'Sign in'}
              </Button>

              <p className="text-center text-[13px] text-ink-2">
                {creating ? 'Already have the account?' : 'First time here?'}{' '}
                <button
                  type="button"
                  onClick={() => setMode(creating ? 'sign-in' : 'create')}
                  className="font-medium text-brand hover:underline"
                >
                  {creating ? 'Sign in' : 'Create the account'}
                </button>
              </p>
            </form>
          )}
        </div>

        <div className="mt-6 flex flex-col items-center gap-2 text-center text-[12.5px] text-muted">
          {needsProject ? (
            <button
              type="button"
              onClick={workLocally}
              className="flex items-center gap-1.5 font-medium text-ink-2 hover:text-ink"
            >
              <HardDrive size={14} aria-hidden />
              {localOnly ? 'Back to the store' : 'Use on this device only'}
            </button>
          ) : (
            <>
              <p className="flex items-center gap-1.5">
                <Cloud size={14} aria-hidden />
                {host}
              </p>
              {source === 'saved' ? (
                <button
                  type="button"
                  onClick={async () => {
                    await disconnect()
                    toast.info('Project removed from this device. Your data stays here.')
                  }}
                  className="font-medium text-ink-2 hover:text-ink"
                >
                  Use a different project
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
