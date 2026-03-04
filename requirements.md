# Memory Brain Skill 需求文档

## 1. 文档目的

定义一套面向 Agent 的长期记忆 Skill 方案。该方案对用户表现为一个可安装、可初始化、可直接使用的 Skill；内部由本地 runtime 提供存储、检索、治理与召回能力，支持接入 Codex、Claude 等宿主。

## 2. 产品目标

Memory Brain Skill 需要满足以下目标：

- 用户通过一条命令安装
- 用户通过交互式向导一次初始化后即可使用
- 默认本地存储，数据位置清晰可见
- 自动区分 `global`、`project`、`session` 三类记忆
- 默认不依赖 embedding 也可完整工作
- 支持后续接入自定义 embedding provider 增强语义召回
- 对用户呈现为一个 Skill，对内部实现允许使用 CLI、MCP、SQLite、索引等组件
- 控制写入质量，避免将所有对话直接沉淀为长期记忆
- 兼顾响应速度与上下文预算

## 3. 非目标

以下内容不属于第一阶段目标：

- 复杂多用户 SaaS 平台
- 云端账号系统和远程同步
- 将所有聊天记录无差别写入长期记忆
- 绑定某一家 embedding 厂商
- 将项目记忆默认写入仓库目录并纳入 git

## 4. 用户画像

目标用户包括：

- 使用 Codex、Claude 或类似 Agent 的个人开发者
- 希望 Agent 记住个人偏好、项目约束、当前任务状态的用户
- 希望本地可控、可查看、可迁移数据的用户
- 希望安装简单、初始化简单、后续低心智负担的用户

## 5. 产品定位

对用户来说，Memory Brain 是一个 Skill。
对系统来说，Memory Brain 是：

- Skill wrapper
- 本地 runtime
- 本地存储层
- 本地检索层
- 可选的 provider 适配层

即：

```text
Memory Brain Skill
-> Skill wrapper
-> Local runtime
   -> CLI
   -> optional MCP
   -> SQLite
   -> summaries / archives
   -> FTS / optional embedding retrieval
```

## 6. 用户使用流程

### 6.1 安装

用户执行：

```bash
curl -fsSL https://your-domain/install.sh | bash
```

安装完成后输出必须明确说明默认存储目录：

```text
Memory Brain Skill installed.

Default memory home:
  ~/.memory-brain

This location stores:
- config files
- SQLite memory database
- summaries and archives
- search indexes
- logs
```

### 6.2 初始化

用户执行：

```bash
memory-brain init
```

初始化必须采用交互式向导，尽量使用选择题，让用户逐步完成配置。

### 6.3 日常使用

初始化完成后，Skill 在宿主中自动工作。用户通常不需要手动操作，只在需要排查或增强配置时使用：

```bash
memory-brain status
memory-brain doctor
memory-brain inspect
memory-brain enable-embedding
```

## 7. 默认存储位置

默认本地目录为：

```bash
~/.memory-brain
```

该路径必须在以下场景中展示：

- 安装完成后
- 初始化开始时
- 初始化完成后
- `status`
- `doctor`

### 7.1 目录结构

默认目录结构如下：

```text
~/.memory-brain/
  config/
    config.toml
  data/
    memory.db
    summaries/
      global/
        profile.md
        preferences.md
      projects/
        <project_id>/
          overview.md
          decisions.md
          summaries/
            YYYY-MM-DD.md
      sessions/
        <session_id>.md
    archives/
      projects/
        <project_id>/
      sessions/
        <session_id>/
    indexes/
  adapters/
  logs/
```

### 7.2 目录说明

- `config/config.toml`：系统配置
- `data/memory.db`：结构化记忆主库
- `data/summaries/`：可读摘要
- `data/archives/`：归档数据
- `data/indexes/`：检索索引
- `logs/`：诊断和运行日志

## 8. 初始化向导需求

初始化向导必须尽量设计成选择题，默认值可直接回车确认。

### 8.1 向导步骤

建议 8 步：

1. 存储位置
2. 默认语言
3. 默认回答风格
4. 默认记忆作用范围
5. 记忆模式
6. 长期规则模板
7. 语义检索配置
8. 最终确认

### 8.2 各步骤需求

#### Step 1. 存储位置

```text
1. Use default (~/.memory-brain)
2. Choose a custom path
```

#### Step 2. 默认语言

```text
1. Chinese (zh-CN)
2. English (en-US)
3. Follow system locale
```

#### Step 3. 回答风格

```text
1. concise
2. engineering_concise
3. detailed
```

#### Step 4. 默认记忆作用范围

```text
1. Project + global preferences
2. Project only
3. Global preferences across all projects
```

#### Step 5. 记忆模式

```text
1. safe
2. balanced
3. aggressive
```

#### Step 6. 长期规则模板

```text
1. Chinese + engineering-first + minimal changes
2. Chinese + concise answers
3. English + engineering-first
4. No preset rules
5. Select custom presets
```

