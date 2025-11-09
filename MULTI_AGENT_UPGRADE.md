# Multi-Agent 系统升级方案

## 升级目标

将当前的固定 Workflow 升级为类似 DeerFlow 的 Multi-Agent 协作系统，具备：
- ✅ 多个专业智能体协作
- ✅ 动态路由和决策能力
- ✅ 外部工具集成（医学文献、药品数据库）
- ✅ 更强的推理和分析能力

---

## 架构设计

### 当前架构（Workflow）
```
用户输入 → 意图识别 → 症状分析 → 药品查询 → 建议生成
```
**问题：** 流程固定，无法根据问题复杂度动态调整

---

### 升级后架构（Multi-Agent）

```
                    用户输入
                       ↓
              ┌─────────────────┐
              │ Coordinator     │ ← AI 决策协调器
              └─────────────────┘
                       ↓
        ┌──────────────┼──────────────┐
        ↓              ↓              ↓
  [ResearchAgent] [DiagnosticAgent] [PharmacistAgent]
   - 搜索医学文献   - 症状深度分析   - 药品数据查询
   - PubMed API    - 疾病推理       - 相互作用检查
   - Arxiv 查询    - 风险评估       - 价格对比
        ↓              ↓              ↓
        └──────────────┼──────────────┘
                       ↓
              [AdvisorAgent]
              - 综合所有信息
              - 生成专业建议
              - 风险提示
                       ↓
                  最终输出
```

---

## Agent 详细设计

### 1. Coordinator（协调器）

**职责：** 分析用户问题，决定调用哪些 Agent 以及调用顺序

**决策逻辑：**
```typescript
interface CoordinatorDecision {
  needResearch: boolean;      // 是否需要查询文献
  needDiagnostic: boolean;    // 是否需要诊断分析
  needPharmacist: boolean;    // 是否需要药品查询
  complexity: 'simple' | 'medium' | 'complex';
  priority: string[];         // Agent 执行顺序
}
```

**示例：**
- 简单问题："布洛芬的用法用量" → 只调用 PharmacistAgent
- 中等问题："头疼发烧吃什么药" → DiagnosticAgent + PharmacistAgent
- 复杂问题："布洛芬和阿司匹林能一起吃吗" → ResearchAgent + PharmacistAgent + DiagnosticAgent

---

### 2. ResearchAgent（研究智能体）

**职责：** 搜索医学文献，获取权威医学信息

**工具：**
- PubMed API（医学文献数据库）
- Google Scholar API
- Arxiv 医学论文
- 网络爬虫（可信医学网站）

**输出：**
```typescript
interface ResearchResult {
  query: string;
  sources: Array<{
    title: string;
    url: string;
    summary: string;
    relevance: number;
  }>;
  keyFindings: string[];
}
```

**实现思路：**
```typescript
class ResearchAgent {
  async search(query: string): Promise<ResearchResult> {
    // 1. 使用 AI 优化搜索关键词
    const optimizedQuery = await this.optimizeQuery(query);

    // 2. 并行搜索多个数据源
    const [pubmedResults, scholarResults] = await Promise.all([
      this.searchPubMed(optimizedQuery),
      this.searchScholar(optimizedQuery)
    ]);

    // 3. AI 提取关键信息
    const keyFindings = await this.extractKeyFindings(results);

    return { query, sources, keyFindings };
  }
}
```

---

### 3. DiagnosticAgent（诊断智能体）

**职责：** 深度分析症状，推理可能的病因和风险

**能力：**
- 症状关联分析
- 疾病概率推理
- 严重程度评估
- 就医建议判断

**输出：**
```typescript
interface DiagnosticResult {
  symptoms: string[];
  possibleConditions: Array<{
    name: string;
    probability: number;
    severity: 'mild' | 'moderate' | 'severe';
    description: string;
  }>;
  riskFactors: string[];
  urgency: 'low' | 'medium' | 'high';
  recommendation: string;
}
```

**实现思路：**
```typescript
class DiagnosticAgent {
  async analyze(userMessage: string): Promise<DiagnosticResult> {
    // 1. 提取症状
    const symptoms = await this.extractSymptoms(userMessage);

    // 2. 使用医学知识图谱推理
    const conditions = await this.inferConditions(symptoms);

    // 3. 评估严重程度
    const urgency = await this.assessUrgency(symptoms, conditions);

    // 4. 生成建议
    const recommendation = urgency === 'high'
      ? '建议立即就医'
      : '可以先尝试非处方药';

    return { symptoms, possibleConditions: conditions, urgency, recommendation };
  }
}
```

---

### 4. PharmacistAgent（药剂师智能体）

**职责：** 查询药品信息，检查相互作用和禁忌

