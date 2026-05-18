# 多 Agent 系统完整重写 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将医药咨询系统从固定工作流升级为多 Agent 协作架构，接入 agents 目录所有 Agent 类，修复全部 Critical/Important 问题，通过 SSE 向前端实时推送执行轨迹。

**Architecture:** 后端新建 `multiAgentService.ts`，用 LangGraph StateGraph 将 5 个重写后的 Agent 类串联为动态图（Coordinator 分析后并行触发 Research + Diagnostic，最后 Advisor 汇总）；路由 `/api/chat/workflow` 改为 SSE 端点；前端通过 `fetch` + ReadableStream 接收事件流，实时渲染执行轨迹面板和最终结果卡片。

**Tech Stack:** TypeScript 5、Express 4、@langchain/langgraph ^1.0.1、@langchain/google-genai、pino（结构化日志）、zod（运行时校验）、Vitest（测试）、React 19、Tailwind CSS

---

## 文件变更清单

```
backend/src/
  agents/types.ts              重写 —— 清理接口，移除 model 暴露、completedAgents
  agents/BaseAgent.ts          重写 —— 单例模型、健壮 invokeJSON、pino 日志
  agents/CoordinatorAgent.ts   重写 —— 修复降级逻辑
  agents/DiagnosticAgent.ts    重写 —— 合并 LLM 调用，修复 urgency
  agents/ResearchAgent.ts      重写 —— 移除虚假 URL，改为 AI 摘要标注
  agents/PharmacistAgent.ts    重写 —— 类型化 invokeJSON
  agents/AdvisorAgent.ts       重写 —— Zod 运行时校验
  services/multiAgentService.ts  新增 —— LangGraph 图 + SSE 流
  services/workflowService.ts    删除
  routes/chatRoutes.ts           修改 —— /chat/workflow 换为 SSE 端点
  vitest.config.ts               新增 —— 测试配置
  __tests__/BaseAgent.test.ts    新增
  __tests__/CoordinatorAgent.test.ts  新增
  __tests__/DiagnosticAgent.test.ts   新增
  __tests__/routing.test.ts      新增

frontend/src/
  types/chat.ts                  修改 —— 新增轨迹类型
  services/chatService.ts        修改 —— 新增 SSE 流方法
  App.tsx                        重写 —— 执行轨迹面板 + 最终结果卡片
```

---

## Task 1: 安装依赖，配置测试环境

**Files:**
- Modify: `backend/package.json`
- Create: `backend/vitest.config.ts`

- [ ] **Step 1: 安装后端新依赖**

```bash
cd /Users/didi/Desktop/langgraph-project/backend
npm install pino zod
npm install -D vitest @vitest/coverage-v8
```

预期输出：`added N packages`（无报错）

- [ ] **Step 2: 创建 vitest 配置**

创建 `backend/vitest.config.ts`：

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
});
```

- [ ] **Step 3: 更新 package.json 的 test 脚本**

将 `backend/package.json` 中的 `scripts.test` 改为：

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: 验证测试环境可用**

```bash
cd /Users/didi/Desktop/langgraph-project/backend
npx vitest run --reporter=verbose 2>&1 | head -5
```

预期输出：`No test files found` 或类似提示（不是报错退出）

- [ ] **Step 5: 提交**

```bash
cd /Users/didi/Desktop/langgraph-project
git add backend/package.json backend/vitest.config.ts
git commit -m "chore(backend): 安装 pino、zod、vitest"
```

---

## Task 2: 重写 types.ts

**Files:**
- Modify: `backend/src/agents/types.ts`

> 无需单元测试——TypeScript 接口是编译期类型，编译通过即验证。

- [ ] **Step 1: 完整替换 types.ts**

用以下内容完整覆盖 `backend/src/agents/types.ts`：

```typescript
// ===== 共享状态 =====

export interface CoordinatorDecision {
  needsResearch: boolean;
  needsDiagnostic: boolean;
  needsPharmacist: boolean;
  complexity: 'simple' | 'medium' | 'complex';
  plan: string[];
  reasoning: string;
}

export interface ResearchFinding {
  title: string;
  summary: string;
  relevance: number;
  label: '[AI知识摘要]';
}

export interface ResearchResult {
  query: string;
  findings: ResearchFinding[];
  keyFindings: string[];
  timestamp: string;
}

export interface DiagnosticCondition {
  name: string;
  probability: number;
  severity: 'mild' | 'moderate' | 'severe';
  description: string;
}

export interface DiagnosticResult {
  symptoms: string[];
  possibleConditions: DiagnosticCondition[];
  riskFactors: string[];
  urgency: 'low' | 'medium' | 'high';
  recommendation: string;
}

export interface Medicine {
  name: string;
  genericName?: string;
  type: string;
  indication: string;
  usage: string;
  contraindication?: string;
  sideEffects?: string[];
  interactions?: string[];
  price?: { min: number; max: number; currency: string };
}

export interface PharmacistResult {
  medicines: Medicine[];
  warnings: string[];
}

export interface RecommendedMedicine {
  name: string;
  reason: string;
  usage: string;
  precautions: string[];
}

export interface AdvisorResult {
  summary: string;
  diagnosis?: string;
  recommendedMedicines: RecommendedMedicine[];
  precautions: string[];
  references: string[];
  urgency: string;
  disclaimer: string;
}

export interface AgentState {
  userMessage: string;
  coordinatorDecision?: CoordinatorDecision;
  researchResults?: ResearchResult;
  diagnosticResults?: DiagnosticResult;
  pharmacistResults?: PharmacistResult;
  advisorResults?: AdvisorResult;
  errors: string[];
}

// ===== Agent 接口（不暴露底层模型类型）=====

export interface IAgent {
  name: string;
  description: string;
  execute(state: AgentState): Promise<Partial<AgentState>>;
}

// ===== Coordinator 内部分析结果 =====

export interface CoordinatorAnalysis {
  needsResearch: boolean;
  needsDiagnostic: boolean;
  needsPharmacist: boolean;
  complexity: 'simple' | 'medium' | 'complex';
  reasoning: string;
}

// ===== SSE 事件类型 =====

export type SseEvent =
  | { type: 'agent_start'; agent: string }
  | { type: 'agent_complete'; agent: string; summary: string }
  | { type: 'final_result'; data: AdvisorResult }
  | { type: 'error'; message: string }
  | { type: 'done' };
```

- [ ] **Step 2: 验证编译通过**

```bash
cd /Users/didi/Desktop/langgraph-project/backend
npx tsc --noEmit 2>&1 | head -20
```

预期：只有其他文件的类型错误（旧 Agent 引用了已删除的字段），types.ts 本身无报错。

- [ ] **Step 3: 提交**

```bash
cd /Users/didi/Desktop/langgraph-project
git add backend/src/agents/types.ts
git commit -m "refactor(agents): 重写 types.ts，移除 model 暴露和 completedAgents"
```

---

## Task 3: 重写 BaseAgent.ts + 测试

**Files:**
- Modify: `backend/src/agents/BaseAgent.ts`
- Create: `backend/src/__tests__/BaseAgent.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `backend/src/__tests__/BaseAgent.test.ts`：

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { sharedModel, BaseAgent } from '../agents/BaseAgent';
import { AgentState } from '../agents/types';

// 用于暴露 protected 方法的测试子类
class TestAgent extends BaseAgent {
  constructor() { super('Test', '测试'); }
  async execute(_state: AgentState) { return {}; }
  async callInvokeJSON<T>(prompt: string) {
    return this.invokeJSON<T>(prompt);
  }
}

afterEach(() => vi.restoreAllMocks());

