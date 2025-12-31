/**
 * ModeRegistry - Central registry for Aria modes
 *
 * Manages mode configurations, state, and mode switching logic.
 */

import { EventEmitter } from 'events';
import type {
  AriaModeId,
  AriaModeConfig,
  AriaModeState,
  ModeChangeEvent,
} from './types';

/**
 * Default mode configurations
 */
const DEFAULT_MODES: Record<AriaModeId, AriaModeConfig> = {
  agent: {
    id: 'agent',
    displayName: 'Agent',
    description: 'Full agentic mode with file editing and tool execution',
    icon: '∞',
    shortcut: 'Cmd+Shift+1',
    color: '#6366f1',
    toolPermission: 'full',
    canModifyFiles: true,
    canExecuteTerminal: true,
    canModifyGit: true,
    requiresConfirmation: false,
    createsPlan: false,
    systemPromptAddition: `You are operating in Agent mode. You have full access to all tools and can:
- Read, write, and create files
- Execute terminal commands
- Make git operations
- Debug and analyze code
- Install dependencies and run tests

Take action directly to accomplish the user's goals. Be proactive and efficient.`,
    defaultAgentId: 'logos.conductor',
  },

  plan: {
    id: 'plan',
    displayName: 'Plan',
    description: 'Create detailed plans without making changes',
    icon: '⋮≡',
    shortcut: 'Cmd+Shift+2',
    color: '#10b981',
    toolPermission: 'read-only',
    canModifyFiles: false,
    canExecuteTerminal: false,
    canModifyGit: false,
    requiresConfirmation: false,
    createsPlan: true,
    systemPromptAddition: `You are operating in Plan mode. Your role is to:
- Analyze the user's request thoroughly
- Break down complex tasks into clear, actionable steps
- Create a structured plan with specific file paths and code snippets
- Identify dependencies and potential blockers
- Estimate complexity for each task

DO NOT make any changes to files or execute commands. Only create the plan.
The plan will be saved as a markdown file that can be executed later in Agent mode.`,
    defaultAgentId: 'logos.workspace_ca',
  },

  debug: {
    id: 'debug',
    displayName: 'Debug',
    description: 'Focus on debugging and problem diagnosis',
    icon: '⚙',
    shortcut: 'Cmd+Shift+3',
    color: '#ef4444',
    toolPermission: 'custom',
    allowedTools: [
      'read_file',
      'grep',
      'list_dir',
      'read_diagnostics',
      'get_breakpoints',
      'get_call_stack',
      'get_variables',
      'get_terminal_output',
      'run_tests',
    ],
    canModifyFiles: false,
    canExecuteTerminal: true,
    canModifyGit: false,
    requiresConfirmation: true,
    createsPlan: false,
    systemPromptAddition: `You are operating in Debug mode. Your focus is on:
- Diagnosing errors and issues in the code
- Analyzing stack traces and error messages
- Examining variable states and call stacks
- Reading logs and terminal output
- Running tests to identify failures
- Suggesting fixes (but not applying them)

Be methodical and thorough in your analysis. Explain root causes clearly.`,
    defaultAgentId: 'logos.swe',
  },

  ask: {
    id: 'ask',
    displayName: 'Ask',
    description: 'Question and answer mode with no changes',
    icon: '💬',
    shortcut: 'Cmd+Shift+4',
    color: '#8b5cf6',
    toolPermission: 'read-only',
    deniedTools: ['write_file', 'run_terminal', 'git_commit', 'git_push'],
    canModifyFiles: false,
    canExecuteTerminal: false,
    canModifyGit: false,
    requiresConfirmation: false,
    createsPlan: false,
    systemPromptAddition: `You are operating in Ask mode. Your role is to:
- Answer questions about the codebase
- Explain code, concepts, and patterns
- Provide guidance and best practices
- Reference relevant documentation
- Help with understanding existing code

You can read files to answer questions but MUST NOT make any changes.
This is a safe mode for learning and exploration.`,
    defaultAgentId: 'logos.workspace_ca',
  },

  research: {
    id: 'research',
    displayName: 'Research',
    description: 'Deep research via Athena integration',
    icon: '🔬',
    shortcut: 'Cmd+Shift+5',
    color: '#f59e0b',
    toolPermission: 'custom',
    allowedTools: [
      'read_file',
      'grep',
      'list_dir',
      'web_search',
      'athena_research',
      'fetch_url',
      'read_documentation',
    ],
    canModifyFiles: false,
    canExecuteTerminal: false,
    canModifyGit: false,
    requiresConfirmation: false,
    createsPlan: false,
    systemPromptAddition: `You are operating in Research mode with access to Athena. Your role is to:
- Conduct deep research on technical topics
- Search the web for current information
- Analyze and synthesize multiple sources
- Provide properly cited references
- Compare different approaches and technologies
- Give thorough, well-researched answers

Take your time to be comprehensive. Quality over speed.`,
    defaultAgentId: 'logos.researcher',
  },

  'code-review': {
    id: 'code-review',
    displayName: 'Code Review',
    description: 'Analyze code quality and suggest improvements',
    icon: '👁',
    shortcut: 'Cmd+Shift+6',
    color: '#ec4899',
    toolPermission: 'read-only',
    canModifyFiles: false,
    canExecuteTerminal: false,
    canModifyGit: false,
    requiresConfirmation: false,
    createsPlan: true,
    systemPromptAddition: `You are operating in Code Review mode. Your role is to:
- Analyze code quality, style, and patterns
- Identify bugs, security issues, and performance problems
- Suggest improvements and refactoring opportunities
- Check adherence to best practices
- Review test coverage and suggest missing tests
- Evaluate architecture and design decisions

Provide actionable feedback with specific line references and code examples.
Create a plan of suggested improvements when appropriate.`,
    defaultAgentId: 'logos.swe',
  },
};

