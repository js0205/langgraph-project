// 协调器 Agent - 负责分析问题并决定调用哪些 Agent

import { BaseAgent } from './BaseAgent';
import { AgentState, CoordinatorAnalysis } from './types';

/**
 * Coordinator Agent
 * 职责：分析用户问题，决定需要调用哪些专业 Agent
 */
export class CoordinatorAgent extends BaseAgent {
  constructor() {
    super('Coordinator', '问题分析和任务协调');
  }

  /**
   * 执行协调器任务
   * 分析用户问题的复杂度，决定调用哪些 Agent
   */
  async execute(state: AgentState): Promise<Partial<AgentState>> {
    this.log('开始分析用户问题...');

    try {
      // 使用 AI 分析问题
      const analysis = await this.analyzeQuestion(state.userMessage);

      // 根据分析结果制定执行计划
      const plan = this.createExecutionPlan(analysis);

      this.log(`分析完成 - 复杂度: ${analysis.complexity}`);
      this.log(`执行计划: ${plan.join(' → ')}`);

      return {
        coordinatorDecision: {
          needsResearch: analysis.needsResearch,
          needsDiagnostic: analysis.needsDiagnostic,
          needsPharmacist: analysis.needsPharmacist,
          complexity: analysis.complexity,
          plan: plan,
          reasoning: analysis.reasoning,
        },
        completedAgents: ['coordinator'],
        currentAgent: plan[0],  // 下一个要执行的 Agent
      };
    } catch (error) {
      this.logError('分析失败', error);
      return {
        coordinatorDecision: {
          needsResearch: false,
          needsDiagnostic: false,
          needsPharmacist: true,
          complexity: 'simple',
          plan: ['pharmacist', 'advisor'],
          reasoning: '分析失败，使用默认流程',
        },
        completedAgents: ['coordinator'],
        currentAgent: 'pharmacist',
        errors: [String(error)],
      };
    }
  }

  /**
   * 分析用户问题
   */
  private async analyzeQuestion(message: string): Promise<CoordinatorAnalysis> {
    const prompt = `你是一个医药咨询系统的协调器。请分析以下用户问题，判断需要调用哪些专业模块。

用户问题: ${message}

请分析：
1. **是否需要医学文献研究 (needsResearch)**：
   - 复杂的药物相互作用问题（如"X药和Y药能一起吃吗？"）
   - 罕见疾病或症状
   - 需要权威医学依据的问题
   - 示例：是 - "布洛芬和阿司匹林能一起吃吗？"
   - 示例：否 - "布洛芬的用法用量"

2. **是否需要诊断分析 (needsDiagnostic)**：
   - 用户描述了症状（如头疼、发烧、咳嗽等）
   - 需要疾病推理和严重程度评估
   - 需要判断是否需要就医
   - 示例：是 - "我头疼发烧咳嗽"
   - 示例：否 - "布洛芬的价格是多少"

3. **是否需要药品查询 (needsPharmacist)**：
   - 询问特定药品信息
   - 根据症状推荐药品
   - 查询用法用量、副作用等
   - 示例：是 - 几乎所有医药咨询都需要

4. **问题复杂度 (complexity)**：
   - simple: 单一药品查询，无症状描述
   - medium: 有症状描述，需要推荐药品
   - complex: 多药物交互、罕见疾病、需要深度分析

请以 JSON 格式回复：
{
  "needsResearch": true/false,
  "needsDiagnostic": true/false,
  "needsPharmacist": true/false,
  "complexity": "simple/medium/complex",
  "reasoning": "你的分析原因（中文）"
}

注意：
- 只返回 JSON，不要添加其他内容
- reasoning 用中文解释你的判断依据`;

    return await this.invokeJSON<CoordinatorAnalysis>(prompt);
  }

  /**
   * 根据分析结果创建执行计划
   */
  private createExecutionPlan(analysis: CoordinatorAnalysis): string[] {
    const plan: string[] = [];

    // 根据复杂度和需求决定顺序
    if (analysis.complexity === 'complex' && analysis.needsResearch) {
      // 复杂问题：先研究文献
      plan.push('research');
    }

    if (analysis.needsDiagnostic) {
      // 有症状：进行诊断分析
      plan.push('diagnostic');
    }

    if (analysis.needsPharmacist) {
      // 需要药品信息
      plan.push('pharmacist');
    }

    // 如果有研究需求但不是很复杂，放在后面
    if (analysis.needsResearch && analysis.complexity !== 'complex') {
      if (!plan.includes('research')) {
        plan.push('research');
      }
    }

    // 总是需要最终的建议生成
    plan.push('advisor');

    // 如果没有任何专业 Agent，至少要有 advisor
    if (plan.length === 1) {
      plan.unshift('pharmacist');  // 添加一个默认的药品查询
    }

    return plan;
  }
}
