/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { URI } from 'vs/base/common/uri';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

export class BrowserClipboardService implements IClipboardService {

	_serviceBrand!: ServiceIdentifier<IClipboardService>;

	private _internalResourcesClipboard: URI[] | undefined;

	async writeText(text: string, type?: string): Promise<void> {
		if (type) {
			return; // TODO@sbatten
		}

		return navigator.clipboard.writeText(text);
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
		// @ts-ignore
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

registerSingleton(IClipboardService, BrowserClipboardService, true);
