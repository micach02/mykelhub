import { AlertTriangle, Check, FileJson, FolderOpen, Save, Unlink } from 'lucide-react'
import { Card, CardBody, CardHeader } from '../ui/Card'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { toast } from '../ui/Toast'
import { useFileSync } from '../../lib/fileSync'
import { useFormat } from '../../lib/useFormat'

/**
 * Connecting the store to a JSON file on disk. Everything still works without
 * it — this is about where the data lives, not whether the app runs.
 */
export function DataFileCard() {
  const fmt = useFormat()
  const state = useFileSync((s) => s.state)
  const fileName = useFileSync((s) => s.fileName)
  const lastSavedAt = useFileSync((s) => s.lastSavedAt)
  const message = useFileSync((s) => s.message)
  const connectNew = useFileSync((s) => s.connectNew)
  const connectExisting = useFileSync((s) => s.connectExisting)
  const grantPermission = useFileSync((s) => s.grantPermission)
  const disconnect = useFileSync((s) => s.disconnect)
  const saveNow = useFileSync((s) => s.saveNow)

  const connected = state === 'ready' || state === 'saving'

  return (
    <Card className="mt-4">
      <CardHeader
        title="Data file"
        subtitle="Keep everything in a JSON file on this computer instead of only in the browser."
        action={
          connected ? (
            <Badge tone="good" icon={<Check size={12} aria-hidden />}>
              {state === 'saving' ? 'Saving' : 'Saving to file'}
            </Badge>
          ) : state === 'needs-permission' ? (
            <Badge tone="warning" icon={<AlertTriangle size={12} aria-hidden />}>
              Needs permission
            </Badge>
          ) : state === 'error' ? (
            <Badge tone="critical" icon={<AlertTriangle size={12} aria-hidden />}>
              Problem
            </Badge>
          ) : (
            <Badge tone="neutral">Browser storage only</Badge>
          )
        }
      />
      <CardBody>
        {state === 'unsupported' ? (
          <p className="text-[13px] leading-relaxed text-ink-2">
            This browser cannot write to a file directly. Chrome and Edge on a computer can.
            Everything still works here, the data is kept in the browser, and{' '}
            <span className="font-medium text-ink">Export backup</span> below writes the same
            JSON by hand.
          </p>
        ) : (
          <>
            <div className="rounded-2xl bg-surface shadow-(--shadow-inset-sm) px-4 py-3">
              {connected ? (
                <>
                  <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
                    <FileJson size={15} aria-hidden />
                    {fileName}
                  </p>
                  <p className="mt-1 text-[12px] text-ink-2">
                    Every change is written to this file automatically.
                    {lastSavedAt ? ` Last saved ${fmt.dateTime(lastSavedAt)}.` : ''}
                  </p>
                </>
              ) : state === 'needs-permission' ? (
                <>
                  <p className="text-[13px] font-medium text-ink">{fileName}</p>
                  <p className="mt-1 text-[12px] text-ink-2">
                    The browser forgets file permission between visits. Allow it again to carry
                    on saving. Until then, changes are kept in the browser only.
                  </p>
                </>
              ) : (
                <p className="text-[13px] leading-relaxed text-ink-2">
                  Right now the data lives in this browser, and clearing site data would wipe
                  it. Choose a file and it is written to disk on every change instead, which
                  also makes it easy to back up or move to another computer.
                </p>
              )}
              {message ? <p className="mt-2 text-[12px] text-critical">{message}</p> : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {state === 'needs-permission' ? (
                <Button variant="primary" onClick={() => void grantPermission()}>
                  Allow access again
                </Button>
              ) : null}

              {!connected ? (
                <>
                  <Button variant="primary" onClick={() => void connectNew()}>
                    <FileJson size={15} aria-hidden />
                    Create a data file
                  </Button>
                  <Button onClick={() => void connectExisting()}>
                    <FolderOpen size={15} aria-hidden />
                    Open an existing one
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    onClick={async () => {
                      await saveNow()
                      toast.success('Saved to the data file.')
                    }}
                  >
                    <Save size={15} aria-hidden />
                    Save now
                  </Button>
                  <Button
                    onClick={async () => {
                      await disconnect()
                      toast.info('Disconnected. The data stays in the browser.')
                    }}
                  >
                    <Unlink size={15} aria-hidden />
                    Disconnect
                  </Button>
                </>
              )}
            </div>

            <p className="mt-3 text-[12px] leading-relaxed text-muted">
              Keep the file somewhere private and backed up: it holds your customers' names,
              numbers and what they owe. If you publish this app, keep the data file well away
              from the published folder.
            </p>
          </>
        )}
      </CardBody>
    </Card>
  )
}
