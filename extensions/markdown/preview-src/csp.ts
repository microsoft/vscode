/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getSettings } from './settings';
import { postCommand } from './messaging';

const strings = JSON.parse(document.getElementById('vscode-markdown-preview-data').getAttribute('data-strings'));
const settings = getSettings();

/**
 * Shows an alert when there is a content security policy violation.
 */
export class CspAlerter {
	private didShow = false;

	constructor() {
		document.addEventListener('securitypolicyviolation', () => {
			this.showCspWarning();
		});

		window.addEventListener('message', (event) => {
			if (event && event.data && event.data.name === 'vscode-did-block-svg') {
				this.showCspWarning();
			}
		});
	}

	private showCspWarning() {
		if (this.didShow || settings.disableSecurityWarnings) {
			return;
		}
		this.didShow = true;

		const notification = document.createElement('a');
		notification.innerText = strings.cspAlertMessageText;
		notification.setAttribute('id', 'code-csp-warning');
		notification.setAttribute('title', strings.cspAlertMessageTitle);

		notification.setAttribute('role', 'button');
		notification.setAttribute('aria-label', strings.cspAlertMessageLabel);
		notification.onclick = () => {
			postCommand('markdown.showPreviewSecuritySelector', [settings.source]);
		};
		document.body.appendChild(notification);
	}
}
