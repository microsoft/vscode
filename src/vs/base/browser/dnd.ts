/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { addDisposableListener } from 'vs/base/browser/dom';

export class DragHandler {
	protected container: HTMLElement;
	protected toDispose: IDisposable[] = [];

	public constructor(container: HTMLElement) {
		this.container = container;
	}

	public addListener(events: Array<string> | string, callback: () => void) {
		if (typeof events === 'string') {
			events = [events];
		}

		events.forEach(type => {
			this.toDispose.push(
				addDisposableListener(this.container, type, () => {
					callback();
				})
			);
		});
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}
}

/**
 * A helper that will execute a provided function when the provided HTMLElement receives
 *  dragover event for 800ms. If the drag is aborted before, the callback will not be triggered.
 */
export class DelayedDragHandler extends DragHandler {
	private timeout: number;

	constructor(container: HTMLElement, callback: () => void) {
		super(container);
		this.addListener('dragover', () => {
			if (!this.timeout) {
				this.timeout = setTimeout(() => {
					callback();

					this.timeout = null;
				}, 800);
			}
		});

		this.addListener(['dragleave', 'drop', 'dragend'], () => {
			this.clearDragTimeout();
		});
	}

	private clearDragTimeout(): void {
		if (this.timeout) {
			clearTimeout(this.timeout);
			this.timeout = null;
		}
	}

	public dispose(): void {
		super.dispose();
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
