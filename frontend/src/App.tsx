import { useState, useEffect, useRef } from 'react';
import { chatService } from './services/chatService';
import type { ChatMessage, AgentTrace, SseEvent, AdvisorResult } from './types/chat';
import './index.css';

const AGENT_LABELS: Record<string, string> = {
  coordinator: '任务协调',
  research: '医学研究',
  diagnostic: '诊断分析',
  pharmacist: '药品查询',
  advisor: '综合建议',
};

const AGENT_ICONS: Record<string, string> = {
  coordinator: '🧭',
  research: '🔬',
  diagnostic: '🩺',
  pharmacist: '💊',
  advisor: '📋',
};

function TracePanel({ traces }: { traces: AgentTrace[] }) {
  return (
    <div className="space-y-2 py-2">
      {traces.map((t) => (
        <div key={t.agent} className="flex items-start gap-3">
          <div className={`w-7 h-7 flex items-center justify-center rounded-full text-sm flex-shrink-0 mt-0.5
            ${t.status === 'done' ? 'bg-green-100' : t.status === 'running' ? 'bg-blue-100' : t.status === 'error' ? 'bg-red-100' : 'bg-gray-100'}`}>
            {t.status === 'running' ? (
              <span className="animate-spin text-xs">⟳</span>
            ) : (
              <span>{AGENT_ICONS[t.agent] ?? '•'}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium
                ${t.status === 'done' ? 'text-green-700' : t.status === 'running' ? 'text-blue-700' : 'text-gray-500'}`}>
                {t.label}
              </span>
              {t.status === 'running' && (
                <span className="text-xs text-blue-500 animate-pulse">处理中...</span>
              )}
            </div>
            {t.summary && (
              <p className="text-xs text-gray-500 mt-0.5 truncate">{t.summary}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ResultCard({ result }: { result: AdvisorResult }) {
  return (
    <div className="space-y-4 text-sm">
      <p className="text-gray-800 leading-relaxed">{result.summary}</p>

      {result.diagnosis && (
        <div className="bg-blue-50 rounded-lg p-3">
          <div className="font-semibold text-blue-800 mb-1">🩺 诊断说明</div>
          <p className="text-gray-700">{result.diagnosis}</p>
        </div>
      )}

      {result.recommendedMedicines.length > 0 && (
        <div className="space-y-2">
          <div className="font-semibold text-gray-800">💊 推荐药品</div>
          {result.recommendedMedicines.map((med, i) => (
            <div key={i} className="bg-green-50 rounded-lg p-3 border border-green-200">
              <div className="font-medium text-gray-800">{med.name}</div>
              <div className="text-gray-600 mt-1">{med.reason}</div>
              <div className="text-blue-700 mt-1">用法：{med.usage}</div>
              {med.precautions.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {med.precautions.map((p, j) => (
                    <li key={j} className="text-xs text-amber-700">⚠ {p}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {result.precautions.length > 0 && (
        <div className="bg-amber-50 rounded-lg p-3">
          <div className="font-semibold text-amber-800 mb-1">📌 注意事项</div>
          <ul className="space-y-1">
            {result.precautions.map((p, i) => <li key={i} className="text-gray-700">• {p}</li>)}
          </ul>
        </div>
      )}

      <div className="bg-gray-50 rounded-lg p-3 border-l-4 border-blue-400">
        <div className="font-semibold text-gray-700 mb-1">就医建议</div>
        <p className="text-gray-600">{result.urgency}</p>
      </div>

      <p className="text-xs text-gray-400 italic">{result.disclaimer}</p>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] bg-blue-600 text-white rounded-2xl px-4 py-3">
          <p className="whitespace-pre-wrap">{msg.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-2">
        {/* 执行轨迹 */}
        {msg.traces && msg.traces.length > 0 && (
          <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
            <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              Agent 执行轨迹
            </div>
            <TracePanel traces={msg.traces} />
          </div>
        )}

        {/* 最终结果 */}
        {msg.result && (
          <div className="bg-white rounded-xl px-4 py-4 border border-gray-200 shadow-sm">
            <ResultCard result={msg.result} />
          </div>
        )}

        {/* 错误 */}
        {msg.error && (
          <div className="bg-red-50 rounded-xl px-4 py-3 text-red-700 text-sm">
            {msg.error}
          </div>
        )}

        {/* 仅流式处理中，尚无结果时显示省略号 */}
        {msg.streaming && !msg.result && !msg.error && msg.traces?.every(t => t.status === 'pending') && (
          <div className="bg-gray-100 rounded-2xl px-4 py-3">
            <div className="flex space-x-1">
              {[0, 0.15, 0.3].map((d, i) => (
                <div key={i} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: `${d}s` }} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    chatService.checkHealth()
      .then(() => setConnected(true))
      .catch(() => setConnected(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const updateAssistantMsg = (id: string, patch: Partial<ChatMessage>) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: input.trim() };
    const assistantId = `${Date.now()}-ai`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      traces: [],
      streaming: true,
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setLoading(true);

    abortRef.current = new AbortController();

    try {
      await chatService.streamConsult(
        userMsg.content!,
        (event: SseEvent) => {
          if (event.type === 'agent_start') {
            setMessages(prev => prev.map(m => {
              if (m.id !== assistantId) return m;
              const existing = m.traces?.find(t => t.agent === event.agent);
              if (existing) return m;
              const newTrace: AgentTrace = {
                agent: event.agent,
                label: AGENT_LABELS[event.agent] ?? event.agent,
                status: 'running',
              };
              return { ...m, traces: [...(m.traces ?? []), newTrace] };
            }));
          } else if (event.type === 'agent_complete') {
            setMessages(prev => prev.map(m => {
              if (m.id !== assistantId) return m;
              const traces = (m.traces ?? []).map(t =>
                t.agent === event.agent ? { ...t, status: 'done' as const, summary: event.summary } : t
              );
              return { ...m, traces };
            }));
          } else if (event.type === 'final_result') {
            updateAssistantMsg(assistantId, { result: event.data, streaming: false });
          } else if (event.type === 'error') {
            updateAssistantMsg(assistantId, { error: event.message, streaming: false });
          } else if (event.type === 'done') {
            updateAssistantMsg(assistantId, { streaming: false });
          }
        },
        abortRef.current.signal,
      );
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        updateAssistantMsg(assistantId, { error: '网络错误，请稍后重试', streaming: false });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col">
      {/* 导航栏 */}
      <nav className="bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏥</span>
            <span className="font-bold text-gray-800">医药智能助手</span>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">多智能体</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <span className={`w-2 h-2 rounded-full ${connected === null ? 'bg-gray-300' : connected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-gray-500">{connected === null ? '检查中' : connected ? '已连接' : '未连接'}</span>
          </div>
        </div>
      </nav>

      {/* 消息区 */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
          {messages.length === 0 && (
            <div className="text-center pt-16 space-y-4">
              <div className="text-5xl">💊</div>
              <h2 className="text-2xl font-bold text-gray-800">欢迎使用医药智能助手</h2>
              <p className="text-gray-500 text-sm">多智能体协作 · 实时执行追踪 · 专业用药建议</p>
              <div className="grid grid-cols-2 gap-2 max-w-lg mx-auto pt-4">
                {['我头疼发烧咳嗽，应该吃什么药？', '布洛芬和阿司匹林能一起吃吗？', '感冒了怎么办？', '如何预防季节性流感？'].map((q) => (
                  <button key={q} onClick={() => setInput(q)}
                    className="p-3 text-left bg-white hover:bg-blue-50 rounded-xl text-sm text-gray-700 border border-gray-200 transition-colors shadow-sm">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map(m => <MessageBubble key={m.id} msg={m} />)}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* 输入区 */}
      <div className="bg-white border-t border-gray-200 flex-shrink-0">
        <div className="max-w-4xl mx-auto px-4 py-3 space-y-2">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="描述您的症状或问题..."
              disabled={loading || !connected}
              rows={1}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:bg-gray-100 disabled:cursor-not-allowed text-sm"
              style={{ minHeight: '44px', maxHeight: '120px' }}
            />
            <button onClick={handleSend}
              disabled={loading || !input.trim() || !connected}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium text-sm flex-shrink-0">
              {loading ? '处理中' : '发送'}
            </button>
          </div>
          <p className="text-xs text-gray-400 text-center">AI 回复仅供参考，具体用药请咨询专业医生</p>
          <p className="text-xs text-gray-300 text-center">
            累计访问 <span id="busuanzi_value_site_pv">--</span> 次 · 访客 <span id="busuanzi_value_site_uv">--</span> 人
          </p>
        </div>
      </div>
    </div>
  );
}
