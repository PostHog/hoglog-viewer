import { describe, expect, it } from 'vitest'
import { fileNameFor, locationWithoutLogUrls, logUrlsFrom } from './remote'

const SIGNED = 'https://bucket.s3.amazonaws.com/agent_transcripts/org/abc.jsonl?X-Amz-Signature=deadbeef&response-content-disposition=attachment%3B%20filename%3D%22session.jsonl%22'

describe('logUrlsFrom', () => {
    it('reads repeated url parameters from the query and the fragment', () => {
        const search = `?url=${encodeURIComponent(SIGNED)}`
        const hash = `#url=${encodeURIComponent('https://example.com/agent-a1.jsonl')}`

        expect(logUrlsFrom(search, hash)).toEqual([SIGNED, 'https://example.com/agent-a1.jsonl'])
    })

    it.each(['javascript:alert(1)', 'file:///etc/passwd', 'http://example.com/log.jsonl', 'not a url'])('ignores %s', (value) => {
        expect(logUrlsFrom(`?url=${encodeURIComponent(value)}`, '')).toEqual([])
    })
})

describe('locationWithoutLogUrls', () => {
    it('drops the signed link and keeps other parameters', () => {
        expect(locationWithoutLogUrls('/', `?url=${encodeURIComponent(SIGNED)}&theme=dark`, `#url=x`)).toBe('/?theme=dark')
    })
})

describe('fileNameFor', () => {
    it('prefers the response header, then the signed disposition, then the path', () => {
        expect(fileNameFor(SIGNED, 'attachment; filename="from-header.jsonl"')).toBe('from-header.jsonl')
        expect(fileNameFor(SIGNED, null)).toBe('session.jsonl')
        expect(fileNameFor('https://example.com/logs/rollout-1.jsonl', null)).toBe('rollout-1.jsonl')
    })
})
