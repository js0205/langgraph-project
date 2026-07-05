import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

export interface PubmedArticle {
  pmid: string;
  title: string;
  url: string;
}

/**
 * 检索 PubMed 文献，返回真实 PMID 与标题。
 * @param query 检索词
 * @param retmax 最大返回条数，默认 5
 * @returns 文章列表；无结果返回空数组。HTTP/解析异常向上抛，由调用方降级。
 */
export async function searchArticles(query: string, retmax = 5): Promise<PubmedArticle[]> {
  const key = process.env.NCBI_API_KEY ? `&api_key=${process.env.NCBI_API_KEY}` : '';

  const esearchUrl =
    `${BASE}/esearch.fcgi?db=pubmed&retmode=json&retmax=${retmax}` +
    `&term=${encodeURIComponent(query)}${key}`;
  const searchRes = await fetch(esearchUrl);
  if (!searchRes.ok) throw new Error(`PubMed esearch HTTP ${searchRes.status}`);
  const searchJson: any = await searchRes.json();
  const ids: string[] = searchJson?.esearchresult?.idlist ?? [];
  if (ids.length === 0) return [];

  const esummaryUrl =
    `${BASE}/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}${key}`;
  const sumRes = await fetch(esummaryUrl);
  if (!sumRes.ok) throw new Error(`PubMed esummary HTTP ${sumRes.status}`);
  const sumJson: any = await sumRes.json();
  const result = sumJson?.result ?? {};

  const articles = ids.map((pmid) => ({
    pmid,
    title: result[pmid]?.title ?? '(无标题)',
    url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
  }));
  logger.info({ query, count: articles.length }, 'PubMed 检索完成');
  return articles;
}
