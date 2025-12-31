/**
 * DebugModeHandler - Debugging and problem diagnosis mode
 *
 * Focuses on analyzing errors, stack traces, and helping diagnose
 * issues without making direct changes.
 */

import { BaseModeHandler, ModeProcessingResult } from './BaseModeHandler';
import type { Message, AgentMention, ConversationContext } from '../../types';
import type { AriaModeConfig } from '../types';

export class DebugModeHandler extends BaseModeHandler {
  constructor(config: AriaModeConfig) {
    super(config);
  }

  async preProcess(
    query: string,
    context: ConversationContext,
    mentions: AgentMention[]
  ): Promise<ModeProcessingResult> {
    // Enhance query with debugging context
    const debugQuery = this.enhanceQueryForDebugging(query, context);

    return {
      shouldInvokeAgent: true,
      modifiedQuery: debugQuery,
      systemPromptAddition: this.getSystemPromptAddition(),
      additionalContext: {
        mode: 'debug',
        canModifyFiles: false,
        canExecuteTerminal: true, // Allow running tests
        canModifyGit: false,
        focusAreas: ['errors', 'stack_traces', 'logs', 'test_failures'],
      },
      toolOverrides: {
        allowed: [
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
      },
      requireConfirmation: true,
    };
  }

  async postProcess(
    response: Message,
    context: ConversationContext
  ): Promise<Message> {
    // Add debugging metadata
    const debugInfo = this.extractDebugInfo(response.content);

    return {
      ...response,
      metadata: {
        ...response.metadata,
        debugAnalysis: debugInfo,
      },
    };
  }

  /**
   * Enhance query with debugging focus
   */
  private enhanceQueryForDebugging(
    query: string,
    context: ConversationContext
  ): string {
    const enhancements: string[] = [];

    // Add context about diagnostics if available
    if (context.diagnostics && context.diagnostics.length > 0) {
      enhancements.push(`\nCurrent diagnostics/errors:\n`);
      for (const diag of context.diagnostics.slice(0, 5)) {
        enhancements.push(`- ${diag.severity}: ${diag.message} (${diag.file}:${diag.line})`);
      }
    }

    // Add context about open files
    if (context.openFiles && context.openFiles.length > 0) {
      enhancements.push(`\nRelevant files:\n`);
      for (const file of context.openFiles.slice(0, 3)) {
        enhancements.push(`- ${file.path}`);
      }
    }

    if (enhancements.length > 0) {
      return `${query}\n\nContext:${enhancements.join('\n')}`;
    }

    return query;
  }

  /**
   * Extract debugging information from response
   */
  private extractDebugInfo(content: string): DebugAnalysis {
    return {
      rootCause: this.extractSection(content, 'root cause'),
      affectedFiles: this.extractFileReferences(content),
      suggestedFixes: this.extractSection(content, 'fix'),
      testCommands: this.extractCommands(content),
    };
  }

  private extractSection(content: string, keyword: string): string | undefined {
    const pattern = new RegExp(
      `(?:^|\\n)(?:##?\\s*)?(?:${keyword})[:\\s]*\\n([\\s\\S]*?)(?:\\n##|\\n-\\s*\\[|$)`,
      'i'
    );
    const match = content.match(pattern);
    return match ? match[1].trim() : undefined;
  }

  private extractFileReferences(content: string): string[] {
    const filePattern = /`([^`]+\.[a-zA-Z]+)`/g;
    const files: string[] = [];
    let match;
    while ((match = filePattern.exec(content)) !== null) {
      if (!files.includes(match[1])) {
        files.push(match[1]);
      }
    }
    return files;
  }

  private extractCommands(content: string): string[] {
    const commandPattern = /```(?:bash|sh|shell)?\n([^`]+)```/g;
    const commands: string[] = [];
    let match;
    while ((match = commandPattern.exec(content)) !== null) {
      commands.push(match[1].trim());
    }
    return commands;
  }
}

interface DebugAnalysis {
  rootCause?: string;
  affectedFiles: string[];
  suggestedFixes?: string;
  testCommands: string[];
}

export default DebugModeHandler;


