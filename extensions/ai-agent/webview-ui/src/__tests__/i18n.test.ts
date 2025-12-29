/**
 * i18n Tests
 * Tests for internationalization utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { messages, getSupportedLocale } from '../i18n/messages';
import { t, useLocale, useTranslation } from '../hooks/useLocale';

describe('messages', () => {
    it('should have English messages defined', () => {
        expect(messages.en).toBeDefined();
        expect(messages.en.tokenUsageTooltip).toBeDefined();
        expect(messages.en.phaseRollbackTitle).toBeDefined();
    });

    it('should have Japanese messages defined', () => {
        expect(messages.ja).toBeDefined();
        expect(messages.ja.tokenUsageTooltip).toBeDefined();
        expect(messages.ja.phaseRollbackTitle).toBeDefined();
    });

    it('should have same keys in both languages', () => {
        const enKeys = Object.keys(messages.en).sort();
        const jaKeys = Object.keys(messages.ja).sort();
        expect(enKeys).toEqual(jaKeys);
    });
});

describe('getSupportedLocale', () => {
    it('should return "en" for English locale', () => {
        expect(getSupportedLocale('en')).toBe('en');
        expect(getSupportedLocale('en-US')).toBe('en');
        expect(getSupportedLocale('en-GB')).toBe('en');
    });

    it('should return "ja" for Japanese locale', () => {
        expect(getSupportedLocale('ja')).toBe('ja');
        expect(getSupportedLocale('ja-JP')).toBe('ja');
    });

    it('should fallback to "en" for unsupported locales', () => {
        expect(getSupportedLocale('fr')).toBe('en');
        expect(getSupportedLocale('de')).toBe('en');
        expect(getSupportedLocale('zh-CN')).toBe('en');
        expect(getSupportedLocale('unknown')).toBe('en');
    });
});

describe('t() function', () => {
    it('should return English message for "en" locale', () => {
        const result = t('cancel', 'en');
        expect(result).toBe('Cancel');
    });

    it('should return Japanese message for "ja" locale', () => {
        const result = t('cancel', 'ja');
        expect(result).toBe('キャンセル');
    });

    it('should fallback to English for unknown locale', () => {
        const result = t('cancel', 'fr');
        expect(result).toBe('Cancel');
    });

    it('should return key if message not found', () => {
        const result = t('unknownKey', 'en');
        expect(result).toBe('unknownKey');
    });

    it('should substitute parameters in English', () => {
        const result = t('phaseRollbackMessage', 'en', {
            from: 'Implementation',
            to: 'Design'
        });
        expect(result).toBe('Going back from Implementation to Design.');
    });

    it('should substitute parameters in Japanese', () => {
        const result = t('phaseRollbackMessage', 'ja', {
            from: '実装',
            to: '設計'
        });
        expect(result).toBe('実装から設計に戻ります。');
    });

    it('should handle multiple occurrences of same parameter', () => {
        // Create a test case with repeated parameter
        const result = t('searching', 'en', { target: 'codebase' });
        expect(result).toBe('Searching codebase...');
    });

    it('should leave unmatched parameters as-is', () => {
        const result = t('phaseRollbackMessage', 'en', { from: 'Test' });
        expect(result).toContain('Test');
        expect(result).toContain('{to}');
    });
});

describe('useLocale hook', () => {
    let messageHandler: ((event: MessageEvent) => void) | null = null;

    beforeEach(() => {
        // Capture the message event handler
        vi.spyOn(window, 'addEventListener').mockImplementation((type, handler) => {
            if (type === 'message') {
                messageHandler = handler as (event: MessageEvent) => void;
            }
        });
        vi.spyOn(window, 'removeEventListener').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        messageHandler = null;
    });

    it('should initialize with "en" locale', () => {
        const { result } = renderHook(() => useLocale());
        expect(result.current).toBe('en');
    });

    it('should update locale when receiving locale message', () => {
        const { result } = renderHook(() => useLocale());

        expect(result.current).toBe('en');

        // Simulate receiving locale message
        act(() => {
            if (messageHandler) {
                messageHandler({ data: { type: 'locale', data: 'ja' } } as MessageEvent);
            }
        });

        expect(result.current).toBe('ja');
    });

    it('should handle locale with region code', () => {
        const { result } = renderHook(() => useLocale());

        act(() => {
            if (messageHandler) {
                messageHandler({ data: { type: 'locale', data: 'ja-JP' } } as MessageEvent);
            }
        });

        expect(result.current).toBe('ja');
    });

    it('should fallback to "en" for unsupported locale', () => {
        const { result } = renderHook(() => useLocale());

        act(() => {
            if (messageHandler) {
                messageHandler({ data: { type: 'locale', data: 'fr-FR' } } as MessageEvent);
            }
        });

        expect(result.current).toBe('en');
    });

    it('should ignore non-locale messages', () => {
        const { result } = renderHook(() => useLocale());

        act(() => {
            if (messageHandler) {
                messageHandler({ data: { type: 'other', data: 'ja' } } as MessageEvent);
            }
        });

        expect(result.current).toBe('en');
    });

    it('should cleanup event listener on unmount', () => {
        const { unmount } = renderHook(() => useLocale());
        unmount();

        expect(window.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    });
});

describe('useTranslation hook', () => {
    let messageHandler: ((event: MessageEvent) => void) | null = null;

    beforeEach(() => {
        vi.spyOn(window, 'addEventListener').mockImplementation((type, handler) => {
            if (type === 'message') {
                messageHandler = handler as (event: MessageEvent) => void;
            }
        });
        vi.spyOn(window, 'removeEventListener').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        messageHandler = null;
    });

    it('should return locale and t function', () => {
        const { result } = renderHook(() => useTranslation());

        expect(result.current.locale).toBe('en');
        expect(typeof result.current.t).toBe('function');
    });

    it('should translate using current locale', () => {
        const { result } = renderHook(() => useTranslation());

        expect(result.current.t('cancel')).toBe('Cancel');

        act(() => {
            if (messageHandler) {
                messageHandler({ data: { type: 'locale', data: 'ja' } } as MessageEvent);
            }
        });

        expect(result.current.t('cancel')).toBe('キャンセル');
    });

    it('should handle parameters in translation', () => {
        const { result } = renderHook(() => useTranslation());

        const text = result.current.t('searching', { target: 'files' });
        expect(text).toBe('Searching files...');
    });
});
