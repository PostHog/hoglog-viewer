import { describe, expect, it } from 'vitest'
import { groupTurns, parseLog } from '.'
import type { Item, ToolItem } from './types'

const jsonl = (...records: unknown[]): string => records.map((record) => JSON.stringify(record)).join('\n')
const kinds = (items: Item[]): string[] => items.map((item) => item.kind)
const tools = (items: Item[]): ToolItem[] => items.filter((item): item is ToolItem => item.kind === 'tool')

describe('Claude Code', () => {
    const base = { sessionId: 's1', cwd: '/work/demo', version: '9.9.9', gitBranch: 'main', isSidechain: false }
    const log = jsonl(
        { type: 'permission-mode', permissionMode: 'auto', sessionId: 's1' },
        { ...base, type: 'user', uuid: 'u1', timestamp: '2026-01-01T10:00:00Z', message: { role: 'user', content: 'List the files' } },
        {
            ...base,
            type: 'assistant',
            uuid: 'a1',
            timestamp: '2026-01-01T10:00:01Z',
            message: { id: 'm1', model: 'claude-test', role: 'assistant', content: [{ type: 'thinking', thinking: '' }], usage: { input_tokens: 5, output_tokens: 7 } },
        },
        {
            ...base,
            type: 'assistant',
            uuid: 'a2',
            timestamp: '2026-01-01T10:00:02Z',
            message: {
                id: 'm1',
                model: 'claude-test',
                role: 'assistant',
                content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }],
                usage: { input_tokens: 5, output_tokens: 7 },
            },
        },
        {
            ...base,
            type: 'user',
            uuid: 'u2',
            timestamp: '2026-01-01T10:00:04Z',
            message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ls: denied', is_error: true }] },
        },
        { ...base, type: 'user', uuid: 'u2', timestamp: '2026-01-01T10:00:04Z', message: { role: 'user', content: 'duplicate uuid, dropped' } },
        { ...base, type: 'user', uuid: 'u3', isMeta: true, timestamp: '2026-01-01T10:00:05Z', message: { role: 'user', content: '<system-reminder>be brief</system-reminder>' } },
        { ...base, type: 'user', uuid: 'u4', timestamp: '2026-01-01T10:00:06Z', message: { role: 'user', content: '<command-name>/compact</command-name><command-args></command-args>' } },
        {
            ...base,
            type: 'assistant',
            uuid: 'a3',
            timestamp: '2026-01-01T10:00:07Z',
            message: { id: 'm2', role: 'assistant', content: [{ type: 'text', text: 'Done.' }], usage: { input_tokens: 1, output_tokens: 3 } },
        },
        { type: 'ai-title', aiTitle: 'Listing files', sessionId: 's1' },
        { type: 'cost-state', sessionId: 's1', totalCostUSD: 0.42, totalLinesAdded: 3, totalLinesRemoved: 1 }
    )

    it('pairs tool calls with results and keeps the conversation order', () => {
        const session = parseLog(log)

        expect(session.format).toBe('Claude Code')
        expect(session.title).toBe('Listing files')
        expect(kinds(session.items)).toEqual(['user', 'thinking', 'tool', 'context', 'event', 'assistant'])
        expect(tools(session.items)[0].result).toMatchObject({ text: 'ls: denied', isError: true, timestamp: '2026-01-01T10:00:04Z' })
    })

    it('counts usage once per API message and reads cost', () => {
        const session = parseLog(log)

        expect(session.usage).toEqual({ input: 6, output: 10, cacheRead: 0, cacheWrite: 0 })
        expect(session.costUsd).toBe(0.42)
        expect(session.meta).toContainEqual({ label: 'Lines changed', value: '+3 / -1' })
    })
})

describe('Codex CLI', () => {
    it('reads rollout envelopes, shell calls and token totals', () => {
        const log = jsonl(
            { timestamp: '2026-01-01T10:00:00Z', type: 'session_meta', payload: { cwd: '/work/demo', cli_version: '1.0.0', git: { branch: 'main' } } },
            { timestamp: '2026-01-01T10:00:00Z', type: 'turn_context', payload: { model: 'gpt-test' } },
            {
                timestamp: '2026-01-01T10:00:00Z',
                type: 'response_item',
                payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>cwd</environment_context>' }] },
            },
            { timestamp: '2026-01-01T10:00:01Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Run the tests' }] } },
            { timestamp: '2026-01-01T10:00:02Z', type: 'response_item', payload: { type: 'reasoning', summary: [{ type: 'summary_text', text: 'Need to run pytest' }] } },
            {
                timestamp: '2026-01-01T10:00:03Z',
                type: 'response_item',
                payload: { type: 'function_call', name: 'shell', call_id: 'c1', arguments: JSON.stringify({ command: ['bash', '-lc', 'pytest -q'] }) },
            },
            {
                timestamp: '2026-01-01T10:00:09Z',
                type: 'response_item',
                payload: { type: 'function_call_output', call_id: 'c1', output: JSON.stringify({ output: '1 failed', metadata: { exit_code: 1 } }) },
            },
            { timestamp: '2026-01-01T10:00:10Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'One test fails.' }] } },
            { timestamp: '2026-01-01T10:00:10Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 20 } } } }
        )

        const session = parseLog(log)

        expect(session.format).toBe('Codex CLI')
        expect(kinds(session.items)).toEqual(['context', 'user', 'thinking', 'tool', 'assistant'])
        expect(tools(session.items)[0]).toMatchObject({ name: 'shell', input: { command: 'pytest -q' }, result: { text: '1 failed', isError: true } })
        expect(session.usage).toEqual({ input: 60, output: 20, cacheRead: 40, cacheWrite: 0 })
        expect(session.meta[0]).toEqual({ label: 'Model', value: 'gpt-test' })
    })
})

