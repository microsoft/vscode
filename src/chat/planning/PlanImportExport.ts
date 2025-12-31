/**
 * PlanImportExport - Import and export plans in various formats
 *
 * Supports:
 * - Markdown with YAML frontmatter
 * - JSON format
 * - GitHub Issues format
 * - Cursor rules format
 * - Plain text task list
 */

import * as vscode from 'vscode';
import type { Plan, PlanItem, PlanItemStatus, AriaModeId } from '../modes/types';
import { PlanningService } from './PlanningService';

/**
 * Export format options
 */
export type ExportFormat = 'markdown' | 'json' | 'github' | 'plain' | 'cursor';

/**
 * Import format options (auto-detect if not specified)
 */
export type ImportFormat = 'markdown' | 'json' | 'plain' | 'auto';

/**
 * Export options
 */
export interface ExportOptions {
  format: ExportFormat;
  includeMetadata?: boolean;
  includeStatus?: boolean;
  includeComplexity?: boolean;
}

/**
 * Import result
 */
export interface ImportResult {
  success: boolean;
  plan?: Plan;
  error?: string;
  detectedFormat?: ImportFormat;
}

/**
 * PlanImportExport handles conversion between formats
 */
export class PlanImportExport {
  private static instance: PlanImportExport;
  private planningService: PlanningService;

  private constructor() {
    this.planningService = PlanningService.getInstance();
  }

  static getInstance(): PlanImportExport {
    if (!PlanImportExport.instance) {
      PlanImportExport.instance = new PlanImportExport();
    }
    return PlanImportExport.instance;
  }

  // ===========================================================================
  // Export Methods
  // ===========================================================================

  /**
   * Export a plan to the specified format
   */
  export(plan: Plan, options: ExportOptions): string {
    switch (options.format) {
      case 'markdown':
        return this.exportToMarkdown(plan, options);
      case 'json':
        return this.exportToJson(plan, options);
      case 'github':
        return this.exportToGitHubIssue(plan, options);
      case 'plain':
        return this.exportToPlainText(plan, options);
      case 'cursor':
        return this.exportToCursorRules(plan, options);
      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }
  }

  /**
   * Export to Markdown with YAML frontmatter
   */
  private exportToMarkdown(plan: Plan, options: ExportOptions): string {
    const lines: string[] = [];

    // YAML frontmatter
    lines.push('---');
    lines.push(`id: ${plan.id}`);
    lines.push(`name: "${plan.name.replace(/"/g, '\\"')}"`);
    lines.push(`status: ${plan.isComplete ? 'completed' : 'active'}`);
    lines.push(`createdAt: ${new Date(plan.createdAt).toISOString()}`);
    lines.push(`updatedAt: ${new Date(plan.updatedAt).toISOString()}`);
    if (plan.createdByMode) {
      lines.push(`createdByMode: ${plan.createdByMode}`);
    }
    if (plan.sessionId) {
      lines.push(`linkedSessionId: ${plan.sessionId}`);
    }
    if (plan.tags?.length) {
      lines.push(`tags: [${plan.tags.map((t) => `"${t}"`).join(', ')}]`);
    }
    lines.push('---');
    lines.push('');

    // Title
    lines.push(`# ${plan.name}`);
    lines.push('');

    // Overview
    if (plan.overview) {
      lines.push('## Overview');
      lines.push('');
      lines.push(plan.overview);
      lines.push('');
    }

    // Tasks
    lines.push('## Tasks');
    lines.push('');

    for (const item of plan.items) {
      const checkbox = item.status === 'completed' ? '[x]' : '[ ]';
      let line = `- ${checkbox} ${item.content}`;

      if (options.includeComplexity && item.complexity) {
        line += ` (complexity: ${item.complexity}/5)`;
      }

      if (options.includeStatus && item.status !== 'pending' && item.status !== 'completed') {
        line += ` [${item.status}]`;
      }

      lines.push(line);
    }

    lines.push('');
    return lines.join('\n');
  }

