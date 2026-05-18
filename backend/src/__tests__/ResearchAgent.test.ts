import { describe, it, expect, vi, afterEach } from 'vitest';
import { sharedModel } from '../agents/BaseAgent';
import { ResearchAgent } from '../agents/ResearchAgent';

afterEach(() => vi.restoreAllMocks());

const makeResearchPayload = (overrides = {}) => ({
  findings: [
    { title: '布洛芬药物相互作用研究', summary: '布洛芬与阿司匹林同用可能增加出血风险', relevance: 90, label: '[AI知识摘要]' },
  ],
  keyFindings: ['布洛芬与阿司匹林有相互作用风险'],
  ...overrides,
});

describe('ResearchAgent', () => {
  it('正常情况：单次 LLM 调用，findings 中无 url 字段', async () => {
    vi.spyOn(sharedModel, 'invoke').mockResolvedValueOnce({
      content: JSON.stringify(makeResearchPayload()),
    } as any);

    const agent = new ResearchAgent();
    const result = await agent.execute({ userMessage: '布洛芬和阿司匹林能一起吃吗', errors: [] });

    expect(sharedModel.invoke).toHaveBeenCalledTimes(1);
    const finding = result.researchResults?.findings[0];
    expect(finding).not.toHaveProperty('url');
    expect(finding?.label).toBe('[AI知识摘要]');
    expect(result.errors).toHaveLength(0);
  });

  it('降级场景：LLM 失败时返回空结果，errors 长度为 1', async () => {
    vi.spyOn(sharedModel, 'invoke').mockRejectedValueOnce(new Error('API 失败'));

    const agent = new ResearchAgent();
    const result = await agent.execute({ userMessage: '测试', errors: [] });

    expect(result.researchResults?.findings).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });
});
