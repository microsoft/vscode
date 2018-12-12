/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

const perf = require('../../../base/common/performance');
perf.mark('renderer/started');

const bootstrapWindow = require('../../../../bootstrap-window');

// Setup shell environment
process['lazyEnv'] = getLazyEnv();

// Load workbench main
bootstrapWindow.load([
	'vs/workbench/workbench.main',
	'vs/nls!vs/workbench/workbench.main',
	'vs/css!vs/workbench/workbench.main'
],
	function (workbench, configuration) {
		perf.mark('didLoadWorkbenchMain');

		return process['lazyEnv'].then(function () {
			perf.mark('main/startup');

			// @ts-ignore
			return require('vs/workbench/electron-browser/main').startup(configuration);
		});
	}, {
		removeDeveloperKeybindingsAfterLoad: true,
		canModifyDOM: function (windowConfig) {
			showPartsSplash(windowConfig);
		},
		beforeLoaderConfig: function (windowConfig, loaderConfig) {
			loaderConfig.recordStats = !!windowConfig.performance;
			if (loaderConfig.nodeCachedData) {
				const onNodeCachedData = window['MonacoEnvironment'].onNodeCachedData = [];
				loaderConfig.nodeCachedData.onData = function () {
					onNodeCachedData.push(arguments);
				};
			}

		},
		beforeRequire: function () {
			perf.mark('willLoadWorkbenchMain');
		}
	});

/**
 * @param {object} configuration
 */
function showPartsSplash(configuration) {
	perf.mark('willShowPartsSplash');

	let data;
	try {
		data = JSON.parse(configuration.partsSplashData);
	} catch (e) {
		// ignore
	}

	// high contrast mode has been turned on from the outside, e.g OS -> ignore stored colors and layouts
	if (data && configuration.highContrast && data.baseTheme !== 'hc-black') {
		data = undefined;
	}

	// developing an extension -> ignore stored layouts
	if (data && configuration.extensionDevelopmentPath) {
		data.layoutInfo = undefined;
	}

	// minimal color configuration (works with or without persisted data)
	const baseTheme = data ? data.baseTheme : configuration.highContrast ? 'hc-black' : 'vs-dark';
	const shellBackground = data ? data.colorInfo.editorBackground : configuration.highContrast ? '#000000' : '#1E1E1E';
	const shellForeground = data ? data.colorInfo.foreground : configuration.highContrast ? '#FFFFFF' : '#CCCCCC';
	const style = document.createElement('style');
	style.className = 'initialShellColors';
	document.head.appendChild(style);
	document.body.className = `monaco-shell ${baseTheme}`;
	style.innerHTML = `.monaco-shell { background-color: ${shellBackground}; color: ${shellForeground}; }`;

	if (data && data.layoutInfo) {
		// restore parts if possible (we might not always store layout info)
		const { id, layoutInfo, colorInfo } = data;
		const splash = document.createElement('div');
		splash.id = id;

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
	}

	perf.mark('didShowPartsSplash');
}

/**
 * @returns {Promise<void>}
 */
function getLazyEnv() {
	// @ts-ignore
	const ipc = require('electron').ipcRenderer;

	return new Promise(function (resolve) {
		const handle = setTimeout(function () {
			resolve();
			console.warn('renderer did not receive lazyEnv in time');
		}, 10000);

		ipc.once('vscode:acceptShellEnv', function (event, shellEnv) {
			clearTimeout(handle);
			bootstrapWindow.assign(process.env, shellEnv);
			// @ts-ignore
			resolve(process.env);
		});

		ipc.send('vscode:fetchShellEnv');
	});
}
