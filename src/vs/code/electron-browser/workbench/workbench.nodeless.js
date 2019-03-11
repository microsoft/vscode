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

	loadScript('../../../../../src/vs/loader.js', function () {

		// @ts-ignore
		require.config({
			baseUrl: 'file:../../../../../out'
		});

		// @ts-ignore
		require([
			'vs/workbench/workbench.nodeless.main',
			'vs/nls!vs/workbench/workbench.nodeless.main',
			'vs/css!vs/workbench/workbench.nodeless.main'
		], function () {

			// @ts-ignore
			require('vs/workbench/browser/nodeless.main').main().then(undefined, console.error);
		});
	});
})();