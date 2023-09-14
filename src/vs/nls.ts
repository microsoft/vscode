/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

let isPseudo = (typeof document !== 'undefined' && document.location && document.location.hash.indexOf('pseudo=true') >= 0);
const DEFAULT_TAG = 'i-default';

interface INLSPluginConfig {
	availableLanguages?: INLSPluginConfigAvailableLanguages;
	loadBundle?: BundleLoader;
	translationServiceUrl?: string;
}

export interface INLSPluginConfigAvailableLanguages {
	'*'?: string;
	[module: string]: string | undefined;
}

interface BundleLoader {
	(bundle: string, locale: string | null, cb: (err: Error, messages: string[] | IBundledStrings) => void): void;
}

interface IBundledStrings {
	[moduleId: string]: string[];
}

export interface ILocalizeInfo {
	key: string;
	comment: string[];
}

interface ILocalizeFunc {
	(info: ILocalizeInfo, message: string, ...args: (string | number | boolean | undefined | null)[]): string;
	(key: string, message: string, ...args: (string | number | boolean | undefined | null)[]): string;
}

interface IBoundLocalizeFunc {
	(idx: number, defaultValue: null): string;
}

interface IConsumerAPI {
	localize: ILocalizeFunc | IBoundLocalizeFunc;
	getConfiguredDefaultLocale(stringFromLocalizeCall: string): string | undefined;
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

function findLanguageForModule(config: INLSPluginConfigAvailableLanguages, name: string) {
	let result = config[name];
	if (result) {
		return result;
	}
	result = config['*'];
	if (result) {
		return result;
	}
	return null;
}

function endWithSlash(path: string): string {
	if (path.charAt(path.length - 1) === '/') {
		return path;
	}
	return path + '/';
}

async function getMessagesFromTranslationsService(translationServiceUrl: string, language: string, name: string): Promise<string[] | IBundledStrings> {
	const url = endWithSlash(translationServiceUrl) + endWithSlash(language) + 'vscode/' + endWithSlash(name);
	const res = await fetch(url);
	if (res.ok) {
		const messages = await res.json() as string[] | IBundledStrings;
		return messages;
	}
	throw new Error(`${res.status} - ${res.statusText}`);
}

function createScopedLocalize(scope: string[]): IBoundLocalizeFunc {
	return function (idx: number, defaultValue: null) {
		const restArgs = Array.prototype.slice.call(arguments, 2);
		return _format(scope[idx], restArgs);
	};
}

/**
 * Localize a message.
 *
 * `message` can contain `{n}` notation where it is replaced by the nth value in `...args`
 * For example, `localize({ key: 'sayHello', comment: ['Welcomes user'] }, 'hello {0}', name)`
 */
export function localize(info: ILocalizeInfo, message: string, ...args: (string | number | boolean | undefined | null)[]): string;

/**
 * Localize a message.
 *
 * `message` can contain `{n}` notation where it is replaced by the nth value in `...args`
 * For example, `localize('sayHello', 'hello {0}', name)`
 */
export function localize(key: string, message: string, ...args: (string | number | boolean | undefined | null)[]): string;

/**
 * @skipMangle
 */
export function localize(data: ILocalizeInfo | string, message: string, ...args: (string | number | boolean | undefined | null)[]): string {
	return _format(message, args);
}

/**
 *
 * @param stringFromLocalizeCall You must pass in a string that was returned from a `nls.localize()` call
 * in order to ensure the loader plugin has been initialized before this function is called.
 */
export function getConfiguredDefaultLocale(stringFromLocalizeCall: string): string | undefined;
/**
 * @skipMangle
 */
export function getConfiguredDefaultLocale(_: string): string | undefined {
	// This returns undefined because this implementation isn't used and is overwritten by the loader
	// when loaded.
	return undefined;
}

/**
 * @skipMangle
 */
export function setPseudoTranslation(value: boolean) {
	isPseudo = value;
}

/**
 * Invoked in a built product at run-time
 * @skipMangle
 */
export function create(key: string, data: IBundledStrings & IConsumerAPI): IConsumerAPI {
	return {
		localize: createScopedLocalize(data[key]),
		getConfiguredDefaultLocale: data.getConfiguredDefaultLocale ?? ((_: string) => undefined)
	};
}

/**
 * Invoked by the loader at run-time
 * @skipMangle
 */
export function load(name: string, req: AMDLoader.IRelativeRequire, load: AMDLoader.IPluginLoadCallback, config: AMDLoader.IConfigurationOptions): void {
	const pluginConfig: INLSPluginConfig = config['vs/nls'] ?? {};
	if (!name || name.length === 0) {
		// TODO: We need to give back the mangled names here
		return load({
			localize: localize,
			getConfiguredDefaultLocale: () => pluginConfig.availableLanguages?.['*']
		});
	}
	const language = pluginConfig.availableLanguages ? findLanguageForModule(pluginConfig.availableLanguages, name) : null;
	const useDefaultLanguage = language === null || language === DEFAULT_TAG;
	let suffix = '.nls';
	if (!useDefaultLanguage) {
		suffix = suffix + '.' + language;
	}
	const messagesLoaded = (messages: string[] | IBundledStrings) => {
		if (Array.isArray(messages)) {
			(messages as any as IConsumerAPI).localize = createScopedLocalize(messages);
		} else {
			(messages as any as IConsumerAPI).localize = createScopedLocalize(messages[name]);
		}
		(messages as any as IConsumerAPI).getConfiguredDefaultLocale = () => pluginConfig.availableLanguages?.['*'];
		load(messages);
	};
	if (typeof pluginConfig.loadBundle === 'function') {
		(pluginConfig.loadBundle as BundleLoader)(name, language, (err: Error, messages) => {
			// We have an error. Load the English default strings to not fail
			if (err) {
				req([name + '.nls'], messagesLoaded);
			} else {
				messagesLoaded(messages);
			}
		});
	} else if (pluginConfig.translationServiceUrl && !useDefaultLanguage) {
		(async () => {
			try {
				const messages = await getMessagesFromTranslationsService(pluginConfig.translationServiceUrl!, language, name);
				return messagesLoaded(messages);
			} catch (err) {
				// Language is already as generic as it gets, so require default messages
				if (!language.includes('-')) {
					console.error(err);
					return req([name + '.nls'], messagesLoaded);
				}
				try {
					// Since there is a dash, the language configured is a specific sub-language of the same generic language.
					// Since we were unable to load the specific language, try to load the generic language. Ex. we failed to find a
					// Swiss German (de-CH), so try to load the generic German (de) messages instead.
					const genericLanguage = language.split('-')[0];
					const messages = await getMessagesFromTranslationsService(pluginConfig.translationServiceUrl!, genericLanguage, name);
					// We got some messages, so we configure the configuration to use the generic language for this session.
					pluginConfig.availableLanguages ??= {};
					pluginConfig.availableLanguages['*'] = genericLanguage;
					return messagesLoaded(messages);
				} catch (err) {
					console.error(err);
					return req([name + '.nls'], messagesLoaded);
				}
			}
		})();
	} else {
		req([name + suffix], messagesLoaded, (err: Error) => {
			if (suffix === '.nls') {
				console.error('Failed trying to load default language strings', err);
				return;
			}
			console.error(`Failed to load message bundle for language ${language}. Falling back to the default language:`, err);
			req([name + '.nls'], messagesLoaded);
		});
	}
}
