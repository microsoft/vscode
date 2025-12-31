/**
 * BaseModeHandler - Abstract base class for mode-specific handlers
 *
 * Each mode has its own handler that customizes agent behavior,
 * tool access, and response processing.
 */

import type {
  AriaModeConfig,
  AriaModeId,
  Plan,
  PlanItem,
} from '../types';
import type { Message, AgentMention, ConversationContext } from '../../types';

/**
 * Result of processing a message in a specific mode
 */
export interface ModeProcessingResult {
  /** Whether to proceed with agent invocation */
  shouldInvokeAgent: boolean;

  /** Modified query (if any) */
  modifiedQuery?: string;

  /** Additional context to add */
  additionalContext?: Record<string, any>;

  /** System prompt additions */
  systemPromptAddition?: string;

  /** Pre-invocation messages to show user */
  preMessages?: Message[];

  /** Post-invocation processing function */
  postProcess?: (response: Message) => Message;

  /** Plan to create/update */
  plan?: Plan;

  /** Tools to enable/disable for this request */
  toolOverrides?: {
    allowed?: string[];
    denied?: string[];
  };

  /** Whether to require confirmation before actions */
  requireConfirmation?: boolean;
}

/**
 * Abstract base class for mode handlers
 */
export abstract class BaseModeHandler {
  protected config: AriaModeConfig;

  constructor(config: AriaModeConfig) {
    this.config = config;
  }

  /**
   * Get the mode ID this handler is for
   */
  get modeId(): AriaModeId {
    return this.config.id;
  }

  /**
   * Pre-process a user message before agent invocation
   */
  abstract preProcess(
    query: string,
    context: ConversationContext,
    mentions: AgentMention[]
  ): Promise<ModeProcessingResult>;

  /**
   * Post-process an agent response
   */
  abstract postProcess(
    response: Message,
    context: ConversationContext
  ): Promise<Message>;

  /**
   * Get the system prompt addition for this mode
   */
  getSystemPromptAddition(): string {
    return this.config.systemPromptAddition;
  }

  /**
   * Check if a tool is allowed in this mode
   */
  isToolAllowed(toolId: string): boolean {
    switch (this.config.toolPermission) {
      case 'full':
        return true;
      case 'none':
        return false;
      case 'read-only':
        return this.isReadOnlyTool(toolId);
      case 'custom':
        if (this.config.deniedTools?.includes(toolId)) {
          return false;
        }
        if (this.config.allowedTools) {
          return this.config.allowedTools.includes(toolId);
        }
        return true;
      default:
        return false;
    }
  }

  /**
   * Check if a tool is read-only
   */
  protected isReadOnlyTool(toolId: string): boolean {
    const readOnlyPrefixes = [
      'read_',
      'get_',
      'list_',
      'search_',
      'grep',
      'find_',
      'analyze_',
      'check_',
    ];
    return readOnlyPrefixes.some((prefix) => toolId.startsWith(prefix));
  }

  /**
   * Get the default agent for this mode
   */
  getDefaultAgent(): string | undefined {
    return this.config.defaultAgentId;
  }

  /**
   * Whether this mode creates plans
   */
  createsPlan(): boolean {
    return this.config.createsPlan;
  }

  /**
   * Extract plan items from agent response (if applicable)
   */
  protected extractPlanItems(response: string): PlanItem[] {
    const items: PlanItem[] = [];
    const todoPattern = /^[-*]\s*\[([ x])\]\s*(.+)$/gm;
    let match;
    let order = 0;

    while ((match = todoPattern.exec(response)) !== null) {
      items.push({
        id: crypto.randomUUID(),
        content: match[2].trim(),
        status: match[1] === 'x' ? 'completed' : 'pending',
        order: order++,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    return items;
  }
}

export default BaseModeHandler;

