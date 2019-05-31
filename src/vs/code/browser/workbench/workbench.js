/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

(function () {

	function loadScript(path, callback) {
		let script = document.createElement('script');
		script.onload = callback;
		script.async = true;
		script.type = 'text/javascript';
		script.src = path;
		document.head.appendChild(script);
	}

	loadScript('./out/vs/loader.js', function () {

		// @ts-ignore
		require.config({
			baseUrl: `${window.location.origin}/out`,
			paths: {
				'vscode-textmate': `${window.location.origin}/node_modules/vscode-textmate/release/main`,
				'onigasm-umd': `${window.location.origin}/node_modules/onigasm-umd/release/main`,
			}
		});

		// @ts-ignore
		require([
			'vs/workbench/workbench.web.main',
			'vs/nls!vs/workbench/workbench.web.main',
			'vs/css!vs/workbench/workbench.web.main'
		],
			// @ts-ignore
			function () {

				// @ts-ignore
				require('vs/workbench/browser/web.main').main().then(undefined, console.error);
			});
	});
})();