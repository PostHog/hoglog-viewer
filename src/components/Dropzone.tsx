/** What the conversation area shows before a log is open. Dropping or pasting works anywhere on the page. */
export function Dropzone({ dragging, onOpenFiles }: { dragging: boolean; onOpenFiles: () => void }) {
    return (
        <div className="drop-area">
            <button type="button" className={`dropzone${dragging ? ' is-dragging' : ''}`} onClick={onOpenFiles}>
                <span className="dropzone__title">Drop an agent log here</span>
                <span className="muted">or click to choose files, or paste a log's contents</span>
            </button>
            <div className="formats">
                <h2 className="panel__title">Supported formats</h2>
                <ul>
                    <li>
                        <strong>Claude Code</strong> session files (<code>~/.claude/projects/…/&lt;session&gt;.jsonl</code>) and <code>/export</code> text
                    </li>
                    <li>
                        <strong>Codex CLI</strong> rollouts (<code>~/.codex/sessions/…/rollout-*.jsonl</code>)
                    </li>
                    <li>
                        <strong>Message lists</strong> in JSON: OpenAI chat, Anthropic Messages, Vercel AI SDK, Gemini, and Claude.ai exports
                    </li>
                    <li>
                        <strong>Markdown chat exports</strong> with speaker headings, such as Cursor's <em>Export chat</em>
                    </li>
                </ul>
                <p className="muted">Anything else opens as raw records, so nothing is lost.</p>
                <p className="muted">
                    Claude Code saves each subagent in its own file, under <code>&lt;session&gt;/subagents/</code>. Select the main log and those files together to see subagents nested under the call
                    that started them.
                </p>
            </div>
        </div>
    )
}
