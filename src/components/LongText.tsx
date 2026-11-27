import { useState } from 'react'

const PREVIEW_LINES = 40
const PREVIEW_CHARS = 6000

/** Preformatted text that shows the first lines and expands on request. */
export function LongText({ text, className }: { text: string; className?: string }) {
    const [expanded, setExpanded] = useState(false)
    const lines = text.split('\n')
    const tooLong = lines.length > PREVIEW_LINES || text.length > PREVIEW_CHARS
    const shown = expanded || !tooLong ? text : lines.slice(0, PREVIEW_LINES).join('\n').slice(0, PREVIEW_CHARS)

    return (
        <div className={className}>
            <pre className="code">{shown || <span className="muted">(empty)</span>}</pre>
            {tooLong && (
                <button type="button" className="link-button" onClick={() => setExpanded(!expanded)}>
                    {expanded ? 'Show less' : `Show all ${lines.length.toLocaleString()} lines`}
                </button>
            )}
        </div>
    )
}
