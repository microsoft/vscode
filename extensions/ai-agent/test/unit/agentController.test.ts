/**
 * AgentController Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentController } from '../../src/application/agentController';
import type { Phase, ChatMessage, WebviewToExtensionMessage } from '../../src/types';

// Mock child_process for ClaudeAdapter
vi.mock('child_process', () => {
    const EventEmitter = require('events');

    const createMockProcess = () => {
        const proc = new EventEmitter();
        proc.stdin = {
            write: vi.fn(() => true),
            end: vi.fn()
        };
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();
        proc.pid = 12345;
        proc.killed = false;
        proc.kill = vi.fn((signal?: string) => {
            proc.killed = true;
            setTimeout(() => proc.emit('exit', 0), 10);
            return true;
        });
        return proc;
    };

    let mockProcess = createMockProcess();

    return {
        spawn: vi.fn(() => {
            mockProcess = createMockProcess();
            return mockProcess;
        }),
        exec: vi.fn((cmd: string, callback: (err: any, result: any) => void) => {
            if (cmd.includes('claude')) {
                callback(null, { stdout: 'claude v1.0.0', stderr: '' });
            } else {
                callback(new Error('Not found'), null);
            }
        }),
        __getMockProcess: () => mockProcess
    };
});

// Mock fs for LogbookService
vi.mock('fs', () => ({
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => { throw new Error('Not found'); }),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn()
}));

describe('AgentController', () => {
    let controller: AgentController;

    beforeEach(() => {
        vi.clearAllMocks();
        controller = new AgentController({
            statePath: '/test/state.json'
        });
    });

    afterEach(() => {
        controller.dispose();
    });

    describe('initialization', () => {
        it('should start with implementation phase', () => {
            expect(controller.phase).toBe('implementation');
        });

        it('should have empty chat history', () => {
            expect(controller.chatHistory).toEqual([]);
        });

        it('should not be running initially', () => {
            expect(controller.isRunning).toBe(false);
        });
    });

    describe('handleWebviewMessage', () => {
        it('should handle send message request', async () => {
            const messages: ChatMessage[] = [];
            controller.onMessage((msg) => messages.push(msg));

            const message: WebviewToExtensionMessage = { type: 'send', data: 'Hello' };
            await controller.handleWebviewMessage(message);

            expect(messages.length).toBeGreaterThan(0);
            expect(messages[0].content).toBe('Hello');
            expect(messages[0].sender).toBe('user');
        });

        it('should handle switch-phase request', async () => {
            const phases: Phase[] = [];
            controller.onPhaseChange((phase) => phases.push(phase));

            const message: WebviewToExtensionMessage = { type: 'switch-phase', data: 'design' };
            await controller.handleWebviewMessage(message);

            expect(controller.phase).toBe('design');
            expect(phases).toContain('design');
        });

        it('should handle get-history request', async () => {
            const postMessage = vi.fn();
            controller.setPostMessage(postMessage);

            const message: WebviewToExtensionMessage = { type: 'get-history' };
            await controller.handleWebviewMessage(message);

            expect(postMessage).toHaveBeenCalledWith({
                type: 'history',
                data: expect.any(Array)
            });
        });

        it('should handle clear-history request', async () => {
            // Add some messages first
            await controller.handleWebviewMessage({ type: 'send', data: 'Hello' });

            // Clear
            await controller.handleWebviewMessage({ type: 'clear-history' });

            expect(controller.chatHistory).toEqual([]);
        });

        it('should handle ready request', async () => {
            const postMessage = vi.fn();
            controller.setPostMessage(postMessage);

            await controller.handleWebviewMessage({ type: 'ready' });

            expect(postMessage).toHaveBeenCalledWith({ type: 'ready' });
        });
    });

    describe('sendMessage', () => {
        it('should add user message to history', async () => {
            await controller.sendMessage('Test message');

            const history = controller.chatHistory;
            expect(history.length).toBeGreaterThan(0);
            expect(history[0].content).toBe('Test message');
            expect(history[0].sender).toBe('user');
        });

        it('should emit message event', async () => {
            const messages: ChatMessage[] = [];
            controller.onMessage((msg) => messages.push(msg));

            await controller.sendMessage('Test');

            expect(messages.length).toBeGreaterThan(0);
        });

        it('should forward message to webview', async () => {
            const postMessage = vi.fn();
            controller.setPostMessage(postMessage);

            await controller.sendMessage('Test');

            expect(postMessage).toHaveBeenCalledWith({
                type: 'message',
                data: expect.objectContaining({
                    content: 'Test',
                    sender: 'user'
                })
            });
        });
    });

    describe('switchPhase', () => {
        it('should update phase correctly', async () => {
            await controller.switchPhase('design');
            expect(controller.phase).toBe('design');

            await controller.switchPhase('review');
            expect(controller.phase).toBe('review');
        });

        it('should emit phase change event', async () => {
            const phases: Phase[] = [];
            controller.onPhaseChange((phase) => phases.push(phase));

            await controller.switchPhase('design');

            expect(phases).toContain('design');
        });

        it('should not emit if same phase', async () => {
            const phases: Phase[] = [];
            controller.onPhaseChange((phase) => phases.push(phase));

            await controller.switchPhase('implementation');

            expect(phases).toHaveLength(0);
        });
    });

    describe('cancel', () => {
        it('should add system message on cancel', async () => {
            // Start a message to have CLI running
            await controller.sendMessage('Test');

            // Cancel
            await controller.cancel();

            const history = controller.chatHistory;
            const systemMsgs = history.filter(m => m.sender === 'system');
            expect(systemMsgs.some(m => m.content.includes('cancelled'))).toBe(true);
        });
    });

    describe('clearHistory', () => {
        it('should clear all messages', async () => {
            await controller.sendMessage('Message 1');
            await controller.sendMessage('Message 2');

            controller.clearHistory();

            expect(controller.chatHistory).toEqual([]);
        });

        it('should post clear message to webview', () => {
            const postMessage = vi.fn();
            controller.setPostMessage(postMessage);

            controller.clearHistory();

            expect(postMessage).toHaveBeenCalledWith({ type: 'clear' });
        });
    });

    describe('events', () => {
        it('should emit output events', async () => {
            const outputs: any[] = [];
            controller.onOutput((output) => outputs.push(output));

            await controller.sendMessage('Test');
            const { __getMockProcess } = await import('child_process');
            const mockProcess = __getMockProcess();

            mockProcess.stdout.emit('data', Buffer.from('Response'));

            // Wait for async processing
            await new Promise(r => setTimeout(r, 50));

            expect(outputs.length).toBeGreaterThan(0);
        });

        it('should emit error events', async () => {
            const errors: Error[] = [];
            controller.onError((error) => errors.push(error));

            // Initialize to check dependencies
            await controller.initialize();

            // Should have error for missing gemini/codex
            expect(errors.length).toBeGreaterThan(0);
        });
    });

    describe('dispose', () => {
        it('should cleanup without errors', () => {
            expect(() => controller.dispose()).not.toThrow();
        });
    });
});