  /**
   * Export to JSON format
   */
  private exportToJson(plan: Plan, options: ExportOptions): string {
    const exportData: any = {
      $schema: 'https://logos.bravozero.ai/schemas/plan.json',
      version: '1.0',
      id: plan.id,
      name: plan.name,
      overview: plan.overview,
      items: plan.items.map((item) => ({
        id: item.id,
        content: item.content,
        status: item.status,
        ...(options.includeComplexity && item.complexity ? { complexity: item.complexity } : {}),
        ...(item.dependencies?.length ? { dependencies: item.dependencies } : {}),
      })),
    };

    if (options.includeMetadata) {
      exportData.metadata = {
        createdAt: new Date(plan.createdAt).toISOString(),
        updatedAt: new Date(plan.updatedAt).toISOString(),
        createdByMode: plan.createdByMode,
        sessionId: plan.sessionId,
        tags: plan.tags,
        isComplete: plan.isComplete,
      };
    }

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Export as GitHub Issue format
   */
  private exportToGitHubIssue(plan: Plan, options: ExportOptions): string {
    const lines: string[] = [];

    // Title would be used as issue title
    lines.push(`<!-- Title: ${plan.name} -->`);
    lines.push('');

    // Overview as issue body
    if (plan.overview) {
      lines.push(plan.overview);
      lines.push('');
    }

    // Tasks as GitHub checklist
    lines.push('## Tasks');
    lines.push('');

    for (const item of plan.items) {
      const checkbox = item.status === 'completed' ? '[x]' : '[ ]';
      lines.push(`- ${checkbox} ${item.content}`);
    }

    lines.push('');

    // Progress
    const completed = plan.items.filter((i) => i.status === 'completed').length;
    const total = plan.items.length;
    lines.push(`**Progress:** ${completed}/${total} (${Math.round((completed / total) * 100)}%)`);
    lines.push('');

    // Labels
    if (plan.tags?.length) {
      lines.push(`**Labels:** ${plan.tags.map((t) => `\`${t}\``).join(' ')}`);
    }

    return lines.join('\n');
  }

  /**
   * Export as plain text task list
   */
  private exportToPlainText(plan: Plan, options: ExportOptions): string {
    const lines: string[] = [];

    lines.push(plan.name.toUpperCase());
    lines.push('='.repeat(plan.name.length));
    lines.push('');

    if (plan.overview) {
      lines.push(plan.overview);
      lines.push('');
    }

    lines.push('Tasks:');
    lines.push('');

    for (let i = 0; i < plan.items.length; i++) {
      const item = plan.items[i];
      const status =
        item.status === 'completed'
          ? '✓'
          : item.status === 'in_progress'
            ? '→'
            : '○';
      lines.push(`${i + 1}. ${status} ${item.content}`);
    }

    return lines.join('\n');
  }

  /**
   * Export as Cursor rules format
   */
  private exportToCursorRules(plan: Plan, options: ExportOptions): string {
    const lines: string[] = [];

    lines.push(`# ${plan.name}`);
    lines.push('');
    lines.push(`## Plan Overview`);
    lines.push('');
    lines.push(plan.overview || 'No overview provided.');
    lines.push('');
    lines.push('## Implementation Steps');
    lines.push('');

    for (let i = 0; i < plan.items.length; i++) {
      const item = plan.items[i];
      lines.push(`### Step ${i + 1}: ${item.content}`);
      lines.push('');

      if (item.status !== 'pending') {
        lines.push(`**Status:** ${item.status}`);
        lines.push('');
      }

      if (item.complexity) {
        lines.push(`**Complexity:** ${item.complexity}/5`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  // ===========================================================================
  // Import Methods
  // ===========================================================================

  /**
   * Import a plan from content
   */
  import(
    content: string,
    format: ImportFormat = 'auto',
    sessionId?: string,
    mode: AriaModeId = 'plan'
  ): ImportResult {
    let detectedFormat = format;

    // Auto-detect format
    if (format === 'auto') {
      detectedFormat = this.detectFormat(content);
    }

    try {
      let plan: Plan;

      switch (detectedFormat) {
        case 'markdown':
          plan = this.importFromMarkdown(content, sessionId, mode);
          break;
        case 'json':
          plan = this.importFromJson(content, sessionId, mode);
          break;
        case 'plain':
          plan = this.importFromPlainText(content, sessionId, mode);
          break;
        default:
          return {
            success: false,
            error: `Unsupported import format: ${detectedFormat}`,
            detectedFormat,
          };
      }

      return {
        success: true,
        plan,
        detectedFormat,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        detectedFormat,
      };
    }
  }

  /**
   * Detect the format of content
   */
  private detectFormat(content: string): ImportFormat {
    const trimmed = content.trim();

    // Check for YAML frontmatter
    if (trimmed.startsWith('---')) {
      return 'markdown';
    }

    // Check for JSON
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        JSON.parse(trimmed);
        return 'json';
      } catch {
        // Not valid JSON
      }
    }

    // Check for markdown headers
    if (trimmed.includes('# ') || trimmed.includes('## ')) {
      return 'markdown';
    }

    // Default to plain text
    return 'plain';
  }

  /**
   * Import from Markdown with YAML frontmatter
   */
  private importFromMarkdown(
    content: string,
    sessionId?: string,
    mode: AriaModeId = 'plan'
  ): Plan {
    let name = 'Imported Plan';
    let overview = '';
    const items: PlanItem[] = [];

    // Parse YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      const nameMatch = frontmatter.match(/name:\s*["']?([^"'\n]+)["']?/);
      if (nameMatch) {
        name = nameMatch[1];
      }
    }

    // Remove frontmatter for content parsing
    const mainContent = content.replace(/^---\n[\s\S]*?\n---\n?/, '');

    // Extract title from first h1
    const titleMatch = mainContent.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      name = titleMatch[1];
    }

    // Extract overview from Overview section
    const overviewMatch = mainContent.match(/## Overview\n\n([\s\S]*?)(?=\n##|$)/);
    if (overviewMatch) {
      overview = overviewMatch[1].trim();
    }

    // Extract items from task list
    const taskMatches = mainContent.matchAll(/^-\s*\[([ xX])\]\s*(.+)$/gm);
    for (const match of taskMatches) {
      const isCompleted = match[1].toLowerCase() === 'x';
      const content = match[2].trim();

      // Check for status annotation
      let status: PlanItemStatus = isCompleted ? 'completed' : 'pending';
      const statusMatch = content.match(/\[(in_progress|blocked|cancelled|failed)\]$/i);
      if (statusMatch) {
        status = statusMatch[1].toLowerCase() as PlanItemStatus;
      }

      // Check for complexity
      let complexity: number | undefined;
      const complexityMatch = content.match(/\(complexity:\s*(\d)\/5\)/);
      if (complexityMatch) {
        complexity = parseInt(complexityMatch[1], 10);
      }

      // Clean content
      const cleanContent = content
        .replace(/\[(in_progress|blocked|cancelled|failed)\]$/i, '')
        .replace(/\(complexity:\s*\d\/5\)/, '')
        .trim();

      items.push({
        id: crypto.randomUUID(),
        content: cleanContent,
        status,
        complexity,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    return this.planningService.createPlan({
      name,
      overview,
      items,
      sessionId,
      createdByMode: mode,
    });
  }

  /**
   * Import from JSON format
   */
  private importFromJson(
    content: string,
    sessionId?: string,
    mode: AriaModeId = 'plan'
  ): Plan {
    const data = JSON.parse(content);

    const items: PlanItem[] = (data.items || []).map((item: any) => ({
      id: item.id || crypto.randomUUID(),
      content: item.content,
      status: item.status || 'pending',
      complexity: item.complexity,
      dependencies: item.dependencies,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    return this.planningService.createPlan({
      name: data.name || 'Imported Plan',
      overview: data.overview || '',
      items,
      sessionId,
      createdByMode: mode,
      tags: data.metadata?.tags || data.tags,
    });
  }

  /**
   * Import from plain text
   */
  private importFromPlainText(
    content: string,
    sessionId?: string,
    mode: AriaModeId = 'plan'
  ): Plan {
    const lines = content.split('\n').filter((l) => l.trim());
    const items: PlanItem[] = [];

    // First non-empty line is the title
    let name = 'Imported Plan';
    let startIndex = 0;

    if (lines.length > 0) {
      name = lines[0].replace(/[=_-]+/g, '').trim();
      startIndex = 1;

      // Skip separator line
      if (lines[1]?.match(/^[=_-]+$/)) {
        startIndex = 2;
      }
    }

    // Look for task patterns
    const taskPatterns = [
      /^(?:\d+\.|-)?\s*[○✓→✗⊘]\s*(.+)$/,
      /^(?:\d+\.|-)?\s*\[([ xX])\]\s*(.+)$/,
      /^(?:\d+\.|-)?\s+(.+)$/,
    ];

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip section headers
      if (line.endsWith(':') || line.match(/^(tasks?|items?|steps?|overview)$/i)) {
        continue;
      }

      for (const pattern of taskPatterns) {
        const match = line.match(pattern);
        if (match) {
          const content = match[2] || match[1];
          const isCompleted = line.includes('✓') || match[1]?.toLowerCase() === 'x';

          items.push({
            id: crypto.randomUUID(),
            content: content.trim(),
            status: isCompleted ? 'completed' : 'pending',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          break;
        }
      }
    }

    return this.planningService.createPlan({
      name,
      overview: '',
      items,
      sessionId,
      createdByMode: mode,
    });
  }

  // ===========================================================================
  // File Operations
  // ===========================================================================

  /**
   * Export plan to file
   */
  async exportToFile(plan: Plan, options: ExportOptions): Promise<vscode.Uri | undefined> {
    const content = this.export(plan, options);

    // Determine file extension
    const extensions: Record<ExportFormat, string> = {
      markdown: 'md',
      json: 'json',
      github: 'md',
      plain: 'txt',
      cursor: 'md',
    };

    const defaultUri = vscode.Uri.file(
      `${vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || ''}/${plan.name.replace(/[^a-z0-9]/gi, '_')}.${extensions[options.format]}`
    );

    const uri = await vscode.window.showSaveDialog({
      defaultUri,
      filters: {
        'Plan files': [extensions[options.format]],
        'All files': ['*'],
      },
    });

    if (uri) {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
      return uri;
    }

    return undefined;
  }

  /**
   * Import plan from file
   */
  async importFromFile(sessionId?: string, mode: AriaModeId = 'plan'): Promise<ImportResult> {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        'Plan files': ['md', 'json', 'txt'],
        'All files': ['*'],
      },
    });

    if (!uris || uris.length === 0) {
      return { success: false, error: 'No file selected' };
    }

    const content = await vscode.workspace.fs.readFile(uris[0]);
    const textContent = Buffer.from(content).toString('utf8');

    return this.import(textContent, 'auto', sessionId, mode);
  }
}

export const planImportExport = PlanImportExport.getInstance();
export default PlanImportExport;

