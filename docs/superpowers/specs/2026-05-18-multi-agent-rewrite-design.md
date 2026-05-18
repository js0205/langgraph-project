# 设计文档：多 Agent 系统完整重写

**日期**：2026-05-18  
**状态**：已确认，待实施  
**范围**：后端 Agent 层 + 服务层 + 路由 + 前端全部重写

---

## 背景

当前系统实际运行的是 `workflowService.ts`，是一个固定 4 步的单模型 LangGraph 工作流。`agents/` 目录虽已定义 5 个 Agent 类，但从未被接入。代码审查发现多个 Critical/Important 问题。

本次重写目标：
- 接入 `agents/` 目录的多 Agent 架构
- 修复所有 Critical 和 Important 代码问题
- 支持 SSE 流式推送，前端实时展示执行轨迹
- Research + Diagnostic 并行执行，降低延迟

---

## 文件变更总览

```
backend/src/
├── agents/
│   ├── types.ts              重写
│   ├── BaseAgent.ts          重写
│   ├── CoordinatorAgent.ts   重写
│   ├── DiagnosticAgent.ts    重写
│   ├── ResearchAgent.ts      重写
│   ├── PharmacistAgent.ts    重写
│   └── AdvisorAgent.ts       重写
├── services/
│   ├── multiAgentService.ts  新增
│   └── workflowService.ts    删除
└── routes/chatRoutes.ts      修改

frontend/src/
├── App.tsx                   重写
├── services/chatService.ts   修改
└── types/chat.ts             修改
```

---

## 执行流程

```
用户消息
   ↓
[CoordinatorAgent]  输出 plan，决定哪些 Agent 需要执行
   ↓
条件路由（支持并行）
   ├─ [ResearchAgent ∥ DiagnosticAgent]  两者互不依赖，并行执行
   └─ 或仅执行其中一个，或均跳过
   ↓
[PharmacistAgent]   等待 Research/Diagnostic 完成后执行
   ↓
[AdvisorAgent]      汇总所有结果，生成最终建议
   ↓
END
```

---

## 一、Agent 层重写

### 1.1 `types.ts`

**变更：**
- `IAgent` 接口移除 `model` 字段（不暴露底层实现，修复 I3）
- `AgentState` 移除 `completedAgents`（改用 LangGraph 原生路由，修复 I5）
- `errors` 从可选改为必填，默认 `[]`

```typescript
interface AgentState {
  userMessage: string;
  coordinatorDecision?: CoordinatorDecision;
  researchResults?: ResearchResult;
  diagnosticResults?: DiagnosticResult;
  pharmacistResults?: PharmacistResult;
  advisorResults?: AdvisorResult;
  errors: string[];
}

interface IAgent {
  name: string;
  description: string;
  execute(state: AgentState): Promise<Partial<AgentState>>;
}
```

### 1.2 `BaseAgent.ts`

**三处关键修复：**

**1. 单例模型实例（修复 C2）**

```typescript
// 模块级单例，所有 Agent 共享，避免并发时重复创建
const sharedModel = new ChatGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY!,
  model: 'gemini-2.0-flash-exp',
  temperature: 0.7,
});

export abstract class BaseAgent implements IAgent {
  protected model = sharedModel;
}
```

**2. 健壮 `invokeJSON`（修复 C3）**

```typescript
protected async invokeJSON<T>(prompt: string): Promise<T> {
  const raw = await this.model.invoke(prompt);
  const text = raw.content.toString();
  const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (!match) throw new Error(`JSON 提取失败: ${text.slice(0, 100)}`);
  return JSON.parse(match[0]) as T;
}
```

**3. `pino` 结构化日志（优化3，修复 C2 日志泄漏）**

```typescript
import pino from 'pino';
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

protected log(msg: string): void {
  logger.info({ agent: this.name }, msg);
}
protected logError(msg: string, err?: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  logger.error({ agent: this.name }, `${msg}: ${message}`);
}
```

### 1.3 各 Agent 修复点

