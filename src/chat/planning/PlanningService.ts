/**
 * PlanningService - Service for plan creation, persistence, and management
 *
 * Handles:
 * - Plan creation from agent responses
 * - File-based persistence (markdown with YAML frontmatter)
 * - Session linking for plan-to-chat association
 * - Plan execution tracking
 * Integrates with AriaTelemetry for usage tracking.
 */

import { EventEmitter } from 'events';
import type {
  Plan,
  PlanItem,
  PlanItemStatus,
  PlanFileFormat,
  AriaModeId,
} from '../modes/types';
import { ariaTelemetry } from '../telemetry';

/**
 * Plan storage location options
 */
export interface PlanStorageConfig {
  /** Directory for plan files relative to workspace */
  planDirectory: string;

  /** File extension for plan files */
  fileExtension: string;

  /** Whether to auto-save plans */
  autoSave: boolean;

  /** Auto-save debounce interval in ms */
  autoSaveInterval: number;
}

const DEFAULT_STORAGE_CONFIG: PlanStorageConfig = {
  planDirectory: '.cursor/plans',
  fileExtension: '.plan.md',
  autoSave: true,
  autoSaveInterval: 1000,
};

/**
 * Events emitted by the PlanningService
 */
export interface PlanningEvents {
  planCreated: (plan: Plan) => void;
  planUpdated: (plan: Plan) => void;
  planDeleted: (planId: string) => void;
  itemStatusChanged: (planId: string, itemId: string, status: PlanItemStatus) => void;
  planCompleted: (plan: Plan) => void;
}

/**
 * PlanningService manages plan lifecycle
 */
export class PlanningService extends EventEmitter {
  private static instance: PlanningService;
  private plans: Map<string, Plan> = new Map();
  private sessionPlanMap: Map<string, string> = new Map(); // sessionId -> planId
  private config: PlanStorageConfig;
  private autoSaveTimers: Map<string, NodeJS.Timeout> = new Map();

  private constructor(config?: Partial<PlanStorageConfig>) {
    super();
    this.config = { ...DEFAULT_STORAGE_CONFIG, ...config };
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<PlanStorageConfig>): PlanningService {
    if (!PlanningService.instance) {
      PlanningService.instance = new PlanningService(config);
    }
    return PlanningService.instance;
  }

  /**
   * Create a new plan
   */
  createPlan(options: {
    name: string;
    overview: string;
    items?: PlanItem[];
    sessionId?: string;
    createdByMode: AriaModeId;
    tags?: string[];
  }): Plan {
    const plan: Plan = {
      id: this.generatePlanId(options.name),
      name: options.name,
      overview: options.overview,
      items: options.items || [],
      sessionId: options.sessionId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isComplete: false,
      createdByMode: options.createdByMode,
      tags: options.tags,
    };

    this.plans.set(plan.id, plan);

    // Link to session if provided
    if (options.sessionId) {
      this.sessionPlanMap.set(options.sessionId, plan.id);
    }

    // Track plan creation in telemetry
    try {
      ariaTelemetry.trackPlanEvent(
        plan.id,
        'created',
        options.createdByMode,
        plan.items.length
      );
    } catch (error) {
      console.warn('[PlanningService] Telemetry tracking failed:', error);
    }

    this.emit('planCreated', plan);
    this.scheduleSave(plan.id);

    return plan;
  }

  /**
   * Create plan from agent response content
   */
  createPlanFromResponse(
    content: string,
    sessionId?: string,
    createdByMode: AriaModeId = 'plan'
  ): Plan {
    const name = this.extractPlanName(content);
    const overview = this.extractOverview(content);
    const items = this.extractItems(content);

    return this.createPlan({
      name,
      overview,
      items,
      sessionId,
      createdByMode,
    });
  }

  /**
   * Get a plan by ID
   */
  getPlan(planId: string): Plan | undefined {
    return this.plans.get(planId);
  }

  /**
   * Get plan for a session
   */
  getPlanForSession(sessionId: string): Plan | undefined {
    const planId = this.sessionPlanMap.get(sessionId);
    return planId ? this.plans.get(planId) : undefined;
  }

  /**
   * Get all plans
   */
  getAllPlans(): Plan[] {
    return Array.from(this.plans.values());
  }

