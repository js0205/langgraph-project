# 多大模型集成指南

## 为什么要使用多个模型？

### 优势：

1. **成本优化**
   - 简单任务用便宜的模型
   - 复杂任务用高级模型

2. **性能优化**
   - 快速模型处理简单任务
   - 慢速强大模型处理复杂任务

3. **能力互补**
   - GPT-4: 推理能力强
   - Claude: 长文本处理好
   - Gemini: 多模态能力强

4. **容灾备份**
   - 主模型失败时切换备用模型
   - 避免单点故障

---

## 方案一：不同节点使用不同模型

### 架构图：

```
┌─────────────────────────────────────────┐
│          医药智能助手工作流               │
├─────────────────────────────────────────┤
│                                         │
│  [意图识别] → Gemini Flash (快速+便宜)   │
│       ↓                                 │
│  [症状分析] → GPT-3.5 (便宜)            │
│       ↓                                 │
│  [药品查询] → Claude Haiku (快速)        │
│       ↓                                 │
│  [建议生成] → GPT-4 (质量最高)           │
│                                         │
└─────────────────────────────────────────┘
```

### 实现代码：

```typescript
// backend/src/services/multiModelWorkflow.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';

class MultiModelWorkflowService {
  private gemini: any;      // 快速模型
  private gpt35: ChatOpenAI;  // 中级模型
  private gpt4: ChatOpenAI;   // 高级模型
  private claude: ChatAnthropic; // 备用模型

  constructor() {
    // 初始化 Gemini（Google）
    this.gemini = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!)
      .getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    // 初始化 GPT-3.5（OpenAI）
    this.gpt35 = new ChatOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      model: 'gpt-3.5-turbo',
      temperature: 0.7
    });

    // 初始化 GPT-4（OpenAI）
    this.gpt4 = new ChatOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      model: 'gpt-4o',
      temperature: 0.7
    });

    // 初始化 Claude（Anthropic）
    this.claude = new ChatAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-3-haiku-20240307',
      temperature: 0.7
    });
  }

  // 节点1: 意图识别 - 使用快速的 Gemini
  private async intentRecognitionNode(state: WorkflowState) {
    console.log('🔍 [Gemini Flash] 执行意图识别...');

    const prompt = `分析用户意图: ${state.userMessage}`;
    const response = await this.gemini.generateContent(prompt);
    const intent = response.response.text();

    return { intent };
  }

  // 节点2: 症状分析 - 使用经济的 GPT-3.5
  private async symptomAnalysisNode(state: WorkflowState) {
    console.log('🩺 [GPT-3.5] 执行症状分析...');

    const response = await this.gpt35.invoke(
      `从以下描述中提取症状: ${state.userMessage}`
    );
    const symptoms = JSON.parse(response.content.toString());

    return { symptoms };
  }

  // 节点3: 药品查询 - 使用快速的 Claude Haiku
  private async medicineQueryNode(state: WorkflowState) {
    console.log('💊 [Claude Haiku] 执行药品查询...');

    const response = await this.claude.invoke(
      `推荐治疗以下症状的药品: ${state.symptoms.join(', ')}`
    );
    const medicines = JSON.parse(response.content.toString());

    return { medicines };
  }

  // 节点4: 建议生成 - 使用高质量的 GPT-4
  private async recommendationNode(state: WorkflowState) {
    console.log('📋 [GPT-4] 生成用药建议...');

    const response = await this.gpt4.invoke(
      `基于以下信息生成专业用药建议:\n症状: ${state.symptoms}\n药品: ${JSON.stringify(state.medicines)}`
    );

    return { recommendation: response.content.toString() };
  }
}
```

### 环境变量配置：

```env
# backend/.env

# Google Gemini API
GOOGLE_API_KEY=your_gemini_key

# OpenAI API
OPENAI_API_KEY=your_openai_key

# Anthropic Claude API
ANTHROPIC_API_KEY=your_anthropic_key
```

---

## 方案二：智能路由 - 根据任务复杂度选择模型

### 架构图：

```
                用户输入
                   ↓
           ┌─────────────┐
           │  路由决策器  │
           │ (复杂度评估) │
           └─────────────┘
                   ↓
        ┌──────────┴──────────┐
        ↓                     ↓
   [简单任务]            [复杂任务]
  Gemini Flash           GPT-4
  (快速+便宜)           (强大+贵)
```

