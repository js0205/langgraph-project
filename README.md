# 🏥 多智能体医疗咨询系统

基于 **LangGraph.js** 的多智能体医疗咨询系统:5 个专业智能体协作，结合药品说明书 RAG 检索与 PubMed 文献检索，通过 SSE 流式返回症状分析、用药建议与健康咨询。

> ⚠️ 本项目为技术演示与学习用途，输出内容不构成医疗建议。详见文末[免责声明](#-免责声明)。

## 🌐 在线演示

- **前端：** https://frontend-duzoqjgye-js0205s-projects.vercel.app （Vercel）
- **后端 API：** https://langgraph-project-5dqx.onrender.com （Render，新加坡节点）

## 📋 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 · TypeScript · Vite 7 · Tailwind CSS · axios |
| 后端 | Node.js · Express 4 · TypeScript · tsx |
| AI 编排 | LangGraph.js 1.0 · @langchain/core · @langchain/community |
| LLM | Google Gemini（`gemini-2.5-flash`）|
| 检索 | PostgreSQL + pgvector（说明书 RAG）· PubMed E-utilities（文献）|
| 日志 / 测试 | pino · vitest |

> LLM 通过 `BaseAgent` 的共享模型实例注入，架构本身与具体模型解耦；替换其他 LLM 只需改动模型初始化，无需改各智能体逻辑。

## 🤖 多智能体架构

系统由 **5 个专业智能体** 协同工作，协调器按问题类型动态路由，最终由顾问汇总输出。

```mermaid
graph TB
    User[👤 用户输入] --> Coordinator[🎯 协调器<br/>CoordinatorAgent]

    Coordinator -->|路由决策| Diagnostic[🔍 诊断专家<br/>DiagnosticAgent]
    Coordinator -->|路由决策| Pharmacist[💊 药剂师<br/>PharmacistAgent]
    Coordinator -->|路由决策| Research[📚 研究员<br/>ResearchAgent]

    Diagnostic -->|诊断结果| Advisor[💡 顾问<br/>AdvisorAgent]
    Pharmacist -->|用药方案| Advisor
    Research -->|科研证据| Advisor

    Advisor -->|SSE 流式返回| Response[📝 返回用户]

    style Coordinator fill:#4a9eff,stroke:#2563eb,color:#fff
    style Diagnostic fill:#10b981,stroke:#059669,color:#fff
    style Pharmacist fill:#f59e0b,stroke:#d97706,color:#fff
    style Research fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style Advisor fill:#ec4899,stroke:#db2777,color:#fff
    style User fill:#6366f1,stroke:#4f46e5,color:#fff
    style Response fill:#06b6d4,stroke:#0891b2,color:#fff
```

| 智能体 | 职责 | 核心能力 |
|--------|------|----------|
| 🎯 **协调器** CoordinatorAgent | 分析意图，决定调用哪些专家 | 意图识别、路由决策 |
| 🔍 **诊断专家** DiagnosticAgent | 从描述中提取症状、推理可能疾病 | 症状分析、疾病推理 |
| 💊 **药剂师** PharmacistAgent | 基于 NMPA 说明书 RAG 检索给出用药建议 | pgvector 检索、安全检查、真实出处 |
| 📚 **研究员** ResearchAgent | 实时检索 PubMed，返回真实 PMID | 文献检索、证据支持、失败降级 |
| 💡 **顾问** AdvisorAgent | 汇总各专家产出，生成最终建议 | 信息整合、上下文管理 |

### 上下文管理

顾问汇总时不透传各智能体的原始产出，而是做**结构化投影**——只抽取关键字段（诊断结论、药名+适应症+用法、研究 `keyFindings`）拼装 prompt。同时设有**长度守卫**：超出上限时优先裁剪低优先级的研究摘要，保住诊断与用药信息，截断行为写入日志、绝不静默丢弃。每次请求记录上下文长度，便于按真实数据校准阈值。

## 🚀 快速开始

### 前置要求

- Node.js 20+（推荐 24）
- npm
- Google Gemini API Key
- （可选）PostgreSQL + pgvector，用于药剂师 RAG 检索

### 1. 后端环境变量

创建 `backend/.env`：

```bash
# LLM（对话与 embedding 共用，变量名 GOOGLE_API_KEY）
GOOGLE_API_KEY=your_gemini_api_key_here

# 服务器
PORT=3000
NODE_ENV=development

# 药剂师 RAG（可选）：Postgres 连接串，需启用 pgvector
DATABASE_URL=postgres://user:pass@host/db

# PubMed 检索（可选）：配置后提升调用限速
NCBI_API_KEY=
```

> 💡 药剂师 RAG 依赖 `DATABASE_URL`。未配置时该智能体安全降级为通用建议，不影响其余功能。首次使用需在库中执行 `CREATE EXTENSION IF NOT EXISTS vector;`，再运行 `npm run ingest` 灌入说明书数据。部署细节见 [docs/rag-deployment-guide.md](./docs/rag-deployment-guide.md)。

### 2. 前端环境变量（可选）

创建 `frontend/.env`：

```bash
VITE_API_URL=http://localhost:3000
```

### 3. 启动

```bash
# 后端 → http://localhost:3000
cd backend && npm install && npm run dev

# 前端 → http://localhost:5173
cd frontend && npm install && npm run dev
```

### 4. 灌入说明书数据（启用 RAG 时）

```bash
cd backend && npm run ingest
```

### 快速测试

前端界面或直接调用 API：

```bash
curl -N -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message":"我头疼发烧咳嗽，应该吃什么药？"}'
```

## 🔌 API

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/api/chat/stream` | 多智能体流式咨询，SSE 推送执行进度与最终结果 |
| `GET` | `/api/health` | 健康检查 |

**请求体：** `{ "message": string }`

**SSE 事件类型：**

| 事件 | 含义 |
|---|---|
| `agent_start` | 某智能体开始执行 |
| `agent_complete` | 某智能体完成，附一句话摘要 |
| `final_result` | 顾问生成的结构化最终建议 |
| `error` | 执行出错 |
| `done` | 流结束 |

## 📁 项目结构

```
langgraph-project/
├── backend/                       # Node + Express + LangGraph
│   ├── src/
│   │   ├── agents/                # 多智能体
│   │   │   ├── BaseAgent.ts        # 共享模型 + JSON/文本调用封装
│   │   │   ├── CoordinatorAgent.ts # 协调器
│   │   │   ├── DiagnosticAgent.ts  # 诊断专家
│   │   │   ├── PharmacistAgent.ts  # 药剂师（RAG）
│   │   │   ├── ResearchAgent.ts    # 研究员（PubMed）
│   │   │   ├── AdvisorAgent.ts     # 顾问（投影 + 长度守卫）
│   │   │   └── types.ts            # 共享状态与类型
│   │   ├── retrieval/
│   │   │   ├── pubmedClient.ts      # PubMed 文献检索
│   │   │   └── vectorStore.ts       # pgvector 向量库与说明书检索
│   │   ├── services/
│   │   │   ├── multiAgentService.ts # LangGraph 编排 + SSE
│   │   │   └── llmService.ts        # LLM 服务封装
│   │   ├── routes/chatRoutes.ts     # API 路由
│   │   └── index.ts                 # 服务入口
│   ├── scripts/ingest.ts            # 说明书入库（npm run ingest）
│   ├── data/drug-labels/            # NMPA 说明书种子数据
│   └── src/__tests__/               # vitest 单元测试
├── frontend/                        # React 19 + Vite + Tailwind
│   └── src/
│       ├── components/              # 聊天 / 药品信息 UI 组件
│       ├── services/                # api.ts · chatService.ts（SSE）
│       ├── types/                   # 类型定义
│       └── App.tsx
├── docs/                            # 部署指南 · 设计文档 · 计划
├── render.yaml                      # Render 部署配置
└── START.md                         # 快速启动指南
```

## ✨ 功能特性

**多智能体协作**
- LangGraph 状态编排：协调器动态路由 → 专家并行/串行执行 → 顾问汇总
- 结构化状态共享（`AgentState`），单轮请求相互隔离
- 顾问上下文投影 + 长度守卫，防止上下文膨胀

**AI 与检索**
- 症状分析与初步疾病推理
- 基于 NMPA 说明书的 pgvector RAG 用药建议（附真实出处，无库时降级）
- PubMed 实时文献检索（返回真实 PMID，失败自动降级）
- 顾问综合建议生成

**工程质量**
- vitest 单元测试覆盖各智能体与检索层
- pino 结构化日志
- 边界异常包裹与安全降级，不吞错误、不产生死局
- TypeScript 全链路类型安全

**交互体验**
- SSE 流式输出，实时展示各智能体执行进度
- 响应式聊天界面、示例问题快捷入口、后端连接检测

## 🗺️ 路线图

- [ ] 多轮对话记忆（引入会话历史，需配套滚动摘要与消息裁剪）
- [ ] 聊天历史持久化
- [ ] 用户认证与个人档案
- [ ] 检索缓存与性能监控
- [ ] 前端药品卡片可视化、语音输入、说明书图片识别

## 🎨 系统工作流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant F as 前端
    participant C as 协调器
    participant D as 诊断专家
    participant P as 药剂师
    participant R as 研究员
    participant A as 顾问

    U->>F: 输入问题
    F->>C: POST /api/chat/stream
    C->>C: 分析意图、决定路由

    alt 症状诊断
        C->>D: 分派任务
        D->>A: 返回诊断
    else 用药咨询
        C->>P: 分派任务（RAG 检索）
        P->>A: 返回用药建议
    else 科研查询
        C->>R: 分派任务（PubMed）
        R->>A: 返回研究证据
    else 综合咨询
        C->>D: 诊断分析
        C->>P: 用药建议
        C->>R: 科研支持
        D->>A: 诊断结果
        P->>A: 用药方案
        R->>A: 证据支持
    end

    A->>A: 投影汇总 + 长度守卫
    A-->>F: SSE 流式返回最终建议
    F->>U: 展示结果
```

## 🧪 测试

```bash
cd backend
npm test          # 运行全部单元测试
npm run test:watch # 监听模式
```

## 📖 文档

| 文档 | 描述 |
|------|------|
| [START.md](./START.md) | 快速启动指南 |
| [docs/rag-deployment-guide.md](./docs/rag-deployment-guide.md) | RAG 检索部署配置 |
| [docs/superpowers/specs/](./docs/superpowers/specs/) | 多智能体与 RAG 设计文档 |
| [docs/superpowers/plans/](./docs/superpowers/plans/) | 实施计划 |

## 💡 设计理念

**为什么用多智能体？** 专业分工让每个智能体聚焦单一领域、更易维护；协调器按问题类型动态编排，只调用必要的专家，兼顾质量与成本；新增能力只需加一个智能体，架构可扩展。

**关键取舍：** 采用单轮无状态设计，每次请求隔离，规避了多轮上下文膨胀；顾问汇总处以「投影 + 长度守卫」作为上下文管理防线，是本架构成本与稳定性的关键点。

## ⚠️ 免责声明

> 本应用提供的医疗信息仅供参考和教育目的，**不能替代专业医生的诊断和建议**。
>
> - ❌ 不要将系统建议作为医疗诊断依据
> - ❌ 不要根据系统建议自行用药
> - ✅ 任何健康问题请咨询专业医生
> - ✅ 用药前请咨询医生或药师

## 📄 许可证

ISC

## 🙏 致谢

- [LangGraph.js](https://github.com/langchain-ai/langgraphjs) · [LangChain.js](https://github.com/langchain-ai/langchainjs) · [React](https://react.dev/) · [Tailwind CSS](https://tailwindcss.com/)
