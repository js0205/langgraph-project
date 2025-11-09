// Agent 系统类型定义

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

/**
 * Agent 状态接口
 * 所有 Agent 共享的工作流状态
 */
export interface AgentState {
  // 用户输入
  userMessage: string;

  // 协调器决策结果
  coordinatorDecision?: {
    needsResearch: boolean;      // 是否需要文献研究
    needsDiagnostic: boolean;    // 是否需要诊断分析
    needsPharmacist: boolean;    // 是否需要药品查询
    complexity: 'simple' | 'medium' | 'complex';  // 问题复杂度
    plan: string[];              // 执行计划（Agent 列表）
    reasoning: string;           // 决策原因
  };

  // 各个 Agent 的结果
  researchResults?: ResearchResult;
  diagnosticResults?: DiagnosticResult;
  pharmacistResults?: PharmacistResult;
  advisorResults?: AdvisorResult;

  // 执行过程跟踪
  completedAgents?: string[];    // 已完成的 Agent
  currentAgent?: string;         // 当前执行的 Agent
  errors?: string[];             // 错误信息
}

/**
 * 研究结果
 */
export interface ResearchResult {
  query: string;
  sources: Array<{
    title: string;
    url: string;
    summary: string;
    relevance: number;
  }>;
  keyFindings: string[];
  timestamp: string;
}

/**
 * 诊断结果
 */
export interface DiagnosticResult {
  symptoms: string[];
  possibleConditions: Array<{
    name: string;
    probability: number;
    severity: 'mild' | 'moderate' | 'severe';
    description: string;
  }>;
  riskFactors: string[];
  urgency: 'low' | 'medium' | 'high';
  recommendation: string;
}

/**
 * 药品查询结果
 */
export interface PharmacistResult {
  medicines: Array<{
    name: string;
    genericName?: string;
    type: string;
    indication: string;
    usage: string;
    contraindication?: string;
    sideEffects?: string[];
    interactions?: string[];
    price?: {
      min: number;
      max: number;
      currency: string;
    };
  }>;
  warnings: string[];
}

/**
 * 最终建议结果
 */
export interface AdvisorResult {
  summary: string;
  diagnosis?: string;
  recommendedMedicines: Array<{
    name: string;
    reason: string;
    usage: string;
    precautions: string[];
  }>;
  precautions: string[];
  references: string[];
  urgency: string;
  disclaimer: string;
}

/**
 * Agent 基类接口
 */
export interface IAgent {
  name: string;
  description: string;
  model: ChatGoogleGenerativeAI;

  /**
   * 执行 Agent 任务
   * @param state 当前工作流状态
   * @returns 更新后的状态（部分）
   */
  execute(state: AgentState): Promise<Partial<AgentState>>;
}

/**
 * 协调器决策分析结果
 */
export interface CoordinatorAnalysis {
  needsResearch: boolean;
  needsDiagnostic: boolean;
  needsPharmacist: boolean;
  complexity: 'simple' | 'medium' | 'complex';
  reasoning: string;
}
