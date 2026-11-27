import { useMemo, useState } from 'react'
import { formatTime } from '../format'
import type { TouchedFile, TouchKind } from '../files'
import { useSession } from './SessionContext'

const KIND_LABELS: Record<TouchKind, string> = {
    read: 'Read',
    edit: 'Edited',
    write: 'Wrote',
    delete: 'Deleted',
}

export function FilesPanel({ files }: { files: TouchedFile[] }) {
    const { jumpTo } = useSession()
    const [query, setQuery] = useState('')
    const [openPath, setOpenPath] = useState<string>()
    const [changedOnly, setChangedOnly] = useState(false)

    const shown = useMemo(() => {
        const needle = query.trim().toLowerCase()
        return files.filter((file) => (!changedOnly || file.changes > 0) && (!needle || file.path.toLowerCase().includes(needle)))
    }, [files, query, changedOnly])

    const changedCount = files.filter((file) => file.changes > 0).length

    return (
        <div className="files">
            <div className="files__header">
                <h2 className="panel__title">Files touched</h2>
                <span className="muted small">
                    {files.length} files · {changedCount} changed
                </span>
            </div>
            <input className="search search--small" type="search" placeholder="Filter by path" value={query} onChange={(event) => setQuery(event.target.value)} />
            <label className="toggle small">
                <input type="checkbox" checked={changedOnly} onChange={() => setChangedOnly(!changedOnly)} />
                Only changed files
            </label>
            {files.length === 0 && <p className="muted small">No file reads or edits in this log. Shell commands are not counted, since which files they touch cannot be read reliably.</p>}
            <ul className="files__list">
                {shown.map((file) => {
                    const open = openPath === file.path
                    const name = file.path.split('/').pop() ?? file.path
                    const dir = file.path.slice(0, file.path.length - name.length)
                    return (
                        <li key={file.path} className={`files__item${open ? ' is-open' : ''}`}>
                            <button type="button" className="files__row" onClick={() => setOpenPath(open ? undefined : file.path)} aria-expanded={open} title={file.path}>
                                <span className="files__path">
                                    <span className="files__name">{name}</span>
                                    {dir && <span className="files__dir">{dir}</span>}
                                </span>
                                <span className="files__counts">
                                    {file.changes > 0 && <span className="pill pill--change">{file.changes} changed</span>}
                                    {file.reads > 0 && <span className="pill">{file.reads} read</span>}
                                </span>
                            </button>
                            {open && (
                                <ol className="files__touches">
                                    {file.touches.map((touch) => (
                                        <li key={touch.tool.id}>
                                            <button type="button" className="files__touch" onClick={() => jumpTo(touch.tool.id)}>
                                                <span className={`files__kind files__kind--${touch.kind}`}>{KIND_LABELS[touch.kind]}</span>
                                                <span className="muted">{formatTime(touch.tool.timestamp)}</span>
                                                {touch.subagent && <span className="badge">{touch.subagent}</span>}
                                                {touch.failed && <span className="text-error">failed</span>}
                                            </button>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}
