/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const NEMOTRON_LOCALES = new Set([
	'ar-AR', 'bg-BG', 'cs-CZ', 'da-DK', 'de-DE', 'en-GB', 'en-US', 'es-ES',
	'es-US', 'et-EE', 'fi-FI', 'fr-CA', 'fr-FR', 'hi-IN', 'hr-HR', 'hu-HU',
	'it-IT', 'ja-JP', 'ko-KR', 'nb-NO', 'nl-NL', 'pl-PL', 'pt-BR', 'pt-PT',
	'ro-RO', 'ru-RU', 'sk-SK', 'sv-SE', 'tr-TR', 'uk-UA', 'vi-VN', 'zh-CN',
]);

const NEMOTRON_DEFAULT_LOCALE_BY_LANGUAGE: Readonly<Record<string, string>> = {
	ar: 'ar-AR',
	bg: 'bg-BG',
	cs: 'cs-CZ',
	da: 'da-DK',
	de: 'de-DE',
	en: 'en-US',
	es: 'es-US',
	et: 'et-EE',
	fi: 'fi-FI',
	fr: 'fr-FR',
	hi: 'hi-IN',
	hr: 'hr-HR',
	hu: 'hu-HU',
	it: 'it-IT',
	ja: 'ja-JP',
	ko: 'ko-KR',
	nb: 'nb-NO',
	nl: 'nl-NL',
	pl: 'pl-PL',
	pt: 'pt-PT',
	ro: 'ro-RO',
	ru: 'ru-RU',
	sk: 'sk-SK',
	sv: 'sv-SE',
	tr: 'tr-TR',
	uk: 'uk-UA',
	vi: 'vi-VN',
	zh: 'zh-CN',
};

/**
 * Resolve the on-device dictation language using the same setting semantics as
 * Voice Mode. Automatic follows the browser locale when Nemotron supports it,
 * then falls back to the model's language detection.
 */
export function resolveDictationLanguage(configuredLanguage: unknown, browserLanguage: string | undefined): string {
	const configured = typeof configuredLanguage === 'string' ? configuredLanguage.trim() : '';
	const candidate = configured && configured.toLowerCase() !== 'auto' ? configured : browserLanguage;
	if (!candidate || typeof Intl.getCanonicalLocales !== 'function') {
		return 'auto';
	}

	try {
		const canonical = Intl.getCanonicalLocales(candidate)[0];
		if (NEMOTRON_LOCALES.has(canonical)) {
			return canonical;
		}
		return NEMOTRON_DEFAULT_LOCALE_BY_LANGUAGE[canonical.split('-')[0]] ?? 'auto';
	} catch {
		return 'auto';
	}
}
