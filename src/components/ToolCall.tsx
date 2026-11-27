import { between, formatDuration, toolDisplayName, toolSummary } from '../format'
import type { ToolItem } from '../parse/types'
import { isObject } from '../parse/util'
import { LongText } from './LongText'

export function ToolCall({ tool, open, onToggle }: { tool: ToolItem; open: boolean; onToggle: () => void }) {
    const duration = between(tool.timestamp, tool.result?.timestamp)
    const status = !tool.result ? 'pending' : tool.result.isError ? 'error' : 'ok'
    const summary = toolSummary(tool)

    return (
        <div className={`tool tool--${status}${tool.sidechain ? ' is-sidechain' : ''}`}>
            <button type="button" className="tool__head" onClick={onToggle} aria-expanded={open}>
                <span className="tool__chevron" aria-hidden>
                    {open ? '▾' : '▸'}
                </span>
                <span className="tool__name">{toolDisplayName(tool.name)}</span>
                <span className="tool__summary">{summary}</span>
                <span className="tool__meta">
                    {duration !== undefined && duration >= 0 && <span>{formatDuration(duration)}</span>}
                    <span className={`status-dot status-dot--${status}`} title={statusLabel(status)} />
                </span>
            </button>
            {open && (
                <div className="tool__body">
                    <div className="tool__section-label">Input</div>
                    <ToolInput tool={tool} />
                    <div className="tool__section-label">{tool.result?.isError ? 'Error' : 'Result'}</div>
                    {tool.result ? (
                        <>
                            <LongText text={tool.result.text} className={tool.result.isError ? 'is-error' : undefined} />
                            {tool.result.images.map((image, index) => (
                                <img key={index} className="attached-image" src={image.src} alt={`Tool result image ${index + 1}`} />
                            ))}
                        </>
                    ) : (
                        <p className="muted">No result was logged for this call.</p>
                    )}
                </div>
            )}
        </div>
    )
}

function statusLabel(status: string): string {
    return status === 'error' ? 'Returned an error' : status === 'pending' ? 'No result logged' : 'Succeeded'
}

function ToolInput({ tool }: { tool: ToolItem }) {
    const input = tool.input
    if (typeof input === 'string') {
        return <LongText text={input} />
    }
    if (!isObject(input)) {
        return <LongText text={JSON.stringify(input, null, 2) ?? ''} />
    }

    if (typeof input.command === 'string') {
        const { command, ...rest } = input
        return (
            <>
                {typeof rest.description === 'string' && <p className="tool__description">{rest.description}</p>}
                <LongText text={`$ ${command}`} />
                <ExtraFields fields={rest} skip={['description']} />
            </>
        )
    }
    if (typeof input.old_string === 'string' && typeof input.new_string === 'string') {
        return (
            <>
                <p className="tool__path">{String(input.file_path ?? '')}</p>
                <Diff before={input.old_string} after={input.new_string} />
            </>
        )
    }
    if (Array.isArray(input.edits)) {
        return (
            <>
                <p className="tool__path">{String(input.file_path ?? '')}</p>
                {input.edits.filter(isObject).map((edit, index) => (
                    <Diff key={index} before={String(edit.old_string ?? '')} after={String(edit.new_string ?? '')} />
                ))}
            </>
        )
    }
    if (typeof input.content === 'string' && typeof input.file_path === 'string') {
        return (
            <>
                <p className="tool__path">{input.file_path}</p>
                <LongText text={input.content} />
            </>
        )
    }
    if (Array.isArray(input.todos)) {
        return (
            <ul className="todos">
                {input.todos.filter(isObject).map((todo, index) => (
                    <li key={index} className={`todo todo--${String(todo.status ?? 'pending')}`}>
                        <span aria-hidden>{todo.status === 'completed' ? '☑' : todo.status === 'in_progress' ? '◐' : '☐'}</span>{' '}
                        {String(todo.content ?? todo.subject ?? '')}
                    </li>
                ))}
            </ul>
        )
    }
    return <LongText text={JSON.stringify(input, null, 2)} />
}

function ExtraFields({ fields, skip }: { fields: Record<string, unknown>; skip: string[] }) {
    const rest = Object.entries(fields).filter(([key]) => !skip.includes(key))
    if (!rest.length) {
        return null
    }
    return <p className="tool__extra">{rest.map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`).join(' · ')}</p>
}

function Diff({ before, after }: { before: string; after: string }) {
    return (
        <pre className="code diff">
            {before.split('\n').map((line, index) => (
                <span key={`-${index}`} className="diff__del">
                    - {line}
                    {'\n'}
                </span>
            ))}
            {after.split('\n').map((line, index) => (
                <span key={`+${index}`} className="diff__add">
                    + {line}
                    {'\n'}
                </span>
            ))}
        </pre>
    )
}
