import { looksLikeClaudeCode, parseClaudeCode } from './claudeCode'
import { looksLikeCodex, parseCodex } from './codex'
import { extractMessages, parseMessages } from './messages'
import { parseText } from './text'
import type { Item, Session, Turn } from './types'
import { isObject, nextId, parseJsonLines } from './util'

export type { Session, Turn, Item } from './types'

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
