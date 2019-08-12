/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

(function () {

	require.config({
		baseUrl: `${window.location.origin}/out`,
		paths: {
			'vscode-textmate': `${window.location.origin}/node_modules/vscode-textmate/release/main`,
			'onigasm-umd': `${window.location.origin}/node_modules/onigasm-umd/release/main`,
			'xterm': `${window.location.origin}/node_modules/xterm/lib/xterm.js`,
			'xterm-addon-search': `${window.location.origin}/node_modules/xterm-addon-search/lib/xterm-addon-search.js`,
			'xterm-addon-web-links': `${window.location.origin}/node_modules/xterm-addon-web-links/lib/xterm-addon-web-links.js`,
			'semver-umd': `${window.location.origin}/node_modules/semver-umd/lib/semver-umd.js`,
			'@microsoft/applicationinsights-web': `${window.location.origin}/node_modules/@microsoft/applicationinsights-web/dist/applicationinsights-web.js`,
		}
	});

	require(['vs/workbench/workbench.web.api'], function (api) {
		const options = JSON.parse(document.getElementById('vscode-workbench-web-configuration').getAttribute('data-settings'));

		api.create(document.body, options);
	});
})();
