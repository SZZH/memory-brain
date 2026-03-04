# Memory Brain Skill 技术方案文档

## 1. 技术目标

设计并实现一个本地优先的 Agent 长期记忆系统。该系统对外以 Skill 形态提供能力，对内通过 runtime 承担初始化、存储、检索、治理、召回与观测职责。

技术目标如下：

- 支持交互式初始化
- 默认使用本地存储
- 支持 `global`、`project`、`session` 三种 scope
- 支持 `L0` 到 `L3` 四层记忆
- 支持无 embedding 的基础模式
- 支持自定义 embedding provider 的增强模式
- 提供统一的 remember / recall / summarize / inspect 能力
- 通过 CLI 为 Skill 提供稳定执行层

## 2. 总体架构

系统总体架构如下：

```text
Memory Brain Skill
-> Skill wrapper
-> Runtime
   -> CLI interface
   -> optional MCP bridge
   -> Memory Orchestrator
   -> Governance Engine
   -> Scope Router
   -> Layer Router
   -> Storage Manager
   -> Search Manager
   -> Context Builder
   -> Diagnostics
```

### 2.1 各模块职责

- `Skill wrapper`
  负责宿主集成、触发 recall / remember / summarize 的时机定义

- `CLI interface`
  负责初始化、状态查看、配置、诊断与手动命令入口

- `optional MCP bridge`
  作为可选工具通道，不影响用户对 Skill 的认知

- `Memory Orchestrator`
  编排 remember / recall / summarize 的主流程

- `Governance Engine`
  候选记忆治理，负责去重、冲突处理、置信度、过期策略

- `Scope Router`
  决定记忆落入 `global`、`project` 或 `session`

- `Layer Router`
  决定记忆落入 `L0`、`L1`、`L2`、`L3`

- `Storage Manager`
  负责 SQLite、summary 文件、archive 文件的读写

- `Search Manager`
  负责 FTS 检索与可选 embedding 检索

- `Context Builder`
  将召回结果压缩成适合 prompt 注入的 context blocks

- `Diagnostics`
  负责 status / doctor / inspect / retrieval logs

## 3. 本地目录结构

默认 home 目录：

```text
~/.memory-brain
```

目录结构：

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
          raw/
          sessions/
      sessions/
        <session_id>/
    indexes/
      fts/
      semantic/
  adapters/
  logs/
```

### 3.1 目录职责

- `config/`
  存配置文件

- `data/memory.db`
  主 SQLite 库，结构化记忆真相源

- `data/summaries/`
  可读摘要，用于审计、调试、导出、全文检索补充

- `data/archives/`
  冷记忆和原始记录

- `data/indexes/fts/`
  FTS 相关状态文件

- `data/indexes/semantic/`
  embedding 索引或本地向量索引文件

- `logs/`
  诊断信息、运行日志、索引错误、provider 健康状态

## 4. 配置设计

配置文件路径：

```text
~/.memory-brain/config/config.toml
```

示例：

```toml
[user]
id = "jiaojian"
language = "zh-CN"
response_style = "engineering_concise"

[storage]
home = "/Users/jiaojian/.memory-brain"
local_only = true

[scope]
default_mode = "project_and_global"

[memory]
mode = "balanced"
auto_remember = true
auto_summarize = true
token_budget = 1000

[search]
fts_enabled = true
semantic_enabled = false

[embedding]
provider = "none"
provider_type = "none"
base_url = ""
api_key_env = ""
model = ""
dimension = 0
transport = ""

[adapters]
skill_enabled = true
mcp_enabled = false
```

### 4.1 配置原则

- 所有配置本地化
- provider-neutral
- 初始化后即可运行
- 用户可后续修改，但默认不要求手动编辑

## 5. Scope 模型

### 5.1 Scope 类型

- `global`
- `project`
- `session`

### 5.2 Scope 路由规则

写入时按以下规则路由：

- 明确跨项目偏好 -> `global`
- 当前仓库规则、目标、决策 -> `project`
- 当前阶段临时要求 -> `session`

### 5.3 Scope 合并规则

召回后按以下覆盖顺序合并：

```text
session > project > global
```

实现上，Context Builder 在合并 key/value 类记忆时按该顺序覆盖。

## 6. Layer 模型

### 6.1 L0 工作记忆

特点：

- 不落长期主库或仅短 TTL 挂在 session scope
- 当前 prompt 必须知道
- 常驻或近实时缓存

内容：

- 当前目标
- 当前会话边界
- 最近关键决策

### 6.2 L1 热记忆

特点：

- 高频、稳定、结构化
- 低延迟精确查询
- 主存于 SQLite

内容：

- 语言偏好
- 输出风格
- 项目约束
- 当前任务状态

### 6.3 L2 温记忆

特点：

- 中期复用价值高
- 召回后需压缩
- 以 summary、decision、project background 为主

### 6.4 L3 冷记忆

特点：

- 原始对话、工具日志、归档
- 默认不进入 prompt
- 仅在明确需要时召回

## 7. 数据库设计

数据库路径：

```text
~/.memory-brain/data/memory.db
```

### 7.1 核心表：memories

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

索引建议：

```sql
CREATE INDEX idx_memories_scope ON memories(scope_type, scope_id);
CREATE INDEX idx_memories_layer ON memories(layer);
CREATE INDEX idx_memories_type ON memories(type);
CREATE INDEX idx_memories_key ON memories(memory_key);
CREATE INDEX idx_memories_status ON memories(status);
```

### 7.2 原始事件表：raw_events

```sql
CREATE TABLE raw_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_id TEXT,
  session_id TEXT,
  project_id TEXT,
  source TEXT,
  content TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);
