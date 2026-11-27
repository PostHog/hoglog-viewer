import { Logo } from '@posthog/brand/logo'
import { useSyncExternalStore } from 'react'
import { isPostHogServer } from '../format'
import { serverLogo } from '../serverLogos'
import { useServerStyle } from './ServerColors'

const DARK_QUERY = '(prefers-color-scheme: dark)'

function subscribe(onChange: () => void): () => void {
    const query = window.matchMedia(DARK_QUERY)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
}

function usePrefersDark(): boolean {
    return useSyncExternalStore(subscribe, () => window.matchMedia(DARK_QUERY).matches)
}

/** Marks which MCP server a tool call went to, with the provider's logo when we know it. */
export function ServerBadge({ server }: { server: string }) {
    const dark = usePrefersDark()
    const style = useServerStyle(server)
    const title = `MCP server: ${server}`

    if (isPostHogServer(server)) {
        return (
            <span className="server-badge server-badge--posthog" style={style} title={title}>
                {/* Brand rule: the full-color logo never goes on a dark background, so dark mode gets the white one. */}
                {dark ? <Logo.Logomark size={20} variant="mono" color="#fff" /> : <Logo.Logomark size={20} />}
                {server}
            </span>
        )
    }

    const logo = serverLogo(server)
    return (
        <span className="server-badge" style={style} title={title}>
            {logo ? (
                <svg className="server-badge__logo" viewBox="0 0 24 24" width={13} height={13} aria-hidden>
                    <path d={logo.path} fill="currentColor" />
                </svg>
            ) : (
                <span className="server-badge__dot" aria-hidden />
            )}
            {server}
        </span>
    )
}
