import { describe, it, expect, vi, afterEach } from 'vitest';
import { sharedModel } from '../agents/BaseAgent';
import { PharmacistAgent } from '../agents/PharmacistAgent';

afterEach(() => vi.restoreAllMocks());

const makePharmacistPayload = (overrides = {}) => ({
  medicines: [
    {
      name: '布洛芬缓释胶囊',
      genericName: '布洛芬',
      type: '非甾体抗炎药',
      indication: '缓解头痛、发热',
      usage: '成人一次1粒，一日2次',
      contraindication: '消化道溃疡患者禁用',
      sideEffects: ['胃肠道不适'],
      interactions: ['不宜与阿司匹林同用'],
    },
  ],
  warnings: ['用药前请阅读说明书'],
  ...overrides,
});

describe('PharmacistAgent', () => {
  it('正常情况：单次 LLM 调用，返回 medicines 和 warnings', async () => {
    vi.spyOn(sharedModel, 'invoke').mockResolvedValueOnce({
      content: JSON.stringify(makePharmacistPayload()),
    } as any);

    const agent = new PharmacistAgent();
    const result = await agent.execute({ userMessage: '我头痛发烧，推荐药品', errors: [] });

    expect(sharedModel.invoke).toHaveBeenCalledTimes(1);
    expect(result.pharmacistResults?.medicines).toHaveLength(1);
    expect(result.pharmacistResults?.warnings.length).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
  });

  it('降级场景：LLM 失败时返回兜底警告，errors 长度为 1', async () => {
    vi.spyOn(sharedModel, 'invoke').mockRejectedValueOnce(new Error('超时'));

    const agent = new PharmacistAgent();
    const result = await agent.execute({ userMessage: '头痛', errors: [] });

    expect(result.pharmacistResults?.medicines).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });
});
