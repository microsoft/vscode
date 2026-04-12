/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Codicon } from '../../../../../base/common/codicons.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { SymbolKinds } from '../../../../../editor/common/languages.js';
import { localize } from '../../../../../nls.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { MarkerSeverity } from '../../../../../platform/markers/common/markers.js';
import { isUntitledResourceEditorInput } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IExtensionService, isProposedApiEnabled } from '../../../../services/extensions/common/extensions.js';
import { UntitledTextEditorInput } from '../../../../services/untitled/common/untitledTextEditorInput.js';
import { createNotebookOutputVariableEntry, NOTEBOOK_CELL_OUTPUT_MIME_TYPE_LIST_FOR_CHAT_CONST } from '../../../notebook/browser/contrib/chat/notebookChatUtils.js';
import { getOutputViewModelFromId } from '../../../notebook/browser/controller/cellOutputActions.js';
import { getNotebookEditorFromEditorPane } from '../../../notebook/browser/notebookBrowser.js';
import { CHAT_ATTACHABLE_IMAGE_MIME_TYPES, getAttachableImageExtension } from '../../common/model/chatModel.js';
import { IDiagnosticVariableEntryFilterData } from '../../common/attachments/chatVariableEntries.js';
import { imageToHash } from '../widget/input/editor/chatPasteProviders.js';
import { resizeImage } from '../chatImageUtils.js';
export const IChatAttachmentResolveService = createDecorator('IChatAttachmentResolveService');
let ChatAttachmentResolveService = class ChatAttachmentResolveService {
    constructor(fileService, editorService, extensionService, dialogService) {
        this.fileService = fileService;
        this.editorService = editorService;
        this.extensionService = extensionService;
        this.dialogService = dialogService;
    }
    // --- EDITORS ---
    async resolveEditorAttachContext(editor) {
        // untitled editor
        if (isUntitledResourceEditorInput(editor)) {
            return await this.resolveUntitledEditorAttachContext(editor);
        }
        if (!editor.resource) {
            return undefined;
        }
        let stat;
        try {
            stat = await this.fileService.stat(editor.resource);
        }
        catch {
            return undefined;
        }
        if (!stat.isDirectory && !stat.isFile) {
            return undefined;
        }
        const imageContext = await this.resolveImageEditorAttachContext(editor.resource);
        if (imageContext) {
            return this.extensionService.extensions.some(ext => isProposedApiEnabled(ext, 'chatReferenceBinaryData')) ? imageContext : undefined;
        }
        return await this.resolveResourceAttachContext(editor.resource, stat.isDirectory);
    }
    async resolveUntitledEditorAttachContext(editor) {
        // If the resource is known, we can use it directly
        if (editor.resource) {
            return await this.resolveResourceAttachContext(editor.resource, false);
        }
        // Otherwise, we need to check if the contents are already open in another editor
        const openUntitledEditors = this.editorService.editors.filter(editor => editor instanceof UntitledTextEditorInput);
        for (const canidate of openUntitledEditors) {
            const model = await canidate.resolve();
            const contents = model.textEditorModel?.getValue();
            if (contents === editor.contents) {
                return await this.resolveResourceAttachContext(canidate.resource, false);
            }
        }
        return undefined;
    }
    async resolveResourceAttachContext(resource, isDirectory) {
        let omittedState = 0 /* OmittedState.NotOmitted */;
        if (!isDirectory) {
            if (/\.(svg)$/i.test(resource.path)) {
                omittedState = 2 /* OmittedState.Full */;
            }
        }
        return {
            kind: isDirectory ? 'directory' : 'file',
            value: resource,
            id: resource.toString(),
            name: basename(resource),
            omittedState
        };
    }
    // --- IMAGES ---
    async resolveImageEditorAttachContext(resource, data, mimeType) {
        if (!resource) {
            return undefined;
        }
        if (mimeType) {
            if (!getAttachableImageExtension(mimeType)) {
                return undefined;
            }
        }
        else {
            const match = SUPPORTED_IMAGE_EXTENSIONS_REGEX.exec(resource.path);
            if (!match) {
                return undefined;
            }
            mimeType = getMimeTypeFromPath(match);
        }
        const fileName = basename(resource);
        let dataBuffer;
        if (data) {
            dataBuffer = data;
        }
        else {
            let stat;
            try {
                stat = await this.fileService.stat(resource);
            }
            catch {
                return undefined;
            }
            const readFile = await this.fileService.readFile(resource);
            if (stat.size > 30 * 1024 * 1024) { // 30 MB
                this.dialogService.error(localize('imageTooLarge', 'Image is too large'), localize('imageTooLargeMessage', 'The image {0} is too large to be attached.', fileName));
                throw new Error('Image is too large');
            }
            dataBuffer = readFile.value;
        }
        const isPartiallyOmitted = /\.gif$/i.test(resource.path);
        const imageFileContext = await this.resolveImageAttachContext([{
                id: resource.toString(),
                name: fileName,
                data: dataBuffer.buffer,
                icon: Codicon.fileMedia,
                resource: resource,
                mimeType: mimeType,
                omittedState: isPartiallyOmitted ? 1 /* OmittedState.Partial */ : 0 /* OmittedState.NotOmitted */
            }]);
        return imageFileContext[0];
    }
    resolveImageAttachContext(images) {
        return Promise.all(images.map(async (image) => ({
            id: image.id || await imageToHash(image.data),
            name: image.name,
            fullName: image.resource ? image.resource.path : undefined,
            value: await resizeImage(image.data, image.mimeType),
            icon: image.icon,
            kind: 'image',
            isFile: false,
            isDirectory: false,
            omittedState: image.omittedState || 0 /* OmittedState.NotOmitted */,
            references: image.resource ? [{ reference: image.resource, kind: 'reference' }] : []
        })));
    }
    // --- MARKERS ---
    resolveMarkerAttachContext(markers) {
        return markers.map((marker) => {
            let filter;
            if (!('severity' in marker)) {
                filter = { filterUri: URI.revive(marker.uri), filterSeverity: MarkerSeverity.Warning };
            }
            else {
                filter = IDiagnosticVariableEntryFilterData.fromMarker(marker);
            }
            return IDiagnosticVariableEntryFilterData.toEntry(filter);
        });
    }
    // --- SYMBOLS ---
    resolveSymbolsAttachContext(symbols) {
        return symbols.map(symbol => {
            const resource = URI.file(symbol.fsPath);
            return {
                kind: 'symbol',
                id: symbolId(resource, symbol.range),
                value: { uri: resource, range: symbol.range },
                symbolKind: symbol.kind,
                icon: SymbolKinds.toIcon(symbol.kind),
                fullName: symbol.name,
                name: symbol.name,
            };
        });
    }
    // --- NOTEBOOKS ---
    resolveNotebookOutputAttachContext(data) {
        const notebookEditor = getNotebookEditorFromEditorPane(this.editorService.activeEditorPane);
        if (!notebookEditor) {
            return [];
        }
        const outputViewModel = getOutputViewModelFromId(data.outputId, notebookEditor);
        if (!outputViewModel) {
            return [];
        }
        const mimeType = outputViewModel.pickedMimeType?.mimeType;
        if (mimeType && NOTEBOOK_CELL_OUTPUT_MIME_TYPE_LIST_FOR_CHAT_CONST.includes(mimeType)) {
            const entry = createNotebookOutputVariableEntry(outputViewModel, mimeType, notebookEditor);
            if (!entry) {
                return [];
            }
            return [entry];
        }
        return [];
    }
    // --- DIRECTORIES ---
    async resolveDirectoryImages(directoryUri) {
        const imageEntries = [];
        await this._collectDirectoryImages(directoryUri, imageEntries);
        return imageEntries;
    }
    async _collectDirectoryImages(directoryUri, results) {
        let stat;
        try {
            stat = await this.fileService.resolve(directoryUri);
        }
        catch {
            return;
        }
        if (!stat.children) {
            return;
        }
        const childPromises = [];
        for (const child of stat.children) {
            if (child.isDirectory && !child.isSymbolicLink) {
                childPromises.push(this._collectDirectoryImages(child.resource, results));
            }
            else if (child.isFile && !child.isSymbolicLink && SUPPORTED_IMAGE_EXTENSIONS_REGEX.test(child.resource.path)) {
                childPromises.push(this.resolveImageEditorAttachContext(child.resource).then(entry => {
                    if (entry) {
                        results.push(entry);
                    }
                }).catch(() => { }));
            }
        }
        await Promise.all(childPromises);
    }
    // --- SOURCE CONTROL ---
    resolveSourceControlHistoryItemAttachContext(data) {
        return data.map(d => ({
            id: d.historyItem.id,
            name: d.name,
            value: URI.revive(d.resource),
            historyItem: {
                ...d.historyItem,
                references: []
            },
            kind: 'scmHistoryItem'
        }));
    }
};
ChatAttachmentResolveService = __decorate([
    __param(0, IFileService),
    __param(1, IEditorService),
    __param(2, IExtensionService),
    __param(3, IDialogService)
], ChatAttachmentResolveService);
export { ChatAttachmentResolveService };
function symbolId(resource, range) {
    let rangePart = '';
    if (range) {
        rangePart = `:${range.startLineNumber}`;
        if (range.startLineNumber !== range.endLineNumber) {
            rangePart += `-${range.endLineNumber}`;
        }
    }
    return resource.fsPath + rangePart;
}
const SUPPORTED_IMAGE_EXTENSIONS_REGEX = new RegExp(`\\.(${Object.keys(CHAT_ATTACHABLE_IMAGE_MIME_TYPES).join('|')})$`, 'i');
function getMimeTypeFromPath(match) {
    const ext = match[1].toLowerCase();
    return CHAT_ATTACHABLE_IMAGE_MIME_TYPES[ext];
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hdHRhY2htZW50cy9jaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFbkUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRXhELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRW5GLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUM3RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDaEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBRTdFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNyRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMvRyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUMxRyxPQUFPLEVBQUUsaUNBQWlDLEVBQUUsa0RBQWtELEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUNwSyxPQUFPLEVBQUUsd0JB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