import { describe, expect, it } from 'vitest'
import { HANDOFF_MESSAGE, readHandoff } from './handoff'

const opener = { name: 'posthog-admin-tab' }
const files = [{ name: 'session.jsonl', text: '{"type":"user"}' }]
const valid = { origin: 'https://us.posthog.com', source: opener, data: { type: HANDOFF_MESSAGE, version: 1, files } }

describe('readHandoff', () => {
    it('accepts files sent by the PostHog Admin tab that opened the viewer', () => {
        expect(readHandoff(valid, opener)).toEqual(files)
        expect(readHandoff({ ...valid, origin: 'https://eu.posthog.com' }, opener)).toEqual(files)
    })

    it.each([
        ['another origin', { ...valid, origin: 'https://evil.example.com' }, opener],
        ['a lookalike origin', { ...valid, origin: 'https://us.posthog.com.evil.example.com' }, opener],
        ['a window other than the opener', { ...valid, source: { name: 'other-tab' } }, opener],
        ['a tab that has no opener', valid, null],
        ['another message type', { ...valid, data: { type: 'something-else', files } }, opener],
        ['files that are not name and text strings', { ...valid, data: { type: HANDOFF_MESSAGE, files: [{ name: 'a', text: 42 }] } }, opener],
        ['an empty file list', { ...valid, data: { type: HANDOFF_MESSAGE, files: [] } }, opener],
    ])('ignores %s', (_case, event, eventOpener) => {
        expect(readHandoff(event, eventOpener)).toBeUndefined()
    })
})
