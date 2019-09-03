/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

(function () {

	/** @type any */
	const amdLoader = require;

	amdLoader.config({
		baseUrl: `${window.location.origin}/static/out`,
		paths: {
			'vscode-textmate': `${window.location.origin}/static/node_modules/vscode-textmate/release/main`,
			'onigasm-umd': `${window.location.origin}/static/node_modules/onigasm-umd/release/main`,
			'xterm': `${window.location.origin}/static/node_modules/xterm/lib/xterm.js`,
			'xterm-addon-search': `${window.location.origin}/static/node_modules/xterm-addon-search/lib/xterm-addon-search.js`,
			'xterm-addon-web-links': `${window.location.origin}/static/node_modules/xterm-addon-web-links/lib/xterm-addon-web-links.js`,
			'semver-umd': `${window.location.origin}/static/node_modules/semver-umd/lib/semver-umd.js`,
			'@microsoft/applicationinsights-web': `${window.location.origin}/static/node_modules/@microsoft/applicationinsights-web/dist/applicationinsights-web.js`,
		}
	});

	amdLoader(['vs/workbench/workbench.web.api'], function (api) {
		const options = JSON.parse(document.getElementById('vscode-workbench-web-configuration').getAttribute('data-settings'));
		api.create(document.body, options);
	});
})();
