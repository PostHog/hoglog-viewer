import type { ImageRef, Item, MetaField, Session, TokenUsage, ToolItem } from './types'
import { asNumber, asString, flattenContent, imageFromBlock, isObject, nextId, type Json } from './util'

/** Attachment types that only carry harness bookkeeping, with nothing a reader would want. */
const IGNORED_ATTACHMENTS = new Set(['deferred_tools_record', 'command_permissions', 'credential_org'])

const ATTACHMENT_LABELS: Record<string, string> = {
    agent_listing_delta: 'Available subagents',
    date: 'Date',
    deferred_tools_delta: 'Available tools',
    environment: 'Environment',
    instructions: 'Instruction files (CLAUDE.md)',
    mcp_instructions_delta: 'MCP server instructions',
    model: 'Model',
    prompt_snapshot: 'System prompt',
    remote_session_change: 'Commit attribution',
    session_context: 'Session context',
    silent_turn_reminder: 'Progress reminder',
    skill_listing: 'Available skills',
}

const COMMAND_NAME = /<command-name>([\s\S]*?)<\/command-name>/
const COMMAND_ARGS = /<command-args>([\s\S]*?)<\/command-args>/
const COMMAND_STDOUT = /<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/
const BASH_INPUT = /<bash-input>([\s\S]*?)<\/bash-input>/
const BASH_OUTPUT = /<bash-(?:stdout|stderr)>([\s\S]*?)<\/bash-(?:stdout|stderr)>/g

export function looksLikeClaudeCode(records: unknown[]): boolean {
    return records.some(
        (record) =>
            isObject(record) &&
            (record.type === 'user' || record.type === 'assistant') &&
            isObject(record.message) &&
            'sessionId' in record
    )
}

export function parseClaudeCode(records: unknown[], skipped: number): Session {
    const items: Item[] = []
    const toolsById = new Map<string, ToolItem>()
    const seenUuids = new Set<string>()
    const usageByMessage = new Map<string, TokenUsage>()
    const models = new Set<string>()
    const prLinks = new Map<string, string>()
    let title: string | undefined
    let summaryTitle: string | undefined
    let costUsd: number | undefined
    let costState: Json | undefined
    let firstTimestamp: string | undefined
    let lastTimestamp: string | undefined
    let environment: Json | undefined

    for (const record of records) {
        if (!isObject(record)) {
            continue
        }
        const uuid = asString(record.uuid)
        if (uuid) {
            if (seenUuids.has(uuid)) {
                continue
            }
            seenUuids.add(uuid)
        }
        const timestamp = asString(record.timestamp)
        if (timestamp && (record.type === 'user' || record.type === 'assistant')) {
            firstTimestamp ??= timestamp
            lastTimestamp = timestamp
        }
        if (!environment && typeof record.cwd === 'string') {
            environment = record
        }
        const sidechain = record.isSidechain === true || undefined
        const base = { timestamp, sidechain }

        switch (record.type) {
            case 'ai-title':
                title = asString(record.aiTitle) ?? title
                break
            case 'summary':
                summaryTitle ??= asString(record.summary)
                break
            case 'cost-state':
                costState = record
                costUsd = asNumber(record.totalCostUSD) ?? costUsd
                break
            case 'pr-link': {
                const url = asString(record.prUrl)
                if (url && !prLinks.has(url)) {
                    const label = `${asString(record.prRepository) ?? 'PR'}#${record.prNumber ?? ''}`
                    prLinks.set(url, label)
                    items.push({ id: nextId('event'), kind: 'event', label: `Opened ${label}`, detail: url, tone: 'success', ...base })
                }
                break
            }
            case 'assistant':
                readAssistant(record, base, items, toolsById, usageByMessage, models)
                break
            case 'user':
                readUser(record, base, items, toolsById)
                break
            case 'attachment':
                readAttachment(record, base, items)
                break
            case 'system':
                readSystem(record, base, items)
                break
        }
    }

    const meta: MetaField[] = []
    if (models.size) {
        meta.push({ label: models.size > 1 ? 'Models' : 'Model', value: [...models].join(', ') })
    }
    if (environment) {
        pushMeta(meta, 'Claude Code', environment.version)
        pushMeta(meta, 'Entrypoint', environment.entrypoint)
        pushMeta(meta, 'Directory', environment.cwd)
        pushMeta(meta, 'Branch', environment.gitBranch)
    }
    if (costState) {
        const added = asNumber(costState.totalLinesAdded)
        const removed = asNumber(costState.totalLinesRemoved)
        if (added !== undefined || removed !== undefined) {
            meta.push({ label: 'Lines changed', value: `+${added ?? 0} / -${removed ?? 0}` })
        }
    }
    for (const [href, label] of prLinks) {
        meta.push({ label: 'Pull request', value: label, href })
    }
    if (firstTimestamp) {
        meta.push({ label: 'Started', value: firstTimestamp })
    }
    if (lastTimestamp) {
        meta.push({ label: 'Last activity', value: lastTimestamp })
    }

    return {
        format: 'Claude Code',
        title: title ?? summaryTitle,
        meta,
        items,
        usage: sumUsage(usageByMessage.values()),
        costUsd,
        skipped,
    }
}

