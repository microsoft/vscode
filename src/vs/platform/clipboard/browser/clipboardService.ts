/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { URI } from 'vs/base/common/uri';

export class BrowserClipboardService implements IClipboardService {

	_serviceBrand: undefined;

	private _internalResourcesClipboard: URI[] | undefined;

	async writeText(text: string, type?: string): Promise<void> {
		if (type) {
			return; // TODO@sbatten
		}

		if (navigator.clipboard && navigator.clipboard.writeText) {
			return navigator.clipboard.writeText(text);
		} else {
			const activeElement = <HTMLElement>document.activeElement;
			const newTextarea = document.createElement('textarea');
			newTextarea.className = 'clipboard-copy';
			newTextarea.style.visibility = 'false';
			newTextarea.style.height = '1px';
			newTextarea.style.width = '1px';
			newTextarea.setAttribute('aria-hidden', 'true');
			newTextarea.style.position = 'absolute';
			newTextarea.style.top = '-1000';
			newTextarea.style.left = '-1000';
			document.body.appendChild(newTextarea);
			newTextarea.value = text;
			newTextarea.focus();
			newTextarea.select();
			document.execCommand('copy');
			activeElement.focus();
			document.body.removeChild(newTextarea);
		}
		return;
	}

	async readText(type?: string): Promise<string> {
		if (type) {
			return ''; // TODO@sbatten
		}

		return navigator.clipboard.readText();
	}

	readTextSync(): string | undefined {
		return undefined;
	}

	readFindText(): string {
		// @ts-expect-error
		return undefined;
	}

	writeFindText(text: string): void { }

	writeResources(resources: URI[]): void {
		this._internalResourcesClipboard = resources;
	}

	readResources(): URI[] {
		return this._internalResourcesClipboard || [];
	}

	hasResources(): boolean {
		return this._internalResourcesClipboard !== undefined && this._internalResourcesClipboard.length > 0;
	}
}
