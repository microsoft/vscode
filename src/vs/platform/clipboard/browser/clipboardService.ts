/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { URI } from 'vs/base/common/uri';

export class ClipboardService implements IClipboardService {

	_serviceBrand: any;

	private _internalResourcesClipboard: URI[] | undefined;

	async writeText(text: string, type?: string): Promise<void> {
		return navigator.clipboard.writeText(text);
	}

	async readText(type?: string): Promise<string> {
		return navigator.clipboard.readText();
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

registerSingleton(IClipboardService, ClipboardService, true);