describe('BaseAgent.invokeJSON', () => {
  it('从纯 JSON 字符串提取对象', async () => {
    vi.spyOn(sharedModel, 'invoke').mockResolvedValueOnce({
      content: '{"key":"value"}',
    } as any);
    const result = await new TestAgent().callInvokeJSON<{ key: string }>('p');
    expect(result).toEqual({ key: 'value' });
  });

  it('从 markdown 代码块中提取 JSON', async () => {
    vi.spyOn(sharedModel, 'invoke').mockResolvedValueOnce({
      content: '```json\n{"key":"value"}\n```',
    } as any);
    const result = await new TestAgent().callInvokeJSON<{ key: string }>('p');
    expect(result).toEqual({ key: 'value' });
  });

  it('忽略前置说明文字，提取 JSON', async () => {
    vi.spyOn(sharedModel, 'invoke').mockResolvedValueOnce({
      content: '这是结果：\n{"key":"value"}',
    } as any);
    const result = await new TestAgent().callInvokeJSON<{ key: string }>('p');
    expect(result).toEqual({ key: 'value' });
  });

  it('提取 JSON 数组', async () => {
    vi.spyOn(sharedModel, 'invoke').mockResolvedValueOnce({
      content: '["a","b","c"]',
    } as any);
    const result = await new TestAgent().callInvokeJSON<string[]>('p');
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('无法提取 JSON 时抛出错误', async () => {
    vi.spyOn(sharedModel, 'invoke').mockResolvedValueOnce({
      content: '纯文字，没有 JSON',
    } as any);
    await expect(new TestAgent().callInvokeJSON('p')).rejects.toThrow('JSON 提取失败');
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/didi/Desktop/langgraph-project/backend
npx vitest run src/__tests__/BaseAgent.test.ts --reporter=verbose
```

预期：FAIL，`sharedModel` 未找到（BaseAgent 还没重写）

- [ ] **Step 3: 完整替换 BaseAgent.ts**

用以下内容完整覆盖 `backend/src/agents/BaseAgent.ts`：

```typescript
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { IAgent, AgentState } from './types';
import pino from 'pino';
import dotenv from 'dotenv';

dotenv.config();

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

if (!process.env.GOOGLE_API_KEY) {
  throw new Error('GOOGLE_API_KEY 未配置在环境变量中');
}

// 模块级单例：所有 Agent 共享同一个模型实例，避免并发时重复创建
export const sharedModel = new ChatGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
  model: 'gemini-2.0-flash-exp',
  temperature: 0.7,
});

export abstract class BaseAgent implements IAgent {
  public name: string;
  public description: string;
  protected model = sharedModel;

  constructor(name: string, description: string) {
    this.name = name;
    this.description = description;
  }

  abstract execute(state: AgentState): Promise<Partial<AgentState>>;

  // 用正则提取第一个完整 JSON 对象或数组，忽略前后文字
  protected async invokeJSON<T>(prompt: string): Promise<T> {
    const raw = await this.model.invoke(prompt);
    const text = raw.content.toString();
    const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (!match) throw new Error(`JSON 提取失败: ${text.slice(0, 100)}`);
    return JSON.parse(match[0]) as T;
  }

  protected async invokeText(prompt: string): Promise<string> {
    const raw = await this.model.invoke(prompt);
    return raw.content.toString().trim();
  }

  protected log(msg: string): void {
    logger.info({ agent: this.name }, msg);
  }

  protected logError(msg: string, err?: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ agent: this.name }, `${msg}: ${message}`);
  }
}
```

- [ ] **Step 4: 运行测试，确认全部通过**

```bash
cd /Users/didi/Desktop/langgraph-project/backend
npx vitest run src/__tests__/BaseAgent.test.ts --reporter=verbose
```

预期：5 个测试全部 PASS

- [ ] **Step 5: 提交**

```bash
cd /Users/didi/Desktop/langgraph-project
git add backend/src/agents/BaseAgent.ts backend/src/__tests__/BaseAgent.test.ts
git commit -m "refactor(agents): 重写 BaseAgent，单例模型、健壮 invokeJSON、pino 日志"
```

---

## Task 4: 重写 CoordinatorAgent.ts + 测试

**Files:**
- Modify: `backend/src/agents/CoordinatorAgent.ts`
- Create: `backend/src/__tests__/CoordinatorAgent.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `backend/src/__tests__/CoordinatorAgent.test.ts`：

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { sharedModel } from '../agents/BaseAgent';
import { CoordinatorAgent } from '../agents/CoordinatorAgent';

afterEach(() => vi.restoreAllMocks());

describe('CoordinatorAgent', () => {
  it('正常情况：生成包含 advisor 的执行计划', async () => {
    vi.spyOn(sharedModel, 'invoke').mockResolvedValueOnce({
      content: JSON.stringify({
        needsResearch: false,
        needsDiagnostic: true,
        needsPharmacist: true,
        complexity: 'medium',
        reasoning: '用户描述了症状',
      }),
    } as any);

    const agent = new CoordinatorAgent();
    const result = await agent.execute({ userMessage: '我头疼', errors: [] });

    expect(result.coordinatorDecision?.plan).toContain('advisor');
    expect(result.coordinatorDecision?.plan).toContain('diagnostic');
    expect(result.errors).toHaveLength(0);
  });

  it('降级场景：LLM 失败时只走 advisor，不强制走 pharmacist', async () => {
    vi.spyOn(sharedModel, 'invoke').mockRejectedValueOnce(new Error('API 超时'));

    const agent = new CoordinatorAgent();
    const result = await agent.execute({ userMessage: '我头疼', errors: [] });

    expect(result.coordinatorDecision?.plan).toEqual(['advisor']);
    expect(result.errors).toHaveLength(1);
  });

  it('complex + needsResearch：research 排在计划前面', async () => {
    vi.spyOn(sharedModel, 'invoke').mockResolvedValueOnce({
      content: JSON.stringify({
        needsResearch: true,
        needsDiagnostic: false,
        needsPharmacist: true,
        complexity: 'complex',
        reasoning: '药物相互作用问题',
      }),
    } as any);

    const agent = new CoordinatorAgent();
    const result = await agent.execute({ userMessage: '布洛芬和阿司匹林能一起吃吗', errors: [] });

    const plan = result.coordinatorDecision?.plan ?? [];
    expect(plan.indexOf('research')).toBeLessThan(plan.indexOf('pharmacist'));
    expect(plan[plan.length - 1]).toBe('advisor');
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/didi/Desktop/langgraph-project/backend
npx vitest run src/__tests__/CoordinatorAgent.test.ts --reporter=verbose
```

预期：FAIL（旧代码降级走 pharmacist，不是 ['advisor']）

- [ ] **Step 3: 完整替换 CoordinatorAgent.ts**

```typescript
import { BaseAgent } from './BaseAgent';
import { AgentState, CoordinatorAnalysis, CoordinatorDecision } from './types';

export class CoordinatorAgent extends BaseAgent {
  constructor() {
    super('Coordinator', '问题分析和任务协调');
  }

  async execute(state: AgentState): Promise<Partial<AgentState>> {
    this.log('开始分析用户问题...');

    try {
      const analysis = await this.analyzeQuestion(state.userMessage);
      const plan = this.createExecutionPlan(analysis);

      this.log(`分析完成 - 复杂度: ${analysis.complexity}，计划: ${plan.join(' → ')}`);

      return {
        coordinatorDecision: {
          needsResearch:   analysis.needsResearch,
          needsDiagnostic: analysis.needsDiagnostic,
          needsPharmacist: analysis.needsPharmacist,
          complexity:      analysis.complexity,
          plan,
          reasoning:       analysis.reasoning,
        },
        errors: [],
      };
    } catch (error) {
      this.logError('分析失败，切换至兜底模式', error);
      // 降级时只走 advisor，不假设问题类型（修复 I1）
      return {
        coordinatorDecision: {
          needsResearch:   false,
          needsDiagnostic: false,
          needsPharmacist: false,
          complexity:      'simple',
          plan:            ['advisor'],
          reasoning:       '协调器分析失败，已切换至兜底模式',
        },
        errors: [String(error)],
      };
    }
  }

  private async analyzeQuestion(message: string): Promise<CoordinatorAnalysis> {
    const prompt = `你是医药咨询系统的协调器。分析以下用户问题，判断需要调用哪些专业模块。

用户问题: ${message}

判断标准：
- needsResearch: 复杂药物相互作用、罕见疾病、需要权威依据（如"X药和Y药能一起吃吗"）
- needsDiagnostic: 用户描述了症状（头痛、发烧、咳嗽等），需要疾病推理
- needsPharmacist: 询问药品信息、推荐用药（几乎所有咨询都需要）
- complexity: simple=单一药品查询; medium=有症状需推荐; complex=多药交互/罕见疾病

只返回 JSON，不要添加其他内容：
{
  "needsResearch": true/false,
  "needsDiagnostic": true/false,
  "needsPharmacist": true/false,
  "complexity": "simple/medium/complex",
  "reasoning": "判断原因（中文）"
}`;

    return this.invokeJSON<CoordinatorAnalysis>(prompt);
  }

  private createExecutionPlan(analysis: CoordinatorAnalysis): string[] {
    const plan: string[] = [];

    // complex 且需要研究：文献优先
    if (analysis.complexity === 'complex' && analysis.needsResearch) {
      plan.push('research');
    }

    if (analysis.needsDiagnostic) plan.push('diagnostic');
    if (analysis.needsPharmacist) plan.push('pharmacist');

    // 非 complex 的研究需求放后面
    if (analysis.needsResearch && analysis.complexity !== 'complex') {
      if (!plan.includes('research')) plan.push('research');
    }

    plan.push('advisor');

    // 至少要有一个前置节点
    if (plan.length === 1) plan.unshift('pharmacist');

    return plan;
  }
}
```

- [ ] **Step 4: 运行测试，确认全部通过**

```bash
cd /Users/didi/Desktop/langgraph-project/backend
npx vitest run src/__tests__/CoordinatorAgent.test.ts --reporter=verbose
```

预期：3 个测试全部 PASS

- [ ] **Step 5: 提交**

```bash
cd /Users/didi/Desktop/langgraph-project
git add backend/src/agents/CoordinatorAgent.ts backend/src/__tests__/CoordinatorAgent.test.ts
git commit -m "refactor(agents): 重写 CoordinatorAgent，修复降级逻辑（I1）"
```

---

## Task 5: 重写 DiagnosticAgent.ts + 测试

**Files:**
- Modify: `backend/src/agents/DiagnosticAgent.ts`
- Create: `backend/src/__tests__/DiagnosticAgent.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `backend/src/__tests__/DiagnosticAgent.test.ts`：

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { sharedModel } from '../agents/BaseAgent';
import { DiagnosticAgent } from '../agents/DiagnosticAgent';

afterEach(() => vi.restoreAllMocks());

const mockDiagnosticOutput = {
  symptoms: ['头痛', '发烧'],
  possibleConditions: [
    { name: '感冒', probability: 80, severity: 'mild', description: '常见感冒' },
  ],
  riskFactors: ['注意补水'],
  urgency: 'low',
  recommendation: '可以先观察',
};

describe('DiagnosticAgent', () => {
  it('只调用一次 LLM（合并调用）', async () => {
    const spy = vi.spyOn(sharedModel, 'invoke').mockResolvedValueOnce({
      content: JSON.stringify(mockDiagnosticOutput),
    } as any);

    const agent = new DiagnosticAgent();
    await agent.execute({ userMessage: '我头痛发烧', errors: [] });

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('正确写入 diagnosticResults', async () => {
    vi.spyOn(sharedModel, 'invoke').mockResolvedValueOnce({
      content: JSON.stringify(mockDiagnosticOutput),
    } as any);

    const agent = new DiagnosticAgent();
    const result = await agent.execute({ userMessage: '我头痛发烧', errors: [] });

    expect(result.diagnosticResults?.symptoms).toEqual(['头痛', '发烧']);
    expect(result.diagnosticResults?.urgency).toBe('low');
  });

  it('LLM 失败时返回降级默认值，写入 errors', async () => {
    vi.spyOn(sharedModel, 'invoke').mockRejectedValueOnce(new Error('超时'));

    const agent = new DiagnosticAgent();
    const result = await agent.execute({ userMessage: '我头痛', errors: [] });

    expect(result.diagnosticResults?.urgency).toBe('medium');
    expect(result.errors).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/didi/Desktop/langgraph-project/backend
npx vitest run src/__tests__/DiagnosticAgent.test.ts --reporter=verbose
```

预期：FAIL（旧代码多次调用 LLM）

- [ ] **Step 3: 完整替换 DiagnosticAgent.ts**

```typescript
import { BaseAgent } from './BaseAgent';
import { AgentState, DiagnosticResult } from './types';

export class DiagnosticAgent extends BaseAgent {
  constructor() {
    super('Diagnostic', '症状分析和疾病诊断');
  }

  async execute(state: AgentState): Promise<Partial<AgentState>> {
    this.log('开始症状分析...');

    try {
      const result = await this.diagnose(state.userMessage);
      this.log(`症状: ${result.symptoms.join('、')}，紧急程度: ${result.urgency}`);

      return { diagnosticResults: result, errors: [] };
    } catch (error) {
      this.logError('诊断分析失败', error);
      return {
        diagnosticResults: {
          symptoms: [],
          possibleConditions: [],
          riskFactors: [],
          urgency: 'medium',
          recommendation: '建议咨询专业医生',
        },
        errors: [String(error)],
      };
    }
  }

  // 单次 LLM 调用：症状提取 + 疾病推理 + urgency 由 AI 基于 severity 直接判断（修复 I2、I4）
  private async diagnose(message: string): Promise<DiagnosticResult> {
    const prompt = `作为专业医疗助手，请对以下用户描述做完整的诊断分析。

用户描述: ${message}

请一次性返回完整分析结果，JSON 格式：
{
  "symptoms": ["症状1", "症状2"],
  "possibleConditions": [
    {
      "name": "疾病名称",
      "probability": 75,
      "severity": "mild",
      "description": "简短描述"
    }
  ],
  "riskFactors": ["风险因素1"],
  "urgency": "low",
  "recommendation": "就医建议"
}

规则：
- symptoms：标准化医学术语，只列明确症状
- possibleConditions：2-3 种，按概率降序，severity 只能是 mild/moderate/severe
- urgency：基于 possibleConditions 中最高 severity 判断——severe → high，moderate → medium，mild → low
- 只返回 JSON 对象，不要添加其他内容`;

    return this.invokeJSON<DiagnosticResult>(prompt);
  }
}
```

- [ ] **Step 4: 运行测试，确认全部通过**

```bash
cd /Users/didi/Desktop/langgraph-project/backend
npx vitest run src/__tests__/DiagnosticAgent.test.ts --reporter=verbose
```

预期：3 个测试全部 PASS

- [ ] **Step 5: 提交**

```bash
cd /Users/didi/Desktop/langgraph-project
git add backend/src/agents/DiagnosticAgent.ts backend/src/__tests__/DiagnosticAgent.test.ts
git commit -m "refactor(agents): 重写 DiagnosticAgent，合并 LLM 调用，修复 urgency 判断（I2、I4）"
```

---

## Task 6: 重写 ResearchAgent.ts

**Files:**
- Modify: `backend/src/agents/ResearchAgent.ts`

> 关键修复 C1：移除虚假 PubMed URL，每条摘要标注 `[AI知识摘要]`。

- [ ] **Step 1: 完整替换 ResearchAgent.ts**

```typescript
import { BaseAgent } from './BaseAgent';
import { AgentState, ResearchResult, ResearchFinding } from './types';

export class ResearchAgent extends BaseAgent {
  constructor() {
    super('Research', '医学知识摘要');
  }

  async execute(state: AgentState): Promise<Partial<AgentState>> {
    this.log('开始医学知识摘要...');

    try {
      const query = this.buildQuery(state);
      this.log(`查询: ${query}`);

      const findings = await this.summarizeLiterature(query);
      const keyFindings = await this.extractKeyFindings(findings, query);

      const result: ResearchResult = {
        query,
        findings,
        keyFindings,
        timestamp: new Date().toISOString(),
      };

      return { researchResults: result, errors: [] };
    } catch (error) {
      this.logError('知识摘要失败', error);
      return {
        researchResults: {
          query: '',
          findings: [],
          keyFindings: ['知识摘要失败，建议咨询专业医生'],
          timestamp: new Date().toISOString(),
        },
        errors: [String(error)],
      };
    }
  }

  private buildQuery(state: AgentState): string {
    const { diagnosticResults, userMessage } = state;
    if (diagnosticResults?.possibleConditions?.length) {
      const topCondition = diagnosticResults.possibleConditions[0].name;
      return `${topCondition} ${userMessage}`.trim();
    }
    return userMessage;
  }

  // 移除 url 字段，每条摘要加固定标签（修复 C1）
  private async summarizeLiterature(query: string): Promise<ResearchFinding[]> {
    const prompt = `作为医学知识专家，请围绕以下主题提供 3 条医学知识摘要。

主题: ${query}

重要说明：这是基于训练数据的知识摘要，不是真实文献检索结果。

以 JSON 格式返回，每条包含 title（知识点标题）、summary（50-80 字摘要）、relevance（0-100 相关性）：
[
  {
    "title": "知识点标题",
    "summary": "具体的医学知识描述",
    "relevance": 90
  }
]

只返回 JSON 数组，不要添加其他内容。`;

    const raw = await this.invokeJSON<Omit<ResearchFinding, 'label'>[]>(prompt);

    // 统一加上 AI摘要 标签
    return raw.map(item => ({ ...item, label: '[AI知识摘要]' as const }));
  }

  private async extractKeyFindings(
    findings: ResearchFinding[],
    query: string
  ): Promise<string[]> {
    if (findings.length === 0) return ['未找到相关知识'];

    const text = findings.map((f, i) => `${i + 1}. ${f.title}: ${f.summary}`).join('\n');
    const prompt = `请从以下医学知识中提取 3 条与"${query}"最相关的核心结论。

${text}

以 JSON 数组返回：["结论1", "结论2", "结论3"]

只返回 JSON 数组。`;

    try {
      return this.invokeJSON<string[]>(prompt);
    } catch {
      return findings.map(f => f.summary);
    }
  }
}
```

- [ ] **Step 2: 验证无 url 字段（编译检查）**

```bash
cd /Users/didi/Desktop/langgraph-project/backend
grep -n '"url"' src/agents/ResearchAgent.ts
```

预期：无输出（无 url 字段）

- [ ] **Step 3: 提交**

```bash
cd /Users/didi/Desktop/langgraph-project
git add backend/src/agents/ResearchAgent.ts
git commit -m "refactor(agents): 重写 ResearchAgent，移除虚假 URL，改为 AI 知识摘要标注（修复 C1）"
```

---

## Task 7: 重写 PharmacistAgent.ts

**Files:**
- Modify: `backend/src/agents/PharmacistAgent.ts`

- [ ] **Step 1: 完整替换 PharmacistAgent.ts**

```typescript
import { BaseAgent } from './BaseAgent';
import { AgentState, PharmacistResult, Medicine } from './types';

export class PharmacistAgent extends BaseAgent {
  constructor() {
    super('Pharmacist', '药品查询和推荐');
  }

  async execute(state: AgentState): Promise<Partial<AgentState>> {
    this.log('开始药品查询...');

    try {
      const context = this.buildContext(state);
      const medicines = await this.queryMedicines(context);
      this.log(`查询到 ${medicines.length} 种药品`);

      const interactions = await this.checkInteractions(medicines, context);
      const warnings = this.buildWarnings(medicines, interactions, state);

      return {
        pharmacistResults: { medicines, warnings },
        errors: [],
      };
    } catch (error) {
      this.logError('药品查询失败', error);
      return {
        pharmacistResults: {
          medicines: [],
          warnings: ['药品查询失败，请咨询专业医生或药剂师'],
        },
        errors: [String(error)],
      };
    }
  }

  private buildContext(state: AgentState): string {
    let ctx = `用户问题: ${state.userMessage}\n`;
    if (state.diagnosticResults) {
      const { symptoms, possibleConditions } = state.diagnosticResults;
      if (symptoms?.length) ctx += `症状: ${symptoms.join('、')}\n`;
      if (possibleConditions?.length)
        ctx += `可能疾病: ${possibleConditions.map(c => c.name).join('、')}\n`;
    }
    return ctx;
  }

  private async queryMedicines(context: string): Promise<Medicine[]> {
    const prompt = `作为专业药剂师，根据以下信息推荐 2-3 种非处方药（OTC）。

${context}

以 JSON 格式返回：
[
  {
    "name": "布洛芬缓释胶囊",
    "genericName": "布洛芬",
    "type": "非甾体抗炎药（NSAID）",
    "indication": "用于缓解轻至中度疼痛及发热",
    "usage": "成人一次1粒，一日2次",
    "contraindication": "消化道溃疡患者禁用",
    "sideEffects": ["胃肠道不适", "头晕"],
    "interactions": ["不宜与阿司匹林同用"],
    "price": { "min": 10, "max": 30, "currency": "CNY" }
  }
]

只返回 JSON 数组，不要添加其他内容。`;

    // 使用具体类型替代 any（修复 I6）
    return this.invokeJSON<Medicine[]>(prompt);
  }

  private async checkInteractions(
    medicines: Medicine[],
    context: string
  ): Promise<string[]> {
    if (medicines.length <= 1) return [];

    const names = medicines.map(m => m.name).join('、');
    const prompt = `分析以下药物是否存在相互作用：

药物: ${names}
上下文: ${context}

如有相互作用，以 JSON 数组返回描述：["相互作用说明1"]
无相互作用则返回：[]

只返回 JSON 数组。`;

    try {
      return this.invokeJSON<string[]>(prompt);
    } catch {
      return [];
    }
  }

  private buildWarnings(
    medicines: Medicine[],
    interactions: string[],
    state: AgentState
  ): string[] {
    const warnings: string[] = [];

    if (state.diagnosticResults?.urgency === 'high') {
      warnings.push('⚠️ 您的症状可能比较严重，建议立即就医，不要仅依赖非处方药');
    }

    if (interactions.length) warnings.push(...interactions);

    medicines
      .filter(m => m.contraindication)
      .forEach(m => warnings.push(`${m.name} 禁忌：${m.contraindication}`));

    warnings.push('💊 以上药品信息仅供参考，具体用药请咨询专业医生或药剂师');
    warnings.push('📋 用药前请仔细阅读药品说明书');

    return warnings;
  }
}
```

- [ ] **Step 2: 验证编译**

```bash
cd /Users/didi/Desktop/langgraph-project/backend
npx tsc --noEmit 2>&1 | grep PharmacistAgent
```

预期：无报错

- [ ] **Step 3: 提交**

```bash
cd /Users/didi/Desktop/langgraph-project
git add backend/src/agents/PharmacistAgent.ts
git commit -m "refactor(agents): 重写 PharmacistAgent，使用类型化 invokeJSON<Medicine[]>"
```

---

## Task 8: 重写 AdvisorAgent.ts + Zod 校验

**Files:**
- Modify: `backend/src/agents/AdvisorAgent.ts`

- [ ] **Step 1: 完整替换 AdvisorAgent.ts**

```typescript
import { z } from 'zod';
import { BaseAgent } from './BaseAgent';
import { AgentState, AdvisorResult, RecommendedMedicine } from './types';

// Zod schema：运行时校验 AI 输出结构（修复 I6）
const AdvisorAdviceSchema = z.object({
  summary: z.string(),
  diagnosis: z.string().optional(),
  recommendedMedicines: z.array(
    z.object({
      name: z.string(),
      reason: z.string(),
      usage: z.string(),
      precautions: z.array(z.string()),
    })
  ),
  precautions: z.array(z.string()),
  references: z.array(z.string()),
  urgency: z.string(),
  disclaimer: z.string(),
});

const DISCLAIMER = '以上内容仅供参考，不构成医疗建议。请咨询专业医生获取准确诊断和治疗方案。';

export class AdvisorAgent extends BaseAgent {
  constructor() {
    super('Advisor', '综合建议生成');
  }

  async execute(state: AgentState): Promise<Partial<AgentState>> {
    this.log('开始生成最终建议...');

    try {
      const context = this.buildContext(state);
      const result = await this.generateAdvice(context, state);
      this.log('最终建议生成完成');
      return { advisorResults: result, errors: [] };
    } catch (error) {
      this.logError('建议生成失败', error);
      return {
        advisorResults: this.fallbackResult(state),
        errors: [String(error)],
      };
    }
  }

  private buildContext(state: AgentState): string {
    let ctx = `用户问题: ${state.userMessage}\n\n`;

    if (state.coordinatorDecision) {
      ctx += `问题复杂度: ${state.coordinatorDecision.complexity}\n`;
      ctx += `分析原因: ${state.coordinatorDecision.reasoning}\n\n`;
    }

    if (state.diagnosticResults) {
      const dr = state.diagnosticResults;
      ctx += `诊断分析:\n`;
      if (dr.symptoms?.length) ctx += `- 症状: ${dr.symptoms.join('、')}\n`;
      if (dr.possibleConditions?.length) {
        ctx += `- 可能疾病: ${dr.possibleConditions.map(c => `${c.name}(${c.probability}%)`).join('、')}\n`;
      }
      ctx += `- 紧急程度: ${dr.urgency}\n`;
      ctx += `- 建议: ${dr.recommendation}\n\n`;
    }

    if (state.pharmacistResults?.medicines?.length) {
      ctx += `药品推荐:\n`;
      state.pharmacistResults.medicines.forEach((m, i) => {
        ctx += `${i + 1}. ${m.name}（${m.type}）\n`;
        ctx += `   适应症: ${m.indication}\n`;
        ctx += `   用法: ${m.usage}\n`;
      });
      ctx += '\n';
    }

    if (state.researchResults?.keyFindings?.length) {
      ctx += `医学知识摘要:\n`;
      state.researchResults.keyFindings.forEach((f, i) => {
        ctx += `${i + 1}. ${f}\n`;
      });
      ctx += '\n';
    }

    return ctx;
  }

  private async generateAdvice(context: string, state: AgentState): Promise<AdvisorResult> {
    const prompt = `作为专业医疗顾问，基于以下信息生成全面的用药建议。

${context}

以 JSON 格式返回：
{
  "summary": "对用户问题和情况的简要概括（50-100字）",
  "diagnosis": "症状和可能疾病的说明（如有诊断信息）",
  "recommendedMedicines": [
    {
      "name": "药品名称",
      "reason": "推荐理由",
      "usage": "用法用量",
      "precautions": ["注意事项1", "注意事项2"]
    }
  ],
  "precautions": ["总体注意事项1", "总体注意事项2"],
  "references": ["参考知识点（如有研究结果）"],
  "urgency": "就医建议",
  "disclaimer": "${DISCLAIMER}"
}

只返回 JSON 对象，不要添加其他内容。`;

    const raw = await this.invokeJSON<unknown>(prompt);

    // Zod 运行时校验（修复 I6）
    const parsed = AdvisorAdviceSchema.safeParse(raw);
    if (!parsed.success) {
      this.logError('Zod 校验失败，使用降级结果', parsed.error.message);
      return this.fallbackResult(state);
    }

    return parsed.data;
  }

  private fallbackResult(state: AgentState): AdvisorResult {
    const medicines = state.pharmacistResults?.medicines ?? [];
    return {
      summary: '根据您的情况，为您推荐以下药品',
      diagnosis: state.diagnosticResults?.possibleConditions?.[0]?.description,
      recommendedMedicines: medicines.map(m => ({
        name: m.name,
        reason: m.indication,
        usage: m.usage,
        precautions: m.sideEffects ?? ['使用前请阅读说明书'],
      })),
      precautions: [
        '用药前请仔细阅读药品说明书',
        '如症状持续或加重，请及时就医',
      ],
      references: [],
      urgency: state.diagnosticResults?.recommendation ?? '如有疑问，请咨询专业医生',
      disclaimer: DISCLAIMER,
    };
  }
}
```

- [ ] **Step 2: 确认编译通过**

```bash
cd /Users/didi/Desktop/langgraph-project/backend
npx tsc --noEmit 2>&1 | grep AdvisorAgent
```

预期：无报错

- [ ] **Step 3: 提交**

```bash
cd /Users/didi/Desktop/langgraph-project
git add backend/src/agents/AdvisorAgent.ts
git commit -m "refactor(agents): 重写 AdvisorAgent，用 Zod 替换 invokeJSON<any>（修复 I6）"
```

---

## Task 9: 新建 multiAgentService.ts + 路由逻辑测试

**Files:**
- Create: `backend/src/services/multiAgentService.ts`
- Create: `backend/src/__tests__/routing.test.ts`

- [ ] **Step 1: 写路由逻辑失败测试**

创建 `backend/src/__tests__/routing.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { routeAfterCoordinator, routeToNext } from '../services/multiAgentService';
import { AgentState } from '../agents/types';

function makeState(overrides: Partial<AgentState> = {}): AgentState {
  return { userMessage: 'test', errors: [], ...overrides };
}

describe('routeAfterCoordinator', () => {
  it('research + diagnostic 都需要时返回数组（并行）', () => {
    const state = makeState({
      coordinatorDecision: {
        needsResearch: true, needsDiagnostic: true, needsPharmacist: true,
        complexity: 'complex', reasoning: 'test',
        plan: ['research', 'diagnostic', 'pharmacist', 'advisor'],
      },
    });
    expect(routeAfterCoordinator(state)).toEqual(['research', 'diagnostic']);
  });

  it('只需要 diagnostic 时返回单个字符串', () => {
    const state = makeState({
      coordinatorDecision: {
        needsResearch: false, needsDiagnostic: true, needsPharmacist: true,
        complexity: 'medium', reasoning: 'test',
        plan: ['diagnostic', 'pharmacist', 'advisor'],
      },
    });
    expect(routeAfterCoordinator(state)).toBe('diagnostic');
  });

  it('两者都不需要时从 plan[0] 开始', () => {
    const state = makeState({
      coordinatorDecision: {
        needsResearch: false, needsDiagnostic: false, needsPharmacist: true,
        complexity: 'simple', reasoning: 'test',
        plan: ['pharmacist', 'advisor'],
      },
    });
    expect(routeAfterCoordinator(state)).toBe('pharmacist');
  });
});

describe('routeToNext', () => {
  it('research 完成后，下一个是 diagnostic', () => {
    const state = makeState({
      coordinatorDecision: {
        needsResearch: true, needsDiagnostic: true, needsPharmacist: true,
        complexity: 'complex', reasoning: 'test',
        plan: ['research', 'diagnostic', 'pharmacist', 'advisor'],
      },
      researchResults: {
        query: 'test', findings: [], keyFindings: [], timestamp: '',
      },
    });
    expect(routeToNext(state)).toBe('diagnostic');
  });

  it('research + diagnostic 都完成后，下一个是 pharmacist', () => {
    const state = makeState({
      coordinatorDecision: {
        needsResearch: true, needsDiagnostic: true, needsPharmacist: true,
        complexity: 'complex', reasoning: 'test',
        plan: ['research', 'diagnostic', 'pharmacist', 'advisor'],
      },
      researchResults: {
        query: 'test', findings: [], keyFindings: [], timestamp: '',
      },
      diagnosticResults: {
        symptoms: [], possibleConditions: [], riskFactors: [],
        urgency: 'low', recommendation: '',
      },
    });
    expect(routeToNext(state)).toBe('pharmacist');
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /Users/didi/Desktop/langgraph-project/backend
npx vitest run src/__tests__/routing.test.ts --reporter=verbose
```

预期：FAIL（模块不存在）

- [ ] **Step 3: 创建 multiAgentService.ts**

创建 `backend/src/services/multiAgentService.ts`：

```typescript
import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { CoordinatorAgent } from '../agents/CoordinatorAgent';
import { DiagnosticAgent } from '../agents/DiagnosticAgent';
import { PharmacistAgent } from '../agents/PharmacistAgent';
import { ResearchAgent } from '../agents/ResearchAgent';
import { AdvisorAgent } from '../agents/AdvisorAgent';
import {
  AgentState, CoordinatorDecision, ResearchResult, DiagnosticResult,
  PharmacistResult, AdvisorResult, SseEvent,
} from '../agents/types';

// ===== Agent 实例 =====
const coordinator = new CoordinatorAgent();
const diagnostic   = new DiagnosticAgent();
const pharmacist   = new PharmacistAgent();
const research     = new ResearchAgent();
const advisor      = new AdvisorAgent();

// ===== LangGraph 状态 =====
const AgentStateAnnotation = Annotation.Root({
  userMessage:          Annotation<string>(),
  coordinatorDecision:  Annotation<CoordinatorDecision | undefined>(),
  researchResults:      Annotation<ResearchResult | undefined>(),
  diagnosticResults:    Annotation<DiagnosticResult | undefined>(),
  pharmacistResults:    Annotation<PharmacistResult | undefined>(),
  advisorResults:       Annotation<AdvisorResult | undefined>(),
  errors: Annotation<string[]>({
    reducer: (a: string[], b: string[]) => [...a, ...b],
    default: () => [],
  }),
});

// ===== 路由函数（导出供测试）=====

export function routeAfterCoordinator(state: AgentState): string | string[] {
  const plan = state.coordinatorDecision?.plan ?? [];
  const parallel = plan.filter(a => a === 'research' || a === 'diagnostic');
  if (parallel.length === 2) return parallel;
  if (parallel.length === 1) return parallel[0];
  return plan[0] ?? 'advisor';
}

export function routeToNext(state: AgentState): string {
  const plan = state.coordinatorDecision?.plan ?? [];
  const done = new Set<string>([
    state.researchResults    ? 'research'   : '',
    state.diagnosticResults  ? 'diagnostic' : '',
    state.pharmacistResults  ? 'pharmacist' : '',
  ].filter(Boolean));
  return plan.find(a => !done.has(a)) ?? 'pharmacist';
}

// ===== 节点函数 =====

async function coordinatorNode(state: AgentState) {
  return coordinator.execute(state);
}
async function researchNode(state: AgentState) {
  return research.execute(state);
}
async function diagnosticNode(state: AgentState) {
  return diagnostic.execute(state);
}
async function pharmacistNode(state: AgentState) {
  return pharmacist.execute(state);
}
async function advisorNode(state: AgentState) {
  return advisor.execute(state);
}

// ===== 构建 LangGraph 图 =====

const graph = new StateGraph(AgentStateAnnotation)
  .addNode('coordinator', coordinatorNode)
  .addNode('research',    researchNode)
  .addNode('diagnostic',  diagnosticNode)
  .addNode('pharmacist',  pharmacistNode)
  .addNode('advisor',     advisorNode)
  .addEdge(START, 'coordinator')
  .addConditionalEdges('coordinator', routeAfterCoordinator)
  .addConditionalEdges('research',    routeToNext)
  .addConditionalEdges('diagnostic',  routeToNext)
  .addEdge('pharmacist', 'advisor')
  .addEdge('advisor', END)
  .compile();

const AGENT_NODES = new Set(['coordinator', 'research', 'diagnostic', 'pharmacist', 'advisor']);

function extractSummary(nodeName: string, output: Partial<AgentState>): string {
  switch (nodeName) {
    case 'coordinator': {
      const d = output.coordinatorDecision;
      return d ? `复杂度：${d.complexity}，计划：${d.plan.join(' → ')}` : '分析完成';
    }
    case 'diagnostic': {
      const d = output.diagnosticResults;
      return d ? `症状：${d.symptoms.join('、') || '无'}，紧急程度：${d.urgency}` : '分析完成';
    }
    case 'research': {
      const r = output.researchResults;
      return r ? `找到 ${r.findings.length} 条知识摘要` : '摘要完成';
    }
    case 'pharmacist': {
      const p = output.pharmacistResults;
      return p ? `推荐 ${p.medicines.length} 种药品` : '查询完成';
    }
    case 'advisor':
      return '综合建议生成完毕';
    default:
      return '完成';
  }
}

// ===== SSE 流（使用 streamEvents 获取节点粒度事件）=====

export async function* streamMultiAgent(userMessage: string): AsyncGenerator<SseEvent> {
  try {
    const eventStream = graph.streamEvents(
      { userMessage, errors: [] } as AgentState,
      { version: 'v2' }
    );

    for await (const event of eventStream) {
      const nodeName = event.name;
      if (!AGENT_NODES.has(nodeName)) continue;

      if (event.event === 'on_chain_start') {
        yield { type: 'agent_start', agent: nodeName };
      }

      if (event.event === 'on_chain_end') {
        const output = (event.data?.output ?? {}) as Partial<AgentState>;
        yield {
          type: 'agent_complete',
          agent: nodeName,
          summary: extractSummary(nodeName, output),
        };

        if (nodeName === 'advisor' && output.advisorResults) {
          yield { type: 'final_result', data: output.advisorResults };
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    yield { type: 'error', message };
  }

  yield { type: 'done' };
}
```

- [ ] **Step 4: 运行路由测试，确认全部通过**

```bash
cd /Users/didi/Desktop/langgraph-project/backend
npx vitest run src/__tests__/routing.test.ts --reporter=verbose
```

预期：5 个测试全部 PASS

- [ ] **Step 5: 验证编译**

```bash
npx tsc --noEmit 2>&1 | grep -E "error TS" | head -10
```

预期：无 multiAgentService 相关错误

- [ ] **Step 6: 提交**

```bash
cd /Users/didi/Desktop/langgraph-project
git add backend/src/services/multiAgentService.ts backend/src/__tests__/routing.test.ts
git commit -m "feat(services): 新建 multiAgentService，LangGraph 多 Agent 图 + SSE 流"
```

---

## Task 10: 更新路由，删除旧 workflowService

**Files:**
- Modify: `backend/src/routes/chatRoutes.ts`
- Delete: `backend/src/services/workflowService.ts`

- [ ] **Step 1: 替换 chatRoutes.ts 中的 workflow 路由**

用以下内容完整覆盖 `backend/src/routes/chatRoutes.ts`：

```typescript
import { Router, Request, Response } from 'express';
import { llmService, ChatMessage } from '../services/llmService';
import { streamMultiAgent } from '../services/multiAgentService';

const router = Router();

// POST /api/chat — 简单模式（保留）
router.post('/chat', async (req: Request, res: Response) => {
  const { message, history = [] }: { message: string; history?: ChatMessage[] } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({ error: '消息内容不能为空' });
  }

  try {
    const response = await llmService.chat(message, history);
    return res.json(response);
  } catch (error) {
    const msg = error instanceof Error ? error.message : '服务器内部错误';
    return res.status(500).json({ error: msg });
  }
});

// POST /api/chat/workflow — 多 Agent 模式（SSE）
router.post('/chat/workflow', async (req: Request, res: Response) => {
  const { message }: { message: string } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({ error: '消息内容不能为空' });
  }

  res.setHeader('Content-Type',                'text/event-stream');
  res.setHeader('Cache-Control',               'no-cache');
  res.setHeader('Connection',                  'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    for await (const event of streamMultiAgent(message)) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : '执行失败';
    res.write(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`);
  } finally {
    res.end();
  }
});

// GET /api/chat/validate — API Key 验证
router.get('/chat/validate', async (_req: Request, res: Response) => {
  try {
    const isValid = await llmService.validateApiKey();
    return res.json({ valid: isValid, message: isValid ? 'API Key 有效' : 'API Key 无效' });
  } catch {
    return res.status(500).json({ valid: false, message: '验证失败' });
  }
});

export default router;
```

- [ ] **Step 2: 删除旧 workflowService.ts**

```bash
rm /Users/didi/Desktop/langgraph-project/backend/src/services/workflowService.ts
```

- [ ] **Step 3: 验证编译通过**

```bash
cd /Users/didi/Desktop/langgraph-project/backend
npx tsc --noEmit 2>&1 | grep -E "error TS" | head -10
```

预期：无报错

- [ ] **Step 4: 运行所有测试**

```bash
npx vitest run --reporter=verbose
```

预期：全部 PASS

- [ ] **Step 5: 提交**

```bash
cd /Users/didi/Desktop/langgraph-project
git add backend/src/routes/chatRoutes.ts
git rm backend/src/services/workflowService.ts
git commit -m "feat(routes): /chat/workflow 切换为多 Agent SSE 端点，删除旧工作流服务"
```

---

## Task 11: 更新前端类型和 chatService

**Files:**
- Modify: `frontend/src/types/chat.ts`
- Modify: `frontend/src/services/chatService.ts`

- [ ] **Step 1: 替换 frontend/src/types/chat.ts**

```typescript
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  message: string;
  history?: ChatMessage[];
}

export interface ChatResponse {
  reply: string;
  medicines?: any[];
  disclaimer?: string;
}

// ===== 多 Agent 相关类型 =====

export type AgentName =
  | 'coordinator'
  | 'research'
  | 'diagnostic'
  | 'pharmacist'
  | 'advisor';

export type AgentStatus = 'pending' | 'running' | 'done';

export interface AgentTraceItem {
  agent: AgentName;
  status: AgentStatus;
  summary?: string;
}

export interface RecommendedMedicine {
  name: string;
  reason: string;
  usage: string;
  precautions: string[];
}

export interface FinalResult {
  summary: string;
  diagnosis?: string;
  recommendedMedicines: RecommendedMedicine[];
  precautions: string[];
  references: string[];
  urgency: string;
  disclaimer: string;
}

export type SseEvent =
  | { type: 'agent_start'; agent: AgentName }
  | { type: 'agent_complete'; agent: AgentName; summary: string }
  | { type: 'final_result'; data: FinalResult }
  | { type: 'error'; message: string }
  | { type: 'done' };
```

- [ ] **Step 2: 更新 frontend/src/services/chatService.ts**

用以下内容完整覆盖 `frontend/src/services/chatService.ts`：

```typescript
import axios from 'axios';
import { ChatRequest, ChatResponse, SseEvent } from '../types/chat';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export const chatService = {
  // 简单模式
  async sendMessage(request: ChatRequest): Promise<ChatResponse> {
    const { data } = await axios.post<ChatResponse>(`${API_BASE}/chat`, request);
    return data;
  },

  // 健康检查
  async checkHealth(): Promise<{ status: string }> {
    const { data } = await axios.get(`${API_BASE}/health`);
    return data;
  },

  // API Key 验证
  async validateApiKey(): Promise<boolean> {
    const { data } = await axios.get(`${API_BASE}/chat/validate`);
    return data.valid;
  },

  // 多 Agent SSE 流（用 fetch + ReadableStream，支持 POST）
  async *streamWorkflow(message: string): AsyncGenerator<SseEvent> {
    const response = await fetch(`${API_BASE}/chat/workflow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });

    if (!response.ok || !response.body) {
      yield { type: 'error', message: `请求失败: ${response.status}` };
      yield { type: 'done' };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        const line = part.trim();
        if (line.startsWith('data: ')) {
          try {
            yield JSON.parse(line.slice(6)) as SseEvent;
          } catch {
            // 跳过格式错误的行
          }
        }
      }
    }
  },
};
```

- [ ] **Step 3: 提交**

```bash
cd /Users/didi/Desktop/langgraph-project
git add frontend/src/types/chat.ts frontend/src/services/chatService.ts
git commit -m "feat(frontend): 新增多 Agent 类型定义和 SSE 流客户端"
```

---

## Task 12: 重写 App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: 完整替换 App.tsx**

```tsx
import { useState, useRef, useEffect } from 'react';
import { chatService } from './services/chatService';
import type {
  ChatMessage, AgentTraceItem, FinalResult, AgentName,
} from './types/chat';

const AGENT_LABELS: Record<AgentName, string> = {
  coordinator: '协调器',
  research:    '文献研究',
  diagnostic:  '症状诊断',
  pharmacist:  '药品查询',
  advisor:     '综合建议',
};

const AGENT_ICONS: Record<AgentName, string> = {
  coordinator: '🧭',
  research:    '🔬',
  diagnostic:  '🩺',
  pharmacist:  '💊',
  advisor:     '📋',
};

interface Message {
  role: 'user' | 'assistant';
  content: string;
  trace?: AgentTraceItem[];
  result?: FinalResult;
}

function AgentTrace({ items }: { items: AgentTraceItem[] }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2 text-sm">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Agent 执行过程
      </div>
      {items.map((item, i) => (
        <div key={i} className="flex items-start space-x-3">
          <span className="text-base">{AGENT_ICONS[item.agent as AgentName] ?? '🤖'}</span>
          <div className="flex-1">
            <span className="font-medium text-gray-700">
              {AGENT_LABELS[item.agent as AgentName] ?? item.agent}
            </span>
            {item.status === 'running' && (
              <span className="ml-2 text-blue-500 animate-pulse">处理中...</span>
            )}
            {item.status === 'done' && item.summary && (
              <span className="ml-2 text-gray-500">{item.summary}</span>
            )}
          </div>
          <span>
            {item.status === 'running' ? '⏳' : item.status === 'done' ? '✅' : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

function MedicineCard({ med }: { med: FinalResult['recommendedMedicines'][0] }) {
  return (
    <div className="bg-white border border-green-200 rounded-lg p-3 space-y-1">
      <div className="font-semibold text-gray-800">💊 {med.name}</div>
      <div className="text-xs text-gray-600">{med.reason}</div>
      <div className="text-xs text-blue-600">用法：{med.usage}</div>
      {med.precautions.length > 0 && (
        <div className="text-xs text-orange-600">
          注意：{med.precautions.join('；')}
        </div>
      )}
    </div>
  );
}

function FinalResultCard({ result }: { result: FinalResult }) {
  return (
    <div className="space-y-4">
      {/* 总结 */}
      <div className="bg-blue-50 rounded-xl p-4">
        <p className="text-gray-800 leading-relaxed">{result.summary}</p>
        {result.diagnosis && (
          <p className="text-sm text-gray-600 mt-2">{result.diagnosis}</p>
        )}
      </div>

      {/* 推荐药品 */}
      {result.recommendedMedicines.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold text-green-700">推荐药品</div>
          {result.recommendedMedicines.map((med, i) => (
            <MedicineCard key={i} med={med} />
          ))}
        </div>
      )}

      {/* 注意事项 */}
      {result.precautions.length > 0 && (
        <div className="bg-orange-50 rounded-xl p-4">
          <div className="text-sm font-semibold text-orange-700 mb-2">⚠️ 注意事项</div>
          <ul className="space-y-1">
            {result.precautions.map((p, i) => (
              <li key={i} className="text-sm text-gray-700">• {p}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 免责声明 */}
      <p className="text-xs text-gray-400">{result.disclaimer}</p>
    </div>
  );
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<boolean | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatService.checkHealth()
      .then(() => setHealth(true))
      .catch(() => setHealth(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg: Message = { role: 'user', content: input.trim() };
    const assistantMsg: Message = { role: 'assistant', content: '', trace: [], result: undefined };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setLoading(true);

    const assistantIndex = messages.length + 1;

    try {
      for await (const event of chatService.streamWorkflow(userMsg.content)) {
        if (event.type === 'agent_start') {
          setMessages(prev => {
            const msgs = [...prev];
            const msg = { ...msgs[assistantIndex] };
            msg.trace = [...(msg.trace ?? []), { agent: event.agent, status: 'running' }];
            msgs[assistantIndex] = msg;
            return msgs;
          });
        }

        if (event.type === 'agent_complete') {
          setMessages(prev => {
            const msgs = [...prev];
            const msg = { ...msgs[assistantIndex] };
            msg.trace = (msg.trace ?? []).map(t =>
              t.agent === event.agent
                ? { ...t, status: 'done', summary: event.summary }
                : t
            );
            msgs[assistantIndex] = msg;
            return msgs;
          });
        }

        if (event.type === 'final_result') {
          setMessages(prev => {
            const msgs = [...prev];
            const msg = { ...msgs[assistantIndex] };
            msg.result = event.data;
            msg.content = event.data.summary;
            msgs[assistantIndex] = msg;
            return msgs;
          });
        }

        if (event.type === 'error') {
          setMessages(prev => {
            const msgs = [...prev];
            msgs[assistantIndex] = {
              ...msgs[assistantIndex],
              content: `错误：${event.message}`,
            };
            return msgs;
          });
        }

        if (event.type === 'done') {
          setLoading(false);
        }
      }
    } catch {
      setMessages(prev => {
        const msgs = [...prev];
        msgs[assistantIndex] = { ...msgs[assistantIndex], content: '服务暂时不可用，请稍后再试。' };
        return msgs;
      });
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* 导航栏 */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-2xl">🏥</span>
            <h1 className="text-xl font-bold text-gray-800">医药智能助手</h1>
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-sm text-blue-600 font-medium bg-blue-50 px-3 py-1 rounded-full">
              🤖 Multi-Agent 模式
            </span>
            <span className={`flex items-center text-sm ${health ? 'text-green-600' : health === false ? 'text-red-600' : 'text-gray-400'}`}>
              <span className={`w-2 h-2 rounded-full mr-2 ${health ? 'bg-green-500' : health === false ? 'bg-red-500' : 'bg-gray-300'}`} />
              {health ? '已连接' : health === false ? '未连接' : '检查中...'}
            </span>
          </div>
        </div>
      </nav>

      {/* 主区域 */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 140px)' }}>
          {/* 消息区 */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4">
                <div className="text-6xl mb-4">💊</div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">欢迎使用医药智能助手</h2>
                <p className="text-gray-500 text-sm mb-6">多个专业 Agent 协作，为您提供准确的医药建议</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-xl">
                  {[
                    '我头疼发烧咳嗽，应该吃什么药？',
                    '布洛芬的用法用量是什么？',
                    '布洛芬和阿司匹林能一起吃吗？',
                    '感冒了有哪些推荐的非处方药？',
                  ].map((example, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(example)}
                      className="p-3 text-left bg-blue-50 hover:bg-blue-100 rounded-lg text-sm text-gray-700 transition-colors"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] space-y-3 ${msg.role === 'user' ? '' : 'w-full'}`}>
                    {/* 气泡 */}
                    {msg.role === 'user' ? (
                      <div className="bg-blue-600 text-white rounded-2xl px-4 py-3">
                        <p>{msg.content}</p>
                      </div>
                    ) : (
                      <>
                        {/* 执行轨迹 */}
                        {msg.trace && msg.trace.length > 0 && (
                          <AgentTrace items={msg.trace} />
                        )}
                        {/* 最终结果 */}
                        {msg.result ? (
                          <FinalResultCard result={msg.result} />
                        ) : msg.content ? (
                          <div className="bg-gray-100 rounded-2xl px-4 py-3 text-gray-800">
                            <p>{msg.content}</p>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
            {/* 加载动画 */}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-2xl px-4 py-3">
                  <div className="flex space-x-1">
                    {[0, 0.15, 0.3].map((delay, i) => (
                      <div
                        key={i}
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: `${delay}s` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* 输入区 */}
          <div className="border-t border-gray-200 p-4 bg-gray-50">
            <div className="flex space-x-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="描述您的症状或问题..."
                disabled={loading || !health}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim() || !health}
                className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {loading ? '处理中...' : '发送'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">⚠️ AI 建议仅供参考，具体用药请咨询专业医生</p>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 检查 TypeScript 编译**

```bash
cd /Users/didi/Desktop/langgraph-project/frontend
npx tsc --noEmit 2>&1 | head -20
```

预期：无报错

- [ ] **Step 3: 提交**

```bash
cd /Users/didi/Desktop/langgraph-project
git add frontend/src/App.tsx frontend/src/types/chat.ts frontend/src/services/chatService.ts
git commit -m "feat(frontend): 重写 App.tsx，接入多 Agent 轨迹面板和结果卡片"
```

---

## Task 13: 集成验证

- [ ] **Step 1: 运行所有后端测试**

```bash
cd /Users/didi/Desktop/langgraph-project/backend
npx vitest run --reporter=verbose
```

预期：全部 PASS，无 FAIL

- [ ] **Step 2: 启动后端**

```bash
cd /Users/didi/Desktop/langgraph-project/backend
npm run dev
```

预期：`🚀 服务器运行在 http://localhost:3000`

- [ ] **Step 3: 测试 SSE 端点（新终端）**

```bash
curl -X POST http://localhost:3000/api/chat/workflow \
  -H "Content-Type: application/json" \
  -d '{"message":"我头疼发烧，应该吃什么药？"}' \
  --no-buffer
```

预期：依次出现以下格式的 SSE 事件流：
```
data: {"type":"agent_start","agent":"coordinator"}
data: {"type":"agent_complete","agent":"coordinator","summary":"复杂度：medium，计划：..."}
...
data: {"type":"final_result","data":{...}}
data: {"type":"done"}
```

- [ ] **Step 4: 启动前端**

```bash
cd /Users/didi/Desktop/langgraph-project/frontend
npm run dev
```

预期：`http://localhost:5173`

- [ ] **Step 5: 浏览器验证**

打开 `http://localhost:5173`，发送「我头疼发烧，应该吃什么药？」，验证：
- [ ] 执行轨迹面板依次出现各 Agent 状态
- [ ] 最终结果卡片显示推荐药品和注意事项
- [ ] 导航栏显示「🤖 Multi-Agent 模式」
- [ ] 无控制台报错

- [ ] **Step 6: 最终提交**

```bash
cd /Users/didi/Desktop/langgraph-project
git add -A
git commit -m "feat: 多 Agent 系统完整接入，修复 C1-C3、I1-I6 全部问题"
```
