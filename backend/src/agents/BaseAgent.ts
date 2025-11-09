// Agent 基类

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { IAgent, AgentState } from './types';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Agent 基类
 * 所有专业 Agent 都继承此类
 */
export abstract class BaseAgent implements IAgent {
  public name: string;
  public description: string;
  protected model: ChatGoogleGenerativeAI;

  constructor(name: string, description: string, modelName: string = 'gemini-2.0-flash-exp') {
    this.name = name;
    this.description = description;

    // 初始化模型
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY 未配置在环境变量中');
    }

    this.model = new ChatGoogleGenerativeAI({
      apiKey,
      model: modelName,
      temperature: 0.7,
    });

    console.log(`✅ ${this.name} 初始化成功`);
  }

  /**
   * 抽象方法：执行 Agent 任务
   * 子类必须实现此方法
   */
  abstract execute(state: AgentState): Promise<Partial<AgentState>>;

  /**
   * 辅助方法：调用 LLM 并解析 JSON 响应
   */
  protected async invokeJSON<T>(prompt: string): Promise<T> {
    try {
      const response = await this.model.invoke(prompt);
      const content = response.content.toString().trim();

      // 清理可能的 markdown 代码块标记
      const cleanContent = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '');

      return JSON.parse(cleanContent) as T;
    } catch (error) {
      console.error(`❌ ${this.name} JSON 解析失败:`, error);
      throw error;
    }
  }

  /**
   * 辅助方法：调用 LLM 并返回文本响应
   */
  protected async invokeText(prompt: string): Promise<string> {
    try {
      const response = await this.model.invoke(prompt);
      return response.content.toString().trim();
    } catch (error) {
      console.error(`❌ ${this.name} 调用失败:`, error);
      throw error;
    }
  }

  /**
   * 日志辅助方法
   */
  protected log(message: string): void {
    console.log(`🤖 [${this.name}] ${message}`);
  }

  protected logError(message: string, error?: any): void {
    console.error(`❌ [${this.name}] ${message}`, error || '');
  }
}
