/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Perf measurements
global.vscodeStart = Date.now();

var app = require('electron').app;
var fs = require('fs');
var path = require('path');

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
};

function getNLSConfiguration() {
	var locale = undefined;
	var localeOpts = '--locale';
	for (var i = 0; i < process.argv.length; i++) {
		var arg = process.argv[i];
		if (arg.slice(0, localeOpts.length) == localeOpts) {
			var segments = arg.split('=');
			locale = segments[1];
			break;
		}
	}

	if (!locale) {
		var userData = app.getPath('userData');
		localeConfig = path.join(userData, 'User', 'locale.json');
		if (fs.existsSync(localeConfig)) {
			try {
				var content = stripComments(fs.readFileSync(localeConfig, 'utf8'));
				value = JSON.parse(content).locale;
				if (value && typeof value === 'string') {
					locale = value;
				}
			} catch (e) {
			}
		}
	}

	locale = locale || app.getLocale();
	// Language tags are case insensitve however an amd loader is case sensitive
	// To make this work on case preserving & insensitive FS we do the following:
	// the language bundles have lower case language tags and we always lower case
	// the locale we receive from the user or OS.
	locale = locale ? locale.toLowerCase() : locale;
	if (locale === 'pseudo') {
		return { locale: locale, availableLanguages: {}, pseudo: true }
	}
	var initialLocale = locale;
	if (process.env.VSCODE_DEV) {
		return { locale: locale, availableLanguages: {} };
	}
	// We have a built version so we have extracted nls file. Try to find
	// the right file to use.
	while (locale) {
		var candidate = path.join(__dirname, 'vs', 'workbench', 'electron-main', 'main.nls.') + locale + '.js';
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

	return { locale: initialLocale, availableLanguages: {} };
}

// Change cwd if given via env variable
try {
	if (process.env.VSCODE_CWD) {
		process.chdir(process.env.VSCODE_CWD);
	}
} catch (err) {
	// noop
}

// Set path according to being built or not
if (process.env.VSCODE_DEV) {
	var appData = app.getPath('appData');
	app.setPath('userData', path.join(appData, 'Code-Development'));
}

// Mac: when someone drops a file to the not-yet running VSCode, the open-file event fires even before
// the app-ready event. We listen very early for open-file and remember this upon startup as path to open.
global.macOpenFiles = [];
app.on('open-file', function(event, path) {
	global.macOpenFiles.push(path);
});

// Load our code once ready
app.once('ready', function() {
	var nlsConfig = getNLSConfiguration();
	process.env['VSCODE_NLS_CONFIG'] = JSON.stringify(nlsConfig);
	require('./bootstrap-amd').bootstrap('vs/workbench/electron-main/main');
});
