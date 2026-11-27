import { useCallback, useEffect, useRef, useState } from 'react'
import { Viewer } from './components/Viewer'
import { parseLogFiles, type LogFile } from './parse'
import type { Session } from './parse/types'
import { HANDOFF_HASH, HANDOFF_VERSION, READY_MESSAGE, readHandoff } from './handoff'

const HANDOFF_TIMEOUT_MS = 15_000
const HANDOFF_LOST = 'Nothing arrived from PostHog Admin. Go back to the transcript and click Open in Hoglog viewer again.'

/** The main log first, so a subagent file is never mistaken for it. */
function mainLogFirst(files: LogFile[]): LogFile[] {
    return [...files].sort((a, b) => Number(a.name.startsWith('agent-')) - Number(b.name.startsWith('agent-')))
}

interface Loaded {
    name: string
    session: Session
}

export function App() {
    const [loaded, setLoaded] = useState<Loaded>()
    const [error, setError] = useState<string>()
    const [dragging, setDragging] = useState(false)
    // Read once, before the effect below clears the hash from the address bar.
    const [handoffRequested] = useState(() => window.location.hash === HANDOFF_HASH)
    const [handoffWaiting, setHandoffWaiting] = useState(handoffRequested)
    const fileInput = useRef<HTMLInputElement>(null)

    const load = useCallback((files: LogFile[]) => {
        const logs = files.filter((file) => !file.name.endsWith('.meta.json'))
        const name = logs.length > 1 ? `${logs[0].name} + ${logs.length - 1} more` : (logs[0]?.name ?? 'log')
        try {
            const session = parseLogFiles(files)
            setLoaded({ name, session })
            setError(undefined)
            document.title = `${session.title ?? name} · Hoglog viewer`
            window.scrollTo(0, 0)
        } catch (caught) {
            setError(`Could not read ${name}: ${caught instanceof Error ? caught.message : String(caught)}`)
        }
    }, [])

    const loadFiles = useCallback(
        async (list: FileList | File[] | undefined | null) => {
            const files = [...(list ?? [])]
            if (files.length) {
                load(mainLogFirst(await Promise.all(files.map(async (file) => ({ name: file.name, text: await file.text() })))))
            }
        },
        [load]
    )

    // Opened by PostHog Admin: say we are ready, then accept the transcript it posts to this tab.
    useEffect(() => {
        if (!handoffRequested) {
            return
        }
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
        const opener: unknown = window.opener
        if (!opener) {
            setHandoffWaiting(false)
            setError(HANDOFF_LOST)
            return
        }
        let received = false
        const onMessage = (event: MessageEvent): void => {
            const files = readHandoff(event, opener)
            if (files) {
                received = true
                setHandoffWaiting(false)
                load(mainLogFirst(files))
            }
        }
        window.addEventListener('message', onMessage)
        window.opener.postMessage({ type: READY_MESSAGE, version: HANDOFF_VERSION }, '*')
        const timeout = window.setTimeout(() => {
            if (!received) {
                setHandoffWaiting(false)
                setError(HANDOFF_LOST)
            }
        }, HANDOFF_TIMEOUT_MS)
        return () => {
            window.removeEventListener('message', onMessage)
            window.clearTimeout(timeout)
        }
    }, [handoffRequested, load])

    useEffect(() => {
        const onDragOver = (event: DragEvent): void => {
            event.preventDefault()
            setDragging(true)
        }
        const onDragLeave = (event: DragEvent): void => {
            if (!event.relatedTarget) {
                setDragging(false)
            }
        }
        const onDrop = (event: DragEvent): void => {
            event.preventDefault()
            setDragging(false)
            void loadFiles(event.dataTransfer?.files)
        }
        const onPaste = (event: ClipboardEvent): void => {
            const target = event.target as HTMLElement | null
            if (target?.closest('input, textarea')) {
                return
            }
            if (event.clipboardData?.files.length) {
                void loadFiles(event.clipboardData.files)
                return
            }
            const text = event.clipboardData?.getData('text/plain')
            if (text?.trim()) {
                load([{ name: 'Pasted text', text }])
            }
        }
        window.addEventListener('dragover', onDragOver)
        window.addEventListener('dragleave', onDragLeave)
        window.addEventListener('drop', onDrop)
        window.addEventListener('paste', onPaste)
        return () => {
            window.removeEventListener('dragover', onDragOver)
            window.removeEventListener('dragleave', onDragLeave)
            window.removeEventListener('drop', onDrop)
            window.removeEventListener('paste', onPaste)
        }
    }, [load, loadFiles])

    const picker = (
        <input
            ref={fileInput}
            type="file"
            hidden
            multiple
            accept=".jsonl,.json,.md,.txt,.log,application/json,text/plain,text/markdown"
            onChange={(event) => {
                void loadFiles(event.target.files)
                event.target.value = ''
            }}
        />
    )

    return (
        <div className="app">
            <header className="topbar">
                <div className="topbar__brand">
                    <img className="topbar__logo" src={`${import.meta.env.BASE_URL}logo.png`} alt="" width={28} height={28} />
                    Hoglog viewer
                </div>
                {loaded && (
                    <div className="topbar__file">
                        <span className="topbar__title">{loaded.session.title ?? loaded.name}</span>
                        <span className="muted">
                            {loaded.name} · {loaded.session.format}
                            {loaded.session.skipped ? ` · ${loaded.session.skipped} unreadable lines skipped` : ''}
                        </span>
                    </div>
                )}
                <div className="topbar__actions">
                    <span className="privacy-note" title="The file is read with the browser's File API and never sent over the network">
                        Files stay in your browser
                    </span>
                    <button type="button" className="button" onClick={() => fileInput.current?.click()}>
                        {loaded ? 'Open another log' : 'Open a log'}
                    </button>
                </div>
                {picker}
            </header>

            {error && <p className="banner banner--error">{error}</p>}

            <Viewer
                key={loaded ? loaded.name + loaded.session.items.length : 'empty'}
                session={loaded?.session}
                dragging={dragging}
                loading={handoffWaiting}
                onOpenFiles={() => fileInput.current?.click()}
            />
            {dragging && loaded && <div className="drop-overlay">Drop to open this log</div>}
        </div>
    )
}
