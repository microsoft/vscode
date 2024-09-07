/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference path="../../../typings/require.d.ts" />

//@ts-check
'use strict';

/**
 * @import { INLSConfiguration, ILanguagePacks } from '../../nls'
 * @import { IResolveNLSConfigurationContext } from './nls'
 */

// ESM-uncomment-begin
import * as path from 'path';
import * as fs from 'fs';
import * as perf from '../common/performance.js';

/** @type any */
const module = { exports: {} };
// ESM-uncomment-end

(function () {
	// ESM-comment-begin
	// const isESM = false;
	// ESM-comment-end
	// ESM-uncomment-begin
	const isESM = true;
	// ESM-uncomment-end

	/**
	 * @param {typeof import('path')} path
	 * @param {typeof import('fs')} fs
	 * @param {typeof import('../common/performance')} perf
	 */
	function factory(path, fs, perf) {

		//#region fs helpers

		/**
		 * @param {string} path
		 */
		async function exists(path) {
			try {
				await fs.promises.access(path);

				return true;
			} catch {
				return false;
			}
		}

		/**
		 * @param {string} path
		 */
		function touch(path) {
			const date = new Date();
			return fs.promises.utimes(path, date, date);
		}

		//#endregion

		/**
		 * The `languagepacks.json` file is a JSON file that contains all metadata
		 * about installed language extensions per language. Specifically, for
		 * core (`vscode`) and all extensions it supports, it points to the related
		 * translation files.
		 *
		 * The file is updated whenever a new language pack is installed or removed.
		 *
		 * @param {string} userDataPath
		 * @returns {Promise<ILanguagePacks | undefined>}
		 */
		async function getLanguagePackConfigurations(userDataPath) {
			const configFile = path.join(userDataPath, 'languagepacks.json');
			try {
				return JSON.parse(await fs.promises.readFile(configFile, 'utf-8'));
			} catch (err) {
				return undefined; // Do nothing. If we can't read the file we have no language pack config.
			}
		}

		/**
		 * @param {ILanguagePacks} languagePacks
		 * @param {string | undefined} locale
		 */
		function resolveLanguagePackLanguage(languagePacks, locale) {
			try {
				while (locale) {
					if (languagePacks[locale]) {
						return locale;
					}

					const index = locale.lastIndexOf('-');
					if (index > 0) {
						locale = locale.substring(0, index);
					} else {
						return undefined;
					}
				}
			} catch (error) {
				console.error('Resolving language pack configuration failed.', error);
			}

			return undefined;
		}

		/**
		 * @param {string} userLocale
		 * @param {string} osLocale
		 * @param {string} nlsMetadataPath
		 * @returns {INLSConfiguration}
		 */
		function defaultNLSConfiguration(userLocale, osLocale, nlsMetadataPath) {
			perf.mark('code/didGenerateNls');

			return {
				userLocale,
				osLocale,
				resolvedLanguage: 'en',
				defaultMessagesFile: path.join(nlsMetadataPath, 'nls.messages.json'),

				// NLS: below 2 are a relic from old times only used by vscode-nls and deprecated
				locale: userLocale,
				availableLanguages: {}
			};
		}

		/**
		 * @param {IResolveNLSConfigurationContext} context
		 * @returns {Promise<INLSConfiguration>}
		 */
		async function resolveNLSConfiguration({ userLocale, osLocale, userDataPath, commit, nlsMetadataPath }) {
			perf.mark('code/willGenerateNls');

			if (
				process.env['VSCODE_DEV'] ||
				userLocale === 'pseudo' ||
				userLocale.startsWith('en') ||
				!commit ||
				!userDataPath
			) {
				return defaultNLSConfiguration(userLocale, osLocale, nlsMetadataPath);
			}

			try {
				const languagePacks = await getLanguagePackConfigurations(userDataPath);
				if (!languagePacks) {
					return defaultNLSConfiguration(userLocale, osLocale, nlsMetadataPath);
				}

				const resolvedLanguage = resolveLanguagePackLanguage(languagePacks, userLocale);
				if (!resolvedLanguage) {
					return defaultNLSConfiguration(userLocale, osLocale, nlsMetadataPath);
				}

				const languagePack = languagePacks[resolvedLanguage];
				const mainLanguagePackPath = languagePack?.translations?.['vscode'];
				if (
					!languagePack ||
					typeof languagePack.hash !== 'string' ||
					!languagePack.translations ||
					typeof mainLanguagePackPath !== 'string' ||
					!(await exists(mainLanguagePackPath))
				) {
					return defaultNLSConfiguration(userLocale, osLocale, nlsMetadataPath);
				}

				const languagePackId = `${languagePack.hash}.${resolvedLanguage}`;
				const globalLanguagePackCachePath = path.join(userDataPath, 'clp', languagePackId);
				const commitLanguagePackCachePath = path.join(globalLanguagePackCachePath, commit);
				const languagePackMessagesFile = path.join(commitLanguagePackCachePath, 'nls.messages.json');
				const translationsConfigFile = path.join(globalLanguagePackCachePath, 'tcf.json');
				const languagePackCorruptMarkerFile = path.join(globalLanguagePackCachePath, 'corrupted.info');

				if (await exists(languagePackCorruptMarkerFile)) {
					await fs.promises.rm(globalLanguagePackCachePath, { recursive: true, force: true, maxRetries: 3 }); // delete corrupted cache folder
				}

				/** @type {INLSConfiguration} */
				const result = {
					userLocale,
					osLocale,
					resolvedLanguage,
					defaultMessagesFile: path.join(nlsMetadataPath, 'nls.messages.json'),
					languagePack: {
						translationsConfigFile,
						messagesFile: languagePackMessagesFile,
						corruptMarkerFile: languagePackCorruptMarkerFile
					},

					// NLS: below properties are a relic from old times only used by vscode-nls and deprecated
					locale: userLocale,
					availableLanguages: { '*': resolvedLanguage },
					_languagePackId: languagePackId,
					_languagePackSupport: true,
					_translationsConfigFile: translationsConfigFile,
					_cacheRoot: globalLanguagePackCachePath,
					_resolvedLanguagePackCoreLocation: commitLanguagePackCachePath,
					_corruptedFile: languagePackCorruptMarkerFile
				};

				if (await exists(commitLanguagePackCachePath)) {
					touch(commitLanguagePackCachePath).catch(() => { }); // We don't wait for this. No big harm if we can't touch
					perf.mark('code/didGenerateNls');
					return result;
				}

				/** @type {[unknown, Array<[string, string[]]>, string[], { contents: Record<string, Record<string, string>> }]} */
				//                          ^moduleId ^nlsKeys                               ^moduleId      ^nlsKey ^nlsValue
				const [
					,
					nlsDefaultKeys,
					nlsDefaultMessages,
					nlsPackdata
				] = await Promise.all([
					fs.promises.mkdir(commitLanguagePackCachePath, { recursive: true }),
					JSON.parse(await fs.promises.readFile(path.join(nlsMetadataPath, 'nls.keys.json'), 'utf-8')),
					JSON.parse(await fs.promises.readFile(path.join(nlsMetadataPath, 'nls.messages.json'), 'utf-8')),
					JSON.parse(await fs.promises.readFile(mainLanguagePackPath, 'utf-8'))
				]);

				/** @type {string[]} */
				const nlsResult = [];

				// We expect NLS messages to be in a flat array in sorted order as they
				// where produced during build time. We use `nls.keys.json` to know the
				// right order and then lookup the related message from the translation.
				// If a translation does not exist, we fallback to the default message.

				let nlsIndex = 0;
				for (const [moduleId, nlsKeys] of nlsDefaultKeys) {
					const moduleTranslations = nlsPackdata.contents[moduleId];
					for (const nlsKey of nlsKeys) {
						nlsResult.push(moduleTranslations?.[nlsKey] || nlsDefaultMessages[nlsIndex]);
						nlsIndex++;
					}
				}

				await Promise.all([
					fs.promises.writeFile(languagePackMessagesFile, JSON.stringify(nlsResult), 'utf-8'),
					fs.promises.writeFile(translationsConfigFile, JSON.stringify(languagePack.translations), 'utf-8')
				]);

				perf.mark('code/didGenerateNls');

				return result;
			} catch (error) {
				console.error('Generating translation files failed.', error);
			}

			return defaultNLSConfiguration(userLocale, osLocale, nlsMetadataPath);
		}

		return {
			resolveNLSConfiguration
		};
	}

	if (!isESM && typeof define === 'function') {
		// amd
		define(['path', 'fs', 'vs/base/common/performance'], function (/** @type {typeof import('path')} */ path, /** @type {typeof import('fs')} */ fs, /** @type {typeof import('../common/performance')} */ perf) { return factory(path, fs, perf); });
	} else if (typeof module === 'object' && typeof module.exports === 'object') {
		// commonjs
		// ESM-comment-begin
		// const path = require('path');
		// const fs = require('fs');
		// const perf = require('../common/performance');
		// ESM-comment-end
		module.exports = factory(path, fs, perf);
	} else {
		throw new Error('vs/base/node/nls defined in UNKNOWN context (neither requirejs or commonjs)');
	}
})();

// ESM-uncomment-begin
export const resolveNLSConfiguration = module.exports.resolveNLSConfiguration;
// ESM-uncomment-end
