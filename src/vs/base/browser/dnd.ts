/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {$} from 'vs/base/browser/builder';

/**
 * A helper that will execute a provided function when the provided HTMLElement receives
 *  dragover event for 800ms. If the drag is aborted before, the callback will not be triggered.
 */
export class DelayedDragHandler {

	private timeout: number;

	constructor(container: HTMLElement, callback: () => void) {
		$(container).on('dragover', () => {
			if (!this.timeout) {
				this.timeout = setTimeout(() => {
					callback();

					this.timeout = null;
				}, 800);
			}
		});

		$(container).on(['dragleave', 'drop', 'dragend'], () => this.clearDragTimeout());
	}

	private clearDragTimeout(): void {
		if (this.timeout) {
			clearTimeout(this.timeout);
			this.timeout = null;
		}
	}

	public dispose(): void {
		this.clearDragTimeout();
	}
}