**工具：**
- 药品数据库 API（如 OpenFDA）
- 药物相互作用检查工具
- 价格对比 API

**输出：**
```typescript
interface PharmacistResult {
  medicines: Array<{
    name: string;
    type: string;
    indication: string;
    usage: string;
    contraindication: string;
    sideEffects: string[];
    interactions: string[];
    price: {
      min: number;
      max: number;
      currency: string;
    };
  }>;
  warnings: string[];
}
```

**实现思路：**
```typescript
class PharmacistAgent {
  async query(symptoms: string[], conditions: string[]): Promise<PharmacistResult> {
    // 1. 查询适合的药品
    const medicines = await this.searchMedicines(symptoms, conditions);

    // 2. 检查药物相互作用
    const interactions = await this.checkInteractions(medicines);

    // 3. 添加警告信息
    const warnings = this.generateWarnings(medicines, interactions);

    return { medicines, warnings };
  }
}
```

---

### 5. AdvisorAgent（顾问智能体）

**职责：** 综合所有 Agent 的信息，生成最终建议

**输入：**
- ResearchAgent 的文献信息
- DiagnosticAgent 的诊断结果
- PharmacistAgent 的药品推荐

**输出：**
```typescript
interface FinalAdvice {
  summary: string;
  diagnosis: string;
  recommendedMedicines: Array<{
    name: string;
    reason: string;
    usage: string;
  }>;
  precautions: string[];
  references: string[];
  urgency: string;
  disclaimer: string;
}
```

---

## 动态路由实现

### Coordinator 的决策逻辑

```typescript
class Coordinator {
  async route(userMessage: string, state: AgentState): Promise<string[]> {
    // 使用 AI 分析问题复杂度
    const analysis = await this.analyzeComplexity(userMessage);

    const plan: string[] = [];

    // 决策逻辑
    if (analysis.needsResearch) {
      plan.push('research');
    }

    if (analysis.hasSymptoms) {
      plan.push('diagnostic');
    }

    if (analysis.needsMedicineInfo) {
      plan.push('pharmacist');
    }

    // 总是需要最终建议
    plan.push('advisor');

    return plan;
  }

  private async analyzeComplexity(message: string): Promise<{
    needsResearch: boolean;
    hasSymptoms: boolean;
    needsMedicineInfo: boolean;
    complexity: string;
  }> {
    const prompt = `分析以下医药问题的复杂度：

用户问题: ${message}

请判断：
1. 是否需要查询医学文献？（复杂的药物相互作用、罕见疾病）
2. 是否包含症状描述？
3. 是否需要药品信息查询？

以 JSON 格式回复：
{
  "needsResearch": true/false,
  "hasSymptoms": true/false,
  "needsMedicineInfo": true/false,
  "complexity": "simple/medium/complex"
}`;

    const response = await this.model.invoke(prompt);
    return JSON.parse(response.content.toString());
  }
}
```

---

## LangGraph 实现

### Multi-Agent 工作流

```typescript
class MultiAgentService {
  private buildGraph() {
    const workflow = new StateGraph<AgentState>({
      channels: {
        userMessage: null,
        coordinatorDecision: null,
        researchResults: null,
        diagnosticResults: null,
        pharmacistResults: null,
        finalAdvice: null,
      }
    });

    // 添加所有 Agent 节点
    workflow.addNode('coordinator', this.coordinatorNode.bind(this));
    workflow.addNode('research', this.researchNode.bind(this));
    workflow.addNode('diagnostic', this.diagnosticNode.bind(this));
    workflow.addNode('pharmacist', this.pharmacistNode.bind(this));
    workflow.addNode('advisor', this.advisorNode.bind(this));

    // 入口：协调器
    workflow.addEdge(START, 'coordinator');

    // 动态路由：根据协调器的决策选择下一步
    workflow.addConditionalEdges(
      'coordinator',
      (state: AgentState) => {
        const plan = state.coordinatorDecision.plan;
        return plan[0]; // 返回第一个要执行的 Agent
      }
    );

    // Research Agent 后的路由
    workflow.addConditionalEdges(
      'research',
      (state: AgentState) => this.getNextAgent(state)
    );

    // Diagnostic Agent 后的路由
    workflow.addConditionalEdges(
      'diagnostic',
      (state: AgentState) => this.getNextAgent(state)
    );

    // Pharmacist Agent 后的路由
    workflow.addConditionalEdges(
      'pharmacist',
      (state: AgentState) => this.getNextAgent(state)
    );

    // 最终：Advisor 生成建议
    workflow.addEdge('advisor', END);

    return workflow.compile();
  }

  private getNextAgent(state: AgentState): string {
    const plan = state.coordinatorDecision.plan;
    const completed = state.completedAgents || [];

    // 找到下一个未执行的 Agent
    for (const agent of plan) {
      if (!completed.includes(agent)) {
        return agent;
      }
    }

    // 所有 Agent 都执行完毕，进入 Advisor
    return 'advisor';
  }
}
```

