/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

let perf = require('./vs/base/common/performance');
perf.mark('main:started');

// Perf measurements
global.perfStartTime = Date.now();

let app = require('electron').app;
let fs = require('fs');
let path = require('path');
let minimist = require('minimist');
let paths = require('./paths');

let args = minimist(process.argv, {
	string: ['user-data-dir', 'locale']
});

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

let _commit;
function getCommit() {
	if (_commit) {
		return _commit;
	}
	if (_commit === null) {
		return undefined;
	}
	try {
		let productJson = require(path.join(__dirname, '../product.json'));
		if (productJson.commit) {
			_commit = productJson.commit;
		} else {
			_commit = null;
		}
	} catch (exp) {
		_commit = null;
	}
}

function mkdirp(dir) {
	return mkdir(dir)
		.then(null, (err) => {
			if (err && err.code === 'ENOENT') {
				let parent = path.dirname(dir);
				if (parent !== dir) { // if not arrived at root
					return mkdirp(parent)
						.then(() => {
							return mkdir(dir);
						});
				}
			}
			throw err;
		});
}

function mkdir(dir) {
	return new Promise((resolve, reject) => {
		fs.mkdir(dir, (err) => {
			if (err && err.code !== 'EEXIST') {
				reject(err);
			} else {
				resolve(dir);
			}
		});
	});
}

function exists(file) {
	return new Promise((resolve) => {
		fs.exists(file, (result) => {
			resolve(result);
		});
	});
}

function readFile(file) {
	return new Promise((resolve, reject) => {
		fs.readFile(file, 'utf8', (err, data) => {
			if (err) {
				reject(err);
				return;
			}
			resolve(data);
		});
	});
}

function writeFile(file, content) {
	return new Promise(function(resolve, reject) {
		fs.writeFile(file, content, 'utf8', (err) => {
			if (err) {
				reject(err);
				return;
			}
			resolve(undefined);
		});
	});
}

