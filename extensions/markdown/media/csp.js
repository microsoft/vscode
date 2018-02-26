/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

(function () {
	const settings = JSON.parse(document.getElementById('vscode-markdown-preview-data').getAttribute('data-settings'));
	const strings = JSON.parse(document.getElementById('vscode-markdown-preview-data').getAttribute('data-strings'));

	let didShow = false;

	const showCspWarning = () => {
		if (didShow || settings.disableSecurityWarnings) {
			return;
		}
		didShow = true;

		const notification = document.createElement('a');
		notification.innerText = strings.cspAlertMessageText;
		notification.setAttribute('id', 'code-csp-warning');
		notification.setAttribute('title', strings.cspAlertMessageTitle);

		notification.setAttribute('role', 'button');
		notification.setAttribute('aria-label',  strings.cspAlertMessageLabel);
		notification.onclick = () => {
			window.parent.postMessage({
				command: 'markdown.showPreviewSecuritySelector',
				args: [settings.source]
			}, '*');
		};
		document.body.appendChild(notification);
	};

	document.addEventListener('securitypolicyviolation', () => {
		showCspWarning();
	});

	window.addEventListener('message', (event) => {
		if (event && event.data && event.data.name === 'vscode-did-block-svg') {
			showCspWarning();
		}
	});
}());