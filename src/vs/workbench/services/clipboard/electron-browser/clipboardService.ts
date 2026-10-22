/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { URI } from '../../../../base/common/uri.js';
import { isMacintosh, isWindows } from '../../../../base/common/platform.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { getActiveWindow } from '../../../../base/browser/dom.js';
import { IReadonlyVSDataTransfer } from '../../../../base/common/dataTransfer.js';
import { readClipboardData, supportsClipboardData, writeClipboardData } from '../../../../platform/clipboard/browser/clipboardData.js';

export class NativeClipboardService implements IClipboardService {

	private static readonly FILE_FORMAT = 'code/file-list'; // Clipboard format for files

	declare readonly _serviceBrand: undefined;

	constructor(
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@ILogService private readonly logService: ILogService
	) { }

	async triggerPaste(targetWindowId: number): Promise<void> {
		this.logService.trace('NativeClipboardService#triggerPaste called');
		return this.nativeHostService.triggerPaste({ targetWindowId });
	}

	get supportsClipboardData(): boolean {
		return supportsClipboardData(getActiveWindow().navigator.clipboard, typeof ClipboardItem === 'undefined' ? undefined : ClipboardItem);
	}

	async readData(): Promise<IReadonlyVSDataTransfer | undefined> {
		this.logService.trace('NativeClipboardService#readData');
		const clipboard = getActiveWindow().navigator.clipboard;
		const fileFormats = isMacintosh ? ['public.file-url', 'NSFilenamesPboardType'] : isWindows ? ['FileNameW', 'CF_HDROP'] : ['text/uri-list', 'x-special/gnome-copied-files'];
		const hasFiles = await Promise.all(fileFormats.map(format => this.nativeHostService.hasClipboard(format)));
		if (hasFiles.some(Boolean)) {
			return undefined;
		}
		return readClipboardData(clipboard);
	}

	writeData(data: IReadonlyVSDataTransfer): Promise<void> {
		this.logService.trace('NativeClipboardService#writeData');
		return writeClipboardData(getActiveWindow().navigator.clipboard, data);
	}

	async readImage(): Promise<Uint8Array> {
		return this.nativeHostService.readImage();
	}

	async writeImage(data: Uint8Array | Promise<Uint8Array>): Promise<void> {
		return this.nativeHostService.writeImage(VSBuffer.wrap(await data));
	}

	async writeText(text: string, type?: 'selection' | 'clipboard'): Promise<void> {
		this.logService.trace('NativeClipboardService#writeText called with type:', type, ' with text.length:', text.length);
		return this.nativeHostService.writeClipboardText(text, type);
	}

	async readText(type?: 'selection' | 'clipboard'): Promise<string> {
		this.logService.trace('NativeClipboardService#readText called with type:', type);
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

	private resourcesToBuffer(resources: URI[]): VSBuffer {
		return VSBuffer.fromString(resources.map(r => r.toString()).join('\n'));
	}

	private bufferToResources(buffer: VSBuffer): URI[] {
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

registerSingleton(IClipboardService, NativeClipboardService, InstantiationType.Delayed);
