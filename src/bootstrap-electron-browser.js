/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const bootstrap = require('./bootstrap');

//#region Renderer helpers
exports.load = function (modulePath, loaderCallback, resultCallback) {
	const fs = require('fs');
	const ipc = require('electron').ipcRenderer;

	const args = bootstrap.parseURLQueryArgs();
	const configuration = JSON.parse(args['config'] || '{}') || {};

	// Correctly inherit the parent's environment
	bootstrap.assign(process.env, configuration.userEnv);

	// Enable ASAR support
	bootstrap.enableASARSupport();

	// Get the nls configuration into the process.env as early as possible.
	const nlsConfig = bootstrap.setupNLS();

	let locale = nlsConfig.availableLanguages['*'] || 'en';
	if (locale === 'zh-tw') {
		locale = 'zh-Hant';
	} else if (locale === 'zh-cn') {
		locale = 'zh-Hans';
	}

	window.document.documentElement.setAttribute('lang', locale);

	// Allow some basic keybindings
	const TOGGLE_DEV_TOOLS_KB = (process.platform === 'darwin' ? 'meta-alt-73' : 'ctrl-shift-73'); // mac: Cmd-Alt-I, rest: Ctrl-Shift-I
	const RELOAD_KB = (process.platform === 'darwin' ? 'meta-82' : 'ctrl-82'); // mac: Cmd-R, rest: Ctrl-R

	const extractKey = function (e) {
		return [
			e.ctrlKey ? 'ctrl-' : '',
			e.metaKey ? 'meta-' : '',
			e.altKey ? 'alt-' : '',
			e.shiftKey ? 'shift-' : '',
			e.keyCode
		].join('');
	};

	window.addEventListener('keydown', function (e) {
		const key = extractKey(e);
		if (key === TOGGLE_DEV_TOOLS_KB) {
			ipc.send('vscode:toggleDevTools');
		} else if (key === RELOAD_KB) {
			ipc.send('vscode:reloadWindow');
		}
	});

	// Load the loader
	const loaderFilename = configuration.appRoot + '/out/vs/loader.js';
	const loaderSource = fs.readFileSync(loaderFilename);

	loaderCallback(loaderFilename, loaderSource, function (amdRequire) {
		const define = global.define;
		global.define = undefined;

		window.nodeRequire = amdRequire.__$__nodeRequire;

		// replace the patched electron fs with the original node fs for all AMD code
		define('fs', ['original-fs'], function (originalFS) { return originalFS; });

		window.MonacoEnvironment = {};

		amdRequire.config({
			baseUrl: bootstrap.uriFromPath(configuration.appRoot) + '/out',
			'vs/nls': nlsConfig,
			nodeCachedDataDir: configuration.nodeCachedDataDir,
			nodeModules: [/*BUILD->INSERT_NODE_MODULES*/]
		});

		if (nlsConfig.pseudo) {
			amdRequire(['vs/nls'], function (nlsPlugin) {
				nlsPlugin.setPseudoTranslation(nlsConfig.pseudo);
			});
		}

		amdRequire([modulePath], result => resultCallback(result, configuration));
	});
};
//#endregion