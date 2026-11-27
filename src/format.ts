import type { ToolItem } from './parse/types'
import { isObject } from './parse/util'

export function formatDuration(ms: number | undefined): string {
    if (ms === undefined || !Number.isFinite(ms) || ms < 0) {
        return ''
    }
    if (ms < 1000) {
        return `${Math.round(ms)}ms`
    }
    const seconds = ms / 1000
    if (seconds < 60) {
        return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`
    }
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) {
        return `${minutes}m ${Math.round(seconds % 60)}s`
    }
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export function between(start?: string, end?: string): number | undefined {
    if (!start || !end) {
        return undefined
    }
    const diff = Date.parse(end) - Date.parse(start)
    return Number.isFinite(diff) ? diff : undefined
}

export function formatTime(timestamp?: string): string {
    if (!timestamp) {
        return ''
    }
    const date = new Date(timestamp)
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function formatDateTime(timestamp: string): string {
    const date = new Date(timestamp)
    return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatNumber(value: number): string {
    if (value >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(1)}M`
    }
    if (value >= 10_000) {
        return `${Math.round(value / 1000)}k`
    }
    return value.toLocaleString()
}

export function formatCost(usd: number): string {
    return usd.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}

/** `mcp__posthog__exec` reads better as `posthog · exec`. */
export function toolDisplayName(name: string): string {
    const mcp = /^mcp__(.+?)__(.+)$/.exec(name)
    if (mcp) {
        return `${mcp[1].replace(/^claude_ai_/, '')} · ${mcp[2]}`
    }
    return name
}

const SUMMARY_KEYS = ['command', 'cmd', 'file_path', 'path', 'filePath', 'notebook_path', 'pattern', 'url', 'query', 'skill', 'description', 'prompt', 'subject']

/** One line that says what the call did, like the command it ran or the file it read. */
export function toolSummary(tool: ToolItem): string {
    const input = tool.input
    if (typeof input === 'string') {
        return firstLine(input)
    }
    if (!isObject(input)) {
        return ''
    }
    if (Array.isArray(input.todos)) {
        return `${input.todos.length} todos`
    }
    if (typeof input.pattern === 'string' && typeof input.path === 'string') {
        return `${input.pattern}  in ${input.path}`
    }
    for (const key of SUMMARY_KEYS) {
        const value = input[key]
        if (typeof value === 'string' && value.trim()) {
            return firstLine(value)
        }
    }
    for (const value of Object.values(input)) {
        if (typeof value === 'string' && value.trim()) {
            return firstLine(value)
        }
    }
    return ''
}

function firstLine(text: string): string {
    const line = text.trim().split('\n')[0]
    return line.length > 160 ? `${line.slice(0, 160)}…` : line
}

export function truncate(text: string, length: number): string {
    const flat = text.replace(/\s+/g, ' ').trim()
    return flat.length > length ? `${flat.slice(0, length)}…` : flat
}
