/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

const perf = require('./vs/base/common/performance');
perf.mark('main:started');

const fs = require('fs');
const path = require('path');
const bootstrap = require('./bootstrap');
const paths = require('./paths');
// @ts-ignore
const product = require('../product.json');
// @ts-ignore
const app = require('electron').app;

// Enable portable support
const portable = bootstrap.configurePortable();

// Enable ASAR support
bootstrap.enableASARSupport();

// Set userData path before app 'ready' event and call to process.chdir
const args = parseCLIArgs();
const userDataPath = getUserDataPath(args);

// global storage migration needs to happen very early before app.on("ready")
// TODO@Ben remove after a while
try {
	const globalStorageHome = path.join(userDataPath, 'User', 'globalStorage', 'state.vscdb');
	const localStorageHome = path.join(userDataPath, 'Local Storage');
	const localStorageDB = path.join(localStorageHome, 'file__0.localstorage');
	const localStorageDBBackup = path.join(localStorageHome, 'file__0.vscmig');
	if (!fs.existsSync(globalStorageHome) && fs.existsSync(localStorageDB)) {
		fs.renameSync(localStorageDB, localStorageDBBackup);
	}
} catch (error) {
	console.error(error);
}

app.setPath('userData', userDataPath);

// Update cwd based on environment and platform
setCurrentWorkingDirectory();

// Global app listeners
registerListeners();

/**
 * Support user defined locale
 *
 * @type {Promise}
 */
let nlsConfiguration = undefined;
const userDefinedLocale = getUserDefinedLocale();
userDefinedLocale.then((locale) => {
	if (locale && !nlsConfiguration) {
		nlsConfiguration = getNLSConfiguration(locale);
	}
});

// Configure command line switches
const nodeCachedDataDir = getNodeCachedDir();
configureCommandlineSwitches(args, nodeCachedDataDir);

// Load our code once ready
app.once('ready', function () {
	if (args['trace']) {
		// @ts-ignore
		const contentTracing = require('electron').contentTracing;

		const traceOptions = {
			categoryFilter: args['trace-category-filter'] || '*',
			traceOptions: args['trace-options'] || 'record-until-full,enable-sampling'
		};

		contentTracing.startRecording(traceOptions, () => onReady());
	} else {
		onReady();
	}
});

function onReady() {
	perf.mark('main:appReady');

	Promise.all([nodeCachedDataDir.ensureExists(), userDefinedLocale]).then(([cachedDataDir, locale]) => {
		if (locale && !nlsConfiguration) {
			nlsConfiguration = getNLSConfiguration(locale);
		}

		if (!nlsConfiguration) {
			nlsConfiguration = Promise.resolve(undefined);
		}

		// First, we need to test a user defined locale. If it fails we try the app locale.
		// If that fails we fall back to English.
		nlsConfiguration.then((nlsConfig) => {

			const startup = nlsConfig => {
				nlsConfig._languagePackSupport = true;
				process.env['VSCODE_NLS_CONFIG'] = JSON.stringify(nlsConfig);
				process.env['VSCODE_NODE_CACHED_DATA_DIR'] = cachedDataDir || '';

				// Load main in AMD
				require('./bootstrap-amd').load('vs/code/electron-main/main');
			};

			// We recevied a valid nlsConfig from a user defined locale
			if (nlsConfig) {
				startup(nlsConfig);
			}

			// Try to use the app locale. Please note that the app locale is only
			// valid after we have received the app ready event. This is why the
			// code is here.
			else {
				let appLocale = app.getLocale();
				if (!appLocale) {
					startup({ locale: 'en', availableLanguages: {} });
				} else {

					// See above the comment about the loader and case sensitiviness
					appLocale = appLocale.toLowerCase();

					getNLSConfiguration(appLocale).then((nlsConfig) => {
						if (!nlsConfig) {
							nlsConfig = { locale: appLocale, availableLanguages: {} };
						}

						startup(nlsConfig);
					});
				}
			}
		});
	}, console.error);
}

/**
 * @typedef {import('minimist').ParsedArgs} ParsedArgs
 *
 * @param {ParsedArgs} cliArgs
 * @param {{ jsFlags: () => string }} nodeCachedDataDir
 */
function configureCommandlineSwitches(cliArgs, nodeCachedDataDir) {

	// Force pre-Chrome-60 color profile handling (for https://github.com/Microsoft/vscode/issues/51791)
	// TODO@Ben check if future versions of Electron still support this flag
	app.commandLine.appendSwitch('disable-features', 'ColorCorrectRendering');

	// Support JS Flags
	const jsFlags = resolveJSFlags(cliArgs, nodeCachedDataDir.jsFlags());
	if (jsFlags) {
		app.commandLine.appendSwitch('--js-flags', jsFlags);
	}
}

