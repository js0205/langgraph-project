# RAG 检索增强改造设计

**日期**: 2026-07-05
**状态**: 已确认，待实施
**范围**: 后端 `backend/`

## 背景与目标

当前系统基于通用大模型（Gemini `gemini-2.5-flash`）构建医疗咨询多智能体，未训练专有医疗模型。已有工程手段（角色约束、结构化 JSON 输出、任务分解、免责声明、兜底降级）能抑制"跑题/发散/崩溃"类幻觉，但**无法解决内容级事实性幻觉**：

- `ResearchAgent` 凭模型参数记忆生成"医学摘要"，无真实检索，`references` 不可信。
- `PharmacistAgent` 凭记忆推荐药品/剂量，可能编造或过时。

**目标**：为这两个 Agent 引入真实检索（RAG），做到"先查资料 → 基于原文回答 → 给真实出处"，把它们从"话术编排"升级为"有据可依"。其余 3 个 Agent 不动。

**明确不做**：微调专有医疗模型（事实性缺失属知识问题而非能力问题，RAG 是正确解，且可溯源、可更新、成本低、风险可控）。

## 数据源决策

| 数据源 | 可获取性 | 采用方式 |
|--------|---------|---------|
| PubMed | 官方 E-utilities API，免费 | Research Agent 实时检索，天然带 PMID/DOI 出处 |
| NMPA 说明书库 | 无干净公开 API | 离线收集种子文档 → 切块入库 → 向量检索 |
| 中国药典 | 有版权、不公开 | 放弃，用说明书覆盖 |

## 整体架构

两条独立、解耦、可降级的检索链：

```
                    ┌─ Research Agent ──→ PubMed E-utilities (实时 API)
Coordinator 路由 ───┤                     查文献摘要 → 喂原文 → references 填真实 PMID/URL
                    └─ Pharmacist Agent ─→ pgvector 检索 (Neon)
                                          查 NMPA 说明书切块 → 喂原文 → 给药名+来源
```

- PubMed 走实时 HTTP，不入库（文献要新）。
- NMPA 说明书走离线预灌 + pgvector 检索（药品信息稳、要准）。
- **任一检索失败 → 回退到纯 LLM 生成 + 明确标注"未检索到资料"**，复用现有 catch 兜底逻辑，绝不崩。

### 新增模块（为可迁移性留接缝）

| 模块 | 职责 | 独立理由 |
|------|------|---------|
| `retrieval/vectorStore.ts` | 向量库工厂，唯一创建 `PGVectorStore` 的地方 | 换库只改这一个文件 |
| `retrieval/pubmedClient.ts` | 封装 PubMed E-utilities 调用 | Research Agent 只依赖接口 |
| `scripts/ingest.ts` | 离线入库脚本：文档→切块→embedding→pgvector | 可重跑，换库/换 embedding 时重灌 |

## 向量库选型

- **Neon（托管 Serverless Postgres）+ pgvector**，免费档不过期。
- 医疗系统本质是"业务数据 + 少量向量"，pgvector 统一存储优于专用向量库；专用库（Qdrant 等）留到千万级向量再说。
- **embedding**：Gemini `text-embedding-004`（768 维），复用现有 `GOOGLE_API_KEY`，免费额度内。

### 可迁移性保障（三条铁律）

1. 创建向量库的代码只出现在 `retrieval/vectorStore.ts` 工厂函数，不散落到 Agent。
2. 保留原始文档 + 入库脚本，随时可重跑"文档→切块→embedding→入库"。
3. embedding 模型不中途更换（维度绑定；换模型必须重算全部向量）。

迁移代价：Neon 免费→付费为零改动；换专用库仅改工厂一行 + 重灌数据。

## 数据组织与入库

### 种子数据
- 手工/半自动收集 **30-50 份高频 OTC 药品说明书**（布洛芬、对乙酰氨基酚、蒙脱石散、氯雷他定等）。
- 存放：`backend/data/drug-labels/*.txt`，每份一个药，原始文档保留。
- 不做实时爬取（NMPA 反爬、结构乱；药品信息变动慢，离线整理质量可控）。

### 切块策略
按说明书天然小节切（适应症 / 用法用量 / 禁忌 / 不良反应 / 相互作用），不按固定字数切，保证块语义完整。

