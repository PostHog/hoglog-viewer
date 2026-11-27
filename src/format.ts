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
        const rest = Math.round(seconds % 60)
        return rest ? `${minutes}m ${rest}s` : `${minutes}m`
    }
    const hours = Math.floor(minutes / 60)
    return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`
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

export interface ToolName {
    /** The MCP server the tool came from, when it is an MCP tool. */
    server?: string
    tool: string
}

/**
 * Claude Code names MCP tools `mcp__<server>__<tool>`, with connector servers prefixed
 * `claude_ai_` and plugin servers `plugin_<plugin>_`. Codex uses `<server>__<tool>`.
 */
export function parseToolName(name: string): ToolName {
    const match = /^(?:mcp__)?(.+?)__(.+)$/.exec(name)
    if (!match) {
        return { tool: name }
    }
    const server = match[1].replace(/^claude_ai_/, '').replace(/^plugin_[^_]+_/, '')
    return { server, tool: match[2] }
}

export function toolDisplayName(name: string): string {
    const { server, tool } = parseToolName(name)
    return server ? `${server} · ${tool}` : tool
}

export function isPostHogServer(server: string): boolean {
    return server.toLowerCase().includes('posthog')
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
            return firstLine(key === 'command' ? withoutLeadingCd(value) : value)
        }
    }
    for (const value of Object.values(input)) {
        if (typeof value === 'string' && value.trim()) {
            return firstLine(value)
        }
    }
    return ''
}

/** `cd /long/project/path && npm test` reads as `npm test`; the full command stays in the expanded view. */
export function withoutLeadingCd(command: string): string {
    return command.replace(/^\s*cd\s+("[^"]*"|'[^']*'|\S+)\s*&&\s*/, '')
}

function firstLine(text: string): string {
    const line = text.trim().split('\n')[0]
    return line.length > 160 ? `${line.slice(0, 160)}…` : line
}

export function truncate(text: string, length: number): string {
    const flat = text.replace(/\s+/g, ' ').trim()
    return flat.length > length ? `${flat.slice(0, length)}…` : flat
}
