import type { ImageRef, Item, Session, ToolItem } from './types'
import { asString, flattenContent, imageFromBlock, isObject, nextId, tryParseJson, type Json } from './util'

/**
 * Plain message arrays: OpenAI chat, Anthropic Messages, Vercel AI SDK UI messages,
 * Gemini contents, and Claude.ai conversation exports.
 */
export function extractMessages(data: unknown): { messages: Json[]; title?: string } | undefined {
    if (Array.isArray(data)) {
        if (data.length && data.every((entry) => isObject(entry) && Array.isArray(entry.chat_messages))) {
            const conversations = data as Json[]
            return {
                messages: conversations.flatMap((conversation) => conversation.chat_messages as Json[]),
                title: conversations.length === 1 ? asString(conversations[0].name) : undefined,
            }
        }
        const messages = data.filter(isObject)
        return messages.some(isMessage) ? { messages } : undefined
    }
    if (!isObject(data)) {
        return undefined
    }
    for (const key of ['messages', 'chat_messages', 'contents', 'conversation', 'history']) {
        const value = data[key]
        if (Array.isArray(value) && value.some((entry) => isObject(entry) && isMessage(entry))) {
            const messages = value.filter(isObject)
            const system = asString(data.system) ?? asString(data.systemInstruction)
            if (system) {
                messages.unshift({ role: 'system', content: system })
            }
            return { messages, title: asString(data.name) ?? asString(data.title) }
        }
    }
    return undefined
}

function isMessage(entry: Json): boolean {
    return typeof entry.role === 'string' || typeof entry.sender === 'string'
}

export function parseMessages(messages: Json[], title: string | undefined, skipped: number): Session {
    const items: Item[] = []
    const toolsById = new Map<string, ToolItem>()
    const models = new Set<string>()

    for (const message of messages) {
        const role = normalizeRole(asString(message.role) ?? asString(message.sender))
        const timestamp = asString(message.created_at) ?? asString(message.timestamp) ?? asString(message.createdAt)
        const model = asString(message.model)
        if (model) {
            models.add(model)
        }

        if (role === 'system') {
            const { text } = flattenContent(message.content ?? message.text)
            if (text.trim()) {
                items.push({ id: nextId('context'), kind: 'context', label: 'System prompt', text, timestamp })
            }
            continue
        }
        if (role === 'tool') {
            const callId = asString(message.tool_call_id) ?? asString(message.tool_use_id)
            const tool = callId ? toolsById.get(callId) : undefined
            const { text, images } = flattenContent(message.content)
            if (tool) {
                tool.result = { text, images, isError: false, timestamp }
            } else {
                items.push({ id: nextId('context'), kind: 'context', label: `Tool output${message.name ? `: ${message.name}` : ''}`, text, timestamp })
            }
            continue
        }

        const blocks = contentBlocks(message)
        const texts: string[] = []
        const images: ImageRef[] = []
        const flushText = (): void => {
            const text = texts.join('\n\n').trim()
            texts.length = 0
            if (role === 'user') {
                if (text || images.length) {
                    items.push({ id: nextId('user'), kind: 'user', text, images: images.splice(0), timestamp })
                }
            } else if (text) {
                items.push({ id: nextId('assistant'), kind: 'assistant', text, model, timestamp })
            }
        }

        const reasoning = asString(message.reasoning_content) ?? asString(message.reasoning)
        if (reasoning) {
            items.push({ id: nextId('thinking'), kind: 'thinking', text: reasoning, timestamp })
        }

        for (const block of blocks) {
            if (typeof block === 'string') {
                texts.push(block)
                continue
            }
            if (!isObject(block)) {
                continue
            }
            const type = asString(block.type) ?? ''
            if (typeof block.text === 'string' && (type === '' || type === 'text' || type === 'input_text' || type === 'output_text') && block.thought !== true) {
                texts.push(block.text)
            } else if (type === 'image' || type === 'image_url' || type === 'input_image') {
                const image = imageFromBlock(block)
                if (image) {
                    images.push(image)
                }
            } else if (type === 'thinking' || type === 'reasoning' || block.thought === true) {
                flushText()
                items.push({ id: nextId('thinking'), kind: 'thinking', text: asString(block.thinking) ?? asString(block.text) ?? '', timestamp })
            } else if (type === 'tool_use' || type === 'tool-call' || isObject(block.functionCall) || type.startsWith('tool-') || type === 'dynamic-tool') {
                flushText()
                const tool = toolFromBlock(block, type, timestamp)
                if (tool.toolUseId) {
                    toolsById.set(tool.toolUseId, tool)
                }
                items.push(tool)
            } else if (type === 'tool_result' || type === 'tool-result' || isObject(block.functionResponse)) {
                const id = asString(block.tool_use_id) ?? asString(block.toolCallId)
                const tool = id ? toolsById.get(id) : findLastTool(items, asString(isObject(block.functionResponse) ? block.functionResponse.name : undefined))
                const content = isObject(block.functionResponse) ? JSON.stringify(block.functionResponse.response, null, 2) : (block.content ?? block.output ?? block.result)
                const flattened = typeof content === 'string' || Array.isArray(content) ? flattenContent(content) : { text: JSON.stringify(content, null, 2), images: [] }
                if (tool) {
                    tool.result = { ...flattened, isError: block.is_error === true, timestamp }
                }
            }
        }
        flushText()

        const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : isObject(message.function_call) ? [{ function: message.function_call }] : []
        for (const call of toolCalls) {
            if (!isObject(call)) {
                continue
            }
            const fn = isObject(call.function) ? call.function : call
            const tool: ToolItem = {
                id: nextId('tool'),
                kind: 'tool',
                toolUseId: asString(call.id),
                name: asString(fn.name) ?? 'tool',
                input: typeof fn.arguments === 'string' ? tryParseJson(fn.arguments) : fn.arguments,
                timestamp,
            }
            if (tool.toolUseId) {
                toolsById.set(tool.toolUseId, tool)
            }
            items.push(tool)
        }
    }

    return {
        format: 'Message list',
        title,
        meta: models.size ? [{ label: models.size > 1 ? 'Models' : 'Model', value: [...models].join(', ') }] : [],
        items,
        skipped,
    }
}

