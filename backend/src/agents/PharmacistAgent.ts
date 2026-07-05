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
      const chunks = await searchDrugLabels(query, 4);
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
