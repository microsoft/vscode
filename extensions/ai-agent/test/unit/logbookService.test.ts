/**
 * LogbookService Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LogbookService } from '../../src/domain/logbook/logbookService';
import type { Phase, ChatMessage, SessionState } from '../../src/types';

// Store for mock fs
const mockStore: Record<string, string> = {};

// Mock fs module
vi.mock('fs', () => {
    return {
        existsSync: vi.fn((path: string) => path in mockStore),
        readFileSync: vi.fn((path: string) => {
            if (path in mockStore) {
                return mockStore[path];
            }
            throw new Error('File not found');
        }),
        writeFileSync: vi.fn((path: string, data: string) => {
            mockStore[path] = data;
        }),
        mkdirSync: vi.fn()
    };
});

// Helper to reset mock store
function resetMockStore() {
    Object.keys(mockStore).forEach(key => delete mockStore[key]);
}

describe('LogbookService', () => {
    let service: LogbookService;
    const testStatePath = '/test/state.json';

    beforeEach(() => {
        resetMockStore();
        vi.clearAllMocks();

        service = new LogbookService({
            statePath: testStatePath,
            autoSaveInterval: 0 // Disable auto-save for tests
        });
    });

    afterEach(() => {
        service.dispose();
    });

    describe('initialization', () => {
        it('should start with default state', () => {
            expect(service.sessionId).toBeDefined();
            expect(service.phase).toBe('implementation');
            expect(service.chatHistory).toEqual([]);
        });

        it('should have empty agent memory', () => {
            const memory = service.agentMemory;

            expect(memory.shortTerm).toBe('');
            expect(memory.todo).toEqual([]);
        });
    });

    describe('loadState', () => {
        it('should load state from file', async () => {
            const path = await import('path');
            const resolvedPath = path.resolve(testStatePath);

            const savedState: SessionState = {
                version: '1.0',
                sessionId: 'test-session',
                lastUpdated: new Date().toISOString(),
                phase: 'design',
                agentMemory: {
                    shortTerm: 'Test context',
                    todo: ['Task 1']
                },
                chatHistory: []
            };
            mockStore[resolvedPath] = JSON.stringify(savedState);

            const result = await service.loadState();

            expect(result).toBe(true);
            expect(service.sessionId).toBe('test-session');
            expect(service.phase).toBe('design');
        });

        it('should return false when file does not exist', async () => {
            const result = await service.loadState();

            expect(result).toBe(false);
        });

        it('should handle missing state file gracefully', async () => {
            const result = await service.loadState();

            expect(result).toBe(false);
            expect(service.sessionId).toBeDefined();
        });
    });

    describe('saveState', () => {
        it('should save state to file', async () => {
            const fs = await import('fs') as any;

            const result = await service.saveState();

            expect(result).toBe(true);
            expect(fs.writeFileSync).toHaveBeenCalled();
        });

        it('should create directory if not exists', async () => {
            const fs = await import('fs') as any;

            await service.saveState();

            expect(fs.mkdirSync).toHaveBeenCalled();
        });
    });

    describe('addMessage', () => {
        it('should add messages to history', () => {
            const message = service.addMessage('user', 'Hello');

            expect(service.chatHistory).toHaveLength(1);
            expect(message.sender).toBe('user');
            expect(message.content).toBe('Hello');
        });

        it('should include phase in message', () => {
            const message = service.addMessage('user', 'Hello');

            expect(message.phase).toBe('implementation');
        });

        it('should include CLI in message when specified', () => {
            const message = service.addMessage('assistant', 'Response', 'claude');

            expect(message.cli).toBe('claude');
        });

        it('should emit message event', () => {
            const messages: ChatMessage[] = [];
            service.onMessageAdded((msg) => messages.push(msg));

            service.addMessage('user', 'Hello');

            expect(messages).toHaveLength(1);
        });

        it('should emit state change event', () => {
            const states: SessionState[] = [];
            service.onStateChange((state) => states.push(state));

            service.addMessage('user', 'Hello');

            expect(states).toHaveLength(1);
        });
    });

    describe('setPhase', () => {
        it('should update phase', () => {
            service.setPhase('design');

            expect(service.phase).toBe('design');
        });

        it('should emit phase change event', () => {
            const phases: Phase[] = [];
            service.onPhaseChange((phase) => phases.push(phase));

            service.setPhase('review');

            expect(phases).toContain('review');
        });

        it('should add system message about phase change', () => {
            service.setPhase('design');

            const history = service.chatHistory;
            const systemMsg = history.find(m => m.sender === 'system');

            expect(systemMsg).toBeDefined();
            expect(systemMsg?.content).toContain('Phase changed');
        });

        it('should not emit if phase is the same', () => {
            const phases: Phase[] = [];
            service.onPhaseChange((phase) => phases.push(phase));

            service.setPhase('implementation'); // Same as default

            expect(phases).toHaveLength(0);
        });
    });

    describe('updateMemory', () => {
        it('should update agent memory', () => {
            service.updateMemory({ shortTerm: 'New context' });

            expect(service.agentMemory.shortTerm).toBe('New context');
        });

        it('should merge with existing memory', () => {
            service.updateMemory({ shortTerm: 'Context 1' });
            service.updateMemory({ todo: ['Task 1'] });

            const memory = service.agentMemory;
            expect(memory.shortTerm).toBe('Context 1');
            expect(memory.todo).toContain('Task 1');
        });
    });

    describe('todo management', () => {
        it('should add todo items', () => {
            const todoService = new LogbookService({
                statePath: testStatePath,
                autoSaveInterval: 0
            });

            todoService.addTodo('Task 1');
            todoService.addTodo('Task 2');

            expect(todoService.agentMemory.todo).toEqual(['Task 1', 'Task 2']);
            todoService.dispose();
        });

        it('should remove todo items', () => {
            const todoService = new LogbookService({
                statePath: testStatePath,
                autoSaveInterval: 0
            });

            todoService.addTodo('Task 1');
            todoService.addTodo('Task 2');

            todoService.removeTodo(0);

            expect(todoService.agentMemory.todo).toEqual(['Task 2']);
            todoService.dispose();
        });

        it('should handle invalid todo index', () => {
            const todoService = new LogbookService({
                statePath: testStatePath,
                autoSaveInterval: 0
            });

            todoService.addTodo('Task 1');

            todoService.removeTodo(5); // Invalid index

            expect(todoService.agentMemory.todo).toEqual(['Task 1']);
            todoService.dispose();
        });
    });

    describe('pruneHistory', () => {
        it('should prune old messages when threshold exceeded', () => {
            const serviceWithLimit = new LogbookService({
                statePath: '/test/state.json',
                autoSaveInterval: 0,
                maxHistoryLength: 10
            });

            // Add more than max messages
            for (let i = 0; i < 15; i++) {
                serviceWithLimit.addMessage('user', `Message ${i}`);
            }

            expect(serviceWithLimit.chatHistory.length).toBeLessThanOrEqual(10);
            serviceWithLimit.dispose();
        });

        it('should keep system messages during pruning', () => {
            const serviceWithLimit = new LogbookService({
                statePath: '/test/state.json',
                autoSaveInterval: 0,
                maxHistoryLength: 10
            });

            serviceWithLimit.addMessage('system', 'System message');
            for (let i = 0; i < 15; i++) {
                serviceWithLimit.addMessage('user', `Message ${i}`);
            }

            const history = serviceWithLimit.chatHistory;
            const systemMessages = history.filter(m => m.sender === 'system');

            expect(systemMessages.length).toBeGreaterThan(0);
            serviceWithLimit.dispose();
        });
    });

    describe('clearHistory', () => {
        it('should clear all messages', () => {
            service.addMessage('user', 'Hello');
            service.addMessage('assistant', 'Hi');

            service.clearHistory();

            expect(service.chatHistory).toEqual([]);
        });
    });

    describe('resetSession', () => {
        it('should reset to new session', () => {
            const resetService = new LogbookService({
                statePath: testStatePath,
                autoSaveInterval: 0
            });

            const oldSessionId = resetService.sessionId;
            resetService.addMessage('user', 'Hello');
            resetService.setPhase('review');

            resetService.resetSession();

            expect(resetService.sessionId).not.toBe(oldSessionId);
            expect(resetService.phase).toBe('implementation');
            expect(resetService.chatHistory).toEqual([]);
            resetService.dispose();
        });

        it('should accept initial phase', () => {
            const resetService = new LogbookService({
                statePath: testStatePath,
                autoSaveInterval: 0
            });

            resetService.resetSession('design');

            expect(resetService.phase).toBe('design');
            resetService.dispose();
        });
    });

    describe('exportForHandover', () => {
        it('should export state for handover', () => {
            service.addMessage('user', 'Hello');
            service.updateMemory({ shortTerm: 'Context' });

            const exported = service.exportForHandover();
            const parsed = JSON.parse(exported);

            expect(parsed.phase).toBe('implementation');
            expect(parsed.memory.shortTerm).toBe('Context');
            expect(parsed.exportedAt).toBeDefined();
        });

        it('should include recent history', () => {
            for (let i = 0; i < 30; i++) {
                service.addMessage('user', `Message ${i}`);
            }

            const exported = service.exportForHandover();
            const parsed = JSON.parse(exported);

            expect(parsed.recentHistory.length).toBeLessThanOrEqual(20);
        });
    });

    describe('dispose', () => {
        it('should cleanup on dispose', () => {
            service.addMessage('user', 'Hello');

            expect(() => service.dispose()).not.toThrow();
        });
    });
});
