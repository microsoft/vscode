var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var CopyAttachmentsProvider_1;
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { createStringDataTransferItem, VSDataTransfer } from '../../../../../../../base/common/dataTransfer.js';
import { alert } from '../../../../../../../base/browser/ui/aria/aria.js';
import { HierarchicalKind } from '../../../../../../../base/common/hierarchicalKind.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { revive } from '../../../../../../../base/common/marshalling.js';
import { Mimes } from '../../../../../../../base/common/mime.js';
import { Schemas } from '../../../../../../../base/common/network.js';
import { basename, joinPath } from '../../../../../../../base/common/resources.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { Position } from '../../../../../../../editor/common/core/position.js';
import { SymbolKinds } from '../../../../../../../editor/common/languages.js';
import { ILanguageFeaturesService } from '../../../../../../../editor/common/services/languageFeatures.js';
import { IModelService } from '../../../../../../../editor/common/services/model.js';
import { IOutlineModelService } from '../../../../../../../editor/contrib/documentSymbols/browser/outlineModel.js';
import { getDefinitionsAtPosition } from '../../../../../../../editor/contrib/gotoSymbol/browser/goToSymbol.js';
import { localize } from '../../../../../../../nls.js';
import { IEnvironmentService } from '../../../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../../platform/log/common/log.js';
import { IExtensionService, isProposedApiEnabled } from '../../../../../../services/extensions/common/extensions.js';
import { isImageVariableEntry } from '../../../../common/attachments/chatVariableEntries.js';
import { chatVariableLeader } from '../../../../common/requestParser/chatParserTypes.js';
import { IChatWidgetService } from '../../../chat.js';
import { getDynamicVariablesForWidget } from '../../../attachments/chatVariables.js';
import { ChatDynamicVariableModel } from '../../../attachments/chatDynamicVariables.js';
import { cleanupOldImages, createFileForMedia, resizeImage } from '../../../chatImageUtils.js';
const COPY_MIME_TYPES = 'application/vnd.code.additional-editor-data';
let PasteImageProvider = class PasteImageProvider {
    constructor(chatWidgetService, extensionService, fileService, environmentService, logService) {
        this.chatWidgetService = chatWidgetService;
        this.extensionService = extensionService;
        this.fileService = fileService;
        this.environmentService = environmentService;
        this.logService = logService;
        this.kind = new HierarchicalKind('chat.attach.image');
        this.providedPasteEditKinds = [this.kind];
        this.copyMimeTypes = [];
        this.pasteMimeTypes = ['image/*'];
        this.imagesFolder = joinPath(this.environmentService.workspaceStorageHome, 'vscode-chat-images');
        cleanupOldImages(this.fileService, this.logService, this.imagesFolder);
    }
    async provideDocumentPasteEdits(model, ranges, dataTransfer, context, token) {
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
        let mimeType;
        let imageItem;
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
};
PasteImageProvider = __decorate([
    __param(2, IFileService),
    __param(3, IEnvironmentService),
    __param(4, ILogService)
], PasteImageProvider);
export { PasteImageProvider };
async function getImageAttachContext(data, mimeType, token, displayName, resource) {
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
export async function imageToHash(data) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
export function isImage(array) {
    if (array.length < 4) {
        return false;
    }
    // Magic numbers (identification bytes) for various image formats
    const identifier = {
        png: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
        jpeg: [0xFF, 0xD8, 0xFF],
        bmp: [0x42, 0x4D],
        gif: [0x47, 0x49, 0x46, 0x38],
        tiff: [0x49, 0x49, 0x2A, 0x00]
    };
    return Object.values(identifier).some((signature) => signature.every((byte, index) => array[index] === byte));
}
let CopyTextProvider = class CopyTextProvider {
    constructor(modelService, languageFeaturesService, outlineModelService) {
        this.modelService = modelService;
        this.languageFeaturesService = languageFeaturesService;
        this.outlineModelService = outlineModelService;
        this.providedPasteEditKinds = [];
        this.copyMimeTypes = [COPY_MIME_TYPES];
        this.pasteMimeTypes = [];
    }
    async prepareDocumentPaste(model, ranges, dataTransfer, token) {
        if (model.uri.scheme === Schemas.vscodeChatInput) {
            return;
        }
        const customDataTransfer = new VSDataTransfer();
        const data = { range: ranges[0], uri: model.uri.toJSON() };
        customDataTransfer.append(COPY_MIME_TYPES, createStringDataTransferItem(JSON.stringify(data)));
        const text = dataTransfer.get(Mimes.text);
        if (text && ranges.length) {
            void this.primeSymbolReferenceCache(model, ranges[0], text, token);
        }
        return customDataTransfer;
    }
    async primeSymbolReferenceCache(model, range, textItem, token) {
        const copiedText = model.getValueInRange(range);
        if (range.startLineNumber !== range.endLineNumber) {
            return;
        }
        if (token.isCancellationRequested || !identifierPattern.test(copiedText)) {
            return;
        }
        cacheSymbolReference(model.uri, range, copiedText, resolveSymbolReference(this.modelService, this.languageFeaturesService, this.outlineModelService, model.uri, range, copiedText, token));
    }
};
CopyTextProvider = __decorate([
    __param(0, IModelService),
    __param(1, ILanguageFeaturesService),
    __param(2, IOutlineModelService)
], CopyTextProvider);
export { CopyTextProvider };
let CopyAttachmentsProvider = class CopyAttachmentsProvider {
    static { CopyAttachmentsProvider_1 = this; }
    static { this.ATTACHMENT_MIME_TYPE = 'application/vnd.chat.attachment+json'; }
    constructor(chatWidgetService) {
        this.chatWidgetService = chatWidgetService;
        this.kind = new HierarchicalKind('chat.attach.attachments');
        this.providedPasteEditKinds = [this.kind];
        this.copyMimeTypes = [CopyAttachmentsProvider_1.ATTACHMENT_MIME_TYPE];
        this.pasteMimeTypes = [CopyAttachmentsProvider_1.ATTACHMENT_MIME_TYPE];
    }
    async prepareDocumentPaste(model, _ranges, _dataTransfer, _token) {
        const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
        if (!widget || !widget.viewModel) {
            return undefined;
        }
        const attachments = widget.attachmentModel.attachments;
        const dynamicVariables = getDynamicVariablesForWidget(widget);
        if (attachments.length === 0 && dynamicVariables.length === 0) {
            return undefined;
        }
        const result = new VSDataTransfer();
        result.append(CopyAttachmentsProvider_1.ATTACHMENT_MIME_TYPE, createStringDataTransferItem(JSON.stringify({ attachments, dynamicVariables })));
        return result;
    }
    async provideDocumentPasteEdits(model, _ranges, dataTransfer, _context, token) {
        const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
        if (!widget || !widget.viewModel) {
            return undefined;
        }
        const chatDynamicVariable = widget.getContrib(ChatDynamicVariableModel.ID);
        if (!chatDynamicVariable) {
            return undefined;
        }
        const text = dataTransfer.get(Mimes.text);
        const data = dataTransfer.get(CopyAttachmentsProvider_1.ATTACHMENT_MIME_TYPE);
        const rawData = await data?.asString();
        const textdata = await text?.asString();
        if (textdata === undefined || rawData === undefined) {
            return;
        }
        if (token.isCancellationRequested) {
            return;
        }
        let pastedData;
        try {
            pastedData = revive(JSON.parse(rawData));
        }
        catch {
            //
        }
        if (!Array.isArray(pastedData?.attachments) && !Array.isArray(pastedData?.dynamicVariables)) {
            return;
        }
        const edit = {
            insertText: textdata,
            title: localize('pastedChatAttachments', 'Insert Prompt & Attachments'),
            kind: this.kind,
            handledMimeType: CopyAttachmentsProvider_1.ATTACHMENT_MIME_TYPE,
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
};
CopyAttachmentsProvider = CopyAttachmentsProvider_1 = __decorate([
    __param(0, IChatWidgetService)
], CopyAttachmentsProvider);
export class PasteTextProvider {
    constructor(chatWidgetService, modelService) {
        this.chatWidgetService = chatWidgetService;
        this.modelService = modelService;
        this.kind = new HierarchicalKind('chat.attach.text');
        this.providedPasteEditKinds = [this.kind];
        this.copyMimeTypes = [];
        this.pasteMimeTypes = [COPY_MIME_TYPES];
    }
    async provideDocumentPasteEdits(model, ranges, dataTransfer, _context, token) {
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
        const additionalData = JSON.parse(await additionalEditorData.asString());
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
function getCopiedContext(code, file, language, range) {
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
function createCustomPasteEdit(model, context, handledMimeType, kind, title, chatWidgetService) {
    const label = context.length === 1
        ? context[0].name
        : localize('pastedAttachment.multiple', '{0} and {1} more', context[0].name, context.length - 1);
    const announceImageAttachment = context.length === 1 && isImageVariableEntry(context[0]);
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
            if (announceImageAttachment) {
                alert(localize('chat.pastedImageAttached', 'Attached image'));
            }
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
function createEditSession(edit) {
    return {
        edits: [edit],
        dispose: () => { },
    };
}
const identifierPattern = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
const symbolCacheMaxSize = 3;
const symbolReferenceCache = [];
function getSymbolReferenceCacheKey(uri, range, text) {
    return `${uri.toString()}|${range.startLineNumber}:${range.startColumn}-${range.endLineNumber}:${range.endColumn}|${text}`;
}
async function getCachedSymbolReference(uri, range, text) {
    const key = getSymbolReferenceCacheKey(uri, range, text);
    return symbolReferenceCache.find(e => e.key === key)?.promise;
}
function cacheSymbolReference(uri, range, text, valuePromise) {
    const entry = {
        key: getSymbolReferenceCacheKey(uri, range, text),
        promise: valuePromise,
    };
    symbolReferenceCache.unshift(entry);
    while (symbolReferenceCache.length > symbolCacheMaxSize) {
        symbolReferenceCache.pop();
    }
    valuePromise.catch(() => {
        const i = symbolReferenceCache.indexOf(entry);
        if (i !== -1) {
            symbolReferenceCache.splice(i, 1);
        }
    });
}
async function resolveSymbolReference(modelService, languageFeaturesService, outlineModelService, sourceUri, sourceRange, pastedText, token) {
    const sourceModel = modelService.getModel(sourceUri);
    if (!sourceModel) {
        return;
    }
    const sourcePosition = new Position(sourceRange.startLineNumber, sourceRange.startColumn);
    const definitions = await getDefinitionsAtPosition(languageFeaturesService.definitionProvider, sourceModel, sourcePosition, false, token);
    if (token.isCancellationRequested || !definitions.length) {
        return;
    }
    const def = definitions[0];
    const defRange = def.targetSelectionRange ?? def.range;
    const defLocation = { uri: def.uri, range: defRange };
    let icon = Codicon.symbolProperty;
    const defModel = modelService.getModel(def.uri);
    if (defModel) {
        try {
            const outline = await outlineModelService.getOrCreate(defModel, token);
            if (!token.isCancellationRequested) {
                const element = outline.getItemEnclosingPosition({ lineNumber: defRange.startLineNumber, column: defRange.startColumn });
                if (element) {
                    icon = SymbolKinds.toIcon(element.symbol.kind);
                }
            }
        }
        catch {
            // Use default icon.
        }
    }
    if (token.isCancellationRequested) {
        return;
    }
    return {
        id: `vscode.symbol/${JSON.stringify(defLocation)}`,
        fullName: pastedText,
        data: defLocation,
        icon
    };
}
let PasteSymbolProvider = class PasteSymbolProvider {
    constructor(chatWidgetService, modelService, languageFeaturesService, outlineModelService) {
        this.chatWidgetService = chatWidgetService;
        this.modelService = modelService;
        this.languageFeaturesService = languageFeaturesService;
        this.outlineModelService = outlineModelService;
        this.kind = new HierarchicalKind('chat.attach.symbol');
        this.providedPasteEditKinds = [this.kind];
        this.copyMimeTypes = [];
        this.pasteMimeTypes = [COPY_MIME_TYPES];
    }
    async provideDocumentPasteEdits(model, ranges, dataTransfer, _context, token) {
        if (model.uri.scheme !== Schemas.vscodeChatInput) {
            return;
        }
        const text = dataTransfer.get(Mimes.text);
        const additionalEditorData = dataTransfer.get(COPY_MIME_TYPES);
        if (!text || !additionalEditorData) {
            return;
        }
        const pastedText = await text.asString();
        if (!identifierPattern.test(pastedText)) {
            return;
        }
        let additionalData;
        try {
            additionalData = JSON.parse(await additionalEditorData.asString());
        }
        catch {
            return;
        }
        const sourceUri = URI.revive(additionalData.uri);
        const sourceRange = additionalData.range;
        const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
        if (!widget) {
            return;
        }
        const cached = await getCachedSymbolReference(sourceUri, sourceRange, pastedText);
        let resolved = cached;
        if (!resolved) {
            resolved = await resolveSymbolReference(this.modelService, this.languageFeaturesService, this.outlineModelService, sourceUri, sourceRange, pastedText, token);
        }
        if (!resolved) {
            return;
        }
        if (token.isCancellationRequested) {
            return;
        }
        const symText = `${chatVariableLeader}sym:${pastedText}`;
        const pasteRange = ranges[0];
        const insertText = `${symText} `;
        const refRange = {
            startLineNumber: pasteRange.startLineNumber,
            startColumn: pasteRange.startColumn,
            endLineNumber: pasteRange.startLineNumber,
            endColumn: pasteRange.startColumn + symText.length
        };
        const dynamicRef = {
            id: resolved.id,
            fullName: resolved.fullName,
            range: refRange,
            data: resolved.data,
            icon: resolved.icon
        };
        const edit = {
            insertText,
            title: localize('pastedSymbolReference', 'Pasted Symbol Reference'),
            kind: this.kind,
            handledMimeType: COPY_MIME_TYPES,
            additionalEdit: {
                edits: [{
                        resource: model.uri,
                        redo: () => {
                            const w = this.chatWidgetService.getWidgetByInputUri(model.uri);
                            w?.getContrib(ChatDynamicVariableModel.ID)?.addReference(dynamicRef);
                        },
                        undo: () => {
                            // The text removal by undo is sufficient; the dynamic variable
                            // model auto-cleans when the decoration text changes.
                        }
                    }]
            }
        };
        edit.yieldTo = [{ kind: new HierarchicalKind('chat.attach.text') }];
        return createEditSession(edit);
    }
};
PasteSymbolProvider = __decorate([
    __param(0, IChatWidgetService),
    __param(1, IModelService),
    __param(2, ILanguageFeaturesService),
    __param(3, IOutlineModelService)
], PasteSymbolProvider);
let ChatPasteProvidersFeature = class ChatPasteProvidersFeature extends Disposable {
    constructor(instaService, languageFeaturesService, chatWidgetService, extensionService, fileService, modelService, environmentService, logService) {
        super();
        this._register(languageFeaturesService.documentPasteEditProvider.register({ scheme: Schemas.vscodeChatInput, pattern: '*', hasAccessToAllModels: true }, instaService.createInstance(CopyAttachmentsProvider)));
        this._register(languageFeaturesService.documentPasteEditProvider.register({ scheme: Schemas.vscodeChatInput, pattern: '*', hasAccessToAllModels: true }, new PasteImageProvider(chatWidgetService, extensionService, fileService, environmentService, logService)));
        this._register(languageFeaturesService.documentPasteEditProvider.register({ scheme: Schemas.vscodeChatInput, pattern: '*', hasAccessToAllModels: true }, new PasteTextProvider(chatWidgetService, modelService)));
        this._register(languageFeaturesService.documentPasteEditProvider.register({ scheme: Schemas.vscodeChatInput, pattern: '*', hasAccessToAllModels: true }, instaService.createInstance(PasteSymbolProvider)));
        this._register(languageFeaturesService.documentPasteEditProvider.register('*', instaService.createInstance(CopyTextProvider)));
    }
};
ChatPasteProvidersFeature = __decorate([
    __param(0, IInstantiationService),
    __param(1, ILanguageFeaturesService),
    __param(2, IChatWidgetService),
    __param(3, IExtensionService),
    __param(4, IFileService),
    __param(5, IModelService),
    __param(6, IEnvironmentService),
    __param(7, ILogService)
], ChatPasteProvidersFeature);
export { ChatPasteProvidersFeature };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFBhc3RlUHJvdmlkZXJzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9pbnB1dC9lZGl0b3IvY2hhdFBhc3RlUHJvdmlkZXJzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFLQSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDdkUsT0FBTyxFQUFFLDRCQUE0QixFQUE4QyxjQUFjLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1SixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDMUUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDeEYsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUN6RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDakUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDbkYsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSx5Q0FBeUMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFFL0UsT0FBTyxFQUFpRyxXQUFXLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUU3SyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUMzRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDckYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sNkVBQTZFLENBQUM7QUFD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