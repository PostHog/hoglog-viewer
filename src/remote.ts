import type { LogFile } from './parse'

const URL_PARAM = 'url'
const DEFAULT_NAME = 'log'
/** Plain http is only accepted for local testing. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])

/**
 * Log URLs passed as `?url=` or `#url=`, repeatable for a main log plus its subagent files.
 * The fragment form never reaches the server, so it keeps signed links out of access logs.
 */
export function logUrlsFrom(search: string, hash: string): string[] {
    const values = [...new URLSearchParams(search).getAll(URL_PARAM), ...new URLSearchParams(hash.replace(/^#/, '')).getAll(URL_PARAM)]
    return values.filter((value) => isFetchable(value))
}

function isFetchable(value: string): boolean {
    try {
        const url = new URL(value)
        return url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))
    } catch {
        return false
    }
}

/** The address bar without the log parameters, so a signed link does not stay in history or get shared. */
export function locationWithoutLogUrls(pathname: string, search: string, hash: string): string {
    const query = new URLSearchParams(search)
    query.delete(URL_PARAM)
    const fragment = new URLSearchParams(hash.replace(/^#/, ''))
    fragment.delete(URL_PARAM)
    const queryString = query.toString()
    const fragmentString = fragment.toString()
    return `${pathname}${queryString ? `?${queryString}` : ''}${fragmentString ? `#${fragmentString}` : ''}`
}

/** Prefers the name S3 sends back, then the one signed into the link, then the last path segment. */
export function fileNameFor(url: string, contentDisposition: string | null): string {
    const fromHeader = contentDisposition ? dispositionFileName(contentDisposition) : undefined
    if (fromHeader) {
        return fromHeader
    }
    try {
        const parsed = new URL(url)
        const signedDisposition = parsed.searchParams.get('response-content-disposition')
        const fromSigned = signedDisposition ? dispositionFileName(signedDisposition) : undefined
        if (fromSigned) {
            return fromSigned
        }
        const segment = parsed.pathname.split('/').filter(Boolean).pop()
        return segment ? decodeURIComponent(segment) : DEFAULT_NAME
    } catch {
        return DEFAULT_NAME
    }
}

function dispositionFileName(disposition: string): string | undefined {
    const encoded = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(disposition)
    if (encoded) {
        try {
            return decodeURIComponent(encoded[1].trim().replace(/^"|"$/g, ''))
        } catch {
            // Fall through to the plain filename.
        }
    }
    const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(disposition)
    return plain ? (plain[2] ?? plain[1]).trim() : undefined
}

export class RemoteLogError extends Error {}

export async function fetchLog(url: string): Promise<LogFile> {
    let response: Response
    try {
        response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' })
    } catch {
        throw new RemoteLogError(`The browser could not load ${hostOf(url)}. The link may have expired, or the server does not allow this site to read it (CORS).`)
    }
    if (!response.ok) {
        const hint = response.status === 403 ? ' Signed links expire quickly; get a fresh one.' : ''
        throw new RemoteLogError(`${hostOf(url)} answered ${response.status}.${hint}`)
    }
    return { name: fileNameFor(url, response.headers.get('content-disposition')), text: await response.text() }
}

function hostOf(url: string): string {
    try {
        return new URL(url).host
    } catch {
        return 'the link'
    }
}