| Agent | 问题 | 修复方式 |
|---|---|---|
| `CoordinatorAgent` | I1：降级时强制走 pharmacist | 降级只走 `advisor`，不假设问题类型 |
| `DiagnosticAgent` | I2：urgency 是关键词硬匹配，与 AI 诊断脱节 | 合并为单次 LLM 调用，AI 直接输出 urgency |
| `DiagnosticAgent` | I4：4 次串行 LLM 调用 | 症状提取 + 疾病推理 + urgency 合并为 1 次 |
| `ResearchAgent` | C1：生成虚假 PubMed URL | 移除 `url` 字段，每条摘要加 `[AI知识摘要]` 前缀 |
| `PharmacistAgent` | I6：`invokeJSON<any>` | 定义 `Medicine` 接口，使用 `invokeJSON<Medicine[]>` |
| `AdvisorAgent` | I6：`invokeJSON<any>` | 定义 `AdvisorAdvice` 接口 + Zod 运行时校验 |

#### `DiagnosticAgent` 合并调用

```typescript
// 之前：extractSymptoms() + inferConditions() + assessUrgency() = 3 次 LLM
// 之后：单次输出完整结构

interface DiagnosticOutput {
  symptoms: string[];
  possibleConditions: Array<{
    name: string;
    probability: number;
    severity: 'mild' | 'moderate' | 'severe';
    description: string;
  }>;
  riskFactors: string[];
  urgency: 'low' | 'medium' | 'high';  // AI 基于 severity 直接判断
  recommendation: string;
}
```

#### `CoordinatorAgent` 降级修复

```typescript
// 之前：失败时硬编码走 pharmacist + advisor（对诊断类问题语义错误）
// 之后：失败时只走 advisor，给出兜底回复
catch (error) {
  return {
    coordinatorDecision: {
      needsResearch: false,
      needsDiagnostic: false,
      needsPharmacist: false,
      complexity: 'simple',
      plan: ['advisor'],
      reasoning: '协调器分析失败，已切换至兜底模式',
    },
    errors: [String(error)],
  };
}
```

---

## 二、`multiAgentService.ts`

### 2.1 LangGraph 图结构

```typescript
import { Annotation, StateGraph, START, END } from '@langchain/langgraph';

const AgentStateAnnotation = Annotation.Root({
  userMessage:          Annotation<string>,
  coordinatorDecision:  Annotation<CoordinatorDecision | undefined>,
  researchResults:      Annotation<ResearchResult | undefined>,
  diagnosticResults:    Annotation<DiagnosticResult | undefined>,
  pharmacistResults:    Annotation<PharmacistResult | undefined>,
  advisorResults:       Annotation<AdvisorResult | undefined>,
  errors:               Annotation<string[]>({ reducer: (a, b) => [...a, ...b] }),
});

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
  .addConditionalEdges('pharmacist',  s => 'advisor')
  .addEdge('advisor', END)
  .compile();
```

### 2.2 并行路由（优化1）

```typescript
function routeAfterCoordinator(state): string | string[] {
  const { needsResearch, needsDiagnostic } = state.coordinatorDecision!;
  if (needsResearch && needsDiagnostic) return ['research', 'diagnostic']; // 并行
  if (needsResearch)   return 'research';
  if (needsDiagnostic) return 'diagnostic';
  return 'pharmacist';
}

function routeToNext(state): string {
  const plan = state.coordinatorDecision?.plan ?? [];
  // 通过检查哪些结果字段已写入来判断执行进度
  const done = new Set([
    state.researchResults    && 'research',
    state.diagnosticResults  && 'diagnostic',
  ].filter(Boolean));
  return plan.find(a => !done.has(a)) ?? 'pharmacist';
}
```

### 2.3 SSE 流（优化2：`streamEvents`）

```typescript
export async function* streamMultiAgent(userMessage: string): AsyncGenerator<SseEvent> {
  const AGENT_NODES = new Set(['coordinator','research','diagnostic','pharmacist','advisor']);

  for await (const event of graph.streamEvents(
    { userMessage, errors: [] },
    { version: 'v2' }
  )) {
    if (!AGENT_NODES.has(event.name)) continue;

    if (event.event === 'on_chain_start') {
      yield { type: 'agent_start', agent: event.name };
    }

    if (event.event === 'on_chain_end') {
      yield {
        type: 'agent_complete',
        agent: event.name,
        summary: extractSummary(event.name, event.data.output),
      };

      if (event.name === 'advisor') {
        yield { type: 'final_result', data: event.data.output.advisorResults };
      }
    }
  }
  yield { type: 'done' };
}
```

