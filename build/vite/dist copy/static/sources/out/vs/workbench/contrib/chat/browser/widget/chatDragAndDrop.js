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
import { DataTransfers } from '../../../../../base/browser/dnd.js';
import { $, DragAndDropObserver } from '../../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { coalesce } from '../../../../../base/common/arrays.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { UriList } from '../../../../../base/common/dataTransfer.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { Mimes } from '../../../../../base/common/mime.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { CodeDataTransfers, containsDragType, extractEditorsDropData, extractMarkerDropData, extractNotebookCellOutputDropData, extractSymbolDropData } from '../../../../../platform/dnd/browser/dnd.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IThemeService, Themable } from '../../../../../platform/theme/common/themeService.js';
import { ISharedWebContentExtractorService } from '../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { IExtensionService, isProposedApiEnabled } from '../../../../services/extensions/common/extensions.js';
import { extractSCMHistoryItemDropData } from '../../../scm/browser/scmHistoryChatContext.js';
import { IChatAttachmentResolveService } from '../attachments/chatAttachmentResolveService.js';
import { convertStringToUInt8Array } from '../chatImageUtils.js';
var ChatDragAndDropType;
(function (ChatDragAndDropType) {
    ChatDragAndDropType[ChatDragAndDropType["FILE_INTERNAL"] = 0] = "FILE_INTERNAL";
    ChatDragAndDropType[ChatDragAndDropType["FILE_EXTERNAL"] = 1] = "FILE_EXTERNAL";
    ChatDragAndDropType[ChatDragAndDropType["FOLDER"] = 2] = "FOLDER";
    ChatDragAndDropType[ChatDragAndDropType["IMAGE"] = 3] = "IMAGE";
    ChatDragAndDropType[ChatDragAndDropType["SYMBOL"] = 4] = "SYMBOL";
    ChatDragAndDropType[ChatDragAndDropType["HTML"] = 5] = "HTML";
    ChatDragAndDropType[ChatDragAndDropType["MARKER"] = 6] = "MARKER";
    ChatDragAndDropType[ChatDragAndDropType["NOTEBOOK_CELL_OUTPUT"] = 7] = "NOTEBOOK_CELL_OUTPUT";
    ChatDragAndDropType[ChatDragAndDropType["SCM_HISTORY_ITEM"] = 8] = "SCM_HISTORY_ITEM";
})(ChatDragAndDropType || (ChatDragAndDropType = {}));
const IMAGE_DATA_REGEX = /^data:image\/[a-z]+;base64,/;
const URL_REGEX = /^https?:\/\/.+/;
let ChatDragAndDrop = class ChatDragAndDrop extends Themable {
    constructor(widgetRef, attachmentModel, styles, themeService, extensionService, webContentExtractorService, logService, chatAttachmentResolveService) {
        super(themeService);
        this.widgetRef = widgetRef;
        this.attachmentModel = attachmentModel;
        this.styles = styles;
        this.extensionService = extensionService;
        this.webContentExtractorService = webContentExtractorService;
        this.logService = logService;
        this.chatAttachmentResolveService = chatAttachmentResolveService;
        this.overlays = new Map();
        this.overlayTextBackground = '';
        this.disableOverlay = false;
        this.currentActiveTarget = undefined;
        this.updateStyles();
        this._register(toDisposable(() => {
            this.overlays.forEach(({ overlay, disposable }) => {
                disposable.dispose();
                overlay.remove();
            });
            this.overlays.clear();
            this.currentActiveTarget = undefined;
            this.overlayText?.remove();
            this.overlayText = undefined;
        }));
    }
    addOverlay(target, overlayContainer) {
        this.removeOverlay(target);
        const { overlay, disposable } = this.createOverlay(target, overlayContainer);
        this.overlays.set(target, { overlay, disposable });
    }
    removeOverlay(target) {
        if (this.currentActiveTarget === target) {
            this.currentActiveTarget = undefined;
        }
        const existingOverlay = this.overlays.get(target);
        if (existingOverlay) {
            existingOverlay.overlay.remove();
            existingOverlay.disposable.dispose();
            this.overlays.delete(target);
        }
    }
    setDisabledOverlay(disable) {
        this.disableOverlay = disable;
    }
    createOverlay(target, overlayContainer) {
        const overlay = document.createElement('div');
        overlay.classList.add('chat-dnd-overlay');
        this.updateOverlayStyles(overlay);
        overlayContainer.appendChild(overlay);
        const disposable = new DragAndDropObserver(target, {
            onDragOver: (e) => {
                if (this.disableOverlay) {
                    return;
                }
                e.stopPropagation();
                e.preventDefault();
                if (target === this.currentActiveTarget) {
                    return;
                }
                if (this.currentActiveTarget) {
                    this.setOverlay(this.currentActiveTarget, undefined);
                }
                this.currentActiveTarget = target;
                this.onDragEnter(e, target);
            },
            onDragLeave: (e) => {
                if (this.disableOverlay) {
                    return;
                }
                if (target === this.currentActiveTarget) {
                    this.currentActiveTarget = undefined;
                }
                this.onDragLeave(e, target);
            },
            onDrop: (e) => {
                if (this.disableOverlay) {
                    return;
                }
                e.stopPropagation();
                e.preventDefault();
                if (target !== this.currentActiveTarget) {
                    return;
                }
                this.currentActiveTarget = undefined;
                this.onDrop(e, target);
            },
        });
        return { overlay, disposable };
    }
    onDragEnter(e, target) {
        const estimatedDropType = this.guessDropType(e);
        this.updateDropFeedback(e, target, estimatedDropType);
    }
    onDragLeave(e, target) {
        this.updateDropFeedback(e, target, undefined);
    }
    onDrop(e, target) {
        this.updateDropFeedback(e, target, undefined);
        this.drop(e);
    }
    async drop(e) {
        const contexts = await this.resolveAttachmentsFromDragEvent(e);
        if (contexts.length === 0) {
            return;
        }
        this.attachmentModel.addContext(...contexts);
    }
    updateDropFeedback(e, target, dropType) {
        const showOverlay = dropType !== undefined;
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = showOverlay ? 'copy' : 'none';
        }
        this.setOverlay(target, dropType);
    }
    guessDropType(e) {
        // This is an estimation based on the datatransfer types/items
        if (containsDragType(e, CodeDataTransfers.NOTEBOOK_CELL_OUTPUT)) {
            return ChatDragAndDropType.NOTEBOOK_CELL_OUTPUT;
        }
        else if (containsDragType(e, CodeDataTransfers.SCM_HISTORY_ITEM)) {
            return ChatDragAndDropType.SCM_HISTORY_ITEM;
        }
        else if (containsImageDragType(e)) {
            return this.extensionService.extensions.some(ext => isProposedApiEnabled(ext, 'chatReferenceBinaryData')) ? ChatDragAndDropType.IMAGE : undefined;
        }
        else if (containsDragType(e, 'text/html')) {
            return ChatDragAndDropType.HTML;
        }
        else if (containsDragType(e, CodeDataTransfers.SYMBOLS)) {
            return ChatDragAndDropType.SYMBOL;
        }
        else if (containsDragType(e, CodeDataTransfers.MARKERS)) {
            return ChatDragAndDropType.MARKER;
        }
        else if (containsDragType(e, DataTransfers.FILES)) {
            return ChatDragAndDropType.FILE_EXTERNAL;
        }
        else if (containsDragType(e, CodeDataTransfers.EDITORS)) {
            return ChatDragAndDropType.FILE_INTERNAL;
        }
        else if (containsDragType(e, Mimes.uriList, CodeDataTransfers.FILES, DataTransfers.RESOURCES, DataTransfers.INTERNAL_URI_LIST)) {
            return ChatDragAndDropType.FOLDER;
        }
        return undefined;
    }
    isDragEventSupported(e) {
        // if guessed drop type is undefined, it means the drop is not supported
        const dropType = this.guessDropType(e);
        return dropType !== undefined;
    }
    getDropTypeName(type) {
        switch (type) {
            case ChatDragAndDropType.FILE_INTERNAL: return localize('file', 'File');
            case ChatDragAndDropType.FILE_EXTERNAL: return localize('file', 'File');
            case ChatDragAndDropType.FOLDER: return localize('folder', 'Folder');
            case ChatDragAndDropType.IMAGE: return localize('image', 'Image');
            case ChatDragAndDropType.SYMBOL: return localize('symbol', 'Symbol');
            case ChatDragAndDropType.MARKER: return localize('problem', 'Problem');
            case ChatDragAndDropType.HTML: return localize('url', 'URL');
            case ChatDragAndDropType.NOTEBOOK_CELL_OUTPUT: return localize('notebookOutput', 'Output');
            case ChatDragAndDropType.SCM_HISTORY_ITEM: return localize('scmHistoryItem', 'Change');
        }
    }
    async resolveAttachmentsFromDragEvent(e) {
        if (!this.isDragEventSupported(e)) {
            return [];
        }
        if (containsDragType(e, CodeDataTransfers.NOTEBOOK_CELL_OUTPUT)) {
            const notebookOutputData = extractNotebookCellOutputDropData(e);
            if (notebookOutputData) {
                return this.chatAttachmentResolveService.resolveNotebookOutputAttachContext(notebookOutputData);
            }
        }
        if (containsDragType(e, CodeDataTransfers.SCM_HISTORY_ITEM)) {
            const scmHistoryItemData = extractSCMHistoryItemDropData(e);
            if (scmHistoryItemData) {
                return this.chatAttachmentResolveService.resolveSourceControlHistoryItemAttachContext(scmHistoryItemData);
            }
        }
        const markerData = extractMarkerDropData(e);
        if (markerData) {
            return this.chatAttachmentResolveService.resolveMarkerAttachContext(markerData);
        }
        if (containsDragType(e, CodeDataTransfers.SYMBOLS)) {
            const symbolsData = extractSymbolDropData(e);
            return this.chatAttachmentResolveService.resolveSymbolsAttachContext(symbolsData);
        }
        const editorDragData = extractEditorsDropData(e);
        if (editorDragData.length > 0) {
            return coalesce(await Promise.all(editorDragData.map(editorInput => {
                return this.chatAttachmentResolveService.resolveEditorAttachContext(editorInput);
            })));
        }
        const internal = e.dataTransfer?.getData(DataTransfers.INTERNAL_URI_LIST);
        if (internal) {
            const uriList = UriList.parse(internal);
            if (uriList.length) {
                return coalesce(await Promise.all(uriList.map(uri => this.chatAttachmentResolveService.resolveEditorAttachContext({ resource: URI.parse(uri) }))));
            }
        }
        if (!containsDragType(e, DataTransfers.INTERNAL_URI_LIST) && containsDragType(e, Mimes.uriList) && ((containsDragType(e, Mimes.html) || containsDragType(e, Mimes.text) /* Text mime needed for safari support */))) {
            return this.resolveHTMLAttachContext(e);
        }
        return [];
    }
    async downloadImageAsUint8Array(url) {
        try {
            const extractedImages = await this.webContentExtractorService.readImage(URI.parse(url), CancellationToken.None);
            if (extractedImages) {
                return extractedImages.buffer;
            }
        }
        catch (error) {
            this.logService.warn('Fetch failed:', error);
        }
        // TODO: use dnd provider to insert text @justschen
        const widget = this.widgetRef();
        const selection = widget?.inputEditor.getSelection();
        if (selection && widget) {
            widget.inputEditor.executeEdits('chatInsertUrl', [{ range: selection, text: url }]);
        }
        this.logService.warn(`Image URLs must end in .jpg, .png, .gif, .webp, or .bmp. Failed to fetch image from this URL: ${url}`);
        return undefined;
    }
    async resolveHTMLAttachContext(e) {
        const existingAttachmentNames = new Set(this.attachmentModel.attachments.map(attachment => attachment.name));
        const createDisplayName = () => {
            const baseName = localize('dragAndDroppedImageName', 'Image from URL');
            let uniqueName = baseName;
            let baseNameInstance = 1;
            while (existingAttachmentNames.has(uniqueName)) {
                uniqueName = `${baseName} ${++baseNameInstance}`;
            }
            existingAttachmentNames.add(uniqueName);
            return uniqueName;
        };
        const getImageTransferDataFromUrl = async (url) => {
            const resource = URI.parse(url);
            if (IMAGE_DATA_REGEX.test(url)) {
                return { data: convertStringToUInt8Array(url), name: createDisplayName(), resource };
            }
            if (URL_REGEX.test(url)) {
                const data = await this.downloadImageAsUint8Array(url);
                if (data) {
                    return { data, name: createDisplayName(), resource, id: url };
                }
            }
            return undefined;
        };
        const getImageTransferDataFromFile = async (file) => {
            try {
                const buffer = await file.arrayBuffer();
                return { data: new Uint8Array(buffer), name: createDisplayName() };
            }
            catch (error) {
                this.logService.error('Error reading file:', error);
            }
            return undefined;
        };
        const imageTransferData = [];
        // Image Web File Drag and Drop
        const imageFiles = extractImageFilesFromDragEvent(e);
        if (imageFiles.length) {
            const imageTransferDataFromFiles = await Promise.all(imageFiles.map(file => getImageTransferDataFromFile(file)));
            imageTransferData.push(...imageTransferDataFromFiles.filter(data => !!data));
        }
        // Image Web URL Drag and Drop
        const imageUrls = extractUrlsFromDragEvent(e);
        if (imageUrls.length) {
            const imageTransferDataFromUrl = await Promise.all(imageUrls.map(getImageTransferDataFromUrl));
            imageTransferData.push(...imageTransferDataFromUrl.filter(data => !!data));
        }
        return await this.chatAttachmentResolveService.resolveImageAttachContext(imageTransferData);
    }
    setOverlay(target, type) {
        // Remove any previous overlay text
        this.overlayText?.remove();
        this.overlayText = undefined;
        const { overlay } = this.overlays.get(target);
        if (type !== undefined) {
            // Render the overlay text
            const iconAndtextElements = renderLabelWithIcons(`$(${Codicon.attach.id}) ${this.getOverlayText(type)}`);
            const htmlElements = iconAndtextElements.map(element => {
                if (typeof element === 'string') {
                    return $('span.overlay-text', undefined, element);
                }
                return element;
            });
            this.overlayText = $('span.attach-context-overlay-text', undefined, ...htmlElements);
            this.overlayText.style.backgroundColor = this.overlayTextBackground;
            overlay.appendChild(this.overlayText);
        }
        overlay.classList.toggle('visible', type !== undefined);
    }
    getOverlayText(type) {
        const typeName = this.getDropTypeName(type);
        return localize('attacAsContext', 'Attach {0} as Context', typeName);
    }
    updateOverlayStyles(overlay) {
        overlay.style.backgroundColor = this.getColor(this.styles.overlayBackground) || '';
        overlay.style.color = this.getColor(this.styles.listForeground) || '';
    }
    updateStyles() {
        this.overlays.forEach(overlay => this.updateOverlayStyles(overlay.overlay));
        this.overlayTextBackground = this.getColor(this.styles.listBackground) || '';
    }
};
ChatDragAndDrop = __decorate([
    __param(3, IThemeService),
    __param(4, IExtensionService),
    __param(5, ISharedWebContentExtractorService),
    __param(6, ILogService),
    __param(7, IChatAttachmentResolveService)
], ChatDragAndDrop);
export { ChatDragAndDrop };
function containsImageDragType(e) {
    // Image detection should not have false positives, only false negatives are allowed
    if (containsDragType(e, 'image')) {
        return true;
    }
    if (containsDragType(e, DataTransfers.FILES)) {
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            return Array.from(files).some(file => file.type.startsWith('image/'));
        }
        const items = e.dataTransfer?.items;
        if (items && items.length > 0) {
            return Array.from(items).some(item => item.type.startsWith('image/'));
        }
    }
    return false;
}
function extractUrlsFromDragEvent(e, logService) {
    const textUrl = e.dataTransfer?.getData('text/uri-list');
    if (textUrl) {
        try {
            const urls = UriList.parse(textUrl);
            if (urls.length > 0) {
                return urls;
            }
        }
        catch (error) {
            logService?.error('Error parsing URI list:', error);
            return [];
        }
    }
    return [];
}
function extractImageFilesFromDragEvent(e) {
    const files = e.dataTransfer?.files;
    if (!files) {
        return [];
    }
    return Array.from(files).filter(file => file.type.startsWith('image/'));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdERyYWdBbmREcm9wLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9jaGF0RHJhZ0FuZERyb3AudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxDQUFDLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM1RSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM5RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDL0UsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNyRSxPQUFPLEVBQWUsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEYsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLGdCQUFnQixFQUFFLHNCQUFzQixFQUFFLHFCQUFxQixFQUFFLGlDQUFpQyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDMU0sT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxhQUFhLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0RBQXNE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