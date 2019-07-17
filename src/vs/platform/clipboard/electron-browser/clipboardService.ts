/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { clipboard } from 'electron';
import { URI } from 'vs/base/common/uri';
import { isMacintosh } from 'vs/base/common/platform';

export class ClipboardService implements IClipboardService {

	private static FILE_FORMAT = 'code/file-list'; // Clipboard format for files

	_serviceBrand: any;

	async writeText(text: string, type?: 'selection' | 'clipboard'): Promise<void> {
		clipboard.writeText(text, type);
	}

	async readText(type?: 'selection' | 'clipboard'): Promise<string> {
		return clipboard.readText(type);
	}

	readTextSync(): string {
		return clipboard.readText();
	}

	readFindText(): string {
		if (isMacintosh) {
			return clipboard.readFindText();
		}

		return '';
	}

	writeFindText(text: string): void {
		if (isMacintosh) {
			clipboard.writeFindText(text);
		}
	}

	writeResources(resources: URI[]): void {
		if (resources.length) {
			clipboard.writeBuffer(ClipboardService.FILE_FORMAT, this.resourcesToBuffer(resources));
		}
	}

	readResources(): URI[] {
		return this.bufferToResources(clipboard.readBuffer(ClipboardService.FILE_FORMAT));
	}

	hasResources(): boolean {
		return clipboard.has(ClipboardService.FILE_FORMAT);
	}

	private resourcesToBuffer(resources: URI[]): Buffer {
		return Buffer.from(resources.map(r => r.toString()).join('\n'));
	}

	private bufferToResources(buffer: Buffer): URI[] {
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