当用户选 `5` 时，可进入二级多选：

```text
1. Prefer Chinese responses
2. Prefer engineering-first answers
3. Prefer concise answers
4. Prefer detailed answers
5. Prefer minimal changes
6. Avoid introducing new dependencies
```

#### Step 7. 语义检索配置

必须 provider-neutral，不绑定单一厂商。

```text
1. Disable semantic search for now
2. Use an API-based embedding provider
3. Use a local embedding model
```

若用户选 `2`，继续选择：

```text
1. OpenAI-compatible API
2. Custom vendor API
3. Self-hosted service
```

然后再收集最少必要字段：

- base URL
- API key 环境变量名
- model 名称

#### Step 8. 最终确认

```text
1. Confirm and initialize
2. Go back and edit
3. Cancel
```

### 8.3 初始化后自动执行

初始化完成后系统必须自动完成：

- 创建目录结构
- 初始化 SQLite
- 初始化 FTS
- 写入配置文件
- 建立默认 global memory
- 建立 scope policy
- 注册 adapter
- 输出能力状态

## 9. Scope 设计

系统必须支持三类 scope。

### 9.1 Global Memory

跨项目长期有效。
示例：

- 默认中文回答
- 偏好工程化表达
- 偏好最小改动

### 9.2 Project Memory

只对某个项目有效。
示例：

- 当前项目先做 MVP
- 当前仓库不引入新依赖
- 当前项目使用特定技术栈

### 9.3 Session Memory

只对当前会话有效。
示例：

- 当前这轮先给方案
- 当前先不写代码
- 当前聚焦初始化设计

### 9.4 覆盖规则

优先级必须为：

```text
session > project > global
```

## 10. Layer 分层设计

系统必须按速度和上下文成本分层。

### 10.1 L0 工作记忆

直接注入 prompt。
内容包括：

- 当前目标
- 当前边界
- 最近关键决策

### 10.2 L1 热记忆

高频稳定结构化记忆。
优先由 SQLite 精确读取。

### 10.3 L2 温记忆

中期有用的摘要和背景。
按需检索，再压缩注入。

### 10.4 L3 冷记忆

归档和长尾历史。
默认不进入 prompt，仅在必要时深度召回。

## 11. 存储与检索设计

### 11.1 SQLite

SQLite 是主真相源，主要存储：

- 用户偏好
- 项目约束
- 任务状态
- 规则
- 结构化 facts
- 记忆 metadata

### 11.2 Structured Folders

用于可读摘要和归档，主要存储：

- profile
- preferences summary
- project overview
- decisions
- session summaries
- archives

### 11.3 Search

MVP 默认使用：

- SQLite FTS5

增强能力：

- embedding-based semantic retrieval

### 11.4 Embedding Provider

必须支持 provider-neutral 配置：

- API-based provider
- custom vendor
- self-hosted service
- local model

## 12. 项目记忆存储位置

项目记忆默认不写入项目仓库，而是统一存放于 `~/.memory-brain`。

### 12.1 结构化项目记忆

位于：

```text
~/.memory-brain/data/memory.db
```

使用：

- `scope_type = project`
- `scope_id = <project_id>`

隔离不同项目。

### 12.2 项目摘要

位于：

```text
~/.memory-brain/data/summaries/projects/<project_id>/
```

### 12.3 项目归档

位于：

```text
~/.memory-brain/data/archives/projects/<project_id>/
```

## 13. 为什么保留 Session Memory

Session Memory 不是为了替代模型上下文，而是为了管理当前会话状态。

它需要解决：

- 长会话被压缩或截断
- 工具调用后的状态延续
- 临时要求与长期偏好的隔离
- 当前阶段目标管理

因此：

- 模型上下文 = 当前对话可见性
- Session Memory = 当前工作台状态
- 长期记忆 = 跨会话档案

## 14. 记忆写入标准

这是系统质量核心，必须明确。

基本原则：

`不是每句对话都进入记忆，只有明确、稳定、可复用、与当前 scope 匹配的内容才写入。`

### 14.1 自动写入条件

#### 明确声明型

- 用户明确表达长期偏好
- 用户明确表达项目规则
- 用户明确表达会话边界

示例：

- “以后默认用中文回答”
- “这个项目里尽量最小改动”
- “这一轮先只给方案”

#### 任务状态变更型

- 项目目标变化
- 阶段变化
- 明确决策达成

示例：

- “先做 MVP，再补 embedding”
- “先接入 Codex，后接入 Claude”

#### 重复出现型

同一偏好或规则多次被强调，可升格为长期记忆。

#### 主题收束型

在主题结束或会话结束时生成摘要，写入 L2。

### 14.2 不自动写入条件

以下内容默认不进入长期记忆：

- 闲聊
- 临时情绪
- 低置信推断
- 未确认事实
- 只对当前一句回答有用的短时信息

