// 顾问 Agent - 负责综合所有信息生成最终建议

import { BaseAgent } from './BaseAgent';
import { AgentState, AdvisorResult } from './types';

/**
 * Advisor Agent
 * 职责：综合所有 Agent 的信息，生成最终的专业建议
 */
export class AdvisorAgent extends BaseAgent {
  constructor() {
    super('Advisor', '综合建议生成');
  }

  /**
   * 执行顾问任务
   */
  async execute(state: AgentState): Promise<Partial<AgentState>> {
    this.log('开始生成最终建议...');

    try {
      // 收集所有可用信息
      const allInfo = this.collectAllInformation(state);

      // 生成综合建议
      const advice = await this.generateAdvice(allInfo, state);

      const result: AdvisorResult = {
        summary: advice.summary,
        diagnosis: advice.diagnosis,
        recommendedMedicines: advice.recommendedMedicines,
        precautions: advice.precautions,
        references: advice.references,
        urgency: advice.urgency,
        disclaimer: advice.disclaimer,
      };

      // 更新已完成的 Agent 列表
      const completed = [...(state.completedAgents || []), 'advisor'];

      this.log('最终建议生成完成');

      return {
        advisorResults: result,
        completedAgents: completed,
      };
    } catch (error) {
      this.logError('建议生成失败', error);
      return {
        advisorResults: {
          summary: '抱歉，无法生成完整建议',
          recommendedMedicines: [],
          precautions: ['建议咨询专业医生'],
          references: [],
          urgency: '建议就医咨询',
          disclaimer: '以上内容仅供参考，不构成医疗建议。请咨询专业医生获取准确诊断和治疗方案。',
        },
        errors: [...(state.errors || []), String(error)],
      };
    }
  }

  /**
   * 收集所有可用信息
   */
  private collectAllInformation(state: AgentState): string {
    let info = `用户问题: ${state.userMessage}\n\n`;

    // 协调器决策
    if (state.coordinatorDecision) {
      info += `问题分析:\n`;
      info += `- 复杂度: ${state.coordinatorDecision.complexity}\n`;
      info += `- 原因: ${state.coordinatorDecision.reasoning}\n\n`;
    }

    // 诊断结果
    if (state.diagnosticResults) {
      const dr = state.diagnosticResults;
      info += `诊断分析:\n`;
      if (dr.symptoms && dr.symptoms.length > 0) {
        info += `- 症状: ${dr.symptoms.join('、')}\n`;
      }
      if (dr.possibleConditions && dr.possibleConditions.length > 0) {
        info += `- 可能疾病: ${dr.possibleConditions.map(c => `${c.name}(${c.probability}%)`).join('、')}\n`;
      }
      info += `- 紧急程度: ${dr.urgency}\n`;
      info += `- 建议: ${dr.recommendation}\n\n`;
    }

    // 药品信息
    if (state.pharmacistResults) {
      const pr = state.pharmacistResults;
      info += `药品推荐:\n`;
      if (pr.medicines && pr.medicines.length > 0) {
        pr.medicines.forEach((med, idx) => {
          info += `${idx + 1}. ${med.name} (${med.type})\n`;
          info += `   适应症: ${med.indication}\n`;
          info += `   用法: ${med.usage}\n`;
        });
      }
      if (pr.warnings && pr.warnings.length > 0) {
        info += `\n警告: ${pr.warnings.join('; ')}\n`;
      }
      info += `\n`;
    }

    // 研究结果
    if (state.researchResults) {
      const rr = state.researchResults;
      info += `文献研究:\n`;
      if (rr.keyFindings && rr.keyFindings.length > 0) {
        rr.keyFindings.forEach((finding, idx) => {
          info += `${idx + 1}. ${finding}\n`;
        });
      }
      if (rr.sources && rr.sources.length > 0) {
        info += `\n参考文献: ${rr.sources.length} 篇\n\n`;
      }
    }

    return info;
  }

  /**
   * 生成综合建议
   */
  private async generateAdvice(allInfo: string, state: AgentState): Promise<{
    summary: string;
    diagnosis?: string;
    recommendedMedicines: Array<{
      name: string;
      reason: string;
      usage: string;
      precautions: string[];
    }>;
    precautions: string[];
    references: string[];
    urgency: string;
    disclaimer: string;
  }> {
    const prompt = `作为专业医疗顾问，请基于以下所有信息，生成一份全面、专业的用药建议。

${allInfo}

请生成以下内容：
1. **总结** (summary): 对用户问题和情况的简要概括（50-100字）
2. **诊断说明** (diagnosis): 对症状和可能疾病的说明（如果有诊断信息）
3. **推荐药品** (recommendedMedicines): 详细的药品推荐，包括：
   - name: 药品名称
   - reason: 推荐理由
   - usage: 用法用量
   - precautions: 注意事项（数组）
4. **总体注意事项** (precautions): 用药和护理的注意事项（数组，3-5条）
5. **参考来源** (references): 如果有研究结果，列出文献标题（数组）
6. **紧急程度** (urgency): 就医建议
7. **免责声明** (disclaimer): 标准免责声明

以 JSON 格式返回：
{
  "summary": "简要总结",
  "diagnosis": "诊断说明（可选）",
  "recommendedMedicines": [
    {
      "name": "药品名称",
      "reason": "推荐理由",
      "usage": "用法用量",
      "precautions": ["注意事项1", "注意事项2"]
    }
  ],
  "precautions": [
    "总体注意事项1",
    "总体注意事项2",
    "总体注意事项3"
  ],
  "references": ["参考文献1", "参考文献2"],
  "urgency": "就医建议",
  "disclaimer": "本建议仅供参考，不构成医疗建议。具体用药请咨询专业医生。"
}

要求：
- 语言专业、准确、易懂
- 综合所有可用信息
- 突出重要的注意事项和警告
- 只返回 JSON 对象，不要添加其他内容`;

    try {
      const advice = await this.invokeJSON<any>(prompt);

      // 确保必要字段存在
      return {
        summary: advice.summary || '建议咨询专业医生',
        diagnosis: advice.diagnosis,
        recommendedMedicines: advice.recommendedMedicines || [],
        precautions: advice.precautions || ['请咨询专业医生'],
        references: advice.references || [],
        urgency: advice.urgency || state.diagnosticResults?.recommendation || '建议咨询专业医生',
        disclaimer: advice.disclaimer || '以上内容仅供参考，不构成医疗建议。请咨询专业医生获取准确诊断和治疗方案。',
      };
    } catch (error) {
      this.logError('JSON 解析失败，使用默认值', error);

      // 构建简单的建议
      const medicines = state.pharmacistResults?.medicines || [];
      const recommendedMedicines = medicines.map(med => ({
        name: med.name,
        reason: med.indication || '对症治疗',
        usage: med.usage || '请参考说明书',
        precautions: med.sideEffects || ['使用前请阅读说明书'],
      }));

      return {
        summary: '根据您的情况，为您推荐以下药品',
        diagnosis: state.diagnosticResults?.possibleConditions?.[0]?.description,
        recommendedMedicines,
        precautions: [
          '用药前请仔细阅读药品说明书',
          '如症状持续或加重，请及时就医',
          '注意观察药物副作用',
        ],
        references: state.researchResults?.sources.map(s => s.title) || [],
        urgency: state.diagnosticResults?.recommendation || '如有疑问，请咨询专业医生',
        disclaimer: '以上内容仅供参考，不构成医疗建议。请咨询专业医生获取准确诊断和治疗方案。',
      };
    }
  }
}
