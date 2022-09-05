/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference path="../../../typings/require.d.ts" />

//@ts-check
(function () {
	'use strict';

	/**
	 * @param {NodeRequire} nodeRequire
	 * @param {typeof import('path')} path
	 * @param {typeof import('fs')} fs
	 * @param {typeof import('../common/performance')} perf
	 */
	function factory(nodeRequire, path, fs, perf) {

		/**
		 * @param {string} file
		 * @returns {Promise<boolean>}
		 */
		function exists(file) {
			return new Promise(c => fs.exists(file, c));
		}

		/**
		 * @param {string} file
		 * @returns {Promise<void>}
		 */
		function touch(file) {
			return new Promise((c, e) => { const d = new Date(); fs.utimes(file, d, d, err => err ? e(err) : c()); });
		}

		/**
		 * @param {string} dir
		 * @returns {Promise<string>}
		 */
		function mkdirp(dir) {
			return new Promise((c, e) => fs.mkdir(dir, { recursive: true }, err => (err && err.code !== 'EEXIST') ? e(err) : c(dir)));
		}

		/**
		 * @param {string} location
		 * @returns {Promise<void>}
		 */
		function rimraf(location) {
			return new Promise((c, e) => fs.rm(location, { recursive: true, force: true, maxRetries: 3 }, err => err ? e(err) : c()));
		}

		/**
		 * @param {string} file
		 * @returns {Promise<string>}
		 */
		function readFile(file) {
			return new Promise((c, e) => fs.readFile(file, 'utf8', (err, data) => err ? e(err) : c(data)));
		}

		/**
		 * @param {string} file
		 * @param {string} content
		 * @returns {Promise<void>}
		 */
		function writeFile(file, content) {
			return new Promise((c, e) => fs.writeFile(file, content, 'utf8', err => err ? e(err) : c()));
		}

		/**
		 * @param {string} userDataPath
		 * @returns {Promise<object | undefined>}
		 */
		async function getLanguagePackConfigurations(userDataPath) {
			const configFile = path.join(userDataPath, 'languagepacks.json');
			try {
				return JSON.parse(await readFile(configFile));
			} catch (err) {
				// Do nothing. If we can't read the file we have no
				// language pack config.
			}
			return undefined;
		}

		/**
		 * @param {object} config
		 * @param {string | undefined} locale
		 */
		function resolveLanguagePackLocale(config, locale) {
			try {
				while (locale) {
					if (config[locale]) {
						return locale;
					} else {
						const index = locale.lastIndexOf('-');
						if (index > 0) {
							locale = locale.substring(0, index);
						} else {
							return undefined;
						}
					}
				}
			} catch (err) {
				console.error('Resolving language pack configuration failed.', err);
			}
			return undefined;
		}

		/**
		 * @param {string} commit
		 * @param {string} userDataPath
		 * @param {string} metaDataFile
		 * @param {string | undefined} locale
		 */
		function getNLSConfiguration(commit, userDataPath, metaDataFile, locale) {
			if (locale === 'pseudo') {
				return Promise.resolve({ locale: locale, availableLanguages: {}, pseudo: true });
			}

			if (process.env['VSCODE_DEV']) {
				return Promise.resolve({ locale: locale, availableLanguages: {} });
			}

			// We have a built version so we have extracted nls file. Try to find
			// the right file to use.

			// Check if we have an English or English US locale. If so fall to default since that is our
			// English translation (we don't ship *.nls.en.json files)
			if (locale && (locale === 'en' || locale === 'en-us')) {
				return Promise.resolve({ locale: locale, availableLanguages: {} });
			}

			const initialLocale = locale;

			perf.mark('code/willGenerateNls');

			const defaultResult = function (locale) {
				perf.mark('code/didGenerateNls');
				return Promise.resolve({ locale: locale, availableLanguages: {} });
			};
			try {
				if (!commit) {
					return defaultResult(initialLocale);
				}
				return getLanguagePackConfigurations(userDataPath).then(configs => {
					if (!configs) {
						return defaultResult(initialLocale);
					}
					locale = resolveLanguagePackLocale(configs, locale);
					if (!locale) {
						return defaultResult(initialLocale);
					}
					const packConfig = configs[locale];
					let mainPack;
					if (!packConfig || typeof packConfig.hash !== 'string' || !packConfig.translations || typeof (mainPack = packConfig.translations['vscode']) !== 'string') {
						return defaultResult(initialLocale);
					}
					return exists(mainPack).then(fileExists => {
						if (!fileExists) {
							return defaultResult(initialLocale);
						}
						const packId = packConfig.hash + '.' + locale;
						const cacheRoot = path.join(userDataPath, 'clp', packId);
						const coreLocation = path.join(cacheRoot, commit);
						const translationsConfigFile = path.join(cacheRoot, 'tcf.json');
						const corruptedFile = path.join(cacheRoot, 'corrupted.info');
						const result = {
							locale: initialLocale,
							availableLanguages: { '*': locale },
							_languagePackId: packId,
							_translationsConfigFile: translationsConfigFile,
							_cacheRoot: cacheRoot,
							_resolvedLanguagePackCoreLocation: coreLocation,
							_corruptedFile: corruptedFile
						};
						return exists(corruptedFile).then(corrupted => {
							// The nls cache directory is corrupted.
							let toDelete;
							if (corrupted) {
								toDelete = rimraf(cacheRoot);
							} else {
								toDelete = Promise.resolve(undefined);
							}
							return toDelete.then(() => {
								return exists(coreLocation).then(fileExists => {
									if (fileExists) {
										// We don't wait for this. No big harm if we can't touch
										touch(coreLocation).catch(() => { });
										perf.mark('code/didGenerateNls');
										return result;
									}
									return mkdirp(coreLocation).then(() => {
										return Promise.all([readFile(metaDataFile), readFile(mainPack)]);
									}).then(values => {
										const metadata = JSON.parse(values[0]);
										const packData = JSON.parse(values[1]).contents;
										const bundles = Object.keys(metadata.bundles);
										const writes = [];
										for (const bundle of bundles) {
											const modules = metadata.bundles[bundle];
											const target = Object.create(null);
											for (const module of modules) {
												const keys = metadata.keys[module];
												const defaultMessages = metadata.messages[module];
												const translations = packData[module];
												let targetStrings;
												if (translations) {
													targetStrings = [];
													for (let i = 0; i < keys.length; i++) {
														const elem = keys[i];
														const key = typeof elem === 'string' ? elem : elem.key;
														let translatedMessage = translations[key];
														if (translatedMessage === undefined) {
															translatedMessage = defaultMessages[i];
														}
														targetStrings.push(translatedMessage);
													}
												} else {
													targetStrings = defaultMessages;
												}
												target[module] = targetStrings;
											}
											writes.push(writeFile(path.join(coreLocation, bundle.replace(/\//g, '!') + '.nls.json'), JSON.stringify(target)));
										}
										writes.push(writeFile(translationsConfigFile, JSON.stringify(packConfig.translations)));
										return Promise.all(writes);
									}).then(() => {
										perf.mark('code/didGenerateNls');
										return result;
									}).catch(err => {
										console.error('Generating translation files failed.', err);
										return defaultResult(locale);
									});
								});
							});
						});
					});
				});
			} catch (err) {
				console.error('Generating translation files failed.', err);
				return defaultResult(locale);
			}
		}

		return {
			getNLSConfiguration
		};
	}

	if (typeof define === 'function') {
		// amd
		define(['require', 'path', 'fs', 'vs/base/common/performance'], function (require, /** @type {typeof import('path')} */ path, /** @type {typeof import('fs')} */ fs, /** @type {typeof import('../common/performance')} */ perf) { return factory(require.__$__nodeRequire, path, fs, perf); });
	} else if (typeof module === 'object' && typeof module.exports === 'object') {
		const path = require('path');
		const fs = require('fs');
		const perf = require('../common/performance');
		module.exports = factory(require, path, fs, perf);
	} else {
		throw new Error('Unknown context');
	}
}());
