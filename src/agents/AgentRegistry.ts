/**
 * AgentRegistry - Central registry for ARIA agents in Logos
 *
 * Manages agent personas, invocation, and D3N model binding.
 */

import { PersonaAuth } from '../governance/PersonaAuth';
import { IDEBMURouter } from '../d3n/bmu/IDEBMURouter';
import { AuditLogger } from '../governance/AuditLogger';
import type {
  AgentPersona,
  AgentResponse,
  Thread,
  ConversationContext,
} from '../chat/types';

/**
 * Agent invocation options
 */
export interface InvokeOptions {
  context: ConversationContext;
  thread: Thread;
  previousMessages?: Array<{ role: string; content: string }>;
}

/**
 * Agent Registry manages all available ARIA agents for the IDE
 */
export class AgentRegistry {
  private static instance: AgentRegistry;
  private agents: Map<string, AgentPersona> = new Map();
  private bmuRouter: IDEBMURouter;

  private constructor() {
    this.bmuRouter = new IDEBMURouter();
    this.registerBuiltinAgents();
  }

  static getInstance(): AgentRegistry {
    if (!this.instance) {
      this.instance = new AgentRegistry();
    }
    return this.instance;
  }

  /**
   * Register built-in Logos agents
   */
  private registerBuiltinAgents(): void {
    // Conductor Agent - Master orchestrator
    this.register({
      id: 'logos.conductor',
      name: 'Conductor',
      description: 'Master orchestrator for complex multi-step tasks',
      icon: '🎼',
      color: '#6366f1',
      defaultTier: 2,
      maxTier: 3,
      moePreferences: {
        reasoning: 0.5,
        orchestration: 0.4,
        coding: 0.1,
      },
      toolPermissions: [
        'agent_delegation',
        'task_decomposition',
        'file_read',
      ],
    });

    // SWE Agent - Software Engineer
    this.register({
      id: 'logos.swe',
      name: 'SWE',
      description: 'Code generation, debugging, and refactoring specialist',
      icon: '👨‍💻',
      color: '#10b981',
      defaultTier: 2,
      maxTier: 3,
      moePreferences: {
        coding: 0.6,
        reasoning: 0.3,
        documentation: 0.1,
      },
      toolPermissions: [
        'file_read',
        'file_write',
        'file_create',
        'terminal_execute',
        'git_operations',
        'test_run',
        'debug_start',
      ],
    });

    // Data Analyst Agent
    this.register({
      id: 'logos.data_analyst',
      name: 'Data Analyst',
      description: 'Data exploration, visualization, and analysis expert',
      icon: '📊',
      color: '#f59e0b',
      defaultTier: 2,
      maxTier: 3,
      moePreferences: {
        analysis: 0.5,
        visualization: 0.3,
        reasoning: 0.2,
      },
      toolPermissions: [
        'file_read',
        'data_query',
        'visualization_create',
        'notebook_execute',
      ],
    });

    // Researcher Agent (Athena integration)
    this.register({
      id: 'logos.researcher',
      name: 'Researcher',
      description: 'Deep research and literature review via Athena',
      icon: '🔬',
      color: '#8b5cf6',
      defaultTier: 3,
      maxTier: 3,
      moePreferences: {
        research: 0.6,
        synthesis: 0.3,
        reasoning: 0.1,
      },
      toolPermissions: [
        'web_search',
        'athena_research',
        'citation_create',
        'file_read',
      ],
    });

    // Workspace CA Agent
    this.register({
      id: 'logos.workspace_ca',
      name: 'Workspace CA',
      description: 'Per-project architect for documentation and improvements',
      icon: '🏗️',
      color: '#ec4899',
      defaultTier: 2,
      maxTier: 3,
      moePreferences: {
        architecture: 0.4,
        documentation: 0.3,
        reasoning: 0.2,
        coding: 0.1,
      },
      toolPermissions: [
        'file_read',
        'file_write_docs_only',
        'workspace_analysis',
        'diagram_generation',
        'suggestion_emit',
      ],
    });
  }

  /**
   * Register an agent
   */
  register(agent: AgentPersona): void {
    this.agents.set(agent.id, agent);
  }

  /**
   * Get an agent by ID
   */
  get(agentId: string): AgentPersona | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all registered agents
   */
  getAll(): AgentPersona[] {
    return Array.from(this.agents.values());
  }

  /**
   * Invoke an agent with a query
   */
  async invoke(
    agentId: string,
    query: string,
    options: InvokeOptions
  ): Promise<AgentResponse> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Verify permissions via PERSONA
    const auth = await PersonaAuth.getInstance();
    await auth.verifyAgentPermission(agentId, options.context.workspaceId);

    // Select optimal tier via BMU
    const tier = await this.bmuRouter.selectTierForAgent(agent, query, options);

    // Build the prompt with agent persona
    const prompt = this.buildPrompt(agent, query, options);

