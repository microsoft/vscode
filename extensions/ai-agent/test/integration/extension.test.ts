/**
 * Extension Integration Tests
 * Tests the extension module structure and activation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock vscode module
vi.mock('vscode', () => {
    const mockDisposable = { dispose: vi.fn() };
    return {
        // Internal API is not available in tests (simulating standard VS Code)
        aiAgent: undefined,
        commands: {
            registerCommand: vi.fn(() => mockDisposable),
            executeCommand: vi.fn()
        },
        window: {
            showInformationMessage: vi.fn(),
            showWarningMessage: vi.fn(() => Promise.resolve(undefined)),
            showErrorMessage: vi.fn(),
            createOutputChannel: vi.fn(() => ({
                appendLine: vi.fn(),
                show: vi.fn()
            })),
            registerWebviewViewProvider: vi.fn(() => mockDisposable),
            createWebviewPanel: vi.fn(() => ({
                webview: {
                    options: {},
                    html: '',
                    onDidReceiveMessage: vi.fn(() => mockDisposable),
                    postMessage: vi.fn(),
                    asWebviewUri: vi.fn((uri: any) => uri),
                    cspSource: ''
                },
                reveal: vi.fn(),
                dispose: vi.fn(),
                onDidDispose: vi.fn(() => mockDisposable)
            }))
        },
        workspace: {
            getConfiguration: vi.fn(() => ({
                get: vi.fn((key: string, defaultValue: any) => defaultValue)
            })),
            workspaceFolders: [{
                uri: { fsPath: '/test/workspace' }
            }]
        },
        Uri: {
            joinPath: vi.fn((...args: any[]) => ({
                fsPath: args.map((a: any) => a.fsPath || a).join('/'),
                toString: () => args.join('/')
            }))
        },
        ViewColumn: { Beside: 2 },
        EventEmitter: class MockEventEmitter {
            private listeners: Function[] = [];
            event = (listener: Function) => {
                this.listeners.push(listener);
                return { dispose: () => {} };
            };
            fire(data: any) {
                this.listeners.forEach(l => l(data));
            }
            dispose() {}
        }
    };
});

// Mock child_process
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
            if (cmd.includes('claude')) {
                callback(null, { stdout: 'claude v1.0.0', stderr: '' });
            } else {
                callback(new Error('Not found'), null);
            }
        })
    };
});

// Mock fs
vi.mock('fs', () => ({
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => { throw new Error('Not found'); }),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn()
}));

import * as vscode from 'vscode';

describe('Extension', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('module exports', () => {
        it('should export activate function', async () => {
            const extension = await import('../../src/extension');

            expect(typeof extension.activate).toBe('function');
        });

        it('should export deactivate function', async () => {
            const extension = await import('../../src/extension');

            expect(typeof extension.deactivate).toBe('function');
        });
    });

    describe('activate', () => {
        it('should activate without errors', async () => {
            const extension = await import('../../src/extension');
            const context = {
                extensionUri: { fsPath: '/test/extension' },
                subscriptions: []
            } as unknown as vscode.ExtensionContext;

            await expect(extension.activate(context)).resolves.not.toThrow();
        });

        it('should register webview view provider', async () => {
            const extension = await import('../../src/extension');
            const context = {
                extensionUri: { fsPath: '/test/extension' },
                subscriptions: []
            } as unknown as vscode.ExtensionContext;

            await extension.activate(context);

            expect(vscode.window.registerWebviewViewProvider).toHaveBeenCalledWith(
                'codeShip.chatView',
                expect.any(Object),
                expect.any(Object)
            );
        });

        it('should register showChatView command', async () => {
            const extension = await import('../../src/extension');
            const context = {
                extensionUri: { fsPath: '/test/extension' },
                subscriptions: []
            } as unknown as vscode.ExtensionContext;

            await extension.activate(context);

            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'codeShip.showChatView',
                expect.any(Function)
            );
        });

        it('should add disposables to subscriptions', async () => {
            const extension = await import('../../src/extension');
            const subscriptions: vscode.Disposable[] = [];
            const context = {
                extensionUri: { fsPath: '/test/extension' },
                subscriptions
            } as unknown as vscode.ExtensionContext;

            await extension.activate(context);

            expect(subscriptions.length).toBeGreaterThan(0);
        });

        it('should check dependencies on activation', async () => {
            const extension = await import('../../src/extension');
            const context = {
                extensionUri: { fsPath: '/test/extension' },
                subscriptions: []
            } as unknown as vscode.ExtensionContext;

            await extension.activate(context);

            // Should show warning for missing dependencies (gemini, codex)
            expect(vscode.window.showWarningMessage).toHaveBeenCalled();
        });
    });

    describe('deactivate', () => {
        it('should deactivate without errors', async () => {
            const extension = await import('../../src/extension');

            expect(() => extension.deactivate()).not.toThrow();
        });
    });
});

describe('Module imports', () => {
    it('should import AgentController', async () => {
        const { AgentController } = await import('../../src/application/agentController');
        expect(AgentController).toBeDefined();
    });

    it('should import CommandRegistry', async () => {
        const { CommandRegistry } = await import('../../src/application/commandRegistry');
        expect(CommandRegistry).toBeDefined();
    });

    it('should import WebviewProvider', async () => {
        const { WebviewProvider } = await import('../../src/presentation/webview/webviewProvider');
        expect(WebviewProvider).toBeDefined();
    });

    it('should import DependencyManager', async () => {
        const { DependencyManager } = await import('../../src/domain/dependency/dependencyManager');
        expect(DependencyManager).toBeDefined();
    });

    it('should import types', async () => {
        const types = await import('../../src/types');
        expect(types.STATE_VERSION).toBeDefined();
        expect(types.createChatMessage).toBeDefined();
    });
});
