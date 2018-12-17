/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { clipboard } from 'electron';
import { URI } from 'vs/base/common/uri';
import { isMacintosh } from 'vs/base/common/platform';

export class ClipboardService implements IClipboardService {

	// Clipboard format for files
	private static FILE_FORMAT = 'code/file-list';

	_serviceBrand: any;

	public writeText(text: string): void {
		clipboard.writeText(text);
	}

	public readText(): string {
		return clipboard.readText();
	}

	public readFindText(): string {
		if (isMacintosh) {
			return clipboard.readFindText();
		}

		return '';
	}

	public writeFindText(text: string): void {
		if (isMacintosh) {
			clipboard.writeFindText(text);
		}
	}

	public writeResources(resources: URI[]): void {
		if (resources.length) {
			clipboard.writeBuffer(ClipboardService.FILE_FORMAT, this.resourcesToBuffer(resources));
		}
	}

	public readResources(): URI[] {
		return this.bufferToResources(clipboard.readBuffer(ClipboardService.FILE_FORMAT));
	}

	public hasResources(): boolean {
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
