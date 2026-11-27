import { Logo } from '@posthog/brand/logo'
import { useSyncExternalStore, type CSSProperties } from 'react'
import { isPostHogServer, serverHue } from '../format'
import { serverLogo } from '../serverLogos'

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
    const title = `MCP server: ${server}`

    if (isPostHogServer(server)) {
        return (
            <span className="server-badge server-badge--posthog" title={title}>
                {/* Brand rule: the full-color logo never goes on a dark background, so dark mode gets the white one. */}
                {dark ? <Logo.Logomark size={20} variant="mono" color="#fff" /> : <Logo.Logomark size={20} />}
                {server}
            </span>
        )
    }

    const logo = serverLogo(server)
    return (
        <span className={`server-badge${logo ? ' server-badge--logo' : ''}`} style={serverStyle(server)} title={title}>
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

/**
 * The server's accent color, used for the tool row edge and the per-turn chart. Known providers
 * use their brand color unless it is too close to black or white to show in both themes.
 */
export function serverStyle(server: string): CSSProperties {
    const logo = serverLogo(server)
    if (logo) {
        return { '--server-color': isNearMonochrome(logo.hex) ? 'var(--muted)' : `#${logo.hex}` } as CSSProperties
    }
    return { '--server-color': `hsl(${serverHue(server)} 65% 50%)`, '--server-hue': serverHue(server) } as CSSProperties
}

function isNearMonochrome(hex: string): boolean {
    const [r, g, b] = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return luminance < 0.12 || luminance > 0.9
}
