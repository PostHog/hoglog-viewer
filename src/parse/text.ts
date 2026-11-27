import type { Item, Session, ToolItem } from './types'
import { nextId } from './util'

const CLAUDE_EXPORT_MARKER = '⏺'
const TOOL_LINE = /^⏺ ([\w:.-]+)\(([\s\S]*)\)\s*$/
const SPEAKER_LINE = /^(?:#{1,6}\s*|\*\*|__)?\s*(user|human|you|me|assistant|cursor|claude|copilot|ai|model|agent|codex|gemini)\s*(?:\*\*|__)?\s*:?\s*(?:\*\*|__)?\s*$/i
const USER_SPEAKERS = new Set(['user', 'human', 'you', 'me'])

/** Text exports: Claude Code `/export`, Cursor and other markdown chat exports, or anything else. */
export function parseText(text: string): Session {
    if (text.includes(`\n${CLAUDE_EXPORT_MARKER} `) || text.startsWith(`${CLAUDE_EXPORT_MARKER} `)) {
        return { format: 'Claude Code export (text)', meta: [], items: parseClaudeExport(text), skipped: 0 }
    }
    const speakerItems = parseSpeakerSections(text)
    if (speakerItems) {
        return { format: 'Markdown chat export', meta: [], items: speakerItems, skipped: 0 }
    }
    return {
        format: 'Plain text',
        meta: [],
        items: [
            { id: nextId('event'), kind: 'event', label: 'No conversation structure found, showing the file as one document' },
            { id: nextId('assistant'), kind: 'assistant', text },
        ],
        skipped: 0,
    }
}

function parseClaudeExport(text: string): Item[] {
    const items: Item[] = []
    type Block = { kind: 'user' | 'assistant' | 'result' | 'preamble'; lines: string[]; tool?: ToolItem }
    let current: Block = { kind: 'preamble', lines: [] }
    let lastTool: ToolItem | undefined

    const flush = (): void => {
        const body = current.lines.join('\n').replace(/\s+$/, '')
        if (current.kind === 'user' && body.trim()) {
            items.push({ id: nextId('user'), kind: 'user', text: dedent(body), images: [] })
        } else if (current.kind === 'assistant' && body.trim()) {
            items.push({ id: nextId('assistant'), kind: 'assistant', text: dedent(body) })
        } else if (current.kind === 'result' && current.tool) {
            current.tool.result = { text: dedent(body), images: [], isError: /^\s*Error/.test(body) }
        } else if (current.kind === 'preamble' && body.trim()) {
            items.push({ id: nextId('context'), kind: 'context', label: 'Header', text: body })
        }
    }

    for (const line of text.split('\n')) {
        if (line.startsWith('> ')) {
            flush()
            current = { kind: 'user', lines: [line.slice(2)] }
        } else if (line.startsWith(`${CLAUDE_EXPORT_MARKER} `)) {
            flush()
            const tool = TOOL_LINE.exec(line)
            if (tool) {
                lastTool = { id: nextId('tool'), kind: 'tool', name: tool[1], input: tool[2] }
                items.push(lastTool)
                current = { kind: 'preamble', lines: [] }
            } else {
                current = { kind: 'assistant', lines: [line.slice(2)] }
            }
        } else if (/^\s+⎿/.test(line)) {
            flush()
            current = { kind: 'result', lines: [line.replace(/^\s+⎿\s?/, '')], tool: lastTool }
        } else if (current.kind === 'preamble' && line.trim() && items.length) {
            // Unmarked text after a tool call belongs to the agent.
            current = { kind: 'assistant', lines: [line] }
        } else {
            current.lines.push(line)
        }
    }
    flush()
    return items
}

function parseSpeakerSections(text: string): Item[] | undefined {
    const items: Item[] = []
    let speaker: string | undefined
    let lines: string[] = []
    let sections = 0
    let preamble: string[] = []

    const flush = (): void => {
        const body = lines
            .join('\n')
            .replace(/\n-{3,}\s*$/, '')
            .trim()
        lines = []
        if (!speaker || !body) {
            return
        }
        if (USER_SPEAKERS.has(speaker)) {
            items.push({ id: nextId('user'), kind: 'user', text: body, images: [] })
        } else {
            items.push({ id: nextId('assistant'), kind: 'assistant', text: body })
        }
    }

    for (const line of text.split('\n')) {
        const match = SPEAKER_LINE.exec(line.trim())
        if (match) {
            flush()
            speaker = match[1].toLowerCase()
            sections++
        } else if (speaker) {
            lines.push(line)
        } else {
            preamble.push(line)
        }
    }
    flush()
    if (sections < 2) {
        return undefined
    }
    const header = preamble.join('\n').trim()
    if (header) {
        items.unshift({ id: nextId('context'), kind: 'context', label: 'Header', text: header })
    }
    return items
}

function dedent(text: string): string {
    const lines = text.split('\n')
    const indents = lines.filter((line) => line.trim()).map((line) => /^ */.exec(line)?.[0].length ?? 0)
    const min = Math.min(...indents.slice(1), Infinity)
    if (!Number.isFinite(min) || min === 0) {
        return text.trim()
    }
    return [lines[0], ...lines.slice(1).map((line) => line.slice(min))].join('\n').trim()
}
