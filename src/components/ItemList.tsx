import { Fragment } from 'react'
import { between, formatDuration, formatTime } from '../format'
import { isAgentTool } from '../parse'
import type { Item } from '../parse/types'
import { ItemView } from './ItemView'

const GAP_MARKER_MS = 20_000

interface Entry {
    item: Item
    /** Reasoning the log only keeps as a signature, shown as time spent before this step. */
    thoughtMs?: number
}

function itemEnd(item: Item): string | undefined {
    return item.kind === 'tool' ? (item.result?.timestamp ?? item.timestamp) : item.timestamp
}

function isPlainTool(item: Item | undefined): boolean {
    return item?.kind === 'tool' && !isAgentTool(item)
}

/** Folds unreadable thinking into the next step, so it shows as time rather than as its own row. */
function toEntries(items: Item[]): Entry[] {
    const entries: Entry[] = []
    let pendingThought = 0
    for (const item of items) {
        if (item.kind === 'thinking' && !item.text.trim()) {
            pendingThought += item.durationMs ?? 0
            continue
        }
        entries.push({ item, thoughtMs: pendingThought || undefined })
        pendingThought = 0
    }
    return entries
}

/**
 * Items in order on a time gutter. Each is an anchor the timeline and the files panel can jump to,
 * back-to-back tool calls join into one block, and a pause of 20 seconds or more splits them.
 */
export function ItemList({ items, startedAt, expandTools }: { items: Item[]; startedAt?: string; expandTools: boolean }) {
    const entries = toEntries(items)
    const gaps = entries.map((entry, index) => between(index === 0 ? startedAt : itemEnd(entries[index - 1].item), entry.item.timestamp))
    const paused = gaps.map((gap) => gap !== undefined && gap >= GAP_MARKER_MS)

    return (
        <>
            {entries.map((entry, index) => {
                const { item } = entry
                const joinsPrevious = isPlainTool(item) && isPlainTool(entries[index - 1]?.item) && !paused[index]
                const joinsNext = isPlainTool(item) && isPlainTool(entries[index + 1]?.item) && !paused[index + 1]
                const sincePrevious = joinsPrevious ? between(entries[index - 1].item.timestamp, item.timestamp) : undefined
                const time = item.timestamp ? Date.parse(item.timestamp) : undefined
                const className = ['entry', `entry--${item.kind}`, joinsPrevious ? 'joins-previous' : '', joinsNext ? 'joins-next' : ''].filter(Boolean).join(' ')
                return (
                    <Fragment key={`${item.id}-${expandTools}`}>
                        {paused[index] && <div className="gap-marker">{formatDuration(gaps[index])} later</div>}
                        <div id={`item-${item.id}`} className={`item-anchor ${className}`} data-time={Number.isFinite(time) ? time : undefined}>
                            <div className="entry__gutter">
                                <span className="entry__time">{sincePrevious !== undefined ? `+${formatDuration(sincePrevious) || '0s'}` : formatTime(item.timestamp)}</span>
                                {entry.thoughtMs && !isPlainTool(item) ? (
                                    <span className="entry__thought" title="Thinking time before this step. The log keeps only an encrypted signature of the reasoning.">
                                        think {formatDuration(entry.thoughtMs)}
                                    </span>
                                ) : null}
                            </div>
                            <div className="entry__body">
                                <ItemView item={item} expandTools={expandTools} thoughtMs={isPlainTool(item) ? entry.thoughtMs : undefined} />
                            </div>
                        </div>
                    </Fragment>
                )
            })}
        </>
    )
}

/** The prompt that opens a turn, on the same gutter as the items under it. */
export function PromptEntry({ timestamp, children }: { timestamp?: string; children: React.ReactNode }) {
    return (
        <div className="entry entry--prompt">
            <div className="entry__gutter">
                <span className="entry__time">{formatTime(timestamp)}</span>
            </div>
            <div className="entry__body">{children}</div>
        </div>
    )
}
