/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { createStringDataTransferItem, IDataTransferItem, IReadonlyVSDataTransfer, VSDataTransfer } from '../../../../../../../base/common/dataTransfer.js';
import { HierarchicalKind } from '../../../../../../../base/common/hierarchicalKind.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { revive } from '../../../../../../../base/common/marshalling.js';
import { Mimes } from '../../../../../../../base/common/mime.js';
import { Schemas } from '../../../../../../../base/common/network.js';
import { basename, joinPath } from '../../../../../../../base/common/resources.js';
import { URI, UriComponents } from '../../../../../../../base/common/uri.js';
import { IRange } from '../../../../../../../editor/common/core/range.js';
import { DocumentPasteContext, DocumentPasteEdit, DocumentPasteEditProvider, DocumentPasteEditsSession } from '../../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../../../editor/common/services/languageFeatures.js';
import { IModelService } from '../../../../../../../editor/common/services/model.js';
import { localize } from '../../../../../../../nls.js';
import { IEnvironmentService } from '../../../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../../platform/log/common/log.js';
import { IExtensionService, isProposedApiEnabled } from '../../../../../../services/extensions/common/extensions.js';
import { IChatRequestPasteVariableEntry, IChatRequestVariableEntry } from '../../../../common/attachments/chatVariableEntries.js';
import { IChatVariablesService, IDynamicVariable } from '../../../../common/attachments/chatVariables.js';
import { IChatWidgetService } from '../../../chat.js';
import { ChatDynamicVariableModel } from '../../../attachments/chatDynamicVariables.js';
import { cleanupOldImages, createFileForMedia, resizeImage } from '../../../chatImageUtils.js';

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
		cleanupOldImages(this.fileService, this.logService, this.imagesFolder,);
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

		const fileReference = await createFileForMedia(this.fileService, this.imagesFolder, currClipboard, mimeType);
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

		// Make sure to attach only new contexts
		const currentContextIds = widget.attachmentModel.getAttachmentIDs();
		if (currentContextIds.has(scaledImageContext.id)) {
			return;
		}

		const edit = createCustomPasteEdit(model, [scaledImageContext], mimeType, this.kind, localize('pastedImageAttachment', 'Pasted Image Attachment'), this.chatWidgetService);
		return createEditSession(edit);
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
		if (model.uri.scheme === Schemas.vscodeChatInput) {
			return;
		}

		const customDataTransfer = new VSDataTransfer();
		const data: SerializedCopyData = { range: ranges[0], uri: model.uri.toJSON() };
		customDataTransfer.append(COPY_MIME_TYPES, createStringDataTransferItem(JSON.stringify(data)));
		return customDataTransfer;
	}
}

class CopyAttachmentsProvider implements DocumentPasteEditProvider {

	static ATTACHMENT_MIME_TYPE = 'application/vnd.chat.attachment+json';

	public readonly kind = new HierarchicalKind('chat.attach.attachments');
	public readonly providedPasteEditKinds = [this.kind];

	public readonly copyMimeTypes = [CopyAttachmentsProvider.ATTACHMENT_MIME_TYPE];
	public readonly pasteMimeTypes = [CopyAttachmentsProvider.ATTACHMENT_MIME_TYPE];

	constructor(
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatVariablesService private readonly chatVariableService: IChatVariablesService
	) { }

	async prepareDocumentPaste(model: ITextModel, _ranges: readonly IRange[], _dataTransfer: IReadonlyVSDataTransfer, _token: CancellationToken): Promise<undefined | IReadonlyVSDataTransfer> {

		const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
		if (!widget || !widget.viewModel) {
			return undefined;
		}

		const attachments = widget.attachmentModel.attachments;
		const dynamicVariables = this.chatVariableService.getDynamicVariables(widget.viewModel.sessionResource);

		if (attachments.length === 0 && dynamicVariables.length === 0) {
			return undefined;
		}

		const result = new VSDataTransfer();
		result.append(CopyAttachmentsProvider.ATTACHMENT_MIME_TYPE, createStringDataTransferItem(JSON.stringify({ attachments, dynamicVariables })));
		return result;
	}

	async provideDocumentPasteEdits(model: ITextModel, _ranges: readonly IRange[], dataTransfer: IReadonlyVSDataTransfer, _context: DocumentPasteContext, token: CancellationToken): Promise<DocumentPasteEditsSession | undefined> {

		const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
		if (!widget || !widget.viewModel) {
			return undefined;
		}

		const chatDynamicVariable = widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID);
		if (!chatDynamicVariable) {
			return undefined;
		}

