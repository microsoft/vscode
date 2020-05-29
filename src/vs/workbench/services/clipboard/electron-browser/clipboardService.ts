/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { clipboard } from 'electron';
import { URI } from 'vs/base/common/uri';
import { isMacintosh } from 'vs/base/common/platform';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IElectronService } from 'vs/platform/electron/electron-sandbox/electron';

export class NativeClipboardService implements IClipboardService {

	private static readonly FILE_FORMAT = 'code/file-list'; // Clipboard format for files

	_serviceBrand: undefined;

	constructor(
		@IElectronService private readonly electronService: IElectronService
	) { }

	async writeText(text: string, type?: 'selection' | 'clipboard'): Promise<void> {
		return this.electronService.writeClipboardText(text, type);
	}

	async readText(type?: 'selection' | 'clipboard'): Promise<string> {
		return this.electronService.readClipboardText(type);
	}

	async readFindText(): Promise<string> {
		if (isMacintosh) {
			return this.electronService.readClipboardFindText();
		}

		return '';
	}

	async writeFindText(text: string): Promise<void> {
		if (isMacintosh) {
			return this.electronService.writeClipboardFindText(text);
		}
	}

	async writeResources(resources: URI[]): Promise<void> {
		if (resources.length) {
			return this.electronService.writeClipboardBuffer(NativeClipboardService.FILE_FORMAT, this.resourcesToBuffer(resources));
		}
	}

	async readResources(): Promise<URI[]> {
		return this.bufferToResources(await this.electronService.readClipboardBuffer(NativeClipboardService.FILE_FORMAT));
	}


	async hasResources(): Promise<boolean> {
		return this.electronService.hasClipboard(NativeClipboardService.FILE_FORMAT);
	}

	private resourcesToBuffer(resources: URI[]): Buffer {
		return Buffer.from(resources.map(r => r.toString()).join('\n'));
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

	/** @deprecated */
	readTextSync(): string {
		return clipboard.readText();
	}

	/** @deprecated */
	readFindTextSync(): string {
		if (isMacintosh) {
			return clipboard.readFindText();
		}

		return '';
	}

	/** @deprecated */
	writeFindTextSync(text: string): void {
		if (isMacintosh) {
			clipboard.writeFindText(text);
		}
	}
}

registerSingleton(IClipboardService, NativeClipboardService, true);
