import { describe, it, expect, vi, afterEach } from 'vitest';
import { sharedModel } from '../agents/BaseAgent';
import { AdvisorAgent } from '../agents/AdvisorAgent';

afterEach(() => vi.restoreAllMocks());

const makeAdvisorPayload = (overrides = {}) => ({
  summary: '您描述了头痛和发烧的症状',
  diagnosis: '可能为普通感冒',
  recommendedMedicines: [
    { name: '布洛芬', reason: '退烧止痛', usage: '一日2次', precautions: ['饭后服用'] },
  ],
  precautions: ['多饮水', '注意休息'],
  references: [],
  urgency: '症状较轻，可先居家观察',
  disclaimer: '以上仅供参考，请咨询医生',
  ...overrides,
});

describe('AdvisorAgent', () => {
  it('正常情况：单次 LLM 调用，返回完整建议', async () => {
    vi.spyOn(sharedModel, 'invoke').mockResolvedValueOnce({
      content: JSON.stringify(makeAdvisorPayload()),
    } as any);

    const agent = new AdvisorAgent();
    const result = await agent.execute({ userMessage: '我头痛发烧', errors: [] });

    expect(sharedModel.invoke).toHaveBeenCalledTimes(1);
    expect(result.advisorResults?.summary).toBeTruthy();
    expect(result.advisorResults?.disclaimer).toBeTruthy();
    expect(result.errors).toHaveLength(0);
  });

  it('降级场景：LLM 失败时返回兜底建议，errors 长度为 1', async () => {
    vi.spyOn(sharedModel, 'invoke').mockRejectedValueOnce(new Error('LLM 失败'));

    const agent = new AdvisorAgent();
    const result = await agent.execute({ userMessage: '头痛', errors: [] });

    expect(result.advisorResults?.disclaimer).toBeTruthy();
    expect(result.errors).toHaveLength(1);
  });

  it('汇总已有诊断和药品信息时不额外调用 LLM', async () => {
    vi.spyOn(sharedModel, 'invoke').mockResolvedValueOnce({
      content: JSON.stringify(makeAdvisorPayload()),
    } as any);

    const agent = new AdvisorAgent();
    await agent.execute({
      userMessage: '头痛',
      errors: [],
      diagnosticResults: {
        symptoms: ['头痛'],
        possibleConditions: [{ name: '感冒', probability: 80, severity: 'mild', description: '病毒性感冒' }],
        riskFactors: [],
        urgency: 'low',
        recommendation: '居家休息',
      },
      pharmacistResults: {
        medicines: [{ name: '对乙酰氨基酚', type: '解热镇痛', indication: '退烧', usage: '一日3次' }],
        warnings: [],
      },
    });

    expect(sharedModel.invoke).toHaveBeenCalledTimes(1);
  });
});
