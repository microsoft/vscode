/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Warning: Do not use the `let` declarator in this file, it breaks our minification

'use strict';

if (window.location.search.indexOf('prof-startup') >= 0) {
	var profiler = require('v8-profiler');
	profiler.startProfiling('renderer', true);
}

/*global window,document,define*/

const path = require('path');
const electron = require('electron');
const remote = electron.remote;
const ipc = electron.ipcRenderer;

process.lazyEnv = new Promise(function (resolve) {
	ipc.once('vscode:acceptShellEnv', function (event, shellEnv) {
		assign(process.env, shellEnv);
		resolve(process.env);
	});
	ipc.send('vscode:fetchShellEnv', remote.getCurrentWindow().id);
});

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

	process.on('uncaughtException', function (error) { onError(error, enableDeveloperTools) });

	return function () {
		if (listener) {
			window.removeEventListener('keydown', listener);
			listener = void 0;
		}
	}
}

function main() {
	const webFrame = require('electron').webFrame;
	const args = parseURLQueryArgs();
	const configuration = JSON.parse(args['config'] || '{}') || {};

	// Correctly inherit the parent's environment
	assign(process.env, configuration.userEnv);

	// Get the nls configuration into the process.env as early as possible.
	var nlsConfig = { availableLanguages: {} };
	const config = process.env['VSCODE_NLS_CONFIG'];
	if (config) {
		process.env['VSCODE_NLS_CONFIG'] = config;
		try {
			nlsConfig = JSON.parse(config);
		} catch (e) { /*noop*/ }
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
	webFrame.setZoomLevelLimits(1, 1);
	if (typeof zoomLevel === 'number' && zoomLevel !== 0) {
		webFrame.setZoomLevel(zoomLevel);
	}

	// Load the loader and start loading the workbench
	const rootUrl = uriFromPath(configuration.appRoot) + '/out';

	// In the bundled version the nls plugin is packaged with the loader so the NLS Plugins
	// loads as soon as the loader loads. To be able to have pseudo translation
	createScript(rootUrl + '/vs/loader.js', function () {
		define('fs', ['original-fs'], function (originalFS) { return originalFS; }); // replace the patched electron fs with the original node fs for all AMD code

		window.MonacoEnvironment = {};

		const nodeCachedDataErrors = window.MonacoEnvironment.nodeCachedDataErrors = [];
		require.config({
			baseUrl: rootUrl,
			'vs/nls': nlsConfig,
			recordStats: !!configuration.performance,
			nodeCachedDataDir: configuration.nodeCachedDataDir,
			onNodeCachedDataError: function (err) { nodeCachedDataErrors.push(err) },
			nodeModules: [/*BUILD->INSERT_NODE_MODULES*/]
		});

		if (nlsConfig.pseudo) {
			require(['vs/nls'], function (nlsPlugin) {
				nlsPlugin.setPseudoTranslation(nlsConfig.pseudo);
			});
		}

		// Perf Counters
		const timers = window.MonacoEnvironment.timers = {
			isInitialStartup: !!configuration.isInitialStartup,
			hasAccessibilitySupport: !!configuration.accessibilitySupport,
			start: configuration.perfStartTime,
			appReady: configuration.perfAppReady,
			windowLoad: configuration.perfWindowLoadTime,
			beforeLoadWorkbenchMain: Date.now()
		};

		require([
			'vs/workbench/electron-browser/workbench.main',
			'vs/nls!vs/workbench/electron-browser/workbench.main',
			'vs/css!vs/workbench/electron-browser/workbench.main'
		], function () {
			timers.afterLoadWorkbenchMain = Date.now();

			process.lazyEnv.then(function () {
				require('vs/workbench/electron-browser/main')
					.startup(configuration)
					.done(function () {
						unbind(); // since the workbench is running, unbind our developer related listeners and let the workbench handle them
					}, function (error) {
						onError(error, enableDeveloperTools);
					});
			});
		});
	});
}

main();
