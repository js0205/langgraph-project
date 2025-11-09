# LangGraph 工作流 (Workflow) vs Agent 详解

## 核心概念对比

### 📊 Workflow (工作流)
**定义：** 预定义的、结构化的处理流程

```
┌──────────────────────────────────────────┐
│           Workflow (工作流)                │
│                                          │
│  用户输入                                 │
│     ↓                                    │
│  [节点1: 意图识别] ← 固定流程             │
│     ↓                                    │
│  [节点2: 症状分析] ← 固定流程             │
│     ↓                                    │
│  [节点3: 药品查询] ← 固定流程             │
│     ↓                                    │
│  [节点4: 建议生成] ← 固定流程             │
│     ↓                                    │
│  输出结果                                 │
└──────────────────────────────────────────┘

特点：
✅ 流程固定、可预测
✅ 每个节点功能明确
✅ 适合标准化任务
✅ 易于调试和优化
```

### 🤖 Agent (智能代理)
**定义：** 自主决策的、动态的智能实体

```
┌──────────────────────────────────────────┐
│              Agent (智能代理)              │
│                                          │
│  用户输入                                 │
│     ↓                                    │
│  [思考] 我应该做什么？                    │
│     ↓                                    │
│  [决策] 需要查询天气吗？                  │
│     ├─ 是 → 调用天气工具                 │
│     └─ 否 → 继续思考                     │
│     ↓                                    │
│  [思考] 还需要其他信息吗？                │
│     ↓                                    │
│  [决策] 需要搜索吗？                      │
│     ├─ 是 → 调用搜索工具                 │
│     └─ 否 → 生成回复                     │
│     ↓                                    │
│  输出结果                                 │
└──────────────────────────────────────────┘

特点：
✅ 自主决策能力
✅ 动态调用工具
✅ 适合复杂、不确定任务
✅ 更像"人类助手"
```

---

## 详细对比表

| 特性 | Workflow (工作流) | Agent (智能代理) |
|------|------------------|-----------------|
| **执行方式** | 预定义的顺序流程 | 动态决策和调用 |
| **灵活性** | 低（流程固定） | 高（自主决策） |
| **可预测性** | 高（每次相同） | 低（取决于输入和决策） |
| **工具使用** | 按流程调用 | 根据需要动态选择 |
| **适用场景** | 标准化任务、流程明确 | 复杂任务、需要推理 |
| **调试难度** | 容易（流程清晰） | 困难（决策不透明） |
| **成本** | 较低（调用次数固定） | 较高（多次推理和调用） |
| **示例** | 订单处理、数据管道 | 个人助理、研究助手 |

---

## 当前项目使用的是什么？

### 🔄 我们使用的是 Workflow（工作流）

**原因：**
1. 医药咨询是**标准化流程**：意图识别 → 症状分析 → 药品查询 → 建议生成
2. 流程**可预测**，用户期望稳定的输出
3. **成本可控**，避免过多的 API 调用
4. **易于调试**，每个节点功能明确

**我们的工作流：**
```typescript
// backend/src/services/workflowService.ts

// 1. 构建固定流程图
private buildWorkflow() {
  const workflow = new StateGraph<WorkflowState>({...});

  // 添加节点（固定）
  workflow.addNode('intentRecognition', ...);     // 节点1: 意图识别
  workflow.addNode('symptomAnalysis', ...);       // 节点2: 症状分析
  workflow.addNode('medicineQuery', ...);         // 节点3: 药品查询
  workflow.addNode('recommendationGeneration', ...); // 节点4: 建议生成

  // 定义固定的流程边
  workflow.addEdge(START, 'intentRecognition');
  workflow.addConditionalEdges('intentRecognition', ...); // 有条件分支
  workflow.addEdge('symptomAnalysis', 'medicineQuery');
  workflow.addEdge('medicineQuery', 'recommendationGeneration');
  workflow.addEdge('recommendationGeneration', END);

  return workflow.compile();
}

// 2. 执行流程（按预定义路径）
async execute(userMessage: string) {
  const result = await this.graph.invoke(initialState);
  return result;
}
```

---

## 如果要改成 Agent 会是什么样？

### Agent 版本示例：

```typescript
// 假设的 Agent 实现
class MedicalAgent {
  private tools = {
    searchMedicines: this.searchMedicinesTool,
    analyzeSideEffects: this.analyzeSideEffectsTool,
    checkDrugInteractions: this.checkDrugInteractionsTool,
    searchMedicalLiterature: this.searchLiteratureTool,
  };

  async run(userMessage: string) {
    let currentState = {
      message: userMessage,
      scratchpad: [],  // 记录思考过程
      finalAnswer: null
    };

    // Agent 循环：思考 → 行动 → 观察
    while (!currentState.finalAnswer) {
      // 1. 思考：我接下来该做什么？
      const thought = await this.think(currentState);
      console.log('💭 Agent 思考:', thought);

      if (thought.action === 'FINISH') {
        currentState.finalAnswer = thought.answer;
        break;
      }

      // 2. 行动：调用工具
      const tool = this.tools[thought.tool];
      const observation = await tool(thought.toolInput);
      console.log('🔧 使用工具:', thought.tool, '→', observation);

      // 3. 更新状态
      currentState.scratchpad.push({
        thought: thought.reasoning,
        action: thought.tool,
        observation: observation
      });
    }

    return currentState.finalAnswer;
  }

  private async think(state: any) {
    // 使用 LLM 进行推理
    const prompt = `
