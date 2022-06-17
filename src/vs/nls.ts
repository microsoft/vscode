/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

let isPseudo = (typeof document !== 'undefined' && document.location && document.location.hash.indexOf('pseudo=true') >= 0);
const DEFAULT_TAG = 'i-default';

interface INLSPluginConfig {
	availableLanguages?: INLSPluginConfigAvailableLanguages;
	loadBundle?: BundleLoader;
	baseUrl?: string;
}

interface INLSPluginConfigAvailableLanguages {
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

export function localize(data: ILocalizeInfo | string, message: string, ...args: (string | number | boolean | undefined | null)[]): string {
	return _format(message, args);
}

export function setPseudoTranslation(value: boolean) {
	isPseudo = value;
}

export function create(key: string, data: IBundledStrings): IConsumerAPI {
	return {
		localize: createScopedLocalize(data[key])
	};
}

export function load(name: string, req: AMDLoader.IRelativeRequire, load: AMDLoader.IPluginLoadCallback, config: AMDLoader.IConfigurationOptions): void {
	config = config || {};
	if (!name || name.length === 0) {
		load({
			localize: localize
		});
	} else {
		const pluginConfig = <INLSPluginConfig>(config['vs/nls'] || {});
		const language = pluginConfig.availableLanguages ? findLanguageForModule(pluginConfig.availableLanguages, name) : null;
		let suffix = '.nls';
		if (language !== null && language !== DEFAULT_TAG) {
			suffix = suffix + '.' + language;
		}
		const messagesLoaded = (messages: string[] | IBundledStrings) => {
			if (Array.isArray(messages)) {
				(messages as any as IConsumerAPI).localize = createScopedLocalize(messages);
			} else {
				(messages as any as IConsumerAPI).localize = createScopedLocalize(messages[name]);
			}
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
		} else {
			const base = pluginConfig.baseUrl ?? '';
			req([base + name + suffix], messagesLoaded, (err: Error) => {
				// We have an error. Load the English default strings instead.
				console.warn(`Falling back to default strings. Unable to load translations because of: ${err.message ?? err}`);
				req([name + '.nls'], messagesLoaded);
			});
		}
	}
}
