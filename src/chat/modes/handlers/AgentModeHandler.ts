/**
 * AgentModeHandler - Full agentic mode with all tools enabled
 *
 * This is the default mode where Aria has full access to all tools
 * and can make changes to files, run terminal commands, etc.
 */

import { BaseModeHandler, ModeProcessingResult } from './BaseModeHandler';
import type { Message, AgentMention, ConversationContext } from '../../types';
import type { AriaModeConfig } from '../types';

export class AgentModeHandler extends BaseModeHandler {
  constructor(config: AriaModeConfig) {
    super(config);
  }

  async preProcess(
    query: string,
    context: ConversationContext,
    mentions: AgentMention[]
  ): Promise<ModeProcessingResult> {
    // Agent mode is straightforward - proceed with full capabilities
    return {
      shouldInvokeAgent: true,
      systemPromptAddition: this.getSystemPromptAddition(),
      additionalContext: {
        mode: 'agent',
        canModifyFiles: true,
        canExecuteTerminal: true,
        canModifyGit: true,
      },
    };
  }

  async postProcess(
    response: Message,
    context: ConversationContext
  ): Promise<Message> {
    // No special post-processing for agent mode
    return response;
  }
}

export default AgentModeHandler;


