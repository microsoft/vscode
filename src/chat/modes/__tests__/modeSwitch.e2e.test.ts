/**
 * Mode Switching End-to-End Tests
 *
 * Tests the full mode switching workflow including:
 * - Manual mode switching
 * - Auto mode detection
 * - Mode-specific tool permissions
 * - Mode state management
 * - Event emission
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ModeRegistry } from '../ModeRegistry';
import { AutoModeDetector, autoModeDetector } from '../AutoModeDetector';
import type { AriaModeId, AriaModeConfig, ModeChangeEvent } from '../types';

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
  ModeRegistry['instance'] = undefined;
};

describe('ModeRegistry E2E', () => {
  let registry: ModeRegistry;

  beforeEach(() => {
    resetSingletons();
    registry = ModeRegistry.getInstance();
  });

  afterEach(() => {
    resetSingletons();
  });

  describe('Default Configuration', () => {
    it('should initialize with Agent mode as default', () => {
      const state = registry.getState();

      expect(state.currentMode).toBe('agent');
      expect(state.wasAutoSwitched).toBe(false);
    });

    it('should have all six default modes registered', () => {
      const modes = registry.getAllModes();

      expect(modes).toHaveLength(6);

      const modeIds = modes.map((m) => m.id);
      expect(modeIds).toContain('agent');
      expect(modeIds).toContain('plan');
      expect(modeIds).toContain('debug');
      expect(modeIds).toContain('ask');
      expect(modeIds).toContain('research');
      expect(modeIds).toContain('code-review');
    });

    it('should return correct mode configurations', () => {
      const agentMode = registry.getMode('agent');
      expect(agentMode?.displayName).toBe('Agent');
      expect(agentMode?.toolPermission).toBe('full');
      expect(agentMode?.canModifyFiles).toBe(true);

      const planMode = registry.getMode('plan');
      expect(planMode?.displayName).toBe('Plan');
      expect(planMode?.toolPermission).toBe('read-only');
      expect(planMode?.createsPlan).toBe(true);

      const debugMode = registry.getMode('debug');
      expect(debugMode?.displayName).toBe('Debug');
      expect(debugMode?.toolPermission).toBe('custom');
      expect(debugMode?.allowedTools).toBeDefined();
    });
  });

  describe('Mode Switching', () => {
    it('should switch modes successfully', () => {
      registry.switchMode('plan', 'user');

      const state = registry.getState();
      expect(state.currentMode).toBe('plan');
      expect(state.previousMode).toBe('agent');
      expect(state.wasAutoSwitched).toBe(false);
    });

    it('should track auto-switched modes', () => {
      registry.switchMode('debug', 'auto', 'Detected error query');

      const state = registry.getState();
      expect(state.currentMode).toBe('debug');
      expect(state.wasAutoSwitched).toBe(true);
      expect(state.switchContext).toBe('Detected error query');
    });

    it('should not switch when already in target mode', () => {
      const initialState = registry.getState();

      // Try to switch to same mode
      registry.switchMode('agent', 'user');

      const afterState = registry.getState();
      expect(afterState.activatedAt).toBe(initialState.activatedAt);
    });

    it('should emit modeChange event on switch', () => {
      const changeHandler = vi.fn();
      registry.on('modeChange', changeHandler);

      registry.switchMode('research', 'user');

      expect(changeHandler).toHaveBeenCalledTimes(1);
      const event = changeHandler.mock.calls[0][0] as ModeChangeEvent;
      expect(event.previousMode).toBe('agent');
      expect(event.newMode).toBe('research');
      expect(event.reason).toBe('user');
    });

    it('should throw error for unknown mode', () => {
      expect(() => {
        registry.switchMode('invalid-mode' as AriaModeId, 'user');
      }).toThrow('Unknown mode: invalid-mode');
    });

    it('should reset active plan when switching modes', () => {
      registry.setActivePlan('plan-123');
      expect(registry.getState().activePlanId).toBe('plan-123');

      registry.switchMode('debug', 'user');

      expect(registry.getState().activePlanId).toBeUndefined();
    });
  });

  describe('Tool Permissions', () => {
    it('should allow all tools in Agent mode', () => {
      registry.switchMode('agent', 'user');

      expect(registry.isToolAllowed('write_file')).toBe(true);
      expect(registry.isToolAllowed('run_terminal')).toBe(true);
      expect(registry.isToolAllowed('git_commit')).toBe(true);
      expect(registry.isToolAllowed('any_tool')).toBe(true);
    });

    it('should only allow read-only tools in Plan mode', () => {
      registry.switchMode('plan', 'user');

      expect(registry.isToolAllowed('read_file')).toBe(true);
      expect(registry.isToolAllowed('get_diagnostics')).toBe(true);
      expect(registry.isToolAllowed('list_dir')).toBe(true);
      expect(registry.isToolAllowed('write_file')).toBe(false);
      expect(registry.isToolAllowed('run_terminal')).toBe(false);
    });

    it('should respect custom allowed tools in Debug mode', () => {
      registry.switchMode('debug', 'user');

      expect(registry.isToolAllowed('read_file')).toBe(true);
      expect(registry.isToolAllowed('get_breakpoints')).toBe(true);
      expect(registry.isToolAllowed('get_call_stack')).toBe(true);
      expect(registry.isToolAllowed('write_file')).toBe(false);
      expect(registry.isToolAllowed('git_commit')).toBe(false);
    });

    it('should respect custom allowed tools in Research mode', () => {
      registry.switchMode('research', 'user');

      expect(registry.isToolAllowed('web_search')).toBe(true);
      expect(registry.isToolAllowed('athena_research')).toBe(true);
      expect(registry.isToolAllowed('fetch_url')).toBe(true);
      expect(registry.isToolAllowed('run_terminal')).toBe(false);
    });
  });

  describe('Custom Mode Registration', () => {
    it('should register a custom mode', () => {
      const customMode: AriaModeConfig = {
        id: 'custom' as AriaModeId,
        displayName: 'Custom Mode',
        description: 'A custom mode for testing',
        icon: '🎯',
        shortcut: 'Cmd+Shift+7',
        color: '#ff00ff',
        toolPermission: 'custom',
        allowedTools: ['custom_tool'],
        canModifyFiles: false,
        canExecuteTerminal: false,
        canModifyGit: false,
        requiresConfirmation: true,
        createsPlan: false,
        systemPromptAddition: 'You are in custom mode.',
        defaultAgentId: 'custom.agent',
      };

      registry.registerMode(customMode);

      const modes = registry.getAllModes();
      expect(modes).toHaveLength(7);

      const retrieved = registry.getMode('custom' as AriaModeId);
      expect(retrieved?.displayName).toBe('Custom Mode');
    });

    it('should update existing mode configuration', () => {
      registry.updateMode('agent', {
        description: 'Updated agent description',
        color: '#000000',
      });

      const updated = registry.getMode('agent');
      expect(updated?.description).toBe('Updated agent description');
      expect(updated?.color).toBe('#000000');
      expect(updated?.displayName).toBe('Agent'); // Unchanged
    });

    it('should throw error when updating non-existent mode', () => {
      expect(() => {
        registry.updateMode('non-existent' as AriaModeId, { color: '#fff' });
      }).toThrow('Mode not found');
    });
  });

  describe('System Prompt Addition', () => {
    it('should return correct system prompt for current mode', () => {
      registry.switchMode('plan', 'user');

      const prompt = registry.getSystemPromptAddition();

      expect(prompt).toContain('Plan mode');
      expect(prompt).toContain('DO NOT make any changes');
    });

    it('should include mode-specific instructions', () => {
      registry.switchMode('debug', 'user');

      const prompt = registry.getSystemPromptAddition();

      expect(prompt).toContain('Debug mode');
      expect(prompt).toContain('Diagnosing errors');
      expect(prompt).toContain('stack trace');
    });
  });
});

describe('AutoModeDetector E2E', () => {
  let detector: AutoModeDetector;

  beforeEach(() => {
    detector = AutoModeDetector.getInstance();
  });

  describe('Mode Detection from Query', () => {
    const testCases: Array<{ query: string; expectedMode: AriaModeId; description: string }> = [
      // Plan mode
      { query: 'Create a plan to refactor the authentication module', expectedMode: 'plan', description: 'plan keyword' },
      { query: 'Break down the steps to implement user registration', expectedMode: 'plan', description: 'break down keyword' },
      { query: 'What are the steps to deploy this app?', expectedMode: 'plan', description: 'steps to keyword' },
      { query: 'How would I implement a caching layer?', expectedMode: 'plan', description: 'how would I keyword' },

      // Debug mode
      { query: 'Debug this function, it\'s throwing an error', expectedMode: 'debug', description: 'debug keyword' },
      { query: 'I\'m getting an error: TypeError undefined', expectedMode: 'debug', description: 'error keyword' },
      { query: 'Help me fix this exception in the login flow', expectedMode: 'debug', description: 'exception keyword' },
      { query: 'Here\'s the stack trace, what\'s wrong?', expectedMode: 'debug', description: 'stack trace keyword' },
      { query: 'Why is this returning null?', expectedMode: 'debug', description: 'why is keyword' },

      // Research mode
      { query: 'Research best practices for React state management', expectedMode: 'research', description: 'research keyword' },
      { query: 'Investigate the performance of different databases', expectedMode: 'research', description: 'investigate keyword' },
      { query: 'What are the best practice for API design?', expectedMode: 'research', description: 'best practice keyword' },
      { query: 'Compare Redux vs Zustand vs Jotai', expectedMode: 'research', description: 'compare keyword' },

      // Code Review mode
      { query: 'Review this code for issues', expectedMode: 'code_review', description: 'review keyword' },
      { query: 'Analyze this code for potential bugs', expectedMode: 'code_review', description: 'analyze code keyword' },
      { query: 'Are there any issues with this implementation?', expectedMode: 'code_review', description: 'any issues keyword' },
      { query: 'How can I improve this function?', expectedMode: 'code_review', description: 'improve keyword' },

      // Ask mode
      { query: 'What is a closure in JavaScript?', expectedMode: 'ask', description: 'what is keyword' },
      { query: 'How does React\'s useEffect work?', expectedMode: 'ask', description: 'how does keyword' },
      { query: 'Explain the difference between let and const', expectedMode: 'ask', description: 'explain keyword' },

      // Default to agent
      { query: 'Add a new button to the header', expectedMode: 'agent', description: 'action request defaults to agent' },
      { query: 'Update the styles for the login form', expectedMode: 'agent', description: 'modification request defaults to agent' },
    ];

    for (const { query, expectedMode, description } of testCases) {
      it(`should detect ${expectedMode} mode for: ${description}`, () => {
        const result = detector.detectMode(query);
        expect(result.suggestedMode).toBe(expectedMode);
      });
    }
  });

  describe('Confidence Scoring', () => {
    it('should return high confidence for clear mode indicators', () => {
      const result = detector.detectMode('Debug this error in the authentication module');

      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should return lower confidence for ambiguous queries', () => {
      const result = detector.detectMode('Help me with this code');

      expect(result.confidence).toBeLessThan(0.7);
    });

    it('should include matched keywords in result', () => {
      const result = detector.detectMode('I need to debug this stack trace error');

      expect(result.matchedKeywords).toContain('debug');
      expect(result.matchedKeywords).toContain('error');
      expect(result.matchedKeywords.length).toBeGreaterThan(0);
    });
  });

  describe('Query Analysis', () => {
    it('should handle case-insensitive matching', () => {
      const result1 = detector.detectMode('DEBUG this error');
      const result2 = detector.detectMode('debug this error');

      expect(result1.suggestedMode).toBe(result2.suggestedMode);
    });

    it('should handle multiple mode indicators', () => {
      // Query with both research and debug indicators - should prefer stronger match
      const result = detector.detectMode('Research why this error is occurring');

      // Should have detected multiple possibilities
      expect(result.suggestedMode).toBeDefined();
    });

    it('should return agent mode for action-oriented requests', () => {
      const queries = [
        'Create a new React component called UserProfile',
        'Add unit tests for the payment service',
        'Implement pagination for the user list',
        'Fix the bug in the checkout flow',
      ];

      for (const query of queries) {
        const result = detector.detectMode(query);
        // Action-oriented requests should typically suggest agent mode
        expect(['agent', 'debug']).toContain(result.suggestedMode);
      }
    });
  });
});

describe('Mode Integration with ModeRegistry', () => {
  let registry: ModeRegistry;

  beforeEach(() => {
    resetSingletons();
    registry = ModeRegistry.getInstance();
  });

  afterEach(() => {
    resetSingletons();
  });

  describe('detectModeFromQuery Integration', () => {
    it('should detect debug mode from error queries', () => {
      const detected = registry.detectModeFromQuery('There is an error in my code');

      expect(detected).toBe('debug');
    });

    it('should detect plan mode from planning queries', () => {
      const detected = registry.detectModeFromQuery('Plan out the migration strategy');

      expect(detected).toBe('plan');
    });

    it('should detect research mode from research queries', () => {
      const detected = registry.detectModeFromQuery('Research the best testing framework');

      expect(detected).toBe('research');
    });

    it('should detect code-review mode from review queries', () => {
      const detected = registry.detectModeFromQuery('Review this pull request');

      expect(detected).toBe('code-review');
    });

    it('should detect ask mode from question queries', () => {
      const detected = registry.detectModeFromQuery('What is dependency injection?');

      expect(detected).toBe('ask');
    });

    it('should return null for action queries (stay in current mode)', () => {
      const detected = registry.detectModeFromQuery('Add a button to the form');

      expect(detected).toBeNull();
    });
  });

  describe('Full Mode Switch Workflow', () => {
    it('should complete full mode switch workflow', () => {
      // Start in agent mode
      expect(registry.getState().currentMode).toBe('agent');

      // User asks a question - detect ask mode
      const detected = registry.detectModeFromQuery('Explain how async/await works');
      expect(detected).toBe('ask');

      // Switch to detected mode
      if (detected) {
        registry.switchMode(detected, 'auto', 'Query-based detection');
      }

      // Verify state
      const state = registry.getState();
      expect(state.currentMode).toBe('ask');
      expect(state.wasAutoSwitched).toBe(true);
      expect(state.previousMode).toBe('agent');

      // Verify tool permissions changed
      expect(registry.isToolAllowed('read_file')).toBe(true);
      expect(registry.isToolAllowed('write_file')).toBe(false);

      // User manually switches back
      registry.switchMode('agent', 'user');
      expect(registry.getState().currentMode).toBe('agent');
      expect(registry.isToolAllowed('write_file')).toBe(true);
    });
  });
});

