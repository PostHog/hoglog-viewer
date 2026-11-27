import { createContext, useCallback, useContext, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { defaultServerColor, loadOverrides, saveOverrides, type ColorOverrides } from '../serverColors'

interface ServerColorsValue {
    colorFor: (server: string) => string
    isOverridden: (server: string) => boolean
    setColor: (server: string, color: string | undefined) => void
}

const ServerColorsContext = createContext<ServerColorsValue>({
    colorFor: defaultServerColor,
    isOverridden: () => false,
    setColor: () => undefined,
})

export function ServerColorsProvider({ children }: { children: ReactNode }) {
    const [overrides, setOverrides] = useState<ColorOverrides>(loadOverrides)

    const setColor = useCallback((server: string, color: string | undefined) => {
        setOverrides((current) => {
            const next = { ...current }
            if (color === undefined || color.toLowerCase() === defaultServerColor(server).toLowerCase()) {
                delete next[server]
            } else {
                next[server] = color
            }
            saveOverrides(next)
            return next
        })
    }, [])

    const value = useMemo<ServerColorsValue>(
        () => ({
            colorFor: (server) => overrides[server] ?? defaultServerColor(server),
            isOverridden: (server) => server in overrides,
            setColor,
        }),
        [overrides, setColor]
    )

    return <ServerColorsContext.Provider value={value}>{children}</ServerColorsContext.Provider>
}

export function useServerColors(): ServerColorsValue {
    return useContext(ServerColorsContext)
}

/** Sets `--server-color` for the badge, the tool row and the per-turn chart. */
export function useServerStyle(server: string | undefined): CSSProperties | undefined {
    const { colorFor } = useServerColors()
    return server ? ({ '--server-color': colorFor(server) } as CSSProperties) : undefined
}
