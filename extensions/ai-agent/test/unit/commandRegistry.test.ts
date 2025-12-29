/**
 * CommandRegistry Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Note: vscode mock is provided by global setup.ts

// Mock child_process for AgentController's ClaudeAdapter
vi.mock('child_process', () => {
    const EventEmitter = require('events');
    const createMockProcess = () => {
        const proc = new EventEmitter();
        proc.stdin = { write: vi.fn(), end: vi.fn() };
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();
        proc.pid = 12345;
        proc.killed = false;
        proc.kill = vi.fn(() => { proc.killed = true; return true; });
        return proc;
    };
    return {
        spawn: vi.fn(() => createMockProcess()),
        exec: vi.fn((cmd: string, callback: (err: any, result: any) => void) => {
            callback(null, { stdout: 'claude v1.0.0', stderr: '' });
        })
    };
});

// Mock fs for LogbookService
vi.mock('fs', () => ({
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => { throw new Error('Not found'); }),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn()
}));

// Import after mocks
import * as vscode from 'vscode';
import { CommandRegistry } from '../../src/application/commandRegistry';
import { AgentController } from '../../src/application/agentController';

describe('CommandRegistry', () => {
    let controller: AgentController;
    let registry: CommandRegistry;

    beforeEach(() => {
        vi.clearAllMocks();
        controller = new AgentController({
            statePath: '/test/state.json'
        });
        registry = new CommandRegistry(controller);
    });

    afterEach(() => {
        registry.dispose();
        controller.dispose();
    });

    describe('registerCommand', () => {
        it('should register a command with vscode.commands', () => {
            registry.registerCommand('test.command', () => {});

            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'test.command',
                expect.any(Function)
            );
        });

        it('should track registered command IDs', () => {
            registry.registerCommand('test.cmd1', () => {});
            registry.registerCommand('test.cmd2', () => {});

            const commands = registry.getRegisteredCommands();
            expect(commands).toContain('test.cmd1');
            expect(commands).toContain('test.cmd2');
        });

        it('should not register duplicate commands', () => {
            registry.registerCommand('test.duplicate', () => {});
            registry.registerCommand('test.duplicate', () => {});

            expect(vscode.commands.registerCommand).toHaveBeenCalledTimes(1);
        });
    });

    describe('unregisterCommand', () => {
        it('should dispose and remove command', () => {
            registry.registerCommand('test.remove', () => {});

            registry.unregisterCommand('test.remove');

            const commands = registry.getRegisteredCommands();
            expect(commands).not.toContain('test.remove');
        });

        it('should handle unregistering non-existent command', () => {
            expect(() => registry.unregisterCommand('nonexistent')).not.toThrow();
        });
    });

    describe('registerAllCommands', () => {
        it('should register all Code Ship commands', () => {
            registry.registerAllCommands();

            const commands = registry.getRegisteredCommands();
            expect(commands).toContain('codeShip.openChat');
            expect(commands).toContain('codeShip.sendMessage');
            expect(commands).toContain('codeShip.switchPhase');
            expect(commands).toContain('codeShip.cancel');
            expect(commands).toContain('codeShip.clearHistory');
            expect(commands).toContain('codeShip.checkDependencies');
        });

        it('should register 6 commands', () => {
            registry.registerAllCommands();

            expect(registry.getRegisteredCommands()).toHaveLength(6);
        });
    });

    describe('command handlers', () => {
        beforeEach(() => {
            registry.registerAllCommands();
        });

        it('should handle switchPhase with valid phase', async () => {
            const calls = (vscode.commands.registerCommand as any).mock.calls;
            const handler = calls.find(
                (call: any) => call[0] === 'codeShip.switchPhase'
            )?.[1];

            await handler('design');

            expect(controller.phase).toBe('design');
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                '[Code Ship] Switched to design phase'
            );
        });

        it('should handle switchPhase with invalid phase', async () => {
            const calls = (vscode.commands.registerCommand as any).mock.calls;
            const handler = calls.find(
                (call: any) => call[0] === 'codeShip.switchPhase'
            )?.[1];

            await handler('invalid');

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                '[Code Ship] Invalid phase: invalid'
            );
        });

        it('should handle clearHistory', () => {
            const calls = (vscode.commands.registerCommand as any).mock.calls;
            const handler = calls.find(
                (call: any) => call[0] === 'codeShip.clearHistory'
            )?.[1];

            handler();

            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                '[Code Ship] Chat history cleared'
            );
        });

        it('should handle cancel', async () => {
            const calls = (vscode.commands.registerCommand as any).mock.calls;
            const handler = calls.find(
                (call: any) => call[0] === 'codeShip.cancel'
            )?.[1];

            await handler();

            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                '[Code Ship] Operation cancelled'
            );
        });

        it('should handle openChat by executing showChatView', async () => {
            const calls = (vscode.commands.registerCommand as any).mock.calls;
            const handler = calls.find(
                (call: any) => call[0] === 'codeShip.openChat'
            )?.[1];

            await handler();

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'codeShip.showChatView'
            );
        });
    });

    describe('getRegisteredCommands', () => {
        it('should return empty array initially', () => {
            expect(registry.getRegisteredCommands()).toEqual([]);
        });

        it('should return all registered command IDs', () => {
            registry.registerCommand('a', () => {});
            registry.registerCommand('b', () => {});
            registry.registerCommand('c', () => {});

            expect(registry.getRegisteredCommands()).toHaveLength(3);
        });
    });

    describe('dispose', () => {
        it('should dispose all registered commands', () => {
            registry.registerCommand('test.a', () => {});
            registry.registerCommand('test.b', () => {});

            registry.dispose();

            // After dispose, commands should be cleared
            expect(registry.getRegisteredCommands()).toEqual([]);
        });

        it('should clear command map', () => {
            registry.registerCommand('test.cmd', () => {});

            registry.dispose();

            expect(registry.getRegisteredCommands()).toEqual([]);
        });

        it('should not throw on double dispose', () => {
            registry.registerCommand('test.cmd', () => {});

            expect(() => {
                registry.dispose();
                registry.dispose();
            }).not.toThrow();
        });
    });

    describe('with internal API', () => {
        it('should setup interception when internal API is provided', () => {
            const mockInterceptor = { dispose: vi.fn() };
            const mockInternalApi = {
                interceptCommand: vi.fn(() => mockInterceptor),
                requestOverlayAccess: vi.fn(),
                onNativeEvent: vi.fn()
            };

            const registryWithApi = new CommandRegistry(controller, mockInternalApi as any);
            registryWithApi.registerAllCommands();

            expect(mockInternalApi.interceptCommand).toHaveBeenCalledTimes(2);
            expect(mockInternalApi.interceptCommand).toHaveBeenCalledWith(
                'workbench.action.files.save',
                expect.any(Function)
            );
            expect(mockInternalApi.interceptCommand).toHaveBeenCalledWith(
                'git.commit',
                expect.any(Function)
            );

            registryWithApi.dispose();
        });

        it('should not setup interception without internal API', () => {
            const registryNoApi = new CommandRegistry(controller);
            registryNoApi.registerAllCommands();

            // Just verify it doesn't throw
            expect(registryNoApi.getRegisteredCommands().length).toBeGreaterThan(0);

            registryNoApi.dispose();
        });
    });
});
