import { between, formatDuration } from '../format'
import type { Item } from '../parse/types'
import { ItemView } from './ItemView'

const GAP_MARKER_MS = 20_000

function itemEnd(item: Item): string | undefined {
    return item.kind === 'tool' ? (item.result?.timestamp ?? item.timestamp) : item.timestamp
}

/**
 * Items in order, each wrapped in an anchor the timeline and the files panel can jump to, with a
 * marker wherever a real pause happened between two of them.
 */
export function ItemList({ items, startedAt, expandTools }: { items: Item[]; startedAt?: string; expandTools: boolean }) {
    return (
        <>
            {items.map((item, index) => {
                const previousEnd = index === 0 ? startedAt : itemEnd(items[index - 1])
                const gap = between(previousEnd, item.timestamp)
                const time = item.timestamp ? Date.parse(item.timestamp) : undefined
                return (
                    <div key={`${item.id}-${expandTools}`} id={`item-${item.id}`} className="item-anchor" data-time={Number.isFinite(time) ? time : undefined}>
                        {gap !== undefined && gap >= GAP_MARKER_MS && <div className="gap-marker">{formatDuration(gap)} later</div>}
                        <ItemView item={item} expandTools={expandTools} />
                    </div>
                )
            })}
        </>
    )
}