  /**
   * Update a plan
   */
  updatePlan(planId: string, updates: Partial<Omit<Plan, 'id' | 'createdAt'>>): Plan {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    const updatedPlan: Plan = {
      ...plan,
      ...updates,
      updatedAt: Date.now(),
    };

    this.plans.set(planId, updatedPlan);
    this.emit('planUpdated', updatedPlan);
    this.scheduleSave(planId);

    return updatedPlan;
  }

  /**
   * Add an item to a plan
   */
  addItem(planId: string, item: Omit<PlanItem, 'id' | 'createdAt' | 'updatedAt'>): PlanItem {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    const newItem: PlanItem = {
      ...item,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    plan.items.push(newItem);
    plan.updatedAt = Date.now();

    this.emit('planUpdated', plan);
    this.scheduleSave(planId);

    return newItem;
  }

  /**
   * Update an item's status
   */
  updateItemStatus(planId: string, itemId: string, status: PlanItemStatus): void {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    const item = plan.items.find((i) => i.id === itemId);
    if (!item) {
      throw new Error(`Item not found: ${itemId}`);
    }

    const previousStatus = item.status;
    item.status = status;
    item.updatedAt = Date.now();

    if (status === 'completed') {
      item.completedAt = Date.now();
    }

    plan.updatedAt = Date.now();

    // Track item status change in telemetry
    try {
      ariaTelemetry.trackPlanItemChange(planId, itemId, previousStatus, status);
    } catch (error) {
      console.warn('[PlanningService] Telemetry tracking failed:', error);
    }

    // Check if plan is complete
    const allComplete = plan.items.every(
      (i) => i.status === 'completed' || i.status === 'cancelled'
    );
    if (allComplete && !plan.isComplete) {
      plan.isComplete = true;

      // Track plan completion in telemetry
      try {
        const completedCount = plan.items.filter((i) => i.status === 'completed').length;
        ariaTelemetry.trackPlanEvent(
          planId,
          'completed',
          plan.createdByMode,
          plan.items.length,
          {
            completedItemCount: completedCount,
            durationMs: Date.now() - plan.createdAt,
          }
        );
      } catch (error) {
        console.warn('[PlanningService] Telemetry tracking failed:', error);
      }

      this.emit('planCompleted', plan);
    }

    this.emit('itemStatusChanged', planId, itemId, status);
    this.emit('planUpdated', plan);
    this.scheduleSave(planId);
  }

  /**
   * Delete a plan
   */
  deletePlan(planId: string): void {
    const plan = this.plans.get(planId);
    if (plan) {
      // Track plan deletion in telemetry
      try {
        const completedCount = plan.items.filter((i) => i.status === 'completed').length;
        ariaTelemetry.trackPlanEvent(
          planId,
          'deleted',
          plan.createdByMode,
          plan.items.length,
          {
            completedItemCount: completedCount,
            durationMs: Date.now() - plan.createdAt,
          }
        );
      } catch (error) {
        console.warn('[PlanningService] Telemetry tracking failed:', error);
      }

      this.plans.delete(planId);

      // Remove session mapping
      if (plan.sessionId) {
        this.sessionPlanMap.delete(plan.sessionId);
      }

      // Clear auto-save timer
      const timer = this.autoSaveTimers.get(planId);
      if (timer) {
        clearTimeout(timer);
        this.autoSaveTimers.delete(planId);
      }

      this.emit('planDeleted', planId);
    }
  }

  /**
   * Link a plan to a session
   */
  linkToSession(planId: string, sessionId: string): void {
    const plan = this.plans.get(planId);
    if (plan) {
      plan.sessionId = sessionId;
      this.sessionPlanMap.set(sessionId, planId);
      this.scheduleSave(planId);
    }
  }

  /**
   * Serialize a plan to markdown with YAML frontmatter
   */
  serializePlan(plan: Plan): string {
    const lines: string[] = [];

    // YAML frontmatter
    lines.push('---');
    lines.push(`name: ${plan.name}`);
    lines.push(`overview: ${plan.overview.replace(/\n/g, ' ').slice(0, 200)}`);
    lines.push('todos:');
    for (const item of plan.items) {
      lines.push(`  - id: ${item.id}`);
      lines.push(`    content: ${item.content.replace(/\n/g, ' ')}`);
      lines.push(`    status: ${item.status}`);
    }
    lines.push('---');
    lines.push('');

    // Markdown body
    lines.push(`# ${plan.name}`);
    lines.push('');
    lines.push('## Overview');
    lines.push('');
    lines.push(plan.overview);
    lines.push('');
    lines.push('## Tasks');
    lines.push('');

    for (const item of plan.items) {
      const checkbox = item.status === 'completed' ? '[x]' : '[ ]';
      const statusBadge =
        item.status === 'in_progress' ? ' _(in progress)_' : '';
      lines.push(`- ${checkbox} ${item.content}${statusBadge}`);
    }

    return lines.join('\n');
  }

  /**
   * Parse a plan from markdown with YAML frontmatter
   */
  parsePlan(content: string): Plan | null {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      return null;
    }

    try {
      const frontmatter = this.parseYamlFrontmatter(frontmatterMatch[1]);
      const items: PlanItem[] = (frontmatter.todos || []).map(
        (todo: any, index: number) => ({
          id: todo.id || crypto.randomUUID(),
          content: todo.content,
          status: todo.status || 'pending',
          order: index,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      );

      return {
        id: this.generatePlanId(frontmatter.name),
        name: frontmatter.name,
        overview: frontmatter.overview,
        items,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isComplete: items.every((i) => i.status === 'completed'),
        createdByMode: 'plan',
      };
    } catch (error) {
      console.error('Failed to parse plan:', error);
      return null;
    }
  }

  /**
   * Get file path for a plan
   */
  getPlanFilePath(plan: Plan, workspacePath: string): string {
    const sanitizedName = plan.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 50);
    const shortId = plan.id.slice(0, 8);
    return `${workspacePath}/${this.config.planDirectory}/${sanitizedName}_${shortId}${this.config.fileExtension}`;
  }

  /**
   * Calculate plan progress
   */
  getProgress(planId: string): { completed: number; total: number; percentage: number } {
    const plan = this.plans.get(planId);
    if (!plan || plan.items.length === 0) {
      return { completed: 0, total: 0, percentage: 0 };
    }

    const completed = plan.items.filter((i) => i.status === 'completed').length;
    const total = plan.items.length;
    const percentage = Math.round((completed / total) * 100);

    return { completed, total, percentage };
  }

  // Private helper methods

  private generatePlanId(name: string): string {
    const sanitized = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 30);
    const randomSuffix = Math.random().toString(36).slice(2, 10);
    return `${sanitized}_${randomSuffix}`;
  }