/**
 * ModeRegistry manages all Aria modes and their state
 */
export class ModeRegistry extends EventEmitter {
  private static instance: ModeRegistry;
  private modes: Map<AriaModeId, AriaModeConfig> = new Map();
  private state: AriaModeState;

  private constructor() {
    super();
    // Register default modes
    for (const [id, config] of Object.entries(DEFAULT_MODES)) {
      this.modes.set(id as AriaModeId, config);
    }

    // Initialize state with Agent mode as default
    this.state = {
      currentMode: 'agent',
      activatedAt: Date.now(),
      wasAutoSwitched: false,
    };
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ModeRegistry {
    if (!ModeRegistry.instance) {
      ModeRegistry.instance = new ModeRegistry();
    }
    return ModeRegistry.instance;
  }

  /**
   * Get all registered modes
   */
  getAllModes(): AriaModeConfig[] {
    return Array.from(this.modes.values());
  }

  /**
   * Get a specific mode configuration
   */
  getMode(id: AriaModeId): AriaModeConfig | undefined {
    return this.modes.get(id);
  }

  /**
   * Get current mode state
   */
  getState(): AriaModeState {
    return { ...this.state };
  }

  /**
   * Get current mode configuration
   */
  getCurrentMode(): AriaModeConfig {
    const mode = this.modes.get(this.state.currentMode);
    if (!mode) {
      throw new Error(`Current mode not found: ${this.state.currentMode}`);
    }
    return mode;
  }

  /**
   * Switch to a different mode
   */
  switchMode(
    newModeId: AriaModeId,
    reason: 'user' | 'auto' | 'system' = 'user',
    context?: string
  ): void {
    const previousMode = this.state.currentMode;

    if (previousMode === newModeId) {
      return; // Already in this mode
    }

    const newMode = this.modes.get(newModeId);
    if (!newMode) {
      throw new Error(`Unknown mode: ${newModeId}`);
    }

    // Update state
    this.state = {
      currentMode: newModeId,
      previousMode,
      activatedAt: Date.now(),
      wasAutoSwitched: reason === 'auto',
      switchContext: context,
      activePlanId: undefined, // Reset plan when switching modes
    };

    // Emit change event
    const event: ModeChangeEvent = {
      previousMode,
      newMode: newModeId,
      timestamp: Date.now(),
      reason,
    };
    this.emit('modeChange', event);

    console.log(
      `[ModeRegistry] Switched from ${previousMode} to ${newModeId} (${reason})`
    );
  }

  /**
   * Set the active plan ID
   */
  setActivePlan(planId: string | undefined): void {
    this.state.activePlanId = planId;
  }

  /**
   * Check if a tool is allowed in the current mode
   */
  isToolAllowed(toolId: string): boolean {
    const mode = this.getCurrentMode();

    switch (mode.toolPermission) {
      case 'full':
        return true;

      case 'none':
        return false;

      case 'read-only':
        // Allow read-only tools
        return this.isReadOnlyTool(toolId);

      case 'custom':
        // Check allowed/denied lists
        if (mode.deniedTools?.includes(toolId)) {
          return false;
        }
        if (mode.allowedTools) {
          return mode.allowedTools.includes(toolId);
        }
        return true;

      default:
        return false;
    }
  }

  /**
   * Check if a tool is read-only
   */
  private isReadOnlyTool(toolId: string): boolean {
    const readOnlyPatterns = [
      'read_',
      'get_',
      'list_',
      'search_',
      'grep',
      'find_',
      'analyze_',
      'check_',
    ];
    return readOnlyPatterns.some((pattern) => toolId.startsWith(pattern));
  }

  /**
   * Register a custom mode
   */
  registerMode(config: AriaModeConfig): void {
    this.modes.set(config.id, config);
    this.emit('modeRegistered', config);
  }

  /**
   * Update an existing mode configuration
   */
  updateMode(id: AriaModeId, updates: Partial<AriaModeConfig>): void {
    const existing = this.modes.get(id);
    if (!existing) {
      throw new Error(`Mode not found: ${id}`);
    }
    this.modes.set(id, { ...existing, ...updates, id }); // Preserve ID
    this.emit('modeUpdated', { id, updates });
  }

  /**
   * Get the system prompt addition for the current mode
   */
  getSystemPromptAddition(): string {
    return this.getCurrentMode().systemPromptAddition;
  }

  /**
   * Detect appropriate mode from user query (for auto-switching)
   */
  detectModeFromQuery(query: string): AriaModeId | null {
    const lowerQuery = query.toLowerCase();

    // Debug mode indicators
    if (
      lowerQuery.includes('debug') ||
      lowerQuery.includes('error') ||
      lowerQuery.includes('exception') ||
      lowerQuery.includes('stack trace') ||
      lowerQuery.includes('why is') ||
      lowerQuery.includes("what's wrong")
    ) {
      return 'debug';
    }

    // Research mode indicators
    if (
      lowerQuery.includes('research') ||
      lowerQuery.includes('investigate') ||
      lowerQuery.includes('best practice') ||
      lowerQuery.includes('compare') ||
      lowerQuery.includes('what are the options')
    ) {
      return 'research';
    }

    // Plan mode indicators
    if (
      lowerQuery.includes('plan') ||
      lowerQuery.includes('break down') ||
      lowerQuery.includes('steps to') ||
      lowerQuery.includes('how would i')
    ) {
      return 'plan';
    }

    // Code review indicators
    if (
      lowerQuery.includes('review') ||
      lowerQuery.includes('analyze this code') ||
      lowerQuery.includes('any issues') ||
      lowerQuery.includes('improve this')
    ) {
      return 'code-review';
    }

    // Ask mode indicators (questions without action intent)
    if (
      lowerQuery.startsWith('what is') ||
      lowerQuery.startsWith('how does') ||
      lowerQuery.startsWith('explain') ||
      lowerQuery.startsWith('why')
    ) {
      return 'ask';
    }

    return null; // No auto-switch, stay in current mode
  }
}

export default ModeRegistry;

