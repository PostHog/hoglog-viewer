import { useState } from 'react'
import { formatDuration, formatTime } from '../format'
import type { ContextItem, EventItem, Item, ThinkingItem, UserItem } from '../parse/types'
import { Markdown } from './Markdown'
import { ToolCall } from './ToolCall'

export interface ItemViewProps {
    item: Item
    expandTools: boolean
}

export function ItemView({ item, expandTools }: ItemViewProps) {
    switch (item.kind) {
        case 'user':
            return <UserMessage item={item} />
        case 'assistant':
            return (
                <div className={`message message--assistant${item.sidechain ? ' is-sidechain' : ''}`}>
                    <MessageHeader who={item.sidechain ? 'Subagent' : 'Agent'} timestamp={item.timestamp} />
                    <Markdown text={item.text} />
                </div>
            )
        case 'thinking':
            return <Thinking item={item} />
        case 'tool':
            return <ToolToggle item={item} expandTools={expandTools} />
        case 'context':
            return <Context item={item} />
        case 'event':
            return <Event item={item} />
    }
}

/** Keyed by expandTools in the parent so "expand all" resets every call. */
function ToolToggle({ item, expandTools }: { item: Extract<Item, { kind: 'tool' }>; expandTools: boolean }) {
    const [open, setOpen] = useState(expandTools)
    return <ToolCall tool={item} open={open} onToggle={() => setOpen(!open)} />
}

export function UserMessage({ item }: { item: UserItem }) {
    return (
        <div className={`message message--user${item.sidechain ? ' is-sidechain' : ''}`}>
            <MessageHeader who={item.sidechain ? 'Agent to subagent' : 'User'} timestamp={item.timestamp} badge={item.queued ? 'sent while the agent was busy' : undefined} />
            {item.text && <Markdown text={item.text} />}
            {item.images.map((image, index) => (
                <img key={index} className="attached-image" src={image.src} alt={`Attached image ${index + 1}`} />
            ))}
        </div>
    )
}

function MessageHeader({ who, timestamp, badge }: { who: string; timestamp?: string; badge?: string }) {
    return (
        <div className="message__header">
            <span className="message__who">{who}</span>
            {badge && <span className="badge">{badge}</span>}
            <span className="message__time">{formatTime(timestamp)}</span>
        </div>
    )
}

function Thinking({ item }: { item: ThinkingItem }) {
    const [open, setOpen] = useState(false)
    const label = `Thought${item.durationMs ? ` for ${formatDuration(item.durationMs)}` : ''}`
    if (!item.text.trim()) {
        return (
            <div className="chip chip--thinking" title="The log keeps only an encrypted signature for this reasoning">
                {label} <span className="muted">(not readable in the log)</span>
            </div>
        )
    }
    return (
        <div className="collapsible collapsible--thinking">
            <button type="button" className="chip chip--thinking" onClick={() => setOpen(!open)} aria-expanded={open}>
                {open ? '▾' : '▸'} {label}
            </button>
            {open && <Markdown text={item.text} />}
        </div>
    )
}

function Context({ item }: { item: ContextItem }) {
    const [open, setOpen] = useState(false)
    return (
        <div className="collapsible collapsible--context">
            <button type="button" className="chip chip--context" onClick={() => setOpen(!open)} aria-expanded={open}>
                {open ? '▾' : '▸'} {item.label}
                <span className="muted"> · {item.text.length.toLocaleString()} chars</span>
            </button>
            {open && (
                <div className="context__body">
                    <Markdown text={item.text} />
                </div>
            )}
        </div>
    )
}

function Event({ item }: { item: EventItem }) {
    const isUrl = item.detail?.startsWith('https://')
    return (
        <div className={`event event--${item.tone ?? 'neutral'}`}>
            <span className="event__label">{item.label}</span>
            {item.detail &&
                (isUrl ? (
                    <a href={item.detail} target="_blank" rel="noreferrer noopener">
                        {item.detail}
                    </a>
                ) : (
                    <code className="event__detail">{item.detail}</code>
                ))}
            <span className="event__time">{formatTime(item.timestamp)}</span>
        </div>
    )
}