		const text = dataTransfer.get(Mimes.text);
		const data = dataTransfer.get(CopyAttachmentsProvider.ATTACHMENT_MIME_TYPE);
		const rawData = await data?.asString();
		const textdata = await text?.asString();

		if (textdata === undefined || rawData === undefined) {
			return;
		}

		if (token.isCancellationRequested) {
			return;
		}

		let pastedData: { attachments: IChatRequestVariableEntry[]; dynamicVariables: IDynamicVariable[] } | undefined;
		try {
			pastedData = revive(JSON.parse(rawData));
		} catch {
			//
		}

		if (!Array.isArray(pastedData?.attachments) && !Array.isArray(pastedData?.dynamicVariables)) {
			return;
		}

		const edit: DocumentPasteEdit = {
			insertText: textdata,
			title: localize('pastedChatAttachments', 'Insert Prompt & Attachments'),
			kind: this.kind,
			handledMimeType: CopyAttachmentsProvider.ATTACHMENT_MIME_TYPE,
			additionalEdit: {
				edits: []
			}
		};

		edit.additionalEdit?.edits.push({
			resource: model.uri,
			redo: () => {
				widget.attachmentModel.addContext(...pastedData.attachments);
				for (const dynamicVariable of pastedData.dynamicVariables) {
					chatDynamicVariable?.addReference(dynamicVariable);
				}
				widget.refreshParsedInput();
			},
			undo: () => {
				widget.attachmentModel.delete(...pastedData.attachments.map(c => c.id));
				widget.refreshParsedInput();
			}
		});

		return createEditSession(edit);
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

	async provideDocumentPasteEdits(model: ITextModel, ranges: readonly IRange[], dataTransfer: IReadonlyVSDataTransfer, _context: DocumentPasteContext, token: CancellationToken): Promise<DocumentPasteEditsSession | undefined> {
		if (model.uri.scheme !== Schemas.vscodeChatInput) {
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

		const edit = createCustomPasteEdit(model, [copiedContext], Mimes.text, this.kind, localize('pastedCodeAttachment', 'Pasted Code Attachment'), this.chatWidgetService);
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

function createCustomPasteEdit(model: ITextModel, context: IChatRequestVariableEntry[], handledMimeType: string, kind: HierarchicalKind, title: string, chatWidgetService: IChatWidgetService): DocumentPasteEdit {

	const label = context.length === 1
		? context[0].name
		: localize('pastedAttachment.multiple', '{0} and {1} more', context[0].name, context.length - 1);

	const customEdit = {
		resource: model.uri,
		variable: context,
		undo: () => {
			const widget = chatWidgetService.getWidgetByInputUri(model.uri);
			if (!widget) {
				throw new Error('No widget found for undo');
			}
			widget.attachmentModel.delete(...context.map(c => c.id));
		},
		redo: () => {
			const widget = chatWidgetService.getWidgetByInputUri(model.uri);
			if (!widget) {
				throw new Error('No widget found for redo');
			}
			widget.attachmentModel.addContext(...context);
		},
		metadata: {
			needsConfirmation: false,
			label
		}
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
		@IInstantiationService instaService: IInstantiationService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@IExtensionService extensionService: IExtensionService,
		@IFileService fileService: IFileService,
		@IModelService modelService: IModelService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@ILogService logService: ILogService,
	) {
		super();
		this._register(languageFeaturesService.documentPasteEditProvider.register({ scheme: Schemas.vscodeChatInput, pattern: '*', hasAccessToAllModels: true }, instaService.createInstance(CopyAttachmentsProvider)));
		this._register(languageFeaturesService.documentPasteEditProvider.register({ scheme: Schemas.vscodeChatInput, pattern: '*', hasAccessToAllModels: true }, new PasteImageProvider(chatWidgetService, extensionService, fileService, environmentService, logService)));
		this._register(languageFeaturesService.documentPasteEditProvider.register({ scheme: Schemas.vscodeChatInput, pattern: '*', hasAccessToAllModels: true }, new PasteTextProvider(chatWidgetService, modelService)));
		this._register(languageFeaturesService.documentPasteEditProvider.register('*', new CopyTextProvider()));
		this._register(languageFeaturesService.documentPasteEditProvider.register('*', new CopyTextProvider()));
	}
}
