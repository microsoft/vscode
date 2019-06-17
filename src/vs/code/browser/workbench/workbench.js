/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

(function () {

	// @ts-ignore
	require.config({
		baseUrl: `${window.location.origin}/out`,
		paths: {
			'vscode-textmate': `${window.location.origin}/node_modules/vscode-textmate/release/main`,
			'onigasm-umd': `${window.location.origin}/node_modules/onigasm-umd/release/main`,
			'xterm': `${window.location.origin}/node_modules/xterm/lib/xterm.js`,
			'xterm-addon-search': `${window.location.origin}/node_modules/xterm-addon-search/lib/xterm-addon-search.js`,
			'xterm-addon-web-links': `${window.location.origin}/node_modules/xterm-addon-web-links/lib/xterm-addon-web-links.js`,
		}
	});

	// @ts-ignore
	require(['vs/workbench/workbench.web.api'], function () {
		// @ts-ignore
		// eslint-disable-next-line no-undef
		monaco.workbench.create(document.body, self.WINDOW_CONFIGURATION);
	});
})();