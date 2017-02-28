/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

// Perf measurements
global.perfStartTime = Date.now();

var app = require('electron').app;
var fs = require('fs');
var path = require('path');
var minimist = require('minimist');
var paths = require('./paths');

var args = minimist(process.argv, {
	string: ['user-data-dir', 'locale']
});

function stripComments(content) {
	var regexp = /("(?:[^\\\"]*(?:\\.)?)*")|('(?:[^\\\']*(?:\\.)?)*')|(\/\*(?:\r?\n|.)*?\*\/)|(\/{2,}.*?(?:(?:\r?\n)|$))/g;
	var result = content.replace(regexp, function (match, m1, m2, m3, m4) {
		// Only one of m1, m2, m3, m4 matches
		if (m3) {
			// A block comment. Replace with nothing
			return '';
		}
		else if (m4) {
			// A line comment. If it ends in \r?\n then keep it.
			var length_1 = m4.length;
			if (length_1 > 2 && m4[length_1 - 1] === '\n') {
				return m4[length_1 - 2] === '\r' ? '\r\n' : '\n';
			}
			else {
				return '';
			}
		}
		else {
			// We match a string
			return match;
		}
	});
	return result;
}

function getNLSConfiguration() {
	var locale = args['locale'];

	if (!locale) {
		var userData = app.getPath('userData');
		var localeConfig = path.join(userData, 'User', 'locale.json');
		if (fs.existsSync(localeConfig)) {
			try {
				var content = stripComments(fs.readFileSync(localeConfig, 'utf8'));
				var value = JSON.parse(content).locale;
				if (value && typeof value === 'string') {
					locale = value;
				}
			} catch (e) {
				// noop
			}
		}
	}

	var appLocale = app.getLocale();
	locale = locale || appLocale;
	// Language tags are case insensitve however an amd loader is case sensitive
	// To make this work on case preserving & insensitive FS we do the following:
	// the language bundles have lower case language tags and we always lower case
	// the locale we receive from the user or OS.
	locale = locale ? locale.toLowerCase() : locale;
	if (locale === 'pseudo') {
		return { locale: locale, availableLanguages: {}, pseudo: true };
	}
	var initialLocale = locale;
	if (process.env['VSCODE_DEV']) {
		return { locale: locale, availableLanguages: {} };
	}

	// We have a built version so we have extracted nls file. Try to find
	// the right file to use.

	// Check if we have an English locale. If so fall to default since that is our
	// English translation (we don't ship *.nls.en.json files)
	if (locale && (locale == 'en' || locale.startsWith('en-'))) {
		return { locale: locale, availableLanguages: {} };
	}

	function resolveLocale(locale) {
		while (locale) {
			var candidate = path.join(__dirname, 'vs', 'code', 'electron-main', 'main.nls.') + locale + '.js';
			if (fs.existsSync(candidate)) {
				return { locale: initialLocale, availableLanguages: { '*': locale } };
			} else {
				var index = locale.lastIndexOf('-');
				if (index > 0) {
					locale = locale.substring(0, index);
				} else {
					locale = null;
				}
			}
		}
		return null;
	}

	var resolvedLocale = resolveLocale(locale);
	if (!resolvedLocale && appLocale && appLocale !== locale) {
		resolvedLocale = resolveLocale(appLocale);
	}
	return resolvedLocale ? resolvedLocale : { locale: initialLocale, availableLanguages: {} };
}

function getNodeCachedDataDir() {

	// IEnvironmentService.isBuilt
	if (process.env['VSCODE_DEV']) {
		return Promise.resolve(undefined);
	}

	var dir = path.join(app.getPath('userData'), 'CachedData');

	return mkdirp(dir).then(undefined, function (err) { /*ignore*/ });
}

function mkdirp(dir) {
	return mkdir(dir)
		.then(null, function (err) {
			if (err && err.code === 'ENOENT') {
				var parent = path.dirname(dir);
				if (parent !== dir) { // if not arrived at root
					return mkdirp(parent)
						.then(function () {
							return mkdir(dir);
						});
				}
			}
			throw err;
		});
}

function mkdir(dir) {
	return new Promise(function (resolve, reject) {
		fs.mkdir(dir, function (err) {
			if (err && err.code !== 'EEXIST') {
				reject(err);
			} else {
				resolve(dir);
			}
		});
	});
}

// Set userData path before app 'ready' event and call to process.chdir
var userData = path.resolve(args['user-data-dir'] || paths.getDefaultUserDataPath(process.platform));
app.setPath('userData', userData);

// Update cwd based on environment and platform
try {
	if (process.platform === 'win32') {
		process.env['VSCODE_CWD'] = process.cwd(); // remember as environment variable
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

var openUrls = [];
var onOpenUrl = function (event, url) {
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
var nodeCachedDataDir = getNodeCachedDataDir().then(function (value) {
	if (value) {
		process.env['VSCODE_NODE_CACHED_DATA_DIR_' + process.pid] = value;
	}
});

// Load our code once ready
app.once('ready', function () {
	global.perfAppReady = Date.now();
	var nlsConfig = getNLSConfiguration();
	process.env['VSCODE_NLS_CONFIG'] = JSON.stringify(nlsConfig);

	nodeCachedDataDir.then(function () {
		require('./bootstrap-amd').bootstrap('vs/code/electron-main/main');
	}, console.error);
});
