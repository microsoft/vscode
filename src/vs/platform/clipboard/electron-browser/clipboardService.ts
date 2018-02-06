/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { clipboard } from 'electron';
import * as platform from 'vs/base/common/platform';
import URI from 'vs/base/common/uri';

export class ClipboardService implements IClipboardService {

	private static FILE_FORMAT = 'application/octet-stream';

	_serviceBrand: any;

	public writeText(text: string): void {
		clipboard.writeText(text);
	}

	public readText(): string {
		return clipboard.readText();
	}

	public readFindText(): string {
		if (platform.isMacintosh) {
			return clipboard.readFindText();
		}

		return '';
	}

	public writeFindText(text: string): void {
		if (platform.isMacintosh) {
			clipboard.writeFindText(text);
		}
	}

	public writeFiles(resources: URI[]): void {
		const files = resources.filter(f => f.scheme === 'file');

		clipboard.writeBuffer(ClipboardService.FILE_FORMAT, this.toBuffer(files));
	}

	public readFiles(): URI[] {
		return this.fromBuffer(clipboard.readBuffer(ClipboardService.FILE_FORMAT));
	}

	private toBuffer(resources: URI[]): Buffer {
		return new Buffer(resources.map(r => r.fsPath).join('\n'));
	}

	private fromBuffer(buffer: Buffer): URI[] {
		if (!buffer) {
			return [];
		}

		try {
			return buffer.toString().split('\n').map(f => URI.file(f));
		} catch (error) {
			return []; // do not trust clipboard data
		}
	}

}
