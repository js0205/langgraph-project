import { apiClient } from './api';
import type { ChatMessage, ChatRequest, ChatResponse } from '../types/chat';

export type { ChatMessage, ChatRequest, ChatResponse };

export const chatService = {
  // 简单聊天模式
  async sendMessage(request: ChatRequest): Promise<ChatResponse> {
    const response = await apiClient.post<ChatResponse>('/chat', request);
    return response.data;
  },

  // 工作流模式 - 使用 LangGraph 处理
  async sendMessageWithWorkflow(message: string): Promise<ChatResponse> {
    const response = await apiClient.post<ChatResponse>('/chat/workflow', { message });
    return response.data;
  },

  async checkHealth(): Promise<any> {
    const response = await apiClient.get('/health');
    return response.data;
  },
};
