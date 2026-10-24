/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { createStringDataTransferItem, IReadonlyVSDataTransfer, VSDataTransfer } from '../../../../base/common/dataTransfer.js';
import { IClipboardService } from '../../common/clipboardService.js';

export class TestClipboardService implements IClipboardService {
	readonly supportsClipboardData: boolean = true;

	private data: IReadonlyVSDataTransfer = new VSDataTransfer();

	async readData(): Promise<IReadonlyVSDataTransfer | undefined> {
		return this.data;
	}

	async writeData(data: IReadonlyVSDataTransfer): Promise<void> {
		if (!data.size) {
			return;
		}
		const snapshot = new VSDataTransfer();
		for (const [mime, item] of data) {
			snapshot.append(mime, item.asFile() ? item : createStringDataTransferItem(await item.asString()));
		}
		this.data = snapshot;
	}

	readImage(): Promise<Uint8Array> {
		throw new Error('Method not implemented.');
	}

	private image: Uint8Array | undefined = undefined;

	async writeImage(data: Uint8Array | Promise<Uint8Array>): Promise<void> {
		this.image = await data;
	}

	/**
	 * The image most recently written with {@link writeImage}.
	 */
	get writtenImage(): Uint8Array | undefined {
		return this.image;
	}

	_serviceBrand: undefined;

	triggerPaste(): Promise<void> | undefined {
		return Promise.resolve();
	}

	async writeText(text: string, type?: string): Promise<void> {
		const data = new VSDataTransfer();
		data.replace('text/plain', createStringDataTransferItem(text));
		this.data = data;
	}

	async readText(type?: string): Promise<string> {
		return await this.data.get('text/plain')?.asString() ?? '';
	}

	private findText: string | undefined = undefined;

	async readFindText(): Promise<string> {
		return this.findText ?? '';
	}

	async writeFindText(text: string): Promise<void> {
		this.findText = text;
	}

	private resources: URI[] | undefined = undefined;

	async writeResources(resources: URI[]): Promise<void> {
		this.resources = resources;
	}

	async readResources(): Promise<URI[]> {
		return this.resources ?? [];
	}

	async hasResources(): Promise<boolean> {
		return Array.isArray(this.resources) && this.resources.length > 0;
	}
}
