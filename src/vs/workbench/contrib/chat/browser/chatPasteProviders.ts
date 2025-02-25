/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { createStringDataTransferItem, IDataTransferItem, IReadonlyVSDataTransfer, VSDataTransfer } from '../../../../base/common/dataTransfer.js';
import { HierarchicalKind } from '../../../../base/common/hierarchicalKind.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Mimes } from '../../../../base/common/mime.js';
import { basename, joinPath } from '../../../../base/common/resources.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { DocumentPasteContext, DocumentPasteEdit, DocumentPasteEditProvider, DocumentPasteEditsSession } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { localize } from '../../../../nls.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IExtensionService, isProposedApiEnabled } from '../../../services/extensions/common/extensions.js';
import { IChatRequestPasteVariableEntry, IChatRequestVariableEntry } from '../common/chatModel.js';
import { IChatWidgetService } from './chat.js';
import { ChatInputPart } from './chatInputPart.js';
import { resizeImage } from './imageUtils.js';

const COPY_MIME_TYPES = 'application/vnd.code.additional-editor-data';

interface SerializedCopyData {
	readonly uri: UriComponents;
	readonly range: IRange;
}

export class PasteImageProvider implements DocumentPasteEditProvider {
	private readonly imagesFolder: URI;

	public readonly kind = new HierarchicalKind('chat.attach.image');
	public readonly providedPasteEditKinds = [this.kind];

	public readonly copyMimeTypes = [];
	public readonly pasteMimeTypes = ['image/*'];

	constructor(
		private readonly chatWidgetService: IChatWidgetService,
		private readonly extensionService: IExtensionService,
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILogService private readonly logService: ILogService,
	) {
		this.imagesFolder = joinPath(this.environmentService.workspaceStorageHome, 'vscode-chat-images');
		this.cleanupOldImages();
	}

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

		const fileReference = await this.createFileForMedia(currClipboard, mimeType);
		if (token.isCancellationRequested || !fileReference) {
			return;
		}

		const scaledImageData = await resizeImage(currClipboard);
		if (token.isCancellationRequested || !scaledImageData) {
			return;
		}

		const scaledImageContext = await getImageAttachContext(scaledImageData, mimeType, token, tempDisplayName, fileReference);
		if (token.isCancellationRequested || !scaledImageContext) {
			return;
		}

		widget.attachmentModel.addContext(scaledImageContext);

		// Make sure to attach only new contexts
		const currentContextIds = widget.attachmentModel.getAttachmentIDs();
		if (currentContextIds.has(scaledImageContext.id)) {
			return;
		}

		const edit = createCustomPasteEdit(model, scaledImageContext, mimeType, this.kind, localize('pastedImageAttachment', 'Pasted Image Attachment'), this.chatWidgetService);
		return createEditSession(edit);
	}

	private async createFileForMedia(
		dataTransfer: Uint8Array,
		mimeType: string,
	): Promise<URI | undefined> {
		const exists = await this.fileService.exists(this.imagesFolder);
		if (!exists) {
			await this.fileService.createFolder(this.imagesFolder);
		}

		const ext = mimeType.split('/')[1] || 'png';
		const filename = `image-${Date.now()}.${ext}`;
		const fileUri = joinPath(this.imagesFolder, filename);

		const buffer = VSBuffer.wrap(dataTransfer);
		await this.fileService.writeFile(fileUri, buffer);

		return fileUri;
	}

	private async cleanupOldImages(): Promise<void> {
		const exists = await this.fileService.exists(this.imagesFolder);
		if (!exists) {
			return;
		}

		const duration = 7 * 24 * 60 * 60 * 1000; // 7 days
		const files = await this.fileService.resolve(this.imagesFolder);
		if (!files.children) {
			return;
		}

		await Promise.all(files.children.map(async (file) => {
			try {
				const timestamp = this.getTimestampFromFilename(file.name);
				if (timestamp && (Date.now() - timestamp > duration)) {
					await this.fileService.del(file.resource);
				}
			} catch (err) {
				this.logService.error('Failed to clean up old images', err);
			}
		}));
	}

	private getTimestampFromFilename(filename: string): number | undefined {
		const match = filename.match(/image-(\d+)\./);
		if (match) {
			return parseInt(match[1], 10);
		}
		return undefined;
	}
}

async function getImageAttachContext(data: Uint8Array, mimeType: string, token: CancellationToken, displayName: string, resource: URI): Promise<IChatRequestVariableEntry | undefined> {
	const imageHash = await imageToHash(data);
	if (token.isCancellationRequested) {
		return undefined;
	}

	return {
		kind: 'image',
		value: data,
		id: imageHash,
		name: displayName,
		isImage: true,
		icon: Codicon.fileMedia,
		mimeType,
		isPasted: true,
		references: [{ reference: resource, kind: 'reference' }]
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
		@IFileService fileService: IFileService,
		@IModelService modelService: IModelService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@ILogService logService: ILogService,
	) {
		super();
		this._register(languageFeaturesService.documentPasteEditProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, pattern: '*', hasAccessToAllModels: true }, new PasteImageProvider(chatWidgetService, extensionService, fileService, environmentService, logService)));
		this._register(languageFeaturesService.documentPasteEditProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, pattern: '*', hasAccessToAllModels: true }, new PasteTextProvider(chatWidgetService, modelService)));
		this._register(languageFeaturesService.documentPasteEditProvider.register('*', new CopyTextProvider()));
	}
}
