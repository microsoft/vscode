/**
 * IDEBMURouter - BMU router optimized for IDE operations
 *
 * Routes IDE operations to optimal D3N compute tiers based on
 * complexity, context, and user preferences.
 */

import type { AgentPersona, ConversationContext } from '../../chat/types';

export interface TierDecision {
  tier: number;
  confidence: number;
  reason: string;
  shouldEarlyExit: boolean;
}

export interface CompletionContext {
  document: {
    languageId: string;
    lineCount: number;
    uri: string;
  };
  position: {
    line: number;
    character: number;
  };
  prefix: string;
  suffix: string;
  selectedText?: string;
}

export interface RefactorContext {
  files: string[];
  scope: 'function' | 'file' | 'module' | 'project';
  type: 'rename' | 'extract' | 'inline' | 'restructure';
}

/**
 * IDE-specific BMU router
 */
export class IDEBMURouter {
  private config: {
    defaultTier: number;
    maxTier: number;
    confidenceThreshold: number;
    useSpiking: boolean;
    useDesirability: boolean;
  };

  constructor(config?: Partial<IDEBMURouter['config']>) {
    this.config = {
      defaultTier: 2,
      maxTier: 3,
      confidenceThreshold: 0.7,
      useSpiking: true,
      useDesirability: true,
      ...config,
    };
  }

  /**
   * Select tier for inline completion
   */
  async selectTierForCompletion(context: CompletionContext): Promise<TierDecision> {
    // Analyze complexity signals
    const complexity = await this.assessCompletionComplexity(context);

    // Simple completions: Tier 1
    if (complexity.score < 0.3) {
      return {
        tier: 1,
        confidence: complexity.confidence,
        reason: 'Simple completion pattern detected',
        shouldEarlyExit: true,
      };
    }

    // Standard completions: Tier 2
    if (complexity.score < 0.7) {
      return {
        tier: 2,
        confidence: complexity.confidence,
        reason: 'Standard completion complexity',
        shouldEarlyExit: complexity.score < 0.5,
      };
    }

    // Complex completions: Tier 3
    return {
      tier: 3,
      confidence: complexity.confidence,
      reason: 'Complex completion requiring deep reasoning',
      shouldEarlyExit: false,
    };
  }

  /**
   * Select tier for refactoring
   */
  async selectTierForRefactor(context: RefactorContext): Promise<TierDecision> {
    // Multi-file refactors always use Tier 3
    if (context.files.length > 1 || context.scope === 'project') {
      return {
        tier: 3,
        confidence: 0.9,
        reason: 'Multi-file refactor requires full reasoning',
        shouldEarlyExit: false,
      };
    }

    // Module-level refactors: Tier 2-3
    if (context.scope === 'module') {
      return {
        tier: 2,
        confidence: 0.8,
        reason: 'Module-level refactor',
        shouldEarlyExit: false,
      };
    }

    // Function-level: Tier 1-2
    return {
      tier: context.type === 'rename' ? 1 : 2,
      confidence: 0.85,
      reason: `${context.type} refactor at function level`,
      shouldEarlyExit: context.type === 'rename',
    };
  }

  /**
   * Select tier for agent request
   */
  async selectTierForAgent(
    agent: AgentPersona,
    query: string,
    options: { context: ConversationContext; thread: any }
  ): Promise<number> {
    // Start with agent's default tier
    let tier = agent.defaultTier;

    // Analyze query complexity
    const complexity = await this.assessQueryComplexity(query);

    // Adjust based on complexity
    if (complexity === 'HIGH') {
      tier = Math.min(agent.maxTier, tier + 1);
    } else if (complexity === 'LOW') {
      tier = Math.max(1, tier - 1);
    }

    // Consider conversation context
    if (options.thread?.messages?.length > 10) {
      // Long conversations may need more context
      tier = Math.min(agent.maxTier, tier + 1);
    }

    // Consider file context
    if (options.context.openFiles.length > 5) {
      // Multiple files may indicate complex task
      tier = Math.min(agent.maxTier, tier);
    }

    return tier;
  }

  /**
   * Assess completion complexity
   */
  private async assessCompletionComplexity(
    context: CompletionContext
  ): Promise<{ score: number; confidence: number }> {
    let score = 0.5; // Default medium complexity
    let confidence = 0.7;

    // Language-based heuristics
    const complexLanguages = ['rust', 'cpp', 'haskell'];
    const simpleLanguages = ['markdown', 'json', 'yaml'];

    if (complexLanguages.includes(context.document.languageId)) {
      score += 0.2;
    } else if (simpleLanguages.includes(context.document.languageId)) {
      score -= 0.2;
    }

    // Position-based heuristics
    // Beginning of file: likely imports (simple)
    if (context.position.line < 10) {
      score -= 0.1;
    }

    // Prefix-based heuristics
    // Short prefix: simple completion
    if (context.prefix.length < 10) {
      score -= 0.1;
      confidence += 0.1;
    }

    // Long, complex prefix
    if (context.prefix.length > 100 && context.prefix.includes('function')) {
      score += 0.2;
    }

    // Selection present: likely refactoring (complex)
    if (context.selectedText && context.selectedText.length > 50) {
      score += 0.3;
    }

    return {
      score: Math.max(0, Math.min(1, score)),
      confidence: Math.max(0, Math.min(1, confidence)),
    };
  }

  /**
   * Assess query complexity for agents
   */
  private async assessQueryComplexity(
    query: string
  ): Promise<'LOW' | 'MEDIUM' | 'HIGH'> {
    // Keyword-based heuristics
    const highComplexityKeywords = [
      'refactor',
      'architecture',
      'design',
      'optimize',
      'debug',
      'explain why',
      'complex',
      'entire',
      'all files',
      'project-wide',
    ];

    const lowComplexityKeywords = [
      'what is',
      'how to',
      'simple',
      'quick',
      'rename',
      'typo',
      'format',
    ];

    const lowerQuery = query.toLowerCase();

    // Check for high complexity indicators
    for (const keyword of highComplexityKeywords) {
      if (lowerQuery.includes(keyword)) {
        return 'HIGH';
      }
    }

    // Check for low complexity indicators
    for (const keyword of lowComplexityKeywords) {
      if (lowerQuery.includes(keyword)) {
        return 'LOW';
      }
    }

    // Length-based heuristic
    if (query.length > 500) {
      return 'HIGH';
    }
    if (query.length < 50) {
      return 'LOW';
    }

    return 'MEDIUM';
  }

  /**
   * Log routing decision for analysis
   */
  logDecision(
    operation: string,
    decision: TierDecision,
    actualLatency?: number
  ): void {
    console.log(
      `[BMU] ${operation}: tier=${decision.tier}, confidence=${decision.confidence.toFixed(2)}, reason="${decision.reason}"${
        actualLatency ? `, latency=${actualLatency.toFixed(0)}ms` : ''
      }`
    );
  }
}

export default IDEBMURouter;


