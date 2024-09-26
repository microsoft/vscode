/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IReadonlyVSDataTransfer } from '../../../../base/common/dataTransfer.js';
import { HierarchicalKind } from '../../../../base/common/hierarchicalKind.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { DocumentPasteContext, DocumentPasteEditProvider, DocumentPasteEditsSession } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ChatInputPart } from './chatInputPart.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IChatWidgetService } from './chat.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { IChatRequestVariableEntry } from '../common/chatModel.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';


export class PasteImageProvider implements DocumentPasteEditProvider {

	public readonly kind = new HierarchicalKind('image');

	public readonly pasteMimeTypes = ['image/*'];
	constructor(
		private readonly clipboardService: IClipboardService,
		private readonly chatWidgetService: IChatWidgetService,
		private readonly configurationService: IConfigurationService
	) { }

	async provideDocumentPasteEdits(_model: ITextModel, _ranges: readonly IRange[], dataTransfer: IReadonlyVSDataTransfer, context: DocumentPasteContext, token: CancellationToken): Promise<DocumentPasteEditsSession | undefined> {
		if (!this.configurationService.getValue<boolean>('chat.experimental.imageAttachments')) {
			return;
		}

		const currClipboard = await this.clipboardService.readImage();

		if (!currClipboard || !isImage(currClipboard)) {
			return;
		}
		const imageContext = await getImageAttachContext(currClipboard);
		if (!imageContext) {
			return;
		}

		const inputPart = this.chatWidgetService.getWidgetByInputUri(_model.uri)?.input;
		if (!inputPart) {
			return;
		}

		const currentContextIds = new Set(Array.from(inputPart.attachedContext).map(context => context.id));
		const filteredContext = [];

		if (!currentContextIds.has(imageContext.id)) {
			currentContextIds.add(imageContext.id);
			filteredContext.push(imageContext);
		}

		inputPart.attachContext(false, ...filteredContext);
		return;
	}
}

async function getImageAttachContext(data: Uint8Array): Promise<IChatRequestVariableEntry> {
	return {
		value: data,
		id: await imageToHash(data),
		name: localize('pastedImage', 'Pasted Image'),
		isImage: true,
		icon: Codicon.fileMedia,
		isDynamic: true,
	};
}

export async function imageToHash(data: Uint8Array): Promise<string> {
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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

export class ChatPasteProvidersFeature extends Disposable {
	constructor(
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IClipboardService clipboardService: IClipboardService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super();
		this._register(languageFeaturesService.documentPasteEditProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, pattern: '*', hasAccessToAllModels: true }, new PasteImageProvider(clipboardService, chatWidgetService, configurationService)));
	}
}
