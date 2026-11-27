import type { LogFile } from './parse'

/**
 * PostHog Admin's handoff (`Handoff` in posthog/admin/console/panels.py): it opens the viewer at `#handoff`,
 * waits for READY, then posts the transcript with HANDOFF. The file goes from tab to tab inside the browser
 * and never reaches a server.
 */
export const HANDOFF_HASH = '#handoff'
export const READY_MESSAGE = 'posthog-admin:ready'
export const HANDOFF_MESSAGE = 'posthog-admin:handoff'
export const HANDOFF_VERSION = 1

/** Pages allowed to hand a log over. The viewer is public, so anything else is ignored. */
export const HANDOFF_ORIGINS = new Set(['https://us.posthog.com', 'https://eu.posthog.com', 'http://localhost:8010'])

/** Any local page in development builds, so the handoff can be tried without the PostHog stack. */
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/

function isAllowedOrigin(origin: string): boolean {
    return HANDOFF_ORIGINS.has(origin) || (import.meta.env.DEV && DEV_ORIGIN.test(origin))
}

const MAX_FILES = 50
const MAX_TOTAL_CHARACTERS = 200 * 1024 * 1024

export interface HandoffEvent {
    origin: string
    data: unknown
    source: unknown
}

/** The files in a handoff message, or undefined when the message is not a valid handoff from the opener. */
export function readHandoff(event: HandoffEvent, opener: unknown): LogFile[] | undefined {
    if (!opener || event.source !== opener || !isAllowedOrigin(event.origin)) {
        return undefined
    }
    const data = event.data
    if (typeof data !== 'object' || data === null || (data as { type?: unknown }).type !== HANDOFF_MESSAGE) {
        return undefined
    }
    const files = (data as { files?: unknown }).files
    if (!Array.isArray(files) || files.length === 0 || files.length > MAX_FILES) {
        return undefined
    }
    let total = 0
    const valid: LogFile[] = []
    for (const file of files) {
        if (typeof file !== 'object' || file === null) {
            return undefined
        }
        const { name, text } = file as { name?: unknown; text?: unknown }
        if (typeof name !== 'string' || typeof text !== 'string') {
            return undefined
        }
        total += text.length
        if (total > MAX_TOTAL_CHARACTERS) {
            return undefined
        }
        valid.push({ name: name.slice(0, 255), text })
    }
    return valid
}