type Base = { timestamp?: string; sidechain?: true }

function readAssistant(
    record: Json,
    base: Base,
    items: Item[],
    toolsById: Map<string, ToolItem>,
    usageByMessage: Map<string, TokenUsage>,
    models: Set<string>
): void {
    const message = record.message
    if (!isObject(message)) {
        return
    }
    const model = asString(message.model)
    if (model && model !== '<synthetic>') {
        models.add(model)
    }
    const messageId = asString(message.id)
    if (messageId && isObject(message.usage)) {
        usageByMessage.set(messageId, readUsage(message.usage))
    }
    const content = Array.isArray(message.content) ? message.content : [{ type: 'text', text: message.content }]
    if (record.isApiErrorMessage === true) {
        const { text } = flattenContent(content)
        items.push({ id: nextId('event'), kind: 'event', label: 'API error', detail: text, tone: 'error', ...base })
        return
    }
    for (const block of content) {
        if (!isObject(block)) {
            continue
        }
        switch (block.type) {
            case 'text': {
                const text = asString(block.text)?.trim()
                if (text && text !== '(no content)') {
                    items.push({ id: nextId('assistant'), kind: 'assistant', text, model, ...base })
                }
                break
            }
            case 'thinking':
            case 'redacted_thinking':
                items.push({
                    id: nextId('thinking'),
                    kind: 'thinking',
                    text: asString(block.thinking) ?? '',
                    durationMs: asNumber(record.thinkingDurationMs),
                    ...base,
                })
                break
            case 'tool_use':
            case 'server_tool_use': {
                const tool: ToolItem = {
                    id: nextId('tool'),
                    kind: 'tool',
                    toolUseId: asString(block.id),
                    name: asString(block.name) ?? 'tool',
                    input: block.input,
                    ...base,
                }
                if (tool.toolUseId) {
                    toolsById.set(tool.toolUseId, tool)
                }
                items.push(tool)
                break
            }
            default:
                if (typeof block.tool_use_id === 'string') {
                    attachResult(toolsById, block, base.timestamp)
                }
        }
    }
}

function readUser(record: Json, base: Base, items: Item[], toolsById: Map<string, ToolItem>): void {
    const message = record.message
    if (!isObject(message)) {
        return
    }
    const isMeta = record.isMeta === true
    if (record.isCompactSummary === true) {
        items.push({ id: nextId('context'), kind: 'context', label: 'Compaction summary', text: flattenContent(message.content).text, ...base })
        return
    }
    if (typeof message.content === 'string') {
        readUserText(message.content, [], isMeta, base, items)
        return
    }
    if (!Array.isArray(message.content)) {
        return
    }
    const texts: string[] = []
    const images: ImageRef[] = []
    for (const block of message.content) {
        if (!isObject(block)) {
            continue
        }
        if (block.type === 'tool_result') {
            attachResult(toolsById, block, base.timestamp)
        } else if (block.type === 'text' && typeof block.text === 'string') {
            texts.push(block.text)
        } else if (block.type === 'image') {
            const image = imageFromBlock(block)
            if (image) {
                images.push(image)
            }
        }
    }
    if (texts.length || images.length) {
        readUserText(texts.join('\n\n'), images, isMeta, base, items)
    }
}

function readUserText(text: string, images: ImageRef[], isMeta: boolean, base: Base, items: Item[]): void {
    const command = COMMAND_NAME.exec(text)
    if (command) {
        const args = COMMAND_ARGS.exec(text)?.[1]?.trim()
        items.push({ id: nextId('event'), kind: 'event', label: command[1].trim(), detail: args || undefined, ...base })
        return
    }
    const stdout = COMMAND_STDOUT.exec(text)
    if (stdout) {
        items.push({ id: nextId('context'), kind: 'context', label: 'Command output', text: stdout[1].trim(), ...base })
        return
    }
    const bashInput = BASH_INPUT.exec(text)
    if (bashInput) {
        items.push({ id: nextId('event'), kind: 'event', label: 'User ran a shell command', detail: bashInput[1].trim(), ...base })
        return
    }
    if (text.includes('<bash-stdout>') || text.includes('<bash-stderr>')) {
        const output = [...text.matchAll(BASH_OUTPUT)].map((match) => match[1].trim()).filter(Boolean).join('\n')
        items.push({ id: nextId('context'), kind: 'context', label: 'Shell command output', text: '```\n' + output + '\n```', ...base })
        return
    }
    if (text.includes('<local-command-caveat>')) {
        return
    }
    const trimmed = text.trim()
    if (trimmed.startsWith('[Request interrupted by user')) {
        items.push({ id: nextId('event'), kind: 'event', label: 'Interrupted by user', tone: 'error', ...base })
        return
    }
    if (isMeta) {
        items.push({ id: nextId('context'), kind: 'context', label: metaLabel(trimmed), text: trimmed, ...base })
        return
    }
    items.push({ id: nextId('user'), kind: 'user', text: trimmed, images, ...base })
}

