import { useState } from 'react'
import { AlertTriangle, Check, Cloud, CloudOff, LogOut, RefreshCw } from 'lucide-react'
import { Card, CardBody, CardHeader } from '../ui/Card'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Field, TextInput } from '../ui/Field'
import { toast } from '../ui/Toast'
import { useCloudSync } from '../../lib/cloudSync'
import { checkAnonKey, readConfig, tidyUrl, urlLooksValid } from '../../lib/cloud'
import { useFormat } from '../../lib/useFormat'

/**
 * Connecting the store to a Supabase project, so the same data is on the
 * phone and the PC. The project details are entered here rather than built
 * in, which keeps them out of the repository.
 */
export function CloudCard() {
  const fmt = useFormat()
  const state = useCloudSync((s) => s.state)
  const email = useCloudSync((s) => s.email)
  const lastSyncedAt = useCloudSync((s) => s.lastSyncedAt)
  const pendingCount = useCloudSync((s) => s.pendingCount)
  const message = useCloudSync((s) => s.message)
  const configure = useCloudSync((s) => s.configure)
  const disconnect = useCloudSync((s) => s.disconnect)
  const signIn = useCloudSync((s) => s.signIn)
  const signUp = useCloudSync((s) => s.signUp)
  const signOut = useCloudSync((s) => s.signOut)
  const syncNow = useCloudSync((s) => s.syncNow)
  const resolveConflict = useCloudSync((s) => s.resolveConflict)

  const existing = readConfig()
  const [url, setUrl] = useState(existing?.url ?? '')
  const [anonKey, setAnonKey] = useState(existing?.anonKey ?? '')
  const [urlError, setUrlError] = useState('')
  const [keyError, setKeyError] = useState('')

  const [emailInput, setEmailInput] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const configured = state !== 'off'
  const signedIn = state === 'ready' || state === 'syncing' || state === 'offline' || state === 'conflict'

  async function saveConfig() {
    const next = { url: tidyUrl(url), anonKey: anonKey.trim() }

    const urlOk = urlLooksValid(next.url)
    const key = checkAnonKey(next.anonKey)
    setUrlError(urlOk ? '' : 'Expected something like https://abcdefgh.supabase.co')
    setKeyError(key.ok ? '' : key.reason)
    if (!urlOk || !key.ok) return

    setBusy(true)
    await configure(next)
    setBusy(false)
    toast.success('Project saved. Sign in to start syncing.')
  }

  return (
    <Card className="mt-4">
      <CardHeader
        title="Cloud sync"
        subtitle="Keep the same data on your phone and your computer."
        action={
          state === 'ready' ? (
            <Badge tone="good" icon={<Check size={12} aria-hidden />}>
              In sync
            </Badge>
          ) : state === 'syncing' ? (
            <Badge tone="brand">Syncing</Badge>
          ) : state === 'starting' ? (
            <Badge tone="brand">Connecting</Badge>
          ) : state === 'conflict' ? (
            <Badge tone="warning" icon={<AlertTriangle size={12} aria-hidden />}>
              Needs a decision
            </Badge>
          ) : state === 'offline' ? (
            <Badge tone="warning" icon={<CloudOff size={12} aria-hidden />}>
              Offline
            </Badge>
          ) : state === 'error' ? (
            <Badge tone="critical" icon={<AlertTriangle size={12} aria-hidden />}>
              Problem
            </Badge>
          ) : state === 'signed-out' ? (
            <Badge tone="brand">Sign in to start</Badge>
          ) : (
            <Badge tone="neutral">No project yet</Badge>
          )
        }
      />
      <CardBody>
        {state === 'conflict' ? (
          <div
            className="mb-4 rounded-lg border px-4 py-3"
            style={{
              borderColor: 'color-mix(in srgb, var(--status-warning) 45%, transparent)',
              background: 'color-mix(in srgb, var(--status-warning) 12%, transparent)',
            }}
          >
            <p className="text-[13px] leading-relaxed text-ink">
              This device has {pendingCount} change{pendingCount === 1 ? '' : 's'} that never went
              up, and the cloud has newer data from somewhere else. Keeping one means losing the
              other, so it is your call.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="primary"
                onClick={async () => {
                  await resolveConflict('device')
                  toast.success('This device won. Its data is now in the cloud.')
                }}
              >
                Keep this device
              </Button>
              <Button
                onClick={async () => {
                  await resolveConflict('cloud')
                  toast.info('Loaded the cloud copy. This device now matches it.')
                }}
              >
                Keep the cloud copy
              </Button>
            </div>
          </div>
        ) : null}

        {!configured ? (
          <>
            <p className="text-[13px] leading-relaxed text-ink-2">
              Create a free project at supabase.com and run the SQL in{' '}
              <span className="font-medium text-ink">supabase/schema.sql</span>. Then, in the
              project&rsquo;s Settings, copy the URL from{' '}
              <span className="font-medium text-ink">Data API</span> and the public key from{' '}
              <span className="font-medium text-ink">API Keys</span>.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4">
              <Field label="Project URL" required error={urlError} hint="Settings, Data API. Pasting the full REST endpoint is fine, the extra path is trimmed.">
                {(id) => (
                  <TextInput
                    id={id}
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
                hint="Settings, API Keys. The publishable or anon key, never a secret one. It is safe here: the database policy is what keeps your data private."
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
            </div>
            <div className="mt-4">
              <Button variant="primary" onClick={saveConfig} disabled={busy}>
                <Cloud size={15} aria-hidden />
                Save project
              </Button>
            </div>
          </>
        ) : !signedIn ? (
          <>
            <div className="mb-4 rounded-2xl bg-surface shadow-(--shadow-inset-sm) px-4 py-3">
              <p className="text-[12px] text-ink-2">Project saved</p>
              <p className="text-[13px] font-medium break-all text-ink">
                {readConfig()?.url ?? ''}
              </p>
              <p className="mt-1 text-[12px] text-ink-2">
                Now sign in, or create the account if this is the first time.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Email">
                {(id) => (
                  <TextInput
                    id={id}
                    type="email"
                    autoComplete="username"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                  />
                )}
              </Field>
              <Field label="Password">
                {(id) => (
                  <TextInput
                    id={id}
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                )}
              </Field>
            </div>
            {message ? <p className="mt-2 text-[12.5px] text-ink-2">{message}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="primary"
                disabled={busy || !emailInput || !password}
                onClick={async () => {
                  setBusy(true)
                  const ok = await signIn(emailInput, password)
                  setBusy(false)
                  if (ok) {
                    setPassword('')
                    toast.success('Signed in. Your data is syncing.')
                  }
                }}
              >
                Sign in
              </Button>
              <Button
                disabled={busy || !emailInput || !password}
                onClick={async () => {
                  setBusy(true)
                  const ok = await signUp(emailInput, password)
                  setBusy(false)
                  if (ok) {
                    setPassword('')
                    toast.success('Account created and signed in.')
                  }
                }}
              >
                Create the account
              </Button>
              <Button
                onClick={async () => {
                  await disconnect()
                  toast.info('Project removed. Data stays on this device.')
                }}
              >
                Use a different project
              </Button>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-muted">
              Create the account once, then turn off sign-ups in Supabase under Authentication
              &rarr; Providers, so nobody else can register against your store.
            </p>
          </>
        ) : (
          <>
            <div className="rounded-2xl bg-surface shadow-(--shadow-inset-sm) px-4 py-3">
              <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
                <Cloud size={15} aria-hidden />
                {email}
              </p>
              <p className="mt-1 text-[12px] text-ink-2">
                {state === 'offline'
                  ? 'No connection. Changes are kept here and go up when you are back online.'
                  : 'Changes sync automatically.'}
                {lastSyncedAt ? ` Last synced ${fmt.dateTime(lastSyncedAt)}.` : ''}
                {pendingCount > 0 ? ` ${pendingCount} waiting to go up.` : ''}
              </p>
              {message && state !== 'conflict' ? (
                <p className="mt-2 text-[12px] text-critical">{message}</p>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => void syncNow()} disabled={state === 'syncing'}>
                <RefreshCw size={15} aria-hidden />
                {state === 'syncing' ? 'Syncing…' : 'Sync now'}
              </Button>
              <Button
                onClick={async () => {
                  await signOut()
                  toast.info('Signed out. Data stays on this device.')
                }}
              >
                <LogOut size={15} aria-hidden />
                Sign out
              </Button>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-muted">
              If you edit on two devices at once, the last save wins. The app will stop and ask
              rather than quietly overwriting work it has not sent yet.
            </p>
          </>
        )}
      </CardBody>
    </Card>
  )
}
