/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IChatRequestVariableEntry } from '../common/chatModel.js';
import { ChatInputPart } from './chatInputPart.js';
import { localize } from '../../../../nls.js';
import { hash } from '../../../../base/common/hash.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

export class ChatImageDropAndPaste extends Disposable {

	constructor(
		private readonly inputPart: ChatInputPart,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();
		this._register(this.inputPart.inputEditor.onDidPaste((e) => {
			if (this.configurationService.getValue<boolean>('chat.experimental.imageAttachments')) {
				this._handlePaste();
			}
		}));
	}

	private async _handlePaste(): Promise<void> {
		const currClipboard = await this.clipboardService.readImage();

		if (!currClipboard || !isImage(currClipboard)) {
			return;
		}
		const context = getImageAttachContext(currClipboard);
		if (!context) {
			return;
		}

		const currentContextIds = new Set(Array.from(this.inputPart.attachedContext).map(context => context.id));
		const filteredContext = [];

		if (!currentContextIds.has(context.id)) {
			currentContextIds.add(context.id);
			filteredContext.push(context);
		}

		this.inputPart.attachContext(false, ...filteredContext);
	}
}

function getImageAttachContext(data: Uint8Array): IChatRequestVariableEntry {
	return {
		value: data,
		id: hash(data).toString(),
		name: localize('pastedImage', 'Pasted Image'),
		isImage: true,
		icon: Codicon.fileMedia,
		isDynamic: true,
	};
}

export function isImage(array: Uint8Array): boolean {
	if (array.length < 4) {
		return false;
	}

	// Magic numbers (identification bytes) for various image formats
	const identifier: { [key: string]: number[] } = {
		png: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
		jpeg: [0xFF, 0xD8, 0xFF],
		bmp: [0x42, 0x4D],
		gif: [0x47, 0x49, 0x46, 0x38],
		tiff: [0x49, 0x49, 0x2A, 0x00]
	};

	return Object.values(identifier).some((signature) =>
		signature.every((byte, index) => array[index] === byte)
	);
}