你是一个医药助手 Agent。

当前状态：
- 用户问题: ${state.message}
- 已执行的操作: ${JSON.stringify(state.scratchpad)}

可用工具：
1. searchMedicines - 搜索药品信息
2. analyzeSideEffects - 分析副作用
3. checkDrugInteractions - 检查药物相互作用
4. searchMedicalLiterature - 搜索医学文献

请思考：
1. 我需要做什么来回答用户的问题？
2. 我应该使用哪个工具？还是已经可以给出答案？

以 JSON 格式回复：
{
  "reasoning": "我的思考过程...",
  "action": "USE_TOOL" 或 "FINISH",
  "tool": "工具名称（如果 action 是 USE_TOOL）",
  "toolInput": "工具输入",
  "answer": "最终答案（如果 action 是 FINISH）"
}
`;

    const response = await this.llm.invoke(prompt);
    return JSON.parse(response.content);
  }
}

// 使用示例
const agent = new MedicalAgent();
const result = await agent.run("阿司匹林和布洛芬能一起吃吗？");

// Agent 的执行过程：
// 💭 Agent 思考: 我需要检查这两种药物的相互作用
// 🔧 使用工具: checkDrugInteractions → 可能增加胃肠道出血风险
// 💭 Agent 思考: 我需要搜索更多关于这两种药物的信息
// 🔧 使用工具: searchMedicines → 阿司匹林: 抗血小板药，布洛芬: NSAID
// 💭 Agent 思考: 我已经有足够信息回答了
// ✅ 最终答案: 不建议同时服用阿司匹林和布洛芬...
```

---

## 何时使用 Workflow？何时使用 Agent？

### ✅ 使用 Workflow 的场景：

1. **流程明确、标准化**
   - 订单处理
   - 数据 ETL 管道
   - 审批流程
   - **医药咨询（当前项目）**

2. **需要可预测的输出**
   - 法律文书生成
   - 报表生成
   - 质量检查流程

3. **成本敏感**
   - API 调用次数需要控制
   - 响应时间要求严格

### ✅ 使用 Agent 的场景：

1. **任务复杂、不确定**
   - 研究助手（需要搜索、阅读、总结）
   - 代码助手（需要分析、测试、调试）
   - 旅行规划（需要多步查询和决策）

2. **需要自主决策**
   - 客服机器人（动态响应各种问题）
   - 个人助理（处理多样化任务）
   - 游戏 NPC（根据情况做出反应）

3. **工具调用不确定**
   - 不知道需要哪些工具
   - 需要多步推理和验证

---

## 混合使用：ReAct Agent + Workflow

**最佳实践：** 在 Workflow 的某些节点使用 Agent

```typescript
class HybridSystem {
  // Workflow 主流程
  private buildWorkflow() {
    const workflow = new StateGraph({...});

    // 大部分节点是确定的
    workflow.addNode('intentRecognition', this.intentNode);
    workflow.addNode('symptomAnalysis', this.symptomNode);

    // 复杂节点使用 Agent
    workflow.addNode('complexQuery', this.agentNode);  // Agent 节点

    workflow.addNode('recommendationGeneration', this.recommendationNode);

    return workflow.compile();
  }

  // Agent 节点：处理复杂查询
  private async agentNode(state: any) {
    const agent = new MedicalAgent();
    const result = await agent.run(state.userMessage);
    return { agentResult: result };
  }
}
```

---

## 总结

### 当前项目（Workflow）
```
用户: "我头疼发烧咳嗽"
  ↓
[意图识别] → symptom_inquiry
  ↓
[症状分析] → ["头疼", "发烧", "咳嗽"]
  ↓
[药品查询] → [布洛芬, 感冒灵, 止咳糖浆]
  ↓
[建议生成] → 详细的用药建议
```

### 如果是 Agent
```
用户: "我头疼发烧咳嗽"
  ↓
[思考] 这是什么类型的问题？
  ↓
[决策] 需要查询症状相关的药品
  ↓
[调用工具] searchMedicines("头疼 发烧 咳嗽")
  ↓
[思考] 这些药物有什么副作用？
  ↓
[调用工具] analyzeSideEffects(["布洛芬", "感冒灵"])
  ↓
[思考] 需要检查药物相互作用吗？
  ↓
[决策] 是的，让我检查一下
  ↓
[调用工具] checkDrugInteractions(["布洛芬", "感冒灵"])
  ↓
[思考] 我已经有足够的信息了
  ↓
[生成答案] 详细的用药建议
```

**区别：**
- **Workflow**: 4 个固定步骤，每次都执行
- **Agent**: 动态决策，可能执行 3-10 步，取决于需要

**我们选择 Workflow 是因为：**
✅ 医药咨询流程标准化
✅ 用户期望稳定、可预测的结果
✅ 成本更低、速度更快
✅ 更容易调试和优化
