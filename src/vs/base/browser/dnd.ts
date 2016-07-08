/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {$} from 'vs/base/browser/builder';
import URI from 'vs/base/common/uri';

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

export function extractResources(e: DragEvent, externalOnly?: boolean): URI[] {
	const resources: URI[] = [];
	if (e.dataTransfer.types.length > 0) {

		// Check for in-app DND
		if (!externalOnly) {
			const rawData = e.dataTransfer.getData(e.dataTransfer.types[0]);
			if (rawData) {
				try {
					resources.push(URI.parse(rawData));
				} catch (error) {
					// Invalid URI
				}
			}
		}

		// Check for native file transfer
		if (e.dataTransfer && e.dataTransfer.files) {
			for (let i = 0; i < e.dataTransfer.files.length; i++) {
				if (e.dataTransfer.files[i] && e.dataTransfer.files[i].path) {
					try {
						resources.push(URI.file(e.dataTransfer.files[i].path));
					} catch (error) {
						// Invalid URI
					}
				}
			}
		}
	}

	return resources;
}