import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

// 确保环境变量在模块加载时就被加载
dotenv.config();

// 聊天消息接口定义
export interface ChatMessage {
  role: 'user' | 'model';  // 消息角色：用户或AI模型
  parts: string;           // 消息内容
}

// 聊天响应接口定义
export interface ChatResponse {
  reply: string;           // AI的回复内容
  medicines?: any[];       // 可选：推荐的药品信息
  disclaimer?: string;     // 可选：医疗免责声明
}

// LLMService 类：封装 Google Gemini AI 的调用逻辑
class LLMService {
  private genAI: GoogleGenerativeAI;     // Gemini AI 客户端实例
  private model: any;                     // Gemini 模型实例

  constructor() {
    // 从环境变量读取 API Key
    const apiKey = process.env.GOOGLE_API_KEY;

    // 如果没有配置 API Key，抛出错误
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY 未配置在环境变量中');
    }

    console.log('✅ Gemini API 初始化成功');

    // 初始化 Gemini AI 客户端
    this.genAI = new GoogleGenerativeAI(apiKey);

    // 选择并配置 Gemini 模型
    // gemini-2.0-flash-exp 是 Google 提供的最新实验性快速模型
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
      // 生成配置
      generationConfig: {
        temperature: 0.7,      // 控制随机性，0-1之间，越高越随机
        topK: 40,              // Top-K 采样参数
        topP: 0.95,            // Top-P (nucleus) 采样参数
        maxOutputTokens: 1024, // 最大输出token数
      },
    });
  }

  /**
   * 发送聊天消息并获取回复
   * @param message 用户输入的消息
   * @param history 对话历史记录（可选）
   * @returns 包含AI回复的响应对象
   */
  async chat(message: string, history: ChatMessage[] = []): Promise<ChatResponse> {
    try {
      // 构建系统提示词，定义AI的角色和行为
      const systemPrompt = `你是一个专业的医药助手，能够帮助用户了解药品信息、用药建议等。
请注意：
1. 提供准确、专业的医药知识
2. 对于严重疾病，建议用户就医
3. 不要做出明确的诊断
4. 提供用药建议时要强调咨询医生的重要性

请用简洁、易懂的语言回答用户的问题。`;

      // 如果有历史对话，使用 chat 模式（支持上下文）
      if (history.length > 0) {
        // 创建聊天会话
        const chat = this.model.startChat({
          history: history.map(msg => ({
            role: msg.role,
            parts: [{ text: msg.parts }],
          })),
        });

        // 发送消息并获取响应
        const result = await chat.sendMessage(message);
        const response = await result.response;
        const reply = response.text();

        return {
          reply,
          disclaimer: '以上建议仅供参考，请咨询专业医生获取准确诊断和治疗方案。'
        };
      }
      // 如果没有历史对话，使用单次生成模式
      else {
        // 组合系统提示词和用户消息
        const prompt = `${systemPrompt}\n\n用户问题：${message}`;

        // 生成回复
        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        const reply = response.text();

        return {
          reply,
          disclaimer: '以上建议仅供参考，请咨询专业医生获取准确诊断和治疗方案。'
        };
      }
    } catch (error) {
      // 错误处理
      console.error('Gemini API 调用失败:', error);
      throw new Error('AI 服务暂时不可用，请稍后再试');
    }
  }

  /**
   * 验证 API Key 是否有效
   * @returns 是否有效
   */
  async validateApiKey(): Promise<boolean> {
    try {
      // 尝试发送一个简单的测试消息
      const result = await this.model.generateContent('Hello');
      return !!result.response;
    } catch (error) {
      console.error('API Key 验证失败:', error);
      return false;
    }
  }
}

// 导出单例实例
export const llmService = new LLMService();
