/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const path = require('path');
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

function main() {
	const args = parseURLQueryArgs();
	const configuration = JSON.parse(args['config'] || '{}') || {};

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
