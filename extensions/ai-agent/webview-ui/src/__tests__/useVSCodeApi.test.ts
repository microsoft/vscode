/**
 * useVSCodeApi Hook Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ProgressState, TokenUsage } from '../stores/chatStore';

describe('useVSCodeApi', () => {
    let mockPostMessage: ReturnType<typeof vi.fn>;
    let mockGetState: ReturnType<typeof vi.fn>;
    let mockSetState: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        // Reset module cache to get fresh singleton
        vi.resetModules();

        // Create mock API
        mockPostMessage = vi.fn();
        mockGetState = vi.fn();
        mockSetState = vi.fn();

        (globalThis as any).acquireVsCodeApi = vi.fn(() => ({
            postMessage: mockPostMessage,
            getState: mockGetState,
            setState: mockSetState
        }));
    });

    afterEach(() => {
        delete (globalThis as any).acquireVsCodeApi;
        vi.restoreAllMocks();
    });

    describe('isInVSCode', () => {
        it('should be true when acquireVsCodeApi is available', async () => {
            const { useVSCodeApi } = await import('../hooks/useVSCodeApi');
            const { result } = renderHook(() => useVSCodeApi());
            expect(result.current.isInVSCode).toBe(true);
        });

        it('should be false when acquireVsCodeApi is not available', async () => {
            delete (globalThis as any).acquireVsCodeApi;

            const { useVSCodeApi } = await import('../hooks/useVSCodeApi');
            const { result } = renderHook(() => useVSCodeApi());
            expect(result.current.isInVSCode).toBe(false);
        });
    });

    describe('sendMessage', () => {
        it('should post send message type', async () => {
            const { useVSCodeApi } = await import('../hooks/useVSCodeApi');
            const { result } = renderHook(() => useVSCodeApi());

            act(() => {
                result.current.sendMessage('Hello');
            });

            expect(mockPostMessage).toHaveBeenCalledWith({
                type: 'send',
                data: 'Hello'
            });
        });
    });

    describe('switchPhase', () => {
        it('should post switch-phase message type', async () => {
            const { useVSCodeApi } = await import('../hooks/useVSCodeApi');
            const { result } = renderHook(() => useVSCodeApi());

            act(() => {
                result.current.switchPhase('design');
            });

            expect(mockPostMessage).toHaveBeenCalledWith({
                type: 'switch-phase',
                data: 'design'
            });
        });
    });

    describe('rollbackPhase', () => {
        it('should post phase-rollback message type', async () => {
            const { useVSCodeApi } = await import('../hooks/useVSCodeApi');
            const { result } = renderHook(() => useVSCodeApi());

            act(() => {
                result.current.rollbackPhase('implementation', 'design');
            });

            expect(mockPostMessage).toHaveBeenCalledWith({
                type: 'phase-rollback',
                data: { from: 'implementation', to: 'design' }
            });
        });
    });

    describe('cancel', () => {
        it('should post cancel message type', async () => {
            const { useVSCodeApi } = await import('../hooks/useVSCodeApi');
            const { result } = renderHook(() => useVSCodeApi());

            act(() => {
                result.current.cancel();
            });

            expect(mockPostMessage).toHaveBeenCalledWith({ type: 'cancel' });
        });
    });

    describe('retry', () => {
        it('should post retry message type', async () => {
            const { useVSCodeApi } = await import('../hooks/useVSCodeApi');
            const { result } = renderHook(() => useVSCodeApi());

            act(() => {
                result.current.retry();
            });

            expect(mockPostMessage).toHaveBeenCalledWith({ type: 'retry' });
        });
    });

    describe('getHistory', () => {
        it('should post get-history message type', async () => {
            const { useVSCodeApi } = await import('../hooks/useVSCodeApi');
            const { result } = renderHook(() => useVSCodeApi());

            act(() => {
                result.current.getHistory();
            });

            expect(mockPostMessage).toHaveBeenCalledWith({ type: 'get-history' });
        });
    });

    describe('clearHistory', () => {
        it('should post clear-history message type', async () => {
            const { useVSCodeApi } = await import('../hooks/useVSCodeApi');
            const { result } = renderHook(() => useVSCodeApi());

            act(() => {
                result.current.clearHistory();
            });

            expect(mockPostMessage).toHaveBeenCalledWith({ type: 'clear-history' });
        });
    });

    describe('signalReady', () => {
        it('should post ready message type', async () => {
            const { useVSCodeApi } = await import('../hooks/useVSCodeApi');
            const { result } = renderHook(() => useVSCodeApi());

            act(() => {
                result.current.signalReady();
            });

            expect(mockPostMessage).toHaveBeenCalledWith({ type: 'ready' });
        });
    });

    describe('message listener', () => {
        it('should call onMessage callback when receiving message', async () => {
            const { useVSCodeApi } = await import('../hooks/useVSCodeApi');
            const onMessage = vi.fn();
            renderHook(() => useVSCodeApi(onMessage));

            const testMessage = {
                type: 'message' as const,
                data: { id: '1', content: 'Test', sender: 'user', timestamp: '2024-01-01T00:00:00Z' }
            };

            act(() => {
                window.dispatchEvent(new MessageEvent('message', { data: testMessage }));
            });

            expect(onMessage).toHaveBeenCalledWith(testMessage);
        });

        it('should handle locale message', async () => {
            const { useVSCodeApi } = await import('../hooks/useVSCodeApi');
            const onMessage = vi.fn();
            renderHook(() => useVSCodeApi(onMessage));

            const localeMessage = { type: 'locale' as const, data: 'ja' };

            act(() => {
                window.dispatchEvent(new MessageEvent('message', { data: localeMessage }));
            });

            expect(onMessage).toHaveBeenCalledWith(localeMessage);
        });

        it('should handle progress message', async () => {
            const { useVSCodeApi } = await import('../hooks/useVSCodeApi');
            const onMessage = vi.fn();
            renderHook(() => useVSCodeApi(onMessage));

            const progressState: ProgressState = { type: 'thinking', message: 'Analyzing...' };
            const progressMessage = { type: 'progress' as const, data: progressState };

            act(() => {
                window.dispatchEvent(new MessageEvent('message', { data: progressMessage }));
            });

            expect(onMessage).toHaveBeenCalledWith(progressMessage);
        });

        it('should handle token-usage message', async () => {
            const { useVSCodeApi } = await import('../hooks/useVSCodeApi');
            const onMessage = vi.fn();
            renderHook(() => useVSCodeApi(onMessage));

            const tokenUsage: TokenUsage = { used: 28000, limit: 80000 };
            const tokenMessage = { type: 'token-usage' as const, data: tokenUsage };

            act(() => {
                window.dispatchEvent(new MessageEvent('message', { data: tokenMessage }));
            });

            expect(onMessage).toHaveBeenCalledWith(tokenMessage);
        });

        it('should cleanup listener on unmount', async () => {
            const { useVSCodeApi } = await import('../hooks/useVSCodeApi');
            const onMessage = vi.fn();
            const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

            const { unmount } = renderHook(() => useVSCodeApi(onMessage));
            unmount();

            expect(removeEventListenerSpy).toHaveBeenCalledWith('message', expect.any(Function));
        });
    });
});

describe('ExtensionMessage type', () => {
    it('should accept locale message', () => {
        const msg = { type: 'locale' as const, data: 'ja' };
        expect(msg.type).toBe('locale');
        expect(msg.data).toBe('ja');
    });

    it('should accept progress message with thinking state', () => {
        const msg = {
            type: 'progress' as const,
            data: { type: 'thinking' as const, message: 'Processing...' }
        };
        expect(msg.type).toBe('progress');
        expect(msg.data.type).toBe('thinking');
    });

    it('should accept progress message with searching state', () => {
        const msg = {
            type: 'progress' as const,
            data: { type: 'searching' as const, target: 'codebase' }
        };
        expect(msg.data.type).toBe('searching');
    });

    it('should accept progress message with reading state', () => {
        const msg = {
            type: 'progress' as const,
            data: { type: 'reading' as const, files: ['file1.ts', 'file2.ts'] }
        };
        expect(msg.data.type).toBe('reading');
    });

    it('should accept progress message with writing state', () => {
        const msg = {
            type: 'progress' as const,
            data: { type: 'writing' as const, files: ['output.ts'] }
        };
        expect(msg.data.type).toBe('writing');
    });

    it('should accept progress message with executing state', () => {
        const msg = {
            type: 'progress' as const,
            data: { type: 'executing' as const, command: 'npm test' }
        };
        expect(msg.data.type).toBe('executing');
    });

    it('should accept progress message with error state', () => {
        const msg = {
            type: 'progress' as const,
            data: { type: 'error' as const, message: 'Something failed' }
        };
        expect(msg.data.type).toBe('error');
    });

    it('should accept progress message with idle state', () => {
        const msg = {
            type: 'progress' as const,
            data: { type: 'idle' as const }
        };
        expect(msg.data.type).toBe('idle');
    });

    it('should accept token-usage message', () => {
        const msg = {
            type: 'token-usage' as const,
            data: { used: 45000, limit: 80000 }
        };
        expect(msg.type).toBe('token-usage');
        expect(msg.data.used).toBe(45000);
        expect(msg.data.limit).toBe(80000);
    });
});

describe('WebviewMessage type', () => {
    it('should accept phase-rollback message', () => {
        const msg = {
            type: 'phase-rollback' as const,
            data: { from: 'review', to: 'implementation' }
        };
        expect(msg.type).toBe('phase-rollback');
        expect(msg.data).toEqual({ from: 'review', to: 'implementation' });
    });
});
