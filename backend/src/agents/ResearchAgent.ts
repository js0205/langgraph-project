// 研究 Agent - 负责医学文献搜索和知识查询

import { BaseAgent } from './BaseAgent';
import { AgentState, ResearchResult } from './types';

/**
 * Research Agent
 * 职责：搜索医学文献，获取权威医学信息
 * 注意：当前版本使用 AI 生成模拟的研究结果，未来可以集成 PubMed API
 */
export class ResearchAgent extends BaseAgent {
  constructor() {
    super('Research', '医学文献搜索和研究');
  }

  /**
   * 执行研究任务
   */
  async execute(state: AgentState): Promise<Partial<AgentState>> {
    this.log('开始医学文献搜索...');

    try {
      // 构建搜索查询
      const query = this.buildSearchQuery(state);
      this.log(`搜索查询: ${query}`);

      // 执行搜索（当前使用 AI 模拟，未来可接入 PubMed API）
      const sources = await this.searchLiterature(query);
      this.log(`找到 ${sources.length} 条文献`);

      // 提取关键发现
      const keyFindings = await this.extractKeyFindings(sources, query);

      const result: ResearchResult = {
        query,
        sources,
        keyFindings,
        timestamp: new Date().toISOString(),
      };

      // 更新已完成的 Agent 列表
      const completed = [...(state.completedAgents || []), 'research'];

      return {
        researchResults: result,
        completedAgents: completed,
      };
    } catch (error) {
      this.logError('文献搜索失败', error);
      return {
        researchResults: {
          query: '',
          sources: [],
          keyFindings: ['文献搜索失败，建议咨询专业医生'],
          timestamp: new Date().toISOString(),
        },
        errors: [...(state.errors || []), String(error)],
      };
    }
  }

  /**
   * 构建搜索查询
   */
  private buildSearchQuery(state: AgentState): string {
    let query = state.userMessage;

    // 如果有诊断结果，优化搜索查询
    if (state.diagnosticResults) {
      const { symptoms, possibleConditions } = state.diagnosticResults;
      if (possibleConditions && possibleConditions.length > 0) {
        query = possibleConditions[0].name;
      } else if (symptoms && symptoms.length > 0) {
        query = symptoms.join(' ');
      }
    }

    return query;
  }

  /**
   * 搜索医学文献
   * 注意：当前版本使用 AI 生成模拟结果，未来可以接入 PubMed API
   */
  private async searchLiterature(query: string): Promise<Array<{
    title: string;
    url: string;
    summary: string;
    relevance: number;
  }>> {
    const prompt = `作为医学文献检索专家，请模拟搜索以下医学主题的权威文献。

搜索主题: ${query}

请提供 3-4 条相关的医学文献信息，格式如下：

以 JSON 格式返回：
[
  {
    "title": "文献标题（英文或中文）",
    "url": "https://pubmed.ncbi.nlm.nih.gov/xxxxx（模拟链接）",
    "summary": "文献摘要或主要结论（50-100字）",
    "relevance": 90
  }
]

要求：
- 文献应该是权威的医学研究
- 摘要应该准确概括研究内容
- relevance 是相关性评分（0-100）
- 只返回 JSON 数组，不要添加其他内容

注意：这是模拟数据，实际应用中应该接入 PubMed 或其他医学数据库 API。`;

    try {
      return await this.invokeJSON(prompt);
    } catch (error) {
      this.logError('文献搜索失败，返回默认值', error);
      return [{
        title: '相关医学研究',
        url: 'https://pubmed.ncbi.nlm.nih.gov/',
        summary: '建议查询 PubMed 等医学数据库获取更准确的信息',
        relevance: 50,
      }];
    }
  }

  /**
   * 从文献中提取关键发现
   */
  private async extractKeyFindings(
    sources: Array<{ title: string; summary: string }>,
    query: string
  ): Promise<string[]> {
    if (sources.length === 0) {
      return ['未找到相关文献'];
    }

    const sourcesText = sources
      .map((s, i) => `${i + 1}. ${s.title}\n   ${s.summary}`)
      .join('\n\n');

    const prompt = `请从以下医学文献中提取关键发现和结论，用于回答问题"${query}"。

文献信息：
${sourcesText}

请提取 3-5 个关键发现，每个发现应该：
1. 简洁明了（一句话）
2. 与问题直接相关
3. 基于文献内容

以 JSON 数组格式返回：
["关键发现1", "关键发现2", "关键发现3"]

只返回 JSON 数组，不要添加其他内容。`;

    try {
      return await this.invokeJSON<string[]>(prompt);
    } catch {
      return sources.map(s => s.summary);
    }
  }
}
