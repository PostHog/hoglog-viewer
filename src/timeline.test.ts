import { describe, expect, it } from 'vitest'
import { groupTurns, parseLog } from './parse'
import { buildScale, buildTimeline } from './timeline'

const options = { pxPerSecond: 10, idleThresholdMs: 60_000, gapPx: 30, paddingPx: 0 }

describe('buildScale', () => {
    it('draws activity to scale and squeezes long pauses into a fixed break', () => {
        const scale = buildScale(
            [
                { start: 0, end: 10_000 },
                { start: 30_000, end: 40_000 },
                { start: 3_600_000, end: 3_605_000 },
            ],
            options
        )

        expect(scale.x(10_000)).toBe(100)
        expect(scale.x(30_000)).toBe(300)
        expect(scale.gaps).toEqual([{ x: 400, width: 30, durationMs: 3_560_000 }])
        expect(scale.x(3_600_000)).toBe(430)
        expect(scale.width).toBe(480)
    })

    it('keeps x increasing through a break', () => {
        const scale = buildScale(
            [
                { start: 0, end: 1_000 },
                { start: 600_000, end: 601_000 },
            ],
            options
        )

        const xs = [0, 1_000, 200_000, 400_000, 600_000, 601_000].map(scale.x)
        expect([...xs].sort((a, b) => a - b)).toEqual(xs)
    })
})

describe('buildTimeline', () => {
    it('puts prompts, replies and each MCP server on their own lanes', () => {
        const base = { sessionId: 's', cwd: '/w', isSidechain: false }
        const log = [
            { ...base, type: 'user', uuid: 'u1', timestamp: '2026-01-01T10:00:00Z', message: { role: 'user', content: 'Check signups' } },
            {
                ...base,
                type: 'assistant',
                uuid: 'a1',
                timestamp: '2026-01-01T10:00:02Z',
                message: { id: 'm1', role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'mcp__posthog__exec', input: { command: 'call query-run' } }] },
            },
            { ...base, type: 'user', uuid: 'u2', timestamp: '2026-01-01T10:00:07Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '42' }] } },
            { ...base, type: 'assistant', uuid: 'a2', timestamp: '2026-01-01T10:00:08Z', message: { id: 'm2', role: 'assistant', content: [{ type: 'text', text: '42 signups.' }] } },
        ]
            .map((record) => JSON.stringify(record))
            .join('\n')

        const model = buildTimeline(groupTurns(parseLog(log).items), ['posthog'])

        expect(model?.lanes.map((lane) => lane.key)).toEqual(['prompts', 'agent', 'server:posthog'])
        expect(model?.events.map((event) => [event.lane, event.end - event.start])).toEqual([
            ['prompts', 0],
            ['server:posthog', 5_000],
            ['agent', 0],
        ])
    })

    it('returns nothing for logs without timestamps', () => {
        const session = parseLog(JSON.stringify([{ role: 'user', content: 'hi' }]))

        expect(buildTimeline(groupTurns(session.items), [])).toBeUndefined()
    })
})