    // Invoke D3N inference
    const startTime = performance.now();
    const response = await this.invokeD3N(agent, prompt, tier);
    const latencyMs = performance.now() - startTime;

    return {
      content: response.content,
      tierUsed: tier,
      codeBlocks: this.extractCodeBlocks(response.content),
      handoffTo: response.handoffTo,
      suggestions: response.suggestions,
      latencyMs,
    };
  }

  /**
   * Build the full prompt with agent persona and context
   */
  private buildPrompt(
    agent: AgentPersona,
    query: string,
    options: InvokeOptions
  ): string {
    const parts: string[] = [];

    // Agent persona system prompt
    parts.push(this.getAgentSystemPrompt(agent));

    // Context from open files
    if (options.context.openFiles.length > 0) {
      parts.push('\n## Open Files\n');
      for (const file of options.context.openFiles.slice(0, 5)) {
        parts.push(`- ${file.path} (${file.language}, ${file.lineCount} lines)`);
      }
    }

    // Selection context
    if (options.context.selection) {
      const sel = options.context.selection;
      parts.push('\n## Selected Code\n');
      parts.push(`File: ${sel.file} (lines ${sel.startLine}-${sel.endLine})`);
      parts.push('```');
      parts.push(sel.content);
      parts.push('```');
    }

    // Previous messages for context
    if (options.previousMessages && options.previousMessages.length > 0) {
      parts.push('\n## Conversation Context\n');
      for (const msg of options.previousMessages.slice(-5)) {
        parts.push(`${msg.role}: ${msg.content.slice(0, 200)}...`);
      }
    }

    // User query
    parts.push('\n## User Query\n');
    parts.push(query);

    return parts.join('\n');
  }

  /**
   * Get system prompt for an agent
   */
  private getAgentSystemPrompt(agent: AgentPersona): string {
    const prompts: Record<string, string> = {
      'logos.conductor': `You are the Conductor agent in Logos IDE. Your role is to:
1. Understand complex user requests and break them into steps
2. Delegate to specialist agents when appropriate
3. Coordinate multi-step tasks across agents
4. Synthesize results from multiple agents

Be concise and focus on orchestration. When a task clearly belongs to a specialist (SWE for coding, DA for data, Researcher for research), delegate to them.`,

      'logos.swe': `You are the Software Engineer (SWE) agent in Logos IDE. Your role is to:
1. Generate high-quality code that follows project conventions
2. Debug issues and explain root causes
3. Refactor code for better maintainability
4. Write tests and documentation
5. Review code and suggest improvements

Always consider the existing codebase patterns. Provide complete, runnable code.`,

      'logos.data_analyst': `You are the Data Analyst agent in Logos IDE. Your role is to:
1. Explore and analyze data files
2. Create visualizations and charts
3. Write data processing scripts
4. Identify patterns and insights
5. Explain statistical findings

Focus on clear explanations and actionable insights.`,

      'logos.researcher': `You are the Researcher agent in Logos IDE, powered by Athena. Your role is to:
1. Conduct deep research on technical topics
2. Synthesize information from multiple sources
3. Provide properly cited references
4. Explain complex concepts clearly
5. Compare different approaches

Always cite your sources and be transparent about confidence levels.`,

      'logos.workspace_ca': `You are the Workspace Cognitive Architect in Logos IDE. Your role is to:
1. Understand the project structure and patterns
2. Suggest architectural improvements
3. Generate and maintain documentation
4. Identify technical debt
5. Help with task planning and breakdown

Be proactive with suggestions but respectful of existing decisions.`,
    };

    return prompts[agent.id] || `You are ${agent.name}: ${agent.description}`;
  }

  /**
   * Invoke D3N inference (placeholder for actual implementation)
   */
  private async invokeD3N(
    agent: AgentPersona,
    prompt: string,
    tier: number
  ): Promise<{ content: string; handoffTo?: string; suggestions?: string[] }> {
    // This would connect to the actual D3N service
    // For now, return a placeholder
    console.log(`[D3N] Invoking ${agent.id} at tier ${tier}`);
    
    // TODO: Replace with actual D3N client
    return {
      content: `[${agent.name}] Response would be generated by D3N tier ${tier} here.`,
    };
  }

  /**
   * Extract code blocks from markdown response
   */
  private extractCodeBlocks(
    content: string
  ): Array<{ id: string; code: string; language: string; filename?: string }> {
    const blocks: Array<{
      id: string;
      code: string;
      language: string;
      filename?: string;
    }> = [];
    
    const codeBlockRegex = /```(\w+)?(?::([^\n]+))?\n([\s\S]*?)```/g;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      blocks.push({
        id: crypto.randomUUID(),
        language: match[1] || 'text',
        filename: match[2],
        code: match[3].trim(),
      });
    }

    return blocks;
  }
}

export default AgentRegistry;

