/**
 * ResearchModeHandler - Deep research via Athena integration
 *
 * For conducting thorough research on technical topics with
 * web search and knowledge synthesis capabilities.
 */

import { BaseModeHandler, ModeProcessingResult } from './BaseModeHandler';
import type { Message, AgentMention, ConversationContext } from '../../types';
import type { AriaModeConfig } from '../types';

export class ResearchModeHandler extends BaseModeHandler {
  constructor(config: AriaModeConfig) {
    super(config);
  }

  async preProcess(
    query: string,
    context: ConversationContext,
    mentions: AgentMention[]
  ): Promise<ModeProcessingResult> {
    // Enhance query for research depth
    const researchQuery = this.enhanceQueryForResearch(query);

    return {
      shouldInvokeAgent: true,
      modifiedQuery: researchQuery,
      systemPromptAddition: this.getSystemPromptAddition(),
      additionalContext: {
        mode: 'research',
        canModifyFiles: false,
        canExecuteTerminal: false,
        canModifyGit: false,
        useAthena: true,
        responseStyle: 'comprehensive',
      },
      toolOverrides: {
        allowed: [
          'read_file',
          'grep',
          'list_dir',
          'web_search',
          'athena_research',
          'fetch_url',
          'read_documentation',
        ],
      },
    };
  }

  async postProcess(
    response: Message,
    context: ConversationContext
  ): Promise<Message> {
    // Extract and structure research findings
    const citations = this.extractCitations(response.content);
    const summary = this.extractSummary(response.content);

    return {
      ...response,
      metadata: {
        ...response.metadata,
        isResearch: true,
        citations,
        summary,
        sources: citations.map((c) => c.url).filter(Boolean),
      },
    };
  }

  /**
   * Enhance query for comprehensive research
   */
  private enhanceQueryForResearch(query: string): string {
    // Check if query already seems research-focused
    const researchKeywords = [
      'research',
      'investigate',
      'compare',
      'analyze',
      'best practices',
    ];
    const isResearchQuery = researchKeywords.some((kw) =>
      query.toLowerCase().includes(kw)
    );

    if (isResearchQuery) {
      return query;
    }

    return `Research and provide comprehensive information about: ${query}

Please include:
1. Current best practices and recommendations
2. Different approaches and their trade-offs
3. Relevant examples and case studies
4. Citations and references where applicable
5. Considerations for implementation`;
  }

  /**
   * Extract citations from response
   */
  private extractCitations(content: string): Citation[] {
    const citations: Citation[] = [];

    // Match markdown links
    const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    while ((match = linkPattern.exec(content)) !== null) {
      citations.push({
        title: match[1],
        url: match[2],
      });
    }

    // Match numbered references
    const refPattern = /\[(\d+)\]\s*(.+?)(?:\n|$)/g;
    while ((match = refPattern.exec(content)) !== null) {
      citations.push({
        number: parseInt(match[1]),
        title: match[2].trim(),
      });
    }

    return citations;
  }

  /**
   * Extract summary from research response
   */
  private extractSummary(content: string): string | undefined {
    // Look for summary or conclusion section
    const summaryMatch = content.match(
      /(?:^|\n)(?:##?\s*)?(?:Summary|Conclusion|TL;DR)[:\s]*\n([\s\S]*?)(?:\n##|$)/i
    );
    if (summaryMatch) {
      return summaryMatch[1].trim().slice(0, 500);
    }

    return undefined;
  }
}

interface Citation {
  title: string;
  url?: string;
  number?: number;
}

export default ResearchModeHandler;

