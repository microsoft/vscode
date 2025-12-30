/**
 * ARIAClient - Client for ARIA multi-agent orchestration
 *
 * Handles multi-agent invocations, handoffs, and conversation
 * context management through the ARIA conductor.
 */

import { getD3NClient, D3NClient, InvokeResponse } from './D3NClient';

export interface ARIAConfig {
  conductorEndpoint: string;
  apifEnabled?: boolean;
  agentTimeoutMs?: number;
}

export interface MultiAgentRequest {
  query: string;
  agentIds?: string[];
  context?: Record<string, any>;
  allowHandoffs?: boolean;
}

export interface MultiAgentResponse {
  responses: AgentResponse[];
  synthesizedContent: string;
  handoffChain: string[];
  totalLatencyMs: number;
  totalTokens: number;
}

export interface AgentResponse {
  agentId: string;
  content: string;
  tierUsed: number;
  latencyMs: number;
  tokensUsed: number;
  codeBlocks: any[];
}

export interface ConversationContext {
  threadId: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    agentId?: string;
    timestamp: string;
  }>;
  agents: string[];
}

export class ARIAClient {
  private config: ARIAConfig;
  private d3nClient: D3NClient;
  private conversationHistory: Map<string, ConversationContext>;

  constructor(config: ARIAConfig) {
    this.config = {
      apifEnabled: true,
      agentTimeoutMs: 30000,
      ...config,
    };
    this.d3nClient = getD3NClient();
    this.conversationHistory = new Map();
  }

  /**
   * Invoke one or more agents with automatic routing
   */
  async invoke(request: MultiAgentRequest): Promise<MultiAgentResponse> {
    const startTime = Date.now();
    const responses: AgentResponse[] = [];
    const handoffChain: string[] = [];

    // Determine agents to invoke
    let agentIds = request.agentIds || [];
    if (agentIds.length === 0) {
      const routingResult = await this.routeQuery(request.query, request.context);
      agentIds = [routingResult.agentId];
      handoffChain.push(`Routed to ${routingResult.agentId}: ${routingResult.reason}`);
    }

    // Invoke each agent
    for (const agentId of agentIds) {
      try {
        const response = await this.invokeAgent(agentId, request.query, request.context);
        responses.push(response);

        // Check for handoffs
        if (request.allowHandoffs !== false) {
          const handoffTo = this.detectHandoff(response.content);
          if (handoffTo && !agentIds.includes(handoffTo)) {
            handoffChain.push(`Handoff from ${agentId} to ${handoffTo}`);
            const handoffResponse = await this.invokeAgent(
              handoffTo,
              request.query,
              request.context
            );
            responses.push(handoffResponse);
          }
        }
      } catch (error) {
        console.error(`[ARIA] Agent ${agentId} failed:`, error);
        responses.push({
          agentId,
          content: `Error invoking ${agentId}: ${error}`,
          tierUsed: 0,
          latencyMs: 0,
          tokensUsed: 0,
          codeBlocks: [],
        });
      }
    }

    // Synthesize responses
    const synthesized = this.synthesizeResponses(responses);

    return {
      responses,
      synthesizedContent: synthesized,
      handoffChain,
      totalLatencyMs: Date.now() - startTime,
      totalTokens: responses.reduce((sum, r) => sum + r.tokensUsed, 0),
    };
  }

  /**
   * Invoke a single agent
   */
  private async invokeAgent(
    agentId: string,
    query: string,
    context?: Record<string, any>
  ): Promise<AgentResponse> {
    const result = await this.d3nClient.invoke({
      agentId,
      query,
      context,
    });

    return {
      agentId,
      content: result.content,
      tierUsed: result.tierUsed,
      latencyMs: result.latencyMs,
      tokensUsed: result.tokensUsed,
      codeBlocks: result.codeBlocks,
    };
  }

