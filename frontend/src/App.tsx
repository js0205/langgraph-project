import { useState, useEffect } from 'react';
import { chatService } from './services/chatService';
import type { ChatMessage } from './types/chat';
import './index.css';

// 扩展消息类型，包含工作流额外信息
interface ExtendedMessage extends ChatMessage {
  intent?: string;
  symptoms?: string[];
  medicines?: any[];
}

function App() {
  const [messages, setMessages] = useState<ExtendedMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<any>(null);
  const [healthChecking, setHealthChecking] = useState(true);
  const [useWorkflow, setUseWorkflow] = useState(true); // 默认使用工作流模式

  useEffect(() => {
    // 检查后端连接
    chatService.checkHealth()
      .then(data => {
        setHealth(data);
        setHealthChecking(false);
      })
      .catch(err => {
        console.error('无法连接后端:', err);
        setHealthChecking(false);
      });
  }, []);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: ExtendedMessage = {
      role: 'user',
      content: input.trim()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      let response;

      if (useWorkflow) {
        // 使用工作流模式
        response = await chatService.sendMessageWithWorkflow(userMessage.content);

        const assistantMessage: ExtendedMessage = {
          role: 'assistant',
          content: response.reply || '抱歉，我无法回答这个问题。',
          intent: (response as any).intent,
          symptoms: (response as any).symptoms,
          medicines: (response as any).medicines,
        };

        setMessages(prev => [...prev, assistantMessage]);
      } else {
        // 使用简单模式
        response = await chatService.sendMessage({
          message: userMessage.content,
          history: messages
        });

        const assistantMessage: ExtendedMessage = {
          role: 'assistant',
          content: response.reply || '抱歉，我无法回答这个问题。'
        };

        setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error('发送消息失败:', error);
      const errorMessage: ExtendedMessage = {
        role: 'assistant',
        content: '抱歉，服务暂时不可用，请稍后再试。'
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* 顶部导航 */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <span className="text-2xl">🏥</span>
              <h1 className="text-xl font-bold text-gray-800">
                医药智能助手
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              {/* 模式切换按钮 */}
              <div className="flex items-center space-x-2 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setUseWorkflow(false)}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    !useWorkflow
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  💬 简单模式
                </button>
                <button
                  onClick={() => setUseWorkflow(true)}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    useWorkflow
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  🔄 工作流模式
                </button>
              </div>
              {/* 连接状态 */}
              {healthChecking ? (
                <span className="text-sm text-gray-500">检查中...</span>
              ) : health ? (
                <span className="flex items-center text-sm text-green-600">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                  已连接
                </span>
              ) : (
                <span className="flex items-center text-sm text-red-600">
                  <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                  未连接
                </span>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* 主内容区 */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden" style={{ height: 'calc(100vh - 140px)' }}>
          {/* 聊天消息区 */}
          <div className="h-full flex flex-col">
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-4">
                  <div className="text-6xl mb-4">💊</div>
                  <h2 className="text-2xl font-bold text-gray-800 mb-2">
                    欢迎使用医药智能助手
                  </h2>
                  <p className="text-gray-600 mb-2 max-w-md">
                    当前模式：<span className="font-semibold text-blue-600">
                      {useWorkflow ? '🔄 工作流模式' : '💬 简单模式'}
                    </span>
                  </p>
                  <p className="text-sm text-gray-500 mb-6 max-w-md">
                    {useWorkflow
                      ? '工作流模式会进行意图识别、症状分析和药品推荐，提供更详细的建议'
                      : '简单模式快速回复您的问题，适合一般咨询'
                    }
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl">
                    {[
                      '我头疼发烧咳嗽，应该吃什么药？',
                      '布洛芬的用法用量是什么？',
                      '感冒了怎么办？',
                      '如何预防季节性流感？'
                    ].map((example, index) => (
                      <button
                        key={index}
                        onClick={() => setInput(example)}
                        className="p-3 text-left bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors text-sm text-gray-700"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[80%] ${message.role === 'user' ? '' : 'space-y-2'}`}>
                      {/* 主消息气泡 */}
                      <div
                        className={`rounded-2xl px-4 py-3 ${
                          message.role === 'user'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      </div>

                      {/* 工作流额外信息 */}
                      {message.role === 'assistant' && useWorkflow && (
                        <div className="space-y-2 pl-2">
                          {/* 意图和症状 */}
                          {(message.intent || (message.symptoms && message.symptoms.length > 0)) && (
                            <div className="bg-blue-50 rounded-lg p-3 text-sm">
                              {message.intent && (
                                <div className="flex items-center space-x-2 mb-2">
                                  <span className="text-blue-600 font-semibold">🎯 意图:</span>
                                  <span className="text-gray-700">
                                    {message.intent === 'symptom_inquiry' ? '症状咨询' :
                                     message.intent === 'medicine_inquiry' ? '药品查询' : '一般咨询'}
                                  </span>
                                </div>
                              )}
                              {message.symptoms && message.symptoms.length > 0 && (
                                <div className="flex items-start space-x-2">
                                  <span className="text-blue-600 font-semibold">🩺 症状:</span>
                                  <div className="flex flex-wrap gap-1">
                                    {message.symptoms.map((symptom, idx) => (
                                      <span
                                        key={idx}
                                        className="px-2 py-1 bg-white rounded-full text-xs text-gray-700 border border-blue-200"
                                      >
                                        {symptom}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* 推荐药品 */}
                          {message.medicines && message.medicines.length > 0 && (
                            <div className="bg-green-50 rounded-lg p-3 text-sm space-y-2">
                              <div className="text-green-700 font-semibold mb-2">💊 推荐药品:</div>
                              {message.medicines.map((med, idx) => (
                                <div key={idx} className="bg-white rounded p-2 border border-green-200">
                                  <div className="font-semibold text-gray-800">{idx + 1}. {med.name}</div>
                                  <div className="text-xs text-gray-600 mt-1">类型: {med.type}</div>
                                  <div className="text-xs text-gray-600 mt-1">适应症: {med.indication}</div>
                                  <div className="text-xs text-blue-600 mt-1">用法: {med.usage}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-2xl px-4 py-3">
                    <div className="flex space-x-2">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 输入区 */}
            <div className="border-t border-gray-200 p-4 bg-gray-50">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={useWorkflow ? "描述您的症状或问题..." : "输入您的问题..."}
                  disabled={loading || !health}
                  className="flex-1 px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
                <button
                  onClick={handleSend}
                  disabled={loading || !input.trim() || !health}
                  className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {loading ? '处理中...' : '发送'}
                </button>
              </div>
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-gray-500">
                  ⚠️ AI 回复仅供参考，具体用药请咨询专业医生
                </p>
                <p className="text-xs text-gray-400">
                  当前: {useWorkflow ? '工作流模式' : '简单模式'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
