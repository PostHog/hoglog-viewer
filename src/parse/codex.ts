import type { Item, MetaField, Session, TokenUsage, ToolItem } from './types'
import { asNumber, asString, flattenContent, isObject, nextId, tryParseJson, type Json } from './util'

const ITEM_TYPES = new Set(['message', 'reasoning', 'function_call', 'function_call_output', 'custom_tool_call', 'custom_tool_call_output', 'local_shell_call', 'web_search_call'])

const ENVELOPE_TYPES = new Set(['session_meta', 'response_item', 'event_msg', 'turn_context', 'compacted'])

export function looksLikeCodex(records: unknown[]): boolean {
    return records.some(
        (record) =>
            isObject(record) &&
            ((typeof record.type === 'string' && ENVELOPE_TYPES.has(record.type) && 'payload' in record) ||
                (typeof record.type === 'string' && ITEM_TYPES.has(record.type) && !('sessionId' in record)))
    )
}

export function parseCodex(records: unknown[], skipped: number): Session {
    const items: Item[] = []
    const toolsByCallId = new Map<string, ToolItem>()
    const meta: MetaField[] = []
    const models = new Set<string>()
    let usage: TokenUsage | undefined
    let firstTimestamp: string | undefined
    let lastTimestamp: string | undefined

    for (const record of records) {
        if (!isObject(record)) {
            continue
        }
        const timestamp = asString(record.timestamp)
        const envelope = asString(record.type)
        const payload = isObject(record.payload) ? record.payload : record

        if (envelope === 'session_meta' || (!('payload' in record) && 'instructions' in record && 'id' in record)) {
            pushMeta(meta, 'Codex CLI', payload.cli_version)
            pushMeta(meta, 'Originator', payload.originator)
            pushMeta(meta, 'Directory', payload.cwd)
            if (isObject(payload.git)) {
                pushMeta(meta, 'Branch', payload.git.branch)
                pushMeta(meta, 'Repository', payload.git.repository_url)
            }
            const instructions = asString(payload.instructions)
            if (instructions) {
                items.push({ id: nextId('context'), kind: 'context', label: 'Instructions', text: instructions, timestamp })
            }
            continue
        }
        if (envelope === 'turn_context') {
            const model = asString(payload.model)
            if (model) {
                models.add(model)
            }
            continue
        }
        if (envelope === 'compacted') {
            items.push({ id: nextId('event'), kind: 'event', label: 'Conversation compacted', timestamp })
            continue
        }
        if (envelope === 'event_msg') {
            if (payload.type === 'token_count' && isObject(payload.info) && isObject(payload.info.total_token_usage)) {
                usage = readUsage(payload.info.total_token_usage)
            } else if (payload.type === 'turn_aborted') {
                items.push({ id: nextId('event'), kind: 'event', label: 'Turn aborted', detail: asString(payload.reason), tone: 'error', timestamp })
            }
            continue
        }

        const type = asString(payload.type)
        if (!type || !ITEM_TYPES.has(type)) {
            continue
        }
        if (timestamp) {
            firstTimestamp ??= timestamp
            lastTimestamp = timestamp
        }
        readItem(payload, type, timestamp, items, toolsByCallId)
    }

    if (models.size) {
        meta.unshift({ label: models.size > 1 ? 'Models' : 'Model', value: [...models].join(', ') })
    }
    if (firstTimestamp) {
        meta.push({ label: 'Started', value: firstTimestamp })
    }
    if (lastTimestamp) {
        meta.push({ label: 'Last activity', value: lastTimestamp })
    }
    return { format: 'Codex CLI', meta, items, usage, skipped }
}

