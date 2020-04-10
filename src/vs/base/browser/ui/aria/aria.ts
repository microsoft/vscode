/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
	statusContainer.setAttribute('role', 'complementary');
	statusContainer.setAttribute('aria-live', 'polite');
	statusContainer.setAttribute('aria-atomic', 'true');
	ariaContainer.appendChild(statusContainer);

	parent.appendChild(ariaContainer);
}

/**
 * Given the provided message, will make sure that it is read as alert to screen readers.
 */
export function alert(msg: string, disableRepeat?: boolean): void {
	insertMessage(alertContainer, msg, disableRepeat);
}

/**
 * Given the provided message, will make sure that it is read as status to screen readers.
 */
export function status(msg: string, disableRepeat?: boolean): void {
	if (isMacintosh) {
		alert(msg, disableRepeat); // VoiceOver does not seem to support status role
	} else {
		insertMessage(statusContainer, msg, disableRepeat);
	}
}

let repeatedTimes = 0;
let prevText: string | undefined = undefined;
function insertMessage(target: HTMLElement, msg: string, disableRepeat?: boolean): void {
	if (!ariaContainer) {
		return;
	}

	// If the same message should be inserted that is already present, a screen reader would
	// not announce this message because it matches the previous one. As a workaround, we
	// alter the message with the number of occurences unless this is explicitly disabled
	// via the disableRepeat flag.
	if (!disableRepeat) {
		if (prevText === msg) {
			repeatedTimes++;
		} else {
			prevText = msg;
			repeatedTimes = 0;
		}

		switch (repeatedTimes) {
			case 0: break;
			case 1: msg = nls.localize('repeated', "{0} (occurred again)", msg); break;
			default: msg = nls.localize('repeatedNtimes', "{0} (occurred {1} times)", msg, repeatedTimes); break;
		}
	}

	dom.clearNode(target);
	target.textContent = msg;

	// See https://www.paciellogroup.com/blog/2012/06/html5-accessibility-chops-aria-rolealert-browser-support/
	target.style.visibility = 'hidden';
	target.style.visibility = 'visible';
}
