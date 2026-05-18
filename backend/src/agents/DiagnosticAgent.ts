import { BaseAgent } from './BaseAgent';
import { AgentState, DiagnosticResult } from './types';

export class DiagnosticAgent extends BaseAgent {
  constructor() {
    super('Diagnostic', '症状分析和疾病诊断');
  }

  async execute(state: AgentState): Promise<Partial<AgentState>> {
    this.log('开始症状分析...');

    try {
      const result = await this.diagnose(state.userMessage);
      this.log(`诊断完成 - 紧急程度: ${result.urgency}`);
      return { diagnosticResults: result, errors: [] };
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
        errors: [...state.errors, String(error)],
      };
    }
  }

  private async diagnose(message: string): Promise<DiagnosticResult> {
    const prompt = `你是专业医疗助手。请对以下用户描述进行一次完整的诊断分析。

用户描述: ${message}

请一次性返回以下 JSON，不要添加其他内容：
{
  "symptoms": ["症状1", "症状2"],
  "possibleConditions": [
    {
      "name": "疾病名称",
      "probability": 75,
      "severity": "mild|moderate|severe",
      "description": "简短描述"
    }
  ],
  "riskFactors": ["风险因素1"],
  "urgency": "low|medium|high",
  "recommendation": "就医建议（中文）"
}

urgency 判断标准：
- high：胸痛、呼吸困难、剧烈头痛、意识模糊、大出血、持续高烧
- medium：发烧、持续疼痛、呕吐、腹泻、头晕
- low：轻微不适，无上述症状`;

    return await this.invokeJSON<DiagnosticResult>(prompt);
  }
}
