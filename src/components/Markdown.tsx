import { memo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

const components: Components = {
    a: ({ href, children }) => (
        <a href={href} target="_blank" rel="noreferrer noopener">
            {children}
        </a>
    ),
    // Logs come from customers. Loading a remote image would tell its host who opened the log.
    img: ({ src, alt }) => (typeof src === 'string' && src.startsWith('data:') ? <img src={src} alt={alt ?? ''} /> : <span className="blocked-image">[image: {alt || src}]</span>),
}

/** Renders untrusted markdown. Raw HTML stays escaped because no rehype-raw plugin is loaded. */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
    return (
        <div className="markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {text}
            </ReactMarkdown>
        </div>
    )
})
