import { Router, Request, Response } from 'express';
import { llmService, ChatMessage } from '../services/llmService';
import { workflowService } from '../services/workflowService';

// 创建路由实例
const router = Router();

// 定义请求体的接口
interface ChatRequest {
  message: string;        // 用户输入的消息
  history?: ChatMessage[]; // 可选的对话历史
}

/**
 * POST /api/chat
 * 聊天接口：接收用户消息，返回AI回复
 */
router.post('/chat', async (req: Request, res: Response) => {
  try {
    // 从请求体中提取消息和历史记录
    const { message, history = [] }: ChatRequest = req.body;

    // 验证消息是否为空
    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({
        error: '消息内容不能为空'
      });
    }

    // 记录请求日志
    console.log('📨 收到聊天请求:', {
      message: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
      historyLength: history.length
    });

    // 调用 LLM 服务获取回复
    const response = await llmService.chat(message, history);

    // 记录响应日志
    console.log('✅ 生成回复成功');

    // 返回成功响应
    return res.json(response);

  } catch (error) {
    // 错误处理
    console.error('❌ 聊天接口错误:', error);

    // 如果是已知错误（从 llmService 抛出的）
    if (error instanceof Error) {
      return res.status(500).json({
        error: error.message
      });
    }

    // 未知错误
    return res.status(500).json({
      error: '服务器内部错误，请稍后再试'
    });
  }
});

/**
 * POST /api/chat/workflow
 * 工作流聊天接口：使用 LangGraph 处理复杂的医药查询
 * 包含意图识别、症状分析、药品查询和用药建议生成
 */
router.post('/chat/workflow', async (req: Request, res: Response) => {
  try {
    // 从请求体中提取消息
    const { message }: { message: string } = req.body;

    // 验证消息是否为空
    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({
        error: '消息内容不能为空'
      });
    }

    // 记录请求日志
    console.log('🔄 收到工作流请求:', {
      message: message.substring(0, 50) + (message.length > 50 ? '...' : '')
    });

    // 执行工作流
    const result = await workflowService.execute(message);

    // 记录响应日志
    console.log('✅ 工作流执行成功');

    // 返回成功响应
    return res.json({
      reply: result.recommendation,
      intent: result.intent,
      symptoms: result.symptoms,
      medicines: result.medicines,
      disclaimer: '以上建议仅供参考，请咨询专业医生获取准确诊断和治疗方案。'
    });

  } catch (error) {
    // 错误处理
    console.error('❌ 工作流接口错误:', error);

    // 如果是已知错误
    if (error instanceof Error) {
      return res.status(500).json({
        error: error.message
      });
    }

    // 未知错误
    return res.status(500).json({
      error: '服务器内部错误，请稍后再试'
    });
  }
});

/**
 * GET /api/chat/validate
 * 验证 API Key 是否有效
 */
router.get('/chat/validate', async (req: Request, res: Response) => {
  try {
    const isValid = await llmService.validateApiKey();

    return res.json({
      valid: isValid,
      message: isValid ? 'API Key 有效' : 'API Key 无效'
    });
  } catch (error) {
    console.error('❌ API Key 验证失败:', error);
    return res.status(500).json({
      valid: false,
      message: '验证失败'
    });
  }
});

// 导出路由
export default router;
