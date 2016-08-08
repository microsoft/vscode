/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

/*global window,document,define*/

const path = require('path');
const electron = require('electron');
const remote = electron.remote;
const ipc = electron.ipcRenderer;
const windowId = remote.getCurrentWindow().id;

function onError(error, enableDeveloperTools) {
	if (enableDeveloperTools) {
		ipc.send('vscode:openDevTools', windowId);
	}

	console.error('[uncaught exception]: ' + error);

	if (error.stack) {
		console.error(error.stack);
	}
}

function assign(destination, source) {
	return Object.keys(source)
		.reduce((r, key) => { r[key] = source[key]; return r; }, destination);
}

function parseURLQueryArgs() {
	const search = window.location.search || '';

	return search.split(/[?&]/)
		.filter(param => !!param)
		.map(param => param.split('='))
		.filter(param => param.length === 2)
		.reduce((r, param) => assign(r, { [param[0]]: decodeURIComponent(param[1])}), {});
}

function createScript(src, onload) {
	const script = document.createElement('script');
	script.src = src;
	script.addEventListener('load', onload);

	const head = document.getElementsByTagName('head')[0];
	head.insertBefore(script, head.lastChild);
}

function uriFromPath(_path) {
	let pathName = path.resolve(_path).replace(/\\/g, '/');

	if (pathName.length > 0 && pathName.charAt(0) !== '/') {
		pathName = '/' + pathName;
	}

	return encodeURI('file://' + pathName);
}

function registerListeners(enableDeveloperTools) {

	// Devtools & reload support
	if (enableDeveloperTools) {
		const extractKey = function(e) {
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

		window.addEventListener('keydown', function(e) {
			const key = extractKey(e);
			if (key === TOGGLE_DEV_TOOLS_KB) {
				ipc.send('vscode:toggleDevTools', windowId);
			} else if (key === RELOAD_KB) {
				ipc.send('vscode:reloadWindow', windowId);
			}
		});
	}

	process.on('uncaughtException', function(error) { onError(error, enableDeveloperTools) });
}

function main() {
	try {
		const theme = window.localStorage.getItem('storage://global/workbench.theme');
		const baseTheme = (theme || '').split(' ')[0];

		if (baseTheme !== 'vs-dark') {
			window.document.body.className = 'monaco-shell ' + baseTheme;
		}
	} catch (error) {
		console.error(error);
	}

	const webFrame = require('electron').webFrame;
	const args = parseURLQueryArgs();
	const configuration = JSON.parse(args['config'] || '{}') || {};
	const enableDeveloperTools = !configuration.isBuilt || !!configuration.extensionDevelopmentPath;

	// Correctly inherit the parent's environment
	assign(process.env, configuration.userEnv);

	// Get the nls configuration into the process.env as early as possible.
	let nlsConfig = { availableLanguages: {} };
	const config = process.env['VSCODE_NLS_CONFIG'];
	if (config) {
		process.env['VSCODE_NLS_CONFIG'] = config;
		try {
			nlsConfig = JSON.parse(config);
		} catch (e) { /*noop*/ }
	}

	let locale = nlsConfig.availableLanguages['*'] || 'en';

	if (locale === 'zh-tw') {
		locale = 'zh-Hant';
	} else if (locale === 'zh-cn') {
		locale = 'zh-Hans';
	}

	window.document.documentElement.setAttribute('lang', locale);

	registerListeners(enableDeveloperTools);

	// We get the global settings through a remote call from the browser
	// because its value can change dynamically.
	const rawGlobalSettings = remote.getGlobal('globalSettingsValue') || '{"settings":{},"keybindings":[]}';
	const globalSettings = JSON.parse(rawGlobalSettings);

	// disable pinch zoom & apply zoom level early to avoid glitches
	const windowConfiguration = globalSettings.settings && globalSettings.settings.window;
	webFrame.setZoomLevelLimits(1, 1);
	if (windowConfiguration && typeof windowConfiguration.zoomLevel === 'number' && windowConfiguration.zoomLevel !== 0) {
		webFrame.setZoomLevel(windowConfiguration.zoomLevel);
	}

	// Load the loader and start loading the workbench
	const rootUrl = uriFromPath(configuration.appRoot) + '/out';
	// In the bundled version the nls plugin is packaged with the loader so the NLS Plugins
	// loads as soon as the loader loads. To be able to have pseudo translation
	createScript(rootUrl + '/vs/loader.js', function() {
		define('fs', ['original-fs'], function(originalFS) { return originalFS; }); // replace the patched electron fs with the original node fs for all AMD code
		require.config({
			baseUrl: rootUrl,
			'vs/nls': nlsConfig,
			recordStats: configuration.enablePerformance,
			ignoreDuplicateModules: [
				'vs/workbench/parts/search/common/searchQuery'
			]
		});
		if (nlsConfig.pseudo) {
			require(['vs/nls'], function(nlsPlugin) {
				nlsPlugin.setPseudoTranslation(nlsConfig.pseudo);
			});
		}

		window.MonacoEnvironment = {};
		const timers = window.MonacoEnvironment.timers = {
			start: new Date()
		};

		if (configuration.enablePerformance) {
			const programStart = remote.getGlobal('programStart');
			const vscodeStart = remote.getGlobal('vscodeStart');

			if (programStart) {
				timers.beforeProgram = new Date(programStart);
				timers.afterProgram = new Date(vscodeStart);
			}

			timers.vscodeStart = new Date(vscodeStart);
			timers.start = new Date(programStart || vscodeStart);
		}

		timers.beforeLoad = new Date();

		require([
			'vs/workbench/workbench.main',
			'vs/nls!vs/workbench/workbench.main',
			'vs/css!vs/workbench/workbench.main'
		], () => {
			timers.afterLoad = new Date();

			require('vs/workbench/electron-browser/main')
				.startup(configuration, globalSettings)
				.done(null, error => onError(error, enableDeveloperTools));
		});
	});
}

main();