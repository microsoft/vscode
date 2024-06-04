/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ClipboardAddon, type ClipboardSelectionType, type IClipboardProvider } from '@xterm/addon-clipboard';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export class VscodeClipboardAddon extends ClipboardAddon {
	constructor(
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(undefined, instantiationService.createInstance(VscodeClipboardProvider));
	}
}

class VscodeClipboardProvider implements IClipboardProvider {
	constructor(
		@IClipboardService private readonly _clipboardService: IClipboardService
	) {
	}

	public async readText(type: ClipboardSelectionType): Promise<string> {
		return this._clipboardService.readText(type === 'p' ? 'selection' : 'clipboard');
	}

	public async writeText(type: ClipboardSelectionType, text: string): Promise<void> {
		return this._clipboardService.writeText(text, type === 'p' ? 'selection' : 'clipboard');
	}
}
