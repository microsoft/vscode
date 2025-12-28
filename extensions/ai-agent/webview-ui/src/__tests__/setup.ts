/**
 * Test Setup for Webview UI
 */

import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock VS Code API
vi.stubGlobal('acquireVsCodeApi', () => ({
    postMessage: vi.fn(),
    getState: vi.fn(),
    setState: vi.fn()
}));

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
    }))
});
