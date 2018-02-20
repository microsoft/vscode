/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const path = require('path');
const fs = require('fs');
const remote = require('electron').remote;

function parseURLQueryArgs() {
	const search = window.location.search || '';

	return search.split(/[?&]/)
		.filter(function (param) { return !!param; })
		.map(function (param) { return param.split('='); })
		.filter(function (param) { return param.length === 2; })
		.reduce(function (r, param) { r[param[0]] = decodeURIComponent(param[1]); return r; }, {});
}

function createScript(src, onload) {
	const script = document.createElement('script');
	script.src = src;
	script.addEventListener('load', onload);

	const head = document.getElementsByTagName('head')[0];
	head.insertBefore(script, head.lastChild);
}

function uriFromPath(_path) {
	var pathName = path.resolve(_path).replace(/\\/g, '/');
	if (pathName.length > 0 && pathName.charAt(0) !== '/') {
		pathName = '/' + pathName;
	}

	return encodeURI('file://' + pathName);
}

function readFile(file) {
	return new Promise(function(resolve, reject) {
		fs.readFile(file, 'utf8', function(err, data) {
			if (err) {
				reject(err);
				return;
			}
			resolve(data);
		});
	});
}

function main() {
	const args = parseURLQueryArgs();
	const configuration = JSON.parse(args['config'] || '{}') || {};

	//#region Add support for using node_modules.asar
	(function () {
		const path = require('path');
		const Module = require('module');
		let NODE_MODULES_PATH = path.join(configuration.appRoot, 'node_modules');
		if (/[a-z]\:/.test(NODE_MODULES_PATH)) {
			// Make drive letter uppercase
			NODE_MODULES_PATH = NODE_MODULES_PATH.charAt(0).toUpperCase() + NODE_MODULES_PATH.substr(1);
		}
		const NODE_MODULES_ASAR_PATH = NODE_MODULES_PATH + '.asar';

		const originalResolveLookupPaths = Module._resolveLookupPaths;
		Module._resolveLookupPaths = function (request, parent) {
			const result = originalResolveLookupPaths(request, parent);

			const paths = result[1];
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
			remote.getCurrentWebContents().toggleDevTools();
		} else if (key === RELOAD_KB) {
			remote.getCurrentWindow().reload();
		}
	});

	// Load the loader and start loading the workbench
	const rootUrl = uriFromPath(configuration.appRoot) + '/out';

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
		nlsConfig.loadBundle = function(bundle, language, cb) {
			let result = bundles[bundle];
			if (result) {
				cb(undefined, result);
				return;
			}
			let bundleFile = path.join(nlsConfig._resolvedLanguagePackCoreLocation, bundle.replace(/\//g, '!') + '.nls.json');
			readFile(bundleFile).then(function (content) {
				let json = JSON.parse(content);
				bundles[bundle] = json;
				cb(undefined, json);
			})
			.catch(cb);
		};
	}

	var locale = nlsConfig.availableLanguages['*'] || 'en';
	if (locale === 'zh-tw') {
		locale = 'zh-Hant';
	} else if (locale === 'zh-cn') {
		locale = 'zh-Hans';
	}

	window.document.documentElement.setAttribute('lang', locale);

	// In the bundled version the nls plugin is packaged with the loader so the NLS Plugins
	// loads as soon as the loader loads. To be able to have pseudo translation
	createScript(rootUrl + '/vs/loader.js', function () {
		var define = global.define;
		global.define = undefined;
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
	});
}

main();
