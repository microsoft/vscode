/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Warning: Do not use the `let` declarator in this file, it breaks our minification

'use strict';

/*global window,document,define*/

const perf = require('../../../base/common/performance');
perf.mark('renderer/started');

const path = require('path');
const fs = require('fs');
const electron = require('electron');
const remote = electron.remote;
const ipc = electron.ipcRenderer;

process.lazyEnv = new Promise(function (resolve) {
	const handle = setTimeout(function () {
		resolve();
		console.warn('renderer did not receive lazyEnv in time');
	}, 10000);
	ipc.once('vscode:acceptShellEnv', function (event, shellEnv) {
		clearTimeout(handle);
		assign(process.env, shellEnv);
		resolve(process.env);
	});
	ipc.send('vscode:fetchShellEnv');
});

Error.stackTraceLimit = 100; // increase number of stack frames (from 10, https://github.com/v8/v8/wiki/Stack-Trace-API)

function onError(error, enableDeveloperTools) {
	if (enableDeveloperTools) {
		remote.getCurrentWebContents().openDevTools();
	}

	console.error('[uncaught exception]: ' + error);

	if (error.stack) {
		console.error(error.stack);
	}
}

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

function registerListeners(enableDeveloperTools) {

	// Devtools & reload support
	var listener;
	if (enableDeveloperTools) {
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

		listener = function (e) {
			const key = extractKey(e);
			if (key === TOGGLE_DEV_TOOLS_KB) {
				remote.getCurrentWebContents().toggleDevTools();
			} else if (key === RELOAD_KB) {
				remote.getCurrentWindow().reload();
			}
		};
		window.addEventListener('keydown', listener);
	}

	process.on('uncaughtException', function (error) { onError(error, enableDeveloperTools); });

	return function () {
		if (listener) {
			window.removeEventListener('keydown', listener);
			listener = void 0;
		}
	};
}

function main() {
	const webFrame = require('electron').webFrame;
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

	// Correctly inherit the parent's environment
	assign(process.env, configuration.userEnv);
	perf.importEntries(configuration.perfEntries);

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

	const enableDeveloperTools = (process.env['VSCODE_DEV'] || !!configuration.extensionDevelopmentPath) && !configuration.extensionTestsPath;
	const unbind = registerListeners(enableDeveloperTools);

	// disable pinch zoom & apply zoom level early to avoid glitches
	const zoomLevel = configuration.zoomLevel;
	webFrame.setVisualZoomLevelLimits(1, 1);
	if (typeof zoomLevel === 'number' && zoomLevel !== 0) {
		webFrame.setZoomLevel(zoomLevel);
	}

	// Load the loader and start loading the workbench
	const loaderFilename = configuration.appRoot + '/out/vs/loader.js';
	const loaderSource = require('fs').readFileSync(loaderFilename);
	require('vm').runInThisContext(loaderSource, { filename: loaderFilename });
	var define = global.define;
	global.define = undefined;

	window.nodeRequire = require.__$__nodeRequire;

	define('fs', ['original-fs'], function (originalFS) { return originalFS; }); // replace the patched electron fs with the original node fs for all AMD code

	window.MonacoEnvironment = {};

	const onNodeCachedData = window.MonacoEnvironment.onNodeCachedData = [];
	require.config({
		baseUrl: uriFromPath(configuration.appRoot) + '/out',
		'vs/nls': nlsConfig,
		recordStats: !!configuration.performance,
		nodeCachedDataDir: configuration.nodeCachedDataDir,
		onNodeCachedData: function () { onNodeCachedData.push(arguments); },
		nodeModules: [/*BUILD->INSERT_NODE_MODULES*/]
	});

	if (nlsConfig.pseudo) {
		require(['vs/nls'], function (nlsPlugin) {
			nlsPlugin.setPseudoTranslation(nlsConfig.pseudo);
		});
	}

	// Perf Counters
	window.MonacoEnvironment.timers = {
		isInitialStartup: !!configuration.isInitialStartup,
		hasAccessibilitySupport: !!configuration.accessibilitySupport,
		start: configuration.perfStartTime,
		windowLoad: configuration.perfWindowLoadTime
	};

	perf.mark('willLoadWorkbenchMain');
	require([
		'vs/workbench/workbench.main',
		'vs/nls!vs/workbench/workbench.main',
		'vs/css!vs/workbench/workbench.main'
	], function () {
		perf.mark('didLoadWorkbenchMain');

		process.lazyEnv.then(function () {
			perf.mark('main/startup');
			require('vs/workbench/electron-browser/main')
				.startup(configuration)
				.done(function () {
					unbind(); // since the workbench is running, unbind our developer related listeners and let the workbench handle them
				}, function (error) {
					onError(error, enableDeveloperTools);
				});
		});
	});

}

main();
