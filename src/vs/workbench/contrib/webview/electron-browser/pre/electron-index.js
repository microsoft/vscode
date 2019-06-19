/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
(function () {
	'use strict';

	const registerVscodeResourceScheme = (function () {
		let hasRegistered = false;
		return () => {
			if (hasRegistered) {
				return;
			}
			hasRegistered = true;

			// @ts-ignore
			require('electron').webFrame.registerURLSchemeAsPrivileged('vscode-resource', {
				secure: true,
				bypassCSP: false,
				allowServiceWorkers: false,
				supportFetchAPI: true,
				corsEnabled: true
			});
		};
	}());

	// @ts-ignore
	const ipcRenderer = require('electron').ipcRenderer;

	require('../../browser/pre/main')({
		postMessage: (channel, data) => {
			ipcRenderer.sendToHost(channel, data);
		},
		onMessage: (channel, handler) => {
			ipcRenderer.on(channel, handler);
		},
		focusIframeOnCreate: true
	});

	document.addEventListener('DOMContentLoaded', () => {
		registerVscodeResourceScheme();

		// Forward messages from the embedded iframe
		window.onmessage = (message) => {
			ipcRenderer.sendToHost(message.data.command, message.data.data);
		};
	});
}());