import { describe, expect, it } from 'vitest'
import { parseToolName } from './format'
import { serverLogo } from './serverLogos'

describe('parseToolName', () => {
    it.each([
        ['mcp__posthog__exec', { server: 'posthog', tool: 'exec' }],
        ['mcp__claude_ai_Vercel__search_vercel_documentation', { server: 'Vercel', tool: 'search_vercel_documentation' }],
        ['mcp__plugin_acme_linear__create_issue', { server: 'linear', tool: 'create_issue' }],
        ['posthog__query_run', { server: 'posthog', tool: 'query_run' }],
        ['Bash', { tool: 'Bash' }],
    ])('reads %s', (name, expected) => {
        expect(parseToolName(name)).toEqual(expected)
    })
})

describe('serverLogo', () => {
    it.each([
        ['Vercel', 'Vercel'],
        ['resend', 'Resend'],
        ['google_drive', 'Google Drive'],
        ['acme-github', 'GitHub'],
        ['renderer', undefined],
        ['internal-tools', undefined],
    ])('matches %s', (server, title) => {
        expect(serverLogo(server)?.title).toBe(title)
    })
})
