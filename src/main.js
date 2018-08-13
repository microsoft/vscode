/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

const perf = require('./vs/base/common/performance');
perf.mark('main:started');

Error.stackTraceLimit = 100; // increase number of stack frames (from 10, https://github.com/v8/v8/wiki/Stack-Trace-API)

const fs = require('fs');
const path = require('path');
const product = require('../product.json');
const appRoot = path.dirname(__dirname);

function getApplicationPath() {
	if (process.env['VSCODE_DEV']) {
		return appRoot;
	} else if (process.platform === 'darwin') {
		return path.dirname(path.dirname(path.dirname(appRoot)));
	} else {
		return path.dirname(path.dirname(appRoot));
	}
}

function getPortableDataPath() {
	if (process.env['VSCODE_PORTABLE']) {
		return process.env['VSCODE_PORTABLE'];
	}

	if (process.platform === 'win32' || process.platform === 'linux') {
		return path.join(getApplicationPath(), 'data');
	} else {
		const portableDataName = product.portable || `${product.applicationName}-portable-data`;
		return path.join(path.dirname(getApplicationPath()), portableDataName);
	}
}

const portableDataPath = getPortableDataPath();
const isPortable = fs.existsSync(portableDataPath);
const portableTempPath = path.join(portableDataPath, 'tmp');
const isTempPortable = isPortable && fs.existsSync(portableTempPath);

if (isPortable) {
	process.env['VSCODE_PORTABLE'] = portableDataPath;
} else {
	delete process.env['VSCODE_PORTABLE'];
}

if (isTempPortable) {
	process.env[process.platform === 'win32' ? 'TEMP' : 'TMPDIR'] = portableTempPath;
}

//#region Add support for using node_modules.asar
(function () {
	const path = require('path');
	const Module = require('module');
	const NODE_MODULES_PATH = path.join(__dirname, '../node_modules');
	const NODE_MODULES_ASAR_PATH = NODE_MODULES_PATH + '.asar';

	const originalResolveLookupPaths = Module._resolveLookupPaths;
	Module._resolveLookupPaths = function (request, parent, newReturn) {
		const result = originalResolveLookupPaths(request, parent, newReturn);

		const paths = newReturn ? result : result[1];
		for (let i = 0, len = paths.length; i < len; i++) {
			if (paths[i] === NODE_MODULES_PATH) {
				paths.splice(i, 0, NODE_MODULES_ASAR_PATH);
				break;
			}
		}

		return result;
	};
})();
//#endregion

const app = require('electron').app;

// TODO@Ben Electron 2.0.x: prevent localStorage migration from SQLite to LevelDB due to issues
app.commandLine.appendSwitch('disable-mojo-local-storage');

// TODO@Ben Electron 2.0.x: force srgb color profile (for https://github.com/Microsoft/vscode/issues/51791)
// This also seems to fix: https://github.com/Microsoft/vscode/issues/48043
app.commandLine.appendSwitch('force-color-profile', 'srgb');

const minimist = require('minimist');
const paths = require('./paths');

const args = minimist(process.argv, {
	string: [
		'user-data-dir',
		'locale',
		'js-flags',
		'max-memory'
	]
});

function getUserDataPath() {
	if (isPortable) {
		return path.join(portableDataPath, 'user-data');
	}

	return path.resolve(args['user-data-dir'] || paths.getDefaultUserDataPath(process.platform));
}

const userDataPath = getUserDataPath();

// Set userData path before app 'ready' event and call to process.chdir
app.setPath('userData', userDataPath);

