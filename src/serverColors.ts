import { colors } from '@posthog/brand/colors'
import { isPostHogServer } from './format'
import { serverLogo } from './serverLogos'

/** Default colors for specific servers, by server name with everything but letters and digits removed. */
const DEFAULT_SERVER_COLORS: Record<string, string> = {
    posthog: colors.tangerine.core,
    resend: colors.violet.core,
    vercel: colors.cobalt.core,
    github: colors.purple.core,
}

/** Colors for servers without a default, assigned by a stable hash of the name. */
const PALETTE = [
    colors.blue.core,
    colors.green.core,
    colors.coral.core,
    colors.teal.core,
    colors.yellow.core,
    colors.violet.core,
    colors.lime.core,
    colors.purple.core,
    colors['corn-blue'].core,
    colors.cobalt.core,
]

const STORAGE_KEY = 'agent-log-viewer:server-colors'

function normalize(server: string): string {
    return server.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function defaultServerColor(server: string): string {
    if (isPostHogServer(server)) {
        return DEFAULT_SERVER_COLORS.posthog
    }
    const configured = DEFAULT_SERVER_COLORS[normalize(server)]
    if (configured) {
        return configured
    }
    const brand = serverLogo(server)?.hex
    if (brand && isUsableAccent(brand)) {
        return `#${brand}`
    }
    let hash = 0
    for (const char of normalize(server)) {
        hash = (hash * 31 + char.charCodeAt(0)) >>> 0
    }
    return PALETTE[hash % PALETTE.length]
}

/** Brand colors near black or white vanish on one of the two themes. */
function isUsableAccent(hex: string): boolean {
    const [r, g, b] = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return luminance > 0.12 && luminance < 0.85
}

export type ColorOverrides = Record<string, string>

export function loadOverrides(): ColorOverrides {
    try {
        const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            return {}
        }
        return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && /^#[0-9a-f]{6}$/i.test(entry[1])))
    } catch {
        return {}
    }
}

export function saveOverrides(overrides: ColorOverrides): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
    } catch {
        // Private browsing can refuse storage; the override still applies for this visit.
    }
}
