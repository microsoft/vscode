/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./aria';
import {Builder, $} from 'vs/base/browser/builder';

let ariaAlertContainer: Builder;
export function setAlertContainer(parent: HTMLElement) {
	ariaAlertContainer = $('.aria-alert-container').attr({ 'role': 'alert', 'aria-atomic': 'true' }).appendTo(parent);
}

/**
 * Given the provided message, will make sure that it is read as alert to screen readers.
 */
export function alert(msg: string): void {
	if (!ariaAlertContainer) {
		console.warn('ARIA alert support needs a container. Call setAlertContainer() first.');
		return;
	}

	$(ariaAlertContainer).empty();
	$('span').text(msg).appendTo(ariaAlertContainer);
}