function metaLabel(text: string): string {
    if (text.startsWith('Base directory for this skill')) {
        return 'Skill instructions'
    }
    if (text.startsWith('[Image:')) {
        return 'Image note'
    }
    if (text.startsWith('<system-reminder>')) {
        return 'System reminder'
    }
    return 'Injected message'
}

function readAttachment(record: Json, base: Base, items: Item[]): void {
    const attachment = record.attachment
    if (!isObject(attachment)) {
        return
    }
    const type = asString(attachment.type) ?? 'attachment'
    if (IGNORED_ATTACHMENTS.has(type)) {
        return
    }
    if (type === 'queued_command') {
        const { text, images } = flattenContent(attachment.prompt)
        items.push({ id: nextId('user'), kind: 'user', text: text.trim(), images, queued: true, ...base })
        return
    }
    let label = ATTACHMENT_LABELS[type] ?? humanize(type)
    if (type.startsWith('hook_')) {
        const hook = asString(attachment.hookName) ?? asString(attachment.hookEvent)
        label = hook ? `Hook output: ${hook}` : 'Hook output'
    }
    items.push({ id: nextId('context'), kind: 'context', label, text: attachmentText(record, attachment), ...base })
}

function attachmentText(record: Json, attachment: Json): string {
    if (Array.isArray(record.rendered)) {
        const rendered = record.rendered
            .map((part) => (isObject(part) ? asString(part.content) : undefined))
            .filter((part): part is string => Boolean(part))
        if (rendered.length) {
            return rendered.join('\n\n')
        }
    }
    for (const key of ['content', 'text', 'stdout', 'prompt']) {
        const value = attachment[key]
        if (typeof value === 'string') {
            return value
        }
        if (Array.isArray(value) && value.every((part) => typeof part === 'string')) {
            return value.join('\n\n')
        }
    }
    const { type: _type, ...rest } = attachment
    return '```json\n' + JSON.stringify(rest, null, 2) + '\n```'
}

function readSystem(record: Json, base: Base, items: Item[]): void {
    const subtype = asString(record.subtype)
    const content = asString(record.content)
    switch (subtype) {
        case 'turn_duration':
            return
        case 'compact_boundary':
            items.push({ id: nextId('event'), kind: 'event', label: 'Conversation compacted', ...base })
            return
        case 'away_summary':
            if (content) {
                items.push({ id: nextId('context'), kind: 'context', label: 'Recap', text: content, ...base })
            }
            return
        case 'api_error':
            items.push({ id: nextId('event'), kind: 'event', label: 'API error', detail: content, tone: 'error', ...base })
            return
        default:
            if (content) {
                items.push({ id: nextId('context'), kind: 'context', label: humanize(subtype ?? 'system'), text: content, ...base })
            }
    }
}

function attachResult(toolsById: Map<string, ToolItem>, block: Json, timestamp?: string): void {
    const id = asString(block.tool_use_id)
    const tool = id ? toolsById.get(id) : undefined
    if (!tool) {
        return
    }
    const { text, images } = flattenContent(block.content)
    tool.result = { text, images, isError: block.is_error === true, timestamp }
}

function readUsage(usage: Json): TokenUsage {
    return {
        input: asNumber(usage.input_tokens) ?? 0,
        output: asNumber(usage.output_tokens) ?? 0,
        cacheRead: asNumber(usage.cache_read_input_tokens) ?? 0,
        cacheWrite: asNumber(usage.cache_creation_input_tokens) ?? 0,
    }
}

function sumUsage(usages: Iterable<TokenUsage>): TokenUsage | undefined {
    let total: TokenUsage | undefined
    for (const usage of usages) {
        total ??= { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
        total.input += usage.input
        total.output += usage.output
        total.cacheRead += usage.cacheRead
        total.cacheWrite += usage.cacheWrite
    }
    return total
}

function pushMeta(meta: MetaField[], label: string, value: unknown): void {
    if (typeof value === 'string' && value) {
        meta.push({ label, value })
    }
}

function humanize(type: string): string {
    const words = type.replace(/[_-]+/g, ' ').trim()
    return words.charAt(0).toUpperCase() + words.slice(1)
}
