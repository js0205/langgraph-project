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

  // Advisor prompt 上下文长度上限。超出时优先裁剪研究摘要(优先级最低),
  // 保留诊断结论与药品推荐,避免静默丢弃关键医疗信息。
  private static readonly MAX_CONTEXT_LEN = 4000;

  private buildContext(state: AgentState): string {
    // 核心信息(必留):用户问题、复杂度、诊断结论、药品推荐
    let core = `用户问题: ${state.userMessage}\n`;

    if (state.coordinatorDecision) {
      core += `\n问题复杂度: ${state.coordinatorDecision.complexity}`;
      core += `\n分析: ${state.coordinatorDecision.reasoning}`;
    }

    if (state.diagnosticResults) {
      const dr = state.diagnosticResults;
      core += `\n\n【诊断结果】`;
      if (dr.symptoms?.length) core += `\n症状: ${dr.symptoms.join('、')}`;
      if (dr.possibleConditions?.length) {
        core += `\n可能疾病: ${dr.possibleConditions.map(c => `${c.name}(${c.probability}%)`).join('、')}`;
      }
      core += `\n紧急程度: ${dr.urgency}\n建议: ${dr.recommendation}`;
    }

    if (state.pharmacistResults) {
      const pr = state.pharmacistResults;
      core += `\n\n【药品推荐】`;
      pr.medicines.forEach((m, i) => {
        core += `\n${i + 1}. ${m.name} — ${m.indication} — ${m.usage}`;
      });
      if (pr.warnings?.length) core += `\n警告: ${pr.warnings.join('; ')}`;
    }

    // 研究摘要(可裁剪):优先级最低,仅取 keyFindings(已是一句话结论),不透传 findings 全文
    let research = '';
    if (state.researchResults?.keyFindings?.length) {
      research += `\n\n【医学知识摘要】`;
      state.researchResults.keyFindings.forEach((f, i) => { research += `\n${i + 1}. ${f}`; });
    }

    // 长度守卫:优先保住核心信息,研究摘要按剩余预算截断,严禁静默丢弃
    if (!research) return core;
    const budget = AdvisorAgent.MAX_CONTEXT_LEN - core.length;
    if (research.length <= budget) return core + research;

    if (budget > 0) {
      this.log(`⚠️ Advisor 上下文超长,研究摘要按预算截断(${research.length}→${budget}字符)`);
      return core + research.slice(0, budget) + '\n[部分研究摘要因长度限制已省略]';
    }

    // 极端情况:仅核心信息就已达上限,完全放弃研究摘要
    this.log(`⚠️ Advisor 核心信息已达上限(${core.length}字符),已丢弃全部研究摘要`);
    return core;
  }

  private async generateAdvice(state: AgentState): Promise<AdvisorResult> {
    const context = this.buildContext(state);
    // 常态化记录上下文长度,便于按真实数据校准 MAX_CONTEXT_LEN 阈值
    this.log(`Advisor 上下文长度: ${context.length}/${AdvisorAgent.MAX_CONTEXT_LEN} 字符`);

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
