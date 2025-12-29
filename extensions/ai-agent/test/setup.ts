/**
 * Vitest Global Setup
 * Configures mocks and test environment
 */

import { vi } from 'vitest';

// Mock VS Code module
vi.mock('vscode', () => {
    return {
        window: {
            showInformationMessage: vi.fn(),
            showWarningMessage: vi.fn(),
            showErrorMessage: vi.fn(),
            createOutputChannel: vi.fn(() => ({
                appendLine: vi.fn(),
                show: vi.fn(),
                dispose: vi.fn()
            })),
            createWebviewPanel: vi.fn(() => ({
                webview: {
                    html: '',
                    postMessage: vi.fn(),
                    onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })),
                    asWebviewUri: vi.fn((uri: any) => uri),
                    cspSource: 'https://test.vscode-cdn.net'
                },
                reveal: vi.fn(),
                dispose: vi.fn(),
                onDidDispose: vi.fn(() => ({ dispose: vi.fn() }))
            })),
            registerWebviewViewProvider: vi.fn(() => ({ dispose: vi.fn() }))
        },
        commands: {
            registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
            executeCommand: vi.fn()
        },
        workspace: {
            getConfiguration: vi.fn(() => ({
                get: vi.fn(),
                update: vi.fn()
            })),
            workspaceFolders: [],
            fs: {
                readFile: vi.fn(),
                writeFile: vi.fn(),
                stat: vi.fn()
            }
        },
        env: {
            language: 'en',
            appName: 'Code Ship',
            machineId: 'mock-machine-id',
            uriScheme: 'codeship'
        },
        EventEmitter: class MockEventEmitter {
            private listeners: Array<(e: any) => void> = [];
            event = (listener: (e: any) => void) => {
                this.listeners.push(listener);
                return { dispose: () => {} };
            };
            fire = (data: any) => {
                this.listeners.forEach(l => l(data));
            };
            dispose = () => {
                this.listeners = [];
            };
        },
        Disposable: {
            from: vi.fn((...disposables: any[]) => ({
                dispose: () => disposables.forEach(d => d.dispose?.())
            }))
        },
        Uri: {
            file: vi.fn((path: string) => ({ fsPath: path, path })),
            parse: vi.fn((str: string) => ({ fsPath: str, path: str })),
            joinPath: vi.fn((...args: any[]) => ({
                toString: () => args.join('/'),
                fsPath: args.join('/')
            }))
        },
        ViewColumn: {
            One: 1,
            Two: 2,
            Three: 3,
            Beside: 2,
            Active: -1
        },
        ExtensionContext: class MockExtensionContext {
            subscriptions: any[] = [];
            extensionPath = '/mock/extension/path';
            extensionUri = { fsPath: '/mock/extension/path' };
            globalState = {
                get: vi.fn(),
                update: vi.fn(),
                keys: vi.fn(() => [])
            };
            workspaceState = {
                get: vi.fn(),
                update: vi.fn(),
                keys: vi.fn(() => [])
            };
            storagePath = '/mock/storage';
            globalStoragePath = '/mock/global-storage';
            logPath = '/mock/logs';
        }
    };
});
