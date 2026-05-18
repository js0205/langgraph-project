import { BaseAgent } from './BaseAgent';
import { AgentState, PharmacistResult } from './types';

export class PharmacistAgent extends BaseAgent {
  constructor() {
    super('Pharmacist', '药品查询和推荐');
  }

  async execute(state: AgentState): Promise<Partial<AgentState>> {
    this.log('开始药品查询...');

    try {
      const result = await this.queryPharmacy(state);
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

  private buildContext(state: AgentState): string {
    let ctx = `用户问题: ${state.userMessage}`;
    const dr = state.diagnosticResults;
    if (dr) {
      if (dr.symptoms?.length) ctx += `\n症状: ${dr.symptoms.join('、')}`;
      if (dr.possibleConditions?.length) ctx += `\n可能疾病: ${dr.possibleConditions.map(c => c.name).join('、')}`;
      if (dr.urgency === 'high') ctx += '\n注意：症状较重，请在推荐中强调就医';
    }
    return ctx;
  }

  private async queryPharmacy(state: AgentState): Promise<PharmacistResult> {
    const context = this.buildContext(state);

    const prompt = `你是专业药剂师。请根据以下信息推荐合适的非处方药（OTC），并检查药物相互作用，生成警告信息。

${context}

请返回以下 JSON，不要添加其他内容：
{
  "medicines": [
    {
      "name": "药品商品名",
      "genericName": "通用名",
      "type": "药品类型",
      "indication": "适应症",
      "usage": "用法用量（详细）",
      "contraindication": "禁忌症",
      "sideEffects": ["副作用1", "副作用2"],
      "interactions": ["相互作用1"],
      "price": { "min": 10, "max": 30, "currency": "CNY" }
    }
  ],
  "warnings": ["警告信息1", "警告信息2"]
}

要求：
- 推荐 2-3 种 OTC 药品
- warnings 包含药物相互作用风险、禁忌提示，以及"用药前请咨询医生"
- 所有信息准确，不要虚构药品`;

    return await this.invokeJSON<PharmacistResult>(prompt);
  }
}
