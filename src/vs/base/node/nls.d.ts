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
	readonly userLocale: string;
	readonly osLocale: string;

	readonly availableLanguages: Record<string, string | undefined>;

	/**
	 * Defined if a language pack is used that is not the
	 * default english language pack.
	 */
	readonly languagePack?: INLSLanguagePackConfiguration;

	/**
	 * The path to the file containing the default english messages
	 * as flat string array.
	 */
	readonly defaultMessagesFile: string;

	readonly pseudo?: boolean;
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
