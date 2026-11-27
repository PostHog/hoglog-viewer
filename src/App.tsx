import { useCallback, useEffect, useRef, useState } from 'react'
import { Viewer } from './components/Viewer'
import { parseLogFiles, type LogFile } from './parse'
import type { Session } from './parse/types'

interface Loaded {
    name: string
    session: Session
}

export function App() {
    const [loaded, setLoaded] = useState<Loaded>()
    const [error, setError] = useState<string>()
    const [dragging, setDragging] = useState(false)
    const fileInput = useRef<HTMLInputElement>(null)

    const load = useCallback((files: LogFile[]) => {
        const logs = files.filter((file) => !file.name.endsWith('.meta.json'))
        const name = logs.length > 1 ? `${logs[0].name} + ${logs.length - 1} more` : (logs[0]?.name ?? 'log')
        try {
            const session = parseLogFiles(files)
            setLoaded({ name, session })
            setError(undefined)
            document.title = `${session.title ?? name} · Agent log viewer`
            window.scrollTo(0, 0)
        } catch (caught) {
            setError(`Could not read ${name}: ${caught instanceof Error ? caught.message : String(caught)}`)
        }
    }, [])

    const loadFiles = useCallback(
        async (list: FileList | File[] | undefined | null) => {
            const files = [...(list ?? [])]
            if (files.length) {
                // The main log first, so a lone subagent file is never mistaken for it.
                files.sort((a, b) => Number(a.name.startsWith('agent-')) - Number(b.name.startsWith('agent-')))
                load(await Promise.all(files.map(async (file) => ({ name: file.name, text: await file.text() }))))
            }
        },
        [load]
    )

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
                <div className="topbar__brand">Agent log viewer</div>
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
                    {loaded && (
                        <button type="button" className="button" onClick={() => fileInput.current?.click()}>
                            Open another log
                        </button>
                    )}
                </div>
                {picker}
            </header>

            {error && <p className="banner banner--error">{error}</p>}

            {loaded ? (
                <Viewer key={loaded.name + loaded.session.items.length} session={loaded.session} />
            ) : (
                <div className="landing">
                    <button type="button" className={`dropzone${dragging ? ' is-dragging' : ''}`} onClick={() => fileInput.current?.click()}>
                        <span className="dropzone__title">Drop an agent log here</span>
                        <span className="muted">or click to choose files, or paste a log's contents</span>
                    </button>
                    <div className="formats">
                        <h2>Supported formats</h2>
                        <ul>
                            <li>
                                <strong>Claude Code</strong> session files (<code>~/.claude/projects/…/&lt;session&gt;.jsonl</code>) and <code>/export</code> text
                            </li>
                            <li>
                                <strong>Codex CLI</strong> rollouts (<code>~/.codex/sessions/…/rollout-*.jsonl</code>)
                            </li>
                            <li>
                                <strong>Message lists</strong> in JSON: OpenAI chat, Anthropic Messages, Vercel AI SDK, Gemini, and Claude.ai exports
                            </li>
                            <li>
                                <strong>Markdown chat exports</strong> with speaker headings, such as Cursor's <em>Export chat</em>
                            </li>
                        </ul>
                        <p className="muted">Anything else opens as raw records, so nothing is lost.</p>
                        <p className="muted">
                            Claude Code saves each subagent in its own file, under <code>&lt;session&gt;/subagents/</code>. Select the main log and those files together to see subagents nested under the call that started them.
                        </p>
                    </div>
                </div>
            )}
            {dragging && loaded && <div className="drop-overlay">Drop to open this log</div>}
        </div>
    )
}
