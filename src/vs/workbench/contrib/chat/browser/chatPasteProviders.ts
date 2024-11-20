/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { createStringDataTransferItem, IDataTransferItem, IReadonlyVSDataTransfer, VSDataTransfer } from '../../../../base/common/dataTransfer.js';
import { HierarchicalKind } from '../../../../base/common/hierarchicalKind.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { DocumentPasteContext, DocumentPasteEditProvider, DocumentPasteEditsSession } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ChatInputPart } from './chatInputPart.js';
import { IChatWidgetService } from './chat.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { IChatRequestVariableEntry } from '../common/chatModel.js';
import { IExtensionService, isProposedApiEnabled } from '../../../services/extensions/common/extensions.js';
import { Mimes } from '../../../../base/common/mime.js';
import { URI } from '../../../../base/common/uri.js';

const COPY_MIME_TYPES = 'application/vnd.code.additional-editor-data';

export class PasteImageProvider implements DocumentPasteEditProvider {

	public readonly kind = new HierarchicalKind('chat.attach.image');
	public readonly providedPasteEditKinds = [this.kind];

	public readonly copyMimeTypes = [];
	public readonly pasteMimeTypes = ['image/*'];

	constructor(
		private readonly chatWidgetService: IChatWidgetService,
		private readonly extensionService: IExtensionService,
	) { }

	async provideDocumentPasteEdits(model: ITextModel, ranges: readonly IRange[], dataTransfer: IReadonlyVSDataTransfer, context: DocumentPasteContext, token: CancellationToken): Promise<DocumentPasteEditsSession | undefined> {
		if (!this.extensionService.extensions.some(ext => isProposedApiEnabled(ext, 'chatReferenceBinaryData'))) {
			return;
		}

		const supportedMimeTypes = [
			'image/png',
			'image/jpeg',
			'image/jpg',
			'image/bmp',
			'image/gif',
			'image/tiff'
		];

		let mimeType: string | undefined;
		let imageItem: IDataTransferItem | undefined;

		// Find the first matching image type in the dataTransfer
		for (const type of supportedMimeTypes) {
			imageItem = dataTransfer.get(type);
			if (imageItem) {
				mimeType = type;
				break;
			}
		}

		if (!imageItem || !mimeType) {
			return;
		}
		const currClipboard = await imageItem.asFile()?.data();
		if (token.isCancellationRequested || !currClipboard) {
			return;
		}

		const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
		if (!widget) {
			return;
		}

		const attachedVariables = widget.attachmentModel.attachments;
		const displayName = localize('pastedImageName', 'Pasted Image');
		let tempDisplayName = displayName;

		for (let appendValue = 2; attachedVariables.some(attachment => attachment.name === tempDisplayName); appendValue++) {
			tempDisplayName = `${displayName} ${appendValue}`;
		}

		const imageContext = await getImageAttachContext(currClipboard, mimeType, token, tempDisplayName);

		if (token.isCancellationRequested || !imageContext) {
			return;
		}

		// Make sure to attach only new contexts
		const currentContextIds = widget.attachmentModel.getAttachmentIDs();
		if (currentContextIds.has(imageContext.id)) {
			return;
		}

		return getCustomPaste(model, imageContext, mimeType, this.kind, localize('pastedImageAttachment', 'Pasted Image Attachment'), this.chatWidgetService);
	}
}

