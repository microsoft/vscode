/**
 * WebviewProvider Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock vscode module
const mockWebview = {
    options: {},
    html: '',
    onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })),
    postMessage: vi.fn(() => Promise.resolve(true)),
    asWebviewUri: vi.fn((uri: any) => uri),
    cspSource: 'https://test.vscode-cdn.net'
};

const mockWebviewView = {
    webview: mockWebview,
    onDidDispose: vi.fn(() => ({ dispose: vi.fn() }))
};

const mockWebviewPanel = {
    webview: mockWebview,
    reveal: vi.fn(),
    dispose: vi.fn(),
    onDidDispose: vi.fn(() => ({ dispose: vi.fn() }))
};

vi.mock('vscode', () => ({
    Uri: {
        joinPath: vi.fn((...args: any[]) => ({
            toString: () => args.join('/'),
            fsPath: args.join('/')
        }))
    },
    ViewColumn: {
        Beside: 2
    },
    window: {
        createWebviewPanel: vi.fn(() => mockWebviewPanel),
        registerWebviewViewProvider: vi.fn(() => ({ dispose: vi.fn() }))
    },
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
}));

// Mock child_process for AgentController
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

import * as vscode from 'vscode';
import { WebviewProvider } from '../../src/presentation/webview/webviewProvider';
import { AgentController } from '../../src/application/agentController';

describe('WebviewProvider', () => {
    let provider: WebviewProvider;
    let controller: AgentController;
    const extensionUri = { fsPath: '/test/extension' } as vscode.Uri;

    beforeEach(() => {
        vi.clearAllMocks();
        mockWebview.html = '';

        controller = new AgentController({
            statePath: '/test/state.json'
        });

        provider = new WebviewProvider({
            extensionUri,
            controller
        });
    });

    afterEach(() => {
        provider.dispose();
        controller.dispose();
    });

    describe('viewType', () => {
        it('should have correct view type', () => {
            expect(WebviewProvider.viewType).toBe('codeShip.chatView');
        });
    });

    describe('resolveWebviewView', () => {
        it('should configure webview options', () => {
            provider.resolveWebviewView(
                mockWebviewView as any,
                {} as any,
                {} as any
            );

            expect(mockWebview.options).toMatchObject({
                enableScripts: true,
                retainContextWhenHidden: true
            });
        });

        it('should set HTML content', () => {
            provider.resolveWebviewView(
                mockWebviewView as any,
                {} as any,
                {} as any
            );

            expect(mockWebview.html).toContain('<!DOCTYPE html>');
            expect(mockWebview.html).toContain('Code Ship Chat');
        });

        it('should setup message listener', () => {
            provider.resolveWebviewView(
                mockWebviewView as any,
                {} as any,
                {} as any
            );

            expect(mockWebview.onDidReceiveMessage).toHaveBeenCalled();
        });

        it('should register dispose handler', () => {
            provider.resolveWebviewView(
                mockWebviewView as any,
                {} as any,
                {} as any
            );

            expect(mockWebviewView.onDidDispose).toHaveBeenCalled();
        });
    });

    describe('showPanel', () => {
        it('should create a new webview panel', () => {
            provider.showPanel();

            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                'codeShip.chatView',
                'Code Ship Chat',
                vscode.ViewColumn.Beside,
                expect.any(Object)
            );
        });

        it('should return the created panel', () => {
            const panel = provider.showPanel();

            expect(panel).toBe(mockWebviewPanel);
        });

        it('should reveal existing panel instead of creating new', () => {
            provider.showPanel();
            vi.clearAllMocks();

            provider.showPanel();

            expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled();
            expect(mockWebviewPanel.reveal).toHaveBeenCalled();
        });

        it('should set HTML content on panel', () => {
            provider.showPanel();

            expect(mockWebview.html).toContain('<!DOCTYPE html>');
        });
    });

    describe('postMessage', () => {
        it('should post message to webview view', () => {
            provider.resolveWebviewView(
                mockWebviewView as any,
                {} as any,
                {} as any
            );

            const result = provider.postMessage({ type: 'ready' });

            expect(result).toBe(true);
            expect(mockWebview.postMessage).toHaveBeenCalledWith({ type: 'ready' });
        });

        it('should post message to panel webview', () => {
            provider.showPanel();

            const result = provider.postMessage({ type: 'ready' });

            expect(result).toBe(true);
            expect(mockWebview.postMessage).toHaveBeenCalledWith({ type: 'ready' });
        });

        it('should return false when no webview available', () => {
            const result = provider.postMessage({ type: 'ready' });

            expect(result).toBe(false);
        });
    });

    describe('HTML content', () => {
        it('should include CSP meta tag', () => {
            provider.showPanel();

            expect(mockWebview.html).toContain('Content-Security-Policy');
        });

        it('should include nonce for scripts', () => {
            provider.showPanel();

            expect(mockWebview.html).toMatch(/nonce="[A-Za-z0-9]{32}"/);
        });

        it('should include VS Code CSS variables', () => {
            provider.showPanel();

            expect(mockWebview.html).toContain('--vscode-font-family');
            expect(mockWebview.html).toContain('--vscode-foreground');
        });

        it('should include root div', () => {
            provider.showPanel();

            expect(mockWebview.html).toContain('id="root"');
        });

        it('should reference main.js script', () => {
            provider.showPanel();

            expect(mockWebview.html).toContain('main.js');
        });
    });

    describe('dispose', () => {
        it('should dispose panel', () => {
            provider.showPanel();

            provider.dispose();

            expect(mockWebviewPanel.dispose).toHaveBeenCalled();
        });

        it('should not throw when no panel exists', () => {
            expect(() => provider.dispose()).not.toThrow();
        });

        it('should handle multiple dispose calls', () => {
            provider.showPanel();

            expect(() => {
                provider.dispose();
                provider.dispose();
            }).not.toThrow();
        });
    });
});
