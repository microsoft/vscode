/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { $ } from 'vs/base/browser/builder';
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

export interface IDraggedResource {
	resource: URI;
	isExternal: boolean;
}

export function extractResources(e: DragEvent, externalOnly?: boolean): IDraggedResource[] {
	const resources: IDraggedResource[] = [];
	if (e.dataTransfer.types.length > 0) {

		// Check for in-app DND
		if (!externalOnly) {
			const rawData = e.dataTransfer.getData('URL');
			if (rawData) {
				try {
					resources.push({ resource: URI.parse(rawData), isExternal: false });
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
						resources.push({ resource: URI.file(e.dataTransfer.files[i].path), isExternal: true });
					} catch (error) {
						// Invalid URI
					}
				}
			}
		}
	}

	return resources;
}