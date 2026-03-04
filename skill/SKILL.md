---
name: memory-brain
description: Local-first long-term memory skill for Codex-style hosts. Use when the user says or implies things like remember this, save this context, continue in another thread, continue the same project, recall what we did before, my name is, default to Chinese, this project should follow a stable rule, or shares a durable experience, reflection, lesson, or belief that should influence future answers. Use it to remember stable user information, project constraints, session handoff context, durable decisions, personal experiences, reflections, and to recall prompt-ready context before continuing work.
---

# Memory Brain

Use this skill when the user wants persistent memory that is local, inspectable, and separated into `global`, `project`, and `session` scopes.

## Use It For

- Natural-language requests like “记住这个”, “保存上下文”, “我一会换线程继续”, “继续刚才那个项目”, “我的名字叫…”, “以后默认中文回答”, “这件事让我意识到…”, “我的经历是…”
- Remembering stable user preferences such as language and answer style
- Remembering project rules such as minimal-change constraints
- Persisting session-only instructions that should not become global defaults
- Recalling context before a complex or multi-step task
- Summarizing a completed session into reusable project memory
- Diagnosing memory state with `status`, `doctor`, and `inspect`

## Runtime Contract

The runtime stores everything under `~/.memory-brain` by default.

Core commands:

```bash
memory-brain recall --task "<task>" --workspace "<cwd>" --session "<session_id>"
memory-brain remember --text "<text>" --workspace "<cwd>" --session "<session_id>"
memory-brain summarize-session --session "<session_id>" --workspace "<cwd>"
memory-brain inspect
memory-brain status
memory-brain doctor
```

Hosts should invoke the `memory-brain` command directly. Do not wrap it as `memory-brain node ...` or prefix it twice.

## Natural Language Triggers

This skill should trigger for both Chinese and English requests such as:

- 记住这个
- 保存一下当前上下文
- 我一会换线程继续
- 继续刚才那个项目
- 我们刚才做到哪了
- 我的名字叫…
- 以后默认中文回答
- 这个项目不要引入新依赖
- 这件事让我意识到…
- 我的经历是…
- 我长期认为…
- remember this
- save this context
- continue this later
- continue the same project
- what did we do before
- my name is ...
- default to Chinese
- this taught me ...
- my experience is ...
- I believe ...

## Host Workflow

1. Before substantial work, call `recall` with the current task, workspace, and session id.
2. Inject returned `context_blocks` into the host prompt in compressed form.
3. During the session, call `remember` for stable, reusable facts, constraints, experiences, reflections, or beliefs even if the user did not explicitly say “save this”, as long as the intent is clear.
4. Do not write casual chat, temporary emotions, or low-confidence guesses into long-term memory.
5. At topic or session end, call `summarize-session`.

## Memory Rules

- Scope priority: `session > project > global`
- Layer preference for recall: `L0`, then `L1`, then `L2`, and `L3` only when needed
- Prefer `project` scope for repo-specific rules
- Prefer `global` scope for cross-project user preferences
- Prefer `session` scope for temporary boundaries like “this round only give a plan”

## When To Skip Writes

Do not persist:

- Small talk
- One-off phrasing
- Unconfirmed facts
- Tool noise
- Information useful for only a single immediate answer

## Initialization

If the runtime is not initialized yet:

```bash
memory-brain init
```

If the skill bundle is not installed in Codex:

```bash
memory-brain install-skill --host codex
```

If the user is on Claude instead:

```bash
memory-brain install-skill --host claude
```