### 实现代码：

```typescript
class IntelligentRouterService {
  private models = {
    fast: this.gemini,      // 快速模型
    medium: this.gpt35,     // 中级模型
    powerful: this.gpt4     // 强大模型
  };

  // 评估任务复杂度
  private async assessComplexity(message: string): Promise<'fast' | 'medium' | 'powerful'> {
    // 简单规则
    const wordCount = message.split(' ').length;

    if (wordCount < 10) {
      return 'fast';  // 简单问题 → Gemini
    } else if (wordCount < 50) {
      return 'medium';  // 中等问题 → GPT-3.5
    } else {
      return 'powerful';  // 复杂问题 → GPT-4
    }

    // 或者使用 AI 评估
    // const assessment = await this.fastModel.evaluate(message);
    // return assessment.complexity;
  }

  // 路由到合适的模型
  async routeAndProcess(message: string) {
    const complexity = await this.assessComplexity(message);
    const model = this.models[complexity];

    console.log(`📍 路由到: ${complexity} 模型`);

    const response = await model.invoke(message);
    return response;
  }
}
```

---

## 方案三：并行调用多个模型 + 结果融合

### 架构图：

```
            用户输入
               ↓
    ┌──────────┼──────────┐
    ↓          ↓          ↓
 [Gemini]   [GPT-4]   [Claude]
    ↓          ↓          ↓
    └──────────┼──────────┘
               ↓
         ┌──────────┐
         │ 结果融合器 │
         └──────────┘
               ↓
          最终答案
```

### 实现代码：

```typescript
class EnsembleModelService {
  // 并行调用多个模型
  async generateWithEnsemble(message: string) {
    console.log('🔄 并行调用 3 个模型...');

    // 同时调用多个模型
    const [geminiResponse, gptResponse, claudeResponse] = await Promise.all([
      this.gemini.generateContent(message),
      this.gpt4.invoke(message),
      this.claude.invoke(message)
    ]);

    const responses = [
      { model: 'Gemini', content: geminiResponse.response.text() },
      { model: 'GPT-4', content: gptResponse.content.toString() },
      { model: 'Claude', content: claudeResponse.content.toString() }
    ];

    console.log('📊 收到 3 个模型的回复');

    // 方法1: 选择最长的回复（假设更详细）
    const bestResponse = responses.reduce((best, current) =>
      current.content.length > best.content.length ? current : best
    );

    // 方法2: 使用另一个模型来融合结果
    const fusedResponse = await this.fuseResponses(responses);

    return fusedResponse;
  }

  // 使用 GPT-4 融合多个模型的回复
  private async fuseResponses(responses: any[]) {
    const prompt = `
以下是 3 个 AI 模型对同一问题的回答：

1. Gemini: ${responses[0].content}

2. GPT-4: ${responses[1].content}

3. Claude: ${responses[2].content}

请综合这 3 个回答，生成一个最准确、最全面的答案。
`;

    const fusedResponse = await this.gpt4.invoke(prompt);
    return fusedResponse.content.toString();
  }
}
```

---

## 方案四：专业分工 - 不同模型负责不同领域

### 架构图：

```
                用户输入
                   ↓
           ┌─────────────┐
           │  领域识别器  │
           └─────────────┘
                   ↓
        ┌──────────┼──────────┐
        ↓          ↓          ↓
   [医疗领域]  [法律领域]  [技术领域]
    Gemini      Claude      GPT-4
   (医疗专用)  (长文本好)  (代码强)
```

### 实现代码：

