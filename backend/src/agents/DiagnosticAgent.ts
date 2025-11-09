// 诊断 Agent - 负责症状分析和疾病推理

import { BaseAgent } from './BaseAgent';
import { AgentState, DiagnosticResult } from './types';

/**
 * Diagnostic Agent
 * 职责：深度分析症状，推理可能的病因和风险
 */
export class DiagnosticAgent extends BaseAgent {
  constructor() {
    super('Diagnostic', '症状分析和疾病诊断');
  }

  /**
   * 执行诊断任务
   */
  async execute(state: AgentState): Promise<Partial<AgentState>> {
    this.log('开始症状分析...');

    try {
      // 步骤1：提取症状
      const symptoms = await this.extractSymptoms(state.userMessage);
      this.log(`提取症状: ${symptoms.join(', ')}`);

      // 步骤2：推理可能的疾病
      const conditions = await this.inferConditions(symptoms, state.userMessage);
      this.log(`推理出 ${conditions.length} 种可能的疾病`);

      // 步骤3：评估严重程度和紧急性
      const urgency = await this.assessUrgency(symptoms, conditions);
      this.log(`紧急程度: ${urgency}`);

      // 步骤4：生成建议
      const recommendation = this.generateRecommendation(urgency, conditions);

      const result: DiagnosticResult = {
        symptoms,
        possibleConditions: conditions,
        riskFactors: this.identifyRiskFactors(symptoms, conditions),
        urgency,
        recommendation,
      };

      // 更新已完成的 Agent 列表
      const completed = [...(state.completedAgents || []), 'diagnostic'];

      return {
        diagnosticResults: result,
        completedAgents: completed,
      };
    } catch (error) {
      this.logError('诊断分析失败', error);
      return {
        diagnosticResults: {
          symptoms: [],
          possibleConditions: [],
          riskFactors: [],
          urgency: 'medium',
          recommendation: '建议咨询专业医生',
        },
        errors: [...(state.errors || []), String(error)],
      };
    }
  }

  /**
   * 从用户消息中提取症状
   */
  private async extractSymptoms(message: string): Promise<string[]> {
    const prompt = `请从以下用户描述中提取症状关键词。

用户描述: ${message}

要求：
1. 只提取明确的症状（如头痛、发烧、咳嗽、恶心等）
2. 不要包含情绪描述或无关信息
3. 返回标准化的医学术语

以 JSON 数组格式返回：
["症状1", "症状2", "症状3"]

只返回 JSON 数组，不要添加其他内容。`;

    try {
      return await this.invokeJSON<string[]>(prompt);
    } catch {
      // 如果解析失败，使用简单的文本提取
      const response = await this.invokeText(prompt);
      const matches = response.match(/[""']([^""']+)[""']/g);
      return matches ? matches.map(s => s.replace(/[""']/g, '')) : [];
    }
  }

  /**
   * 根据症状推理可能的疾病
   */
  private async inferConditions(
    symptoms: string[],
    originalMessage: string
  ): Promise<Array<{
    name: string;
    probability: number;
    severity: 'mild' | 'moderate' | 'severe';
    description: string;
  }>> {
    if (symptoms.length === 0) {
      return [];
    }

    const prompt = `作为专业医疗助手，请根据以下症状推理可能的疾病或健康问题。

症状: ${symptoms.join('、')}
原始描述: ${originalMessage}

请分析：
1. 最可能的 2-3 种疾病或健康问题
2. 每种疾病的可能性（概率 0-100）
3. 严重程度（mild/moderate/severe）
4. 简短描述

以 JSON 格式返回：
[
  {
    "name": "疾病名称",
    "probability": 75,
    "severity": "moderate",
    "description": "简短描述该疾病的特征"
  }
]

注意：
- 只返回 JSON 数组
- probability 是 0-100 的整数
- severity 只能是 mild、moderate 或 severe
- 按概率从高到低排序`;

    try {
      return await this.invokeJSON(prompt);
    } catch (error) {
      this.logError('疾病推理失败，使用默认值', error);
      return [{
        name: '常见疾病',
        probability: 50,
        severity: 'mild',
        description: '根据症状判断可能是常见的轻微疾病',
      }];
    }
  }

  /**
   * 评估紧急程度
   */
  private async assessUrgency(
    symptoms: string[],
    conditions: Array<{ severity: string }>
  ): Promise<'low' | 'medium' | 'high'> {
    // 基于症状的紧急关键词
    const highUrgencyKeywords = [
      '胸痛', '呼吸困难', '剧烈头痛', '意识模糊',
      '大出血', '严重创伤', '持续高烧', '昏迷'
    ];

    const mediumUrgencyKeywords = [
      '发烧', '持续疼痛', '呕吐', '腹泻', '头晕'
    ];

    // 检查高紧急症状
    const hasHighUrgency = symptoms.some(symptom =>
      highUrgencyKeywords.some(keyword => symptom.includes(keyword))
    );

    if (hasHighUrgency) {
      return 'high';
    }

    // 检查严重疾病
    const hasSevereCondition = conditions.some(c => c.severity === 'severe');
    if (hasSevereCondition) {
      return 'high';
    }

    // 检查中等紧急症状
    const hasMediumUrgency = symptoms.some(symptom =>
      mediumUrgencyKeywords.some(keyword => symptom.includes(keyword))
    );

    if (hasMediumUrgency) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * 生成就医建议
   */
  private generateRecommendation(
    urgency: string,
    conditions: Array<{ name: string; severity: string }>
  ): string {
    if (urgency === 'high') {
      return '⚠️ 建议立即就医或拨打急救电话120。您的症状可能需要紧急医疗处理。';
    }

    if (urgency === 'medium') {
      const hasModerate = conditions.some(c => c.severity === 'moderate');
      if (hasModerate) {
        return '建议尽快就医咨询专业医生。如果症状持续或加重，请及时就医。';
      }
      return '建议观察症状，如果持续不缓解，请就医咨询。可以先尝试非处方药物缓解症状。';
    }

    return '症状较轻，可以先尝试非处方药物缓解。如果症状持续超过3天或加重，请就医咨询。';
  }

  /**
   * 识别风险因素
   */
  private identifyRiskFactors(
    symptoms: string[],
    conditions: Array<{ name: string; severity: string }>
  ): string[] {
    const risks: string[] = [];

    // 基于症状的风险
    if (symptoms.includes('发烧') || symptoms.includes('高烧')) {
      risks.push('发热可能导致脱水，注意补充水分');
    }

    if (symptoms.includes('头痛') && symptoms.includes('发烧')) {
      risks.push('头痛伴发烧可能提示感染，需要密切观察');
    }

    // 基于疾病严重程度的风险
    const hasSevere = conditions.some(c => c.severity === 'severe');
    if (hasSevere) {
      risks.push('存在严重健康风险，强烈建议就医');
    }

    // 默认风险提示
    if (risks.length === 0) {
      risks.push('请注意观察症状变化');
    }

    return risks;
  }
}
