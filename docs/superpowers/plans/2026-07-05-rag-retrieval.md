# RAG 检索增强改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 ResearchAgent（接 PubMed 实时检索）和 PharmacistAgent（接 pgvector 药品说明书检索）引入真实 RAG，做到"先查资料 → 基于原文回答 → 给真实出处"，检索失败时优雅降级。

**Architecture:** 两条解耦的检索链。ResearchAgent 走 PubMed E-utilities 实时 HTTP；PharmacistAgent 走 Neon Postgres + pgvector 向量检索（离线预灌 NMPA 说明书）。检索层封装在独立模块，任一失败回退纯 LLM 生成 + 明确标注。其余 3 个 Agent 不动。

**Tech Stack:** TypeScript (ESM, tsx 运行), Vitest, LangChain.js, `@langchain/community` PGVectorStore, Gemini `text-embedding-004`, PubMed E-utilities API。

## Global Constraints

- 运行时：Node ≥ 20，ESM，用 `tsx` 直接跑 `.ts`，无编译步骤。
- 测试：Vitest（`npm test` = `vitest run`）。mock 外部依赖用 `vi.spyOn` / `vi.stubGlobal`，单测不依赖真实网络与数据库。
- 现有 mock 模式：`vi.spyOn(sharedModel, 'invoke').mockResolvedValueOnce({ content: JSON.stringify(...) } as any)`，`afterEach(() => vi.restoreAllMocks())`。
- embedding 模型固定 `text-embedding-004`（768 维），不中途更换。
- 容灾铁律：所有边界调用（HTTP、DB）用 try-catch 全包裹，异常不向上抛，降级 + 结构化日志。
- 最小改动：只碰 ResearchAgent、PharmacistAgent、types.ts、新增文件；不动 Coordinator/Diagnostic/Advisor、前端、部署配置。
- 提交信息中文，不含 "Claude" / "Generated with" 标记。
- 所有 Markdown/目录 kebab-case。

---

## File Structure

- `backend/src/agents/types.ts` — 修改：扩展 `ResearchFinding`、`PharmacistResult` 字段以承载真实出处。
- `backend/src/retrieval/pubmedClient.ts` — 新增：封装 PubMed E-utilities，导出 `searchArticles`。
- `backend/src/retrieval/vectorStore.ts` — 新增：向量库工厂 + 药品说明书检索，唯一创建 PGVectorStore 处。
- `backend/src/agents/ResearchAgent.ts` — 修改：`execute` 内接 PubMed 检索 + 降级。
- `backend/src/agents/PharmacistAgent.ts` — 修改：`execute` 内接 pgvector 检索 + 降级。
- `backend/scripts/ingest.ts` — 新增：离线入库脚本。
- `backend/data/drug-labels/*.txt` — 新增：种子说明书。
- `backend/src/__tests__/pubmedClient.test.ts`、`vectorStore.test.ts` — 新增测试。
- `backend/src/__tests__/ResearchAgent.test.ts`、`PharmacistAgent.test.ts` — 修改测试。
- `backend/.env.example`、`backend/package.json` — 修改配置。

---

### Task 1: 扩展类型契约（types.ts）

**Files:**
- Modify: `backend/src/agents/types.ts`

**Interfaces:**
- Produces:
  - `ResearchFinding` 新增可选 `pmid?: string; url?: string`，`label` 联合类型扩为 `'[PubMed]' | '[AI知识摘要-未检索]' | '[AI知识摘要]'`。
  - `PharmacistResult` 新增可选 `sources?: string[]`（真实出处，如 "NMPA说明书:布洛芬-用法用量"）。

- [ ] **Step 1: 修改 `ResearchFinding` 与 `PharmacistResult`**

将 `types.ts` 中 `ResearchFinding` 替换为：

```typescript
export interface ResearchFinding {
  title: string;
  summary: string;
  relevance: number;
  label: '[PubMed]' | '[AI知识摘要-未检索]' | '[AI知识摘要]';
  pmid?: string;
  url?: string;
}
```

将 `PharmacistResult` 替换为：

