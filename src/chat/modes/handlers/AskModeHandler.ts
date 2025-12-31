/**
 * AskModeHandler - Question and answer mode
 *
 * Safe mode for asking questions about the codebase without
 * making any changes. Ideal for learning and exploration.
 */

import { BaseModeHandler, ModeProcessingResult } from './BaseModeHandler';
import type { Message, AgentMention, ConversationContext } from '../../types';
import type { AriaModeConfig } from '../types';

export class AskModeHandler extends BaseModeHandler {
  constructor(config: AriaModeConfig) {
    super(config);
  }

  async preProcess(
    query: string,
    context: ConversationContext,
    mentions: AgentMention[]
  ): Promise<ModeProcessingResult> {
    return {
      shouldInvokeAgent: true,
      systemPromptAddition: this.getSystemPromptAddition(),
      additionalContext: {
        mode: 'ask',
        canModifyFiles: false,
        canExecuteTerminal: false,
        canModifyGit: false,
        responseStyle: 'explanatory',
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
          'git_stage',
        ],
      },
    };
  }

  async postProcess(
    response: Message,
    context: ConversationContext
  ): Promise<Message> {
    // Add helpful metadata for Q&A responses
    return {
      ...response,
      metadata: {
        ...response.metadata,
        isExplanation: true,
        relatedTopics: this.extractRelatedTopics(response.content),
      },
    };
  }

  /**
   * Extract related topics for follow-up questions
   */
  private extractRelatedTopics(content: string): string[] {
    const topics: string[] = [];

    // Extract code references
    const codeRefs = content.match(/`([^`]+)`/g);
    if (codeRefs) {
      topics.push(
        ...codeRefs
          .slice(0, 5)
          .map((ref) => ref.replace(/`/g, ''))
          .filter((ref) => ref.length < 50)
      );
    }

    // Extract headings as topics
    const headings = content.match(/^#{1,3}\s+(.+)$/gm);
    if (headings) {
      topics.push(
        ...headings.slice(0, 3).map((h) => h.replace(/^#+\s+/, ''))
      );
    }

    return [...new Set(topics)].slice(0, 5);
  }
}

export default AskModeHandler;

