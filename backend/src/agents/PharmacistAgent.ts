// 药剂师 Agent - 负责药品查询和推荐

import { BaseAgent } from './BaseAgent';
import { AgentState, PharmacistResult } from './types';

/**
 * Pharmacist Agent
 * 职责：查询药品信息，推荐合适的药物，检查相互作用和禁忌
 */
export class PharmacistAgent extends BaseAgent {
  constructor() {
    super('Pharmacist', '药品查询和推荐');
  }

  /**
   * 执行药剂师任务
   */
  async execute(state: AgentState): Promise<Partial<AgentState>> {
    this.log('开始药品查询...');

    try {
      // 获取上下文信息
      const context = this.buildContext(state);

      // 查询药品
      const medicines = await this.queryMedicines(context);
      this.log(`查询到 ${medicines.length} 种药品`);

      // 检查药物相互作用（如果有多种药品）
      const interactions = await this.checkInteractions(medicines, context);

      // 生成警告信息
      const warnings = this.generateWarnings(medicines, interactions, state);

      const result: PharmacistResult = {
        medicines,
        warnings,
      };

      // 更新已完成的 Agent 列表
      const completed = [...(state.completedAgents || []), 'pharmacist'];

      return {
        pharmacistResults: result,
        completedAgents: completed,
      };
    } catch (error) {
      this.logError('药品查询失败', error);
      return {
        pharmacistResults: {
          medicines: [],
          warnings: ['药品查询失败，请咨询专业医生或药剂师'],
        },
        errors: [...(state.errors || []), String(error)],
      };
    }
  }

  /**
   * 构建查询上下文
   */
  private buildContext(state: AgentState): string {
    let context = `用户问题: ${state.userMessage}\n`;

    // 如果有诊断结果，添加诊断信息
    if (state.diagnosticResults) {
      const { symptoms, possibleConditions } = state.diagnosticResults;
      if (symptoms && symptoms.length > 0) {
        context += `症状: ${symptoms.join('、')}\n`;
      }
      if (possibleConditions && possibleConditions.length > 0) {
        context += `可能的疾病: ${possibleConditions.map(c => c.name).join('、')}\n`;
      }
    }

    return context;
  }

  /**
   * 查询药品信息
   */
  private async queryMedicines(context: string): Promise<Array<{
    name: string;
    genericName?: string;
    type: string;
    indication: string;
    usage: string;
    contraindication?: string;
    sideEffects?: string[];
    interactions?: string[];
    price?: {
      min: number;
      max: number;
      currency: string;
    };
  }>> {
    const prompt = `作为专业药剂师，请根据以下信息推荐合适的非处方药（OTC）。

${context}

请推荐 2-3 种合适的药品，包含以下信息：
1. 药品名称（商品名）
2. 通用名（化学名，如果适用）
3. 药品类型（如：解热镇痛药、感冒药、止咳药等）
4. 适应症（什么情况下使用）
5. 用法用量（详细说明）
6. 禁忌症（哪些人不能用）
7. 常见副作用（2-3个）
8. 药物相互作用（可能的）
9. 大概价格区间

以 JSON 格式返回：
[
  {
    "name": "布洛芬缓释胶囊",
    "genericName": "布洛芬",
    "type": "非甾体抗炎药（NSAID）",
    "indication": "用于缓解轻至中度疼痛如头痛、关节痛、偏头痛、牙痛、肌肉痛等，也用于普通感冒或流行性感冒引起的发热",
    "usage": "口服。成人一次1粒（0.3g），一日2次。24小时内不超过4粒",
    "contraindication": "对本品过敏者、消化道溃疡患者、严重肝肾功能不全者禁用",
    "sideEffects": ["胃肠道不适", "头晕", "皮疹"],
    "interactions": ["不宜与阿司匹林同用", "与抗凝药合用需谨慎"],
    "price": {
      "min": 10,
      "max": 30,
      "currency": "CNY"
    }
  }
]

要求：
- 只推荐非处方药（OTC）
- 信息要准确、详细
- 价格以人民币计
- 只返回 JSON 数组，不要添加其他内容`;

    try {
      return await this.invokeJSON(prompt);
    } catch (error) {
      this.logError('JSON 解析失败，使用默认值', error);
      return [{
        name: '对症药物',
        type: '常用药',
        indication: '请根据具体症状选择合适的非处方药',
        usage: '请咨询药剂师或参考说明书',
        contraindication: '过敏者禁用',
        sideEffects: ['可能的副作用'],
      }];
    }
  }

  /**
   * 检查药物相互作用
   */
  private async checkInteractions(
    medicines: Array<{ name: string }>,
    context: string
  ): Promise<string[]> {
    // 如果只有一种药品，不需要检查相互作用
    if (medicines.length <= 1) {
      return [];
    }

    const medicineNames = medicines.map(m => m.name).join('、');

    const prompt = `请分析以下药物之间是否存在相互作用：

药物: ${medicineNames}
上下文: ${context}

如果存在药物相互作用，请列出：
1. 哪些药物组合有风险
2. 可能的相互作用后果
3. 建议

以 JSON 数组格式返回：
["相互作用描述1", "相互作用描述2"]

如果没有明显的相互作用，返回空数组 []

只返回 JSON 数组，不要添加其他内容。`;

    try {
      return await this.invokeJSON<string[]>(prompt);
    } catch {
      return [];
    }
  }

  /**
   * 生成警告信息
   */
  private generateWarnings(
    medicines: Array<{ name: string; contraindication?: string }>,
    interactions: string[],
    state: AgentState
  ): string[] {
    const warnings: string[] = [];

    // 紧急情况警告
    if (state.diagnosticResults?.urgency === 'high') {
      warnings.push('⚠️ 您的症状可能比较严重，建议立即就医，不要仅依赖非处方药');
    }

    // 药物相互作用警告
    if (interactions.length > 0) {
      warnings.push(...interactions);
    }

    // 禁忌症警告
    const contraindications = medicines
      .filter(m => m.contraindication)
      .map(m => `${m.name}: ${m.contraindication}`);

    if (contraindications.length > 0) {
      warnings.push('⚠️ 请注意以下禁忌症：');
      warnings.push(...contraindications);
    }

    // 通用警告
    warnings.push('💊 以上药品信息仅供参考，具体用药请咨询专业医生或药剂师');
    warnings.push('📋 用药前请仔细阅读药品说明书');
    warnings.push('⏱️ 如果症状持续或加重，请及时就医');

    return warnings;
  }
}
