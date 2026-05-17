# 多智能体架构设计文档

**日期**：2026-05-18
**状态**：已确认，待实现
**范围**：替换现有 `/api/chat/workflow` 单模型工作流，改造为生产级多智能体编排系统

---

## 背景

当前 `workflowService.ts` 使用单个 Gemini 模型顺序执行 4 个节点（意图识别 → 症状分析 → 药品查询 → 建议生成）。项目已预置 5 个 Agent 类（`CoordinatorAgent`、`DiagnosticAgent`、`ResearchAgent`、`PharmacistAgent`、`AdvisorAgent`），但均未接入路由层。

本次改造目标：
- 将预置 Agent 类接入 LangGraph StateGraph
- 不同 Agent 使用不同模型（差异化配置）
- 支持 SSE 流式输出，前端实时展示各 Agent 执行进度
- 提示词从代码中抽离，统一管理

---

## 架构设计

### 整体结构

```
前端 (SSE)
    ↓
POST /api/chat/workflow
    ↓
MultiAgentOrchestrator（新增）
    ↓
LangGraph StateGraph
    ├── CoordinatorAgent  ← 入口节点，分析问题，制定执行计划
    ├── DiagnosticAgent   ← 症状诊断（有症状描述时触发）
    ├── ResearchAgent     ← 医学文献研究（复杂问题/药物交互时触发）
    ├── PharmacistAgent   ← 药品查询与推荐（几乎必触发）
    └── AdvisorAgent      ← 最终建议生成（必触发，最后执行）
```

### 模型差异化配置

| Agent | 模型 | 理由 |
|---|---|---|
| CoordinatorAgent | `gemini-2.0-flash-exp` | 路由决策，速度优先 |
| DiagnosticAgent | `gemini-2.5-pro` | 医学推理，准确性优先 |
| ResearchAgent | `gemini-2.5-pro` | 深度分析，能力优先 |
| PharmacistAgent | `gemini-2.0-flash-exp` | 结构化查询，速度优先 |
| AdvisorAgent | `gemini-2.5-pro` | 最终输出，质量优先 |

模型名称集中配置在 `backend/src/config/models.ts`，避免散落在各 Agent 中。

---

## 状态设计

```typescript
interface MultiAgentState {
  userMessage: string;
  coordinatorDecision: {
    needsResearch: boolean;
    needsDiagnostic: boolean;
    needsPharmacist: boolean;
    complexity: 'simple' | 'medium' | 'complex';
    plan: string[];
    reasoning: string;
  } | null;
  symptoms: string[];
  diagnosis: {
    possibleConditions: string[];
    severity: 'mild' | 'moderate' | 'severe';
    needsDoctor: boolean;
    analysis: string;
  } | null;
  researchData: {
    interactions: string[];
    warnings: string[];
    references: string[];
  } | null;
  medicines: {
    name: string;
    type: string;
    indication: string;
    usage: string;
  }[];
  finalAdvice: string;
  completedAgents: string[];
  currentAgent: string;
  errors: string[];
}
```

---

## 流式输出设计

### SSE 事件类型

```
// Agent 开始执行
data: {"type":"agent_start","agent":"coordinator","message":"正在分析问题..."}

// Agent 执行完成
data: {"type":"agent_done","agent":"coordinator"}

// 最终建议逐字流式输出
data: {"type":"agent_output","agent":"advisor","chunk":"根据您的症状..."}

// 全部完成，携带结构化数据
data: {"type":"done","medicines":[...],"symptoms":[...],"diagnosis":{...}}

// 某 Agent 发生错误（不中断流程）
data: {"type":"agent_error","agent":"research","message":"文献查询超时，已跳过"}
```

### 前端接收方式

使用 `fetch` + `ReadableStream` 接收 SSE（兼容性优于 `EventSource`，支持 POST）：

```typescript
const response = await fetch('/api/chat/workflow', { method: 'POST', body: ... });
const reader = response.body.getReader();
// 逐行解析 data: {...} 格式
```

---

## 提示词管理

**目录结构**

```
backend/src/prompts/
├── coordinator.ts    # CoordinatorAgent 提示词
├── diagnostic.ts     # DiagnosticAgent 提示词
├── research.ts       # ResearchAgent 提示词
├── pharmacist.ts     # PharmacistAgent 提示词
└── advisor.ts        # AdvisorAgent 提示词
```

**文件规范**

每个提示词文件顶部标注版本和日期，支持变量插值函数：

```typescript
// version: 1.0.0 | updated: 2026-05-18
export const coordinatorPrompt = (userMessage: string) => `...${userMessage}...`;
```

---

## 错误处理策略

### Agent 级容错

每个 Agent 独立捕获异常，失败不中断整体流程：

| Agent 失败 | 降级策略 |
|---|---|
| DiagnosticAgent | 跳过，symptoms 保持空数组 |
| ResearchAgent | 跳过，researchData 为 null |
| PharmacistAgent | 跳过，medicines 为空，AdvisorAgent 使用兜底提示词 |
| AdvisorAgent | 返回固定兜底文案，建议用户就医 |

### 超时控制

通过 `Promise.race` 实现每个 Agent 独立超时：

| 模型类型 | 超时时间 |
|---|---|
| Flash 模型 | 10 秒 |
| Pro 模型 | 30 秒 |

### 错误透传

`state.errors[]` 收集所有 Agent 的错误信息，随 `done` 事件一并返回前端，便于调试和监控。

---

## 文件改动范围

### 新增文件

```
backend/src/prompts/           # 提示词目录（全新）
backend/src/config/models.ts   # 模型配置集中管理（全新）
backend/src/services/multiAgentService.ts  # 替换 workflowService（全新）
```

### 修改文件

```
backend/src/agents/BaseAgent.ts       # 增加模型参数注入支持
backend/src/agents/CoordinatorAgent.ts # 接入新 prompt 文件
backend/src/agents/DiagnosticAgent.ts  # 接入新 prompt 文件
backend/src/agents/ResearchAgent.ts    # 接入新 prompt 文件
backend/src/agents/PharmacistAgent.ts  # 接入新 prompt 文件
backend/src/agents/AdvisorAgent.ts     # 接入新 prompt 文件
backend/src/routes/chatRoutes.ts       # /workflow 改为 SSE 响应
```

### 删除/废弃

```
backend/src/services/workflowService.ts  # 废弃，由 multiAgentService 替代
```

### 不改动

```
backend/src/services/llmService.ts   # 保持不变
backend/src/routes/chatRoutes.ts     # /api/chat 接口保持不变
frontend/                            # 仅改请求解析方式，结构不变
```

---

## 不在本次范围内

- Agent 并行执行（当前顺序执行，后续可扩展）
- 持久化对话历史到数据库
- Agent 执行结果缓存
- 监控与可观测性接入（Langfuse 等）