function generateLanguagePack(locale, sourceFolder, cacheFolder) {
	let filename =  path.join(__dirname, 'nls.metadata.json');
	return readFile(filename).then((content) => {
		let json = JSON.parse(content);
		let bundles = Object.keys(json.bundles);
		let writes = [];
		for (let bundle of bundles) {
			let modules = json.bundles[bundle];
			let target = Object.create(null);
			for (let module of modules) {
				let strings = json.messages[module];
				let targetStrings = [];
				for (let s of strings) {
					targetStrings.push('\uFF3B' + s.replace(/[aouei]/g, '$&$&') + '\uFF3D');
				}
				target[module] = targetStrings;
			}
			writes.push(writeFile(path.join(cacheFolder, bundle.replace(/\//g,'!') + '.nls.' + locale + '.json'), JSON.stringify(target)));
		}
		return Promise.all(writes);
	});
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

	let userData = app.getPath('userData');
	let localeConfig = path.join(userData, 'User', 'locale.json');
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

function getNLSConfiguration(locale) {
	if (locale === 'pseudo') {
		return Promise.resolve({ locale: locale, availableLanguages: {}, pseudo: true });
	}

	if (process.env['VSCODE_DEV']) {
		return Promise.resolve({ locale: locale, availableLanguages: {} });
	}

	let userData = app.getPath('userData');

	// This is temporay to test language packs until we have them installed via an extension.
	if (locale === 'lpTest') {
		let commit = getCommit();
		let cacheRoot = path.join(userData, 'CachedLanguagePacks');
		let cacheFolder = path.join(cacheRoot, 'vscode', commit, locale, 'core');
		return exists(cacheFolder).then((folderExists) => {
			let result = {
				locale: locale,
				availableLanguages: { '*': locale },
				_languagePackLocation: null,
				_cacheRoot: cacheRoot,
				_resolvedLanguagePackCoreLocation: cacheFolder,
				_resolvedLanguagePackExtensionLocation: path.join(cacheRoot, 'vscode', commit, locale, 'extensions')
			};
			if (folderExists) {
				return result;
			} else {
				return mkdirp(cacheFolder).then(() => {
					return generateLanguagePack(locale, '', cacheFolder).then(() => {
						return result;
					});
				});
			}
		});
	}

	// We have a built version so we have extracted nls file. Try to find
	// the right file to use.

	// Check if we have an English locale. If so fall to default since that is our
	// English translation (we don't ship *.nls.en.json files)
	if (locale && (locale == 'en' || locale.startsWith('en-'))) {
		return Promise.resolve({ locale: locale, availableLanguages: {} });
	}

	let initialLocale = locale;

	function resolveLocale(locale) {
		while (locale) {
			let candidate = path.join(__dirname, 'vs', 'code', 'electron-main', 'main.nls.') + locale + '.js';
			if (fs.existsSync(candidate)) {
				return { locale: initialLocale, availableLanguages: { '*': locale } };
			} else {
				let index = locale.lastIndexOf('-');
				if (index > 0) {
					locale = locale.substring(0, index);
				} else {
					locale = undefined;
				}
			}
		}
		return undefined;
	}

	let isCoreLangaguage = true;
	if (locale) {
		isCoreLangaguage = ['de', 'es', 'fr', 'it', 'ja', 'ko', 'ru', 'tr', 'zh-cn', 'zh-tw'].some((language) => {
			return locale === language || locale.startsWith(language + '-');
		});
	}

	if (isCoreLangaguage) {
		return Promise.resolve(resolveLocale(locale));
	} else {
		let defaultResult = Promise.resolve({ locale: locale, availableLanguages: {} });
		try {
			let commit = getCommit();
			if (!commit) {
				return defaultResult;
			}
			let lpFolder = path.join(userData, 'CachedLanguagePacks', commit, locale);
			return mkdirp(lpFolder).then(() => {
				// Check fo the language pack folder and generate the language pack files.
				return { locale: locale, availableLanguages: {}, location: lpFolder };
			});
		} catch (exp) {
			// Do nothing. Use English locale
			return defaultResult;
		}
	}
}

function getNodeCachedDataDir() {
	// flag to disable cached data support
	if (process.argv.indexOf('--no-cached-data') > 0) {
		return Promise.resolve(undefined);
	}

	// IEnvironmentService.isBuilt
	if (process.env['VSCODE_DEV']) {
		return Promise.resolve(undefined);
	}

	// find commit id
	let commit = getCommit();
	if (!commit) {
		return Promise.resolve(undefined);
	}

	let dir = path.join(app.getPath('userData'), 'CachedData', commit);

	return mkdirp(dir).then(undefined, function () { /*ignore*/ });
}

// Set userData path before app 'ready' event and call to process.chdir
let userData = path.resolve(args['user-data-dir'] || paths.getDefaultUserDataPath(process.platform));
app.setPath('userData', userData);

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


// use '<UserData>/CachedData'-directory to store
// node/v8 cached data.
let nodeCachedDataDir = getNodeCachedDataDir().then(function (value) {
	if (value) {
		// store the data directory
		process.env['VSCODE_NODE_CACHED_DATA_DIR_' + process.pid] = value;

		// tell v8 to not be lazy when parsing JavaScript. Generally this makes startup slower
		// but because we generate cached data it makes subsequent startups much faster
		app.commandLine.appendSwitch('--js-flags', '--nolazy');
	}
	return value;
});

let nlsConfiguration = undefined;
let userDefinedLocale = getUserDefinedLocale();
userDefinedLocale.then((locale) => {
	if (locale && !nlsConfiguration) {
		nlsConfiguration = getNLSConfiguration(locale);
	}
});

// Load our code once ready
app.once('ready', function () {
	perf.mark('main:appReady');
	Promise.all([nodeCachedDataDir, userDefinedLocale]).then((values) => {
		let locale = values[1];
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
					appLocale.toLowerCase();
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
