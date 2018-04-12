/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

(function() {
	function getConfig() {
		const queryParams = window.location.search.substring(1).split('&');
		for (var i = 0; i < queryParams.length; i++) {
			var kv = queryParams[i].split('=');
			if (kv[0] === 'config' && kv[1]) {
				return JSON.parse(decodeURIComponent(kv[1]));
			}
		}
		return {};
	}
	try {
		const config = getConfig();
		const document = window.document;

		// sets the base theme class ('vs', 'vs-dark', 'hc-black')
		const baseTheme = config.baseTheme || 'vs';
		document.body.className = 'monaco-shell ' + baseTheme;

		// adds a stylesheet with the backgrdound color
		var backgroundColor = config.backgroundColor;
		if (!backgroundColor) {
			backgroundColor = baseTheme === 'hc-black' ? '#000000' : (baseTheme === 'vs' ? '#FFFFFF' : '#1E1E1E');
		}
		const foregroundColor = baseTheme === 'hc-black' ? '#FFFFFF' : (baseTheme === 'vs' ? '#6C6C6C' : '#CCCCCC');
		const style = document.createElement('style');
		style.innerHTML = '.monaco-shell { background-color:' + backgroundColor + '; color:' + foregroundColor + '; }';
		document.head.appendChild(style);

	} catch (error) {
		console.error(error);
	}
})();