```
每个 chunk = { 药名, 小节标题, 小节正文 }
```

### pgvector 表结构

| 字段 | 内容 | 用途 |
|------|------|------|
| `content` | 小节正文 | 喂给模型的原文 |
| `embedding` | vector(768) | Gemini text-embedding-004 |
| `metadata` | `{ drugName, section, source, sourceUrl }` | 溯源 + 未来按药名/类别过滤 |

### 入库脚本 `scripts/ingest.ts`
```
读取 data/drug-labels/*.txt → 按小节切块 → Gemini 批量向量化 → PGVectorStore.addDocuments()
```
- 幂等：重跑前按 `drugName` 清旧记录再插。
- 独立运行 `npm run ingest`，不影响线上服务。

## Agent 改造

### PharmacistAgent（纯生成 → 检索增强）
```
execute():
  1. buildQuery(state)                              // 复用现有 buildContext 思路
  2. chunks = vectorStore.similaritySearch(query, k=4)   // 新增检索
  3. chunks 为空 → 降级：纯生成 + warnings 加"未检索到说明书，以下为通用建议"
  4. 有 chunks → 新 prompt 注入原文 + metadata
```
prompt 从"你来推荐"改为"只能基于以下检索到的真实资料回答，资料里没有的药品/剂量绝对不要编造；每条推荐标注来源（药名+小节）；资料不足则明说'建议咨询医生'"。
`references` 填 `metadata.source / sourceUrl`（真实出处）。

### ResearchAgent（凭记忆 → PubMed 实时检索）
```
execute():
  1. query = buildQuery(state)                      // 复用现有逻辑
  2. articles = pubmedClient.search(query, retmax=5) // esearch 拿 PMID → esummary/efetch 拿标题+摘要
  3. 失败/无结果 → 降级：纯生成 + label "[AI知识摘要-未检索]"
  4. 有结果 → prompt 把真实摘要喂入，提炼 keyFindings
```
输出变化：
- `label`: `"[AI知识摘要]"` → `"[PubMed]"`
- 每条带真实 PMID 与 URL：`https://pubmed.ncbi.nlm.nih.gov/{PMID}/`
- `relevance` 用 PubMed 排序位次映射，不再由模型编造。

### 共同降级铁律
检索层任何异常不向上抛，降级 + 明确标注数据来源等级（查来的 vs 猜的）。现有 `catch` 兜底结构原样保留，仅补"降级标注"。

## 测试策略（TDD）

重点测边界与降级，不测模型输出内容。mock 掉真实 API/DB，沿用现有 `__tests__/*.test.ts` mock 模式。

| 模块 | 关键用例 |
|------|---------|
| `pubmedClient` | 正常解析 / 空结果 / 超时·500 抛可捕获错误 |
| `vectorStore` 工厂 | 创建成功、检索接口签名正确 |
| `PharmacistAgent` | 有结果→prompt 含原文；空→降级且 warnings 含提示；抛错→不崩返回兜底 |
| `ResearchAgent` | 有文献→label=[PubMed] 带真实 PMID；无结果→降级标注；超时→兜底 |

RED→GREEN：先为"检索失败降级"写测试（必失败）→ 再实现。

## 配置

```
DATABASE_URL=          # Neon Postgres 连接串（含 pgvector）
# GOOGLE_API_KEY 已有，embedding 复用
# PubMed E-utilities 免费无需 key（可选 NCBI_API_KEY 提高限速）
```
同步更新 `.env.example`。

## 交付范围清单

**新增**：`retrieval/vectorStore.ts`、`retrieval/pubmedClient.ts`、`scripts/ingest.ts`、`data/drug-labels/`（30-50 份种子）、对应单测。

**修改**：`PharmacistAgent.ts`、`ResearchAgent.ts`（仅 execute 检索逻辑 + prompt）、`types.ts`（references/findings 加 sourceUrl 字段）、`.env.example`、`package.json`（加 ingest 脚本 + pgvector 依赖）。

**不动**：Coordinator / Diagnostic / Advisor、前端、部署配置、其余后端。

**新增依赖**：`pg`、`@langchain/community`（PGVectorStore）；embedding 复用 `@langchain/google-genai`。