---

## 三、路由变更

路径保持 `/api/chat/workflow` 不变，内部替换为 SSE：

```typescript
router.post('/chat/workflow', async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: '消息不能为空' });

  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');

  try {
    for await (const event of streamMultiAgent(message)) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: '执行失败' })}\n\n`);
  } finally {
    res.end();
  }
});
```

---

## 四、前端重写

### 4.1 新增类型

```typescript
export type AgentName = 'coordinator' | 'research' | 'diagnostic' | 'pharmacist' | 'advisor';
export type AgentStatus = 'pending' | 'running' | 'done';

export interface AgentTraceItem {
  agent: AgentName;
  status: AgentStatus;
  summary?: string;
}

export interface FinalResult {
  summary: string;
  recommendedMedicines: Medicine[];
  precautions: string[];
  urgency: string;
  disclaimer: string;
}
```

### 4.2 SSE 客户端

```typescript
// 用 fetch + ReadableStream（支持 POST，EventSource 不支持）
export async function* streamWorkflow(message: string): AsyncGenerator<SseEvent> {
  const response = await fetch('/api/chat/workflow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value);
    const lines = buffer.split('\n\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('data: ')) yield JSON.parse(line.slice(6));
    }
  }
}
```

### 4.3 UI 结构

- **导航栏**：移除模式切换按钮，显示「🤖 Multi-Agent 模式」标签
- **执行轨迹面板**：消息发出后立即显示，每个 Agent 依次出现
- **最终结果卡片**：`final_result` 事件触发后渲染

```
┌─ Agent 执行过程 ──────────────────────────────────┐
│ ✅ Coordinator   问题分析完成 · 计划：诊断→药品→建议  │
│ ✅ Diagnostic    头痛、发烧 · 紧急程度：中等          │
│ ✅ Pharmacist    推荐 3 种药品                       │
│ ⏳ Advisor       生成综合建议中...                   │
└───────────────────────────────────────────────────┘

┌─ 综合建议 ────────────────────────────────────────┐
│ [summary 文字]                                     │
│ 💊 布洛芬缓释胶囊   [用法] [注意事项]                │
│ 💊 对乙酰氨基酚     [用法] [注意事项]                │
│ ⚠️ 注意事项列表                                     │
│ 📋 如症状持续请就医                                  │
└───────────────────────────────────────────────────┘
```

---

## 五、修复清单对照

| 编号 | 问题 | 修复位置 | 状态 |
|---|---|---|---|
| C1 | ResearchAgent 虚假 URL | `ResearchAgent.ts` | 已设计 |
| C2 | 多实例模型 + 日志泄漏 | `BaseAgent.ts` | 已设计 |
| C3 | `invokeJSON` 解析不健壮 | `BaseAgent.ts` | 已设计 |
| I1 | Coordinator 降级逻辑错误 | `CoordinatorAgent.ts` | 已设计 |
| I2 | urgency 与 AI 诊断脱节 | `DiagnosticAgent.ts` | 已设计 |
| I3 | IAgent 暴露底层类型 | `types.ts` | 已设计 |
| I4 | DiagnosticAgent 4 次串行 LLM | `DiagnosticAgent.ts` | 已设计 |
| I5 | completedAgents 竞态+死代码 | `types.ts` + 各 Agent | 已设计 |
| I6 | `invokeJSON<any>` | `PharmacistAgent` + `AdvisorAgent` | 已设计 |

---

## 六、性能预期

| 场景 | 重写前 | 重写后 |
|---|---|---|
| 简单问题（仅 Pharmacist）| ~8s（4步工作流） | ~5s |
| 中等问题（Diagnostic + Pharmacist）| ~12s | ~8s |
| 复杂问题（Research ∥ Diagnostic + Pharmacist）| ~20s（串行） | ~12s（并行） |
