import { describe, it, expect, vi, afterEach } from 'vitest';
import { sharedModel, BaseAgent } from '../agents/BaseAgent';
import { AgentState } from '../agents/types';

// 用于暴露 protected 方法的测试子类
class TestAgent extends BaseAgent {
  constructor() { super('Test', '测试'); }
  async execute(_state: AgentState) { return {}; }
  async callInvokeJSON<T>(prompt: string) {
    return this.invokeJSON<T>(prompt);
  }
}

afterEach(() => vi.restoreAllMocks());

describe('BaseAgent.invokeJSON', () => {
  it('从纯 JSON 字符串提取对象', async () => {
    vi.spyOn(sharedModel, 'invoke').mockResolvedValueOnce({
      content: '{"key":"value"}',
    } as any);
    const result = await new TestAgent().callInvokeJSON<{ key: string }>('p');
    expect(result).toEqual({ key: 'value' });
  });

  it('从 markdown 代码块中提取 JSON', async () => {
    vi.spyOn(sharedModel, 'invoke').mockResolvedValueOnce({
      content: '```json\n{"key":"value"}\n```',
    } as any);
    const result = await new TestAgent().callInvokeJSON<{ key: string }>('p');
    expect(result).toEqual({ key: 'value' });
  });

  it('忽略前置说明文字，提取 JSON', async () => {
    vi.spyOn(sharedModel, 'invoke').mockResolvedValueOnce({
      content: '这是结果：\n{"key":"value"}',
    } as any);
    const result = await new TestAgent().callInvokeJSON<{ key: string }>('p');
    expect(result).toEqual({ key: 'value' });
  });

  it('提取 JSON 数组', async () => {
    vi.spyOn(sharedModel, 'invoke').mockResolvedValueOnce({
      content: '["a","b","c"]',
    } as any);
    const result = await new TestAgent().callInvokeJSON<string[]>('p');
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('无法提取 JSON 时抛出错误', async () => {
    vi.spyOn(sharedModel, 'invoke').mockResolvedValueOnce({
      content: '纯文字，没有 JSON',
    } as any);
    await expect(new TestAgent().callInvokeJSON('p')).rejects.toThrow('JSON 提取失败');
  });
});
