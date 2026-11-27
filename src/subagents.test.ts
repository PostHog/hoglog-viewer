import { describe, expect, it } from 'vitest'
import { touchedFiles } from './files'
import { parseLogFiles } from './parse'
import type { ToolItem } from './parse/types'

const jsonl = (...records: unknown[]): string => records.map((record) => JSON.stringify(record)).join('\n')
const base = { sessionId: 's1', cwd: '/work/demo', isSidechain: false }

const mainLog = jsonl(
    { ...base, type: 'user', uuid: 'u1', timestamp: '2026-01-01T10:00:00Z', message: { role: 'user', content: 'Fix the README' } },
    {
        ...base,
        type: 'assistant',
        uuid: 'a1',
        timestamp: '2026-01-01T10:00:01Z',
        message: {
            id: 'm1',
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'toolu_agent', name: 'Agent', input: { description: 'Edit README', subagent_type: 'general-purpose', prompt: 'Fix it' } }],
        },
    },
    {
        ...base,
        type: 'user',
        uuid: 'u2',
        timestamp: '2026-01-01T10:00:20Z',
        toolUseResult: { agentId: 'abc123', status: 'completed' },
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_agent', content: 'Done' }] },
    }
)

const subagentBase = { ...base, isSidechain: true, agentId: 'abc123' }
const subagentLog = jsonl(
    { ...subagentBase, type: 'user', uuid: 's-u1', timestamp: '2026-01-01T10:00:02Z', message: { role: 'user', content: 'Fix it' } },
    {
        ...subagentBase,
        type: 'assistant',
        uuid: 's-a1',
        timestamp: '2026-01-01T10:00:05Z',
        message: { id: 'sm1', role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_edit', name: 'Edit', input: { file_path: '/work/demo/README.md', old_string: 'teh', new_string: 'the' } }] },
    },
    {
        ...subagentBase,
        type: 'user',
        uuid: 's-u2',
        timestamp: '2026-01-01T10:00:06Z',
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_edit', content: 'Updated' }] },
    }
)

describe('parseLogFiles', () => {
    it('nests a subagent transcript under the call that started it', () => {
        const session = parseLogFiles([
            { name: 'agent-abc123.jsonl', text: subagentLog },
            { name: 'session.jsonl', text: mainLog },
            { name: 'agent-abc123.meta.json', text: JSON.stringify({ toolUseId: 'toolu_agent', description: 'README fixer', agentType: 'general-purpose' }) },
        ])

        const agentCall = session.items.find((item): item is ToolItem => item.kind === 'tool')
        expect(agentCall?.subagentId).toBe('abc123')
        expect(session.subagents).toHaveLength(1)
        expect(session.subagents?.[0]).toMatchObject({ agentId: 'abc123', description: 'README fixer', toolUseId: 'toolu_agent' })
        expect(session.subagents?.[0].session.items.some((item) => item.sidechain)).toBe(false)
    })

    it('counts files a subagent changed, relative to the session directory', () => {
        const session = parseLogFiles([
            { name: 'session.jsonl', text: mainLog },
            { name: 'agent-abc123.jsonl', text: subagentLog },
        ])

        expect(touchedFiles(session)).toMatchObject([{ path: 'README.md', changes: 1, reads: 0, touches: [{ kind: 'edit', subagent: 'Edit README' }] }])
    })
})

describe('touchedFiles', () => {
    it('reads Codex apply_patch headers', () => {
        const patch = ['*** Begin Patch', '*** Add File: src/new.ts', '+x', '*** Update File: src/old.ts', '*** Delete File: src/gone.ts', '*** End Patch'].join('\n')
        const session = parseLogFiles([
            {
                name: 'rollout.jsonl',
                text: jsonl({ timestamp: '2026-01-01T10:00:00Z', type: 'response_item', payload: { type: 'custom_tool_call', name: 'apply_patch', call_id: 'c1', input: patch } }),
            },
        ])

        expect(touchedFiles(session).map((file) => [file.path, file.touches[0].kind])).toEqual([
            ['src/gone.ts', 'delete'],
            ['src/new.ts', 'write'],
            ['src/old.ts', 'edit'],
        ])
    })
})
