import { describe, it, expect, vi, afterEach } from 'vitest';
import { sharedModel } from '../agents/BaseAgent';
import { ResearchAgent } from '../agents/ResearchAgent';
import * as pubmed from '../retrieval/pubmedClient';

afterEach(() => vi.restoreAllMocks());

const llmKeyFindings = { keyFindings: ['布洛芬与阿司匹林有出血风险'] };

describe('ResearchAgent', () => {
  it('检索成功：findings 带真实 PMID，label 为 [PubMed]', async () => {
    vi.spyOn(pubmed, 'searchArticles').mockResolvedValueOnce([
      { pmid: '111', title: '布洛芬安全性研究', url: 'https://pubmed.ncbi.nlm.nih.gov/111/' },
    ]);
    vi.spyOn(sharedModel, 'invoke').mockResolvedValueOnce({
      content: JSON.stringify(llmKeyFindings),
    } as any);

    const agent = new ResearchAgent();
    const result = await agent.execute({ userMessage: '布洛芬和阿司匹林能一起吃吗', errors: [] });

    const finding = result.researchResults?.findings[0];
    expect(finding?.label).toBe('[PubMed]');
    expect(finding?.pmid).toBe('111');
    expect(finding?.url).toBe('https://pubmed.ncbi.nlm.nih.gov/111/');
    expect(result.errors).toHaveLength(0);
  });

  it('检索无结果：降级为纯生成，label 为 [AI知识摘要-未检索]', async () => {
    vi.spyOn(pubmed, 'searchArticles').mockResolvedValueOnce([]);
    vi.spyOn(sharedModel, 'invoke').mockResolvedValueOnce({
      content: JSON.stringify({
        findings: [{ title: 'x', summary: 'y', relevance: 80 }],
        keyFindings: ['结论'],
      }),
    } as any);

    const agent = new ResearchAgent();
    const result = await agent.execute({ userMessage: '罕见病', errors: [] });

    expect(result.researchResults?.findings[0]?.label).toBe('[AI知识摘要-未检索]');
    expect(result.errors).toHaveLength(0);
  });

  it('检索抛错：不崩溃，返回兜底且 errors 长度为 1', async () => {
    vi.spyOn(pubmed, 'searchArticles').mockRejectedValueOnce(new Error('network'));

    const agent = new ResearchAgent();
    const result = await agent.execute({ userMessage: '测试', errors: [] });

    expect(result.researchResults?.findings).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });
});
