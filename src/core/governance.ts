import type {
  CandidateMemory,
  MemoryLayer,
  MemoryMode,
  ScopeType
} from "../types.js";

const EXPLICIT_PATTERNS: Array<{
  regex: RegExp;
  type: string;
  key: string;
  scope: ScopeType;
  summary: (match: RegExpMatchArray) => string;
  value: (match: RegExpMatchArray) => unknown;
}> = [
  {
    regex:
      /(?:以后|默认|长期|下次继续|remember|default|always).*(中文|Chinese)|(?:default|prefer|always).*(Chinese|zh[-_ ]?CN)/i,
    type: "preference",
    key: "language",
    scope: "global",
    summary: () => "Respond in Chinese by default.",
    value: () => "zh-CN"
  },
  {
    regex:
      /(?:以后|默认|长期|下次继续|remember|default|always).*(英文|English)|(?:default|prefer|always).*(English|en[-_ ]?US)/i,
    type: "preference",
    key: "language",
    scope: "global",
    summary: () => "Respond in English by default.",
    value: () => "en-US"
  },
  {
    regex: /(?:以后|默认|长期|下次继续|remember|default|always).*(简洁|简短|concise|short)/i,
    type: "preference",
    key: "response_style",
    scope: "global",
    summary: () => "Prefer concise answers.",
    value: () => "concise"
  },
  {
    regex:
      /(?:以后|默认|长期|下次继续|remember|default|always).*(工程化|engineering[- ]?first|engineering concise|工程优先)/i,
    type: "preference",
    key: "response_style",
    scope: "global",
    summary: () => "Prefer engineering-oriented concise answers.",
    value: () => "engineering_concise"
  },
  {
    regex: /(?:以后|默认|长期|下次继续|remember|default|always).*(详细|详细一些|detailed)/i,
    type: "preference",
    key: "response_style",
    scope: "global",
    summary: () => "Prefer detailed answers when needed.",
    value: () => "detailed"
  },
  {
    regex:
      /(?:以后|默认|长期|下次继续|remember|default|always).*(最小改动|minimal changes?|minimal change)/i,
    type: "constraint",
    key: "change_strategy",
    scope: "project",
    summary: () => "Prefer minimal changes in this project.",
    value: () => "minimal_changes"
  },
  {
    regex:
      /(不引入|不要引入).*(新依赖|dependency)|(?:do not|don't|avoid|always avoid).*(add|introduc[e]?|us[e]?).*(new )?dependencies?/i,
    type: "constraint",
    key: "dependency_policy",
    scope: "project",
    summary: () => "Avoid introducing new dependencies in this project.",
    value: () => "avoid_new_dependencies"
  },
  {
    regex:
      /(先|这一轮).*(只给方案|不要写代码)|(?:this round|for now).*(only|just).*(plan).*(?:no code|in this round|for this round)?|(?:only|just).*(provide|give).*(plan).*(?:no code|in this round|for this round)?|(?:默认|always|default).*(?:只给方案|plan only|just plan)/i,
    type: "session_boundary",
    key: "execution_mode",
    scope: "session",
    summary: () => "For this session, provide a plan without writing code.",
    value: () => "plan_only"
  },
  {
    regex:
      /(?:(?:以后|默认).*(?:发给我|发我|发送给我|发给自己|发到|传给我|传给自己).*(?:文件传输助手))|(?:(?:文件传输助手).*(?:默认|以后).*(?:发给我|发我|发送给我|发给自己|发到|传给我|传给自己))/i,
    type: "preference",
    key: "delivery_target",
    scope: "global",
    summary: () =>
      "When the user asks to send files or screenshots from the computer, default to WeChat File Transfer Assistant.",
    value: () => "wechat_file_transfer_assistant"
  }
];

export function extractCandidates(
  content: string,
  mode: MemoryMode
): CandidateMemory[] {
  const text = content.trim();
  if (!text) {
    return [];
  }
  const candidates: CandidateMemory[] = [];
  for (const pattern of EXPLICIT_PATTERNS) {
    const match = text.match(pattern.regex);
    if (!match) continue;
    candidates.push({
      type: pattern.type,
      key: pattern.key,
      summary: pattern.summary(match),
      value: pattern.value(match),
      confidence: 0.95,
      scope_hint: pattern.scope,
      layer_hint: "L1"
    });
  }
  candidates.push(...extractIdentityCandidates(text));
  candidates.push(...extractProjectCandidates(text));
  candidates.push(...extractDecisionCandidates(text));
  candidates.push(...extractStablePreferenceCandidates(text));
  candidates.push(...extractHandoffCandidates(text));
  candidates.push(...extractDurableReflectionCandidates(text));
  candidates.push(...extractExplicitRememberCandidates(text, candidates));

  if (mode !== "safe" && shouldAddSessionSummary(text, candidates)) {
    candidates.push({
      type: "summary",
      key: `summary:${stableSummaryKey(text)}`,
      summary: compressText(text, 180),
      confidence: mode === "aggressive" ? 0.75 : 0.62,
      scope_hint: "session",
      layer_hint: "L2"
    });
  }
  return dedupeCandidates(candidates);
}

export function routeLayer(candidate: CandidateMemory): MemoryLayer {
  if (candidate.layer_hint) {
    return candidate.layer_hint;
  }
  if (candidate.scope_hint === "session") {
    return "L0";
  }
  return "L1";
}

export function candidateThreshold(mode: MemoryMode): number {
  if (mode === "safe") return 0.9;
  if (mode === "balanced") return 0.6;
  return 0.45;
}

export function shouldPersistCandidate(
  candidate: CandidateMemory,
  mode: MemoryMode
): boolean {
  return candidate.confidence >= candidateThreshold(mode);
}

export function compressText(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function extractIdentityCandidates(text: string): CandidateMemory[] {
  const candidates: CandidateMemory[] = [];
  const nameMatch =
    text.match(/(?:我的名字叫|我叫|名字是)\s*([A-Za-z\u4e00-\u9fa5·•]{2,20})/) ||
    text.match(/my name is\s+([A-Za-z][A-Za-z -]{1,40})/i);
  if (nameMatch) {
    const name = nameMatch[1].trim();
    candidates.push({
      type: "identity",
      key: "user_name",
      subject: name,
      summary: `The user's name is ${name}.`,
      value: name,
      confidence: 0.98,
      scope_hint: "global",
      layer_hint: "L1"
    });
  }
  const callMeMatch =
    text.match(/(?:以后)?(?:默认)?(?:称呼我|叫我)\s*([A-Za-z\u4e00-\u9fa5·•]{2,20})/) ||
    text.match(/call me\s+([A-Za-z][A-Za-z -]{1,40})/i);
  if (callMeMatch) {
    const preferredName = callMeMatch[1].trim();
    candidates.push({
      type: "identity",
      key: "preferred_name",
      subject: preferredName,
      summary: `Address the user as ${preferredName}.`,
      value: preferredName,
      confidence: 0.97,
      scope_hint: "global",
      layer_hint: "L1"
    });
  }
  const roleMatch =
    text.match(
      /(?:我是一名|我是)([A-Za-z\u4e00-\u9fa5·•]{2,20})(?:工程师|开发者|产品经理|设计师)/
    ) || text.match(/i am an?\s+([a-z -]{2,30}(?:engineer|developer|designer|manager))/i);
  if (roleMatch) {
    const role = roleMatch[1].trim();
    candidates.push({
      type: "identity",
      key: "user_role",
      subject: role,
      summary: `The user role is ${role}.`,
      value: role,
      confidence: 0.9,
      scope_hint: "global",
      layer_hint: "L1"
    });
  }
  return candidates;
}

function extractDurableReflectionCandidates(text: string): CandidateMemory[] {
  const reflectionMatch =
    text.match(/这次.*让我意识到(.{4,120})/i) ||
    text.match(/我学到(.{4,120})/i) ||
    text.match(/i learned from .* that (.{4,120})/i) ||
    text.match(/this taught me that (.{4,120})/i);
  if (!reflectionMatch) {
    return [];
  }
  const insight = reflectionMatch[1].trim().replace(/[。.!]+$/, "");
  if (!insight) {
    return [];
  }
  return [
    {
      type: "decision",
      key: `durable_insight:${normalizeKey(insight).slice(0, 30) || "insight"}`,
      summary: `Durable insight: ${insight}.`,
      value: {
        kind: "insight",
        text: insight
      },
      confidence: 0.9,
      scope_hint: "global",
      layer_hint: "L1"
    }
  ];
}

function extractProjectCandidates(text: string): CandidateMemory[] {
  const candidates: CandidateMemory[] = [];
  const cnNameMatch = text.match(/项目(?:的中文名称|名字|名)叫\s*([A-Za-z\u4e00-\u9fa5·•]{2,30})/);
  if (cnNameMatch) {
    const projectName = cnNameMatch[1].trim();
    candidates.push({
      type: "project_identity",
      key: "project_name_zh",
      subject: projectName,
      summary: `The Chinese project name is ${projectName}.`,
      value: projectName,
      confidence: 0.96,
      scope_hint: "project",
      layer_hint: "L1"
    });
  }
  if (/(仓库|项目).*(MVP|最小可用|minimum viable)/i.test(text)) {
    candidates.push({
      type: "project_goal",
      key: "delivery_mode",
      summary: "Prioritize an MVP for this project.",
      value: "mvp_first",
      confidence: 0.88,
      scope_hint: "project",
      layer_hint: "L1"
    });
  }
  const prerequisiteMatch =
    text.match(/(?:项目|this project).*(?:需要|requires)\s*([A-Za-z\u4e00-\u9fa5 -]{2,60})\s*(?:才能|before)\s*([A-Za-z\u4e00-\u9fa5 -]{2,60})/i) ||
    text.match(/requires\s+([A-Za-z -]{2,60})\s+before\s+([A-Za-z -]{2,60})/i);
  if (prerequisiteMatch) {
    const prerequisite = prerequisiteMatch[1].trim();
    const gatedAction = prerequisiteMatch[2].trim();
    candidates.push({
      type: "constraint",
      key: `prerequisite:${normalizeKey(prerequisite)}:${normalizeKey(gatedAction)}`,
      summary: `Project rule: require ${prerequisite} before ${gatedAction}.`,
      value: {
        require: prerequisite,
        before: gatedAction
      },
      confidence: 0.9,
      scope_hint: "project",
      layer_hint: "L1"
    });
  }
  const branchDeleteApprovalMatch =
    text.match(
      /(?:合并到|merge(?:d)?\s+(?:into|to)).*main.*(?:明确允许|先同意|explicit(?:ly)?\s+(?:allow|approve)|approve).*?(?:删除|删掉|删除该分支|delete)/i
    ) ||
    text.match(
      /(?:删除|删掉|delete).*(?:分支|branch).*(?:前|before).*(?:必须|需要|only|需先).*(?:明确允许|先同意|explicit(?:ly)?\s+(?:allow|approve)|approve)/i
    ) ||
    text.match(
      /(?:删除|删掉|delete).*(?:分支|branch).*(?:只有|only).*(?:明确允许|先同意|explicit(?:ly)?\s+(?:allow|approve)|approve)/i
    );
  if (branchDeleteApprovalMatch) {
    candidates.push({
      type: "constraint",
      key: "branch_delete_requires_user_approval_after_main_merge",
      summary:
        "Project rule: after a bugfix or feature branch is merged into main, delete the branch only with explicit user approval.",
      value: {
        action: "delete_branch",
        after: "merged_into_main",
        requirement: "explicit_user_approval"
      },
      confidence: 0.94,
      scope_hint: "project",
      layer_hint: "L1"
    });
  }
  return candidates;
}

function extractDecisionCandidates(text: string): CandidateMemory[] {
  const candidates: CandidateMemory[] = [];
  const chineseStagedDecision = text.match(
    /先做\s*([A-Za-z\u4e00-\u9fa50-9_-]{2,40}).*(?:后面|之后|再)\s*(?:做|补|接入)\s*([A-Za-z\u4e00-\u9fa50-9_-]{2,40})/i
  );
  const englishStagedDecision = text.match(
    /first\s+(?:do|build|implement)\s+([A-Za-z0-9 _-]{2,40}).*(?:then|later)\s+(?:do|add|implement)\s+([A-Za-z0-9 _-]{2,40})/i
  );
  const stagedDecision = chineseStagedDecision ?? englishStagedDecision;
  if (stagedDecision) {
    const currentStage = stagedDecision[1].trim();
    const nextStage = stagedDecision[2].trim();
    candidates.push({
      type: "decision",
      key: `phase_plan:${normalizeKey(currentStage)}:${normalizeKey(nextStage)}`,
      summary: `Current staged plan: first ${currentStage}, then ${nextStage}.`,
      value: { first: currentStage, next: nextStage },
      confidence: 0.9,
      scope_hint: "project",
      layer_hint: "L1"
    });
  }
  return candidates;
}

function extractHandoffCandidates(text: string): CandidateMemory[] {
  if (
    !/(换线程|新线程|回头继续|之后继续|一会继续|下次继续|以后继续|later continue|continue in another thread|pick this up later|resume next time|next time continue)/i.test(
      text
    )
  ) {
    return [];
  }
  return [
    {
      type: "handoff",
      key: "thread_handoff",
      summary: "This work is likely to continue in another thread, so preserve the current context.",
      value: "continue_in_another_thread",
      confidence: 0.9,
      scope_hint: "session",
      layer_hint: "L1",
      ttl_seconds: 7 * 24 * 3600
    }
  ];
}

function extractStablePreferenceCandidates(text: string): CandidateMemory[] {
  const cueMatch = text.match(
    /(?:以后|默认|长期|下次继续|remember|default|always|prefer|preferably).*/i
  );
  if (!cueMatch) {
    return [];
  }
  const candidates: CandidateMemory[] = [];
  if (/(中文|chinese|zh[-_ ]?cn)/i.test(text)) {
    candidates.push({
      type: "preference",
      key: "language",
      summary: "Respond in Chinese by default.",
      value: "zh-CN",
      confidence: 0.9,
      scope_hint: "global",
      layer_hint: "L1"
    });
  }
  if (/(英文|english|en[-_ ]?us)/i.test(text)) {
    candidates.push({
      type: "preference",
      key: "language",
      summary: "Respond in English by default.",
      value: "en-US",
      confidence: 0.9,
      scope_hint: "global",
      layer_hint: "L1"
    });
  }
  if (/(简洁|简短|concise|short)/i.test(text)) {
    candidates.push({
      type: "preference",
      key: "response_style",
      summary: "Prefer concise answers.",
      value: "concise",
      confidence: 0.84,
      scope_hint: "global",
      layer_hint: "L1"
    });
  }
  if (/(工程化|engineering[- ]?first|engineering concise|工程优先)/i.test(text)) {
    candidates.push({
      type: "preference",
      key: "response_style",
      summary: "Prefer engineering-oriented concise answers.",
      value: "engineering_concise",
      confidence: 0.86,
      scope_hint: "global",
      layer_hint: "L1"
    });
  }
  if (/(详细|详细一些|detailed)/i.test(text)) {
    candidates.push({
      type: "preference",
      key: "response_style",
      summary: "Prefer detailed answers when needed.",
      value: "detailed",
      confidence: 0.84,
      scope_hint: "global",
      layer_hint: "L1"
    });
  }
  if (/(最小改动|minimal changes?|minimal change)/i.test(text)) {
    candidates.push({
      type: "constraint",
      key: "change_strategy",
      summary: "Prefer minimal changes in this project.",
      value: "minimal_changes",
      confidence: 0.88,
      scope_hint: "project",
      layer_hint: "L1"
    });
  }
  if (/(不引入|不要引入|avoid).*(新依赖|dependency|dependencies)/i.test(text)) {
    candidates.push({
      type: "constraint",
      key: "dependency_policy",
      summary: "Avoid introducing new dependencies in this project.",
      value: "avoid_new_dependencies",
      confidence: 0.87,
      scope_hint: "project",
      layer_hint: "L1"
    });
  }
  return candidates;
}

function extractExplicitRememberCandidates(
  text: string,
  existingCandidates: CandidateMemory[]
): CandidateMemory[] {
  if (
    !/(记住这个|记下来|记一下|保存上下文|保存这个|记到持久化记忆|remember this|save this context)/i.test(
      text
    )
  ) {
    return [];
  }

  const hasPersistentCandidate = existingCandidates.some(
    (candidate) => candidate.scope_hint !== "session"
  );
  if (hasPersistentCandidate) {
    return [];
  }

  const scope_hint = inferExplicitRememberScope(text);
  return [
    {
      type: "summary",
      key: `explicit_remember:${stableSummaryKey(text)}`,
      summary: compressText(text, 180),
      confidence: 0.92,
      scope_hint,
      layer_hint: "L2"
    }
  ];
}

function inferExplicitRememberScope(text: string): ScopeType {
  if (/(全局|长期|以后|默认|习惯|偏好|default|always)/i.test(text)) {
    return "global";
  }
  if (/(项目|仓库|repo|repository|代码库)/i.test(text)) {
    return "project";
  }
  return "session";
}

function shouldAddSessionSummary(
  text: string,
  existingCandidates: CandidateMemory[]
): boolean {
  if (text.length <= 40) {
    return false;
  }
  if (existingCandidates.some((candidate) => candidate.type === "handoff")) {
    return true;
  }
  return /(总结|summary|上下文|context|继续|handoff|后续)/i.test(text);
}

function normalizeKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w\u4e00-\u9fa5-]/g, "")
    .slice(0, 40);
}

function stableSummaryKey(text: string): string {
  return normalizeKey(text).slice(0, 32) || "session_note";
}

function dedupeCandidates(candidates: CandidateMemory[]): CandidateMemory[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.scope_hint}:${candidate.key ?? candidate.summary}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
