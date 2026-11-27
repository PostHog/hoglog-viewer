import { createContext, useCallback, useContext, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { defaultServerColor, loadOverrides, saveOverrides, type ColorOverrides } from '../serverColors'

interface ServerColorsValue {
    colorFor: (server: string) => string
    setColor: (server: string, color: string) => void
}

const ServerColorsContext = createContext<ServerColorsValue>({
    colorFor: defaultServerColor,
    setColor: () => undefined,
})

export function ServerColorsProvider({ children }: { children: ReactNode }) {
    const [overrides, setOverrides] = useState<ColorOverrides>(loadOverrides)

    const setColor = useCallback((server: string, color: string) => {
        setOverrides((current) => {
            const next = { ...current, [server]: color }
            saveOverrides(next)
            return next
        })
    }, [])

    const value = useMemo<ServerColorsValue>(
        () => ({
            colorFor: (server) => overrides[server] ?? defaultServerColor(server),
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