```typescript
export interface PharmacistResult {
  medicines: Medicine[];
  warnings: string[];
  sources?: string[];
}
```

- [ ] **Step 2: 类型检查通过**

Run: `cd backend && npx tsc --noEmit`
Expected: 无报错（新增均为可选字段，现有代码不受影响）

- [ ] **Step 3: Commit**

```bash
cd backend && git add src/agents/types.ts
git commit -m "feat(types): 扩展 findings/pharmacist 类型以承载真实检索出处"
```

---

### Task 2: PubMed 客户端（pubmedClient.ts）

**Files:**
- Create: `backend/src/retrieval/pubmedClient.ts`
- Test: `backend/src/__tests__/pubmedClient.test.ts`

**Interfaces:**
- Produces:
  - `interface PubmedArticle { pmid: string; title: string; url: string; }`
  - `async function searchArticles(query: string, retmax?: number): Promise<PubmedArticle[]>`
    - 两步：esearch(json) 拿 PMID 列表 → esummary(json) 拿标题。
    - 无结果返回 `[]`；HTTP/解析异常向上抛（由调用方 catch 降级）。

- [ ] **Step 1: Write the failing test**

创建 `backend/src/__tests__/pubmedClient.test.ts`：

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchArticles } from '../retrieval/pubmedClient';

afterEach(() => vi.restoreAllMocks());

const esearchResp = { esearchresult: { idlist: ['111', '222'] } };
const esummaryResp = {
  result: {
    uids: ['111', '222'],
    '111': { title: '布洛芬安全性研究' },
    '222': { title: '阿司匹林相互作用综述' },
  },
};

