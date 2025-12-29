/**
 * Locale Hook
 * Provides i18n support by listening to locale messages from the extension
 */

import { useState, useEffect, useCallback } from 'react';
import { messages, getSupportedLocale } from '../i18n/messages';

/**
 * Hook to get the current locale from VS Code
 * Listens for 'locale' messages from the extension
 */
export function useLocale(): string {
    const [locale, setLocale] = useState('en');

    useEffect(() => {
        const handler = (event: MessageEvent) => {
            if (event.data?.type === 'locale' && typeof event.data.data === 'string') {
                const supportedLocale = getSupportedLocale(event.data.data);
                setLocale(supportedLocale);
            }
        };

        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, []);

    return locale;
}

/**
 * Translate a key to the current locale
 * Supports parameter substitution with {paramName} syntax
 *
 * @param key - The message key to translate
 * @param locale - The locale to use
 * @param params - Optional parameters to substitute in the message
 * @returns The translated string, or the key if not found
 */
export function t(
    key: string,
    locale: string,
    params?: Record<string, string>
): string {
    // Get message from locale, fallback to English, then to key
    let text = messages[locale]?.[key] || messages['en']?.[key] || key;

    // Substitute parameters
    if (params) {
        Object.entries(params).forEach(([paramKey, paramValue]) => {
            text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), paramValue);
        });
    }

    return text;
}

/**
 * Hook that combines useLocale with t() for convenience
 * Returns a translate function bound to the current locale
 */
export function useTranslation(): {
    locale: string;
    t: (key: string, params?: Record<string, string>) => string;
} {
    const locale = useLocale();

    const translate = useCallback(
        (key: string, params?: Record<string, string>) => t(key, locale, params),
        [locale]
    );

    return { locale, t: translate };
}
