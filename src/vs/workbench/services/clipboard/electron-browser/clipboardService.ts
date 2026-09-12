/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ClipboardTarget, IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { URI } from '../../../../base/common/uri.js';
import { isMacintosh } from '../../../../base/common/platform.js';
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

	async writeText(text: string, target?: ClipboardTarget): Promise<void> {
		this.logService.trace('NativeClipboardService#writeText called with target:', target, ' with text.length:', text.length);
		return this.nativeHostService.writeClipboardText(text, toElectronClipboardType(target));
	}

	async readText(target?: ClipboardTarget): Promise<string> {
		this.logService.trace('NativeClipboardService#readText called with target:', target);
		return this.nativeHostService.readClipboardText(toElectronClipboardType(target));
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

// Electron names the X11 PRIMARY selection 'selection'. Keyed by target so a new
// member of the union has to be mapped here rather than silently defaulting.
const electronClipboardTypes: Record<ClipboardTarget, 'selection' | 'clipboard'> = {
	system: 'clipboard',
	primary: 'selection'
};

function toElectronClipboardType(target: ClipboardTarget = 'system'): 'selection' | 'clipboard' {
	return electronClipboardTypes[target];
}

registerSingleton(IClipboardService, NativeClipboardService, InstantiationType.Delayed);
