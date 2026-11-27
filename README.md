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

## Opening a log from PostHog Admin

PostHog Admin hands a transcript to the viewer without a link or a server in between, through the console's `Handoff` (`posthog/admin/console/panels.py` in PostHog/posthog):

1. It opens `https://hoglog-viewer.hosthog.dev/#handoff` in a new tab.
2. The viewer posts `{ type: "posthog-admin:ready", version: 1 }` to the tab that opened it.
3. PostHog Admin answers with `{ type: "posthog-admin:handoff", version: 1, files: [{ name, text }] }`, sent only to the viewer's origin.
4. The viewer sets `window.opener = null` as soon as the file arrives, before it renders anything, so nothing in this tab can navigate the PostHog Admin tab.

The viewer accepts that message only from the tab that opened it, and only when that tab is on `us.posthog.com`, `eu.posthog.com` or `localhost:8010` (see `src/handoff.ts`).
The opening page must keep its link to the tab it opens, so it sends `Cross-Origin-Opener-Policy: same-origin-allow-popups`.

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

The site lives at https://hoglog-viewer.hosthog.dev, behind PostHog employee login.
HostHog is connected to this repository: every push to `main` rebuilds and publishes the site, and every pull request gets its own preview link.
There is no deploy step to run.

To check a production build locally, run `pnpm build && pnpm preview`.