```typescript
class DomainSpecializedService {
  private domainModels = {
    medical: {
      model: this.gemini,
      systemPrompt: '你是一个专业的医药助手...'
    },
    legal: {
      model: this.claude,  // Claude 擅长长文本
      systemPrompt: '你是一个法律顾问...'
    },
    technical: {
      model: this.gpt4,  // GPT-4 擅长代码
      systemPrompt: '你是一个技术专家...'
    }
  };

  // 识别领域并路由
  async processWithSpecialization(message: string) {
    // 识别领域
    const domain = await this.identifyDomain(message);
    console.log(`🎯 识别领域: ${domain}`);

    // 选择专业模型
    const specialist = this.domainModels[domain];

    // 使用专业系统提示词
    const fullPrompt = `${specialist.systemPrompt}\n\n用户问题: ${message}`;

    const response = await specialist.model.invoke(fullPrompt);
    return response;
  }

  private async identifyDomain(message: string): Promise<'medical' | 'legal' | 'technical'> {
    // 简单关键词匹配
    if (message.includes('药') || message.includes('病') || message.includes('症状')) {
      return 'medical';
    }
    if (message.includes('法律') || message.includes('合同') || message.includes('条款')) {
      return 'legal';
    }
    return 'technical';
  }
}
```

---

## 方案五：主模型 + 备用模型（容灾）

```typescript
class FallbackModelService {
  private primaryModel = this.gpt4;      // 主模型
  private fallbackModel = this.gemini;   // 备用模型

  async generateWithFallback(message: string) {
    try {
      console.log('🎯 尝试主模型 (GPT-4)...');
      const response = await this.primaryModel.invoke(message);
      return { model: 'GPT-4', response };

    } catch (error) {
      console.warn('⚠️ 主模型失败，切换到备用模型...');

      try {
        const response = await this.fallbackModel.generateContent(message);
        return { model: 'Gemini (Fallback)', response: response.response.text() };

      } catch (fallbackError) {
        console.error('❌ 所有模型都失败了');
        throw new Error('AI 服务不可用');
      }
    }
  }
}
```

---

## 成本和性能对比

| 模型 | 速度 | 成本 (每1M tokens) | 适用场景 |
|------|------|-------------------|---------|
| **Gemini 2.0 Flash** | ⚡⚡⚡ 最快 | $ 便宜 | 简单任务、意图识别 |
| **GPT-3.5 Turbo** | ⚡⚡ 快 | $$ 中等 | 一般任务、数据提取 |
| **GPT-4o** | ⚡ 较慢 | $$$$ 贵 | 复杂推理、生成内容 |
| **Claude Haiku** | ⚡⚡⚡ 很快 | $ 便宜 | 快速响应、分类 |
| **Claude Sonnet** | ⚡⚡ 中等 | $$$ 较贵 | 平衡性能和成本 |

---

## 实际项目中的推荐配置

### 医药智能助手多模型方案：

```typescript
const optimalConfig = {
  // 节点1: 意图识别（简单任务）
  intentRecognition: 'gemini-2.0-flash-exp',  // 快速 + 便宜

  // 节点2: 症状分析（结构化提取）
  symptomAnalysis: 'gpt-3.5-turbo',  // 便宜 + 可靠

  // 节点3: 药品查询（需要准确性）
  medicineQuery: 'claude-3-sonnet',  // 平衡性能

  // 节点4: 建议生成（需要质量）
  recommendationGeneration: 'gpt-4o',  // 最高质量

  // 备用模型（容灾）
  fallback: 'gemini-2.0-flash-exp'  // 快速备份
};
```

**预估成本节省：** 相比全部使用 GPT-4，可以节省 **60-70%** 的成本！

---

## 安装多模型依赖

```bash
cd backend

# OpenAI
npm install @langchain/openai

# Anthropic Claude
npm install @langchain/anthropic

# Google Gemini (已安装)
# @google/generative-ai
# @langchain/google-genai
```

---

## 总结

### 多模型策略选择：

| 策略 | 适用场景 | 优势 | 劣势 |
|------|---------|------|------|
| **不同节点不同模型** | 工作流明确 | 成本最优 | 配置复杂 |
| **智能路由** | 任务复杂度不确定 | 自动优化 | 需要路由器 |
| **并行融合** | 质量要求极高 | 结果最准确 | 成本最高 |
| **专业分工** | 多领域应用 | 领域专精 | 需要领域识别 |
| **主备模式** | 稳定性优先 | 高可用 | 备用模型可能质量低 |

### 推荐方案：
✅ **医药助手：不同节点使用不同模型** （最佳性价比）
✅ **备用模式：主模型 + Gemini 备用** （提高可靠性）

**当前项目可以轻松扩展为多模型架构！** 只需修改每个节点使用的模型即可。
