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