describe('message lists', () => {
    it.each([
        [
            'OpenAI chat',
            {
                messages: [
                    { role: 'system', content: 'You are terse.' },
                    { role: 'user', content: 'Weather?' },
                    { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Lisbon"}' } }] },
                    { role: 'tool', tool_call_id: 'call_1', content: 'Sunny' },
                    { role: 'assistant', content: 'Sunny in Lisbon.' },
                ],
            },
        ],
        [
            'Anthropic Messages',
            [
                { role: 'user', content: 'Weather?' },
                { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'get_weather', input: { city: 'Lisbon' } }] },
                { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'Sunny' }] },
                { role: 'assistant', content: [{ type: 'text', text: 'Sunny in Lisbon.' }] },
            ],
        ],
        [
            'Vercel AI SDK',
            [
                { role: 'user', parts: [{ type: 'text', text: 'Weather?' }] },
                {
                    role: 'assistant',
                    parts: [
                        { type: 'tool-get_weather', toolCallId: 'x1', state: 'output-available', input: { city: 'Lisbon' }, output: 'Sunny' },
                        { type: 'text', text: 'Sunny in Lisbon.' },
                    ],
                },
            ],
        ],
    ])('normalizes %s', (_name, data) => {
        const session = parseLog(JSON.stringify(data))
        const [tool] = tools(session.items)

        expect(session.format).toBe('Message list')
        expect(tool).toMatchObject({ name: 'get_weather', input: { city: 'Lisbon' } })
        expect(tool.result?.text).toBe('Sunny')
        expect(session.items.filter((item) => item.kind === 'user').map((item) => item.text)).toEqual(['Weather?'])
        expect(session.items.at(-1)).toMatchObject({ kind: 'assistant', text: 'Sunny in Lisbon.' })
    })

    it('reads Claude.ai conversation exports', () => {
        const data = [
            {
                name: 'Trip ideas',
                chat_messages: [
                    { sender: 'human', text: 'Ideas for Porto?' },
                    { sender: 'assistant', text: 'Walk the Ribeira.' },
                ],
            },
        ]

        const session = parseLog(JSON.stringify(data))

        expect(session.title).toBe('Trip ideas')
        expect(kinds(session.items)).toEqual(['user', 'assistant'])
    })
})

describe('text exports', () => {
    it('reads Claude Code /export text with tool calls and their output', () => {
        const text = ['> Fix the typo', '', '⏺ Read(src/app.ts)', '  ⎿  Read 12 lines', '', '⏺ Fixed it.', '', '> Thanks'].join('\n')

        const session = parseLog(text)

        expect(session.format).toBe('Claude Code export (text)')
        expect(kinds(session.items)).toEqual(['user', 'tool', 'assistant', 'user'])
        expect(tools(session.items)[0]).toMatchObject({ name: 'Read', input: 'src/app.ts', result: { text: 'Read 12 lines' } })
    })

    it('splits markdown exports on speaker headings', () => {
        const text = ['# Chat', '', '**User**', '', 'Hello', '', '---', '', '**Cursor**', '', 'Hi, what can I do?'].join('\n')

        const session = parseLog(text)

        expect(session.format).toBe('Markdown chat export')
        expect(session.items.map((item) => [item.kind, 'text' in item ? item.text : ''])).toEqual([
            ['context', '# Chat'],
            ['user', 'Hello'],
            ['assistant', 'Hi, what can I do?'],
        ])
    })

    it('falls back to one document for unstructured text', () => {
        expect(parseLog('just some notes').format).toBe('Plain text')
    })
})

describe('robustness', () => {
    it('skips malformed JSON lines and shows unknown records raw', () => {
        const session = parseLog('{"kind":"a"}\nnot json\n{"kind":"b"}')

        expect(session.format).toBe('Unknown JSON')
        expect(session.skipped).toBe(1)
        expect(session.items.filter((item) => item.kind === 'context')).toHaveLength(2)
    })
})

describe('groupTurns', () => {
    it('opens a turn per top-level prompt and numbers prompts from 1', () => {
        const session = parseLog(
            JSON.stringify([
                { role: 'system', content: 'rules' },
                { role: 'user', content: 'a' },
                { role: 'assistant', content: 'b' },
                { role: 'user', content: 'c' },
            ])
        )

        const turns = groupTurns(session.items)

        expect(turns.map((turn) => [turn.number, turn.prompt?.text, turn.items.length])).toEqual([
            [0, undefined, 1],
            [1, 'a', 1],
            [2, 'c', 0],
        ])
    })
})
