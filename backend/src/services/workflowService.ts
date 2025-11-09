import { StateGraph, END, START } from '@langchain/langgraph';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import dotenv from 'dotenv';

// 确保环境变量被加载
dotenv.config();

// 定义工作流状态接口
interface WorkflowState {
  userMessage: string;        // 用户输入的消息
  intent: string;              // 识别出的意图
  symptoms: string[];          // 提取的症状列表
  medicines: any[];            // 查询到的药品信息
  recommendation: string;      // 最终的用药建议
  error?: string;              // 错误信息
}

// WorkflowService 类：封装 LangGraph 工作流逻辑
class WorkflowService {
  private model: ChatGoogleGenerativeAI;
  private graph: any;

  constructor() {
    // 初始化 Google Gemini 模型
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY 未配置在环境变量中');
    }

    this.model = new ChatGoogleGenerativeAI({
      apiKey,
      model: 'gemini-2.0-flash-exp',
      temperature: 0.7,
    });

    // 构建工作流图
    this.graph = this.buildWorkflow();

    console.log('✅ LangGraph 工作流初始化成功');
  }

  /**
   * 构建 LangGraph 工作流
   * 工作流包含以下节点：
   * 1. intentRecognition - 意图识别
   * 2. symptomAnalysis - 症状分析
   * 3. medicineQuery - 药品查询
   * 4. recommendationGeneration - 建议生成
   */
  private buildWorkflow() {
    // 创建状态图
    const workflow = new StateGraph<WorkflowState>({
      channels: {
        userMessage: null,
        intent: null,
        symptoms: null,
        medicines: null,
        recommendation: null,
        error: null,
      }
    });

    // 添加节点
    workflow.addNode('intentRecognition', this.intentRecognitionNode.bind(this));
    workflow.addNode('symptomAnalysis', this.symptomAnalysisNode.bind(this));
    workflow.addNode('medicineQuery', this.medicineQueryNode.bind(this));
    workflow.addNode('recommendationGeneration', this.recommendationGenerationNode.bind(this));

    // 定义工作流边（流程控制）
    workflow.addEdge(START, 'intentRecognition');

    // 意图识别后的条件分支
    workflow.addConditionalEdges(
      'intentRecognition',
      (state: WorkflowState) => {
        // 根据意图决定下一步
        if (state.intent === 'symptom_inquiry') {
          return 'symptomAnalysis';
        } else if (state.intent === 'medicine_inquiry') {
          return 'medicineQuery';
        } else {
          return 'recommendationGeneration';
        }
      }
    );

    workflow.addEdge('symptomAnalysis', 'medicineQuery');
    workflow.addEdge('medicineQuery', 'recommendationGeneration');
    workflow.addEdge('recommendationGeneration', END);

    return workflow.compile();
  }

  /**
   * 节点1: 意图识别
   * 识别用户问题的类型：症状咨询、药品查询、用药建议等
   */
  private async intentRecognitionNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    console.log('🔍 执行意图识别...');

    try {
      const prompt = `你是一个医药助手。请分析以下用户问题的意图，并返回以下类型之一：
- symptom_inquiry: 用户描述了症状，想了解可能的病因或用药
- medicine_inquiry: 用户询问特定药品的信息
- general_inquiry: 一般性的医药咨询

用户问题: ${state.userMessage}

请只返回意图类型，不要添加其他内容。`;

      const response = await this.model.invoke(prompt);
      const intent = response.content.toString().trim().toLowerCase();

      console.log(`  ✓ 识别意图: ${intent}`);

      return { intent };
    } catch (error) {
      console.error('❌ 意图识别失败:', error);
      return { intent: 'general_inquiry', error: '意图识别失败' };
    }
  }

  /**
   * 节点2: 症状分析
   * 从用户消息中提取症状关键词
   */
  private async symptomAnalysisNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    console.log('🩺 执行症状分析...');

    try {
      const prompt = `请从以下用户描述中提取症状关键词，以 JSON 数组格式返回。

用户描述: ${state.userMessage}

示例返回格式: ["头痛", "发烧", "咳嗽"]

请只返回 JSON 数组，不要添加其他内容。`;

      const response = await this.model.invoke(prompt);
      const content = response.content.toString().trim();

      // 尝试解析 JSON
      let symptoms: string[] = [];
      try {
        symptoms = JSON.parse(content);
      } catch {
        // 如果解析失败，尝试从文本中提取
        symptoms = content.match(/["']([^"']+)["']/g)?.map(s => s.replace(/["']/g, '')) || [];
      }

      console.log(`  ✓ 提取症状: ${symptoms.join(', ')}`);

      return { symptoms };
    } catch (error) {
      console.error('❌ 症状分析失败:', error);
      return { symptoms: [], error: '症状分析失败' };
    }
  }

  /**
   * 节点3: 药品查询
   * 根据症状或直接查询，返回相关药品信息
   * 注意：这里使用 AI 生成模拟数据，实际应该调用药品数据库 API
   */
  private async medicineQueryNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    console.log('💊 执行药品查询...');

    try {
      let queryContext = '';

      if (state.symptoms && state.symptoms.length > 0) {
        queryContext = `用户症状: ${state.symptoms.join('、')}`;
      } else {
        queryContext = `用户问题: ${state.userMessage}`;
      }

      const prompt = `${queryContext}

请推荐 2-3 种相关的非处方药（OTC），以 JSON 格式返回。每个药品包含以下信息：
- name: 药品名称
- type: 药品类型（如：解热镇痛药、感冒药等）
- indication: 适应症
- usage: 用法用量

示例格式:
[
  {
    "name": "布洛芬缓释胶囊",
    "type": "解热镇痛药",
    "indication": "用于缓解轻至中度疼痛如头痛、关节痛、偏头痛、牙痛等",
    "usage": "成人一次1粒，一日2次"
  }
]

请只返回 JSON 数组，不要添加其他内容。`;

      const response = await this.model.invoke(prompt);
      const content = response.content.toString().trim();

      // 尝试解析 JSON
      let medicines: any[] = [];
      try {
        // 清理可能的 markdown 代码块标记
        const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        medicines = JSON.parse(cleanContent);
      } catch (parseError) {
        console.warn('⚠️ JSON 解析失败，使用空数组');
        medicines = [];
      }

      console.log(`  ✓ 查询到 ${medicines.length} 种药品`);

      return { medicines };
    } catch (error) {
      console.error('❌ 药品查询失败:', error);
      return { medicines: [], error: '药品查询失败' };
    }
  }

  /**
   * 节点4: 建议生成
   * 基于前面的分析结果，生成最终的用药建议
   */
  private async recommendationGenerationNode(state: WorkflowState): Promise<Partial<WorkflowState>> {
    console.log('📋 生成用药建议...');

    try {
      let context = `用户问题: ${state.userMessage}\n`;

      if (state.symptoms && state.symptoms.length > 0) {
        context += `识别症状: ${state.symptoms.join('、')}\n`;
      }

      if (state.medicines && state.medicines.length > 0) {
        context += `推荐药品:\n`;
        state.medicines.forEach((med, index) => {
          context += `${index + 1}. ${med.name} (${med.type})\n`;
          context += `   适应症: ${med.indication}\n`;
          context += `   用法用量: ${med.usage}\n`;
        });
      }

      const prompt = `${context}

作为专业的医药助手，请生成一份详细、专业的用药建议。建议应包含：
1. 对症状/问题的简要分析
2. 推荐药品的使用说明
3. 注意事项和禁忌
4. 何时需要就医的提醒

请用易懂的语言，给出实用的建议。`;

      const response = await this.model.invoke(prompt);
      const recommendation = response.content.toString();

      console.log('  ✓ 建议生成完成');

      return { recommendation };
    } catch (error) {
      console.error('❌ 建议生成失败:', error);
      return {
        recommendation: '抱歉，无法生成建议。建议您咨询专业医生。',
        error: '建议生成失败'
      };
    }
  }

  /**
   * 执行工作流
   * @param userMessage 用户输入的消息
   * @returns 工作流执行结果
   */
  async execute(userMessage: string): Promise<WorkflowState> {
    console.log('🚀 开始执行工作流...');
    console.log(`  输入: ${userMessage.substring(0, 50)}${userMessage.length > 50 ? '...' : ''}`);

    try {
      // 初始化状态
      const initialState: WorkflowState = {
        userMessage,
        intent: '',
        symptoms: [],
        medicines: [],
        recommendation: '',
      };

      // 执行工作流
      const result = await this.graph.invoke(initialState);

      console.log('✅ 工作流执行完成');

      return result;
    } catch (error) {
      console.error('❌ 工作流执行失败:', error);
      throw new Error('工作流执行失败');
    }
  }
}

// 导出单例实例
export const workflowService = new WorkflowService();