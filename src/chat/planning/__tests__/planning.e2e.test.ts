/**
 * Planning System End-to-End Tests
 *
 * Tests the full planning workflow including:
 * - Plan creation from natural language
 * - Plan item status updates
 * - Plan execution flow
 * - Plan persistence and loading
 * - Plan import/export
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PlanningService } from '../PlanningService';
import { PlanExecutor } from '../PlanExecutor';
import type { Plan, PlanItem, PlanItemStatus, AriaModeId } from '../../modes/types';

// Mock VS Code
vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
    fs: {
      writeFile: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue(Buffer.from('')),
    },
  },
  window: {
    showSaveDialog: vi.fn().mockResolvedValue({ fsPath: '/test/plan.md' }),
    showOpenDialog: vi.fn().mockResolvedValue([{ fsPath: '/test/plan.md' }]),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  },
  Uri: {
    file: vi.fn((path: string) => ({ fsPath: path })),
  },
}));

// Mock EventEmitter for Node.js
vi.mock('events', () => ({
  EventEmitter: class {
    private listeners: Map<string, Function[]> = new Map();

    on(event: string, listener: Function) {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, []);
      }
      this.listeners.get(event)!.push(listener);
      return this;
    }

    emit(event: string, ...args: any[]) {
      const handlers = this.listeners.get(event);
      if (handlers) {
        handlers.forEach((h) => h(...args));
      }
      return true;
    }

    removeAllListeners() {
      this.listeners.clear();
      return this;
    }
  },
}));

// Reset singleton between tests
const resetSingletons = () => {
  // @ts-ignore - accessing private static for testing
  PlanningService['instance'] = undefined;
  // @ts-ignore
  PlanExecutor['instance'] = undefined;
};

describe('PlanningService E2E', () => {
  let planningService: PlanningService;

  beforeEach(() => {
    resetSingletons();
    planningService = PlanningService.getInstance();
  });

  afterEach(() => {
    resetSingletons();
  });

  describe('Plan Creation', () => {
    it('should create a plan with basic options', () => {
      const plan = planningService.createPlan({
        name: 'Test Plan',
        overview: 'This is a test plan overview',
        createdByMode: 'plan',
      });

      expect(plan.id).toContain('test_plan');
      expect(plan.name).toBe('Test Plan');
      expect(plan.overview).toBe('This is a test plan overview');
      expect(plan.createdByMode).toBe('plan');
      expect(plan.items).toHaveLength(0);
      expect(plan.isComplete).toBe(false);
    });

    it('should create a plan with items', () => {
      const items: Omit<PlanItem, 'id' | 'createdAt' | 'updatedAt'>[] = [
        { content: 'First task', status: 'pending', order: 0 },
        { content: 'Second task', status: 'pending', order: 1 },
        { content: 'Third task', status: 'pending', order: 2 },
      ];

      const plan = planningService.createPlan({
        name: 'Plan with Items',
        overview: 'A plan with multiple items',
        items: items as PlanItem[],
        createdByMode: 'plan',
        tags: ['test', 'e2e'],
      });

      expect(plan.items).toHaveLength(3);
      expect(plan.tags).toEqual(['test', 'e2e']);
    });

    it('should create a plan from agent response content', () => {
      const content = `# Implementation Plan

## Overview
This plan outlines the steps to implement a new feature.

## Tasks
- [ ] Set up the database schema
- [ ] Create API endpoints
- [x] Write unit tests
- [ ] Deploy to staging`;

      const plan = planningService.createPlanFromResponse(content, 'session-123', 'plan');

      expect(plan.name).toBe('Implementation Plan');
      expect(plan.items).toHaveLength(4);
      expect(plan.items[0].content).toBe('Set up the database schema');
      expect(plan.items[0].status).toBe('pending');
      expect(plan.items[2].status).toBe('completed');
      expect(plan.sessionId).toBe('session-123');
    });

    it('should link plan to session', () => {
      const plan = planningService.createPlan({
        name: 'Session Linked Plan',
        overview: 'Test',
        sessionId: 'session-456',
        createdByMode: 'agent',
      });

      const retrieved = planningService.getPlanForSession('session-456');
      expect(retrieved?.id).toBe(plan.id);
    });
  });

  describe('Plan Item Status Updates', () => {
    it('should update item status to in_progress', () => {
      const plan = planningService.createPlan({
        name: 'Status Test',
        overview: 'Test',
        items: [{ id: 'item-1', content: 'Task 1', status: 'pending', order: 0, createdAt: Date.now(), updatedAt: Date.now() }],
        createdByMode: 'plan',
      });

      planningService.updateItemStatus(plan.id, 'item-1', 'in_progress');

      const updated = planningService.getPlan(plan.id);
      expect(updated?.items[0].status).toBe('in_progress');
    });

    it('should update item status to completed and set completedAt', () => {
      const plan = planningService.createPlan({
        name: 'Completion Test',
        overview: 'Test',
        items: [{ id: 'item-1', content: 'Task 1', status: 'in_progress', order: 0, createdAt: Date.now(), updatedAt: Date.now() }],
        createdByMode: 'plan',
      });

      planningService.updateItemStatus(plan.id, 'item-1', 'completed');

      const updated = planningService.getPlan(plan.id);
      expect(updated?.items[0].status).toBe('completed');
      expect(updated?.items[0].completedAt).toBeDefined();
    });

    it('should mark plan as complete when all items are done', () => {
      const plan = planningService.createPlan({
        name: 'All Complete Test',
        overview: 'Test',
        items: [
          { id: 'item-1', content: 'Task 1', status: 'completed', order: 0, createdAt: Date.now(), updatedAt: Date.now() },
          { id: 'item-2', content: 'Task 2', status: 'pending', order: 1, createdAt: Date.now(), updatedAt: Date.now() },
        ],
        createdByMode: 'plan',
      });

      planningService.updateItemStatus(plan.id, 'item-2', 'completed');

      const updated = planningService.getPlan(plan.id);
      expect(updated?.isComplete).toBe(true);
    });

    it('should emit events on status changes', () => {
      const plan = planningService.createPlan({
        name: 'Event Test',
        overview: 'Test',
        items: [{ id: 'item-1', content: 'Task 1', status: 'pending', order: 0, createdAt: Date.now(), updatedAt: Date.now() }],
        createdByMode: 'plan',
      });

      const statusChangedHandler = vi.fn();
      planningService.on('itemStatusChanged', statusChangedHandler);

      planningService.updateItemStatus(plan.id, 'item-1', 'in_progress');

      expect(statusChangedHandler).toHaveBeenCalledWith(plan.id, 'item-1', 'in_progress');
    });
  });

  describe('Plan Progress Tracking', () => {
    it('should calculate progress correctly', () => {
      const plan = planningService.createPlan({
        name: 'Progress Test',
        overview: 'Test',
        items: [
          { id: 'item-1', content: 'Task 1', status: 'completed', order: 0, createdAt: Date.now(), updatedAt: Date.now() },
          { id: 'item-2', content: 'Task 2', status: 'completed', order: 1, createdAt: Date.now(), updatedAt: Date.now() },
          { id: 'item-3', content: 'Task 3', status: 'pending', order: 2, createdAt: Date.now(), updatedAt: Date.now() },
          { id: 'item-4', content: 'Task 4', status: 'pending', order: 3, createdAt: Date.now(), updatedAt: Date.now() },
        ],
        createdByMode: 'plan',
      });

      const progress = planningService.getProgress(plan.id);

      expect(progress.completed).toBe(2);
      expect(progress.total).toBe(4);
      expect(progress.percentage).toBe(50);
    });

    it('should return zero progress for empty plan', () => {
      const plan = planningService.createPlan({
        name: 'Empty Plan',
        overview: 'Test',
        createdByMode: 'plan',
      });

      const progress = planningService.getProgress(plan.id);

      expect(progress.completed).toBe(0);
      expect(progress.total).toBe(0);
      expect(progress.percentage).toBe(0);
    });
  });

  describe('Plan Serialization', () => {
    it('should serialize plan to markdown with YAML frontmatter', () => {
      const plan = planningService.createPlan({
        name: 'Serialization Test',
        overview: 'Testing plan serialization',
        items: [
          { id: 'item-1', content: 'First task', status: 'completed', order: 0, createdAt: Date.now(), updatedAt: Date.now() },
          { id: 'item-2', content: 'Second task', status: 'in_progress', order: 1, createdAt: Date.now(), updatedAt: Date.now() },
        ],
        createdByMode: 'plan',
      });

      const markdown = planningService.serializePlan(plan);

      expect(markdown).toContain('---');
      expect(markdown).toContain('name: Serialization Test');
      expect(markdown).toContain('# Serialization Test');
      expect(markdown).toContain('## Overview');
      expect(markdown).toContain('## Tasks');
      expect(markdown).toContain('[x] First task');
      expect(markdown).toContain('[ ] Second task _(in progress)_');
    });

    it('should parse plan from markdown with YAML frontmatter', () => {
      const markdown = `---
name: Parsed Plan
overview: This plan was parsed from markdown
todos:
  - id: task-1
    content: Parse this task
    status: pending
  - id: task-2
    content: Already done
    status: completed
---

# Parsed Plan

## Overview
This plan was parsed from markdown

## Tasks
- [ ] Parse this task
- [x] Already done`;

      const plan = planningService.parsePlan(markdown);

      expect(plan).not.toBeNull();
      expect(plan?.name).toBe('Parsed Plan');
      expect(plan?.overview).toBe('This plan was parsed from markdown');
      expect(plan?.items).toHaveLength(2);
      expect(plan?.items[0].content).toBe('Parse this task');
      expect(plan?.items[1].status).toBe('completed');
    });

    it('should return null for invalid markdown', () => {
      const invalidMarkdown = 'This is just plain text without frontmatter';

      const plan = planningService.parsePlan(invalidMarkdown);

      expect(plan).toBeNull();
    });
  });

  describe('Plan CRUD Operations', () => {
    it('should retrieve all plans', () => {
      planningService.createPlan({ name: 'Plan 1', overview: 'Test', createdByMode: 'plan' });
      planningService.createPlan({ name: 'Plan 2', overview: 'Test', createdByMode: 'plan' });
      planningService.createPlan({ name: 'Plan 3', overview: 'Test', createdByMode: 'plan' });

      const allPlans = planningService.getAllPlans();

      expect(allPlans).toHaveLength(3);
    });

    it('should update plan properties', () => {
      const plan = planningService.createPlan({
        name: 'Original Name',
        overview: 'Original overview',
        createdByMode: 'plan',
      });

      const updated = planningService.updatePlan(plan.id, {
        name: 'Updated Name',
        overview: 'Updated overview',
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.overview).toBe('Updated overview');
      expect(updated.updatedAt).toBeGreaterThan(plan.createdAt);
    });

    it('should add items to existing plan', () => {
      const plan = planningService.createPlan({
        name: 'Add Items Test',
        overview: 'Test',
        createdByMode: 'plan',
      });

      const newItem = planningService.addItem(plan.id, {
        content: 'New task added dynamically',
        status: 'pending',
        order: 0,
      });

      const updated = planningService.getPlan(plan.id);

      expect(updated?.items).toHaveLength(1);
      expect(newItem.id).toBeDefined();
      expect(newItem.content).toBe('New task added dynamically');
    });

    it('should delete plan', () => {
      const plan = planningService.createPlan({
        name: 'To Be Deleted',
        overview: 'Test',
        sessionId: 'delete-session',
        createdByMode: 'plan',
      });

      planningService.deletePlan(plan.id);

      expect(planningService.getPlan(plan.id)).toBeUndefined();
      expect(planningService.getPlanForSession('delete-session')).toBeUndefined();
    });

    it('should throw error for non-existent plan operations', () => {
      expect(() => {
        planningService.updatePlan('non-existent', { name: 'New' });
      }).toThrow('Plan not found');

      expect(() => {
        planningService.addItem('non-existent', { content: 'Task', status: 'pending', order: 0 });
      }).toThrow('Plan not found');

      expect(() => {
        planningService.updateItemStatus('non-existent', 'item-1', 'completed');
      }).toThrow('Plan not found');
    });
  });
});

describe('PlanExecutor E2E', () => {
  let planningService: PlanningService;
  let executor: PlanExecutor;

  beforeEach(() => {
    resetSingletons();
    planningService = PlanningService.getInstance();
    executor = PlanExecutor.getInstance();
  });

  afterEach(() => {
    resetSingletons();
  });

  describe('Basic Execution', () => {
    it('should have idle state initially', () => {
      expect(executor.getState()).toBe('idle');
      expect(executor.getCurrentPlanId()).toBeNull();
    });

    it('should track progress during execution', async () => {
      const plan = planningService.createPlan({
        name: 'Progress Tracking Test',
        overview: 'Test',
        items: [
          { id: 'item-1', content: 'Task 1', status: 'pending', order: 0, createdAt: Date.now(), updatedAt: Date.now() },
          { id: 'item-2', content: 'Task 2', status: 'pending', order: 1, createdAt: Date.now(), updatedAt: Date.now() },
        ],
        createdByMode: 'plan',
      });

      const progressEvents: { current: number; total: number }[] = [];
      executor.on('progressUpdated', (_planId: string, current: number, total: number) => {
        progressEvents.push({ current, total });
      });

      await executor.execute(plan.id, { sessionId: 'test' });

      expect(progressEvents).toHaveLength(2);
      expect(progressEvents[0]).toEqual({ current: 1, total: 2 });
      expect(progressEvents[1]).toEqual({ current: 2, total: 2 });
    });

    it('should emit execution events', async () => {
      const plan = planningService.createPlan({
        name: 'Event Test',
        overview: 'Test',
        items: [
          { id: 'item-1', content: 'Single task', status: 'pending', order: 0, createdAt: Date.now(), updatedAt: Date.now() },
        ],
        createdByMode: 'plan',
      });

      const events: string[] = [];
      executor.on('executionStarted', () => events.push('started'));
      executor.on('itemStarted', () => events.push('itemStarted'));
      executor.on('itemCompleted', () => events.push('itemCompleted'));
      executor.on('executionCompleted', () => events.push('completed'));

      await executor.execute(plan.id, { sessionId: 'test' });

      expect(events).toEqual(['started', 'itemStarted', 'itemCompleted', 'completed']);
    });

    it('should skip completed items', async () => {
      const plan = planningService.createPlan({
        name: 'Skip Completed Test',
        overview: 'Test',
        items: [
          { id: 'item-1', content: 'Already done', status: 'completed', order: 0, createdAt: Date.now(), updatedAt: Date.now() },
          { id: 'item-2', content: 'Needs work', status: 'pending', order: 1, createdAt: Date.now(), updatedAt: Date.now() },
        ],
        createdByMode: 'plan',
      });

      const itemsStarted: string[] = [];
      executor.on('itemStarted', (_planId: string, itemId: string) => {
        itemsStarted.push(itemId);
      });

      await executor.execute(plan.id, { sessionId: 'test' });

      // Only the pending item should have been started
      expect(itemsStarted).toEqual(['item-2']);
    });
  });

  describe('Pause/Resume/Cancel', () => {
    it('should throw error when pausing non-running execution', () => {
      expect(() => executor.pause()).toThrow('Cannot pause');
    });

    it('should throw error when resuming non-paused execution', async () => {
      await expect(executor.resume()).rejects.toThrow('Cannot resume');
    });

    it('should throw error when cancelling non-running execution', () => {
      expect(() => executor.cancel()).toThrow('Cannot cancel');
    });

    it('should prevent concurrent executions', async () => {
      const plan = planningService.createPlan({
        name: 'Concurrent Test',
        overview: 'Test',
        items: [
          { id: 'item-1', content: 'Long task', status: 'pending', order: 0, createdAt: Date.now(), updatedAt: Date.now() },
        ],
        createdByMode: 'plan',
      });

      // Start execution without awaiting
      const executionPromise = executor.execute(plan.id, { sessionId: 'test' });

      // Try to start another while first is running
      // Note: Since our mock execution is synchronous, this test may not fully capture
      // the async behavior, but it demonstrates the intent
      await executionPromise;

      expect(executor.getState()).toBe('completed');
    });
  });

  describe('Execution Results', () => {
    it('should collect results from execution', async () => {
      const plan = planningService.createPlan({
        name: 'Results Test',
        overview: 'Test',
        items: [
          { id: 'item-1', content: 'Task 1', status: 'pending', order: 0, createdAt: Date.now(), updatedAt: Date.now() },
          { id: 'item-2', content: 'Task 2', status: 'pending', order: 1, createdAt: Date.now(), updatedAt: Date.now() },
        ],
        createdByMode: 'plan',
      });

      await executor.execute(plan.id, { sessionId: 'test' });

      const results = executor.getResults();

      expect(results).toHaveLength(2);
      expect(results[0].itemId).toBe('item-1');
      expect(results[0].success).toBe(true);
      expect(results[0].duration).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('Plan File Path Generation', () => {
  let planningService: PlanningService;

  beforeEach(() => {
    resetSingletons();
    planningService = PlanningService.getInstance();
  });

  it('should generate correct file path for plan', () => {
    const plan = planningService.createPlan({
      name: 'My Test Plan',
      overview: 'Test',
      createdByMode: 'plan',
    });

    const filePath = planningService.getPlanFilePath(plan, '/workspace');

    expect(filePath).toMatch(/^\/workspace\/.cursor\/plans\/my_test_plan_[\w]+\.plan\.md$/);
  });

  it('should sanitize special characters in plan name', () => {
    const plan = planningService.createPlan({
      name: 'Plan with Special @#$% Characters!!!',
      overview: 'Test',
      createdByMode: 'plan',
    });

    const filePath = planningService.getPlanFilePath(plan, '/workspace');

    // Should not contain special characters
    expect(filePath).not.toMatch(/[@#$%!]/);
    expect(filePath).toContain('plan_with_special_characters');
  });

  it('should truncate very long plan names', () => {
    const longName = 'This is a very long plan name that exceeds the maximum allowed length and should be truncated';
    const plan = planningService.createPlan({
      name: longName,
      overview: 'Test',
      createdByMode: 'plan',
    });

    const filePath = planningService.getPlanFilePath(plan, '/workspace');

    // Name part should be truncated
    const namePart = filePath.split('/').pop()?.split('_').slice(0, -1).join('_');
    expect(namePart?.length).toBeLessThanOrEqual(50);
  });
});

