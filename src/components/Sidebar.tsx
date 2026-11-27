import { between, formatCost, formatDateTime, formatDuration, formatNumber, toolDisplayName, truncate } from '../format'
import type { Session, Turn } from '../parse/types'

const TOP_TOOLS = 12
const TIMESTAMP_LABELS = new Set(['Started', 'Last activity'])

export function Sidebar({ session, turns, activeTurn, onJump }: { session: Session; turns: Turn[]; activeTurn?: number; onJump: (index: number) => void }) {
    const tools = session.items.filter((item) => item.kind === 'tool')
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
    const maxTurnTools = Math.max(1, ...turns.map((turn) => turn.items.filter((item) => item.kind === 'tool').length))

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
                    {session.costUsd !== undefined && <Stat label="Cost" value={formatCost(session.costUsd)} />}
                </dl>
            </section>

            {turns.length > 1 && (
                <section className="panel">
                    <h2 className="panel__title">Tool calls per turn</h2>
                    <div className="activity" role="list">
                        {turns.map((turn) => {
                            const count = turn.items.filter((item) => item.kind === 'tool').length
                            const errors = turn.items.filter((item) => item.kind === 'tool' && item.result?.isError).length
                            return (
                                <button
                                    key={turn.index}
                                    type="button"
                                    role="listitem"
                                    className={`activity__bar${turn.index === activeTurn ? ' is-active' : ''}${errors ? ' has-errors' : ''}`}
                                    style={{ height: `${Math.max(6, (count / maxTurnTools) * 100)}%` }}
                                    title={`${turn.prompt ? `Turn ${turn.number}` : 'Session start'}: ${count} tool calls${errors ? `, ${errors} failed` : ''}`}
                                    onClick={() => onJump(turn.index)}
                                />
                            )
                        })}
                    </div>
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
                                    <span className="bars__fill" style={{ width: `${(count / maxCount) * 100}%` }} />
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

            <section className="panel">
                <h2 className="panel__title">Turns</h2>
                <ol className="outline">
                    {turns.map((turn) => (
                        <li key={turn.index}>
                            <button type="button" className={`outline__item${turn.index === activeTurn ? ' is-active' : ''}`} onClick={() => onJump(turn.index)}>
                                <span className="outline__index">{turn.prompt ? turn.number : '·'}</span>
                                <span className="outline__text">{turn.prompt ? truncate(turn.prompt.text || '(image)', 80) : 'Session start'}</span>
                            </button>
                        </li>
                    ))}
                </ol>
            </section>
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
