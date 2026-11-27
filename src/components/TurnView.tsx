import { memo, useState } from 'react'
import { between, formatDuration, formatTime } from '../format'
import type { Item, Turn } from '../parse/types'
import { ItemView, UserMessage } from './ItemView'

export interface TurnViewProps {
    turn: Turn
    items: Item[]
    showPrompt: boolean
    expandTools: boolean
    /** Time between the previous turn's last activity and this prompt. */
    userWaitMs?: number
}

const GAP_MARKER_MS = 20_000

function itemEnd(item: Item): string | undefined {
    return item.kind === 'tool' ? (item.result?.timestamp ?? item.timestamp) : item.timestamp
}

export const TurnView = memo(function TurnView({ turn, items, showPrompt, expandTools, userWaitMs }: TurnViewProps) {
    const [collapsed, setCollapsed] = useState(false)
    const toolCount = turn.items.filter((item) => item.kind === 'tool').length
    const errorCount = turn.items.filter((item) => item.kind === 'tool' && item.result?.isError).length
    const duration = between(turn.startedAt, turn.endedAt)

    return (
        <section className="turn" id={`turn-${turn.index}`} data-turn={turn.index}>
            <header className="turn__header">
                <button type="button" className="turn__toggle" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed}>
                    {collapsed ? '▸' : '▾'} {turn.prompt ? `Turn ${turn.number}` : 'Session start'}
                </button>
                <span className="turn__stats">
                    {formatTime(turn.startedAt)}
                    {duration ? ` · ${formatDuration(duration)}` : ''}
                    {toolCount ? ` · ${toolCount} tool ${toolCount === 1 ? 'call' : 'calls'}` : ''}
                    {errorCount ? <span className="text-error"> · {errorCount} failed</span> : null}
                    {userWaitMs !== undefined && userWaitMs >= GAP_MARKER_MS ? ` · sent ${formatDuration(userWaitMs)} after the previous turn` : ''}
                </span>
            </header>
            {turn.prompt && showPrompt && <UserMessage item={turn.prompt} />}
            {!collapsed && (
                <div className="turn__items">
                    {items.map((item, index) => {
                        const previousEnd = index === 0 ? turn.prompt?.timestamp : itemEnd(items[index - 1])
                        const gap = between(previousEnd, item.timestamp)
                        return (
                            <div key={`${item.id}-${expandTools}`} id={`item-${item.id}`} className="item-anchor">
                                {gap !== undefined && gap >= GAP_MARKER_MS && <div className="gap-marker">{formatDuration(gap)} later</div>}
                                <ItemView item={item} expandTools={expandTools} />
                            </div>
                        )
                    })}
                </div>
            )}
            {collapsed && items.length > 0 && <p className="muted turn__hidden">{items.length} items hidden</p>}
        </section>
    )
})
