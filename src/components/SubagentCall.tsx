import { useEffect, useState } from 'react'
import { between, formatDuration, truncate } from '../format'
import type { ToolItem } from '../parse/types'
import { isObject } from '../parse/util'
import { ItemList } from './ItemList'
import { LongText } from './LongText'
import { Markdown } from './Markdown'
import { useSession } from './SessionContext'

/** A call that started a subagent, with the subagent's own transcript nested inside when it was loaded. */
export function SubagentCall({ tool, expandTools }: { tool: ToolItem; expandTools: boolean }) {
    const { subagents, subagentItemIds, focus, showItem } = useSession()
    const run = tool.subagentId ? subagents.get(tool.subagentId) : undefined
    const [open, setOpen] = useState(false)
    const [showPrompt, setShowPrompt] = useState(false)

    useEffect(() => {
        if (focus && run && subagentItemIds.get(run.agentId)?.has(focus.itemId)) {
            setOpen(true)
        }
    }, [focus, run, subagentItemIds])

    const input = isObject(tool.input) ? tool.input : {}
    const description = run?.description ?? (typeof input.description === 'string' ? input.description : 'Subagent')
    const agentType = run?.agentType ?? (typeof input.subagent_type === 'string' ? input.subagent_type : undefined)
    const prompt = typeof input.prompt === 'string' ? input.prompt : undefined
    const allItems = run?.session.items ?? []
    // The transcript opens with the instructions it was given, already shown behind the toggle above.
    const items = prompt && allItems[0]?.kind === 'user' ? allItems.slice(1) : allItems
    const tools = items.filter((item): item is ToolItem => item.kind === 'tool')
    const failed = tools.filter((item) => item.result?.isError).length
    const first = items.find((item) => item.timestamp)?.timestamp
    const last = [...items].reverse().find((item) => item.timestamp)?.timestamp
    const duration = between(first, last)
    const finalReply = [...items].reverse().find((item) => item.kind === 'assistant')

    return (
        <div className={`subagent${open ? ' is-open' : ''}`}>
            <button type="button" className="subagent__head" onClick={() => setOpen(!open)} aria-expanded={open}>
                <span className="tool__chevron" aria-hidden>
                    {open ? '▾' : '▸'}
                </span>
                <span className="subagent__badge">Subagent</span>
                <span className="subagent__title">{description}</span>
                {agentType && <span className="badge">{agentType}</span>}
                <span className="tool__meta">
                    {run ? (
                        <>
                            <span>
                                {tools.length} tool {tools.length === 1 ? 'call' : 'calls'}
                            </span>
                            {failed > 0 && <span className="text-error">{failed} failed</span>}
                            {duration !== undefined && <span>{formatDuration(duration)}</span>}
                        </>
                    ) : (
                        <span>transcript not loaded</span>
                    )}
                </span>
            </button>
            {!open && finalReply && finalReply.kind === 'assistant' && <p className="subagent__preview">{truncate(finalReply.text, 220)}</p>}
            {open && (
                <div className="subagent__body">
                    {prompt && (
                        <div className="subagent__prompt">
                            <button type="button" className="link-button" onClick={() => setShowPrompt(!showPrompt)}>
                                {showPrompt ? 'Hide the instructions it was given' : 'Show the instructions it was given'}
                            </button>
                            {showPrompt && <Markdown text={prompt} />}
                        </div>
                    )}
                    {run ? (
                        <div className="subagent__items">
                            <ItemList items={items.filter(showItem)} expandTools={expandTools} />
                        </div>
                    ) : (
                        <p className="muted small">
                            Claude Code keeps each subagent's transcript in its own file. To see this one, open the main log together with{' '}
                            <code>{tool.subagentId ? `agent-${tool.subagentId}.jsonl` : 'its agent-*.jsonl file'}</code> from the session's <code>subagents/</code> folder.
                        </p>
                    )}
                    {tool.result && (
                        <>
                            <div className="tool__section-label">Returned to the main agent</div>
                            <LongText text={tool.result.text} className={tool.result.isError ? 'is-error' : undefined} />
                        </>
                    )}
                </div>
            )}
        </div>
    )
}
