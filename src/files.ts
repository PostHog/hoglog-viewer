import type { Session, ToolItem } from './parse/types'
import { isObject } from './parse/util'

export type TouchKind = 'read' | 'edit' | 'write' | 'delete'

export interface FileTouch {
    kind: TouchKind
    tool: ToolItem
    failed: boolean
    /** The subagent that touched the file, when it was not the main agent. */
    subagent?: string
}

export interface TouchedFile {
    path: string
    touches: FileTouch[]
    reads: number
    changes: number
}

const PATCH_HEADER = /^\*\*\* (Add|Update|Delete) File: (.+)$/gm

/** Paths a tool call read or changed. Only tools with structured input count; shell commands are not guessed at. */
export function toolTouches(tool: ToolItem): { path: string; kind: TouchKind }[] {
    const input = tool.input
    if (typeof input === 'string' && tool.name.includes('patch')) {
        return patchTouches(input)
    }
    if (!isObject(input)) {
        return []
    }
    const path = [input.file_path, input.notebook_path, input.filePath].find((value): value is string => typeof value === 'string')
    switch (tool.name) {
        case 'Read':
        case 'NotebookRead':
            return path ? [{ path, kind: 'read' }] : []
        case 'Write':
            return path ? [{ path, kind: 'write' }] : []
        case 'Edit':
        case 'MultiEdit':
        case 'NotebookEdit':
            return path ? [{ path, kind: 'edit' }] : []
    }
    if (typeof input.input === 'string' && tool.name.includes('patch')) {
        return patchTouches(input.input)
    }
    return []
}

function patchTouches(patch: string): { path: string; kind: TouchKind }[] {
    return [...patch.matchAll(PATCH_HEADER)].map((match) => ({
        path: match[2].trim(),
        kind: match[1] === 'Add' ? 'write' : match[1] === 'Delete' ? 'delete' : 'edit',
    }))
}

/** Every file the session and its subagents read or changed, most-changed first. */
export function touchedFiles(session: Session): TouchedFile[] {
    const root = session.meta.find((field) => field.label === 'Directory')?.value
    const byPath = new Map<string, TouchedFile>()
    const collect = (tools: ToolItem[], subagent?: string): void => {
        for (const tool of tools) {
            for (const { path, kind } of toolTouches(tool)) {
                const display = relativeTo(path, root)
                const entry = byPath.get(display) ?? { path: display, touches: [], reads: 0, changes: 0 }
                entry.touches.push({ kind, tool, failed: tool.result?.isError === true, subagent })
                if (kind === 'read') {
                    entry.reads++
                } else {
                    entry.changes++
                }
                byPath.set(display, entry)
            }
        }
    }
    collect(session.items.filter((item): item is ToolItem => item.kind === 'tool'))
    for (const run of session.subagents ?? []) {
        collect(
            run.session.items.filter((item): item is ToolItem => item.kind === 'tool'),
            run.description ?? 'Subagent'
        )
    }
    return [...byPath.values()].sort((a, b) => b.changes - a.changes || b.touches.length - a.touches.length || a.path.localeCompare(b.path))
}

function relativeTo(path: string, root?: string): string {
    if (root && path.startsWith(`${root}/`)) {
        return path.slice(root.length + 1)
    }
    return path
}
