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
import { IUndoRedoService } from '../../../../platform/undoRedo/common/undoRedo.js';
import { Mimes } from '../../../../base/common/mime.js';
import { IAttachmentEdit } from '../../bulkEdit/browser/bulkEditService.js';

export class PasteImageProvider implements DocumentPasteEditProvider {

	public readonly kind = new HierarchicalKind('image');

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

		const customEdit: IAttachmentEdit = {
			resource: model.uri,
			variable: imageContext,
			undo: () => {
				widget.attachmentModel.delete(imageContext.id);
			},
			redo: () => {
				widget.attachmentModel.addContext(imageContext);
			}
		};

		return {
			edits: [{
				insertText: '', title: 'Empty Edit', kind: new HierarchicalKind(''), handledMimeType: Mimes.text,
				additionalEdit: {
					edits: [customEdit],
				}
			}],
			dispose() { },
		};
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
		isFile: false,
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

	static readonly id = 'text';
	static readonly kind = new HierarchicalKind('text.plain');

	readonly id = PasteTextProvider.id;
	readonly kind = PasteTextProvider.kind;

	readonly copyMimeTypes = [Mimes.text, 'vscode-editor-data'];

	async prepareDocumentPaste(model: ITextModel, ranges: readonly IRange[], dataTransfer: IReadonlyVSDataTransfer, token: CancellationToken): Promise<undefined | IReadonlyVSDataTransfer> {
		if (model.uri.scheme === ChatInputPart.INPUT_SCHEME) {
			return;
		}
		const customDataTransfer = new VSDataTransfer();
		const rangesString = JSON.stringify({ ranges: ranges[0], uri: model.uri.toString() });
		customDataTransfer.append('additional-editor-data', createStringDataTransferItem(rangesString));
		return customDataTransfer;
	}
}

export class PasteTextProvider implements DocumentPasteEditProvider {

	static readonly id = 'text';
	static readonly kind = new HierarchicalKind('text.plain');

	readonly id = PasteTextProvider.id;
	readonly kind = PasteTextProvider.kind;

	readonly dropMimeTypes = [Mimes.text];
	readonly pasteMimeTypes = [Mimes.text, 'vscode-editor-data', 'additional-editor-data'];

	constructor(
		private readonly chatWidgetService: IChatWidgetService
	) { }


	async provideDocumentPasteEdits(model: ITextModel, ranges: readonly IRange[], dataTransfer: IReadonlyVSDataTransfer, context: DocumentPasteContext, token: CancellationToken): Promise<DocumentPasteEditsSession | undefined> {
		if (model.uri.scheme !== ChatInputPart.INPUT_SCHEME) {
			return;
		}
		const text = dataTransfer.get(Mimes.text);
		const rawmetadata = dataTransfer.get('vscode-editor-data');
		const additionalMetaData = dataTransfer.get('additional-editor-data');

		if (!rawmetadata || !text || !additionalMetaData) {
			return;
		}

		const textdata = await text.asString();
		const metadata = JSON.parse(await rawmetadata.asString());
		const additionalData = JSON.parse(await additionalMetaData.asString());
		const fileName = additionalData.uri.split('/').pop() || 'unknown file';

		const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
		if (!widget) {
			return;
		}

		const copiedContext = await getCopiedContext(textdata, fileName, metadata.mode, additionalData.ranges);

		if (token.isCancellationRequested || !copiedContext) {
			return;
		}

		const currentContextIds = widget.attachmentModel.getAttachmentIDs();
		if (currentContextIds.has(copiedContext.id)) {
			return;
		}

		const customEdit: IAttachmentEdit = {
			resource: model.uri,
			variable: copiedContext,
			undo: () => {
				widget.attachmentModel.delete(copiedContext.id);
			},
			redo: () => {
				widget.attachmentModel.addContext(copiedContext);
			}
		};

		return {
			edits: [{
				insertText: '', title: 'Empty Edit', kind: new HierarchicalKind(''), handledMimeType: Mimes.text,
				additionalEdit: {
					edits: [customEdit],
				}
			}],
			dispose() { },
		};
	}
}

async function getCopiedContext(data: string, fileName: string, language: string, ranges: IRange): Promise<IChatRequestVariableEntry | undefined> {
	const start = ranges.startLineNumber;
	const end = ranges.endLineNumber;
	const resultText = `Copied Selection of Code: \n\n\n From the file: ${fileName} From lines ${start} to ${end} \n \`\`\`${data}\`\`\``;
	return {
		value: resultText,
		id: `${fileName}${start}${end}${ranges.startColumn}${ranges.endColumn}`,
		name: start === end ? localize('pastedAttachment.oneLine', '1 line') : localize('pastedAttachment.multipleLines', '{0} lines', end + 1 - start),
		fullName: fileName,
		isImage: false,
		icon: Codicon.code,
		isDynamic: true,
		isFile: false,
		code: data,
		language: language,
	};
}

export class ChatPasteProvidersFeature extends Disposable {
	constructor(
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@IExtensionService extensionService: IExtensionService,
		@IUndoRedoService undoRedoService: IUndoRedoService
	) {
		super();
		this._register(languageFeaturesService.documentPasteEditProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, pattern: '*', hasAccessToAllModels: true }, new PasteImageProvider(chatWidgetService, extensionService)));
		this._register(languageFeaturesService.documentPasteEditProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, pattern: '*', hasAccessToAllModels: true }, new PasteTextProvider(chatWidgetService)));
		this._register(languageFeaturesService.documentPasteEditProvider.register('*', new CopyTextProvider()));
	}
}
