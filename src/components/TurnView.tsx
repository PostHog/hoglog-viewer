import { memo, useState } from 'react'
import { between, formatDuration, formatTime } from '../format'
import type { Item, Turn } from '../parse/types'
import { ItemView, UserMessage } from './ItemView'

export interface TurnViewProps {
    turn: Turn
    items: Item[]
    showPrompt: boolean
    expandTools: boolean
}

export const TurnView = memo(function TurnView({ turn, items, showPrompt, expandTools }: TurnViewProps) {
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
                </span>
            </header>
            {turn.prompt && showPrompt && <UserMessage item={turn.prompt} />}
            {!collapsed && (
                <div className="turn__items">
                    {items.map((item) => (
                        <ItemView key={`${item.id}-${expandTools}`} item={item} expandTools={expandTools} />
                    ))}
                </div>
            )}
            {collapsed && items.length > 0 && <p className="muted turn__hidden">{items.length} items hidden</p>}
        </section>
    )
})
