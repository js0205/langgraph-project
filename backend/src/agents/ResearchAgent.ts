import { BaseAgent } from './BaseAgent';
import { AgentState, ResearchResult } from './types';

export class ResearchAgent extends BaseAgent {
  constructor() {
    super('Research', '医学知识研究');
  }

  async execute(state: AgentState): Promise<Partial<AgentState>> {
    this.log('开始医学知识研究...');

    const query = this.buildQuery(state);

    try {
      const { findings, keyFindings } = await this.research(query);
      this.log(`研究完成，获取 ${findings.length} 条知识摘要`);

      const result: ResearchResult = {
        query,
        findings,
        keyFindings,
        timestamp: new Date().toISOString(),
      };

      return { researchResults: result, errors: [] };
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

  private async research(query: string): Promise<{ findings: ResearchResult['findings']; keyFindings: string[] }> {
    const prompt = `你是医学知识助手。请基于你的知识库，针对以下主题提供权威医学摘要。

研究主题: ${query}

注意：只使用你已知的医学知识，不要生成 URL 或引用不存在的文献。

请返回以下 JSON，不要添加其他内容：
{
  "findings": [
    {
      "title": "知识点标题",
      "summary": "100字以内的知识摘要",
      "relevance": 90,
      "label": "[AI知识摘要]"
    }
  ],
  "keyFindings": ["关键结论1", "关键结论2", "关键结论3"]
}

要求：
- findings 提供 2-3 条知识点
- label 字段固定为 "[AI知识摘要]"
- keyFindings 提炼 3-5 条最重要的结论`;

    return await this.invokeJSON<{ findings: ResearchResult['findings']; keyFindings: string[] }>(prompt);
  }
}