async function getImageAttachContext(data: Uint8Array, mimeType: string, token: CancellationToken, displayName: string): Promise<IChatRequestVariableEntry | undefined> {
	const imageHash = await imageToHash(data);
	if (token.isCancellationRequested) {
		return undefined;
	}

	return {
		value: data,
		id: imageHash,
		name: displayName,
		isImage: true,
		icon: Codicon.fileMedia,
		isDynamic: true,
		mimeType
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

export class CopyTextProvider implements DocumentPasteEditProvider {
	public readonly providedPasteEditKinds = [];
	public readonly copyMimeTypes = [COPY_MIME_TYPES];
	public readonly pasteMimeTypes = [];

	async prepareDocumentPaste(model: ITextModel, ranges: readonly IRange[], dataTransfer: IReadonlyVSDataTransfer, token: CancellationToken): Promise<undefined | IReadonlyVSDataTransfer> {
		if (model.uri.scheme === ChatInputPart.INPUT_SCHEME) {
			return;
		}
		const customDataTransfer = new VSDataTransfer();
		const rangesString = JSON.stringify({ ranges: ranges[0], uri: model.uri.toString() });
		customDataTransfer.append(COPY_MIME_TYPES, createStringDataTransferItem(rangesString));
		return customDataTransfer;
	}
}

export class PasteTextProvider implements DocumentPasteEditProvider {

	public readonly kind = new HierarchicalKind('chat.attach.text');
	public readonly providedPasteEditKinds = [this.kind];

	public readonly copyMimeTypes = [];
	public readonly pasteMimeTypes = [COPY_MIME_TYPES];

	constructor(
		private readonly chatWidgetService: IChatWidgetService
	) { }

	async provideDocumentPasteEdits(model: ITextModel, ranges: readonly IRange[], dataTransfer: IReadonlyVSDataTransfer, context: DocumentPasteContext, token: CancellationToken): Promise<DocumentPasteEditsSession | undefined> {
		if (model.uri.scheme !== ChatInputPart.INPUT_SCHEME) {
			return;
		}
		const text = dataTransfer.get(Mimes.text);
		const editorData = dataTransfer.get('vscode-editor-data');
		const additionalEditorData = dataTransfer.get(COPY_MIME_TYPES);

		if (!editorData || !text || !additionalEditorData) {
			return;
		}

		const textdata = await text.asString();
		const metadata = JSON.parse(await editorData.asString());
		const additionalData = JSON.parse(await additionalEditorData.asString());

		const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
		if (!widget) {
			return;
		}

		const copiedContext = await getCopiedContext(textdata, additionalData.uri, metadata.mode, additionalData.ranges);

		if (token.isCancellationRequested || !copiedContext) {
			return;
		}

		const currentContextIds = widget.attachmentModel.getAttachmentIDs();
		if (currentContextIds.has(copiedContext.id)) {
			return;
		}

		return getCustomPaste(model, copiedContext, Mimes.text, this.kind, localize('pastedCodeAttachment', 'Pasted Code Attachment'), this.chatWidgetService);
	}
}

async function getCopiedContext(code: string, file: string, language: string, ranges: IRange): Promise<IChatRequestVariableEntry | undefined> {
	const fileName = file.split('/').pop() || 'unknown file';
	const start = ranges.startLineNumber;
	const end = ranges.endLineNumber;
	const resultText = `Copied Selection of Code: \n\n\n From the file: ${fileName} From lines ${start} to ${end} \n \`\`\`${code}\`\`\``;
	const pastedLines = start === end ? localize('pastedAttachment.oneLine', '1 line') : localize('pastedAttachment.multipleLines', '{0} lines', end + 1 - start);
	return {
		kind: 'paste',
		value: resultText,
		id: `${fileName}${start}${end}${ranges.startColumn}${ranges.endColumn}`,
		name: `${fileName} ${pastedLines}`,
		icon: Codicon.code,
		isDynamic: true,
		pastedLines,
		language,
		fileName,
		code,
		references: [{
			reference: URI.parse(file),
			kind: 'reference'
		}]
	};
}

async function getCustomPaste(model: ITextModel, context: IChatRequestVariableEntry, handledMimeType: string, kind: HierarchicalKind, title: string, chatWidgetService: IChatWidgetService): Promise<DocumentPasteEditsSession> {
	const customEdit = {
		resource: model.uri,
		variable: context,
		undo: () => {
			const widget = chatWidgetService.getWidgetByInputUri(model.uri);
			if (!widget) {
				throw new Error('No widget found for undo');
			}
			widget.attachmentModel.delete(context.id);
		},
		redo: () => {
			const widget = chatWidgetService.getWidgetByInputUri(model.uri);
			if (!widget) {
				throw new Error('No widget found for redo');
			}
			widget.attachmentModel.addContext(context);
		},
		metadata: { needsConfirmation: false, label: context.name }
	};

	return {
		edits: [{
			insertText: '', title, kind, handledMimeType,
			additionalEdit: {
				edits: [customEdit],
			}
		}],
		dispose() { },
	};
}

export class ChatPasteProvidersFeature extends Disposable {
	constructor(
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@IExtensionService extensionService: IExtensionService
	) {
		super();
		this._register(languageFeaturesService.documentPasteEditProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, pattern: '*', hasAccessToAllModels: true }, new PasteImageProvider(chatWidgetService, extensionService)));
		this._register(languageFeaturesService.documentPasteEditProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, pattern: '*', hasAccessToAllModels: true }, new PasteTextProvider(chatWidgetService)));
		this._register(languageFeaturesService.documentPasteEditProvider.register('*', new CopyTextProvider()));
	}
}
