import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';

afterEach(() => { vi.restoreAllMocks(); delete process.env.DATABASE_URL; });
beforeEach(() => { process.env.DATABASE_URL = 'postgres://test'; });

describe('searchDrugLabels', () => {
  it('把向量库返回的 Document 映射为 DrugChunk', async () => {
    const fakeStore = {
      similaritySearch: vi.fn().mockResolvedValueOnce([
        {
          pageContent: '成人一次1粒，一日2次',
          metadata: { drugName: '布洛芬', section: '用法用量', source: 'NMPA说明书' },
        },
      ]),
    };
    // 在底层拦截 PGVectorStore 的初始化，避免真实连库
    vi.spyOn(PGVectorStore, 'initialize').mockResolvedValue(fakeStore as any);

    const { searchDrugLabels } = await import('../retrieval/vectorStore');
    const chunks = await searchDrugLabels('头痛吃什么', 4);

    expect(fakeStore.similaritySearch).toHaveBeenCalledWith('头痛吃什么', 4);
    expect(chunks[0]).toEqual({
      content: '成人一次1粒，一日2次',
      drugName: '布洛芬',
      section: '用法用量',
      source: 'NMPA说明书',
    });
  });

  it('DATABASE_URL 未配置时抛错', async () => {
    delete process.env.DATABASE_URL;
    const { searchDrugLabels } = await import('../retrieval/vectorStore');
    await expect(searchDrugLabels('头痛')).rejects.toThrow('DATABASE_URL');
  });
});
