/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { createStringDataTransferItem, IDataTransferItem, IReadonlyVSDataTransfer, VSDataTransfer } from '../../../../base/common/dataTransfer.js';
import { HierarchicalKind } from '../../../../base/common/hierarchicalKind.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { DocumentPasteContext, DocumentPasteEdit, DocumentPasteEditProvider, DocumentPasteEditsSession } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ChatInputPart } from './chatInputPart.js';
import { IChatWidgetService } from './chat.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { IChatRequestPasteVariableEntry, IChatRequestVariableEntry } from '../common/chatModel.js';
import { IExtensionService, isProposedApiEnabled } from '../../../services/extensions/common/extensions.js';
import { Mimes } from '../../../../base/common/mime.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { basename } from '../../../../base/common/resources.js';

const COPY_MIME_TYPES = 'application/vnd.code.additional-editor-data';

interface SerializedCopyData {
	readonly uri: UriComponents;
	readonly range: IRange;
}

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

		const edit = createCustomPasteEdit(model, imageContext, mimeType, this.kind, localize('pastedImageAttachment', 'Pasted Image Attachment'), this.chatWidgetService);
		return createEditSession(edit);
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
		const data: SerializedCopyData = { range: ranges[0], uri: model.uri.toJSON() };
		customDataTransfer.append(COPY_MIME_TYPES, createStringDataTransferItem(JSON.stringify(data)));
		return customDataTransfer;
	}
}

export class PasteTextProvider implements DocumentPasteEditProvider {

	public readonly kind = new HierarchicalKind('chat.attach.text');
	public readonly providedPasteEditKinds = [this.kind];

	public readonly copyMimeTypes = [];
	public readonly pasteMimeTypes = [COPY_MIME_TYPES];

	constructor(
		private readonly chatWidgetService: IChatWidgetService,
		private readonly modelService: IModelService
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
		const additionalData: SerializedCopyData = JSON.parse(await additionalEditorData.asString());

		const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
		if (!widget) {
			return;
		}

		const start = additionalData.range.startLineNumber;
		const end = additionalData.range.endLineNumber;
		if (start === end) {
			const textModel = this.modelService.getModel(URI.revive(additionalData.uri));
			if (!textModel) {
				return;
			}

			// If copied line text data is the entire line content, then we can paste it as a code attachment. Otherwise, we ignore and use default paste provider.
			const lineContent = textModel.getLineContent(start);
			if (lineContent !== textdata) {
				return;
			}
		}

		const copiedContext = getCopiedContext(textdata, URI.revive(additionalData.uri), metadata.mode, additionalData.range);

		if (token.isCancellationRequested || !copiedContext) {
			return;
		}

		const currentContextIds = widget.attachmentModel.getAttachmentIDs();
		if (currentContextIds.has(copiedContext.id)) {
			return;
		}

		const edit = createCustomPasteEdit(model, copiedContext, Mimes.text, this.kind, localize('pastedCodeAttachment', 'Pasted Code Attachment'), this.chatWidgetService);
		edit.yieldTo = [{ kind: HierarchicalKind.Empty.append('text', 'plain') }];
		return createEditSession(edit);
	}
}

function getCopiedContext(code: string, file: URI, language: string, range: IRange): IChatRequestPasteVariableEntry {
	const fileName = basename(file);
	const start = range.startLineNumber;
	const end = range.endLineNumber;
	const resultText = `Copied Selection of Code: \n\n\n From the file: ${fileName} From lines ${start} to ${end} \n \`\`\`${code}\`\`\``;
	const pastedLines = start === end ? localize('pastedAttachment.oneLine', '1 line') : localize('pastedAttachment.multipleLines', '{0} lines', end + 1 - start);
	return {
		kind: 'paste',
		value: resultText,
		id: `${fileName}${start}${end}${range.startColumn}${range.endColumn}`,
		name: `${fileName} ${pastedLines}`,
		icon: Codicon.code,
		isDynamic: true,
		pastedLines,
		language,
		fileName: file.toString(),
		copiedFrom: {
			uri: file,
			range
		},
		code,
		references: [{
			reference: file,
			kind: 'reference'
		}]
	};
}

function createCustomPasteEdit(model: ITextModel, context: IChatRequestVariableEntry, handledMimeType: string, kind: HierarchicalKind, title: string, chatWidgetService: IChatWidgetService): DocumentPasteEdit {
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
		insertText: '',
		title,
		kind,
		handledMimeType,
		additionalEdit: {
			edits: [customEdit],
		}
	};
}

function createEditSession(edit: DocumentPasteEdit): DocumentPasteEditsSession {
	return {
		edits: [edit],
		dispose: () => { },
	};
}

export class ChatPasteProvidersFeature extends Disposable {
	constructor(
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@IExtensionService extensionService: IExtensionService,
		@IModelService modelService: IModelService
	) {
		super();
		this._register(languageFeaturesService.documentPasteEditProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, pattern: '*', hasAccessToAllModels: true }, new PasteImageProvider(chatWidgetService, extensionService)));
		this._register(languageFeaturesService.documentPasteEditProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, pattern: '*', hasAccessToAllModels: true }, new PasteTextProvider(chatWidgetService, modelService)));
		this._register(languageFeaturesService.documentPasteEditProvider.register('*', new CopyTextProvider()));
	}
}
