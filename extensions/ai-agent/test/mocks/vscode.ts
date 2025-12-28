/**
 * VS Code API Mock
 * Provides mock implementations for testing
 */

import { vi } from 'vitest';

export const mockWindow = {
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
            asWebviewUri: vi.fn((uri: any) => uri)
        },
        dispose: vi.fn(),
        onDidDispose: vi.fn(() => ({ dispose: vi.fn() }))
    }))
};

export const mockCommands = {
    registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
    executeCommand: vi.fn()
};

export const mockWorkspace = {
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
};

export class MockEventEmitter<T> {
    private listeners: Array<(e: T) => void> = [];

    event = (listener: (e: T) => void) => {
        this.listeners.push(listener);
        return { dispose: () => {
            const idx = this.listeners.indexOf(listener);
            if (idx >= 0) this.listeners.splice(idx, 1);
        }};
    };

    fire = (data: T) => {
        this.listeners.forEach(l => l(data));
    };

    dispose = () => {
        this.listeners = [];
    };
}

export const mockDisposable = {
    from: vi.fn((...disposables: any[]) => ({
        dispose: () => disposables.forEach(d => d.dispose?.())
    }))
};

export const mockUri = {
    file: vi.fn((path: string) => ({ fsPath: path, path })),
    parse: vi.fn((str: string) => ({ fsPath: str, path: str }))
};

export function createMockExtensionContext() {
    return {
        subscriptions: [] as any[],
        extensionPath: '/mock/extension/path',
        extensionUri: { fsPath: '/mock/extension/path' },
        globalState: {
            get: vi.fn(),
            update: vi.fn(),
            keys: vi.fn(() => [])
        },
        workspaceState: {
            get: vi.fn(),
            update: vi.fn(),
            keys: vi.fn(() => [])
        },
        storagePath: '/mock/storage',
        globalStoragePath: '/mock/global-storage',
        logPath: '/mock/logs'
    };
}

export function resetAllMocks() {
    vi.clearAllMocks();
}