```

### 7.3 项目表：projects

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_path TEXT NOT NULL,
  git_root TEXT,
  name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### 7.4 召回日志表：retrieval_logs

```sql
CREATE TABLE retrieval_logs (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  project_id TEXT,
  query_text TEXT,
  scopes_json TEXT,
  layers_json TEXT,
  result_count INTEGER,
  token_budget INTEGER,
  created_at TEXT NOT NULL
);
```

### 7.5 FTS 表

建议对 summary 类文本建立 FTS5 虚表：

```sql
CREATE VIRTUAL TABLE memory_fts USING fts5(
  memory_id,
  scope_type,
  scope_id,
  layer,
  content
);
```

## 8. 写入流程设计

写入必须遵守：

```text
对话 -> 候选记忆 -> 治理 -> 正式写入
```

### 8.1 候选记忆抽取

输入来源：

- 用户对话
- 工具输出
- 会话结束事件
- 项目扫描结果

抽取方式：

- 规则抽取
- LLM 抽取
- 可选 Mem0 抽取

抽取输出示例：

```json
[
  {
    "type": "preference",
    "key": "language",
    "value": "zh-CN",
    "confidence": 0.98,
    "scope_hint": "global"
  }
]
```

### 8.2 治理规则

Governance Engine 至少需要处理：

- 去重
- 冲突检测
- 置信度阈值
- scope 校正
- layer 决策
- TTL 设置

#### 写入条件

自动写入条件：

- 明确长期偏好
- 明确项目规则
- 明确会话边界
- 项目目标或决策发生变化
- 主题收束摘要

不自动写入条件：

- 闲聊
- 临时情绪
- 低置信推断
- 未确认事实
- 只对当前单轮有效的信息

### 8.3 模式差异

`safe`

- 仅保存高置信显式信息

`balanced`

- 保存高置信显式信息与主题摘要

`aggressive`

- 增加重复信息升格与更多中间摘要

## 9. 召回流程设计

召回流程如下：

```text
Recall Request
-> Build Recall Plan
-> Read session L0
-> Query project L1
-> Query global L1
-> FTS / semantic search on L2
-> Optional deep lookup in L3
-> Rank + Deduplicate
-> Build Context Blocks
-> Return to Skill wrapper
```

### 9.1 Recall Request 输入

建议输入结构：

```json
{
  "user_id": "jiaojian",
  "project_id": "proj_xxx",
  "session_id": "sess_xxx",
  "task": "生成完整需求与技术方案文档",
  "token_budget": 1200,
  "debug": false
}
```

### 9.2 排序与裁剪

排序维度：

- relevance
- freshness
- confidence
- scope priority
- type priority

裁剪维度：

- 总 token 预算
- 各 layer 子预算
- 是否为硬约束记忆

### 9.3 Context Blocks 输出

建议输出结构：

```json
{
  "context_blocks": [
    {
      "type": "stable_preferences",
      "priority": 10,
      "content": "Respond in Chinese. Prefer engineering-oriented concise answers."
    },
    {
      "type": "project_constraints",
      "priority": 9,
      "content": "Default memory home is ~/.memory-brain. Project memory is stored outside the repo."
    }
  ]
}
```

## 10. Search 设计

### 10.1 基础模式

基础模式不依赖 embedding。

组件：

- SQLite FTS5
- summary files
- scope 过滤

优势：

- 初始化简单
- 本地可用
- 零外部依赖

### 10.2 增强模式

增强模式启用 embedding provider。

支持：

- API-based provider
- custom vendor
- self-hosted service
- local embedding model

### 10.3 Embedding Provider 抽象

建议定义统一接口：

```ts
interface EmbeddingProvider {
  name(): string;
  healthCheck(): Promise<boolean>;
  embed(texts: string[]): Promise<number[][]>;
  dimension(): Promise<number>;
}
```

实现类型：

- `OpenAICompatibleProvider`
- `CustomVendorProvider`
- `SelfHostedProvider`
- `LocalModelProvider`

## 11. CLI 设计

### 11.1 命令列表

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

### 11.2 init

职责：

- 交互式向导
- 选择题式配置
- 创建目录与数据库
- 生成配置
- 初始化 FTS

### 11.3 status

输出：

- Memory home
- Config path
- Database path
- Summaries path
- Archives path
- Indexes path
- semantic search state
- memory mode
- scope mode

### 11.4 doctor

检查：

- 路径存在性
- 读写权限
- SQLite 健康状态
- FTS 可用性
- embedding provider 健康状态
- config 解析状态

### 11.5 remember

支持输入：

- 原始文本
- 事件 JSON
- scope hint

职责：

- 抽取候选记忆
- 治理
- 写入

### 11.6 recall

支持输入：

- task
- project/session context
- token budget
- debug

职责：

- 构建 recall plan
- 调用多层召回
- 输出 context blocks

### 11.7 summarize-session

职责：

- 会话压缩
- 写 summary 到 `L2`
- 原始材料归档到 `L3`

## 12. 初始化实现细节

### 12.1 向导状态机

建议用状态机方式实现：

```text
storage
-> language
-> response_style
-> scope_mode
-> memory_mode
-> rule_preset
-> semantic_search_mode
-> review
-> initialize
```

### 12.2 初始化输出

初始化后应完成：

- `config.toml` 写入
- SQLite schema 初始化
- FTS 初始化
- `global/profile.md` 生成
- 默认 summaries 目录创建
- provider 配置持久化

## 13. 项目识别设计

Project Memory 需要稳定 project_id。

建议 project_id 生成逻辑：

1. 优先 git root
2. 其次 workspace path
3. 使用仓库名作为 display name
4. 生成稳定 hash 作为最终 project_id

示例：

```text
project_id = sha1(git_root_or_workspace_path)
```

## 14. Summary 与 Archive 策略

### 14.1 Summary 生成时机

- 主题结束
- 会话结束
- 长对话达到阈值

### 14.2 Summary 写入位置

- SQLite 中一条 summary memory
- 对应的 markdown 文件写入 `summaries/`
- FTS 建索引

### 14.3 Archive 策略

长文本和原始记录写入 `archives/`，默认不直接注入 prompt。

## 15. Skill 集成策略

虽然对用户表现为 Skill，但底层应通过 runtime 统一实现。

Skill wrapper 负责：

- 在复杂任务前触发 `recall`
- 在识别到稳定偏好时触发 `remember`
- 在主题/会话结束时触发 `summarize-session`

要求：

- 不为不同宿主复制业务逻辑
- 所有宿主共享同一个 runtime 与存储

## 16. 观测与调试

### 16.1 retrieval logs

记录：

- 查询文本
- scope 选择
- layer 选择
- 命中数量
- token budget

### 16.2 inspect

支持查看：

- 某次 recall 命中了哪些记忆
- 哪条记忆来自哪个 scope/layer
- 哪些结果被裁掉

### 16.3 doctor

用于快速识别：

- 配置缺失
- provider 不可用
- 数据库异常
- 索引异常

## 17. 安全与数据控制

基本原则：

- 默认本地存储
- 默认不把项目记忆写进仓库
- 默认不上传到云端
- 用户可查看、备份、删除 `~/.memory-brain`

## 18. 实施路线

### Phase 1

- install.sh
- CLI init/status/doctor
- SQLite schema
- summaries / archives 目录
- FTS5
- global/project/session scope
- remember / recall / summarize-session

### Phase 2

- inspect
- retrieval logs
- skill wrapper integration
- provider-neutral embedding adapter skeleton

### Phase 3

- local embedding
- custom vendor adapter
- self-hosted service adapter
- Mem0 integration
- rerank optimization

## 19. 关键取舍

### 19.1 为什么项目记忆不写仓库

- 避免污染用户项目
- 避免进入 git
- 方便跨项目统一管理

### 19.2 为什么保留 session memory

- 当前会话状态需要外部可管理
- 长会话与工具调用不能只依赖模型上下文

### 19.3 为什么 embedding 不是必需

- 安装与初始化成本更低
- 本地模式先可用
- 先用 FTS 解决大部分场景

## 20. 成功标准

技术上达到以下标准视为 MVP 可用：

- 初始化结束后生成完整目录和数据库
- 无 embedding 配置时 recall/remember/summarize 正常工作
- global/project/session 能正确隔离
- session > project > global 合并规则生效
- FTS 可用于 summary 检索
- status/doctor 输出清晰
- 记忆写入遵循候选 -> 治理 -> 正式写入流程
