import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { parseToolName } from '../format'
import { groupTurns } from '../parse'
import type { Item, Session } from '../parse/types'
import { ServerBadge } from './ServerBadge'
import { ServerColorsProvider } from './ServerColors'
import { Sidebar } from './Sidebar'
import { TurnView } from './TurnView'

interface Filters {
    tools: boolean
    thinking: boolean
    context: boolean
    subagents: boolean
}

const FILTER_LABELS: Record<keyof Filters, string> = {
    tools: 'Tool calls',
    thinking: 'Thinking',
    context: 'Injected context',
    subagents: 'Subagents',
}

export function Viewer({ session }: { session: Session }) {
    const turns = useMemo(() => groupTurns(session.items), [session])
    const [filters, setFilters] = useState<Filters>({ tools: true, thinking: true, context: false, subagents: true })
    const [query, setQuery] = useState('')
    const deferredQuery = useDeferredValue(query.trim().toLowerCase())
    const [expandTools, setExpandTools] = useState(false)
    const [activeTurn, setActiveTurn] = useState<number>()
    const [server, setServer] = useState<string>()

    const haystacks = useMemo(() => {
        const map = new Map<string, string>()
        for (const item of session.items) {
            map.set(item.id, searchText(item).toLowerCase())
        }
        return map
    }, [session])

    const visibleTurns = useMemo(() => {
        const keep = (item: Item): boolean => {
            if (server && !(item.kind === 'tool' && parseToolName(item.name).server === server)) {
                return false
            }
            if (item.sidechain && !filters.subagents) {
                return false
            }
            if ((item.kind === 'tool' && !filters.tools) || (item.kind === 'thinking' && !filters.thinking) || (item.kind === 'context' && !filters.context)) {
                return false
            }
            return !deferredQuery || (haystacks.get(item.id)?.includes(deferredQuery) ?? false)
        }
        return turns
            .map((turn) => {
                const promptMatches = server ? false : !deferredQuery || (turn.prompt ? (haystacks.get(turn.prompt.id)?.includes(deferredQuery) ?? false) : false)
                const items = turn.items.filter(keep)
                return { turn, items, visible: items.length > 0 || (Boolean(turn.prompt) && promptMatches) }
            })
            .filter((entry) => entry.visible)
    }, [turns, filters, deferredQuery, haystacks, server])

    const matchCount = deferredQuery || server ? visibleTurns.reduce((sum, entry) => sum + entry.items.length, 0) : 0

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
                if (visible[0]) {
                    setActiveTurn(Number((visible[0].target as HTMLElement).dataset.turn))
                }
            },
            { rootMargin: '-80px 0px -60% 0px' }
        )
        document.querySelectorAll('[data-turn]').forEach((element) => observer.observe(element))
        return () => observer.disconnect()
    }, [visibleTurns])

    const jump = (index: number): void => {
        document.getElementById(`turn-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    return (
        <ServerColorsProvider>
        <div className="viewer">
            <Sidebar session={session} turns={turns} activeTurn={activeTurn} onJump={jump} server={server} onServerChange={setServer} />
            <main className="timeline">
                <div className="toolbar">
                    <input className="search" type="search" placeholder="Search prompts, replies, commands and output" value={query} onChange={(event) => setQuery(event.target.value)} />
                    <div className="toggles">
                        {(Object.keys(FILTER_LABELS) as (keyof Filters)[]).map((key) => (
                            <label key={key} className="toggle">
                                <input type="checkbox" checked={filters[key]} onChange={() => setFilters({ ...filters, [key]: !filters[key] })} />
                                {FILTER_LABELS[key]}
                            </label>
                        ))}
                        <button type="button" className="button button--small" onClick={() => setExpandTools(!expandTools)}>
                            {expandTools ? 'Collapse tool calls' : 'Expand tool calls'}
                        </button>
                    </div>
                    {server && (
                        <div className="active-filter">
                            Only calls to <ServerBadge server={server} />
                            <button type="button" className="link-button" onClick={() => setServer(undefined)}>
                                Show everything
                            </button>
                        </div>
                    )}
                    {(deferredQuery || server) && (
                        <p className="muted small">
                            {matchCount} matching {matchCount === 1 ? 'item' : 'items'} in {visibleTurns.length} {visibleTurns.length === 1 ? 'turn' : 'turns'}
                        </p>
                    )}
                </div>
                {visibleTurns.length === 0 && <p className="empty">Nothing matches the current search and filters.</p>}
                {visibleTurns.map(({ turn, items }) => (
                    <TurnView key={turn.index} turn={turn} items={items} showPrompt expandTools={expandTools} />
                ))}
            </main>
        </div>
        </ServerColorsProvider>
    )
}

function searchText(item: Item): string {
    switch (item.kind) {
        case 'tool':
            return `${item.name}\n${typeof item.input === 'string' ? item.input : JSON.stringify(item.input)}\n${item.result?.text ?? ''}`
        case 'event':
            return `${item.label}\n${item.detail ?? ''}`
        case 'context':
            return `${item.label}\n${item.text}`
        default:
            return item.text
    }
}
