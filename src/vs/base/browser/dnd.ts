/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { addDisposableListener } from 'vs/base/browser/dom';

/**
 * A helper that will execute a provided function when the provided HTMLElement receives
 *  dragover event for 800ms. If the drag is aborted before, the callback will not be triggered.
 */
export class DelayedDragHandler {
	private toDispose: IDisposable[] = [];
	private timeout: number;

	constructor(container: HTMLElement, callback: () => void) {
		this.toDispose.push(addDisposableListener(container, 'dragover', () => {
			if (!this.timeout) {
				this.timeout = setTimeout(() => {
					callback();

					this.timeout = null;
				}, 800);
			}
		}));

		['dragleave', 'drop', 'dragend'].forEach(type => {
			this.toDispose.push(addDisposableListener(container, type, () => {
				this.clearDragTimeout();
			}));
		});
	}

	private clearDragTimeout(): void {
		if (this.timeout) {
			clearTimeout(this.timeout);
			this.timeout = null;
		}
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
		this.clearDragTimeout();
	}
}

// Common data transfers
export const DataTransfers = {

	/**
	 * Application specific resource transfer type
	 */
	RESOURCES: 'ResourceURLs',

	/**
	 * Browser specific transfer type to download
	 */
	DOWNLOAD_URL: 'DownloadURL',

	/**
	 * Browser specific transfer type for files
	 */
	FILES: 'Files',

	/**
	 * Typicaly transfer type for copy/paste transfers.
	 */
	TEXT: 'text/plain'
};
