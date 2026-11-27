import { parseToolName } from './format'
import type { Item, Turn } from './parse/types'

export type LaneKind = 'prompts' | 'agent' | 'builtin' | 'server'

export interface Lane {
    key: string
    kind: LaneKind
    label: string
    server?: string
}

export interface TimelineEvent {
    item: Item
    lane: string
    turn: Turn
    start: number
    end: number
}

export interface TurnSpan {
    turn: Turn
    start: number
    end: number
}

export interface TimelineModel {
    lanes: Lane[]
    events: TimelineEvent[]
    turns: TurnSpan[]
    start: number
    end: number
}

const BUILTIN_LANE = 'builtin'

function time(timestamp?: string): number | undefined {
    if (!timestamp) {
        return undefined
    }
    const parsed = Date.parse(timestamp)
    return Number.isFinite(parsed) ? parsed : undefined
}

/** Places every timestamped item on a lane. Returns undefined when the log has no usable timestamps. */
export function buildTimeline(turns: Turn[], servers: string[]): TimelineModel | undefined {
    const events: TimelineEvent[] = []
    const spans: TurnSpan[] = []
    const usedServers = new Set<string>()
    let hasBuiltin = false

    for (const turn of turns) {
        let turnStart: number | undefined
        let turnEnd: number | undefined
        const add = (event: TimelineEvent): void => {
            events.push(event)
            turnStart = Math.min(turnStart ?? event.start, event.start)
            turnEnd = Math.max(turnEnd ?? event.end, event.end)
        }
        if (turn.prompt) {
            const at = time(turn.prompt.timestamp)
            if (at !== undefined) {
                add({ item: turn.prompt, lane: 'prompts', turn, start: at, end: at })
            }
        }
        for (const item of turn.items) {
            const at = time(item.timestamp)
            if (at === undefined || item.kind === 'context') {
                continue
            }
            if (item.kind === 'tool') {
                const server = parseToolName(item.name).server
                const end = time(item.result?.timestamp) ?? at
                if (server) {
                    usedServers.add(server)
                } else {
                    hasBuiltin = true
                }
                add({ item, lane: server ? `server:${server}` : BUILTIN_LANE, turn, start: at, end: Math.max(at, end) })
            } else if (item.kind === 'thinking') {
                add({ item, lane: 'agent', turn, start: at - (item.durationMs ?? 0), end: at })
            } else if (item.kind === 'user') {
                add({ item, lane: 'prompts', turn, start: at, end: at })
            } else {
                add({ item, lane: 'agent', turn, start: at, end: at })
            }
        }
        if (turnStart !== undefined && turnEnd !== undefined) {
            spans.push({ turn, start: turnStart, end: turnEnd })
        }
    }

    if (!events.length) {
        return undefined
    }
    events.sort((a, b) => a.start - b.start || a.end - b.end)

    const lanes: Lane[] = [
        { key: 'prompts', kind: 'prompts', label: 'Prompts' },
        { key: 'agent', kind: 'agent', label: 'Agent' },
    ]
    if (hasBuiltin) {
        lanes.push({ key: BUILTIN_LANE, kind: 'builtin', label: 'Built-in tools' })
    }
    for (const server of servers.filter((name) => usedServers.has(name))) {
        lanes.push({ key: `server:${server}`, kind: 'server', label: server, server })
    }

    return {
        lanes,
        events,
        turns: spans,
        start: Math.min(...events.map((event) => event.start)),
        end: Math.max(...events.map((event) => event.end)),
    }
}

export interface Gap {
    /** Where the break sits on the x axis. */
    x: number
    width: number
    durationMs: number
}

export interface Scale {
    x: (t: number) => number
    width: number
    gaps: Gap[]
    ticks: { x: number; t: number }[]
}

export interface ScaleOptions {
    pxPerSecond: number
    /** Pauses longer than this are squeezed into a fixed-width break. */
    idleThresholdMs: number
    gapPx: number
    paddingPx: number
}

/**
 * Maps time to x with idle stretches compressed. Activity is drawn to scale, and any pause longer
 * than the threshold takes a fixed width, so a session with long waits still reads end to end.
 */
export function buildScale(intervals: { start: number; end: number }[], options: ScaleOptions): Scale {
    const { pxPerSecond, idleThresholdMs, gapPx, paddingPx } = options
    const sorted = [...intervals].sort((a, b) => a.start - b.start)
    const blocks: { start: number; end: number }[] = []
    for (const interval of sorted) {
        const last = blocks.at(-1)
        if (last && interval.start - last.end <= idleThresholdMs) {
            last.end = Math.max(last.end, interval.end)
        } else {
            blocks.push({ start: interval.start, end: interval.end })
        }
    }

    const pxPerMs = pxPerSecond / 1000
    const blockX: number[] = []
    const gaps: Gap[] = []
    let cursor = paddingPx
    blocks.forEach((block, index) => {
        if (index > 0) {
            gaps.push({ x: cursor, width: gapPx, durationMs: block.start - blocks[index - 1].end })
            cursor += gapPx
        }
        blockX.push(cursor)
        cursor += (block.end - block.start) * pxPerMs
    })
    const width = cursor + paddingPx

    const x = (t: number): number => {
        if (!blocks.length) {
            return paddingPx
        }
        for (let index = 0; index < blocks.length; index++) {
            const block = blocks[index]
            if (t <= block.end) {
                if (t >= block.start) {
                    return blockX[index] + (t - block.start) * pxPerMs
                }
                // Inside the break before this block: place proportionally within it.
                const previous = blocks[index - 1]
                if (!previous) {
                    return blockX[index]
                }
                const gap = gaps[index - 1]
                return gap.x + ((t - previous.end) / (block.start - previous.end)) * gap.width
            }
        }
        const last = blocks.length - 1
        return blockX[last] + (blocks[last].end - blocks[last].start) * pxPerMs
    }

    return { x, width, gaps, ticks: buildTicks(blocks, x, pxPerSecond) }
}

const TICK_STEPS_MS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600].map((seconds) => seconds * 1000)
const MIN_TICK_SPACING_PX = 90

function buildTicks(blocks: { start: number; end: number }[], x: (t: number) => number, pxPerSecond: number): { x: number; t: number }[] {
    const step = TICK_STEPS_MS.find((candidate) => (candidate / 1000) * pxPerSecond >= MIN_TICK_SPACING_PX) ?? TICK_STEPS_MS.at(-1)!
    const ticks: { x: number; t: number }[] = []
    for (const block of blocks) {
        ticks.push({ x: x(block.start), t: block.start })
        for (let t = Math.ceil(block.start / step) * step; t <= block.end; t += step) {
            if (t - block.start > step / 2) {
                ticks.push({ x: x(t), t })
            }
        }
    }
    return ticks
}
