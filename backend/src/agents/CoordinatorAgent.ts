import { BaseAgent } from './BaseAgent';
import { AgentState, CoordinatorAnalysis } from './types';

export class CoordinatorAgent extends BaseAgent {
  constructor() {
    super('Coordinator', '问题分析和任务协调');
  }

  async execute(state: AgentState): Promise<Partial<AgentState>> {
    this.log('开始分析用户问题...');

    try {
      const analysis = await this.analyzeQuestion(state.userMessage);
      const plan = this.buildPlan(analysis);

      this.log(`分析完成 - 复杂度: ${analysis.complexity}`);
      this.log(`执行计划: ${plan.join(' → ')}`);

      return {
        coordinatorDecision: {
          needsResearch: analysis.needsResearch,
          needsDiagnostic: analysis.needsDiagnostic,
          needsPharmacist: analysis.needsPharmacist,
          complexity: analysis.complexity,
          plan,
          reasoning: analysis.reasoning,
        },
        errors: [],
      };
    } catch (error) {
      this.logError('分析失败', error);
      return {
        coordinatorDecision: {
          needsResearch: false,
          needsDiagnostic: false,
          needsPharmacist: false,
          complexity: 'simple',
          plan: ['advisor'],
          reasoning: '协调器分析失败，已切换至兜底模式',
        },
        errors: [String(error)],
      };
    }
  }

  private async analyzeQuestion(message: string): Promise<CoordinatorAnalysis> {
    const prompt = `你是一个医药咨询系统的协调器。请分析以下用户问题，判断需要调用哪些专业模块。

用户问题: ${message}

请分析：
1. needsResearch：是否涉及复杂药物相互作用、罕见疾病或需要权威医学依据
2. needsDiagnostic：用户是否描述了症状（头疼、发烧等），需要疾病推理和严重程度评估
3. needsPharmacist：是否需要药品信息、用法用量、副作用等
4. complexity：simple（单一药品查询）/ medium（有症状、需推荐）/ complex（多药物交互、罕见病）

只返回以下 JSON，不要添加其他内容：
{
  "needsResearch": true/false,
  "needsDiagnostic": true/false,
  "needsPharmacist": true/false,
  "complexity": "simple/medium/complex",
  "reasoning": "分析原因（中文）"
}`;

    return await this.invokeJSON<CoordinatorAnalysis>(prompt);
  }

  private buildPlan(analysis: CoordinatorAnalysis): string[] {
    const plan: string[] = [];

    // complex 且需要研究时，research 最先执行
    if (analysis.needsResearch && analysis.complexity === 'complex') {
      plan.push('research');
    }

    if (analysis.needsDiagnostic) {
      plan.push('diagnostic');
    }

    if (analysis.needsPharmacist) {
      plan.push('pharmacist');
    }

    // 非 complex 的 research 放在 pharmacist 之后
    if (analysis.needsResearch && analysis.complexity !== 'complex') {
      plan.push('research');
    }

    // advisor 始终压轴
    plan.push('advisor');

    return plan;
  }
}
