import { looksLikeClaudeCode, parseClaudeCode } from './claudeCode'
import { looksLikeCodex, parseCodex } from './codex'
import { extractMessages, parseMessages } from './messages'
import { parseText } from './text'
import type { Item, Session, SubagentRun, ToolItem, Turn } from './types'
import { asString, isObject, nextId, parseJsonLines } from './util'

export type { Session, Turn, Item, SubagentRun } from './types'

/** Detects the log format from its content and normalizes it. Never throws on malformed input. */
export function parseLog(text: string): Session {
    const trimmed = text.replace(/^﻿/, '').trim()
    if (!trimmed) {
        return { format: 'Empty file', meta: [], items: [], skipped: 0 }
    }

    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        let whole: unknown
        try {
            whole = JSON.parse(trimmed)
        } catch {
            whole = undefined
        }
        if (whole !== undefined) {
            const records = Array.isArray(whole) ? whole : [whole]
            const structured = parseRecords(records, 0)
            if (structured) {
                return structured
            }
        }
        const { records, skipped } = parseJsonLines(trimmed)
        if (records.length) {
            return parseRecords(records, skipped) ?? parseGeneric(records, skipped)
        }
    }
    return parseText(trimmed)
}

function parseRecords(records: unknown[], skipped: number): Session | undefined {
    if (looksLikeClaudeCode(records)) {
        return parseClaudeCode(records, skipped)
    }
    if (looksLikeCodex(records)) {
        return parseCodex(records, skipped)
    }
    const single = records.length === 1 ? records[0] : records
    const messages = extractMessages(single)
    if (messages) {
        return parseMessages(messages.messages, messages.title, skipped)
    }
    return undefined
}

function parseGeneric(records: unknown[], skipped: number): Session {
    const items: Item[] = [
        { id: nextId('event'), kind: 'event', label: 'Unrecognized format, showing each record as JSON' },
        ...records.map((record): Item => ({
            id: nextId('context'),
            kind: 'context',
            label: isObject(record) && typeof record.type === 'string' ? record.type : 'Record',
            text: '```json\n' + JSON.stringify(record, null, 2) + '\n```',
        })),
    ]
    return { format: 'Unknown JSON', meta: [], items, skipped }
}

export interface LogFile {
    name: string
    text: string
}

interface AgentMeta {
    toolUseId?: string
    description?: string
    agentType?: string
}

const META_FILE = /^agent-(.+)\.meta\.json$/
const AGENT_TOOLS = new Set(['Agent', 'Task'])

/**
 * Opens one or more files as one session. A Claude Code session keeps each subagent's transcript in
 * `<session>/subagents/agent-<id>.jsonl` (with an `agent-<id>.meta.json` beside it), so those files are
 * attached to the call that started them rather than opened on their own.
 */
export function parseLogFiles(files: LogFile[]): Session {
    const metas = new Map<string, AgentMeta>()
    const sessions: Session[] = []
    for (const file of files) {
        const metaMatch = META_FILE.exec(file.name.split('/').pop() ?? file.name)
        if (metaMatch) {
            try {
                const meta: unknown = JSON.parse(file.text)
                if (isObject(meta)) {
                    metas.set(metaMatch[1], { toolUseId: asString(meta.toolUseId), description: asString(meta.description), agentType: asString(meta.agentType) })
                }
            } catch {
                // A broken sidecar only loses the subagent's label.
            }
            continue
        }
        sessions.push(parseLog(file.text))
    }
    if (!sessions.length) {
        return { format: 'Empty file', meta: [], items: [], skipped: 0 }
    }

    const main = sessions.find((session) => !session.agentId) ?? sessions[0]
    const tools = main.items.filter((item): item is ToolItem => item.kind === 'tool')
    const subagents: SubagentRun[] = []
    for (const session of sessions) {
        if (session === main || !session.agentId) {
            continue
        }
        const agentId = session.agentId
        const meta = metas.get(agentId)
        const tool = tools.find((candidate) => candidate.subagentId === agentId) ?? tools.find((candidate) => meta?.toolUseId !== undefined && candidate.toolUseId === meta.toolUseId)
        if (tool) {
            tool.subagentId = agentId
        }
        const input = tool && isObject(tool.input) ? tool.input : {}
        subagents.push({
            agentId,
            description: meta?.description ?? asString(input.description) ?? session.title,
            agentType: meta?.agentType ?? asString(input.subagent_type),
            toolUseId: tool?.toolUseId ?? meta?.toolUseId,
            session,
        })
    }
    return { ...main, subagents }
}

export function isAgentTool(tool: ToolItem): boolean {
    return AGENT_TOOLS.has(tool.name) || tool.subagentId !== undefined
}

/** Splits items into turns, each opened by a user prompt. */
export function groupTurns(items: Item[]): Turn[] {
    const turns: Turn[] = []
    let current: Turn | undefined
    let prompts = 0
    for (const item of items) {
        if (item.kind === 'user' && !item.sidechain) {
            prompts++
            current = { index: turns.length, number: prompts, prompt: item, items: [], startedAt: item.timestamp, endedAt: item.timestamp }
            turns.push(current)
            continue
        }
        if (!current) {
            current = { index: turns.length, number: prompts, items: [], startedAt: item.timestamp }
            turns.push(current)
        }
        current.items.push(item)
        const end = item.kind === 'tool' ? (item.result?.timestamp ?? item.timestamp) : item.timestamp
        if (end) {
            current.startedAt ??= end
            current.endedAt = end
        }
    }
    return turns
}
