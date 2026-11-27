/** What the conversation area shows before a log is open. Dropping or pasting works anywhere on the page. */
export function Dropzone({ dragging, loading, onOpenFiles }: { dragging: boolean; loading?: boolean; onOpenFiles: () => void }) {
    return (
        <div className="drop-area">
            {loading ? (
                <div className="dropzone is-loading" role="status">
                    <span className="dropzone__title">Waiting for the log from PostHog Admin…</span>
                </div>
            ) : (
                <button type="button" className={`dropzone${dragging ? ' is-dragging' : ''}`} onClick={onOpenFiles}>
                    <span className="dropzone__title">Drop an agent log here</span>
                    <span className="muted">or click to choose files, or paste a log's contents</span>
                </button>
            )}
        </div>
    )
}
