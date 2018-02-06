/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { clipboard } from 'electron';
import URI from 'vs/base/common/uri';
import { isMacintosh } from 'vs/base/common/platform';
import { parse } from 'fast-plist';

export class ClipboardService implements IClipboardService {

	// Clipboard format for files
	// Windows/Linux: custom
	// macOS: native, see https://developer.apple.com/documentation/appkit/nsfilenamespboardtype
	private static FILE_FORMAT = isMacintosh ? 'NSFilenamesPboardType' : 'code/file-list';

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

	public writeFiles(resources: URI[]): void {
		const files = resources.filter(f => f.scheme === 'file');

		if (files.length) {
			clipboard.writeBuffer(ClipboardService.FILE_FORMAT, this.filesToBuffer(files));
		}
	}

	public readFiles(): URI[] {
		return this.bufferToFiles(clipboard.readBuffer(ClipboardService.FILE_FORMAT));
	}

	public hasFiles(): boolean {
		return clipboard.has(ClipboardService.FILE_FORMAT);
	}

	private filesToBuffer(resources: URI[]): Buffer {
		if (isMacintosh) {
			return this.macOSFilesToBuffer(resources);
		}

		return new Buffer(resources.map(r => r.fsPath).join('\n'));
	}

	private bufferToFiles(buffer: Buffer): URI[] {
		if (!buffer) {
			return [];
		}

		const bufferValue = buffer.toString();
		if (!bufferValue) {
			return [];
		}

		try {
			if (isMacintosh) {
				return this.macOSBufferToFiles(bufferValue);
			}

			return bufferValue.split('\n').map(f => URI.file(f));
		} catch (error) {
			return []; // do not trust clipboard data
		}
	}

	private macOSFilesToBuffer(resources: URI[]): Buffer {
		return new Buffer(`
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
	<array>
	${resources.map(r => `<string>${r.fsPath}</string>`).join('\n')}
	</array>
</plist>
		`);
	}

	private macOSBufferToFiles(buffer: string): URI[] {
		const result = parse(buffer) as string[];
		if (Array.isArray(result)) {
			return result.map(f => URI.file(f));
		}

		return [];
	}
}