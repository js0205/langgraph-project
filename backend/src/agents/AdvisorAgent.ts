import { BaseAgent } from './BaseAgent';
import { AgentState, AdvisorResult } from './types';

export class AdvisorAgent extends BaseAgent {
  constructor() {
    super('Advisor', '综合建议生成');
  }

  async execute(state: AgentState): Promise<Partial<AgentState>> {
    this.log('开始生成最终建议...');

    try {
      const result = await this.generateAdvice(state);
      this.log('最终建议生成完成');
      return { advisorResults: result, errors: [] };
    } catch (error) {
      this.logError('建议生成失败', error);
      return {
        advisorResults: {
          summary: '抱歉，无法生成完整建议，请咨询专业医生',
          recommendedMedicines: [],
          precautions: ['建议咨询专业医生'],
          references: [],
          urgency: '建议就医咨询',
          disclaimer: '以上内容仅供参考，不构成医疗建议。请咨询专业医生获取准确诊断和治疗方案。',
        },
        errors: [...state.errors, String(error)],
      };
    }
  }

  private buildContext(state: AgentState): string {
    let ctx = `用户问题: ${state.userMessage}\n`;

    if (state.coordinatorDecision) {
      ctx += `\n问题复杂度: ${state.coordinatorDecision.complexity}`;
      ctx += `\n分析: ${state.coordinatorDecision.reasoning}`;
    }

    if (state.diagnosticResults) {
      const dr = state.diagnosticResults;
      ctx += `\n\n【诊断结果】`;
      if (dr.symptoms?.length) ctx += `\n症状: ${dr.symptoms.join('、')}`;
      if (dr.possibleConditions?.length) {
        ctx += `\n可能疾病: ${dr.possibleConditions.map(c => `${c.name}(${c.probability}%)`).join('、')}`;
      }
      ctx += `\n紧急程度: ${dr.urgency}\n建议: ${dr.recommendation}`;
    }

    if (state.pharmacistResults) {
      const pr = state.pharmacistResults;
      ctx += `\n\n【药品推荐】`;
      pr.medicines.forEach((m, i) => {
        ctx += `\n${i + 1}. ${m.name} — ${m.indication} — ${m.usage}`;
      });
      if (pr.warnings?.length) ctx += `\n警告: ${pr.warnings.join('; ')}`;
    }

    if (state.researchResults) {
      const rr = state.researchResults;
      ctx += `\n\n【医学知识摘要】`;
      rr.keyFindings.forEach((f, i) => { ctx += `\n${i + 1}. ${f}`; });
    }

    return ctx;
  }

  private async generateAdvice(state: AgentState): Promise<AdvisorResult> {
    const context = this.buildContext(state);

    const prompt = `你是专业医疗顾问。请基于以下所有信息，生成一份全面、专业的用药建议。

${context}

请返回以下 JSON，不要添加其他内容：
{
  "summary": "对用户情况的简要概括（50-100字）",
  "diagnosis": "诊断说明（若有诊断信息则填写，否则省略此字段）",
  "recommendedMedicines": [
    {
      "name": "药品名称",
      "reason": "推荐理由",
      "usage": "用法用量",
      "precautions": ["注意事项1", "注意事项2"]
    }
  ],
  "precautions": ["总体注意事项1", "总体注意事项2"],
  "references": ["如有研究摘要则列出标题，否则空数组"],
  "urgency": "就医建议（一句话）",
  "disclaimer": "以上内容仅供参考，不构成医疗建议。请咨询专业医生获取准确诊断和治疗方案。"
}

要求：语言专业准确，突出重要警告，综合所有可用信息。`;

    return await this.invokeJSON<AdvisorResult>(prompt);
  }
}
