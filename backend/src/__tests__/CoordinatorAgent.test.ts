import { describe, it, expect, vi, afterEach } from 'vitest';
import { sharedModel } from '../agents/BaseAgent';
import { CoordinatorAgent } from '../agents/CoordinatorAgent';

afterEach(() => vi.restoreAllMocks());

describe('CoordinatorAgent', () => {
  it('正常情况：生成包含 advisor 的执行计划', async () => {
    vi.spyOn(sharedModel, 'invoke').mockResolvedValueOnce({
      content: JSON.stringify({
        needsResearch: false,
        needsDiagnostic: true,
        needsPharmacist: true,
        complexity: 'medium',
        reasoning: '用户描述了症状',
      }),
    } as any);

    const agent = new CoordinatorAgent();
    const result = await agent.execute({ userMessage: '我头疼', errors: [] });

    expect(result.coordinatorDecision?.plan).toContain('advisor');
    expect(result.coordinatorDecision?.plan).toContain('diagnostic');
    expect(result.errors).toHaveLength(0);
  });

  it('降级场景：LLM 失败时只走 advisor，不强制走 pharmacist', async () => {
    vi.spyOn(sharedModel, 'invoke').mockRejectedValueOnce(new Error('API 超时'));

    const agent = new CoordinatorAgent();
    const result = await agent.execute({ userMessage: '我头疼', errors: [] });

    expect(result.coordinatorDecision?.plan).toEqual(['advisor']);
    expect(result.errors).toHaveLength(1);
  });

  it('complex + needsResearch：research 排在计划前面', async () => {
    vi.spyOn(sharedModel, 'invoke').mockResolvedValueOnce({
      content: JSON.stringify({
        needsResearch: true,
        needsDiagnostic: false,
        needsPharmacist: true,
        complexity: 'complex',
        reasoning: '药物相互作用问题',
      }),
    } as any);

    const agent = new CoordinatorAgent();
    const result = await agent.execute({ userMessage: '布洛芬和阿司匹林能一起吃吗', errors: [] });

    const plan = result.coordinatorDecision?.plan ?? [];
    expect(plan.indexOf('research')).toBeLessThan(plan.indexOf('pharmacist'));
    expect(plan[plan.length - 1]).toBe('advisor');
  });
});
