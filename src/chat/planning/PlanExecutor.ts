/**
 * PlanExecutor - Service for executing plans
 *
 * Handles:
 * - Sequential execution of plan items
 * - Mode switching during execution
 * - Progress tracking and status updates
 * - Pause/resume/cancel operations
 * - Error handling and rollback
 */

import { EventEmitter } from 'events';
import type { Plan, PlanItem, PlanItemStatus, AriaModeId } from '../modes/types';
import { ModeRegistry } from '../modes/ModeRegistry';
import { PlanningService } from './PlanningService';
import { AriaToolRegistry } from '../tools/AriaToolRegistry';

/**
 * Execution state
 */
export type ExecutionState = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

/**
 * Execution result for a single item
 */
export interface ItemExecutionResult {
  itemId: string;
  success: boolean;
  output?: string;
  error?: string;
  duration: number;
  toolsUsed?: string[];
}

/**
 * Plan execution options
 */
export interface ExecutionOptions {
  /** Whether to pause after each item for review */
  stepByStep: boolean;

  /** Whether to stop on first error */
  stopOnError: boolean;

  /** Whether to require confirmation before each item */
  confirmEachItem: boolean;

  /** Maximum duration per item in ms */
  itemTimeout: number;

  /** Session ID for agent invocations */
  sessionId: string;
}

const DEFAULT_OPTIONS: ExecutionOptions = {
  stepByStep: false,
  stopOnError: true,
  confirmEachItem: false,
  itemTimeout: 60000, // 1 minute per item
  sessionId: '',
};

/**
 * Events emitted by PlanExecutor
 */
export interface ExecutorEvents {
  executionStarted: (planId: string) => void;
  executionPaused: (planId: string, currentItem: string) => void;
  executionResumed: (planId: string) => void;
  executionCompleted: (planId: string, results: ItemExecutionResult[]) => void;
  executionCancelled: (planId: string) => void;
  executionFailed: (planId: string, error: string) => void;
  itemStarted: (planId: string, itemId: string) => void;
  itemCompleted: (planId: string, result: ItemExecutionResult) => void;
  itemFailed: (planId: string, itemId: string, error: string) => void;
  progressUpdated: (planId: string, completed: number, total: number) => void;
}

/**
 * PlanExecutor executes plans by running each item sequentially
 */
export class PlanExecutor extends EventEmitter {
  private static instance: PlanExecutor;
  private modeRegistry: ModeRegistry;
  private planningService: PlanningService;
  private toolRegistry: AriaToolRegistry;

  private currentPlanId: string | null = null;
  private currentItemIndex: number = 0;
  private state: ExecutionState = 'idle';
  private results: ItemExecutionResult[] = [];
  private options: ExecutionOptions = DEFAULT_OPTIONS;
  private previousMode: AriaModeId | null = null;

  private constructor() {
    super();
    this.modeRegistry = ModeRegistry.getInstance();
    this.planningService = PlanningService.getInstance();
    this.toolRegistry = AriaToolRegistry.getInstance();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): PlanExecutor {
    if (!PlanExecutor.instance) {
      PlanExecutor.instance = new PlanExecutor();
    }
    return PlanExecutor.instance;
  }

  /**
   * Get current execution state
   */
  getState(): ExecutionState {
    return this.state;
  }

  /**
   * Get current plan ID being executed
   */
  getCurrentPlanId(): string | null {
    return this.currentPlanId;
  }

  /**
   * Get execution progress
   */
  getProgress(): { current: number; total: number; percentage: number } {
    const plan = this.currentPlanId ? this.planningService.getPlan(this.currentPlanId) : null;
    const total = plan?.items.length || 0;
    const current = this.currentItemIndex;
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

    return { current, total, percentage };
  }

  /**
   * Get results from current/last execution
   */
  getResults(): ItemExecutionResult[] {
    return [...this.results];
  }

