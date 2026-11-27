/** What the conversation area shows before a log is open. Dropping or pasting works anywhere on the page. */
export function Dropzone({ dragging, onOpenFiles }: { dragging: boolean; onOpenFiles: () => void }) {
    return (
        <div className="drop-area">
            <button type="button" className={`dropzone${dragging ? ' is-dragging' : ''}`} onClick={onOpenFiles}>
                <span className="dropzone__title">Drop an agent log here</span>
                <span className="muted">or click to choose files, or paste a log's contents</span>
            </button>
        </div>
    )
}
