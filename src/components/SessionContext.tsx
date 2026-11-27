import { createContext, useContext } from 'react'
import type { Item, SubagentRun } from '../parse/types'

export interface Focus {
    itemId: string
    /** Bumps on every request, so asking for the same item twice still scrolls. */
    seq: number
}

export interface SessionContextValue {
    subagents: Map<string, SubagentRun>
    /** Item ids that live inside each subagent run, to open the right block on a jump. */
    subagentItemIds: Map<string, Set<string>>
    focus?: Focus
    jumpTo: (itemId: string) => void
    /** The conversation's kind filters, applied to subagent transcripts too. */
    showItem: (item: Item) => boolean
}

export const SessionContext = createContext<SessionContextValue>({
    subagents: new Map(),
    subagentItemIds: new Map(),
    jumpTo: () => undefined,
    showItem: () => true,
})

export function useSession(): SessionContextValue {
    return useContext(SessionContext)
}
