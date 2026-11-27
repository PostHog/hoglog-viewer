import type { ImageRef } from './types'

export type Json = Record<string, unknown>

export function isObject(value: unknown): value is Json {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function asString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined
}

export function asNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export interface JsonLines {
    records: unknown[]
    skipped: number
}

export function parseJsonLines(text: string): JsonLines {
    const records: unknown[] = []
    let skipped = 0
    for (const line of text.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) {
            continue
        }
        try {
            records.push(JSON.parse(trimmed))
        } catch {
            skipped++
        }
    }
    return { records, skipped }
}

export function imageFromBlock(block: Json): ImageRef | undefined {
    const source = block.source
    if (isObject(source)) {
        if (source.type === 'base64' && typeof source.data === 'string') {
            const mediaType = asString(source.media_type) ?? 'image/png'
            return { src: `data:${mediaType};base64,${source.data}`, mediaType }
        }
        if (source.type === 'url' && typeof source.url === 'string') {
            return { src: source.url }
        }
    }
    const imageUrl = block.image_url
    if (typeof imageUrl === 'string') {
        return { src: imageUrl }
    }
    if (isObject(imageUrl) && typeof imageUrl.url === 'string') {
        return { src: imageUrl.url }
    }
    return undefined
}

const TEXT_BLOCK_TYPES = new Set(['text', 'input_text', 'output_text', 'summary_text'])

/** Flattens the many content shapes (string, block array, nested tool_result content) into text and images. */
export function flattenContent(content: unknown): { text: string; images: ImageRef[] } {
    if (typeof content === 'string') {
        return { text: content, images: [] }
    }
    const texts: string[] = []
    const images: ImageRef[] = []
    if (Array.isArray(content)) {
        for (const block of content) {
            if (typeof block === 'string') {
                texts.push(block)
                continue
            }
            if (!isObject(block)) {
                continue
            }
            const type = asString(block.type)
            if (type && TEXT_BLOCK_TYPES.has(type) && typeof block.text === 'string') {
                texts.push(block.text)
            } else if (type === 'image' || type === 'input_image' || type === 'image_url') {
                const image = imageFromBlock(block)
                if (image) {
                    images.push(image)
                }
            } else if (typeof block.text === 'string') {
                texts.push(block.text)
            }
        }
    } else if (isObject(content) && typeof content.text === 'string') {
        texts.push(content.text)
    }
    return { text: texts.join('\n\n'), images }
}

export function tryParseJson(text: string): unknown {
    try {
        return JSON.parse(text)
    } catch {
        return text
    }
}

let counter = 0
export function nextId(prefix: string): string {
    counter++
    return `${prefix}-${counter}`
}
