# Hoglog viewer

A static web app for reading agent session logs that people send us: drop a file in, read the conversation turn by turn.

The file is parsed in the browser and never leaves it. There is no backend, no storage, and no analytics, and the viewer does not load remote images from inside a log.

## What it shows

- Each turn opens with the user's prompt, followed by the agent's replies, reasoning, and tool calls in order.
- Tool calls are one line each (tool, command or path, duration, status) and expand to show input and output. Edits render as diffs and todo lists as checklists.
- MCP tool calls carry a badge for their server. PostHog uses the logomark from `@posthog/brand` (the white mono one in dark mode, per the brand rules), and common providers use their logo from `simple-icons` (listed in `src/serverLogos.ts`). The MCP servers panel filters the timeline to one server.
- Each MCP server has its own color on its badge, its tool rows, the per-turn chart (stacked by server) and the tool list. Defaults live in `src/serverColors.ts`: a few fixed picks, then the provider's brand color, then a stable pick from the `@posthog/brand` palette. Click a server's swatch to change its color; the browser keeps the choice.
- The timeline is docked under the conversation: prompts, agent replies and thinking, built-in tools, one lane per MCP server and one per subagent, on a time axis where tool calls are as wide as they took and pauses over a minute are squeezed into a labeled break. Clicking an event (or stepping with the arrow keys) scrolls the conversation to it, and a cursor follows the conversation as you scroll. Drag its top edge to resize it, collapse it to its bar, or hide it and bring it back from the Timeline tab on the right.
- The conversation marks pauses of 20 seconds or more between items, and each turn says how long the user took to send it.
- The Files tab on the right lists every file the agent and its subagents read or changed (from structured tools like Read, Edit, Write and `apply_patch`; shell commands are not guessed at), and jumps to each read or change.
- Subagents: open the main log together with the `agent-<id>.jsonl` (and `.meta.json`) files from the session's `subagents/` folder, and each subagent's transcript is nested under the call that started it, with its own timeline lane.
- The sidebar has totals (duration, prompts, tool calls, failures, tokens, cost), tool calls per turn, the most used tools, session details, and a turn outline you can jump through.
- Search covers prompts, replies, tool input, and tool output. Filters hide tool calls, reasoning, injected context (system reminders, hook output, instruction files), or subagent activity.

## Supported formats

The format is detected from the content, not the file name.

| Format | Where it comes from |
| --- | --- |
| Claude Code session JSONL | `~/.claude/projects/<project>/<session>.jsonl` |
| Claude Code `/export` text | the `/export` command |
| Codex CLI rollout JSONL | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` |
| Message lists (JSON or JSONL) | OpenAI chat, Anthropic Messages, Vercel AI SDK UI messages, Gemini contents, Claude.ai exports |
| Markdown chat exports | Cursor's *Export chat*, or any markdown with `**User**` / `**Assistant**` style speaker headings |

Anything else opens as raw JSON records or as one plain document.

To add a format, write a parser in `src/parse/` that returns a `Session` (see `src/parse/types.ts`), detect it in `src/parse/index.ts`, and add a case to `src/parse/parse.test.ts`.
Test fixtures must be invented. Never commit a real log or anything adapted from one: they contain customer code, paths, and personal details.

## Development

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm test
pnpm typecheck
```

## Deploying to HostHog

The app is published by hand to HostHog, which serves static sites behind employee login.
HostHog takes the site slug from the zip name, so `hoglog-viewer.zip` publishes to `https://hoglog-viewer.hosthog.dev`.

```bash
pnpm install --frozen-lockfile
pnpm package    # builds dist/ and writes hoglog-viewer.zip
```

Then publish `hoglog-viewer.zip` with `hosthog publish`, the HostHog MCP `publish` tool, or by dragging it into HostHog.
The build uses relative asset paths, so it works from any path on the host.
