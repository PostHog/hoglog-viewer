export interface ImageRef {
    /** A URL the browser can render directly, usually a `data:` URL. */
    src: string
    mediaType?: string
}

interface ItemBase {
    id: string
    timestamp?: string
    /** True when the item came from a subagent (Claude Code sidechain). */
    sidechain?: boolean
}

export interface UserItem extends ItemBase {
    kind: 'user'
    text: string
    images: ImageRef[]
    /** Typed while the agent was busy and delivered later. */
    queued?: boolean
}

export interface AssistantItem extends ItemBase {
    kind: 'assistant'
    text: string
    model?: string
}

export interface ThinkingItem extends ItemBase {
    kind: 'thinking'
    text: string
    durationMs?: number
}

export interface ToolResult {
    text: string
    images: ImageRef[]
    isError: boolean
    timestamp?: string
}

export interface ToolItem extends ItemBase {
    kind: 'tool'
    toolUseId?: string
    name: string
    input: unknown
    result?: ToolResult
    /** Set on a call that started a subagent; matches `SubagentRun.agentId`. */
    subagentId?: string
}

/** Text injected by the harness: reminders, hook output, skill bodies, instructions. */
export interface ContextItem extends ItemBase {
    kind: 'context'
    label: string
    text: string
}

/** A one-line marker: a slash command, an interruption, a compaction, a PR link. */
export interface EventItem extends ItemBase {
    kind: 'event'
    label: string
    detail?: string
    tone?: 'neutral' | 'error' | 'success'
}

export type Item = UserItem | AssistantItem | ThinkingItem | ToolItem | ContextItem | EventItem

export interface Turn {
    index: number
    /** 1-based prompt number; 0 for anything logged before the first prompt. */
    number: number
    /** The prompt that opened the turn; absent for anything logged before the first prompt. */
    prompt?: UserItem
    items: Item[]
    startedAt?: string
    endedAt?: string
}

export interface TokenUsage {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
}

export interface MetaField {
    label: string
    value: string
    href?: string
}

export interface SubagentRun {
    agentId: string
    description?: string
    agentType?: string
    /** The tool call in the parent session that started this run. */
    toolUseId?: string
    session: Session
}

export interface Session {
    /** Human name of the detected format, e.g. "Claude Code". */
    format: string
    /** Set when this log is a subagent's own transcript. */
    agentId?: string
    subagents?: SubagentRun[]
    title?: string
    meta: MetaField[]
    items: Item[]
    usage?: TokenUsage
    costUsd?: number
    /** Lines or records the parser could not read. */
    skipped: number
}