/**
 * @param {ParsedArgs} cliArgs
 * @param {string[]} jsFlags
 * @returns {string}
 */
function resolveJSFlags(cliArgs, ...jsFlags) {

	// Add any existing JS flags we already got from the command line
	if (cliArgs['js-flags']) {
		jsFlags.push(cliArgs['js-flags']);
	}

	// Support max-memory flag
	if (cliArgs['max-memory'] && !/max_old_space_size=(\d+)/g.exec(cliArgs['js-flags'])) {
		jsFlags.push(`--max_old_space_size=${cliArgs['max-memory']}`);
	}

	return jsFlags.length > 0 ? jsFlags.join(' ') : null;
}

/**
 * @param {ParsedArgs} cliArgs
 *
 * @returns {string}
 */
function getUserDataPath(cliArgs) {
	if (portable.isPortable) {
		return path.join(portable.portableDataPath, 'user-data');
	}

	return path.resolve(cliArgs['user-data-dir'] || paths.getDefaultUserDataPath(process.platform));
}

/**
 * @returns {ParsedArgs}
 */
function parseCLIArgs() {
	const minimist = require('minimist');

	return minimist(process.argv, {
		string: [
			'user-data-dir',
			'locale',
			'js-flags',
			'max-memory'
		]
	});
}

function setCurrentWorkingDirectory() {
	try {
		if (process.platform === 'win32') {
			process.env['VSCODE_CWD'] = process.cwd(); // remember as environment letiable
			process.chdir(path.dirname(app.getPath('exe'))); // always set application folder as cwd
		} else if (process.env['VSCODE_CWD']) {
			process.chdir(process.env['VSCODE_CWD']);
		}
	} catch (err) {
		console.error(err);
	}
}

function registerListeners() {

	/**
	 * Mac: when someone drops a file to the not-yet running VSCode, the open-file event fires even before
	 * the app-ready event. We listen very early for open-file and remember this upon startup as path to open.
	 *
	 * @type {string[]}
	 */
	const macOpenFiles = [];
	global['macOpenFiles'] = macOpenFiles;
	app.on('open-file', function (event, path) {
		macOpenFiles.push(path);
	});

	/**
	 * React to open-url requests.
	 *
	 * @type {string[]}
	 */
	const openUrls = [];
	const onOpenUrl = function (event, url) {
		event.preventDefault();

		openUrls.push(url);
	};

	app.on('will-finish-launching', function () {
		app.on('open-url', onOpenUrl);
	});

	global['getOpenUrls'] = function () {
		app.removeListener('open-url', onOpenUrl);

		return openUrls;
	};
}

/**
 * @returns {{ jsFlags: () => string; ensureExists: () => Promise<string | void>, _compute: () => string; }}
 */
function getNodeCachedDir() {
	return new class {

		constructor() {
			this.value = this._compute();
		}

		jsFlags() {
			return this.value ? '--nolazy' : undefined;
		}

		ensureExists() {
			return mkdirp(this.value).then(() => this.value, () => { /*ignore*/ });
		}

		_compute() {
			if (process.argv.indexOf('--no-cached-data') > 0) {
				return undefined;
			}

			// IEnvironmentService.isBuilt
			if (process.env['VSCODE_DEV']) {
				return undefined;
			}

			// find commit id
			const commit = product.commit;
			if (!commit) {
				return undefined;
			}

			return path.join(userDataPath, 'CachedData', commit);
		}
	};
}

//#region NLS Support
/**
 * @param {string} content
 * @returns {string}
 */
function stripComments(content) {
	const regexp = /("(?:[^\\\"]*(?:\\.)?)*")|('(?:[^\\\']*(?:\\.)?)*')|(\/\*(?:\r?\n|.)*?\*\/)|(\/{2,}.*?(?:(?:\r?\n)|$))/g;

	return content.replace(regexp, function (match, m1, m2, m3, m4) {
		// Only one of m1, m2, m3, m4 matches
		if (m3) {
			// A block comment. Replace with nothing
			return '';
		} else if (m4) {
			// A line comment. If it ends in \r?\n then keep it.
			const length_1 = m4.length;
			if (length_1 > 2 && m4[length_1 - 1] === '\n') {
				return m4[length_1 - 2] === '\r' ? '\r\n' : '\n';
			}
			else {
				return '';
			}
		} else {
			// We match a string
			return match;
		}
	});
}

/**
 * @param {string} dir
 * @returns {Promise<string>}
 */
function mkdir(dir) {
	return new Promise((c, e) => fs.mkdir(dir, err => (err && err.code !== 'EEXIST') ? e(err) : c(dir)));
}

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
 * @param {string} file
 * @returns {Promise<object>}
 */
function lstat(file) {
	return new Promise((c, e) => fs.lstat(file, (err, stats) => err ? e(err) : c(stats)));
}

