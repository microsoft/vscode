/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const path = require('path');
const fs = require('fs');
const ipc = require('electron').ipcRenderer;
const bootstrap = require('../../../../bootstrap');

function assign(destination, source) {
	return Object.keys(source)
		.reduce(function (r, key) { r[key] = source[key]; return r; }, destination);
}

function parseURLQueryArgs() {
	const search = window.location.search || '';

	return search.split(/[?&]/)
		.filter(function (param) { return !!param; })
		.map(function (param) { return param.split('='); })
		.filter(function (param) { return param.length === 2; })
		.reduce(function (r, param) { r[param[0]] = decodeURIComponent(param[1]); return r; }, {});
}

function main() {
	const args = parseURLQueryArgs();
	const configuration = JSON.parse(args['config'] || '{}') || {};

	assign(process.env, configuration.userEnv);

	bootstrap.enableASARSupport();

	const extractKey = function (e) {
		return [
			e.ctrlKey ? 'ctrl-' : '',
			e.metaKey ? 'meta-' : '',
			e.altKey ? 'alt-' : '',
			e.shiftKey ? 'shift-' : '',
			e.keyCode
		].join('');
	};

	const TOGGLE_DEV_TOOLS_KB = (process.platform === 'darwin' ? 'meta-alt-73' : 'ctrl-shift-73'); // mac: Cmd-Alt-I, rest: Ctrl-Shift-I
	const RELOAD_KB = (process.platform === 'darwin' ? 'meta-82' : 'ctrl-82'); // mac: Cmd-R, rest: Ctrl-R

	window.addEventListener('keydown', function (e) {
		const key = extractKey(e);
		if (key === TOGGLE_DEV_TOOLS_KB) {
			ipc.send('vscode:toggleDevTools');
		} else if (key === RELOAD_KB) {
			ipc.send('vscode:reloadWindow');
		}
	});

	// Load the loader and start loading the workbench
	const rootUrl = bootstrap.uriFromPath(configuration.appRoot) + '/out';

	// Get the nls configuration into the process.env as early as possible.
	var nlsConfig = { availableLanguages: {} };
	const config = process.env['VSCODE_NLS_CONFIG'];
	if (config) {
		process.env['VSCODE_NLS_CONFIG'] = config;
		try {
			nlsConfig = JSON.parse(config);
		} catch (e) { /*noop*/ }
	}

	if (nlsConfig._resolvedLanguagePackCoreLocation) {
		let bundles = Object.create(null);
		nlsConfig.loadBundle = function (bundle, language, cb) {
			let result = bundles[bundle];
			if (result) {
				cb(undefined, result);
				return;
			}
			let bundleFile = path.join(nlsConfig._resolvedLanguagePackCoreLocation, bundle.replace(/\//g, '!') + '.nls.json');
			bootstrap.readFile(bundleFile).then(function (content) {
				let json = JSON.parse(content);
				bundles[bundle] = json;
				cb(undefined, json);
			}).catch((error) => {
				try {
					if (nlsConfig._corruptedFile) {
						bootstrap.writeFile(nlsConfig._corruptedFile, 'corrupted').catch(function (error) { console.error(error); });
					}
				} finally {
					cb(error, undefined);
				}
			});
		};
	}

	var locale = nlsConfig.availableLanguages['*'] || 'en';
	if (locale === 'zh-tw') {
		locale = 'zh-Hant';
	} else if (locale === 'zh-cn') {
		locale = 'zh-Hans';
	}

	window.document.documentElement.setAttribute('lang', locale);

	// Load the loader
	const loaderFilename = configuration.appRoot + '/out/vs/loader.js';
	const loaderSource = fs.readFileSync(loaderFilename);
	require('vm').runInThisContext(loaderSource, { filename: loaderFilename });
	var define = global.define;
	global.define = undefined;

	window.nodeRequire = require.__$__nodeRequire;

	define('fs', ['original-fs'], function (originalFS) { return originalFS; }); // replace the patched electron fs with the original node fs for all AMD code

	window.MonacoEnvironment = {};

	require.config({
		baseUrl: rootUrl,
		'vs/nls': nlsConfig,
		nodeCachedDataDir: configuration.nodeCachedDataDir,
		nodeModules: [/*BUILD->INSERT_NODE_MODULES*/]
	});

	if (nlsConfig.pseudo) {
		require(['vs/nls'], function (nlsPlugin) {
			nlsPlugin.setPseudoTranslation(nlsConfig.pseudo);
		});
	}

	require(['vs/code/electron-browser/issue/issueReporterMain'], (issueReporter) => {
		issueReporter.startup(configuration);
	});
}

main();
