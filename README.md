# Memory Brain

> Local-first long-term memory for AI coding agents.  
> Help Codex, Claude, and custom agents remember user preferences, project rules, prior decisions, and session handoff context.

Memory Brain is a CLI runtime that gives AI agents a practical memory layer.

Most coding agents are good at the current turn, but weak at continuity. They forget what the user said last session, lose project-specific rules, repeat context gathering, and force users to restate the same preferences over and over.

Memory Brain fixes that with local-first memory:

- remember stable user preferences
- recall project context before multi-step work
- summarize sessions for later continuation
- keep data on the user's machine instead of a hosted memory service

## Why It Exists

### Common user pain points

- "I already told the agent to answer in Chinese, but it forgot."
- "I said this repo should avoid new dependencies, but the next session ignored it."
- "When I open a new thread, I have to explain the project again."
- "I want continuity across sessions, without sending my private context to a cloud memory product."

### What Memory Brain helps with

- Long-term memory for AI agents
- Project memory for coding assistants
- Session handoff for agent workflows
- Local memory storage for private user context
- Recall of durable rules, preferences, architecture decisions, and summaries

## Who It Is For

- Codex users who want automatic recall before continuing work
- Claude users who want the same memory workflow locally
- teams building custom AI agent shells or skill-based hosts
- developers who want a simple SQLite-backed memory CLI instead of a hosted memory platform

## What It Does

- `remember`: extract and store durable memories from natural language
- `recall`: return prompt-ready context blocks for the current task
- `summarize-session`: write a handoff summary and persist useful long-term memory
- `status` and `doctor`: inspect runtime state and health
- optional semantic retrieval through an embedding provider

Memory scopes:

- `global`: user identity, preferences, long-term beliefs
- `project`: repo rules, naming conventions, architecture decisions
- `session`: temporary context for the current conversation

## Why Local-First

- private by default
- works without a hosted memory backend
- SQLite-based storage with readable local summaries and archives
- easier to trust, inspect, back up, and version

By default, Memory Brain stores data under:

```text
~/.memory-brain
```

## Quick Start

### Codex

```bash
npm install -g memory-brain
memory-brain setup --host codex
memory-brain status
```

### Claude

```bash
npm install -g memory-brain
memory-brain setup --host claude
memory-brain status
```

### What `setup` does

- initializes `~/.memory-brain` if needed
- installs the bundled Memory Brain skill
- adds host-level routing instructions for automatic memory usage
- enables high-probability recall and remember triggers from normal language

## How It Works In Practice

After setup, the host can treat requests like these as memory actions by default:

- "记住这个，我一会换线程继续"
- "继续刚才那个项目"
- "以后默认中文回答"
- "这个项目不要引入新依赖"
- "remember this"
- "save this context"
- "continue the same project"
- "my name is ..."

Typical workflow:

```bash
memory-brain remember \
  --text "以后默认用中文回答，这个项目里尽量最小改动。" \
  --workspace "$PWD" \
  --session sess_demo

memory-brain recall \
  --task "继续当前项目实现，保持最小改动并用中文输出" \
  --workspace "$PWD" \
  --session sess_demo

memory-brain summarize-session \
  --session sess_demo \
  --workspace "$PWD"
```

## CLI Commands

```bash
memory-brain setup
memory-brain init
memory-brain remember --text "..."
memory-brain recall --task "..."
memory-brain summarize-session --session sess_demo
memory-brain status
memory-brain doctor
memory-brain inspect
memory-brain enable-embedding --provider-type api --provider openai-compatible --model text-embedding-3-small
memory-brain disable-embedding
```

## Installation Notes

Requirements:

- Node.js 20+
- npm 10+

Local development:

```bash
npm install
npm run build
npm test
```

Optional local global install:

```bash
npm install -g .
memory-brain --help
```

## Host Integration

Current built-in setup targets:

- Codex
- Claude
- custom/manual hosts via skill installation

The bundled host rules are optimized for high trigger probability, not hard deterministic routing. If you need guaranteed invocation for every relevant request, use an external deterministic wrapper around the host.

## Storage Layout

```text
~/.memory-brain/
  config/config.toml
  data/memory.db
  data/summaries/
  data/archives/
  data/indexes/
  logs/
```

## Semantic Retrieval

Memory Brain works without embeddings by default.  
If you want semantic retrieval, you can enable an API-based embedding provider:

```bash
memory-brain enable-embedding \
  --provider-type api \
  --provider openai-compatible \
  --base-url https://api.example.com/v1 \
  --api-key-env OPENAI_API_KEY \
  --model text-embedding-3-small
```

## Why Not Just Use Prompt Files

Prompt files and project instructions are static. Memory Brain is for dynamic context:

- user profile changes over time
- project rules accumulate over time
- session summaries need to be generated, not hand-maintained
- recall should depend on the current task, workspace, and session

## Open Source Release Checklist

Before publishing to GitHub and npm, make sure you also have:

- a real GitHub repository URL added to `package.json` as `repository`, `homepage`, and `bugs`
- a matching GitHub repo description using keywords like `AI agent memory`, `local-first memory`, `Codex`, `Claude`, and `session handoff`
- a first release tag and changelog or release notes
- a few terminal screenshots or GIFs for the GitHub repo page

## License

MIT