  private extractPlanName(content: string): string {
    // Try to find a title
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      return titleMatch[1].trim();
    }

    // Use first line as fallback
    const firstLine = content.split('\n')[0];
    return firstLine.slice(0, 60) || 'Untitled Plan';
  }

  private extractOverview(content: string): string {
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

  private extractItems(content: string): PlanItem[] {
    const items: PlanItem[] = [];
    const todoPattern = /^[-*]\s*\[([ x])\]\s*(.+)$/gm;
    let match;
    let order = 0;

    while ((match = todoPattern.exec(content)) !== null) {
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

  private parseYamlFrontmatter(yaml: string): PlanFileFormat {
    // Simple YAML parser for our specific format
    const result: any = { todos: [] };
    const lines = yaml.split('\n');
    let currentTodo: any = null;

    for (const line of lines) {
      if (line.startsWith('name:')) {
        result.name = line.slice(5).trim();
      } else if (line.startsWith('overview:')) {
        result.overview = line.slice(9).trim();
      } else if (line.match(/^\s+-\s+id:/)) {
        if (currentTodo) {
          result.todos.push(currentTodo);
        }
        currentTodo = { id: line.match(/id:\s*(.+)/)?.[1] };
      } else if (line.match(/^\s+content:/) && currentTodo) {
        currentTodo.content = line.match(/content:\s*(.+)/)?.[1];
      } else if (line.match(/^\s+status:/) && currentTodo) {
        currentTodo.status = line.match(/status:\s*(.+)/)?.[1];
      }
    }

    if (currentTodo) {
      result.todos.push(currentTodo);
    }

    return result as PlanFileFormat;
  }

  private scheduleSave(planId: string): void {
    if (!this.config.autoSave) return;

    // Clear existing timer
    const existingTimer = this.autoSaveTimers.get(planId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule new save
    const timer = setTimeout(() => {
      this.savePlan(planId);
      this.autoSaveTimers.delete(planId);
    }, this.config.autoSaveInterval);

    this.autoSaveTimers.set(planId, timer);
  }

  private async savePlan(planId: string): Promise<void> {
    const plan = this.plans.get(planId);
    if (!plan || !plan.filePath) return;

    // This would be implemented with actual file system access
    console.log(`[PlanningService] Would save plan to: ${plan.filePath}`);
  }
}

export default PlanningService;


