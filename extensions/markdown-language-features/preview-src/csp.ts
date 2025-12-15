/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MessagePoster } from './messaging';
import { SettingsManager } from './settings';
import { getStrings } from './strings';

/**
 * Shows an alert when there is a content security policy violation.
 */
export class CspAlerter {
	private _didShow = false;
	private _didHaveCspWarning = false;

	private _messaging?: MessagePoster;

	constructor(
		private readonly _settingsManager: SettingsManager,
	) {
		document.addEventListener('securitypolicyviolation', () => {
			this._onCspWarning();
		});

		window.addEventListener('message', (event) => {
			if (event?.data && event.data.name === 'vscode-did-block-svg') {
				this._onCspWarning();
			}
		});
	}

	public setPoster(poster: MessagePoster) {
		this._messaging = poster;
		if (this._didHaveCspWarning) {
			this._showCspWarning();
		}
	}

	private _onCspWarning() {
		this._didHaveCspWarning = true;
		this._showCspWarning();
	}

	private _showCspWarning() {
		const strings = getStrings();
		const settings = this._settingsManager.settings;

		if (this._didShow || settings.disableSecurityWarnings || !this._messaging) {
			return;
		}
		this._didShow = true;

		const notification = document.createElement('a');
		notification.innerText = strings.cspAlertMessageText;
		notification.setAttribute('id', 'code-csp-warning');
		notification.setAttribute('title', strings.cspAlertMessageTitle);

		notification.setAttribute('role', 'button');
		notification.setAttribute('aria-label', strings.cspAlertMessageLabel);
		notification.onclick = () => {
			this._messaging!.postMessage('showPreviewSecuritySelector', { source: settings.source });
		};
		document.body.appendChild(notification);
	}
}