//#region NLS
function stripComments(content) {
	let regexp = /("(?:[^\\\"]*(?:\\.)?)*")|('(?:[^\\\']*(?:\\.)?)*')|(\/\*(?:\r?\n|.)*?\*\/)|(\/{2,}.*?(?:(?:\r?\n)|$))/g;
	let result = content.replace(regexp, function (match, m1, m2, m3, m4) {
		// Only one of m1, m2, m3, m4 matches
		if (m3) {
			// A block comment. Replace with nothing
			return '';
		} else if (m4) {
			// A line comment. If it ends in \r?\n then keep it.
			let length_1 = m4.length;
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
	return result;
}

const mkdir = dir => new Promise((c, e) => fs.mkdir(dir, err => (err && err.code !== 'EEXIST') ? e(err) : c(dir)));
const exists = file => new Promise(c => fs.exists(file, c));
const readFile = file => new Promise((c, e) => fs.readFile(file, 'utf8', (err, data) => err ? e(err) : c(data)));
const writeFile = (file, content) => new Promise((c, e) => fs.writeFile(file, content, 'utf8', err => err ? e(err) : c()));
const touch = file => new Promise((c, e) => { const d = new Date(); fs.utimes(file, d, d, err => err ? e(err) : c()); });
const lstat = file => new Promise((c, e) => fs.lstat(file, (err, stats) => err ? e(err) : c(stats)));
const readdir = dir => new Promise((c, e) => fs.readdir(dir, (err, files) => err ? e(err) : c(files)));
const rmdir = dir => new Promise((c, e) => fs.rmdir(dir, err => err ? e(err) : c(undefined)));
const unlink = file => new Promise((c, e) => fs.unlink(file, err => err ? e(err) : c(undefined)));

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

function rimraf(location) {
	return lstat(location).then(stat => {
		if (stat.isDirectory() && !stat.isSymbolicLink()) {
			return readdir(location)
				.then(children => Promise.all(children.map(child => rimraf(path.join(location, child)))))
				.then(() => rmdir(location));
		} else {
			return unlink(location);
		}
	}, (err) => {
		if (err.code === 'ENOENT') {
			return void 0;
		}
		throw err;
	});
}

function resolveJSFlags(...jsFlags) {

	if (args['js-flags']) {
		jsFlags.push(args['js-flags']);
	}

	if (args['max-memory'] && !/max_old_space_size=(\d+)/g.exec(args['js-flags'])) {
		jsFlags.push(`--max_old_space_size=${args['max-memory']}`);
	}

	return jsFlags.length > 0 ? jsFlags.join(' ') : null;
}

// Language tags are case insensitve however an amd loader is case sensitive
// To make this work on case preserving & insensitive FS we do the following:
// the language bundles have lower case language tags and we always lower case
// the locale we receive from the user or OS.

function getUserDefinedLocale() {
	let locale = args['locale'];
	if (locale) {
		return Promise.resolve(locale.toLowerCase());
	}

	let localeConfig = path.join(userDataPath, 'User', 'locale.json');
	return exists(localeConfig).then((result) => {
		if (result) {
			return readFile(localeConfig).then((content) => {
				content = stripComments(content);
				try {
					let value = JSON.parse(content).locale;
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

function getLanguagePackConfigurations() {
	let configFile = path.join(userDataPath, 'languagepacks.json');
	try {
		return require(configFile);
	} catch (err) {
		// Do nothing. If we can't read the file we have no
		// language pack config.
	}
	return undefined;
}

function resolveLanguagePackLocale(config, locale) {
	try {
		while (locale) {
			if (config[locale]) {
				return locale;
			} else {
				let index = locale.lastIndexOf('-');
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

function getNLSConfiguration(locale) {
	if (locale === 'pseudo') {
		return Promise.resolve({ locale: locale, availableLanguages: {}, pseudo: true });
	}

	if (process.env['VSCODE_DEV']) {
		return Promise.resolve({ locale: locale, availableLanguages: {} });
	}

	// We have a built version so we have extracted nls file. Try to find
	// the right file to use.

	// Check if we have an English locale. If so fall to default since that is our
	// English translation (we don't ship *.nls.en.json files)
	if (locale && (locale == 'en' || locale.startsWith('en-'))) {
		return Promise.resolve({ locale: locale, availableLanguages: {} });
	}

	let initialLocale = locale;

	perf.mark('nlsGeneration:start');

	let defaultResult = function (locale) {
		perf.mark('nlsGeneration:end');
		return Promise.resolve({ locale: locale, availableLanguages: {} });
	};
	try {
		let commit = product.commit;
		if (!commit) {
			return defaultResult(initialLocale);
		}
		let configs = getLanguagePackConfigurations();
		if (!configs) {
			return defaultResult(initialLocale);
		}
		locale = resolveLanguagePackLocale(configs, locale);
		if (!locale) {
			return defaultResult(initialLocale);
		}
		let packConfig = configs[locale];
		let mainPack;
		if (!packConfig || typeof packConfig.hash !== 'string' || !packConfig.translations || typeof (mainPack = packConfig.translations['vscode']) !== 'string') {
			return defaultResult(initialLocale);
		}
		return exists(mainPack).then((fileExists) => {
			if (!fileExists) {
				return defaultResult(initialLocale);
			}
			let packId = packConfig.hash + '.' + locale;
			let cacheRoot = path.join(userDataPath, 'clp', packId);
			let coreLocation = path.join(cacheRoot, commit);
			let translationsConfigFile = path.join(cacheRoot, 'tcf.json');
			let corruptedFile = path.join(cacheRoot, 'corrupted.info');
			let result = {
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
							return Promise.all([readFile(path.join(__dirname, 'nls.metadata.json')), readFile(mainPack)]);
						}).then((values) => {
							let metadata = JSON.parse(values[0]);
							let packData = JSON.parse(values[1]).contents;
							let bundles = Object.keys(metadata.bundles);
							let writes = [];
							for (let bundle of bundles) {
								let modules = metadata.bundles[bundle];
								let target = Object.create(null);
								for (let module of modules) {
									let keys = metadata.keys[module];
									let defaultMessages = metadata.messages[module];
									let translations = packData[module];
									let targetStrings;
									if (translations) {
										targetStrings = [];
										for (let i = 0; i < keys.length; i++) {
											let elem = keys[i];
											let key = typeof elem === 'string' ? elem : elem.key;
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

//#region Cached Data Dir
const nodeCachedDataDir = new class {

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
		let commit = product.commit;
		if (!commit) {
			return undefined;
		}
		return path.join(userDataPath, 'CachedData', commit);
	}
};

//#endregion

// Update cwd based on environment and platform
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

// Mac: when someone drops a file to the not-yet running VSCode, the open-file event fires even before
// the app-ready event. We listen very early for open-file and remember this upon startup as path to open.
global.macOpenFiles = [];
app.on('open-file', function (event, path) {
	global.macOpenFiles.push(path);
});

let openUrls = [];
let onOpenUrl = function (event, url) {
	event.preventDefault();
	openUrls.push(url);
};

app.on('will-finish-launching', function () {
	app.on('open-url', onOpenUrl);
});

global.getOpenUrls = function () {
	app.removeListener('open-url', onOpenUrl);
	return openUrls;
};


let nlsConfiguration = undefined;
let userDefinedLocale = getUserDefinedLocale();
userDefinedLocale.then((locale) => {
	if (locale && !nlsConfiguration) {
		nlsConfiguration = getNLSConfiguration(locale);
	}
});

let jsFlags = resolveJSFlags(nodeCachedDataDir.jsFlags());
if (jsFlags) {
	app.commandLine.appendSwitch('--js-flags', jsFlags);
}

// Load our code once ready
app.once('ready', function () {
	perf.mark('main:appReady');
	Promise.all([nodeCachedDataDir.ensureExists(), userDefinedLocale]).then(([cachedDataDir, locale]) => {
		if (locale && !nlsConfiguration) {
			nlsConfiguration = getNLSConfiguration(locale);
		}
		if (!nlsConfiguration) {
			nlsConfiguration = Promise.resolve(undefined);
		}
		// We first need to test a user defined locale. If it fails we try the app locale.
		// If that fails we fall back to English.
		nlsConfiguration.then((nlsConfig) => {
			let boot = (nlsConfig) => {
				process.env['VSCODE_NLS_CONFIG'] = JSON.stringify(nlsConfig);
				if (cachedDataDir) process.env['VSCODE_NODE_CACHED_DATA_DIR_' + process.pid] = cachedDataDir;
				require('./bootstrap-amd').bootstrap('vs/code/electron-main/main');
			};
			// We recevied a valid nlsConfig from a user defined locale
			if (nlsConfig) {
				boot(nlsConfig);
			} else {
				// Try to use the app locale. Please note that the app locale is only
				// valid after we have received the app ready event. This is why the
				// code is here.
				let appLocale = app.getLocale();
				if (!appLocale) {
					boot({ locale: 'en', availableLanguages: {} });
				} else {
					// See above the comment about the loader and case sensitiviness
					appLocale = appLocale.toLowerCase();
					getNLSConfiguration(appLocale).then((nlsConfig) => {
						if (!nlsConfig) {
							nlsConfig = { locale: appLocale, availableLanguages: {} };
						}
						boot(nlsConfig);
					});
				}
			}
		});
	}, console.error);
});
