/**
 * PlanModeHandler - Plan creation mode without making changes
 *
 * In this mode, Aria creates detailed plans that can be executed
 * later in Agent mode. No file modifications or terminal commands.
 */

import { BaseModeHandler, ModeProcessingResult } from './BaseModeHandler';
import type { Message, AgentMention, ConversationContext } from '../../types';
import type { AriaModeConfig, Plan, PlanItem } from '../types';

export class PlanModeHandler extends BaseModeHandler {
  constructor(config: AriaModeConfig) {
    super(config);
  }

  async preProcess(
    query: string,
    context: ConversationContext,
    mentions: AgentMention[]
  ): Promise<ModeProcessingResult> {
    // Modify the query to emphasize planning
    const planningQuery = this.enhanceQueryForPlanning(query);

    return {
      shouldInvokeAgent: true,
      modifiedQuery: planningQuery,
      systemPromptAddition: this.getSystemPromptAddition(),
      additionalContext: {
        mode: 'plan',
        canModifyFiles: false,
        canExecuteTerminal: false,
        canModifyGit: false,
        outputFormat: 'plan',
      },
      toolOverrides: {
        denied: [
          'write_file',
          'create_file',
          'delete_file',
          'run_terminal',
          'git_commit',
          'git_push',
          'git_checkout',
        ],
      },
    };
  }

  async postProcess(
    response: Message,
    context: ConversationContext
  ): Promise<Message> {
    // Extract plan items from the response
    const planItems = this.extractPlanItems(response.content);

    if (planItems.length > 0) {
      // Create a plan object to attach to the response
      const plan: Plan = {
        id: crypto.randomUUID(),
        name: this.extractPlanName(response.content),
        overview: this.extractPlanOverview(response.content),
        items: planItems,
        sessionId: context.workspaceId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isComplete: false,
        createdByMode: 'plan',
      };

      // Attach plan metadata to response
      return {
        ...response,
        metadata: {
          ...response.metadata,
          plan,
          hasPlan: true,
        },
      };
    }

    return response;
  }

  /**
   * Enhance the user's query to emphasize planning output
   */
  private enhanceQueryForPlanning(query: string): string {
    // Check if query already mentions planning
    const planKeywords = ['plan', 'steps', 'break down', 'how would'];
    const hasPlanning = planKeywords.some((kw) =>
      query.toLowerCase().includes(kw)
    );

    if (hasPlanning) {
      return query;
    }

    return `Please create a detailed plan for: ${query}

Structure the plan with:
1. Clear, actionable todo items using checkbox format: - [ ] task
2. Specific file paths where changes will be made
3. Code snippets showing what will change
4. Dependencies between tasks
5. Estimated complexity for each task`;
  }

  /**
   * Extract plan name from response
   */
  private extractPlanName(content: string): string {
    // Try to find a title in the response
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      return titleMatch[1].trim();
    }

    // Use first line as fallback
    const firstLine = content.split('\n')[0];
    return firstLine.slice(0, 60) + (firstLine.length > 60 ? '...' : '');
  }

  /**
   * Extract plan overview from response
   */
  private extractPlanOverview(content: string): string {
    // Look for overview section
    const overviewMatch = content.match(
      /(?:^|\n)(?:##?\s*)?(?:Overview|Summary)[:\s]*\n([\s\S]*?)(?:\n##|\n-\s*\[|$)/i
    );
    if (overviewMatch) {
      return overviewMatch[1].trim().slice(0, 500);
    }

    // Use first paragraph as fallback
    const paragraphs = content.split(/\n\n+/);
    return paragraphs[0].slice(0, 500);
  }
}

export default PlanModeHandler;

