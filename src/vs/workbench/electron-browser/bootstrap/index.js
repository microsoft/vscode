/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

/*global window,document,define*/

const perf = require('../../../base/common/performance');
perf.mark('renderer/started');

const bootstrapWindow = require('../../../../bootstrap-window');

// Setup shell environment
process.lazyEnv = getLazyEnv();

// Load workbench main
bootstrapWindow.load([
	'vs/workbench/workbench.main',
	'vs/nls!vs/workbench/workbench.main',
	'vs/css!vs/workbench/workbench.main'
],
	function (workbench, configuration) {
		perf.mark('didLoadWorkbenchMain');

		return process.lazyEnv.then(function () {
			perf.mark('main/startup');

			return require('vs/workbench/electron-browser/main').startup(configuration);
		});
	}, {
		removeDeveloperKeybindingsAfterLoad: true,
		canModifyDOM: function (windowConfig) {
			showPartsSplash(windowConfig);
		},
		beforeLoaderConfig: function (windowConfig, loaderConfig) {
			const onNodeCachedData = window.MonacoEnvironment.onNodeCachedData = [];
			loaderConfig.onNodeCachedData = function () {
				onNodeCachedData.push(arguments);
			};

			loaderConfig.recordStats = !!windowConfig.performance;
		},
		beforeRequire: function () {
			perf.mark('willLoadWorkbenchMain');
		}
	});

function showPartsSplash(configuration) {
	perf.mark('willShowPartsSplash');

	// TODO@Ben remove me after a while
	perf.mark('willAccessLocalStorage');
	let storage = window.localStorage;
	perf.mark('didAccessLocalStorage');

	let data;
	try {
		let raw = storage.getItem('storage://global/parts-splash-data');
		data = JSON.parse(raw);
	} catch (e) {
		// ignore
	}

	// high contrast mode has been turned on, ignore stored colors and layouts
	if (data && configuration.highContrast && data.baseTheme !== 'hc-black') {
		data = void 0;
	}

	const style = document.createElement('style');
	document.head.appendChild(style);

	if (data) {
		const { layoutInfo, colorInfo, baseTheme } = data;

		// set the theme base id used by images and some styles
		document.body.className = `monaco-shell ${baseTheme}`;
		// stylesheet that defines foreground and background color
		style.innerHTML = `.monaco-shell { background-color: ${colorInfo.editorBackground}; color: ${colorInfo.foreground}; }`;

		const splash = document.createElement('div');
		splash.id = data.id;

		// ensure there is enough space
		layoutInfo.sideBarWidth = Math.min(layoutInfo.sideBarWidth, window.innerWidth - (layoutInfo.activityBarWidth + layoutInfo.editorPartMinWidth));

		if (configuration.folderUri || configuration.workspace) {
			// folder or workspace -> status bar color, sidebar
			splash.innerHTML = `
			<div style="position: absolute; width: 100%; left: 0; top: 0; height: ${layoutInfo.titleBarHeight}px; background-color: ${colorInfo.titleBarBackground}; -webkit-app-region: drag;"></div>
			<div style="position: absolute; height: calc(100% - ${layoutInfo.titleBarHeight}px); top: ${layoutInfo.titleBarHeight}px; ${layoutInfo.sideBarSide}: 0; width: ${layoutInfo.activityBarWidth}px; background-color: ${colorInfo.activityBarBackground};"></div>
			<div style="position: absolute; height: calc(100% - ${layoutInfo.titleBarHeight}px); top: ${layoutInfo.titleBarHeight}px; ${layoutInfo.sideBarSide}: ${layoutInfo.activityBarWidth}px; width: ${layoutInfo.sideBarWidth}px; background-color: ${colorInfo.sideBarBackground};"></div>
			<div style="position: absolute; width: 100%; bottom: 0; left: 0; height: ${layoutInfo.statusBarHeight}px; background-color: ${colorInfo.statusBarBackground};"></div>
			`;
		} else {
			// empty -> speical status bar color, no sidebar
			splash.innerHTML = `
			<div style="position: absolute; width: 100%; left: 0; top: 0; height: ${layoutInfo.titleBarHeight}px; background-color: ${colorInfo.titleBarBackground}; -webkit-app-region: drag;"></div>
			<div style="position: absolute; height: calc(100% - ${layoutInfo.titleBarHeight}px); top: ${layoutInfo.titleBarHeight}px; ${layoutInfo.sideBarSide}: 0; width: ${layoutInfo.activityBarWidth}px; background-color: ${colorInfo.activityBarBackground};"></div>
			<div style="position: absolute; width: 100%; bottom: 0; left: 0; height: ${layoutInfo.statusBarHeight}px; background-color: ${colorInfo.statusBarNoFolderBackground};"></div>
			`;
		}
		document.body.appendChild(splash);
	} else {
		document.body.className = `monaco-shell ${configuration.highContrast ? 'hc-black' : 'vs-dark'}`;
		style.innerHTML = `.monaco-shell { background-color: ${configuration.highContrast ? '#000000' : '#1E1E1E'}; color: ${configuration.highContrast ? '#FFFFFF' : '#CCCCCC'}; }`;
	}

	perf.mark('didShowPartsSplash');
}

function getLazyEnv() {
	const ipc = require('electron').ipcRenderer;

	return new Promise(function (resolve) {
		const handle = setTimeout(function () {
			resolve();
			console.warn('renderer did not receive lazyEnv in time');
		}, 10000);

		ipc.once('vscode:acceptShellEnv', function (event, shellEnv) {
			clearTimeout(handle);
			bootstrapWindow.assign(process.env, shellEnv);
			resolve(process.env);
		});

		ipc.send('vscode:fetchShellEnv');
	});
}