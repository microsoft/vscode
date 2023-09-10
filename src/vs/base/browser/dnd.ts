/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener } from 'vs/base/browser/dom';
import { Disposable } from 'vs/base/common/lifecycle';
import { Mimes } from 'vs/base/common/mime';

/**
 * A helper that will execute a provided function when the provided HTMLElement receives
 *  dragover event for 800ms. If the drag is aborted before, the callback will not be triggered.
 */
export class DelayedDragHandler extends Disposable {
	private timeout: any;

	constructor(container: HTMLElement, callback: () => void) {
		super();

		this._register(addDisposableListener(container, 'dragover', e => {
			e.preventDefault(); // needed so that the drop event fires (https://stackoverflow.com/questions/21339924/drop-event-not-firing-in-chrome)

			if (!this.timeout) {
				this.timeout = setTimeout(() => {
					callback();

					this.timeout = null;
				}, 800);
			}
		}));

		['dragleave', 'drop', 'dragend'].forEach(type => {
			this._register(addDisposableListener(container, type, () => {
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

	override dispose(): void {
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
	 * Typically transfer type for copy/paste transfers.
	 */
	TEXT: Mimes.text,

	/**
	 * Internal type used to pass around text/uri-list data.
	 *
	 * This is needed to work around https://bugs.chromium.org/p/chromium/issues/detail?id=239745.
	 */
	INTERNAL_URI_LIST: 'application/vnd.code.uri-list',
};

export function applyDragImage(event: DragEvent, label: string | null, clazz: string, backgroundColor?: string | null, foregroundColor?: string | null): void {
	const dragImage = document.createElement('div');
	dragImage.className = clazz;
	dragImage.textContent = label;

	if (foregroundColor) {
		dragImage.style.color = foregroundColor;
	}

	if (backgroundColor) {
		dragImage.style.background = backgroundColor;
	}

	if (event.dataTransfer) {
		document.body.appendChild(dragImage);
		event.dataTransfer.setDragImage(dragImage, -10, -10);

		// Removes the element when the DND operation is done
		setTimeout(() => document.body.removeChild(dragImage), 0);
	}
}

export interface IDragAndDropData {
	update(dataTransfer: DataTransfer): void;
	getData(): unknown;
}
