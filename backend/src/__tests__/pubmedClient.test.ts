import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchArticles } from '../retrieval/pubmedClient';

afterEach(() => vi.restoreAllMocks());

const esearchResp = { esearchresult: { idlist: ['111', '222'] } };
const esummaryResp = {
  result: {
    uids: ['111', '222'],
    '111': { title: '布洛芬安全性研究' },
    '222': { title: '阿司匹林相互作用综述' },
  },
};

function mockFetchSequence(...jsons: unknown[]) {
  const fn = vi.fn();
  jsons.forEach((j) => fn.mockResolvedValueOnce({ ok: true, json: async () => j }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('searchArticles', () => {
  it('正常：返回带真实 pmid 和 url 的文章列表', async () => {
    mockFetchSequence(esearchResp, esummaryResp);
    const articles = await searchArticles('布洛芬', 2);
    expect(articles).toHaveLength(2);
    expect(articles[0]).toEqual({
      pmid: '111',
      title: '布洛芬安全性研究',
      url: 'https://pubmed.ncbi.nlm.nih.gov/111/',
    });
  });

  it('无结果：esearch 返回空 idlist 时得到空数组，不再发第二次请求', async () => {
    const fn = mockFetchSequence({ esearchresult: { idlist: [] } });
    const articles = await searchArticles('不存在的词');
    expect(articles).toEqual([]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('HTTP 失败：fetch reject 时抛出错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('network')));
    await expect(searchArticles('布洛芬')).rejects.toThrow();
  });
});
