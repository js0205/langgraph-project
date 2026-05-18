import { Router, Request, Response } from 'express';
import { executeWithStream } from '../services/multiAgentService';
import type { SseEvent } from '../agents/types';

const router = Router();

/**
 * POST /api/chat/stream
 * 多智能体流式咨询接口，通过 SSE 推送执行进度和最终结果
 */
router.post('/chat/stream', async (req: Request, res: Response) => {
  const { message } = req.body as { message?: string };

  if (!message || typeof message !== 'string' || message.trim() === '') {
    res.status(400).json({ error: '消息内容不能为空' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event: SseEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  req.on('close', () => {
    // 客户端断开连接时停止
  });

  await executeWithStream(message.trim(), send);
  res.end();
});

/**
 * GET /api/health
 * 健康检查（兼容旧路径）
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

export default router;
