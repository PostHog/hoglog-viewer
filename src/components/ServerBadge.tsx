import { Logo } from '@posthog/brand/logo'
import type { CSSProperties } from 'react'
import { isPostHogServer, serverHue } from '../format'

/** Marks which MCP server a tool call went to. PostHog's server carries the logo. */
export function ServerBadge({ server }: { server: string }) {
    if (isPostHogServer(server)) {
        return (
            <span className="server-badge server-badge--posthog" title={`MCP server: ${server}`}>
                <Logo.Logomark size={20} />
                {server}
            </span>
        )
    }
    return (
        <span className="server-badge" style={serverStyle(server)} title={`MCP server: ${server}`}>
            <span className="server-badge__dot" aria-hidden />
            {server}
        </span>
    )
}

export function serverStyle(server: string): CSSProperties {
    return { '--server-hue': serverHue(server) } as CSSProperties
}
