/**
 * CodeReviewModeHandler - Code quality analysis mode
 *
 * Analyzes code quality, identifies issues, and suggests improvements
 * without making direct changes. Creates a plan of suggested fixes.
 */

import { BaseModeHandler, ModeProcessingResult } from './BaseModeHandler';
import type { Message, AgentMention, ConversationContext } from '../../types';
import type { AriaModeConfig, Plan } from '../types';

export class CodeReviewModeHandler extends BaseModeHandler {
  constructor(config: AriaModeConfig) {
    super(config);
  }

  async preProcess(
    query: string,
    context: ConversationContext,
    mentions: AgentMention[]
  ): Promise<ModeProcessingResult> {
    // Enhance query for code review focus
    const reviewQuery = this.enhanceQueryForReview(query, context);

    return {
      shouldInvokeAgent: true,
      modifiedQuery: reviewQuery,
      systemPromptAddition: this.getSystemPromptAddition(),
      additionalContext: {
        mode: 'code-review',
        canModifyFiles: false,
        canExecuteTerminal: false,
        canModifyGit: false,
        focusAreas: [
          'bugs',
          'security',
          'performance',
          'maintainability',
          'style',
        ],
      },
      toolOverrides: {
        denied: [
          'write_file',
          'create_file',
          'delete_file',
          'run_terminal',
          'git_commit',
          'git_push',
        ],
      },
    };
  }

  async postProcess(
    response: Message,
    context: ConversationContext
  ): Promise<Message> {
    // Extract review findings and create improvement plan
    const findings = this.extractFindings(response.content);
    const planItems = this.extractPlanItems(response.content);

    let plan: Plan | undefined;
    if (planItems.length > 0) {
      plan = {
        id: crypto.randomUUID(),
        name: 'Code Review Improvements',
        overview: `Code review findings with ${findings.length} issues identified`,
        items: planItems,
        sessionId: context.workspaceId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isComplete: false,
        createdByMode: 'code-review',
        tags: ['code-review'],
      };
    }

    return {
      ...response,
      metadata: {
        ...response.metadata,
        isCodeReview: true,
        findings,
        plan,
        hasPlan: !!plan,
        severityCounts: this.countBySeverity(findings),
      },
    };
  }

  /**
   * Enhance query for code review
   */
  private enhanceQueryForReview(
    query: string,
    context: ConversationContext
  ): string {
    const fileContext = context.selection
      ? `\nFile: ${context.selection.file}\nLines: ${context.selection.startLine}-${context.selection.endLine}`
      : context.openFiles.length > 0
        ? `\nReviewing: ${context.openFiles[0].path}`
        : '';

    return `Please review the following code and provide feedback:
${query}
${fileContext}

Structure your review with:
1. **Critical Issues** (bugs, security vulnerabilities)
2. **Performance Concerns**
3. **Code Quality & Maintainability**
4. **Style & Consistency**
5. **Suggested Improvements** (as actionable todo items)

For each issue, provide:
- Severity (critical/warning/info)
- Line reference if applicable
- Explanation of the problem
- Suggested fix`;
  }

  /**
   * Extract review findings from response
   */
  private extractFindings(content: string): ReviewFinding[] {
    const findings: ReviewFinding[] = [];

    // Match severity patterns
    const patterns = [
      { severity: 'critical', pattern: /(?:critical|error|bug|security):\s*(.+)/gi },
      { severity: 'warning', pattern: /(?:warning|performance|concern):\s*(.+)/gi },
      { severity: 'info', pattern: /(?:info|suggestion|improvement):\s*(.+)/gi },
    ];

    for (const { severity, pattern } of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        findings.push({
          severity: severity as 'critical' | 'warning' | 'info',
          message: match[1].trim(),
          line: this.extractLineNumber(match[0]),
        });
      }
    }

    // Also extract bullet points under severity headers
    const sectionPattern =
      /(?:^|\n)#{1,3}\s*(?:Critical|Warning|Info|Bugs?|Security|Performance|Quality)[^\n]*\n([\s\S]*?)(?=\n#{1,3}|$)/gi;
    let sectionMatch;
    while ((sectionMatch = sectionPattern.exec(content)) !== null) {
      const header = sectionMatch[0].toLowerCase();
      const severity = header.includes('critical') || header.includes('bug') || header.includes('security')
        ? 'critical'
        : header.includes('warning') || header.includes('performance')
          ? 'warning'
          : 'info';

      const bullets = sectionMatch[1].match(/^[-*]\s+(.+)$/gm);
      if (bullets) {
        for (const bullet of bullets) {
          findings.push({
            severity,
            message: bullet.replace(/^[-*]\s+/, '').trim(),
            line: this.extractLineNumber(bullet),
          });
        }
      }
    }

    return findings;
  }

  /**
   * Extract line number from finding text
   */
  private extractLineNumber(text: string): number | undefined {
    const lineMatch = text.match(/(?:line|L)[\s:]*(\d+)/i);
    return lineMatch ? parseInt(lineMatch[1]) : undefined;
  }

  /**
   * Count findings by severity
   */
  private countBySeverity(
    findings: ReviewFinding[]
  ): Record<string, number> {
    return findings.reduce(
      (acc, finding) => {
        acc[finding.severity] = (acc[finding.severity] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }
}

interface ReviewFinding {
  severity: 'critical' | 'warning' | 'info';
  message: string;
  line?: number;
  file?: string;
}

export default CodeReviewModeHandler;

