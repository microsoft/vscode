/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IChatRequestVariableEntry } from '../common/chatModel.js';
import { ChatInputPart } from './chatInputPart.js';

export class ChatImageDropAndPaste extends Disposable {

	constructor(
		private readonly inputPart: ChatInputPart,
		@IClipboardService private readonly clipboardService: IClipboardService,
	) {
		super();
		this._register(this.inputPart.inputEditor.onDidPaste((e) => {
			this.ondidPaste();
		}));
	}

	private async ondidPaste(): Promise<void> {
		const currClipboard = await this.clipboardService.readImage();

		if (!currClipboard || !isImage(currClipboard)) {
			return;
		}
		const context = getImageAttachContext(currClipboard, 'Image from Clipboard');
		if (!context) {
			return;
		}

		this.inputPart.attachContext(false, context);
	}
}

function getImageAttachContext(data: Uint8Array, fileName: string): IChatRequestVariableEntry {
	return {
		value: data,
		id: 'image',
		name: 'Image from Clipboard',
		isImage: true,
		icon: Codicon.fileMedia,
	};
}

export function isImage(array: Uint8Array): boolean {
	if (array.length < 4) {
		return false;
	}

	const identifier: { [key: string]: number[] } = {
		png: [0x89, 0x50, 0x4E, 0x47],
		jpeg: [0xFF, 0xD8, 0xFF],
		bmp: [0x42, 0x4D],
		gif: [0x47, 0x49, 0x46, 0x38],
		tiff: [0x49, 0x49, 0x2A, 0x00]
	};

	return Object.values(identifier).some((signature) =>
		signature.every((byte, index) => array[index] === byte)
	);
}

