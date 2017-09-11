/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./aria';
import * as nls from 'vs/nls';
import { isMacintosh } from 'vs/base/common/platform';
import * as dom from 'vs/base/browser/dom';

let ariaContainer: HTMLElement;
let alertContainer: HTMLElement;
let statusContainer: HTMLElement;
export function setARIAContainer(parent: HTMLElement) {
	ariaContainer = document.createElement('div');
	ariaContainer.className = 'monaco-aria-container';

	alertContainer = document.createElement('div');
	alertContainer.className = 'monaco-alert';
	alertContainer.setAttribute('role', 'alert');
	alertContainer.setAttribute('aria-atomic', 'true');
	ariaContainer.appendChild(alertContainer);

	statusContainer = document.createElement('div');
	statusContainer.className = 'monaco-status';
	statusContainer.setAttribute('role', 'status');
	statusContainer.setAttribute('aria-atomic', 'true');
	ariaContainer.appendChild(statusContainer);

	parent.appendChild(ariaContainer);
}

/**
 * Given the provided message, will make sure that it is read as alert to screen readers.
 */
export function alert(msg: string): void {
	insertMessage(alertContainer, msg);
}

/**
 * Given the provided message, will make sure that it is read as status to screen readers.
 */
export function status(msg: string): void {
	if (isMacintosh) {
		alert(msg); // VoiceOver does not seem to support status role
	} else {
		insertMessage(statusContainer, msg);
	}
}

function insertMessage(target: HTMLElement, msg: string): void {
	if (!ariaContainer) {
		// console.warn('ARIA support needs a container. Call setARIAContainer() first.');
		return;
	}
	if (target.textContent === msg) {
		msg = nls.localize('repeated', "{0} (occurred again)", msg);
	}

	dom.clearNode(target);
	target.textContent = msg;


	// See https://www.paciellogroup.com/blog/2012/06/html5-accessibility-chops-aria-rolealert-browser-support/
	target.style.visibility = 'hidden';
	target.style.visibility = 'visible';
}