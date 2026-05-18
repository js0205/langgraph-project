import { StateGraph, Annotation, END, START } from '@langchain/langgraph';
import type { AgentState, SseEvent } from '../agents/types';
import { CoordinatorAgent } from '../agents/CoordinatorAgent';
import { DiagnosticAgent } from '../agents/DiagnosticAgent';
import { ResearchAgent } from '../agents/ResearchAgent';
import { PharmacistAgent } from '../agents/PharmacistAgent';
import { AdvisorAgent } from '../agents/AdvisorAgent';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

const GraphState = Annotation.Root({
  userMessage: Annotation<string>({ default: () => '', reducer: (_, b) => b }),
  coordinatorDecision: Annotation<AgentState['coordinatorDecision']>({
    default: () => undefined,
    reducer: (_, b) => b,
  }),
  researchResults: Annotation<AgentState['researchResults']>({
    default: () => undefined,
    reducer: (_, b) => b,
  }),
  diagnosticResults: Annotation<AgentState['diagnosticResults']>({
    default: () => undefined,
    reducer: (_, b) => b,
  }),
  pharmacistResults: Annotation<AgentState['pharmacistResults']>({
    default: () => undefined,
    reducer: (_, b) => b,
  }),
  advisorResults: Annotation<AgentState['advisorResults']>({
    default: () => undefined,
    reducer: (_, b) => b,
  }),
  errors: Annotation<string[]>({
    default: () => [],
    reducer: (a, b) => [...a, ...b],
  }),
});

type GraphStateType = typeof GraphState.State;

function routeAfterCoordinator(state: GraphStateType): string {
  const plan = state.coordinatorDecision?.plan ?? ['advisor'];
  if (plan.includes('research')) return 'research';
  if (plan.includes('diagnostic')) return 'diagnostic';
  if (plan.includes('pharmacist')) return 'pharmacist';
  return 'advisor';
}

function routeAfterResearch(state: GraphStateType): string {
  const plan = state.coordinatorDecision?.plan ?? ['advisor'];
  if (plan.includes('diagnostic')) return 'diagnostic';
  if (plan.includes('pharmacist')) return 'pharmacist';
  return 'advisor';
}

function routeAfterDiagnostic(state: GraphStateType): string {
  const plan = state.coordinatorDecision?.plan ?? ['advisor'];
  if (plan.includes('pharmacist')) return 'pharmacist';
  return 'advisor';
}

function buildGraph() {
  const coordinator = new CoordinatorAgent();
  const diagnostic = new DiagnosticAgent();
  const research = new ResearchAgent();
  const pharmacist = new PharmacistAgent();
  const advisor = new AdvisorAgent();

  return new StateGraph(GraphState)
    .addNode('coordinator', (s) => coordinator.execute(s as AgentState))
    .addNode('research', (s) => research.execute(s as AgentState))
    .addNode('diagnostic', (s) => diagnostic.execute(s as AgentState))
    .addNode('pharmacist', (s) => pharmacist.execute(s as AgentState))
    .addNode('advisor', (s) => advisor.execute(s as AgentState))
    .addEdge(START, 'coordinator')
    .addConditionalEdges('coordinator', routeAfterCoordinator)
    .addConditionalEdges('research', routeAfterResearch)
    .addConditionalEdges('diagnostic', routeAfterDiagnostic)
    .addEdge('pharmacist', 'advisor')
    .addEdge('advisor', END)
    .compile();
}

const compiledGraph = buildGraph();
logger.info('多智能体图初始化完成');

const AGENT_LABELS: Record<string, string> = {
  coordinator: '任务协调',
  research: '医学研究',
  diagnostic: '诊断分析',
  pharmacist: '药品查询',
  advisor: '综合建议',
};

function summarize(nodeName: string, output: Partial<AgentState>): string {
  switch (nodeName) {
    case 'coordinator': {
      const plan = output.coordinatorDecision?.plan ?? [];
      return `执行计划: ${plan.join(' → ')}`;
    }
    case 'research': {
      const n = output.researchResults?.findings?.length ?? 0;
      return `获取 ${n} 条医学知识摘要`;
    }
    case 'diagnostic': {
      const urgency = output.diagnosticResults?.urgency ?? 'medium';
      return `诊断完成，紧急程度: ${urgency}`;
    }
    case 'pharmacist': {
      const n = output.pharmacistResults?.medicines?.length ?? 0;
      return `推荐 ${n} 种药品`;
    }
    case 'advisor':
      return '综合建议已生成';
    default:
      return '处理完成';
  }
}

export async function executeWithStream(
  userMessage: string,
  onEvent: (event: SseEvent) => void,
): Promise<void> {
  const initialState: Partial<GraphStateType> = {
    userMessage,
    errors: [],
  };

  try {
    const stream = compiledGraph.streamEvents(initialState, { version: 'v2' });

    const emittedStart = new Set<string>();
    const emittedEnd = new Set<string>();

    for await (const event of stream) {
      const node = event.metadata?.langgraph_node as string | undefined;
      if (!node || !AGENT_LABELS[node]) continue;

      if (event.event === 'on_chain_start' && event.name === node && !emittedStart.has(node)) {
        emittedStart.add(node);
        onEvent({ type: 'agent_start', agent: node });
        logger.info({ node }, 'agent_start');
      }

      if (event.event === 'on_chain_end' && event.name === node && !emittedEnd.has(node)) {
        emittedEnd.add(node);
        const output = (event.data?.output ?? {}) as Partial<AgentState>;
        const summary = summarize(node, output);
        onEvent({ type: 'agent_complete', agent: node, summary });
        logger.info({ node, summary }, 'agent_complete');

        if (node === 'advisor' && output.advisorResults) {
          onEvent({ type: 'final_result', data: output.advisorResults });
        }
      }
    }

    onEvent({ type: 'done' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, '多智能体执行失败');
    onEvent({ type: 'error', message });
    onEvent({ type: 'done' });
  }
}
