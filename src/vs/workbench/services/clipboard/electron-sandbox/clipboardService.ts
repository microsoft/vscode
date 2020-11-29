/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { URI } from 'vs/base/common/uri';
import { isMacintosh } from 'vs/base/common/platform';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { VSBuffer } from 'vs/base/common/buffer';

export class NativeClipboardService implements IClipboardService {

	private static readonly FILE_FORMAT = 'code/file-list'; // Clipboard format for files

	declare readonly _serviceBrand: undefined;

	constructor(
		@INativeHostService private readonly nativeHostService: INativeHostService
	) { }

	async writeText(text: string, type?: 'selection' | 'clipboard'): Promise<void> {
		return this.nativeHostService.writeClipboardText(text, type);
	}

	async readText(type?: 'selection' | 'clipboard'): Promise<string> {
		return this.nativeHostService.readClipboardText(type);
	}

	async readFindText(): Promise<string> {
		if (isMacintosh) {
			return this.nativeHostService.readClipboardFindText();
		}

		return '';
	}

	async writeFindText(text: string): Promise<void> {
		if (isMacintosh) {
			return this.nativeHostService.writeClipboardFindText(text);
		}
	}

	async writeResources(resources: URI[]): Promise<void> {
		if (resources.length) {
			return this.nativeHostService.writeClipboardBuffer(NativeClipboardService.FILE_FORMAT, this.resourcesToBuffer(resources));
		}
	}

	async readResources(): Promise<URI[]> {
		return this.bufferToResources(await this.nativeHostService.readClipboardBuffer(NativeClipboardService.FILE_FORMAT));
	}

	async hasResources(): Promise<boolean> {
		return this.nativeHostService.hasClipboard(NativeClipboardService.FILE_FORMAT);
	}

	private resourcesToBuffer(resources: URI[]): Uint8Array {
		return VSBuffer.fromString(resources.map(r => r.toString()).join('\n')).buffer;
	}

	private bufferToResources(buffer: Uint8Array): URI[] {
		if (!buffer) {
			return [];
		}

		const bufferValue = buffer.toString();
		if (!bufferValue) {
			return [];
		}

		try {
			return bufferValue.split('\n').map(f => URI.parse(f));
		} catch (error) {
			return []; // do not trust clipboard data
		}
	}
}

registerSingleton(IClipboardService, NativeClipboardService, true);