function readItem(payload: Json, type: string, timestamp: string | undefined, items: Item[], toolsByCallId: Map<string, ToolItem>): void {
    switch (type) {
        case 'message': {
            const role = asString(payload.role)
            const { text, images } = flattenContent(payload.content)
            const trimmed = text.trim()
            if (role === 'assistant') {
                if (trimmed) {
                    items.push({ id: nextId('assistant'), kind: 'assistant', text: trimmed, timestamp })
                }
            } else if (role === 'user') {
                const contextLabel = injectedLabel(trimmed)
                if (contextLabel) {
                    items.push({ id: nextId('context'), kind: 'context', label: contextLabel, text: trimmed, timestamp })
                } else if (trimmed || images.length) {
                    items.push({ id: nextId('user'), kind: 'user', text: trimmed, images, timestamp })
                }
            } else if (trimmed) {
                items.push({ id: nextId('context'), kind: 'context', label: `${role ?? 'System'} message`, text: trimmed, timestamp })
            }
            return
        }
        case 'reasoning': {
            const { text } = flattenContent(payload.summary)
            const content = flattenContent(payload.content).text
            items.push({ id: nextId('thinking'), kind: 'thinking', text: [text, content].filter(Boolean).join('\n\n'), timestamp })
            return
        }
        case 'function_call':
        case 'custom_tool_call':
        case 'local_shell_call':
        case 'web_search_call': {
            const input = type === 'function_call' ? tryParseJson(asString(payload.arguments) ?? '') : type === 'custom_tool_call' ? payload.input : payload.action
            const name = asString(payload.name) ?? (type === 'local_shell_call' ? 'shell' : type === 'web_search_call' ? 'web_search' : 'tool')
            const tool: ToolItem = { id: nextId('tool'), kind: 'tool', toolUseId: asString(payload.call_id), name, input: normalizeShellInput(input), timestamp }
            if (tool.toolUseId) {
                toolsByCallId.set(tool.toolUseId, tool)
            }
            items.push(tool)
            return
        }
        case 'function_call_output':
        case 'custom_tool_call_output': {
            const callId = asString(payload.call_id)
            const tool = callId ? toolsByCallId.get(callId) : undefined
            if (tool) {
                tool.result = readOutput(payload.output, timestamp)
            }
            return
        }
    }
}

function injectedLabel(text: string): string | undefined {
    if (text.startsWith('<environment_context>')) {
        return 'Environment'
    }
    if (text.startsWith('<user_instructions>') || text.startsWith('# AGENTS.md instructions')) {
        return 'Instruction files (AGENTS.md)'
    }
    return undefined
}

/** Codex shell calls pass argv arrays like ["bash", "-lc", "ls"]; show the script instead. */
function normalizeShellInput(input: unknown): unknown {
    if (isObject(input) && Array.isArray(input.command)) {
        const argv = input.command.filter((part): part is string => typeof part === 'string')
        const script = argv.length >= 3 && /sh$/.test(argv[0]) && argv[1].startsWith('-') ? argv[argv.length - 1] : argv.join(' ')
        return { ...input, command: script }
    }
    return input
}

function readOutput(output: unknown, timestamp?: string): ToolItem['result'] {
    let value = output
    if (typeof value === 'string') {
        const parsed = tryParseJson(value)
        if (isObject(parsed) && typeof parsed.output === 'string') {
            const exitCode = isObject(parsed.metadata) ? asNumber(parsed.metadata.exit_code) : undefined
            return { text: parsed.output, images: [], isError: exitCode !== undefined && exitCode !== 0, timestamp }
        }
    }
    if (isObject(value)) {
        const isError = value.success === false
        value = value.content ?? value.output ?? JSON.stringify(value, null, 2)
        const { text, images } = flattenContent(value)
        return { text, images, isError, timestamp }
    }
    const { text, images } = flattenContent(value)
    return { text, images, isError: false, timestamp }
}

function readUsage(usage: Json): TokenUsage {
    const input = asNumber(usage.input_tokens) ?? 0
    const cached = asNumber(usage.cached_input_tokens) ?? 0
    return { input: input - cached, output: asNumber(usage.output_tokens) ?? 0, cacheRead: cached, cacheWrite: 0 }
}

function pushMeta(meta: MetaField[], label: string, value: unknown): void {
    if (typeof value === 'string' && value) {
        meta.push({ label, value })
    }
}
