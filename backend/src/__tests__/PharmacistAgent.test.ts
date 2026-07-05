import { describe, it, expect, vi, afterEach } from 'vitest';
import { sharedModel } from '../agents/BaseAgent';
import { PharmacistAgent } from '../agents/PharmacistAgent';
import * as vs from '../retrieval/vectorStore';

afterEach(() => vi.restoreAllMocks());

const llmMedicines = {
  medicines: [{ name: '布洛芬缓释胶囊', type: '非甾体抗炎药', indication: '缓解头痛', usage: '一次1粒，一日2次' }],
  warnings: ['用药前请咨询医生'],
};

describe('PharmacistAgent', () => {
  it('检索有结果：sources 填真实出处，prompt 注入原文', async () => {
    const spy = vi.spyOn(vs, 'searchDrugLabels').mockResolvedValueOnce([
      { content: '成人一次1粒，一日2次', drugName: '布洛芬', section: '用法用量', source: 'NMPA说明书' },
    ]);
    const invoke = vi.spyOn(sharedModel, 'invoke').mockResolvedValueOnce({
      content: JSON.stringify(llmMedicines),
    } as any);

    const agent = new PharmacistAgent();
    const result = await agent.execute({ userMessage: '头痛推荐药品', errors: [] });

    expect(spy).toHaveBeenCalled();
    expect(String(invoke.mock.calls[0][0])).toContain('成人一次1粒'); // 原文进了 prompt
    expect(result.pharmacistResults?.sources).toContain('NMPA说明书:布洛芬-用法用量');
    expect(result.errors).toHaveLength(0);
  });

  it('检索为空：降级且 warnings 含未检索提示', async () => {
    vi.spyOn(vs, 'searchDrugLabels').mockResolvedValueOnce([]);
    vi.spyOn(sharedModel, 'invoke').mockResolvedValueOnce({
      content: JSON.stringify(llmMedicines),
    } as any);

    const agent = new PharmacistAgent();
    const result = await agent.execute({ userMessage: '冷门药', errors: [] });

    expect(result.pharmacistResults?.warnings.some((w) => w.includes('未检索到说明书'))).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('检索抛错：不崩溃，返回兜底且 errors 长度为 1', async () => {
    vi.spyOn(vs, 'searchDrugLabels').mockRejectedValueOnce(new Error('DB down'));

    const agent = new PharmacistAgent();
    const result = await agent.execute({ userMessage: '头痛', errors: [] });

    expect(result.pharmacistResults?.medicines).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });
});
