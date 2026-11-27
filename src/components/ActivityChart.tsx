import { parseToolName } from '../format'
import type { Turn } from '../parse/types'
import { useServerColors } from './ServerColors'

export interface ActivityChartProps {
    turns: Turn[]
    /** MCP servers in stacking order, bottom first. */
    servers: string[]
    activeTurn?: number
    onJump: (index: number) => void
    /** When set, only this server's calls are counted. */
    server?: string
}

interface Segment {
    key: string
    count: number
    color: string
}

/** One bar per turn, stacked by MCP server so you can see when each server was used. */
export function ActivityChart({ turns, servers, activeTurn, onJump, server }: ActivityChartProps) {
    const { colorFor } = useServerColors()
    const stacks = turns.map((turn) => {
        const byServer = new Map<string, number>()
        let builtIn = 0
        let errors = 0
        for (const item of turn.items) {
            if (item.kind !== 'tool') {
                continue
            }
            const itemServer = parseToolName(item.name).server
            if (server && itemServer !== server) {
                continue
            }
            if (itemServer) {
                byServer.set(itemServer, (byServer.get(itemServer) ?? 0) + 1)
            } else {
                builtIn++
            }
            if (item.result?.isError) {
                errors++
            }
        }
        const segments: Segment[] = [{ key: 'built-in', count: builtIn, color: 'var(--builtin-tool)' }]
        for (const name of servers) {
            segments.push({ key: name, count: byServer.get(name) ?? 0, color: colorFor(name) })
        }
        const total = segments.reduce((sum, segment) => sum + segment.count, 0)
        return { turn, segments: segments.filter((segment) => segment.count > 0), total, errors }
    })
    const max = Math.max(1, ...stacks.map((stack) => stack.total))

    return (
        <div className="activity" role="list">
            {stacks.map(({ turn, segments, total, errors }) => (
                <button
                    key={turn.index}
                    type="button"
                    role="listitem"
                    className={`activity__bar${turn.index === activeTurn ? ' is-active' : ''}${errors ? ' has-errors' : ''}${total ? '' : ' is-empty'}`}
                    style={{ height: `${total ? Math.max(6, (total / max) * 100) : 3}%` }}
                    title={describe(turn, segments, total, errors)}
                    onClick={() => onJump(turn.index)}
                >
                    {segments.map((segment) => (
                        <span key={segment.key} className="activity__segment" style={{ flexGrow: segment.count, background: segment.color }} />
                    ))}
                </button>
            ))}
        </div>
    )
}

function describe(turn: Turn, segments: Segment[], total: number, errors: number): string {
    const name = turn.prompt ? `Turn ${turn.number}` : 'Session start'
    const parts = segments.map((segment) => `${segment.key === 'built-in' ? 'built-in tools' : segment.key}: ${segment.count}`)
    return `${name}: ${total} tool calls${parts.length ? ` (${parts.join(', ')})` : ''}${errors ? `, ${errors} failed` : ''}`
}
