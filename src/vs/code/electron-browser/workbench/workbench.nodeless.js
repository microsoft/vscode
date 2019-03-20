/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

(function () {

	function uriFromPath(_path) {
		let pathName = _path.replace(/\\/g, '/');
		if (pathName.length > 0 && pathName.charAt(0) !== '/') {
			pathName = '/' + pathName;
		}

		let uri;
		if (navigator.userAgent.indexOf('Windows') >= 0 && pathName.startsWith('//')) { // specially handle Windows UNC paths
			uri = encodeURI('file:' + pathName);
		} else {
			uri = encodeURI('file://' + pathName);
		}

		return uri.replace(/#/g, '%23');
	}

	function parseURLQueryArgs() {
		const search = window.location.search || '';

		return search.split(/[?&]/)
			.filter(function (param) { return !!param; })
			.map(function (param) { return param.split('='); })
			.filter(function (param) { return param.length === 2; })
			.reduce(function (r, param) { r[param[0]] = decodeURIComponent(param[1]); return r; }, {});
	}

	function loadScript(path, callback) {
		let script = document.createElement('script');
		script.onload = callback;
		script.async = true;
		script.type = 'text/javascript';
		script.src = path;
		document.head.appendChild(script);
	}

	loadScript('../../../../../out/vs/loader.js', function () {

		const args = parseURLQueryArgs();
		const configuration = JSON.parse(args['config'] || '{}') || {};

		// @ts-ignore
		require.config({
			baseUrl: uriFromPath(configuration.appRoot) + '/out',
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