  /**
   * Route query to appropriate agent
   */
  private async routeQuery(
    query: string,
    context?: Record<string, any>
  ): Promise<{ agentId: string; confidence: number; reason: string }> {
    // Local routing logic (mirrors d3n_core routing_policies.py)
    const patterns: Record<string, RegExp[]> = {
      'logos.swe': [/refactor/i, /implement/i, /fix\s+bug/i, /write\s+code/i, /debug/i],
      'logos.data_analyst': [/analyze/i, /visuali[sz]e/i, /chart/i, /plot/i, /data/i],
      'logos.researcher': [/research/i, /investigate/i, /best\s+practice/i, /documentation/i],
      'logos.workspace_ca': [/document/i, /architecture/i, /explain/i, /readme/i],
    };

    for (const [agentId, regexes] of Object.entries(patterns)) {
      for (const regex of regexes) {
        if (regex.test(query)) {
          return {
            agentId,
            confidence: 0.8,
            reason: `Pattern match: ${regex.source}`,
          };
        }
      }
    }

    // Default to conductor
    return {
      agentId: 'logos.conductor',
      confidence: 0.5,
      reason: 'Default routing',
    };
  }

  /**
   * Detect handoff request in response
   */
  private detectHandoff(content: string): string | null {
    const patterns: Array<[RegExp, string]> = [
      [/I'll delegate this to (\w+)/i, '$1'],
      [/(\w+) would be better suited/i, '$1'],
      [/Let me ask (\w+)/i, '$1'],
    ];

    for (const [pattern, _] of patterns) {
      const match = content.match(pattern);
      if (match) {
        const mentioned = match[1].toLowerCase();
        const agentMap: Record<string, string> = {
          swe: 'logos.swe',
          'software engineer': 'logos.swe',
          da: 'logos.data_analyst',
          'data analyst': 'logos.data_analyst',
          researcher: 'logos.researcher',
          ca: 'logos.workspace_ca',
          'cognitive architect': 'logos.workspace_ca',
        };
        return agentMap[mentioned] || null;
      }
    }

    return null;
  }

  /**
   * Synthesize multiple agent responses
   */
  private synthesizeResponses(responses: AgentResponse[]): string {
    if (responses.length === 1) {
      return responses[0].content;
    }

    const parts: string[] = ['Based on input from multiple specialists:\n'];

    for (const response of responses) {
      const agentName = response.agentId.split('.').pop()?.toUpperCase() || 'Agent';
      parts.push(`\n**${agentName}:**\n${response.content}\n`);
    }

    return parts.join('');
  }

  /**
   * Start a new conversation
   */
  createConversation(threadId: string): void {
    this.conversationHistory.set(threadId, {
      threadId,
      messages: [],
      agents: [],
    });
  }

  /**
   * Add message to conversation
   */
  addMessage(
    threadId: string,
    role: 'user' | 'assistant',
    content: string,
    agentId?: string
  ): void {
    const context = this.conversationHistory.get(threadId);
    if (context) {
      context.messages.push({
        role,
        content,
        agentId,
        timestamp: new Date().toISOString(),
      });
      if (agentId && !context.agents.includes(agentId)) {
        context.agents.push(agentId);
      }
    }
  }

  /**
   * Get conversation context
   */
  getConversation(threadId: string): ConversationContext | undefined {
    return this.conversationHistory.get(threadId);
  }
}

/**
 * Create ARIA client singleton
 */
let ariaInstance: ARIAClient | null = null;

export function getARIAClient(): ARIAClient {
  if (!ariaInstance) {
    const endpoint = process.env.ARIA_CONDUCTOR_ENDPOINT || 'http://localhost:8090';
    ariaInstance = new ARIAClient({ conductorEndpoint: endpoint });
  }
  return ariaInstance;
}

export function initializeARIAClient(config: ARIAConfig): ARIAClient {
  ariaInstance = new ARIAClient(config);
  return ariaInstance;
}

export default ARIAClient;