/**
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
function readdir(dir) {
	return new Promise((c, e) => fs.readdir(dir, (err, files) => err ? e(err) : c(files)));
}

/**
 * @param {string} dir
 * @returns {Promise<void>}
 */
function rmdir(dir) {
	return new Promise((c, e) => fs.rmdir(dir, err => err ? e(err) : c(undefined)));
}

/**
 * @param {string} file
 * @returns {Promise<void>}
 */
function unlink(file) {
	return new Promise((c, e) => fs.unlink(file, err => err ? e(err) : c(undefined)));
}

/**
 * @param {string} dir
 * @returns {Promise<string>}
 */
function mkdirp(dir) {
	return mkdir(dir).then(null, err => {
		if (err && err.code === 'ENOENT') {
			const parent = path.dirname(dir);

			if (parent !== dir) { // if not arrived at root
				return mkdirp(parent).then(() => mkdir(dir));
			}
		}

		throw err;
	});
}

/**
 * @param {string} location
 * @returns {Promise<void>}
 */
function rimraf(location) {
	return lstat(location).then(stat => {
		if (stat.isDirectory() && !stat.isSymbolicLink()) {
			return readdir(location)
				.then(children => Promise.all(children.map(child => rimraf(path.join(location, child)))))
				.then(() => rmdir(location));
		} else {
			return unlink(location);
		}
	}, err => {
		if (err.code === 'ENOENT') {
			return undefined;
		}
		throw err;
	});
}

// Language tags are case insensitive however an amd loader is case sensitive
// To make this work on case preserving & insensitive FS we do the following:
// the language bundles have lower case language tags and we always lower case
// the locale we receive from the user or OS.
/**
 * @returns {Promise<string>}
 */
function getUserDefinedLocale() {
	const locale = args['locale'];
	if (locale) {
		return Promise.resolve(locale.toLowerCase());
	}

	const localeConfig = path.join(userDataPath, 'User', 'locale.json');
	return exists(localeConfig).then((result) => {
		if (result) {
			return bootstrap.readFile(localeConfig).then((content) => {
				content = stripComments(content);
				try {
					const value = JSON.parse(content).locale;
					return value && typeof value === 'string' ? value.toLowerCase() : undefined;
				} catch (e) {
					return undefined;
				}
			});
		} else {
			return undefined;
		}
	});
}

/**
 * @returns {object}
 */
function getLanguagePackConfigurations() {
	const configFile = path.join(userDataPath, 'languagepacks.json');
	try {
		return require(configFile);
	} catch (err) {
		// Do nothing. If we can't read the file we have no
		// language pack config.
	}
	return undefined;
}

/**
 * @param {object} config
 * @param {string} locale
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
 * @param {string} locale
 */
function getNLSConfiguration(locale) {
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

	perf.mark('nlsGeneration:start');

	const defaultResult = function (locale) {
		perf.mark('nlsGeneration:end');
		return Promise.resolve({ locale: locale, availableLanguages: {} });
	};
	try {
		const commit = product.commit;
		if (!commit) {
			return defaultResult(initialLocale);
		}
		const configs = getLanguagePackConfigurations();
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
		return exists(mainPack).then((fileExists) => {
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
			return exists(corruptedFile).then((corrupted) => {
				// The nls cache directory is corrupted.
				let toDelete;
				if (corrupted) {
					toDelete = rimraf(cacheRoot);
				} else {
					toDelete = Promise.resolve(undefined);
				}
				return toDelete.then(() => {
					return exists(coreLocation).then((fileExists) => {
						if (fileExists) {
							// We don't wait for this. No big harm if we can't touch
							touch(coreLocation).catch(() => { });
							perf.mark('nlsGeneration:end');
							return result;
						}
						return mkdirp(coreLocation).then(() => {
							return Promise.all([bootstrap.readFile(path.join(__dirname, 'nls.metadata.json')), bootstrap.readFile(mainPack)]);
						}).then((values) => {
							const metadata = JSON.parse(values[0]);
							const packData = JSON.parse(values[1]).contents;
							const bundles = Object.keys(metadata.bundles);
							const writes = [];
							for (let bundle of bundles) {
								const modules = metadata.bundles[bundle];
								const target = Object.create(null);
								for (let module of modules) {
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
								writes.push(bootstrap.writeFile(path.join(coreLocation, bundle.replace(/\//g, '!') + '.nls.json'), JSON.stringify(target)));
							}
							writes.push(bootstrap.writeFile(translationsConfigFile, JSON.stringify(packConfig.translations)));
							return Promise.all(writes);
						}).then(() => {
							perf.mark('nlsGeneration:end');
							return result;
						}).catch((err) => {
							console.error('Generating translation files failed.', err);
							return defaultResult(locale);
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
//#endregion
