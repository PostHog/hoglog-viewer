import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { touchedFiles } from '../files'
import { between, parseToolName } from '../format'
import { groupTurns, isAgentTool } from '../parse'
import type { Item, Session, ToolItem } from '../parse/types'
import { mcpServers } from '../servers'
import { usePersistentState } from '../usePersistentState'
import { Dropzone } from './Dropzone'
import { FilesPanel } from './FilesPanel'
import { ServerBadge } from './ServerBadge'
import { ServerColorsProvider } from './ServerColors'
import { SessionContext, type Focus, type SessionContextValue } from './SessionContext'
import { Sidebar } from './Sidebar'
import { TimelineDock } from './TimelineDock'
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

const DOCK_DEFAULT_PX = 210
const DOCK_MIN_PX = 110
const DOCK_COLLAPSED_PX = 34
const FLASH_MS = 1600
const FIND_ATTEMPTS = 20

const EMPTY_SESSION: Session = { format: '', meta: [], items: [], skipped: 0 }

export interface ViewerProps {
    /** Undefined until a log is open; every panel then shows its empty state. */
    session?: Session
    dragging: boolean
    onOpenFiles: () => void
}

export function Viewer({ session: loadedSession, dragging, onOpenFiles }: ViewerProps) {
    const session = loadedSession ?? EMPTY_SESSION
    const empty = loadedSession === undefined
    const turns = useMemo(() => groupTurns(session.items), [session])
    const subagentRuns = useMemo(() => session.subagents ?? [], [session])
    const allItems = useMemo(() => [...session.items, ...subagentRuns.flatMap((run) => run.session.items)], [session, subagentRuns])
    const servers = useMemo(() => mcpServers(allItems.filter((item): item is ToolItem => item.kind === 'tool')).map((entry) => entry.server), [allItems])
    const files = useMemo(() => touchedFiles(session), [session])

    const [filters, setFilters] = useState<Filters>({ tools: true, thinking: true, context: false, subagents: true })
    const [query, setQuery] = useState('')
    const deferredQuery = useDeferredValue(query.trim().toLowerCase())
    const [expandTools, setExpandTools] = useState(false)
    const [activeTurn, setActiveTurn] = useState<number>()
    const [server, setServer] = useState<string>()
    const [focus, setFocus] = useState<Focus>()
    const [currentTime, setCurrentTime] = useState<number>()
    const [filesOpen, setFilesOpen] = usePersistentState('files-open', false)
    const [dockCollapsed, setDockCollapsed] = usePersistentState('timeline-collapsed', false)
    const [dockHidden, setDockHidden] = usePersistentState('timeline-hidden', false)
    const [dockHeight, setDockHeight] = usePersistentState('timeline-height', DOCK_DEFAULT_PX)
    const thread = useRef<HTMLElement>(null)

    const haystacks = useMemo(() => {
        const map = new Map<string, string>()
        for (const item of allItems) {
            map.set(item.id, searchText(item).toLowerCase())
        }
        return map
    }, [allItems])

    const isSubagentItem = useCallback((item: Item) => item.sidechain === true || (item.kind === 'tool' && isAgentTool(item)), [])

    const visibleTurns = useMemo(() => {
        const keep = (item: Item): boolean => {
            if (server && !(item.kind === 'tool' && parseToolName(item.name).server === server)) {
                return false
            }
            if (!filters.subagents && isSubagentItem(item)) {
                return false
            }
            if ((item.kind === 'tool' && !filters.tools && !isAgentTool(item)) || (item.kind === 'thinking' && !filters.thinking) || (item.kind === 'context' && !filters.context)) {
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
    }, [turns, filters, deferredQuery, haystacks, server, isSubagentItem])

    const isDimmed = useCallback(
        (item: Item): boolean => {
            if (server && !(item.kind === 'tool' && parseToolName(item.name).server === server)) {
                return true
            }
            return Boolean(deferredQuery) && !(haystacks.get(item.id)?.includes(deferredQuery) ?? false)
        },
        [server, deferredQuery, haystacks]
    )

    const matchCount = deferredQuery || server ? visibleTurns.reduce((sum, entry) => sum + entry.items.length, 0) : 0

    const sessionContext = useMemo<SessionContextValue>(() => {
        const subagents = new Map(subagentRuns.map((run) => [run.agentId, run]))
        const subagentItemIds = new Map(subagentRuns.map((run) => [run.agentId, new Set(run.session.items.map((item) => item.id))]))
        return {
            subagents,
            subagentItemIds,
            focus,
            jumpTo: (itemId) => setFocus((current) => ({ itemId, seq: (current?.seq ?? 0) + 1 })),
            showItem: (item) => !((item.kind === 'tool' && !filters.tools) || (item.kind === 'thinking' && !filters.thinking) || (item.kind === 'context' && !filters.context)),
        }
    }, [subagentRuns, focus, filters])

    // Scroll the conversation to the focused item. A subagent's items only exist once its block
    // opens, so keep looking for a few frames before falling back to the nearest visible anchor.
    useEffect(() => {
        if (!focus) {
            return
        }
        let attempts = 0
        let frame = 0
        const find = (): void => {
            const target = document.getElementById(`item-${focus.itemId}`) ?? (attempts >= FIND_ATTEMPTS ? fallbackAnchor(focus.itemId, turns, subagentRuns) : null)
            if (target) {
                target.scrollIntoView({ block: 'center' })
                target.classList.add('is-flashing')
                window.setTimeout(() => target.classList.remove('is-flashing'), FLASH_MS)
                return
            }
            attempts++
            if (attempts <= FIND_ATTEMPTS) {
                frame = requestAnimationFrame(find)
            }
        }
        find()
        return () => cancelAnimationFrame(frame)
    }, [focus, turns, subagentRuns])

    // Track which item sits at the top of the conversation, for the timeline cursor and the outline.
    useEffect(() => {
        const element = thread.current
        if (!element) {
            return
        }
        let frame = 0
        const update = (): void => {
            frame = 0
            const anchors = element.querySelectorAll<HTMLElement>('[data-time]')
            const top = element.getBoundingClientRect().top + 120
            let low = 0
            let high = anchors.length - 1
            let found: HTMLElement | undefined
            while (low <= high) {
                const middle = (low + high) >> 1
                if (anchors[middle].getBoundingClientRect().bottom >= top) {
                    found = anchors[middle]
                    high = middle - 1
                } else {
                    low = middle + 1
                }
            }
            if (found) {
                setCurrentTime(Number(found.dataset.time))
                const turn = found.closest<HTMLElement>('[data-turn]')
                if (turn) {
                    setActiveTurn(Number(turn.dataset.turn))
                }
            }
        }
        const onScroll = (): void => {
            frame ||= requestAnimationFrame(update)
        }
        element.addEventListener('scroll', onScroll, { passive: true })
        update()
        return () => {
            element.removeEventListener('scroll', onScroll)
            cancelAnimationFrame(frame)
        }
    }, [visibleTurns])

    const jumpToTurn = (index: number): void => {
        document.getElementById(`turn-${index}`)?.scrollIntoView({ block: 'start' })
    }

    const startResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
        event.preventDefault()
        const startY = event.clientY
        const startHeight = dockHeight
        const onMove = (move: PointerEvent): void => {
            setDockHeight(Math.min(window.innerHeight * 0.6, Math.max(DOCK_MIN_PX, startHeight - (move.clientY - startY))))
        }
        const onUp = (): void => {
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
        setDockCollapsed(false)
    }

    const layoutStyle = { '--dock-h': `${dockCollapsed ? DOCK_COLLAPSED_PX : dockHeight}px` } as CSSProperties

    return (
        <ServerColorsProvider>
            <SessionContext.Provider value={sessionContext}>
                <div className={`workspace${filesOpen ? ' has-drawer' : ''}${dockHidden ? ' dock-hidden' : ''}`} style={layoutStyle}>
                    <Sidebar empty={empty} session={session} turns={turns} activeTurn={activeTurn} onJump={jumpToTurn} server={server} onServerChange={setServer} />

                    <main className="thread" ref={thread}>
                        {empty ? (
                            <Dropzone dragging={dragging} onOpenFiles={onOpenFiles} />
                        ) : (
                            <>
                                <div className="toolbar">
                                    <input
                                        className="search"
                                        type="search"
                                        placeholder="Search prompts, replies, commands and output"
                                        value={query}
                                        onChange={(event) => setQuery(event.target.value)}
                                    />
                                    <div className="toggles">
                                        {(Object.keys(FILTER_LABELS) as (keyof Filters)[]).map((key) =>
                                            key === 'subagents' && !subagentRuns.length && !session.items.some(isSubagentItem) ? null : (
                                                <label key={key} className="toggle">
                                                    <input type="checkbox" checked={filters[key]} onChange={() => setFilters({ ...filters, [key]: !filters[key] })} />
                                                    {FILTER_LABELS[key]}
                                                </label>
                                            )
                                        )}
                                        {server && (
                                            <span className="active-filter">
                                                Only <ServerBadge server={server} />
                                                <button type="button" className="link-button" onClick={() => setServer(undefined)}>
                                                    Show everything
                                                </button>
                                            </span>
                                        )}
                                        {(deferredQuery || server) && (
                                            <span className="muted small">
                                                {matchCount} {matchCount === 1 ? 'item' : 'items'} in {visibleTurns.length} {visibleTurns.length === 1 ? 'turn' : 'turns'}
                                            </span>
                                        )}
                                        <button type="button" className="button button--small toggles__end" onClick={() => setExpandTools(!expandTools)}>
                                            {expandTools ? 'Collapse tool calls' : 'Expand tool calls'}
                                        </button>
                                    </div>
                                </div>
                                {visibleTurns.length === 0 && <p className="empty">Nothing matches the current search and filters.</p>}
                                {visibleTurns.map(({ turn, items }) => (
                                    <TurnView
                                        key={turn.index}
                                        turn={turn}
                                        items={items}
                                        showPrompt
                                        expandTools={expandTools}
                                        userWaitMs={turns[turn.index - 1]?.prompt ? between(turns[turn.index - 1].endedAt, turn.prompt?.timestamp) : undefined}
                                    />
                                ))}
                            </>
                        )}
                    </main>

                    {filesOpen && (
                        <aside className="drawer" aria-label="Files touched">
                            <FilesPanel files={files} empty={empty} />
                        </aside>
                    )}

                    <nav className="rail" aria-label="Panels">
                        <button type="button" className={`rail__tab${filesOpen ? ' is-active' : ''}`} onClick={() => setFilesOpen(!filesOpen)} aria-pressed={filesOpen}>
                            Files <span className="rail__count">{files.length}</span>
                        </button>
                        <button type="button" className={`rail__tab${dockHidden ? '' : ' is-active'}`} onClick={() => setDockHidden(!dockHidden)} aria-pressed={!dockHidden}>
                            Timeline
                        </button>
                    </nav>

                    <section className="dock-area" aria-label="Timeline">
                        <div className="dock-area__handle" onPointerDown={startResize} role="separator" aria-orientation="horizontal" aria-label="Resize the timeline" />
                        <TimelineDock
                            turns={turns}
                            servers={servers}
                            subagents={subagentRuns}
                            isDimmed={isDimmed}
                            selectedId={focus?.itemId}
                            currentTime={currentTime}
                            onSelect={(item) => sessionContext.jumpTo(item.id)}
                            collapsed={dockCollapsed}
                            onToggleCollapsed={() => setDockCollapsed(!dockCollapsed)}
                            onHide={() => setDockHidden(true)}
                            empty={empty}
                        />
                    </section>
                </div>
            </SessionContext.Provider>
        </ServerColorsProvider>
    )
}

/** Where to scroll when an item is not on screen: its subagent's call, or its turn. */
function fallbackAnchor(itemId: string, turns: ReturnType<typeof groupTurns>, runs: NonNullable<Session['subagents']>): HTMLElement | null {
    const run = runs.find((candidate) => candidate.session.items.some((item) => item.id === itemId))
    if (run) {
        const parent = turns.flatMap((turn) => turn.items).find((item) => item.kind === 'tool' && item.subagentId === run.agentId)
        const anchor = parent && document.getElementById(`item-${parent.id}`)
        if (anchor) {
            return anchor
        }
    }
    const turn = turns.find((candidate) => candidate.prompt?.id === itemId || candidate.items.some((item) => item.id === itemId))
    return turn ? document.getElementById(`turn-${turn.index}`) : null
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