### 14.3 写入流程

必须采用两段式：

```text
对话 -> 候选记忆 -> 治理 -> 正式记忆
```

不得直接将原始对话无差别入库。

## 15. 三种记忆模式

### 15.1 safe

- 只保存非常明确的偏好、规则、边界
- 最低污染风险

### 15.2 balanced

- 默认推荐
- 保存明确偏好、项目规则、任务决策、主题摘要

### 15.3 aggressive

- 更积极沉淀重复出现信息和阶段性上下文
- 允许更高噪音风险

## 16. Recall 策略

召回必须分层分 scope 进行，顺序如下：

1. `session + L0`
2. `project + L1`
3. `global + L1`
4. 信息不足时查 `L2`
5. 必要时查 `L3`

### 16.1 排序维度

- relevance
- freshness
- confidence
- scope priority
- memory type priority

### 16.2 注入形式

必须输出压缩后的 context blocks，而不是原始长文本。

示例：

```text
[Stable Preferences]
- Respond in Chinese
- Prefer engineering-oriented concise answers

[Project Constraints]
- Keep embedding optional
- Prefer minimal changes

[Current Session]
- User wants a complete PRD
- Current focus: guided CLI initialization
```

## 17. 上下文预算

系统必须控制各层 token 预算。

建议默认：

- `L0`: 300-600
- `L1`: 300-800
- `L2`: 400-1200
- `L3`: 默认 0

原则：
越靠近 prompt，信息越短、越稳定、越高置信。

## 18. 配置文件需求

默认配置文件位于：

```text
~/.memory-brain/config/config.toml
```

应包含：

- user 偏好
- scope 默认策略
- memory mode
- storage location
- search configuration
- embedding provider configuration
- adapter state

## 19. CLI 需求

至少提供以下命令：

```bash
memory-brain init
memory-brain status
memory-brain doctor
memory-brain recall
memory-brain remember
memory-brain summarize-session
memory-brain inspect
memory-brain enable-embedding
memory-brain disable-embedding
memory-brain uninstall
```

### 19.1 status

必须显示：

- Memory home
- Config path
- Database path
- Summaries path
- Archives path
- Indexes path
- Semantic search state

### 19.2 doctor

必须检查：

- 目录是否存在
- 数据库是否可读写
- FTS 是否正常
- embedding provider 是否可用
- 配置是否合法

## 20. 宿主接入方式

对用户统一表现为一个 Skill。
内部可根据宿主能力调用：

- CLI
- MCP
- 本地脚本
- runtime API

要求：

- 核心记忆逻辑必须统一
- 不允许为不同宿主维护两套记忆语义
- Skill 只作为用户入口和调用约定层

## 21. 核心数据模型

至少需要以下表：

- `memories`
- `raw_events`
- `projects`
- `retrieval_logs`

核心表建议：

```sql
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_id TEXT,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  layer TEXT NOT NULL,
  type TEXT NOT NULL,
  subject TEXT,
  memory_key TEXT,
  value_json TEXT,
  summary TEXT,
  confidence REAL DEFAULT 0.5,
  status TEXT DEFAULT 'active',
  source_event_id TEXT,
  ttl_seconds INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_accessed_at TEXT
);
```

## 22. 成功标准

MVP 上线时，需满足以下验收标准：

- 用户能通过一条命令安装
- 用户能通过向导完成初始化
- 默认目录 `~/.memory-brain` 被明确告知
- 无 embedding 时系统仍可正常 remember/recall/summarize
- 项目记忆不会写入项目仓库
- 系统能区分 global/project/session
- 系统不会把所有聊天都自动写入长期记忆
- 用户可通过 `status` 和 `doctor` 看到当前状态
- Skill 对用户可直接使用，对内部允许调用 runtime

## 23. MVP 范围

第一阶段只要求实现：

- 安装脚本
- 交互式初始化向导
- SQLite 存储
- summaries / archives 目录
- FTS 检索
- global/project/session scope
- remember / recall / summarize / status / doctor
- provider-neutral embedding 配置骨架

第二阶段再做：

- inspect
- retrieval logs
- host-specific wrappers
- provider adapters 扩展

第三阶段再做：

- 本地 embedding
- 自定义 vendor 深度集成
- Mem0 集成
- rerank 优化

## 24. 产品总结

Memory Brain Skill 是一个本地优先的 Agent 记忆系统。用户通过一条命令安装，并通过一个以选择题为主的交互式向导完成初始化。系统默认将所有数据存放在 `~/.memory-brain`，自动区分 `global`、`project`、`session` 三类记忆，并依据明确的写入标准决定哪些对话可以沉淀为长期记忆。系统内部使用 SQLite 作为结构化真相源，使用 summaries/archives 作为可读归档，使用 FTS 和可选 embedding provider 实现检索增强，对用户则始终表现为一个可直接使用的 Skill。
