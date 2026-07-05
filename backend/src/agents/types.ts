// ===== 共享状态 =====

export interface CoordinatorDecision {
  needsResearch: boolean;
  needsDiagnostic: boolean;
  needsPharmacist: boolean;
  complexity: 'simple' | 'medium' | 'complex';
  plan: string[];
  reasoning: string;
}

export interface ResearchFinding {
  title: string;
  summary: string;
  relevance: number;
  label: '[PubMed]' | '[AI知识摘要-未检索]' | '[AI知识摘要]';
  pmid?: string;
  url?: string;
}

export interface ResearchResult {
  query: string;
  findings: ResearchFinding[];
  keyFindings: string[];
  timestamp: string;
}

export interface DiagnosticCondition {
  name: string;
  probability: number;
  severity: 'mild' | 'moderate' | 'severe';
  description: string;
}

export interface DiagnosticResult {
  symptoms: string[];
  possibleConditions: DiagnosticCondition[];
  riskFactors: string[];
  urgency: 'low' | 'medium' | 'high';
  recommendation: string;
}

export interface Medicine {
  name: string;
  genericName?: string;
  type: string;
  indication: string;
  usage: string;
  contraindication?: string;
  sideEffects?: string[];
  interactions?: string[];
  price?: { min: number; max: number; currency: string };
}

export interface PharmacistResult {
  medicines: Medicine[];
  warnings: string[];
  sources?: string[];
}

export interface RecommendedMedicine {
  name: string;
  reason: string;
  usage: string;
  precautions: string[];
}

export interface AdvisorResult {
  summary: string;
  diagnosis?: string;
  recommendedMedicines: RecommendedMedicine[];
  precautions: string[];
  references: string[];
  urgency: string;
  disclaimer: string;
}

export interface AgentState {
  userMessage: string;
  coordinatorDecision?: CoordinatorDecision;
  researchResults?: ResearchResult;
  diagnosticResults?: DiagnosticResult;
  pharmacistResults?: PharmacistResult;
  advisorResults?: AdvisorResult;
  errors: string[];
}

// ===== Agent 接口（不暴露底层模型类型）=====

export interface IAgent {
  name: string;
  description: string;
  execute(state: AgentState): Promise<Partial<AgentState>>;
}

// ===== Coordinator 内部分析结果 =====

export interface CoordinatorAnalysis {
  needsResearch: boolean;
  needsDiagnostic: boolean;
  needsPharmacist: boolean;
  complexity: 'simple' | 'medium' | 'complex';
  reasoning: string;
}

// ===== SSE 事件类型 =====

export type SseEvent =
  | { type: 'agent_start'; agent: string }
  | { type: 'agent_complete'; agent: string; summary: string }
  | { type: 'final_result'; data: AdvisorResult }
  | { type: 'error'; message: string }
  | { type: 'done' };
