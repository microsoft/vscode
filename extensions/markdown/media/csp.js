/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

(function () {
	const settings = JSON.parse(document.getElementById('vscode-markdown-preview-data').getAttribute('data-settings'));
	const strings = JSON.parse(document.getElementById('vscode-markdown-preview-data').getAttribute('data-strings'));

	let didShow = false;

	document.addEventListener('securitypolicyviolation', () => {
		if (didShow) {
			return;
		}
		didShow = true;
		const args = [settings.previewUri];

		const notification = document.createElement('a');
		notification.innerText = strings.cspAlertMessageText;
		notification.setAttribute('id', 'code-csp-warning');
		notification.setAttribute('title', strings.cspAlertMessageTitle);

		notification.setAttribute('role', 'button');
		notification.setAttribute('aria-label',  strings.cspAlertMessageLabel);
		notification.setAttribute('href', `command:markdown.showPreviewSecuritySelector?${encodeURIComponent(JSON.stringify(args))}`);

		document.body.appendChild(notification);
	});
}());