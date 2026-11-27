import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { formatDuration, formatTime, parseToolName, toolDisplayName, toolSummary, truncate } from '../format'
import type { Item, SubagentRun, Turn } from '../parse/types'
import { buildScale, buildTimeline, type TimelineEvent } from '../timeline'
import { ServerBadge } from './ServerBadge'
import { useServerColors } from './ServerColors'

const LABEL_WIDTH = 132
const GAP_PX = 26
const PADDING_PX = 12
const IDLE_THRESHOLD_MS = 60_000
const MIN_PX_PER_SECOND = 0.01
const MAX_PX_PER_SECOND = 400
const ZOOM_STEP = 1.6
/** Opening zoom when fitting the whole session would make calls too thin to tell apart. */
const READABLE_PX_PER_SECOND = 2

export interface TimelineDockProps {
    turns: Turn[]
    servers: string[]
    subagents: SubagentRun[]
    isDimmed: (item: Item) => boolean
    selectedId?: string
    /** Time of the item at the top of the conversation, drawn as a cursor. */
    currentTime?: number
    onSelect: (item: Item) => void
    collapsed: boolean
    onToggleCollapsed: () => void
    onHide: () => void
    /** No log is open yet. */
    empty?: boolean
}

export function TimelineDock({ turns, servers, subagents, isDimmed, selectedId, currentTime, onSelect, collapsed, onToggleCollapsed, onHide, empty }: TimelineDockProps) {
    const model = useMemo(() => buildTimeline(turns, servers, subagents), [turns, servers, subagents])
    const scroller = useRef<HTMLDivElement>(null)
    const [pxPerSecond, setPxPerSecond] = useState<number>()

    const intervals = useMemo(() => [...(model?.events ?? []), ...(model?.turns ?? [])], [model])
    const unitScale = useMemo(() => buildScale(intervals, { pxPerSecond: 1, idleThresholdMs: IDLE_THRESHOLD_MS, gapPx: GAP_PX, paddingPx: PADDING_PX }), [intervals])

    const fitPxPerSecond = useCallback((): number => {
        const available = (scroller.current?.clientWidth ?? 1000) - LABEL_WIDTH
        const fixed = 2 * PADDING_PX + unitScale.gaps.length * GAP_PX
        const activeSeconds = unitScale.width - fixed
        return clamp(activeSeconds > 0 ? (available - fixed) / activeSeconds : 1)
    }, [unitScale])

    useLayoutEffect(() => {
        setPxPerSecond(Math.max(fitPxPerSecond(), READABLE_PX_PER_SECOND))
    }, [fitPxPerSecond])

    const pps = pxPerSecond ?? 1
    const scale = useMemo(() => buildScale(intervals, { pxPerSecond: pps, idleThresholdMs: IDLE_THRESHOLD_MS, gapPx: GAP_PX, paddingPx: PADDING_PX }), [intervals, pps])

    const zoomTo = useCallback(
        (next: number, anchorPx?: number) => {
            const element = scroller.current
            const target = clamp(next)
            if (!element) {
                setPxPerSecond(target)
                return
            }
            const anchor = anchorPx ?? (element.clientWidth - LABEL_WIDTH) / 2
            const ratio = (element.scrollLeft + anchor) / Math.max(1, scale.width)
            setPxPerSecond(target)
            requestAnimationFrame(() => {
                element.scrollLeft = ratio * (element.scrollWidth - LABEL_WIDTH) - anchor
            })
        },
        [scale.width]
    )

    useEffect(() => {
        const element = scroller.current
        if (!element) {
            return
        }
        const onWheel = (event: WheelEvent): void => {
            if (!event.ctrlKey && !event.metaKey) {
                return
            }
            event.preventDefault()
            zoomTo(pps * Math.exp(-event.deltaY / 300), event.clientX - element.getBoundingClientRect().left - LABEL_WIDTH)
        }
        element.addEventListener('wheel', onWheel, { passive: false })
        return () => element.removeEventListener('wheel', onWheel)
    }, [pps, zoomTo])

    const cursorX = currentTime !== undefined ? scale.x(currentTime) : undefined

    // Keep the cursor in view while the conversation scrolls.
    useEffect(() => {
        const element = scroller.current
        if (!element || cursorX === undefined || collapsed) {
            return
        }
        const visible = element.clientWidth - LABEL_WIDTH
        if (cursorX < element.scrollLeft + 24 || cursorX > element.scrollLeft + visible - 24) {
            element.scrollTo({ left: cursorX - visible * 0.3 })
        }
    }, [cursorX, collapsed])

    const step = (direction: 1 | -1): void => {
        if (!model) {
            return
        }
        const index = model.events.findIndex((event) => event.item.id === selectedId)
        const next = model.events[Math.max(0, Math.min(model.events.length - 1, index === -1 ? 0 : index + direction))]
        if (next) {
            onSelect(next.item)
        }
    }

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault()
            step(event.key === 'ArrowRight' ? 1 : -1)
        }
    }

    return (
        <div className="dock">
            <div className="dock__bar">
                <button type="button" className="dock__title" onClick={onToggleCollapsed} aria-expanded={!collapsed}>
                    {collapsed ? '▸' : '▾'} Timeline
                </button>
                {model && !collapsed && (
                    <>
                        <div className="tl-zoom" role="group" aria-label="Zoom">
                            <button type="button" className="button button--tiny" onClick={() => zoomTo(pps / ZOOM_STEP)} aria-label="Zoom out">
                                −
                            </button>
                            <button type="button" className="button button--tiny" onClick={() => zoomTo(fitPxPerSecond())} title="Show the whole session">
                                Fit
                            </button>
                            <button type="button" className="button button--tiny" onClick={() => zoomTo(pps * ZOOM_STEP)} aria-label="Zoom in">
                                +
                            </button>
                        </div>
                        <span className="muted small dock__hint">
                            {formatDuration(model.end - model.start)} end to end · pauses over {formatDuration(IDLE_THRESHOLD_MS)} squeezed · ⌘/Ctrl + scroll zooms · ← → step
                        </span>
                    </>
                )}
                <button type="button" className="button button--tiny dock__close" onClick={onHide} title="Hide the timeline. Bring it back from the Timeline tab on the right.">
                    Hide
                </button>
            </div>

            {!collapsed &&
                (model ? (
                    <div className="tl" ref={scroller} tabIndex={0} onKeyDown={onKeyDown} aria-label="Session timeline">
                        <div className="tl__inner" style={{ width: LABEL_WIDTH + scale.width }}>
                            <div className="tl__row tl__row--axis">
                                <div className="tl__label" />
                                <div className="tl__track">
                                    {scale.ticks.map((tick) => (
                                        <span key={`${tick.t}-${tick.x}`} className="tl__tick" style={{ left: tick.x }}>
                                            {formatTime(new Date(tick.t).toISOString())}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div className="tl__body">
                                <div className="tl__overlay" style={{ left: LABEL_WIDTH }}>
                                    {model.turns.map((span) => (
                                        <div key={span.turn.index} className="tl__turn" style={{ left: scale.x(span.start), width: Math.max(2, scale.x(span.end) - scale.x(span.start)) }}>
                                            <span className="tl__turn-label">{span.turn.prompt ? span.turn.number : '·'}</span>
                                        </div>
                                    ))}
                                    {scale.gaps.map((gap) => (
                                        <div key={gap.x} className="tl__gap" style={{ left: gap.x, width: gap.width }} title={`Nothing happened for ${formatDuration(gap.durationMs)}`}>
                                            <span>{formatDuration(gap.durationMs)}</span>
                                        </div>
                                    ))}
                                    {cursorX !== undefined && <div className="tl__cursor" style={{ left: cursorX }} />}
                                </div>

                                {model.lanes.map((lane) => (
                                    <div key={lane.key} className={`tl__row${lane.kind === 'subagent' ? ' tl__row--subagent' : ''}`}>
                                        <div className="tl__label" title={lane.label}>
                                            {lane.server ? <ServerBadge server={lane.server} /> : lane.kind === 'subagent' ? <span className="tl__sublabel">↳ {lane.label}</span> : lane.label}
                                        </div>
                                        <div className="tl__track">
                                            {model.events.map((event) =>
                                                event.lane === lane.key ? (
                                                    <EventMark
                                                        key={event.item.id}
                                                        event={event}
                                                        left={scale.x(event.start)}
                                                        width={scale.x(event.end) - scale.x(event.start)}
                                                        selected={event.item.id === selectedId}
                                                        dimmed={isDimmed(event.item)}
                                                        onSelect={() => onSelect(event.item)}
                                                    />
                                                ) : null
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <p className="muted small dock__empty">{empty ? 'Open a log to see its timeline.' : 'This log has no timestamps, so there is no timeline to draw.'}</p>
                ))}
        </div>
    )
}

function EventMark({ event, left, width, selected, dimmed, onSelect }: { event: TimelineEvent; left: number; width: number; selected: boolean; dimmed: boolean; onSelect: () => void }) {
    const { colorFor } = useServerColors()
    const item = event.item
    const point = item.kind === 'user' || item.kind === 'assistant' || item.kind === 'event'
    const failed = item.kind === 'tool' && item.result?.isError
    const server = item.kind === 'tool' ? parseToolName(item.name).server : undefined
    const className = [
        'tl__event',
        point ? `tl__event--point tl__event--${item.kind}` : `tl__event--span tl__event--${item.kind}`,
        failed || (item.kind === 'event' && item.tone === 'error') ? 'is-error' : '',
        selected ? 'is-selected' : '',
        dimmed ? 'is-dimmed' : '',
    ]
        .filter(Boolean)
        .join(' ')

    return (
        <button
            type="button"
            className={className}
            style={point ? { left } : { left, width: Math.max(4, width), background: server ? colorFor(server) : undefined }}
            title={eventTitle(event)}
            onClick={onSelect}
            tabIndex={-1}
        />
    )
}

function eventTitle({ item, start, end }: TimelineEvent): string {
    const when = formatTime(new Date(start).toISOString())
    const took = end > start ? ` · ${formatDuration(end - start)}` : ''
    switch (item.kind) {
        case 'tool':
            return `${toolDisplayName(item.name)}${took} · ${when}\n${toolSummary(item)}${item.result?.isError ? '\nFailed' : ''}`
        case 'thinking':
            return `Thinking${took} · ${when}`
        case 'user':
            return `Prompt · ${when}\n${truncate(item.text, 200)}`
        case 'assistant':
            return `Reply · ${when}\n${truncate(item.text, 200)}`
        case 'event':
            return `${item.label} · ${when}`
        default:
            return when
    }
}

function clamp(pxPerSecond: number): number {
    return Math.min(MAX_PX_PER_SECOND, Math.max(MIN_PX_PER_SECOND, pxPerSecond))
}
