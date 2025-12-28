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
            }))
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
            workspaceFolders: []
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
            from: vi.fn()
        },
        Uri: {
            file: vi.fn((path: string) => ({ fsPath: path, path })),
            parse: vi.fn()
        },
        ExtensionContext: class MockExtensionContext {
            subscriptions: any[] = [];
            extensionPath = '/mock/extension/path';
            globalState = {
                get: vi.fn(),
                update: vi.fn()
            };
            workspaceState = {
                get: vi.fn(),
                update: vi.fn()
            };
        }
    };
});
