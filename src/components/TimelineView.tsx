import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { formatDuration, formatTime, toolDisplayName, toolSummary, truncate } from '../format'
import type { Item, Turn } from '../parse/types'
import { buildScale, buildTimeline, type Lane, type TimelineEvent } from '../timeline'
import { ItemView } from './ItemView'
import { ServerBadge } from './ServerBadge'
import { useServerColors } from './ServerColors'

const LABEL_WIDTH = 150
const GAP_PX = 30
const PADDING_PX = 16
const IDLE_THRESHOLD_MS = 60_000
const MIN_PX_PER_SECOND = 0.01
const MAX_PX_PER_SECOND = 400
const ZOOM_STEP = 1.6
/** Opening zoom when fitting the whole session would make calls too thin to tell apart. */
const READABLE_PX_PER_SECOND = 2

export interface TimelineViewProps {
    turns: Turn[]
    servers: string[]
    /** True for items the current search or server filter leaves out; they are drawn faded. */
    isDimmed: (item: Item) => boolean
    onShowInConversation: (item: Item) => void
}

export function TimelineView({ turns, servers, isDimmed, onShowInConversation }: TimelineViewProps) {
    const model = useMemo(() => buildTimeline(turns, servers), [turns, servers])
    const scroller = useRef<HTMLDivElement>(null)
    const [pxPerSecond, setPxPerSecond] = useState<number>()
    const [selected, setSelected] = useState(0)

    const intervals = useMemo(() => [...(model?.events ?? []), ...(model?.turns ?? [])], [model])
    const unitScale = useMemo(() => buildScale(intervals, { pxPerSecond: 1, idleThresholdMs: IDLE_THRESHOLD_MS, gapPx: GAP_PX, paddingPx: PADDING_PX }), [intervals])

    const fitPxPerSecond = useCallback((): number => {
        const available = (scroller.current?.clientWidth ?? 1000) - LABEL_WIDTH
        const activeSeconds = unitScale.width - 2 * PADDING_PX - unitScale.gaps.length * GAP_PX
        const fixed = 2 * PADDING_PX + unitScale.gaps.length * GAP_PX
        return clamp(activeSeconds > 0 ? (available - fixed) / activeSeconds : 1)
    }, [unitScale])

    useLayoutEffect(() => {
        setPxPerSecond(Math.max(fitPxPerSecond(), READABLE_PX_PER_SECOND))
    }, [fitPxPerSecond])

    const pps = pxPerSecond ?? 1
    const scale = useMemo(() => buildScale(intervals, { pxPerSecond: pps, idleThresholdMs: IDLE_THRESHOLD_MS, gapPx: GAP_PX, paddingPx: PADDING_PX }), [intervals, pps])

    /** Zooms while keeping the time under `anchorPx` (relative to the visible area) in place. */
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
                const width = element.scrollWidth - LABEL_WIDTH
                element.scrollLeft = ratio * width - anchor
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
            const anchor = event.clientX - element.getBoundingClientRect().left - LABEL_WIDTH
            zoomTo(pps * Math.exp(-event.deltaY / 300), anchor)
        }
        element.addEventListener('wheel', onWheel, { passive: false })
        return () => element.removeEventListener('wheel', onWheel)
    }, [pps, zoomTo])

    const select = useCallback(
        (index: number) => {
            if (!model) {
                return
            }
            const bounded = Math.max(0, Math.min(model.events.length - 1, index))
            setSelected(bounded)
            const element = scroller.current
            const event = model.events[bounded]
            if (element && event) {
                const left = scale.x(event.start)
                const right = scale.x(event.end)
                const visibleWidth = element.clientWidth - LABEL_WIDTH
                if (left < element.scrollLeft || right > element.scrollLeft + visibleWidth) {
                    element.scrollTo({ left: left - visibleWidth / 3, behavior: 'smooth' })
                }
            }
        },
        [model, scale]
    )

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault()
            select(selected + (event.key === 'ArrowRight' ? 1 : -1))
        }
    }

    if (!model) {
        return <p className="empty">This log has no timestamps, so there is no timeline to draw. The conversation view still shows everything.</p>
    }

    const current = model.events[selected]

    return (
        <div className="tl-view">
            <div className="tl-controls">
                <div className="tl-zoom" role="group" aria-label="Zoom">
                    <button type="button" className="button button--small" onClick={() => zoomTo(pps / ZOOM_STEP)} aria-label="Zoom out">
                        −
                    </button>
                    <button type="button" className="button button--small" onClick={() => zoomTo(fitPxPerSecond())} title="Show the whole session">
                        Fit
                    </button>
                    <button type="button" className="button button--small" onClick={() => zoomTo(pps * ZOOM_STEP)} aria-label="Zoom in">
                        +
                    </button>
                </div>
                <span className="muted small">
                    {formatDuration(model.end - model.start)} from first to last event. Pauses over {formatDuration(IDLE_THRESHOLD_MS)} are squeezed. Ctrl or ⌘ + scroll zooms, ← → steps through events.
                </span>
            </div>

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
                                <div
                                    key={span.turn.index}
                                    className="tl__turn"
                                    style={{ left: scale.x(span.start), width: Math.max(2, scale.x(span.end) - scale.x(span.start)) }}
                                    title={span.turn.prompt ? `Turn ${span.turn.number}: ${truncate(span.turn.prompt.text, 120)}` : 'Session start'}
                                >
                                    <span className="tl__turn-label">{span.turn.prompt ? span.turn.number : '·'}</span>
                                </div>
                            ))}
                            {scale.gaps.map((gap) => (
                                <div key={gap.x} className="tl__gap" style={{ left: gap.x, width: gap.width }} title={`Nothing happened for ${formatDuration(gap.durationMs)}`}>
                                    <span>{formatDuration(gap.durationMs)}</span>
                                </div>
                            ))}
                        </div>

                        {model.lanes.map((lane) => (
                            <div key={lane.key} className="tl__row">
                                <div className="tl__label">{lane.server ? <ServerBadge server={lane.server} /> : lane.label}</div>
                                <div className="tl__track">
                                    {model.events.map((event, index) =>
                                        event.lane === lane.key ? (
                                            <EventMark
                                                key={event.item.id}
                                                event={event}
                                                lane={lane}
                                                left={scale.x(event.start)}
                                                width={scale.x(event.end) - scale.x(event.start)}
                                                selected={index === selected}
                                                dimmed={isDimmed(event.item)}
                                                onSelect={() => select(index)}
                                            />
                                        ) : null
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {current && (
                <section className="tl-detail" aria-live="polite">
                    <header className="tl-detail__header">
                        <span className="tl-detail__nav">
                            <button type="button" className="button button--small" onClick={() => select(selected - 1)} disabled={selected === 0} aria-label="Previous event">
                                ←
                            </button>
                            <span className="muted small">
                                {selected + 1} of {model.events.length}
                            </span>
                            <button type="button" className="button button--small" onClick={() => select(selected + 1)} disabled={selected === model.events.length - 1} aria-label="Next event">
                                →
                            </button>
                        </span>
                        <span className="small">{describeEvent(current, model.events[selected - 1])}</span>
                        <button type="button" className="link-button tl-detail__jump" onClick={() => onShowInConversation(current.item)}>
                            Show in conversation
                        </button>
                    </header>
                    <ItemView key={`${current.item.id}-detail`} item={current.item} expandTools />
                </section>
            )}
        </div>
    )
}

function EventMark({ event, lane, left, width, selected, dimmed, onSelect }: { event: TimelineEvent; lane: Lane; left: number; width: number; selected: boolean; dimmed: boolean; onSelect: () => void }) {
    const { colorFor } = useServerColors()
    const item = event.item
    const point = item.kind === 'user' || item.kind === 'assistant' || item.kind === 'event'
    const failed = item.kind === 'tool' && item.result?.isError
    const className = [
        'tl__event',
        point ? `tl__event--point tl__event--${item.kind}` : `tl__event--span tl__event--${item.kind}`,
        failed || (item.kind === 'event' && item.tone === 'error') ? 'is-error' : '',
        selected ? 'is-selected' : '',
        dimmed ? 'is-dimmed' : '',
    ]
        .filter(Boolean)
        .join(' ')
    const background = lane.server ? colorFor(lane.server) : undefined

    return (
        <button
            type="button"
            className={className}
            style={point ? { left } : { left, width: Math.max(4, width), background }}
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

function describeEvent(event: TimelineEvent, previous?: TimelineEvent): string {
    const parts = [event.turn.prompt ? `Turn ${event.turn.number}` : 'Session start', formatTime(new Date(event.start).toISOString())]
    if (event.end > event.start) {
        parts.push(`took ${formatDuration(event.end - event.start)}`)
    }
    if (previous) {
        const wait = event.start - previous.end
        if (wait >= 1000) {
            parts.push(`${formatDuration(wait)} after the previous event`)
        }
    }
    return parts.join(' · ')
}

function clamp(pxPerSecond: number): number {
    return Math.min(MAX_PX_PER_SECOND, Math.max(MIN_PX_PER_SECOND, pxPerSecond))
}
