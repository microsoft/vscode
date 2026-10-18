/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { URI } from '../../../../base/common/uri.js';
import { isLinux, isMacintosh } from '../../../../base/common/platform.js';
import { Mimes } from '../../../../base/common/mime.js';
import { Schemas } from '../../../../base/common/network.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { ILogService } from '../../../../platform/log/common/log.js';

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

	async readImage(): Promise<Uint8Array> {
		return this.nativeHostService.readImage();
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
		const resources = this.bufferToResources(await this.nativeHostService.readClipboardBuffer(NativeClipboardService.FILE_FORMAT));
		if (resources.length || !isLinux) {
			return resources;
		}

		// Linux file managers (Nautilus, Dolphin, Nemo, ...) publish copied files as `text/uri-list`
		return this.uriListBufferToFileResources(await this.nativeHostService.readClipboardBuffer(Mimes.uriList));
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

	private uriListBufferToFileResources(buffer: VSBuffer): URI[] {
		const bufferValue = buffer?.toString();
		if (!bufferValue) {
			return [];
		}

		const resources: URI[] = [];
		for (const line of bufferValue.split(/\r?\n/)) {
			const value = line.trim();
			if (!value || value.startsWith('#')) {
				continue;
			}

			try {
				const resource = URI.parse(value, true);
				if (resource.scheme === Schemas.file) {
					resources.push(resource);
				}
			} catch (error) {
				// do not trust clipboard data
			}
		}

		return resources;
	}
}

registerSingleton(IClipboardService, NativeClipboardService, InstantiationType.Delayed);