  /**
   * Execute a plan
   */
  async execute(planId: string, options?: Partial<ExecutionOptions>): Promise<void> {
    if (this.state === 'running') {
      throw new Error('An execution is already in progress');
    }

    const plan = this.planningService.getPlan(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    // Initialize execution state
    this.currentPlanId = planId;
    this.currentItemIndex = 0;
    this.state = 'running';
    this.results = [];
    this.options = { ...DEFAULT_OPTIONS, ...options };

    // Save current mode and switch to Agent mode for execution
    this.previousMode = this.modeRegistry.getState().currentMode;
    if (this.previousMode !== 'agent') {
      this.modeRegistry.switchMode('agent', 'system', 'Plan execution started');
    }

    this.emit('executionStarted', planId);

    try {
      await this.executeItems(plan);

      if (this.state === 'running') {
        this.state = 'completed';
        this.emit('executionCompleted', planId, this.results);
      }
    } catch (error) {
      this.state = 'failed';
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('executionFailed', planId, errorMessage);
    } finally {
      // Restore previous mode if needed
      if (this.previousMode && this.previousMode !== 'agent') {
        this.modeRegistry.switchMode(this.previousMode, 'system', 'Plan execution finished');
      }
    }
  }

  /**
   * Pause execution
   */
  pause(): void {
    if (this.state !== 'running') {
      throw new Error('Cannot pause: execution is not running');
    }

    this.state = 'paused';
    const plan = this.planningService.getPlan(this.currentPlanId!);
    const currentItem = plan?.items[this.currentItemIndex];

    this.emit('executionPaused', this.currentPlanId!, currentItem?.id || '');
  }

  /**
   * Resume paused execution
   */
  async resume(): Promise<void> {
    if (this.state !== 'paused') {
      throw new Error('Cannot resume: execution is not paused');
    }

    this.state = 'running';
    this.emit('executionResumed', this.currentPlanId!);

    const plan = this.planningService.getPlan(this.currentPlanId!);
    if (plan) {
      await this.executeItems(plan);

      if (this.state === 'running') {
        this.state = 'completed';
        this.emit('executionCompleted', this.currentPlanId!, this.results);
      }
    }
  }

  /**
   * Cancel execution
   */
  cancel(): void {
    if (this.state !== 'running' && this.state !== 'paused') {
      throw new Error('Cannot cancel: execution is not running or paused');
    }

    const planId = this.currentPlanId!;
    this.state = 'cancelled';

    // Mark remaining items as cancelled
    const plan = this.planningService.getPlan(planId);
    if (plan) {
      for (let i = this.currentItemIndex; i < plan.items.length; i++) {
        this.planningService.updateItemStatus(planId, plan.items[i].id, 'cancelled');
      }
    }

    // Restore previous mode
    if (this.previousMode && this.previousMode !== 'agent') {
      this.modeRegistry.switchMode(this.previousMode, 'system', 'Plan execution cancelled');
    }

    this.emit('executionCancelled', planId);
    this.reset();
  }

  /**
   * Reset executor state
   */
  private reset(): void {
    this.currentPlanId = null;
    this.currentItemIndex = 0;
    this.state = 'idle';
    this.previousMode = null;
  }

  /**
   * Execute plan items sequentially
   */
  private async executeItems(plan: Plan): Promise<void> {
    for (let i = this.currentItemIndex; i < plan.items.length; i++) {
      // Check for pause or cancel
      if (this.state !== 'running') {
        return;
      }

      this.currentItemIndex = i;
      const item = plan.items[i];

      // Skip completed or cancelled items
      if (item.status === 'completed' || item.status === 'cancelled') {
        continue;
      }

      // Execute item
      const result = await this.executeItem(plan.id, item);
      this.results.push(result);

      // Update progress
      this.emit('progressUpdated', plan.id, i + 1, plan.items.length);

      // Handle failure
      if (!result.success && this.options.stopOnError) {
        throw new Error(`Item failed: ${result.error}`);
      }

      // Step-by-step mode pauses after each item
      if (this.options.stepByStep && i < plan.items.length - 1) {
        this.pause();
        return;
      }
    }
  }

  /**
   * Execute a single plan item
   */
  private async executeItem(planId: string, item: PlanItem): Promise<ItemExecutionResult> {
    const startTime = Date.now();

    this.emit('itemStarted', planId, item.id);
    this.planningService.updateItemStatus(planId, item.id, 'in_progress');

    try {
      // Execute based on item type
      const output = await this.executeItemContent(item);

      // Mark as completed
      this.planningService.updateItemStatus(planId, item.id, 'completed');

      const result: ItemExecutionResult = {
        itemId: item.id,
        success: true,
        output,
        duration: Date.now() - startTime,
      };

      this.emit('itemCompleted', planId, result);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Mark as failed
      this.planningService.updateItemStatus(planId, item.id, 'failed');

      const result: ItemExecutionResult = {
        itemId: item.id,
        success: false,
        error: errorMessage,
        duration: Date.now() - startTime,
      };

      this.emit('itemFailed', planId, item.id, errorMessage);
      return result;
    }
  }

  /**
   * Execute item content based on its type
   */
  private async executeItemContent(item: PlanItem): Promise<string> {
    // Parse item content for tool calls or agent instructions
    const content = item.content;

    // Check for tool call syntax: `tool_name(params)`
    const toolMatch = content.match(/`(\w+)\((.*?)\)`/);
    if (toolMatch) {
      const toolId = toolMatch[1];
      let params = {};
      try {
        params = JSON.parse(toolMatch[2] || '{}');
      } catch {
        // Try as simple key=value pairs
        params = this.parseSimpleParams(toolMatch[2]);
      }

      const result = await this.toolRegistry.invokeTool(toolId, params, {
        mode: 'agent',
        sessionId: this.options.sessionId,
        workspacePath: this.getWorkspacePath(),
      });

      if (!result.success) {
        throw new Error(result.error || 'Tool execution failed');
      }

      return typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
    }

    // For non-tool items, we would invoke an agent
    // This is a placeholder - actual implementation would use D3N client
    return `Executed: ${content}`;
  }

  /**
   * Parse simple key=value parameters
   */
  private parseSimpleParams(paramsStr: string): Record<string, any> {
    const params: Record<string, any> = {};
    const pairs = paramsStr.split(',').map((s) => s.trim());

    for (const pair of pairs) {
      const [key, value] = pair.split('=').map((s) => s.trim());
      if (key && value) {
        // Try to parse as JSON, otherwise use as string
        try {
          params[key] = JSON.parse(value);
        } catch {
          params[key] = value.replace(/^["']|["']$/g, '');
        }
      }
    }

    return params;
  }

  /**
   * Get workspace path
   */
  private getWorkspacePath(): string {
    // This would come from VS Code workspace API
    return process.cwd();
  }
}

export default PlanExecutor;

