import { isPostHogServer, parseToolName } from './format'
import type { ToolItem } from './parse/types'

export interface ServerUsage {
    server: string
    calls: number
    failed: number
}

/** MCP servers by call count, with PostHog's always first. */
export function mcpServers(tools: ToolItem[]): ServerUsage[] {
    const usage = new Map<string, ServerUsage>()
    for (const tool of tools) {
        const { server } = parseToolName(tool.name)
        if (!server) {
            continue
        }
        const entry = usage.get(server) ?? { server, calls: 0, failed: 0 }
        entry.calls++
        if (tool.result?.isError) {
            entry.failed++
        }
        usage.set(server, entry)
    }
    return [...usage.values()].sort((a, b) => Number(isPostHogServer(b.server)) - Number(isPostHogServer(a.server)) || b.calls - a.calls)
}
