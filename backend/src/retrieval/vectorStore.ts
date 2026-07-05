import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

export interface DrugChunk {
  content: string;
  drugName: string;
  section: string;
  source: string;
}

export const COLLECTION = 'drug_labels';

/** 唯一创建 PGVectorStore 的地方。换向量库只改此函数。 */
export async function getVectorStore(): Promise<PGVectorStore> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL 未配置');
  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GOOGLE_API_KEY,
    model: 'gemini-embedding-001',
  });
  return PGVectorStore.initialize(embeddings, {
    postgresConnectionOptions: { connectionString: process.env.DATABASE_URL },
    tableName: COLLECTION,
    columns: {
      idColumnName: 'id',
      vectorColumnName: 'vector',
      contentColumnName: 'content',
      metadataColumnName: 'metadata',
    },
  });
}

/** 检索药品说明书切块。异常向上抛，由调用方降级。 */
export async function searchDrugLabels(query: string, k = 4): Promise<DrugChunk[]> {
  const store = await getVectorStore();
  const docs = await store.similaritySearch(query, k);
  logger.info({ query, count: docs.length }, '药品说明书检索完成');
  return docs.map((d) => ({
    content: d.pageContent,
    drugName: (d.metadata?.drugName as string) ?? '未知',
    section: (d.metadata?.section as string) ?? '',
    source: (d.metadata?.source as string) ?? 'NMPA说明书',
  }));
}
