import { memo, useState } from 'react'
import { between, formatDuration, formatTime, truncate } from '../format'
import type { Item, Turn } from '../parse/types'
import { ItemList, PromptEntry } from './ItemList'
import { UserMessage } from './ItemView'

export interface TurnViewProps {
    turn: Turn
    items: Item[]
    showPrompt: boolean
    expandTools: boolean
    /** Time between the previous turn's last activity and this prompt. */
    userWaitMs?: number
}

const GAP_MARKER_MS = 20_000

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
                {collapsed && turn.prompt && (
                    <button type="button" className="turn__preview" onClick={() => setCollapsed(false)} title="Expand this turn">
                        {truncate(turn.prompt.text || '(image)', 140)}
                    </button>
                )}
            </header>
            {!collapsed && turn.prompt && showPrompt && (
                <PromptEntry timestamp={turn.prompt.timestamp}>
                    <UserMessage item={turn.prompt} />
                </PromptEntry>
            )}
            {!collapsed && (
                <div className="turn__items">
                    <ItemList items={items} startedAt={turn.prompt?.timestamp} expandTools={expandTools} />
                </div>
            )}
        </section>
    )
})