function mockFetchSequence(...jsons: unknown[]) {
  const fn = vi.fn();
  jsons.forEach((j) => fn.mockResolvedValueOnce({ ok: true, json: async () => j }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('searchArticles', () => {
  it('正常：返回带真实 pmid 和 url 的文章列表', async () => {
    mockFetchSequence(esearchResp, esummaryResp);
    const articles = await searchArticles('布洛芬', 2);
    expect(articles).toHaveLength(2);
    expect(articles[0]).toEqual({
      pmid: '111',
      title: '布洛芬安全性研究',
      url: 'https://pubmed.ncbi.nlm.nih.gov/111/',
    });
  });

  it('无结果：esearch 返回空 idlist 时得到空数组，不再发第二次请求', async () => {
    const fn = mockFetchSequence({ esearchresult: { idlist: [] } });
    const articles = await searchArticles('不存在的词');
    expect(articles).toEqual([]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('HTTP 失败：fetch reject 时抛出错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('network')));
    await expect(searchArticles('布洛芬')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/__tests__/pubmedClient.test.ts`
Expected: FAIL —— 无法解析 `../retrieval/pubmedClient`

- [ ] **Step 3: Write minimal implementation**

创建 `backend/src/retrieval/pubmedClient.ts`：

```typescript
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

export interface PubmedArticle {
  pmid: string;
  title: string;
  url: string;
}

/**
 * 检索 PubMed 文献，返回真实 PMID 与标题。
 * @param query 检索词
 * @param retmax 最大返回条数，默认 5
 * @returns 文章列表；无结果返回空数组。HTTP/解析异常向上抛，由调用方降级。
 */
export async function searchArticles(query: string, retmax = 5): Promise<PubmedArticle[]> {
  const key = process.env.NCBI_API_KEY ? `&api_key=${process.env.NCBI_API_KEY}` : '';

  const esearchUrl =
    `${BASE}/esearch.fcgi?db=pubmed&retmode=json&retmax=${retmax}` +
    `&term=${encodeURIComponent(query)}${key}`;
  const searchRes = await fetch(esearchUrl);
  if (!searchRes.ok) throw new Error(`PubMed esearch HTTP ${searchRes.status}`);
  const searchJson: any = await searchRes.json();
  const ids: string[] = searchJson?.esearchresult?.idlist ?? [];
  if (ids.length === 0) return [];

  const esummaryUrl =
    `${BASE}/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}${key}`;
  const sumRes = await fetch(esummaryUrl);
  if (!sumRes.ok) throw new Error(`PubMed esummary HTTP ${sumRes.status}`);
  const sumJson: any = await sumRes.json();
  const result = sumJson?.result ?? {};

  const articles = ids.map((pmid) => ({
    pmid,
    title: result[pmid]?.title ?? '(无标题)',
    url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
  }));
  logger.info({ query, count: articles.length }, 'PubMed 检索完成');
  return articles;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/__tests__/pubmedClient.test.ts`
Expected: PASS（3 个用例全绿）

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/retrieval/pubmedClient.ts src/__tests__/pubmedClient.test.ts
git commit -m "feat(retrieval): 新增 PubMed 客户端，返回真实 PMID 出处"
```

---

### Task 3: ResearchAgent 接入 PubMed 检索

**Files:**
- Modify: `backend/src/agents/ResearchAgent.ts`
- Test: `backend/src/__tests__/ResearchAgent.test.ts`

**Interfaces:**
- Consumes: `searchArticles`（Task 2）、`ResearchFinding`（Task 1）。
- Produces: `execute` 行为——检索成功时 findings 的 `label` 为 `'[PubMed]'` 且带真实 `pmid`/`url`；检索无结果/失败时降级为纯 LLM 生成，label 为 `'[AI知识摘要-未检索]'`。

- [ ] **Step 1: Write the failing test（改写现有测试 + 新增检索用例）**

将 `backend/src/__tests__/ResearchAgent.test.ts` 整体替换为：

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { sharedModel } from '../agents/BaseAgent';
import { ResearchAgent } from '../agents/ResearchAgent';
import * as pubmed from '../retrieval/pubmedClient';

afterEach(() => vi.restoreAllMocks());

const llmKeyFindings = { keyFindings: ['布洛芬与阿司匹林有出血风险'] };

describe('ResearchAgent', () => {
  it('检索成功：findings 带真实 PMID，label 为 [PubMed]', async () => {
    vi.spyOn(pubmed, 'searchArticles').mockResolvedValueOnce([
      { pmid: '111', title: '布洛芬安全性研究', url: 'https://pubmed.ncbi.nlm.nih.gov/111/' },
    ]);
    vi.spyOn(sharedModel, 'invoke').mockResolvedValueOnce({
      content: JSON.stringify(llmKeyFindings),
    } as any);

    const agent = new ResearchAgent();
    const result = await agent.execute({ userMessage: '布洛芬和阿司匹林能一起吃吗', errors: [] });

    const finding = result.researchResults?.findings[0];
    expect(finding?.label).toBe('[PubMed]');
    expect(finding?.pmid).toBe('111');
    expect(finding?.url).toBe('https://pubmed.ncbi.nlm.nih.gov/111/');
    expect(result.errors).toHaveLength(0);
  });

  it('检索无结果：降级为纯生成，label 为 [AI知识摘要-未检索]', async () => {
    vi.spyOn(pubmed, 'searchArticles').mockResolvedValueOnce([]);
    vi.spyOn(sharedModel, 'invoke').mockResolvedValueOnce({
      content: JSON.stringify({
        findings: [{ title: 'x', summary: 'y', relevance: 80 }],
        keyFindings: ['结论'],
      }),
    } as any);

    const agent = new ResearchAgent();
    const result = await agent.execute({ userMessage: '罕见病', errors: [] });

    expect(result.researchResults?.findings[0]?.label).toBe('[AI知识摘要-未检索]');
    expect(result.errors).toHaveLength(0);
  });

  it('检索抛错：不崩溃，返回兜底且 errors 长度为 1', async () => {
    vi.spyOn(pubmed, 'searchArticles').mockRejectedValueOnce(new Error('network'));

    const agent = new ResearchAgent();
    const result = await agent.execute({ userMessage: '测试', errors: [] });

    expect(result.researchResults?.findings).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/__tests__/ResearchAgent.test.ts`
Expected: FAIL —— 现有实现无 `[PubMed]` label、未调用 `searchArticles`

- [ ] **Step 3: Write implementation**

将 `backend/src/agents/ResearchAgent.ts` 整体替换为：

```typescript
import { BaseAgent } from './BaseAgent';
import { AgentState, ResearchResult, ResearchFinding } from './types';
import { searchArticles, PubmedArticle } from '../retrieval/pubmedClient';

export class ResearchAgent extends BaseAgent {
  constructor() {
    super('Research', '医学知识研究');
  }

  async execute(state: AgentState): Promise<Partial<AgentState>> {
    this.log('开始医学知识研究...');
    const query = this.buildQuery(state);

    try {
      const articles = await searchArticles(query, 5);

      if (articles.length === 0) {
        this.log('PubMed 无结果，降级为纯生成');
        const fallback = await this.generateFromMemory(query);
        return { researchResults: fallback, errors: [] };
      }

      const keyFindings = await this.summarize(query, articles);
      const findings: ResearchFinding[] = articles.map((a, i) => ({
        title: a.title,
        summary: a.title,
        relevance: Math.max(50, 95 - i * 10),
        label: '[PubMed]',
        pmid: a.pmid,
        url: a.url,
      }));

      this.log(`研究完成，获取 ${findings.length} 条 PubMed 文献`);
      return {
        researchResults: { query, findings, keyFindings, timestamp: new Date().toISOString() },
        errors: [],
      };
    } catch (error) {
      this.logError('研究失败', error);
      return {
        researchResults: {
          query,
          findings: [],
          keyFindings: ['研究失败，建议咨询专业医生'],
          timestamp: new Date().toISOString(),
        },
        errors: [...state.errors, String(error)],
      };
    }
  }

  private buildQuery(state: AgentState): string {
    const conditions = state.diagnosticResults?.possibleConditions;
    if (conditions && conditions.length > 0) return conditions[0].name;
    const symptoms = state.diagnosticResults?.symptoms;
    if (symptoms && symptoms.length > 0) return symptoms.join(' ');
    return state.userMessage;
  }

  /** 基于检索到的真实文献标题提炼关键结论 */
  private async summarize(query: string, articles: PubmedArticle[]): Promise<string[]> {
    const list = articles.map((a, i) => `${i + 1}. ${a.title} (PMID:${a.pmid})`).join('\n');
    const prompt = `你是医学知识助手。以下是从 PubMed 检索到的真实文献标题：

研究主题：${query}
${list}

请仅基于这些文献主题，提炼 3-5 条与主题最相关的关键结论。只返回以下 JSON：
{ "keyFindings": ["结论1", "结论2", "结论3"] }`;
    const { keyFindings } = await this.invokeJSON<{ keyFindings: string[] }>(prompt);
    return keyFindings;
  }

  /** 检索无结果时的降级：纯模型记忆生成，明确标注未检索 */
  private async generateFromMemory(query: string): Promise<ResearchResult> {
    const prompt = `你是医学知识助手。请基于你的知识，针对主题提供摘要。
注意：不要生成 URL 或引用不存在的文献。

研究主题：${query}

只返回以下 JSON：
{
  "findings": [{ "title": "知识点标题", "summary": "100字内摘要", "relevance": 80 }],
  "keyFindings": ["结论1", "结论2", "结论3"]
}`;
    const raw = await this.invokeJSON<{
      findings: Array<{ title: string; summary: string; relevance: number }>;
      keyFindings: string[];
    }>(prompt);
    const findings: ResearchFinding[] = (raw.findings ?? []).map((f) => ({
      ...f,
      label: '[AI知识摘要-未检索]',
    }));
    return { query, findings, keyFindings: raw.keyFindings ?? [], timestamp: new Date().toISOString() };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/__tests__/ResearchAgent.test.ts`
Expected: PASS（3 个用例全绿）

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/agents/ResearchAgent.ts src/__tests__/ResearchAgent.test.ts
git commit -m "feat(research): 接入 PubMed 实时检索，findings 带真实 PMID 出处"
```

---

### Task 4: 向量库工厂与药品说明书检索（vectorStore.ts）

**Files:**
- Create: `backend/src/retrieval/vectorStore.ts`
- Test: `backend/src/__tests__/vectorStore.test.ts`
- Modify: `backend/package.json`（新增依赖）

**Interfaces:**
- Produces:
  - `interface DrugChunk { content: string; drugName: string; section: string; source: string; }`
  - `async function getVectorStore(): Promise<PGVectorStore>` —— 唯一创建 PGVectorStore 处，读 `DATABASE_URL`、用 `GoogleGenerativeAIEmbeddings({ model: 'text-embedding-004' })`。
  - `async function searchDrugLabels(query: string, k?: number): Promise<DrugChunk[]>` —— 检索说明书切块；异常向上抛。

- [ ] **Step 1: 安装依赖**

Run:
```bash
cd backend && npm install @langchain/community pg
```
Expected: `package.json` dependencies 出现 `@langchain/community` 与 `pg`

- [ ] **Step 2: Write the failing test**

创建 `backend/src/__tests__/vectorStore.test.ts`：

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); });

describe('searchDrugLabels', () => {
  it('把向量库返回的 Document 映射为 DrugChunk', async () => {
    const fakeStore = {
      similaritySearch: vi.fn().mockResolvedValueOnce([
        {
          pageContent: '成人一次1粒，一日2次',
          metadata: { drugName: '布洛芬', section: '用法用量', source: 'NMPA说明书' },
        },
      ]),
    };
    vi.doMock('../retrieval/vectorStore', async (importOriginal) => {
      const mod: any = await importOriginal();
      return { ...mod, getVectorStore: vi.fn().mockResolvedValue(fakeStore) };
    });

    const { searchDrugLabels } = await import('../retrieval/vectorStore');
    const chunks = await searchDrugLabels('头痛吃什么', 4);

    expect(fakeStore.similaritySearch).toHaveBeenCalledWith('头痛吃什么', 4);
    expect(chunks[0]).toEqual({
      content: '成人一次1粒，一日2次',
      drugName: '布洛芬',
      section: '用法用量',
      source: 'NMPA说明书',
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npx vitest run src/__tests__/vectorStore.test.ts`
Expected: FAIL —— 无法解析 `../retrieval/vectorStore`

- [ ] **Step 4: Write implementation**

创建 `backend/src/retrieval/vectorStore.ts`：

```typescript
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

export interface DrugChunk {
  content: string;
  drugName: string;
  section: string;
  source: string;
}

export const COLLECTION = 'drug_labels';

/** 唯一创建 PGVectorStore 的地方。换向量库只改此函数。 */
export async function getVectorStore(): Promise<PGVectorStore> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL 未配置');
  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GOOGLE_API_KEY,
    model: 'text-embedding-004',
  });
  return PGVectorStore.initialize(embeddings, {
    postgresConnectionOptions: { connectionString: process.env.DATABASE_URL },
    tableName: COLLECTION,
    columns: { idColumnName: 'id', vectorColumnName: 'vector', contentColumnName: 'content', metadataColumnName: 'metadata' },
  });
}

/** 检索药品说明书切块。异常向上抛，由调用方降级。 */
export async function searchDrugLabels(query: string, k = 4): Promise<DrugChunk[]> {
  const store = await getVectorStore();
  const docs = await store.similaritySearch(query, k);
  logger.info({ query, count: docs.length }, '药品说明书检索完成');
  return docs.map((d) => ({
    content: d.pageContent,
    drugName: (d.metadata?.drugName as string) ?? '未知',
    section: (d.metadata?.section as string) ?? '',
    source: (d.metadata?.source as string) ?? 'NMPA说明书',
  }));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx vitest run src/__tests__/vectorStore.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd backend && git add src/retrieval/vectorStore.ts src/__tests__/vectorStore.test.ts package.json package-lock.json
git commit -m "feat(retrieval): 新增 pgvector 向量库工厂与说明书检索"
```

---

### Task 5: 离线入库脚本与种子数据（ingest.ts）

**Files:**
- Create: `backend/scripts/ingest.ts`
- Create: `backend/data/drug-labels/ibuprofen.txt`（示范格式，其余药同构手工补充）
- Modify: `backend/package.json`（新增 `ingest` 脚本）
- Modify: `backend/.env.example`

**Interfaces:**
- Consumes: `getVectorStore`、`COLLECTION`（Task 4）。
- Produces: `npm run ingest` 命令；说明书文本格式约定（`# 药名` 开头，`## 小节名` 分节）。

- [ ] **Step 1: 创建种子说明书示范文件**

创建 `backend/data/drug-labels/ibuprofen.txt`：

```
# 布洛芬缓释胶囊

## 适应症
用于缓解轻至中度疼痛，如头痛、关节痛、偏头痛、牙痛、肌肉痛、神经痛、痛经。也用于普通感冒或流行性感冒引起的发热。

## 用法用量
成人：一次1粒（0.3g），一日2次（早晚各一次）。饭后服用。

## 禁忌
对本品及其他非甾体抗炎药过敏者禁用。活动性消化道溃疡患者禁用。孕妇及哺乳期妇女禁用。

## 不良反应
可见消化不良、胃烧灼感、胃痛、恶心、呕吐。少见胃肠道出血、皮疹、支气管痉挛。

## 药物相互作用
与阿司匹林或其他非甾体抗炎药同用会增加胃肠道出血风险。与抗凝药（如华法林）同用可能增加出血倾向。
```

> 实施者需再手工补充 30-50 份高频 OTC 说明书（对乙酰氨基酚、蒙脱石散、氯雷他定等），格式同上。

- [ ] **Step 2: 编写入库脚本**

创建 `backend/scripts/ingest.ts`：

```typescript
import fs from 'node:fs';
import path from 'node:path';
import { Document } from '@langchain/core/documents';
import { getVectorStore } from '../src/retrieval/vectorStore';
import dotenv from 'dotenv';

dotenv.config();

const DATA_DIR = path.resolve(__dirname, '../data/drug-labels');

/** 按 "## 小节" 切块，每块携带药名与小节名 metadata */
function parseLabel(text: string): Document[] {
  const lines = text.split('\n');
  const drugName = (lines.find((l) => l.startsWith('# '))?.slice(2) ?? '未知').trim();
  const docs: Document[] = [];
  let section = '';
  let buf: string[] = [];
  const flush = () => {
    const content = buf.join('\n').trim();
    if (section && content) {
      docs.push(new Document({
        pageContent: content,
        metadata: { drugName, section, source: 'NMPA说明书' },
      }));
    }
    buf = [];
  };
  for (const line of lines) {
    if (line.startsWith('## ')) { flush(); section = line.slice(3).trim(); }
    else if (!line.startsWith('# ')) buf.push(line);
  }
  flush();
  return docs;
}

async function main() {
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.txt'));
  const docs = files.flatMap((f) => parseLabel(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8')));
  console.log(`解析 ${files.length} 份说明书，共 ${docs.length} 个切块，开始入库...`);

  const store = await getVectorStore();
  await store.addDocuments(docs);
  console.log('入库完成');
  await store.end?.();
  process.exit(0);
}

main().catch((e) => { console.error('入库失败:', e); process.exit(1); });
```

- [ ] **Step 3: 注册 npm 脚本**

修改 `backend/package.json` 的 `scripts`，新增一行（保持现有其余脚本不变）：

```json
    "ingest": "npx tsx scripts/ingest.ts",
```

- [ ] **Step 4: 更新 .env.example**

在 `backend/.env.example` 末尾追加：

```
# Neon Postgres 连接串（含 pgvector 扩展）
DATABASE_URL=
# PubMed 可选加速 key（免费无需也可用）
NCBI_API_KEY=
```

- [ ] **Step 5: 语法校验 + 提交**

Run: `cd backend && npx tsc --noEmit`
Expected: 无报错

```bash
cd backend && git add scripts/ingest.ts data/drug-labels/ package.json .env.example
git commit -m "feat(ingest): 新增说明书入库脚本与种子数据"
```

> 注：真实入库 `npm run ingest` 需配好 `DATABASE_URL` 且 Neon 已建 `vector` 扩展，属部署步骤，不在单测范围。

---

### Task 6: PharmacistAgent 接入 pgvector 检索

**Files:**
- Modify: `backend/src/agents/PharmacistAgent.ts`
- Test: `backend/src/__tests__/PharmacistAgent.test.ts`

**Interfaces:**
- Consumes: `searchDrugLabels`（Task 4）、`PharmacistResult.sources`（Task 1）。
- Produces: `execute` 行为——检索有结果时 prompt 注入原文、`sources` 填真实出处；检索为空时降级且 warnings 含"未检索到说明书"；检索抛错不崩、返回兜底。

- [ ] **Step 1: Write the failing test（改写现有测试）**

将 `backend/src/__tests__/PharmacistAgent.test.ts` 整体替换为：

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { sharedModel } from '../agents/BaseAgent';
import { PharmacistAgent } from '../agents/PharmacistAgent';
import * as vs from '../retrieval/vectorStore';

afterEach(() => vi.restoreAllMocks());

const llmMedicines = {
  medicines: [{ name: '布洛芬缓释胶囊', type: '非甾体抗炎药', indication: '缓解头痛', usage: '一次1粒，一日2次' }],
  warnings: ['用药前请咨询医生'],
};

describe('PharmacistAgent', () => {
  it('检索有结果：sources 填真实出处，prompt 注入原文', async () => {
    const spy = vi.spyOn(vs, 'searchDrugLabels').mockResolvedValueOnce([
      { content: '成人一次1粒，一日2次', drugName: '布洛芬', section: '用法用量', source: 'NMPA说明书' },
    ]);
    const invoke = vi.spyOn(sharedModel, 'invoke').mockResolvedValueOnce({
      content: JSON.stringify(llmMedicines),
    } as any);

    const agent = new PharmacistAgent();
    const result = await agent.execute({ userMessage: '头痛推荐药品', errors: [] });

    expect(spy).toHaveBeenCalled();
    expect(invoke.mock.calls[0][0]).toContain('成人一次1粒'); // 原文进了 prompt
    expect(result.pharmacistResults?.sources).toContain('NMPA说明书:布洛芬-用法用量');
    expect(result.errors).toHaveLength(0);
  });

  it('检索为空：降级且 warnings 含未检索提示', async () => {
    vi.spyOn(vs, 'searchDrugLabels').mockResolvedValueOnce([]);
    vi.spyOn(sharedModel, 'invoke').mockResolvedValueOnce({
      content: JSON.stringify(llmMedicines),
    } as any);

    const agent = new PharmacistAgent();
    const result = await agent.execute({ userMessage: '冷门药', errors: [] });

    expect(result.pharmacistResults?.warnings.some((w) => w.includes('未检索到说明书'))).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('检索抛错：不崩溃，返回兜底且 errors 长度为 1', async () => {
    vi.spyOn(vs, 'searchDrugLabels').mockRejectedValueOnce(new Error('DB down'));

    const agent = new PharmacistAgent();
    const result = await agent.execute({ userMessage: '头痛', errors: [] });

    expect(result.pharmacistResults?.medicines).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/__tests__/PharmacistAgent.test.ts`
Expected: FAIL —— 现有实现未调用 `searchDrugLabels`、无 `sources`

- [ ] **Step 3: Write implementation**

将 `backend/src/agents/PharmacistAgent.ts` 整体替换为：

```typescript
import { BaseAgent } from './BaseAgent';
import { AgentState, PharmacistResult } from './types';
import { searchDrugLabels, DrugChunk } from '../retrieval/vectorStore';

export class PharmacistAgent extends BaseAgent {
  constructor() {
    super('Pharmacist', '药品查询和推荐');
  }

  async execute(state: AgentState): Promise<Partial<AgentState>> {
    this.log('开始药品查询...');
    const query = this.buildQuery(state);

    try {
      let chunks: DrugChunk[] = [];
      try {
        chunks = await searchDrugLabels(query, 4);
      } catch (retrievalErr) {
        // 检索层失败不致命：降级为无资料模式，但记录错误
        this.logError('说明书检索失败，降级为通用建议', retrievalErr);
        throw retrievalErr; // 交给外层兜底，保证 errors 计数
      }

      const result = await this.recommend(chunks);
      this.log(`查询完成，推荐 ${result.medicines.length} 种药品`);
      return { pharmacistResults: result, errors: [] };
    } catch (error) {
      this.logError('药品查询失败', error);
      return {
        pharmacistResults: {
          medicines: [],
          warnings: ['药品查询失败，请咨询专业医生或药剂师'],
        },
        errors: [...state.errors, String(error)],
      };
    }
  }

  private buildQuery(state: AgentState): string {
    let q = state.userMessage;
    const dr = state.diagnosticResults;
    if (dr?.symptoms?.length) q += ' ' + dr.symptoms.join(' ');
    if (dr?.possibleConditions?.length) q += ' ' + dr.possibleConditions.map((c) => c.name).join(' ');
    return q;
  }

  private async recommend(chunks: DrugChunk[]): Promise<PharmacistResult> {
    const hasData = chunks.length > 0;
    const material = hasData
      ? chunks.map((c, i) => `【资料${i + 1}】药名:${c.drugName} | 小节:${c.section}\n${c.content}`).join('\n\n')
      : '（未检索到相关说明书）';

    const rule = hasData
      ? '严格要求：只能基于上述真实资料推荐，资料里没有的药品/剂量绝对不要编造；资料不足时明说"建议咨询医生"。'
      : '未检索到说明书资料，请基于通用非处方药知识谨慎推荐，并在 warnings 中说明"未检索到说明书，以下为通用建议"。';

    const prompt = `你是专业药剂师。以下是从药品说明书库检索到的资料：

${material}

${rule}
请返回以下 JSON，不要添加其他内容：
{
  "medicines": [
    { "name": "药品名", "genericName": "通用名", "type": "类型", "indication": "适应症",
      "usage": "用法用量", "contraindication": "禁忌", "sideEffects": ["副作用"], "interactions": ["相互作用"] }
  ],
  "warnings": ["警告1", "用药前请咨询医生"]
}`;

    const raw = await this.invokeJSON<PharmacistResult>(prompt);

    const sources = hasData ? chunks.map((c) => `${c.source}:${c.drugName}-${c.section}`) : [];
    const warnings = raw.warnings ?? [];
    if (!hasData && !warnings.some((w) => w.includes('未检索到说明书'))) {
      warnings.push('未检索到说明书，以下为通用建议，请以医生意见为准');
    }
    return { medicines: raw.medicines ?? [], warnings, sources };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/__tests__/PharmacistAgent.test.ts`
Expected: PASS（3 个用例全绿）

- [ ] **Step 5: 全量回归**

Run: `cd backend && npm test`
Expected: 全部测试 PASS（含未改动的 Coordinator/Diagnostic/Advisor/BaseAgent 测试）

- [ ] **Step 6: Commit**

```bash
cd backend && git add src/agents/PharmacistAgent.ts src/__tests__/PharmacistAgent.test.ts
git commit -m "feat(pharmacist): 接入 pgvector 说明书检索，推荐基于真实资料并附出处"
```

---

## 完成标准

- `npm test` 全绿，覆盖三类边界：检索成功、检索为空降级、检索异常兜底。
- ResearchAgent findings 检索成功时带真实 PMID/URL；PharmacistAgent 推荐附真实 `sources`。
- 检索层任何失败都不导致进程崩溃，降级路径有明确标注。
- 未改动 Coordinator/Diagnostic/Advisor、前端、部署配置。

## 部署备注（非本计划代码任务）

1. Neon 建库后执行 `CREATE EXTENSION IF NOT EXISTS vector;`
2. 配置 `DATABASE_URL`、`GOOGLE_API_KEY`。
3. 补齐 `data/drug-labels/` 至 30-50 份后运行 `npm run ingest`。
4. Render 环境变量同步新增 `DATABASE_URL`。
