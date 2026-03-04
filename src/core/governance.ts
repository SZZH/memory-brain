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
    regex: /(以后|默认).*(中文|Chinese)/i,
    type: "preference",
    key: "language",
    scope: "global",
    summary: () => "Respond in Chinese by default.",
    value: () => "zh-CN"
  },
  {
    regex: /(以后|默认).*(英文|English)/i,
    type: "preference",
    key: "language",
    scope: "global",
    summary: () => "Respond in English by default.",
    value: () => "en-US"
  },
  {
    regex: /(简洁|简短|concise)/i,
    type: "preference",
    key: "response_style",
    scope: "global",
    summary: () => "Prefer concise answers.",
    value: () => "concise"
  },
  {
    regex: /(工程化|engineering[- ]?first|engineering concise)/i,
    type: "preference",
    key: "response_style",
    scope: "global",
    summary: () => "Prefer engineering-oriented concise answers.",
    value: () => "engineering_concise"
  },
  {
    regex: /(详细|详细一些|detailed)/i,
    type: "preference",
    key: "response_style",
    scope: "global",
    summary: () => "Prefer detailed answers when needed.",
    value: () => "detailed"
  },
  {
    regex: /(最小改动|minimal changes)/i,
    type: "constraint",
    key: "change_strategy",
    scope: "project",
    summary: () => "Prefer minimal changes in this project.",
    value: () => "minimal_changes"
  },
  {
    regex: /(不引入|不要引入).*(新依赖|dependency)/i,
    type: "constraint",
    key: "dependency_policy",
    scope: "project",
    summary: () => "Avoid introducing new dependencies in this project.",
    value: () => "avoid_new_dependencies"
  },
  {
    regex: /(先|这一轮).*(只给方案|不要写代码)/i,
    type: "session_boundary",
    key: "execution_mode",
    scope: "session",
    summary: () => "For this session, provide a plan without writing code.",
    value: () => "plan_only"
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
  candidates.push(...extractHandoffCandidates(text));

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
  return candidates;
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
  if (!/(换线程|新线程|回头继续|之后继续|一会继续|later continue|continue in another thread|pick this up later)/i.test(text)) {
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
