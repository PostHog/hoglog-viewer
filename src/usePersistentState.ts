import { useEffect, useState } from 'react'

const PREFIX = 'hoglog-viewer:'

/** State the browser keeps between logs and visits, for layout choices such as a hidden timeline. */
export function usePersistentState<T>(key: string, initial: T): [T, (value: T) => void] {
    const [value, setValue] = useState<T>(() => {
        try {
            const stored = localStorage.getItem(PREFIX + key)
            return stored === null ? initial : (JSON.parse(stored) as T)
        } catch {
            return initial
        }
    })

    useEffect(() => {
        try {
            localStorage.setItem(PREFIX + key, JSON.stringify(value))
        } catch {
            // Private browsing can refuse storage; the choice still holds for this visit.
        }
    }, [key, value])

    return [value, setValue]
}
