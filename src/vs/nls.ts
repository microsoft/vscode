/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns
import { getNLSLanguage, getNLSMessages } from 'vs/nls.messages';
// eslint-disable-next-line local/code-import-patterns
export { getNLSLanguage, getNLSMessages } from 'vs/nls.messages';

const isPseudo = getNLSLanguage() === 'pseudo' || (typeof document !== 'undefined' && document.location && document.location.hash.indexOf('pseudo=true') >= 0);

export interface ILocalizeInfo {
	key: string;
	comment: string[];
}

export interface ILocalizedString {
	original: string;
	value: string;
}

function _format(message: string, args: (string | number | boolean | undefined | null)[]): string {
	let result: string;

	if (args.length === 0) {
		result = message;
	} else {
		result = message.replace(/\{(\d+)\}/g, (match, rest) => {
			const index = rest[0];
			const arg = args[index];
			let result = match;
			if (typeof arg === 'string') {
				result = arg;
			} else if (typeof arg === 'number' || typeof arg === 'boolean' || arg === void 0 || arg === null) {
				result = String(arg);
			}
			return result;
		});
	}

	if (isPseudo) {
		// FF3B and FF3D is the Unicode zenkaku representation for [ and ]
		result = '\uFF3B' + result.replace(/[aouei]/g, '$&$&') + '\uFF3D';
	}

	return result;
}

/**
 * Marks a string to be localized. Returns the localized string.
 *
 * @param info The {@linkcode ILocalizeInfo} which describes the id and comments associated with the localized string.
 * @param message The string to localize
 * @param args The arguments to the string
 *
 * @note `message` can contain `{n}` notation where it is replaced by the nth value in `...args`
 * @example `localize({ key: 'sayHello', comment: ['Welcomes user'] }, 'hello {0}', name)`
 *
 * @returns string The localized string.
 */
export function localize(info: ILocalizeInfo, message: string, ...args: (string | number | boolean | undefined | null)[]): string;

/**
 * Marks a string to be localized. Returns the localized string.
 *
 * @param key The key to use for localizing the string
 * @param message The string to localize
 * @param args The arguments to the string
 *
 * @note `message` can contain `{n}` notation where it is replaced by the nth value in `...args`
 * @example For example, `localize('sayHello', 'hello {0}', name)`
 *
 * @returns string The localized string.
 */
export function localize(key: string, message: string, ...args: (string | number | boolean | undefined | null)[]): string;

/**
 * @skipMangle
 */
export function localize(data: ILocalizeInfo | string /* | number when built */, message: string /* | null when built */, ...args: (string | number | boolean | undefined | null)[]): string {
	if (typeof data === 'number') {
		return _format(lookupMessage(data, message), args);
	}
	return _format(message, args);
}

/**
 * Only used when built: Looks up the message in the global NLS table.
 * This table is being made available as a global through bootstrapping
 * depending on the target context.
 */
function lookupMessage(index: number, fallback: string | null): string {
	const message = getNLSMessages()?.[index];
	if (typeof message !== 'string') {
		if (typeof fallback === 'string') {
			return fallback;
		}
		throw new Error(`!!! NLS MISSING: ${index} !!!`);
	}
	return message;
}

/**
 * Marks a string to be localized. Returns an {@linkcode ILocalizedString}
 * which contains the localized string and the original string.
 *
 * @param info The {@linkcode ILocalizeInfo} which describes the id and comments associated with the localized string.
 * @param message The string to localize
 * @param args The arguments to the string
 *
 * @note `message` can contain `{n}` notation where it is replaced by the nth value in `...args`
 * @example `localize2({ key: 'sayHello', comment: ['Welcomes user'] }, 'hello {0}', name)`
 *
 * @returns ILocalizedString which contains the localized string and the original string.
 */
export function localize2(info: ILocalizeInfo, message: string, ...args: (string | number | boolean | undefined | null)[]): ILocalizedString;

/**
 * Marks a string to be localized. Returns an {@linkcode ILocalizedString}
 * which contains the localized string and the original string.
 *
 * @param key The key to use for localizing the string
 * @param message The string to localize
 * @param args The arguments to the string
 *
 * @note `message` can contain `{n}` notation where it is replaced by the nth value in `...args`
 * @example `localize('sayHello', 'hello {0}', name)`
 *
 * @returns ILocalizedString which contains the localized string and the original string.
 */
export function localize2(key: string, message: string, ...args: (string | number | boolean | undefined | null)[]): ILocalizedString;

/**
 * @skipMangle
 */
export function localize2(data: ILocalizeInfo | string /* | number when built */, originalMessage: string, ...args: (string | number | boolean | undefined | null)[]): ILocalizedString {
	let message: string;
	if (typeof data === 'number') {
		message = lookupMessage(data, originalMessage);
	} else {
		message = originalMessage;
	}

	const value = _format(message, args);

	return {
		value,
		original: originalMessage === message ? value : _format(originalMessage, args)
	};
}

export interface INLSLanguagePackConfiguration {

	/**
	 * The path to the translations config file that contains pointers to
	 * all message bundles for `main` and extensions.
	 */
	readonly translationsConfigFile: string;

	/**
	 * The path to the file containing the translations for this language
	 * pack as flat string array.
	 */
	readonly messagesFile: string;

	/**
	 * The path to the file that can be used to signal a corrupt language
	 * pack, for example when reading the `messagesFile` fails. This will
	 * instruct the application to re-create the cache on next startup.
	 */
	readonly corruptMarkerFile: string;
}

export interface INLSConfiguration {

	/**
	 * Locale as defined in `argv.json` or `app.getLocale()`.
	 */
	readonly userLocale: string;

	/**
	 * Locale as defined by the OS (e.g. `app.getPreferredSystemLanguages()`).
	 */
	readonly osLocale: string;

	/**
	 * The actual language of the UI that ends up being used considering `userLocale`
	 * and `osLocale`.
	 */
	readonly resolvedLanguage: string;

	/**
	 * Defined if a language pack is used that is not the
	 * default english language pack. This requires a language
	 * pack to be installed as extension.
	 */
	readonly languagePack?: INLSLanguagePackConfiguration;

	/**
	 * The path to the file containing the default english messages
	 * as flat string array. The file is only present in built
	 * versions of the application.
	 */
	readonly defaultMessagesFile: string;

	/**
	 * Below properties are deprecated and only there to continue support
	 * for `vscode-nls` module that depends on them.
	 * Refs https://github.com/microsoft/vscode-nls/blob/main/src/node/main.ts#L36-L46
	 */
	/** @deprecated */
	readonly locale: string;
	/** @deprecated */
	readonly availableLanguages: Record<string, string>;
	/** @deprecated */
	readonly _languagePackSupport?: boolean;
	/** @deprecated */
	readonly _languagePackId?: string;
	/** @deprecated */
	readonly _translationsConfigFile?: string;
	/** @deprecated */
	readonly _cacheRoot?: string;
	/** @deprecated */
	readonly _resolvedLanguagePackCoreLocation?: string;
	/** @deprecated */
	readonly _corruptedFile?: string;
}

export interface ILanguagePack {
	readonly hash: string;
	readonly label: string | undefined;
	readonly extensions: {
		readonly extensionIdentifier: { readonly id: string; readonly uuid?: string };
		readonly version: string;
	}[];
	readonly translations: Record<string, string | undefined>;
}

export type ILanguagePacks = Record<string, ILanguagePack | undefined>;
