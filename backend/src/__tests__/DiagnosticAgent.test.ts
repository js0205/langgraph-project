import { describe, it, expect, vi, afterEach } from 'vitest';
import { sharedModel } from '../agents/BaseAgent';
import { DiagnosticAgent } from '../agents/DiagnosticAgent';

afterEach(() => vi.restoreAllMocks());

const makeDiagnosticPayload = (overrides = {}) => ({
  symptoms: ['头痛', '发烧'],
  possibleConditions: [
    { name: '普通感冒', probability: 70, severity: 'mild', description: '病毒性上呼吸道感染' },
  ],
  riskFactors: ['发热可能导致脱水'],
  urgency: 'medium',
  recommendation: '建议观察症状',
  ...overrides,
});

describe('DiagnosticAgent', () => {
  it('正常情况：单次 LLM 调用，返回完整诊断结果', async () => {
    vi.spyOn(sharedModel, 'invoke').mockResolvedValueOnce({
      content: JSON.stringify(makeDiagnosticPayload()),
    } as any);

    const agent = new DiagnosticAgent();
    const result = await agent.execute({ userMessage: '我头痛发烧', errors: [] });

    expect(sharedModel.invoke).toHaveBeenCalledTimes(1);
    expect(result.diagnosticResults?.symptoms).toContain('头痛');
    expect(result.diagnosticResults?.urgency).toBe('medium');
    expect(result.errors).toHaveLength(0);
  });

  it('降级场景：LLM 失败时返回兜底结果，errors 长度为 1', async () => {
    vi.spyOn(sharedModel, 'invoke').mockRejectedValueOnce(new Error('网络超时'));

    const agent = new DiagnosticAgent();
    const result = await agent.execute({ userMessage: '我头痛', errors: [] });

    expect(result.diagnosticResults?.urgency).toBe('medium');
    expect(result.errors).toHaveLength(1);
  });

  it('high urgency 场景：LLM 返回 high urgency', async () => {
    vi.spyOn(sharedModel, 'invoke').mockResolvedValueOnce({
      content: JSON.stringify(makeDiagnosticPayload({ urgency: 'high', recommendation: '立即就医' })),
    } as any);

    const agent = new DiagnosticAgent();
    const result = await agent.execute({ userMessage: '我胸痛', errors: [] });

    expect(result.diagnosticResults?.urgency).toBe('high');
  });
});