---

## 工具集成

### 1. PubMed API（医学文献）

```typescript
class PubMedTool {
  private readonly BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

  async search(query: string, maxResults: number = 5): Promise<any[]> {
    // 1. 搜索文献 ID
    const searchUrl = `${this.BASE_URL}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmode=json&retmax=${maxResults}`;
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();

    const ids = searchData.esearchresult.idlist;

    // 2. 获取文献详情
    const fetchUrl = `${this.BASE_URL}/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`;
    const fetchResponse = await fetch(fetchUrl);
    const fetchData = await fetchResponse.json();

    return ids.map(id => fetchData.result[id]);
  }
}
```

### 2. OpenFDA API（药品数据）

```typescript
class OpenFDATool {
  private readonly BASE_URL = 'https://api.fda.gov/drug';

  async searchDrug(name: string): Promise<any> {
    const url = `${this.BASE_URL}/label.json?search=openfda.brand_name:"${name}"&limit=1`;
    const response = await fetch(url);
    const data = await response.json();

    return data.results[0];
  }
}
```

---

## 前端升级

### 新增 Multi-Agent 模式切换

```typescript
function App() {
  const [mode, setMode] = useState<'simple' | 'workflow' | 'multi-agent'>('multi-agent');

  return (
    <div className="mode-selector">
      <button onClick={() => setMode('simple')}>💬 简单模式</button>
      <button onClick={() => setMode('workflow')}>🔄 工作流模式</button>
      <button onClick={() => setMode('multi-agent')}>🤖 Multi-Agent 模式</button>
    </div>
  );
}
```

### 显示 Agent 执行过程

```typescript
interface AgentTrace {
  agent: string;
  status: 'running' | 'completed';
  result?: any;
}

// 实时显示 Agent 执行过程
{agentTrace.map((trace, idx) => (
  <div key={idx} className="agent-trace">
    <span>{trace.agent}</span>
    {trace.status === 'running' ? (
      <Spinner />
    ) : (
      <CheckIcon />
    )}
  </div>
))}
```

---

## 成本优化

### 智能模型选择

```typescript
class ModelSelector {
  selectModel(agentType: string, complexity: string): string {
    // Coordinator 和简单任务使用快速模型
    if (agentType === 'coordinator' || complexity === 'simple') {
      return 'gemini-2.0-flash-exp';
    }

    // 诊断和研究使用高级模型
    if (agentType === 'diagnostic' || agentType === 'research') {
      return 'gpt-4o';  // 或 claude-3-sonnet
    }

    // 默认中级模型
    return 'gpt-3.5-turbo';
  }
}
```

---

## 测试用例

### 简单问题
```
用户: "布洛芬的用法用量是什么？"

执行流程:
  Coordinator → PharmacistAgent → AdvisorAgent

预期输出:
  仅查询药品信息，快速返回
```

### 中等问题
```
用户: "我头疼发烧咳嗽，应该吃什么药？"

执行流程:
  Coordinator → DiagnosticAgent → PharmacistAgent → AdvisorAgent

预期输出:
  症状分析 + 药品推荐
```

### 复杂问题
```
用户: "布洛芬和阿司匹林能一起吃吗？有什么风险？"

执行流程:
  Coordinator → ResearchAgent → PharmacistAgent → DiagnosticAgent → AdvisorAgent

预期输出:
  文献查询 + 药物相互作用检查 + 风险评估
```

---

## 实施步骤

1. ✅ 创建架构设计文档（当前文件）
2. ⏳ 实现各个 Agent 类
3. ⏳ 集成外部工具（PubMed、OpenFDA）
4. ⏳ 构建 Multi-Agent 工作流
5. ⏳ 更新前端 UI
6. ⏳ 测试和优化

---

## 预期效果

### 升级前（Workflow）
- 固定 4 步流程
- 每次调用 4 次 API
- 响应时间: 5-15 秒
- 成本: 低

### 升级后（Multi-Agent）
- 动态 2-5 步流程
- 根据问题复杂度调用 2-8 次 API
- 响应时间: 8-30 秒
- 成本: 中等
- **能力提升: 200%**

---

## 总结

通过 Multi-Agent 升级，系统将具备：
- ✅ 动态推理和决策能力
- ✅ 权威医学文献支持
- ✅ 更准确的诊断分析
- ✅ 全面的药品信息查询
- ✅ 类似 DeerFlow 的协作能力

**下一步：** 开始实现各个 Agent 类！