function normalizeRole(role: string | undefined): 'user' | 'assistant' | 'system' | 'tool' {
    switch (role) {
        case 'user':
        case 'human':
            return 'user'
        case 'system':
        case 'developer':
            return 'system'
        case 'tool':
        case 'function':
            return 'tool'
        default:
            return 'assistant'
    }
}

function contentBlocks(message: Json): unknown[] {
    for (const key of ['content', 'parts']) {
        const value = message[key]
        if (Array.isArray(value) && value.length) {
            return value
        }
        if (typeof value === 'string' && value) {
            return [value]
        }
    }
    return typeof message.text === 'string' ? [message.text] : []
}

function toolFromBlock(block: Json, type: string, timestamp?: string): ToolItem {
    if (isObject(block.functionCall)) {
        return { id: nextId('tool'), kind: 'tool', name: asString(block.functionCall.name) ?? 'tool', input: block.functionCall.args, timestamp }
    }
    const name = asString(block.name) ?? asString(block.toolName) ?? (type.startsWith('tool-') ? type.slice('tool-'.length) : 'tool')
    const tool: ToolItem = {
        id: nextId('tool'),
        kind: 'tool',
        toolUseId: asString(block.id) ?? asString(block.toolCallId),
        name,
        input: block.input ?? block.args,
        timestamp,
    }
    // AI SDK UI parts carry the output on the same part.
    if ('output' in block && block.output !== undefined) {
        const output = block.output
        tool.result = {
            ...(typeof output === 'string' ? { text: output, images: [] } : { text: JSON.stringify(output, null, 2), images: [] }),
            isError: block.state === 'output-error',
        }
    } else if (typeof block.errorText === 'string') {
        tool.result = { text: block.errorText, images: [], isError: true }
    }
    return tool
}

function findLastTool(items: Item[], name?: string): ToolItem | undefined {
    for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i]
        if (item.kind === 'tool' && !item.result && (!name || item.name === name)) {
            return item
        }
    }
    return undefined
}
