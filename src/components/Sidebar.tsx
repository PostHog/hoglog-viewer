import { between, formatCost, formatDateTime, formatDuration, formatNumber, parseToolName, toolDisplayName } from '../format'
import type { Session, Turn } from '../parse/types'
import { mcpServers } from '../servers'
import { ActivityChart } from './ActivityChart'
import { ServerBadge } from './ServerBadge'
import { useServerColors } from './ServerColors'

const TOP_TOOLS = 12
const TIMESTAMP_LABELS = new Set(['Started', 'Last activity'])

export interface SidebarProps {
    session: Session
    turns: Turn[]
    activeTurn?: number
    onJump: (index: number) => void
    server?: string
    onServerChange: (server: string | undefined) => void
}

export function Sidebar({ session, turns, activeTurn, onJump, server, onServerChange }: SidebarProps) {
    const tools = session.items.filter((item) => item.kind === 'tool')
    const servers = mcpServers(tools)
    const { colorFor, setColor } = useServerColors()
    const barColor = (name: string): string | undefined => {
        const toolServer = parseToolName(name).server
        return toolServer ? colorFor(toolServer) : undefined
    }
    const failed = tools.filter((tool) => tool.result?.isError).length
    const counts = new Map<string, number>()
    for (const tool of tools) {
        counts.set(tool.name, (counts.get(tool.name) ?? 0) + 1)
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
    const maxCount = ranked[0]?.[1] ?? 1
    const first = turns.find((turn) => turn.startedAt)?.startedAt
    const last = [...turns].reverse().find((turn) => turn.endedAt)?.endedAt
    const prompts = turns.filter((turn) => turn.prompt).length

    return (
        <aside className="sidebar">
            <section className="panel">
                <h2 className="panel__title">Overview</h2>
                <dl className="stats">
                    <Stat label="Duration" value={formatDuration(between(first, last)) || '–'} />
                    <Stat label="Prompts" value={String(prompts)} />
                    <Stat label="Tool calls" value={String(tools.length)} />
                    <Stat label="Failed calls" value={String(failed)} tone={failed ? 'error' : undefined} />
                    {session.usage && <Stat label="Output tokens" value={formatNumber(session.usage.output)} />}
                    {session.usage && <Stat label="Cache reads" value={formatNumber(session.usage.cacheRead)} />}
                    {session.subagents && session.subagents.length > 0 && (
                        <Stat label="Subagents" value={`${session.subagents.length} · ${session.subagents.reduce((sum, run) => sum + run.session.items.filter((item) => item.kind === 'tool').length, 0)} calls`} />
                    )}
                    {session.costUsd !== undefined && <Stat label="Cost" value={formatCost(session.costUsd)} />}
                </dl>
            </section>

            {servers.length > 0 && (
                <section className="panel">
                    <h2 className="panel__title">MCP servers</h2>
                    <ul className="servers">
                        {servers.map((entry) => (
                            <li key={entry.server} className="servers__item">
                                <label className="color-swatch" title={`Color for ${entry.server}`} style={{ background: colorFor(entry.server) }}>
                                    <input type="color" value={colorFor(entry.server)} onChange={(event) => setColor(entry.server, event.target.value)} aria-label={`Color for ${entry.server}`} />
                                </label>
                                <button
                                    type="button"
                                    className={`servers__row${entry.server === server ? ' is-active' : ''}`}
                                    aria-pressed={entry.server === server}
                                    title={entry.server === server ? 'Show every item again' : `Show only calls to ${entry.server}`}
                                    onClick={() => onServerChange(entry.server === server ? undefined : entry.server)}
                                >
                                    <ServerBadge server={entry.server} />
                                    <span className="servers__counts">
                                        {entry.calls} {entry.calls === 1 ? 'call' : 'calls'}
                                        {entry.failed > 0 && <span className="text-error"> · {entry.failed} failed</span>}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                    <p className="muted small">Click a server to show only its calls, or its swatch to change its color.</p>
                </section>
            )}

            {turns.length > 1 && (
                <section className="panel">
                    <h2 className="panel__title">{server ? `Calls to ${server} per turn` : 'Tool calls per turn'}</h2>
                    <ActivityChart turns={turns} servers={servers.map((entry) => entry.server)} activeTurn={activeTurn} onJump={onJump} server={server} />
                    {!server && servers.length > 0 && (
                        <p className="legend">
                            <span className="legend__item">
                                <span className="legend__swatch" style={{ background: 'var(--builtin-tool)' }} /> Built-in tools
                            </span>
                            {servers.map((entry) => (
                                <span key={entry.server} className="legend__item">
                                    <span className="legend__swatch" style={{ background: colorFor(entry.server) }} /> {entry.server}
                                </span>
                            ))}
                        </p>
                    )}
                </section>
            )}

            {ranked.length > 0 && (
                <section className="panel">
                    <h2 className="panel__title">Tools used</h2>
                    <ul className="bars">
                        {ranked.slice(0, TOP_TOOLS).map(([name, count]) => (
                            <li key={name} className="bars__row" title={name}>
                                <span className="bars__label">{toolDisplayName(name)}</span>
                                <span className="bars__track">
                                    <span className="bars__fill" style={{ width: `${(count / maxCount) * 100}%`, background: barColor(name) }} />
                                </span>
                                <span className="bars__value">{count}</span>
                            </li>
                        ))}
                    </ul>
                    {ranked.length > TOP_TOOLS && <p className="muted small">and {ranked.length - TOP_TOOLS} more</p>}
                </section>
            )}

            {session.meta.length > 0 && (
                <section className="panel">
                    <h2 className="panel__title">Details</h2>
                    <dl className="meta">
                        {session.meta.map((field, index) => (
                            <div key={index} className="meta__row">
                                <dt>{field.label}</dt>
                                <dd>
                                    {field.href ? (
                                        <a href={field.href} target="_blank" rel="noreferrer noopener">
                                            {field.value}
                                        </a>
                                    ) : TIMESTAMP_LABELS.has(field.label) ? (
                                        formatDateTime(field.value)
                                    ) : (
                                        field.value
                                    )}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </section>
            )}
        </aside>
    )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'error' }) {
    return (
        <div className="stat">
            <dt>{label}</dt>
            <dd className={tone === 'error' ? 'text-error' : undefined}>{value}</dd>
        </div>
    )
}
