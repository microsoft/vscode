/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface IExtensionIdentifier {
	readonly id: string;
	readonly uuid?: string;
}

export interface ILanguagePack {
	readonly hash: string;
	readonly label: string | undefined;
	readonly extensions: {
		readonly extensionIdentifier: IExtensionIdentifier;
		readonly version: string;
	}[];
	readonly translations: Record<string, string | undefined>;
}

export type ILanguagePacks = Record<string, ILanguagePack | undefined>;

export interface INLSConfiguration {
	readonly userLocale: string;
	readonly osLocale: string;
	readonly availableLanguages: Record<string, string | undefined>;
	readonly pseudo?: boolean;
}

export interface IInternalNLSConfiguration extends INLSConfiguration {
	readonly _languagePackId: string;
	readonly _translationsConfigFile: string;
	readonly _cacheRoot: string;
	readonly _resolvedLanguagePackCoreLocation: string;
	readonly _corruptedFile: string;
	_languagePackSupport?: boolean;
}

export interface IResolveNLSConfigurationContext {

	/**
	 * Location where `nls.metadata.json`, `nls.messages.json`
	 * and `nls.keys.json` are stored.
	 */
	readonly nlsMetadataPath: string;

	/**
	 * Path to the user data directory. Used as a cache for
	 * language packs converted to the format we need.
	 */
	readonly userDataPath: string;

	/**
	 * Commit of the running application. Can be `undefined`
	 * when not built.
	 */
	readonly commit: string | undefined;

	/**
	 * Locale as defined in `argv.json` or `app.getLocale()`.
	 */
	readonly userLocale: string;

	/**
	 * Locale as defined by the OS (e.g. `app.getPreferredSystemLanguages()`).
	 */
	readonly osLocale: string;
}

export function resolveNLSConfiguration(context: IResolveNLSConfigurationContext): Promise<INLSConfiguration>;
